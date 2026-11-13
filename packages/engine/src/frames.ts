import { mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { effectiveRanges, type Project } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { readFaces } from './faces.ts';
import { P } from './paths.ts';

/**
 * El mejor fotograma de unos tramos para usarlo de portada o de fondo: nítido (sin movimiento ni
 * desenfoque), con la cara cerca del centro si hay una y con buena luz. Se miran varios candidatos
 * repartidos (no solo el del medio, que a veces sale con los ojos cerrados o movido).
 */
export function frameScore(gray: Uint8Array, w: number, h: number) {
  // Nitidez: varianza del laplaciano (más bordes definidos = más nítido).
  let sum = 0, sq = 0, n = 0, lum = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
    sum += l; sq += l * l; n++; lum += gray[i];
  }
  const mean = sum / n;
  return { sharp: sq / n - mean * mean, light: lum / n };
}

export async function bestFrameTime(dir: string, project: Project, ranges: { start: number; end: number }[], samples = 10): Promise<number> {
  const usable = ranges.filter((r) => r.end - r.start > 0.4);
  if (!usable.length) return ranges[0] ? (ranges[0].start + ranges[0].end) / 2 : 0;
  const total = usable.reduce((a, r) => a + (r.end - r.start - 0.3), 0);
  const times: number[] = [];
  for (let k = 0; k < samples; k++) {
    let x = ((k + 0.5) / samples) * total;
    for (const r of usable) {
      const len = r.end - r.start - 0.3;
      if (x <= len) { times.push(r.start + 0.15 + x); break; }
      x -= len;
    }
  }
  const faces = await readFaces(dir).catch(() => []);
  const W = 192, H = Math.max(2, Math.round((W * project.format.height) / project.format.width / 2) * 2);
  const cands: { t: number; sharp: number; light: number; face: number }[] = [];
  const tmp = path.join(os.tmpdir(), `axioma-fotograma-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  for (const [k, t] of times.entries()) {
    try {
      const raw = path.join(tmp, `${k}.gray`);
      await ffmpeg(['-ss', t.toFixed(2), '-i', path.join(dir, P.proxy), '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-pix_fmt', 'gray', '-f', 'rawvideo', raw]);
      const buf = await readFile(raw);
      if (buf.length < W * H) continue;
      const s = frameScore(new Uint8Array(buf.buffer, buf.byteOffset, W * H), W, H);
      const f = faces.find((p) => Math.abs(p.t - t) <= 0.6);
      cands.push({ t, ...s, face: f ? 1 - Math.min(1, Math.abs(f.x - 0.5) * 2) : 0 });
    } catch { /* fotograma ilegible: se salta */ }
  }
  await rm(tmp, { recursive: true, force: true });
  if (!cands.length) return times[Math.floor(times.length / 2)];
  const maxSharp = Math.max(...cands.map((c) => c.sharp)) || 1;
  const score = (c: (typeof cands)[number]) => 0.6 * (c.sharp / maxSharp) + 0.3 * c.face + 0.1 * (c.light > 50 && c.light < 205 ? 1 : 0);
  return cands.reduce((b, c) => (score(c) > score(b) ? c : b)).t;
}

/** Tramos de una escena (o de las primeras escenas con el video propio, para una portada). */
export function sceneRanges(project: Project, sceneIndex: number | null) {
  const scenes = sceneIndex == null ? project.scenes.filter((s) => s.visual === 'original').slice(0, 4) : [project.scenes[sceneIndex]];
  return scenes.filter(Boolean).flatMap((s) => effectiveRanges(s, project.source.duration));
}
