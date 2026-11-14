import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg } from './exec.ts';
import { frameScore } from './frames.ts';
import { P } from './paths.ts';

/**
 * Qué partes de cada toma sirven: un editor no usa el barrido de cámara del inicio, el tramo
 * desenfocado ni el temblón. Se mira la toma 4 veces por segundo: nitidez (bordes definidos) y
 * cuánto cambia la imagen de un cuadro al siguiente (un barrido o un golpe de cámara cambia todo).
 */
export const QUALITY_STEP = 0.25;
const W = 72, H = 128;
const FILE = path.join('proxies', 'calidad-tomas.json');

export interface ShotQuality { start: number; end: number; ok: boolean[] }
export type QualityMap = Record<string, ShotQuality>;

/** Decide qué muestras sirven dentro de una toma (comparando con la propia toma: cada cámara es distinta). */
export function judge(sharp: number[], motion: number[]): boolean[] {
  const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
  const med = (a: number[]) => (a.length ? sorted(a)[Math.floor(a.length / 2)] : 0);
  const ms = med(sharp), mm = med(motion);
  return sharp.map((s, i) => s >= ms * 0.4 && motion[i] <= Math.max(14, mm * 2.6));
}

export async function shotQuality(dir: string, shots: { id: string; start: number; end: number }[]): Promise<QualityMap> {
  const f = path.join(dir, FILE);
  const key = shots.map((s) => `${s.id}:${s.start}:${s.end}`).join('|');
  if (existsSync(f)) {
    const c = JSON.parse(await readFile(f, 'utf8'));
    if (c.key === key) return c.map;
  }
  const raw = path.join(dir, 'proxies', 'calidad.gray');
  await ffmpeg(['-i', path.join(dir, P.proxy), '-an', '-vf', `fps=${1 / QUALITY_STEP},scale=${W}:${H},format=gray`, '-f', 'rawvideo', raw]);
  const buf = await readFile(raw);
  await rm(raw, { force: true });
  const n = Math.floor(buf.length / (W * H));
  const frame = (k: number) => buf.subarray(k * W * H, (k + 1) * W * H);
  const sharp: number[] = [], motion: number[] = [];
  for (let k = 0; k < n; k++) {
    const g = frame(k);
    sharp.push(frameScore(g, W, H).sharp);
    if (k === 0) { motion.push(0); continue; }
    const p = frame(k - 1);
    let d = 0;
    for (let i = 0; i < g.length; i += 2) d += Math.abs(g[i] - p[i]);
    motion.push(d / (g.length / 2));
  }
  const map: QualityMap = {};
  for (const s of shots) {
    const a = Math.ceil(s.start / QUALITY_STEP), b = Math.min(n, Math.floor(s.end / QUALITY_STEP));
    // El primer cuadro de cada toma compara con la toma anterior: no cuenta como movimiento.
    const mo = motion.slice(a, b); if (mo.length) mo[0] = mo[1] ?? 0;
    map[s.id] = { start: s.start, end: s.end, ok: judge(sharp.slice(a, b), mo) };
  }
  await writeFile(f, JSON.stringify({ key, map }));
  return map;
}

/** Parte de la toma que se ve limpia (0–1) entre dos segundos del video. */
export function cleanShare(q: ShotQuality | undefined, from: number, to: number): number {
  if (!q || !q.ok.length) return 1;
  const a = Math.max(0, Math.round((from - q.start) / QUALITY_STEP)), b = Math.min(q.ok.length, Math.round((to - q.start) / QUALITY_STEP));
  if (b <= a) return 1;
  let good = 0; for (let i = a; i < b; i++) if (q.ok[i]) good++;
  return good / (b - a);
}

/** El primer segundo desde `from` en que arranca un tramo limpio de `len` segundos (o `from` si no hay). */
export function cleanStart(q: ShotQuality | undefined, from: number, len: number, end: number): number {
  if (!q) return from;
  for (let t = from; t + len <= end + 1e-6; t += QUALITY_STEP) {
    // El inicio tiene que ser limpio (es lo primero que se ve) y casi todo el tramo también.
    if (cleanShare(q, t, t + Math.min(0.5, len)) >= 0.99 && cleanShare(q, t, t + len) >= 0.75) return +t.toFixed(3);
  }
  return from;
}
