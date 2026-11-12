import path from 'node:path';
import { effectiveRanges } from '@axioma/schema';
import { run } from './exec.ts';
import { P } from './paths.ts';
import { readProject, writeProject } from './store.ts';

/** Brillo medio (0–255) y saturación media de un fotograma del video. */
async function stats(file: string, t: number): Promise<{ y: number; s: number } | null> {
  try {
    const { stderr, stdout } = await run(process.env.SE_FFMPEG ?? 'ffmpeg', ['-hide_banner', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=160:-2,signalstats,metadata=print:file=-', '-f', 'null', '-'], { quiet: true });
    const text = `${stdout}\n${stderr}`;
    const y = Number(text.match(/YAVG=([\d.]+)/)?.[1]);
    const s = Number(text.match(/SATAVG=([\d.]+)/)?.[1]);
    return Number.isFinite(y) && Number.isFinite(s) ? { y, s } : null;
  } catch {
    return null;
  }
}

const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Iguala el color entre escenas (como Match Color de Final Cut o Resolve): mide el brillo y la
 * saturación de cada escena y ajusta las que se salen hacia la media del reel, para que tomas
 * grabadas con distinta luz parezcan del mismo rodaje. No toca las escenas con b-roll o gráficos.
 */
export async function matchSceneColors(dir: string): Promise<{ project: Awaited<ReturnType<typeof readProject>>; changed: number }> {
  const project = await readProject(dir);
  const master = path.join(dir, P.master);
  const measured: { i: number; y: number; s: number }[] = [];
  for (const [i, sc] of project.scenes.entries()) {
    if (sc.visual !== 'original') continue;
    const r = effectiveRanges(sc, project.source.duration)[0];
    if (!r) continue;
    const m = await stats(master, (r.start + r.end) / 2);
    if (m && m.y > 8) measured.push({ i, ...m });
  }
  if (measured.length < 2) return { project, changed: 0 };
  const ty = median(measured.map((m) => m.y));
  const ts = median(measured.map((m) => m.s));
  let changed = 0;
  for (const m of measured) {
    const sc = project.scenes[m.i];
    // Se corrige el 60 % de la diferencia y con límites, para que se vea natural.
    const b = +clamp(1 + 0.6 * (ty / m.y - 1), 0.8, 1.25).toFixed(2);
    const sat = m.s > 1 ? +clamp(1 + 0.6 * (ts / m.s - 1), 0.85, 1.2).toFixed(2) : 1;
    // Solo se corrige lo que se nota (más de un 4 %).
    const nb = Math.abs(b - 1) > 0.04 ? b : 1;
    const ns = Math.abs(sat - 1) > 0.04 ? sat : 1;
    if (nb !== 1 || ns !== 1) changed++;
    sc.brightness = nb;
    sc.saturation = ns;
  }
  return { project: await writeProject(dir, project), changed };
}
