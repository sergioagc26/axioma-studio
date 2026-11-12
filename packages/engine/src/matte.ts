import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg, run } from './exec.ts';
import { P, REPO_ROOT } from './paths.ts';
import { readProject } from './store.ts';

const MODELS = path.resolve(process.env.SE_MODELS_DIR ?? path.join(REPO_ROOT, '.modelos'));
let remover: Promise<(file: string) => Promise<{ save: (out: string) => Promise<unknown> }>> | null = null;

/** Modelo local de recorte de personas (MODNet). La primera vez descarga ~25 MB a .modelos/. */
function getRemover() {
  remover ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = MODELS;
    const seg: any = await pipeline('background-removal', 'Xenova/modnet', { dtype: 'fp32' });
    return async (file: string) => { const out = await seg(file); return Array.isArray(out) ? out[0] : out; };
  })();
  return remover;
}

export const hasCutout = (dir: string) => existsSync(path.join(dir, P.cutout));

/**
 * Recorta a la persona del video (sin pantalla verde) y deja un video con fondo
 * transparente en proxies/recorte.webm. Se hace una sola vez por proyecto; todo
 * corre en este computador. Tarda más o menos lo que dura el video multiplicado por 4.
 */
export async function buildCutout(dir: string, onProgress: (p: number, msg: string) => void = () => {}): Promise<string> {
  const out = path.join(dir, P.cutout);
  if (existsSync(out)) return out;
  const project = await readProject(dir);
  const fps = project.format.fps;
  const tmp = path.join(dir, 'proxies', 'recorte-tmp');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  try {
    onProgress(0.02, 'Preparando los fotogramas…');
    await ffmpeg(['-i', path.join(dir, P.master), '-vf', `fps=${fps},scale=432:-2`, '-q:v', '3', path.join(tmp, 'f%06d.jpg')]);
    const frames = (await readdir(tmp)).filter((f) => f.startsWith('f')).sort();
    if (!frames.length) throw new Error('No se pudieron leer los fotogramas del video.');
    const cut = await getRemover();
    for (let i = 0; i < frames.length; i++) {
      const img = await cut(path.join(tmp, frames[i]));
      await img.save(path.join(tmp, frames[i].replace('f', 'a').replace('.jpg', '.png')));
      if (i % 15 === 0) onProgress(0.05 + 0.8 * (i / frames.length), `Recortando a la persona: ${Math.round((i / frames.length) * 100)} %`);
    }
    onProgress(0.87, 'Armando el video sin fondo…');
    // El video original a buena resolución toma la transparencia del recorte.
    const size = project.format.width >= project.format.height ? 'scale=1280:-2' : 'scale=720:-2';
    await ffmpeg([
      '-i', path.join(dir, P.master), '-framerate', String(fps), '-i', path.join(tmp, 'a%06d.png'),
      '-filter_complex', `[0:v]fps=${fps},${size}[v];[1:v]alphaextract[m];[m][v]scale2ref[a][v2];[v2][a]alphamerge,format=yuva420p[o]`,
      '-map', '[o]', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '28', '-cpu-used', '5', '-row-mt', '1', '-auto-alt-ref', '0', '-shortest', out + '.tmp.webm',
    ]);
    const { rename } = await import('node:fs/promises');
    await rename(out + '.tmp.webm', out);
    onProgress(1, 'Listo');
    return out;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Cuánta parte del cuadro ocupa la persona, dos veces por segundo (0 a 1).
 * Sirve para no cambiar el fondo en tramos donde no hay nadie (b-roll, gráficos):
 * ahí el recorte dejaría el cuadro vacío. Se calcula una vez y se guarda.
 */
export async function cutoutCoverage(dir: string): Promise<number[] | undefined> {
  if (!hasCutout(dir)) return undefined;
  const file = path.join(dir, 'proxies', 'recorte.json');
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  try {
    const { stdout, stderr } = await run(process.env.SE_FFMPEG ?? 'ffmpeg', ['-hide_banner', '-c:v', 'libvpx-vp9', '-i', path.join(dir, P.cutout), '-vf', 'alphaextract,fps=2,scale=48:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { quiet: true });
    const cov = [...`${stdout}\n${stderr}`.matchAll(/YAVG=([\d.]+)/g)].map((m) => +(Number(m[1]) / 255).toFixed(3));
    if (!cov.length) return undefined;
    await writeFile(file, JSON.stringify(cov));
    return cov;
  } catch {
    return undefined;
  }
}
