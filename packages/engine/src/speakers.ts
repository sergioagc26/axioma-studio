import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SpeakerTurn, Transcript } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { getDetector, type FaceBox } from './faces.ts';
import { P } from './paths.ts';
import { readProject, readTranscript, writeProject } from './store.ts';

/**
 * Reencuadre al hablante: en un video con dos o más personas (pódcast, entrevista), el recorte
 * vertical va hacia quien está hablando. Se detectan las caras, se sigue a cada persona y se mide
 * cuánto se mueve su boca mientras hay voz. Todo en este computador.
 */

export const SPEAKERS_FILE = 'hablantes.json';
const FPS = 6;
const W = 512;

export interface Track { id: number; x: number; y: number; w: number; h: number; share: number }
export interface SpeakerReport { tracks: Track[]; turns: SpeakerTurn[]; fps: number }

/**
 * Agrupa las caras de cada fotograma en personas, por su posición (las personas de un pódcast
 * casi no se mueven de su sitio). Devuelve, por persona, su caja en cada fotograma (o null).
 */
export function buildTracks(frames: FaceBox[][]): { tracks: Track[]; boxes: (FaceBox | null)[][] } {
  const centers: { x: number; y: number; w: number; n: number }[] = [];
  const assign: number[][] = frames.map((faces) => faces.map((f) => {
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    let best = -1, dist = Infinity;
    centers.forEach((c, i) => { const d = Math.hypot(c.x - cx, (c.y - cy) * 0.5); if (d < dist) { dist = d; best = i; } });
    if (best < 0 || dist > Math.max(0.08, f.w * 0.9)) { centers.push({ x: cx, y: cy, w: f.w, n: 1 }); return centers.length - 1; }
    const c = centers[best];
    c.x = (c.x * c.n + cx) / (c.n + 1); c.y = (c.y * c.n + cy) / (c.n + 1); c.w = (c.w * c.n + f.w) / (c.n + 1); c.n++;
    return best;
  }));
  // Personas que aparecen en al menos el 20 % del video; las demás son ruido o gente de paso.
  const keep = centers.map((c, i) => ({ c, i })).filter(({ c }) => c.n >= frames.length * 0.2).sort((a, b) => a.c.x - b.c.x);
  const boxes = keep.map(({ i }) => frames.map((faces, fi) => {
    const hit = faces.filter((_, k) => assign[fi][k] === i).sort((a, b) => b.score - a.score)[0];
    return hit ?? null;
  }));
  const tracks = keep.map(({ c }, id) => {
    const bs = boxes[id].filter((b): b is FaceBox => Boolean(b));
    const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;
    return { id, x: +med(bs.map((b) => b.x + b.w / 2)).toFixed(3), y: +med(bs.map((b) => b.y + b.h / 2)).toFixed(3), w: +med(bs.map((b) => b.w)).toFixed(3), h: +med(bs.map((b) => b.h)).toFixed(3), share: +(c.n / frames.length).toFixed(2) };
  });
  return { tracks, boxes };
}

/**
 * Quién habla en cada momento, a partir de cuánto se mueve la boca de cada persona
 * (`activity[persona][fotograma]`) y de cuándo hay voz. Cambia de persona solo si la otra
 * lleva al menos 1 s hablando más, y ningún turno dura menos de 1,5 s (no marea).
 */
export function speakerTurns(activity: number[][], fps: number, speech: (t: number) => boolean, tracks: Track[], duration: number): SpeakerTurn[] {
  if (tracks.length < 2) return [];
  const win = Math.max(1, Math.round(fps * 0.5));
  const n = Math.ceil(activity[0].length / win);
  const lead: (number | null)[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k * win + win / 2) / fps;
    if (!speech(t)) { lead.push(null); continue; }
    const scores = activity.map((a) => { const part = a.slice(k * win, (k + 1) * win); return part.reduce((s, x) => s + x, 0) / Math.max(1, part.length); });
    const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
    lead.push(order[0].s > 0.6 && order[0].s > order[1].s * 1.3 ? order[0].i : null);
  }
  // Histéresis: hace falta 2 ventanas seguidas (1 s) para cambiar de persona.
  let current = lead.find((x) => x != null) ?? null;
  if (current == null) return [];
  const who: number[] = [];
  let pending: number | null = null, streak = 0;
  for (const l of lead) {
    if (l != null && l !== current) {
      streak = l === pending ? streak + 1 : 1;
      pending = l;
      if (streak >= 2) { current = l; streak = 0; pending = null; }
    } else { streak = 0; pending = null; }
    who.push(current);
  }
  // El cambio se adelanta 1 s (la ventana que confirmó el cambio ya era de la otra persona).
  for (let k = 0; k < who.length - 2; k++) if (who[k + 2] !== who[k] && who[k + 1] === who[k] && lead[k + 1] === who[k + 2]) who[k + 1] = who[k + 2];
  const turns: SpeakerTurn[] = [];
  who.forEach((w, k) => {
    const start = (k * win) / fps, end = Math.min(duration, ((k + 1) * win) / fps);
    const last = turns[turns.length - 1];
    if (last && last.track === w) last.end = end;
    else turns.push({ start, end, track: w, x: tracks[w].x, y: tracks[w].y });
  });
  // Turnos de menos de 1,5 s se unen al anterior.
  const merged: SpeakerTurn[] = [];
  for (const t of turns) {
    const prev = merged[merged.length - 1];
    if (prev && (t.end - t.start < 1.5 || prev.track === t.track)) prev.end = t.end;
    else merged.push({ ...t });
  }
  if (merged.length) { merged[0].start = 0; merged[merged.length - 1].end = duration; }
  return merged.map((t) => ({ ...t, start: +t.start.toFixed(2), end: +t.end.toFixed(2) }));
}

/** Movimiento medio (0–255) de una zona de la cara entre dos fotogramas en gris. */
function regionDiff(a: Uint8Array, b: Uint8Array, w: number, h: number, box: FaceBox, top: number, bottom: number) {
  const x0 = Math.max(0, Math.floor((box.x + box.w * 0.22) * w)), x1 = Math.min(w, Math.ceil((box.x + box.w * 0.78) * w));
  const y0 = Math.max(0, Math.floor((box.y + box.h * top) * h)), y1 = Math.min(h, Math.ceil((box.y + box.h * bottom) * h));
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += Math.abs(a[y * w + x] - b[y * w + x]); n++; }
  return n ? s / n : 0;
}

/** Analiza quién habla en el video del proyecto y lo guarda en hablantes.json. */
export async function analyzeSpeakers(dir: string, onProgress?: (msg: string) => void): Promise<SpeakerReport> {
  const project = await readProject(dir);
  const t = await readTranscript(dir);
  const { width, height } = project.source;
  const h = Math.max(2, Math.round((W * height) / width / 2) * 2);
  onProgress?.('Buscando a las personas del video…');
  const raw = path.join(dir, 'proxies', 'hablantes.raw');
  await ffmpeg(['-i', path.join(dir, P.proxy), '-an', '-vf', `fps=${FPS},scale=${W}:${h}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', raw]);
  const buf = await readFile(raw);
  await rm(raw, { force: true });
  const size = W * h * 3;
  const count = Math.floor(buf.length / size);
  const detect = await getDetector(512, 0.25);
  const frames: FaceBox[][] = [];
  const gray: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 60 === 0) onProgress?.(`Mirando las caras… ${Math.round((i / count) * 100)} %`);
    const rgb = new Uint8Array(buf.buffer, buf.byteOffset + i * size, size);
    frames.push((await detect(rgb, W, h)).filter((f) => f.w > 0.03));
    const g = new Uint8Array(W * h);
    for (let p = 0; p < W * h; p++) g[p] = (rgb[p * 3] * 77 + rgb[p * 3 + 1] * 150 + rgb[p * 3 + 2] * 29) >> 8;
    gray.push(g);
  }
  const { tracks, boxes } = buildTracks(frames);
  onProgress?.(tracks.length >= 2 ? `Viendo quién habla (${tracks.length} personas)…` : 'Solo hay una persona en cuadro.');
  // Boca menos ojos: si se mueve toda la cabeza, no cuenta como hablar.
  const activity = boxes.map((track) => {
    let lastBox: FaceBox | null = null, lastSeen = -99;
    return gray.map((g, i) => {
      if (track[i]) { lastBox = track[i]; lastSeen = i; }
      if (!i || !lastBox || i - lastSeen > FPS) return 0;
      const mouth = regionDiff(g, gray[i - 1], W, h, lastBox, 0.62, 1.0);
      const eyes = regionDiff(g, gray[i - 1], W, h, lastBox, 0.2, 0.5);
      return Math.max(0, mouth - 0.7 * eyes);
    });
  });
  const words = t?.words ?? [];
  const speech = (time: number) => !words.length || words.some((w) => w.start - 0.3 <= time && w.end + 0.3 >= time);
  const turns = speakerTurns(activity, FPS, speech, tracks, project.source.duration);
  const report: SpeakerReport = { tracks, turns, fps: FPS };
  await writeFile(path.join(dir, SPEAKERS_FILE), JSON.stringify(report, null, 1));
  return report;
}

export async function readSpeakers(dir: string): Promise<SpeakerReport | null> {
  const f = path.join(dir, SPEAKERS_FILE);
  return existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : null;
}

/** Activa (analizando si hace falta) o apaga el reencuadre al hablante. */
export async function setFollowSpeaker(dir: string, on: boolean, onProgress?: (msg: string) => void) {
  const report = on ? (await readSpeakers(dir)) ?? (await analyzeSpeakers(dir, onProgress)) : null;
  const project = await readProject(dir);
  project.source.followSpeaker = on;
  if (on) project.source.autoFocus = true;
  return { project: await writeProject(dir, project), report };
}
