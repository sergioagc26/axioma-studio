import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Scene } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { detectShots, type Shot } from './montage.ts';
import { readProject, writeProject } from './store.ts';

/**
 * Montaje al ritmo de la música: se detectan los golpes (pulsos) de la canción, cuál es el
 * primero de cada compás y dónde sube la energía, y los cortes caen justo ahí.
 * Todo con análisis de la señal, en este computador.
 */

const FPS_ENV = 100; // marcos de análisis por segundo (10 ms)
const RATE = 8000;
/** Sube si cambia el análisis: los pulsos guardados se recalculan. */
const BEATS_VERSION = 2;

export interface BeatMap {
  bpm: number;
  /** Segundos de cada pulso, desde el inicio de la canción. */
  beats: number[];
  /** Índice (dentro de `beats`) del primer pulso de compás: 0–3. */
  downbeat: number;
  /** Energía de cada pulso, 0–1 (1 = la parte más fuerte de la canción). */
  energy: number[];
  duration: number;
}

/** Envolvente de ataques (cuánto sube la energía cada 10 ms) y volumen de cada marco. */
function envelopes(samples: Float32Array, rate: number) {
  const hop = Math.round(rate / FPS_ENV);
  const n = Math.floor(samples.length / hop);
  const level = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = 0; j < hop; j++) e += samples[i * hop + j] ** 2;
    level[i] = Math.sqrt(e / hop);
  }
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, Math.log1p(level[i] * 100) - Math.log1p(level[i - 1] * 100));
  return { level, onset };
}

/** Pulsos de una canción a partir de sus muestras (mono). Devuelve null si no hay un pulso claro. */
export function analyzeBeats(samples: Float32Array, rate = RATE): BeatMap | null {
  const { level, onset } = envelopes(samples, rate);
  const n = onset.length;
  if (n < FPS_ENV * 3) return null;
  let energy0 = 0;
  for (const x of onset) energy0 += x * x;
  if (!energy0) return null;

  // 1. Tempo por autocorrelación, prefiriendo 80–160 BPM (lo normal en reels).
  let best = 0;
  let bpm = 0;
  for (let b = 60; b <= 190; b++) {
    const lag = (60 / b) * FPS_ENV;
    const l0 = Math.floor(lag), f = lag - l0;
    let c = 0;
    for (let i = l0 + 1; i < n; i++) c += onset[i] * (onset[i - l0] * (1 - f) + onset[i - l0 - 1] * f);
    c /= energy0;
    const prior = b >= 80 && b <= 160 ? 1 : 0.85;
    if (c * prior > best) { best = c * prior; bpm = b; }
  }
  if (best < 0.12) return null;
  const period = (60 / bpm) * FPS_ENV;

  // 2. Fase: dónde cae el primer pulso para que la rejilla toque más ataques.
  let phase = 0;
  let phaseScore = -1;
  for (let p = 0; p < period; p++) {
    let s = 0;
    for (let t = p; t < n; t += period) s += onset[Math.round(t)] ?? 0;
    if (s > phaseScore) { phaseScore = s; phase = p; }
  }

  // 3. Cada pulso se ajusta al ataque más cercano (±40 ms): sigue a la canción si no es exacta.
  const beats: number[] = [];
  let expect = phase;
  while (expect < n) {
    let at = Math.round(expect);
    let peak = onset[at] ?? 0;
    for (let d = -4; d <= 4; d++) {
      const k = Math.round(expect) + d;
      if (k >= 0 && k < n && onset[k] > peak * 1.15) { peak = onset[k]; at = k; }
    }
    beats.push(at / FPS_ENV);
    expect = at + period;
  }

  // 4. Primer pulso del compás: en 4/4 el más acentuado de cada grupo de 4.
  const acc = [0, 0, 0, 0];
  beats.forEach((b, i) => { acc[i % 4] += onset[Math.round(b * FPS_ENV)] ?? 0; });
  const downbeat = acc.indexOf(Math.max(...acc));

  // 5. Energía de cada pulso (volumen medio hasta el siguiente), normalizada.
  const raw = beats.map((b, i) => {
    const a = Math.round(b * FPS_ENV), z = Math.round((beats[i + 1] ?? b + period / FPS_ENV) * FPS_ENV);
    let s = 0;
    for (let k = a; k < Math.min(n, z); k++) s += level[k];
    return s / Math.max(1, Math.min(n, z) - a);
  });
  // Escala robusta (percentiles 10–90): un golpe suelto no aplasta al resto. Si la canción
  // es pareja (varía menos de un 15 %), toda queda en energía media.
  const sorted = [...raw].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.1)], hi = sorted[Math.floor(sorted.length * 0.9)];
  const mean = raw.reduce((a, b) => a + b, 0) / raw.length || 1;
  const energy = raw.map((x) => (hi - lo > mean * 0.15 ? Math.max(0, Math.min(1, (x - lo) / (hi - lo))) : 0.5));
  return { bpm, beats, downbeat, energy, duration: samples.length / rate };
}

/** Analiza la música del proyecto (se guarda para no repetirlo). */
export async function musicBeats(dir: string, music: string): Promise<BeatMap | null> {
  const file = path.join(dir, music);
  const cache = path.join(dir, 'proxies', 'pulsos.json');
  const mtime = Math.round((await stat(file)).mtimeMs);
  try {
    const c = JSON.parse(await readFile(cache, 'utf8'));
    if (c.v === BEATS_VERSION && c.music === music && c.mtime === mtime) return c.map;
  } catch { /* se calcula */ }
  await mkdir(path.dirname(cache), { recursive: true });
  const raw = path.join(dir, 'proxies', 'musica.f32');
  await ffmpeg(['-i', file, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', raw]);
  const buf = await readFile(raw);
  await rm(raw, { force: true });
  const map = analyzeBeats(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)));
  await writeFile(cache, JSON.stringify({ v: BEATS_VERSION, music, mtime, map }));
  return map;
}

export type BeatDensity = 'auto' | 'pulso' | 'medio' | 'compas';

/**
 * Dónde cortar (segundos del reel) hasta `total`. La música se repite si el reel es más largo.
 * - pulso: en cada golpe · medio: cada 2 · compás: cada 4 (en el primero del compás).
 * - auto: cada compás en las partes suaves, cada 2 en las medias y en cada golpe en las fuertes.
 * Ningún plano dura menos de `minShot` segundos.
 */
export function beatCuts(map: BeatMap, total: number, density: BeatDensity = 'auto', minShot = 0.35): number[] {
  const loops = Math.max(1, Math.ceil(total / map.duration));
  const beats: { t: number; i: number; e: number }[] = [];
  for (let l = 0; l < loops; l++) map.beats.forEach((b, i) => beats.push({ t: b + l * map.duration, i, e: map.energy[i] }));
  const cuts: number[] = [];
  let last = 0;
  for (const b of beats) {
    if (b.t <= 0.05 || b.t >= total - minShot) continue;
    const pos = (((b.i - map.downbeat) % 4) + 4) % 4; // 0 = primero del compás
    const step = density === 'pulso' ? 1 : density === 'medio' ? 2 : density === 'compas' ? 4 : b.e > 0.66 ? 1 : b.e > 0.33 ? 2 : 4;
    if (pos % step !== 0) continue;
    if (b.t - last < minShot) continue;
    cuts.push(+b.t.toFixed(3));
    last = b.t;
  }
  return cuts;
}

/** El golpe donde más sube la energía (el "drop"): ahí va un destello. */
export function biggestRise(map: BeatMap, cuts: number[]): number | null {
  let best: number | null = null;
  let rise = 0.25;
  for (const c of cuts) {
    const i = map.beats.findIndex((b) => Math.abs(b - (c % map.duration)) < 0.02);
    if (i < 2) continue;
    const before = (map.energy[i - 1] + map.energy[i - 2]) / 2;
    const after = map.energy[i] ?? 0;
    if (after - before > rise) { rise = after - before; best = c; }
  }
  return best;
}

/**
 * Rehace el montaje con cortes en los golpes de la música: cada plano dura exactamente
 * de un golpe al siguiente y se reparten las tomas sin repetir imagen.
 */
export async function montageToBeat(dir: string, opts: { density?: BeatDensity; duration?: number } = {}) {
  const project = await readProject(dir);
  if (!project.audio.music || !existsSync(path.join(dir, project.audio.music))) throw new Error('Pon primero una música: el montaje se corta en sus golpes.');
  const map = await musicBeats(dir, project.audio.music);
  if (!map) throw new Error('No encontré un pulso claro en esta música (¿es muy suave o sin percusión?). Prueba con otra canción.');
  const shots = await detectShots(dir);
  if (!shots.length) throw new Error('No se detectaron tomas en el video.');
  const material = shots.reduce((a, s) => a + s.end - s.start, 0);
  const fps = project.format.fps;
  const target = Math.min(material * 0.95, opts.duration ?? project.audio.voiceover?.duration ?? Math.min(30, map.duration));

  // Cortes en tiempo del reel, redondeados a fotogramas para que no se desfasen.
  const frame = (s: number) => Math.round(s * fps) / fps;
  // El final también cae en un golpe: con voz en off, el primero después de que termina (no
  // se corta la voz); si no, el más cercano a la duración pedida.
  const all = beatCuts(map, target + 3, opts.density ?? 'auto');
  const grid: number[] = [];
  for (let l = 0; l * map.duration < target + 3; l++) for (const b of map.beats) grid.push(b + l * map.duration);
  const voice = Boolean(project.audio.voiceover) && opts.duration == null;
  const end = voice
    ? grid.find((b) => b >= target) ?? target
    : grid.reduce((best, b) => (Math.abs(b - target) < Math.abs(best - target) ? b : best), grid[0] ?? target);
  // Un primer plano muy corto (antes del primer golpe) se une al siguiente.
  const inner = all.filter((c) => c < end - 0.3 && c >= 0.6);
  const points = [0, ...inner, end].map(frame);
  const lengths = points.slice(1).map((p, i) => p - points[i]).filter((d) => d > 0);

  const pieces = assignShots(shots, lengths);
  const drop = biggestRise(map, points.slice(1, -1));
  project.scenes = pieces.map((r, i) => Scene.parse({
    id: `s${String(i + 1).padStart(2, '0')}`,
    role: i === 0 ? 'gancho' : 'otro',
    title: `Toma ${r.shot.id.slice(1)}`,
    ranges: [{ start: +r.start.toFixed(4), end: +(r.start + r.length).toFixed(4) }],
    // En el golpe más fuerte, un destello y un zoom.
    ...(drop != null && Math.abs(points[i] - frame(drop)) < 0.01 ? { transition: { id: 'destello' }, punchZoom: true } : {}),
  }));
  project.pacing = { ...project.pacing };
  const saved = await writeProject(dir, project);
  return { project: saved, bpm: map.bpm, cuts: pieces.length, duration: points[points.length - 1], drop };
}

/**
 * Reparte los planos entre las tomas en orden, sin repetir imagen. La duración de cada plano
 * nunca cambia (si no, el corte se saldría del golpe): si una toma no alcanza, el plano pasa a
 * la siguiente con espacio.
 */
export function assignShots(shots: Shot[], lengths: number[]): { shot: Shot; start: number; length: number }[] {
  const total = shots.reduce((a, s) => a + s.end - s.start, 0);
  if (lengths.reduce((a, b) => a + b, 0) > total) throw new Error('No hay material suficiente para tanto tiempo de montaje.');
  // Planos que le tocan a cada toma, proporcional a su duración.
  const share = shots.map((s) => ((s.end - s.start) / total) * lengths.length);
  const count = share.map((x) => Math.floor(x));
  let left = lengths.length - count.reduce((a, b) => a + b, 0);
  for (const o of share.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r)) { if (left <= 0) break; count[o.i]++; left--; }
  const cursor = shots.map((s) => s.start);
  const out: { shot: Shot; start: number; length: number }[] = [];
  let si = 0;
  let inShot = 0;
  for (const length of lengths) {
    while (si < shots.length - 1 && inShot >= count[si]) { si++; inShot = 0; }
    // Toma con espacio: la que toca, o la siguiente que tenga.
    let k = si;
    for (let tries = 0; tries < shots.length && shots[k].end - cursor[k] < length; tries++) k = (k + 1) % shots.length;
    if (shots[k].end - cursor[k] < length) {
      // Sin espacio en ninguna: se repite la toma más larga desde el inicio.
      k = shots.reduce((b, s, i) => (s.end - s.start > shots[b].end - shots[b].start ? i : b), 0);
      cursor[k] = shots[k].start;
    }
    const s = shots[k];
    const plan = Math.max(1, count[k] - (k === si ? inShot : 0));
    // Hueco entre planos de la misma toma, para que se vean partes distintas.
    const gap = Math.max(0, (s.end - cursor[k] - length * plan) / (plan + 1));
    const start = Math.min(cursor[k] + gap, s.end - length);
    out.push({ shot: s, start, length });
    cursor[k] = start + length;
    if (k === si) inShot++;
  }
  return out;
}
