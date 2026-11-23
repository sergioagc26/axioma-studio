import { mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { clampY, effectiveRanges, safeZone, type Project } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { P } from './paths.ts';
import { readProject, writeProject } from './store.ts';

const W = 108, H = 192;

/** Energía de bordes por fila (0–1 aprox.): donde hay producto, cara, estantes o letras, sube. */
function rowEnergy(gray: Uint8Array): number[] {
  const rows: number[] = [];
  for (let y = 1; y < H - 1; y++) {
    let s = 0;
    for (let x = Math.round(W * 0.08); x < Math.round(W * 0.92); x++) {
      const i = y * W + x;
      s += Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + W] - gray[i - W]);
    }
    rows.push(s / (W * 0.84 * 2 * 255));
  }
  rows.unshift(rows[0]); rows.push(rows[rows.length - 1]);
  return rows;
}

/** Franja de alto `h` (fracción) con menos energía dentro de [lo, hi], con un leve gusto por `prefer`. */
function calmestBand(energy: number[], lo: number, hi: number, h: number, prefer: number, avoid?: [number, number]) {
  let best = { y: prefer, cost: Infinity, energy: 1 };
  for (let c = lo + h / 2; c <= hi - h / 2 + 1e-9; c += 0.01) {
    if (avoid && c + h / 2 > avoid[0] && c - h / 2 < avoid[1]) continue;
    const a = Math.round((c - h / 2) * H), b = Math.round((c + h / 2) * H);
    let s = 0, n = 0;
    for (let y = a; y < b; y++) { s += energy[Math.min(H - 1, Math.max(0, y))]; n++; }
    const e = s / Math.max(1, n);
    const cost = e + 0.05 * Math.abs(c - prefer);
    if (cost < best.cost) best = { y: c, cost, energy: e };
  }
  return best;
}

/**
 * Pone los subtítulos y el rótulo de cada escena en la franja más libre del cuadro dentro de la
 * zona segura de la red, mirando fotogramas reales de la toma. Así el texto no cae sobre el producto.
 */
export async function placeTexts(dir: string): Promise<string[]> {
  const project: Project = await readProject(dir);
  const zone = safeZone(project.platform);
  const tmp = path.join(os.tmpdir(), `axioma-texto-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  const report: string[] = [];
  const capH = 0.14, labH = 0.1;
  for (const [i, s] of project.scenes.entries()) {
    const ranges = effectiveRanges(s, project.source.duration);
    const total = ranges.reduce((a, r) => a + (r.end - r.start), 0);
    if (total <= 0) continue;
    const times: number[] = [];
    for (const k of [0.2, 0.5, 0.8]) {
      let x = k * total;
      for (const r of ranges) { const len = r.end - r.start; if (x <= len) { times.push(r.start + x); break; } x -= len; }
    }
    const acc = new Array<number>(H).fill(0);
    let got = 0;
    for (const [k, t] of times.entries()) {
      try {
        const raw = path.join(tmp, `${i}-${k}.gray`);
        await ffmpeg(['-ss', t.toFixed(2), '-i', path.join(dir, P.proxy), '-frames:v', '1', '-vf', `scale=${W}:${H}`, '-pix_fmt', 'gray', '-f', 'rawvideo', raw]);
        const buf = await readFile(raw);
        if (buf.length < W * H) continue;
        rowEnergy(new Uint8Array(buf.buffer, buf.byteOffset, W * H)).forEach((e, y) => { acc[y] = Math.max(acc[y], e); });
        got++;
      } catch { /* fotograma ilegible */ }
    }
    if (!got) { report.push(`Escena ${i + 1}: no pude mirar la toma`); continue; }
    // Subtítulos: la franja más tranquila de la zona libre. Rótulo: la más tranquila de la mitad de arriba.
    const lo = zone.top + 0.02, hi = 1 - zone.bottom - 0.02;
    const cap = calmestBand(acc, lo, hi, capH, 0.62);
    const hasLabel = Boolean(s.onScreenText);
    const lab = hasLabel ? calmestBand(acc, lo, hi, labH, 0.2, [cap.y - capH / 2, cap.y + capH / 2]) : null;
    s.captionY = +clampY(zone, cap.y, 0.07).toFixed(3);
    if (lab) s.textY = +clampY(zone, lab.y, 0.06).toFixed(3);
    const calm = (e: number) => (e < 0.09 ? 'libre' : e < 0.16 ? 'con poco espacio' : 'SIN espacio libre');
    report.push(`Escena ${i + 1}: subtítulos al ${Math.round(s.captionY * 100)}% (${calm(cap.energy)})${lab ? `, rótulo al ${Math.round(s.textY! * 100)}% (${calm(lab.energy)})` : ''}`);
  }
  await rm(tmp, { recursive: true, force: true });
  await writeProject(dir, project);
  return report;
}
