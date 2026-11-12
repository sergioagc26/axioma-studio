import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg } from './exec.ts';
import { probe } from './media.ts';
import { WORKSPACE, slugify } from './paths.ts';

export interface ReferenceReport {
  id: string;
  name: string;
  client: string;
  createdAt: string;
  duration: number;
  /** Momentos (s) donde cambia el plano. */
  cuts: number[];
  /** Duración media de plano (s). */
  avgShot: number;
  /** Tempo aproximado de la música; null si no se detecta un pulso claro. */
  bpm: number | null;
  /** Colores dominantes, de más a menos presente. */
  palette: string[];
  /** Fotogramas para que Claude mire el estilo (rutas relativas a la carpeta de la referencia). */
  frames: string[];
  /** Valores sugeridos para un preset. */
  suggested: { maxPause: number; punchZoomEvery: number; highlightColor: string; ritmo: 'rapido' | 'con-ritmo' | 'sobrio' };
}

export const referencesDir = (client?: string) => path.join(WORKSPACE, 'clientes', slugify(client ?? 'personal'), 'referencias');

/** Cambios de plano detectados por FFmpeg. */
async function detectCuts(file: string): Promise<number[]> {
  const { stdout, stderr } = await ffmpeg(['-i', file, '-an', '-vf', "select='gt(scene,0.3)',metadata=print:file=-", '-f', 'null', '-']);
  return [...(stdout + stderr).matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}

/** Tempo por autocorrelación de los ataques de energía (60–180 BPM). */
async function detectBpm(file: string, tmp: string): Promise<number | null> {
  const raw = path.join(tmp, 'audio.raw');
  try {
    await ffmpeg(['-i', file, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', raw]);
  } catch {
    return null; // sin pista de audio
  }
  const buf = await readFile(raw);
  await rm(raw, { force: true });
  const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
  const hop = 80; // 10 ms → 100 marcos por segundo
  const n = Math.floor(samples.length / hop);
  if (n < 400) return null;
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = 0; j < hop; j++) e += Math.abs(samples[i * hop + j]);
    env[i] = e / hop;
  }
  const onset = new Float32Array(n);
  let energy = 0;
  for (let i = 1; i < n; i++) {
    onset[i] = Math.max(0, env[i] - env[i - 1]);
    energy += onset[i] * onset[i];
  }
  if (energy === 0) return null;
  let best = 0;
  let bestBpm = 0;
  for (let bpm = 60; bpm <= 180; bpm++) {
    const lag = Math.round(6000 / bpm);
    let c = 0;
    for (let i = lag; i < n; i++) c += onset[i] * onset[i - lag];
    c /= energy;
    if (c > best) { best = c; bestBpm = bpm; }
  }
  return best > 0.25 ? bestBpm : null;
}

/** Colores dominantes a partir de fotogramas reducidos. */
async function detectPalette(file: string, duration: number, tmp: string): Promise<string[]> {
  const raw = path.join(tmp, 'frames.raw');
  await ffmpeg(['-i', file, '-an', '-vf', `fps=${Math.min(4, Math.max(0.5, 24 / duration)).toFixed(3)},scale=24:24`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', raw]);
  const buf = await readFile(raw);
  await rm(raw, { force: true });
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 2 < buf.length; i += 3) {
    const key = ((buf[i] >> 5) << 6) | ((buf[i + 1] >> 5) << 3) | (buf[i + 2] >> 5);
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += buf[i]; b.g += buf[i + 1]; b.b += buf[i + 2];
    buckets.set(key, b);
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 5)
    .map((b) => `#${hex(b.r / b.n)}${hex(b.g / b.n)}${hex(b.b / b.n)}`.toUpperCase());
}

const saturation = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : ((max - Math.min(r, g, b)) / max) * (max / 255);
};

/**
 * Analiza el ESTILO de un video de referencia (ritmo de cortes, tempo, colores)
 * y extrae fotogramas para que Claude mire subtítulos y tipografía. No se copia
 * nada del contenido: el video se borra al terminar salvo que `keepVideo` sea true.
 */
export async function analyzeReference(input: string, opts: { client?: string; name?: string; keepVideo?: boolean } = {}): Promise<{ dir: string; report: ReferenceReport }> {
  const file = path.resolve(input);
  if (!existsSync(file)) throw new Error(`No existe el archivo: ${file}`);
  const name = opts.name ?? path.basename(file, path.extname(file));
  let id = slugify(name);
  const root = referencesDir(opts.client);
  for (let i = 2; existsSync(path.join(root, id)); i++) id = `${slugify(name)}-${i}`;
  const dir = path.join(root, id);
  await mkdir(path.join(dir, 'frames'), { recursive: true });

  const info = await probe(file);
  const cuts = await detectCuts(file);
  const bpm = await detectBpm(file, dir);
  const palette = await detectPalette(file, info.duration, dir);

  const frames: string[] = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const rel = `frames/${String(i + 1).padStart(2, '0')}.jpg`;
    await ffmpeg(['-ss', (((i + 0.5) / count) * info.duration).toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', path.join(dir, rel)]);
    frames.push(rel);
  }
  if (opts.keepVideo) await copyFile(file, path.join(dir, `referencia${path.extname(file).toLowerCase()}`));

  const avgShot = info.duration / (cuts.length + 1);
  const ritmo = avgShot < 1.8 ? 'rapido' : avgShot < 3.5 ? 'con-ritmo' : 'sobrio';
  const accent = [...palette].sort((a, b) => saturation(b) - saturation(a))[0];
  const report: ReferenceReport = {
    id, name, client: opts.client ?? 'personal', createdAt: new Date().toISOString(),
    duration: info.duration, cuts, avgShot, bpm, palette, frames,
    suggested: {
      ritmo,
      maxPause: ritmo === 'rapido' ? 0.2 : ritmo === 'con-ritmo' ? 0.35 : 0.6,
      punchZoomEvery: ritmo === 'sobrio' ? 0 : Math.max(2, Math.round(avgShot * 2)),
      highlightColor: accent && saturation(accent) > 0.35 ? accent : '#FE2C55',
    },
  };
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  return { dir, report };
}

export async function listReferences(client?: string): Promise<ReferenceReport[]> {
  const root = referencesDir(client);
  if (!existsSync(root)) return [];
  const out: ReferenceReport[] = [];
  for (const d of await readdir(root)) {
    const f = path.join(root, d, 'report.json');
    if (existsSync(f)) out.push(JSON.parse(await readFile(f, 'utf8')));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function formatReport(r: ReferenceReport, dir: string): string {
  return [
    `Referencia: ${r.name} (${r.id}) · ${r.duration.toFixed(1)} s`,
    `Ritmo: ${r.cuts.length} cortes · plano medio ${r.avgShot.toFixed(2)} s → ${r.suggested.ritmo}`,
    `Música: ${r.bpm ? `~${r.bpm} BPM (aproximado)` : 'sin pulso claro'}`,
    `Paleta: ${r.palette.join(' ')}`,
    `Sugerido: pausa máxima ${r.suggested.maxPause} s · zoom cada ${r.suggested.punchZoomEvery} s · resaltado ${r.suggested.highlightColor}`,
    'Fotogramas (míralos para describir subtítulos y tipografía; solo el estilo, nunca el contenido):',
    ...r.frames.map((f) => `  ${path.join(dir, f)}`),
  ].join('\n');
}
