import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildTimeline, frontKey } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { gradedMaster } from './lut.ts';
import { REPO_ROOT } from './paths.ts';
import { readProject, readTranscript } from './store.ts';

const MODELS = path.resolve(process.env.SE_MODELS_DIR ?? path.join(REPO_ROOT, '.modelos'));
export const FRONT_FILE = path.join('proxies', 'frente.webm');
const FRONT_INFO = path.join('proxies', 'frente.json');
/** Altura de los títulos de arriba (como en la línea de tiempo: «arriba» = 0,2). */
const TITLE_Y = 0.2;

let estimator: Promise<(file: string) => Promise<{ depth: { data: Uint8Array; width: number; height: number } }>> | null = null;
function getEstimator() {
  estimator ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = MODELS;
    return (await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'q8' })) as never;
  })();
  return estimator;
}

/** La capa de «comida por delante» que calza con los cortes actuales, si ya está hecha. */
export async function readFront(dir: string): Promise<{ file: string; key: string } | null> {
  const info = path.join(dir, FRONT_INFO);
  if (!existsSync(info) || !existsSync(path.join(dir, FRONT_FILE))) return null;
  try { return { file: FRONT_FILE, key: (JSON.parse(await readFile(info, 'utf8')) as { key: string }).key }; } catch { return null; }
}

/** Desenfoque de caja (rápido) en una imagen de un canal; `r` en píxeles. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1);
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Máscara de «lo que sobresale» (el plato, el pan, la carne) a partir de la profundidad: lo que
 * está más cerca que su entorno. Una mesa o una pared lisa no cuentan aunque estén cerca.
 */
export function foregroundMask(depth: Uint8Array, w: number, h: number): Float32Array {
  const d = Float32Array.from(depth, (v) => v / 255);
  // Tres pasadas de caja ≈ desenfoque gaussiano grande: la forma general de la escena.
  const r = Math.max(4, Math.round(Math.min(w, h) * 0.14));
  const base = boxBlur(boxBlur(boxBlur(d, w, h, r), w, h, r), w, h, r);
  const m = new Float32Array(d.length);
  for (let i = 0; i < d.length; i++) m[i] = Math.min(1, Math.max(0, (d[i] - base[i] - 0.025) * 14));
  // Borde suave para que no se vea recortado.
  return boxBlur(m, w, h, 1);
}

/**
 * Arma la capa de «comida por delante» para los cortes actuales: el video solo donde está lo
 * cercano, con fondo transparente, en tiempo de la salida. Se dibuja encima de subtítulos y títulos
 * para que queden detrás del plato. Si en un cuadro lo cercano taparía mucho la línea de los
 * subtítulos, ese cuadro no tapa nada (primero se lee). Todo corre en este computador.
 */
export async function buildFront(dir: string, onProgress: (p: number, msg: string) => void = () => {}): Promise<string> {
  const project = await readProject(dir);
  const t = buildTimeline(project, await readTranscript(dir).catch(() => null), { video: 'x' });
  const key = frontKey(t.clips);
  const done = await readFront(dir);
  if (done?.key === key) return done.file;
  const fps = project.format.fps;
  const tmp = path.join(dir, 'proxies', 'frente-tmp');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const sharp = (await import('sharp')).default;
  try {
    const W = 720;
    const H = Math.round((W * project.source.height) / project.source.width / 2) * 2;
    const master = path.join(dir, gradedMaster(dir, project));
    const est = await getEstimator();
    const blankC = path.join(tmp, 'blank-c.jpg');
    const blankA = path.join(tmp, 'blank-a.png');
    await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } }).jpeg().toFile(blankC);
    await sharp(Buffer.alloc(W * H), { raw: { width: W, height: H, channels: 1 } }).toColourspace('b-w').png().toFile(blankA);
    const name = (k: string, i: number) => path.join(tmp, `${k}${String(i).padStart(6, '0')}.${k === 'c' ? 'jpg' : 'png'}`);
    const filled = new Set<number>();
    // Franja de los subtítulos (donde no se puede tapar demasiado).
    const capY = project.captions.y;
    const total = t.clips.reduce((a, c) => a + (c.speed || c.motion || c.brollSrc ? 0 : c.durationInFrames), 0);
    let made = 0;
    for (const c of t.clips) {
      if (c.speed || c.motion || c.brollSrc || c.visual !== 'original') continue;
      const seg = path.join(tmp, 'seg');
      await rm(seg, { recursive: true, force: true });
      await mkdir(seg, { recursive: true });
      // Cada cuadro a dos tamaños: el grande para la imagen y uno chico para calcular la profundidad
      // (el modelo trabaja a ~500 px igual; a tamaño completo solo se vuelve lento).
      // (Cada salida lleva su propio límite de cuadros: si no, la segunda decodifica el video entero.)
      const n = String(c.durationInFrames);
      await ffmpeg(['-ss', (c.sourceStartFrame / fps).toFixed(4), '-t', ((c.durationInFrames + 2) / fps).toFixed(4), '-i', master,
        '-filter_complex', `fps=${fps},split[a][b];[a]scale=${W}:${H}[big];[b]scale=320:-2[small]`,
        '-map', '[big]', '-frames:v', n, '-q:v', '3', path.join(seg, 'f%04d.jpg'), '-map', '[small]', '-frames:v', n, '-q:v', '4', path.join(seg, 's%04d.jpg')]);
      let prev: Float32Array | null = null;
      for (let k = 0; k < c.durationInFrames; k++) {
        const f = path.join(seg, `f${String(k + 1).padStart(4, '0')}.jpg`);
        if (!existsSync(f)) break;
        const out = c.fromFrame + k;
        const r = await est(path.join(seg, `s${String(k + 1).padStart(4, '0')}.jpg`));
        const { data, width: dw, height: dh } = r.depth;
        const m = foregroundMask(data, dw, dh);
        // Suaviza en el tiempo dentro de la escena (sin parpadeo); en cada corte empieza de nuevo.
        if (prev && prev.length === m.length) for (let i = 0; i < m.length; i++) m[i] = 0.55 * m[i] + 0.45 * prev[i];
        prev = m;
        // ¿Cuánto taparía de cada texto? Si es mucho, en esa franja no tapa (primero se lee): los
        // subtítulos aguantan algo más que los títulos, que son pocas palabras y deben leerse enteros.
        const coverage = (cy: number, half: number) => {
          const y0 = Math.max(0, Math.round((cy - half) * dh)), y1 = Math.min(dh, Math.round((cy + half) * dh));
          const x0 = Math.round(dw * 0.12), x1 = Math.round(dw * 0.88);
          let cov = 0;
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cov += m[y * dw + x];
          return cov / Math.max(1, (y1 - y0) * (x1 - x0));
        };
        const ramp = (cov: number, lo: number, hi: number) => (cov <= lo ? 1 : cov >= hi ? 0 : (hi - cov) / (hi - lo));
        const keepCap = ramp(coverage(capY, 0.05), 0.3, 0.5);
        const keepTitle = ramp(coverage(TITLE_Y, 0.07), 0.12, 0.25);
        // Arriba manda la franja del título, abajo la de subtítulos, con un paso suave entre ambas.
        const split = (TITLE_Y + capY) / 2;
        const alpha = Buffer.alloc(m.length);
        for (let y = 0; y < dh; y++) {
          const u = Math.min(1, Math.max(0, (y / dh - (split - 0.04)) / 0.08));
          const keep = keepTitle * (1 - u) + keepCap * u;
          for (let x = 0; x < dw; x++) alpha[y * dw + x] = Math.round(m[y * dw + x] * keep * 255);
        }
        await sharp(alpha, { raw: { width: dw, height: dh, channels: 1 } }).resize(W, H).toColourspace('b-w').png().toFile(name('a', out));
        await copyFile(f, name('c', out));
        filled.add(out);
        if (++made % 30 === 0) onProgress(0.05 + 0.85 * (made / Math.max(1, total)), `Separando la comida del fondo: ${Math.round((made / Math.max(1, total)) * 100)} %`);
      }
    }
    // Los cuadros sin capa (gráficos, cámara lenta) quedan transparentes.
    for (let i = 0; i < t.durationInFrames; i++) {
      if (filled.has(i)) continue;
      await copyFile(blankC, name('c', i));
      await copyFile(blankA, name('a', i));
    }
    onProgress(0.92, 'Armando la capa de comida por delante…');
    const out = path.join(dir, FRONT_FILE);
    await ffmpeg([
      '-framerate', String(fps), '-i', path.join(tmp, 'c%06d.jpg'), '-framerate', String(fps), '-i', path.join(tmp, 'a%06d.png'),
      '-filter_complex', '[1:v]format=gray[m];[0:v][m]alphamerge,format=yuva420p[o]',
      '-map', '[o]', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '26', '-cpu-used', '5', '-row-mt', '1', '-auto-alt-ref', '0', out + '.tmp.webm',
    ]);
    await rename(out + '.tmp.webm', out);
    await writeFile(path.join(dir, FRONT_INFO), JSON.stringify({ key, at: new Date().toISOString() }));
    onProgress(1, 'Listo');
    return FRONT_FILE;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
