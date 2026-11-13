import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { outputDuration, type Project } from '@axioma/schema';
import { analyzeBeats } from './beats.ts';
import { ffmpeg } from './exec.ts';
import { mediaDuration } from './media.ts';
import { buildMontage } from './montage.ts';
import * as ops from './ops.ts';
import { WORKSPACE } from './paths.ts';
import { readProject } from './store.ts';

/**
 * Tu biblioteca de música: subes tus canciones (con su licencia) una vez y la app elige sola la
 * que va con el reel, por su tempo y su energía. Vive en workspace/musica.
 */
export const MUSIC_DIR = path.join(WORKSPACE, 'musica');
const INDEX = path.join(MUSIC_DIR, 'biblioteca.json');

export type Mood = 'tranquila' | 'media' | 'energica';
export interface MusicTrack { file: string; name: string; license: string; bpm: number | null; energy: number; duration: number; mood: Mood; addedAt: string }

export async function listTracks(): Promise<MusicTrack[]> {
  try { return JSON.parse(await readFile(INDEX, 'utf8')) as MusicTrack[]; } catch { return []; }
}

async function saveTracks(tracks: MusicTrack[]) {
  await mkdir(MUSIC_DIR, { recursive: true });
  await writeFile(INDEX, JSON.stringify(tracks, null, 2));
}

/** Clasifica una canción por tempo y energía (volumen medio, 0–1). */
export function moodOf(bpm: number | null, energy: number): Mood {
  const fast = (bpm ?? 0) >= 112;
  const slow = bpm != null && bpm < 92;
  if (energy >= 0.55 && !slow) return 'energica';
  if (fast && energy >= 0.4) return 'energica';
  if (energy < 0.33 || slow) return 'tranquila';
  return 'media';
}

/** Mide tempo y energía de una canción. */
export async function analyzeTrack(file: string) {
  const tmp = path.join(os.tmpdir(), `axioma-musica-${Date.now()}.f32`);
  try {
    await ffmpeg(['-i', file, '-vn', '-ac', '1', '-ar', '8000', '-t', '90', '-f', 'f32le', tmp]);
    const buf = await readFile(tmp);
    const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
    const beats = analyzeBeats(samples);
    let sq = 0;
    for (const x of samples) sq += x * x;
    const rms = Math.sqrt(sq / Math.max(1, samples.length));
    // −30 dBFS (muy suave) → 0 · −10 dBFS (fuerte) → 1
    const db = 20 * Math.log10(Math.max(1e-6, rms));
    const energy = Math.max(0, Math.min(1, (db + 30) / 20));
    return { bpm: beats?.bpm ?? null, energy: +energy.toFixed(2) };
  } finally {
    await rm(tmp, { force: true });
  }
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');

/** Agrega una canción a la biblioteca (la licencia es obligatoria). */
export async function addTrack(file: string, info: { license: string; name?: string }): Promise<MusicTrack> {
  if (!info.license.trim()) throw new Error('Indica la licencia de la canción (propia, Artlist, Epidemic, YouTube Audio Library…).');
  await mkdir(MUSIC_DIR, { recursive: true });
  const ext = path.extname(file).toLowerCase() || '.mp3';
  const base = slug(path.basename(file, path.extname(file))) || 'cancion';
  let name = `${base}${ext}`;
  for (let n = 2; existsSync(path.join(MUSIC_DIR, name)); n++) name = `${base}-${n}${ext}`;
  await copyFile(file, path.join(MUSIC_DIR, name));
  const a = await analyzeTrack(path.join(MUSIC_DIR, name));
  const track: MusicTrack = {
    file: name, name: (info.name ?? path.basename(file, path.extname(file))).slice(0, 80), license: info.license.trim(),
    bpm: a.bpm, energy: a.energy, duration: +(await mediaDuration(path.join(MUSIC_DIR, name))).toFixed(1), mood: moodOf(a.bpm, a.energy), addedAt: new Date().toISOString(),
  };
  await saveTracks([...(await listTracks()).filter((t) => t.file !== name), track]);
  return track;
}

export async function removeTrack(file: string) {
  const tracks = await listTracks();
  const t = tracks.find((x) => x.file === file);
  if (!t) return tracks;
  await rm(path.join(MUSIC_DIR, path.basename(t.file)), { force: true });
  const rest = tracks.filter((x) => x.file !== file);
  await saveTracks(rest);
  return rest;
}

/** Qué energía pide el reel: según su ritmo (pausas), si es montaje y su tono. */
export function wantedMood(p: Project): Mood {
  if (p.kind === 'montaje') return 'energica';
  const tone = String(p.brief?.tono ?? '').toLowerCase();
  if (/inspira|elegante|cercan|tranquil/.test(tone)) return p.pacing.maxPause <= 0.2 ? 'media' : 'tranquila';
  return p.pacing.maxPause <= 0.2 ? 'energica' : p.pacing.maxPause <= 0.4 ? 'media' : 'tranquila';
}

/** La canción que mejor va con el reel (o null si la biblioteca está vacía). */
export function pickTrack(p: Project, tracks: MusicTrack[]): { track: MusicTrack; why: string } | null {
  if (!tracks.length) return null;
  const want = wantedMood(p);
  const dur = outputDuration(p);
  const order: Mood[] = ['tranquila', 'media', 'energica'];
  const score = (t: MusicTrack) => {
    const dist = Math.abs(order.indexOf(t.mood) - order.indexOf(want));
    return (2 - dist) * 10 + (t.duration >= dur ? 3 : 0) + (t.bpm ? 1 : 0);
  };
  const best = [...tracks].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
  const label = { tranquila: 'tranquila', media: 'de ritmo medio', energica: 'enérgica' };
  return { track: best, why: `El reel pide música ${label[want]}: «${best.name}» es ${label[best.mood]}${best.bpm ? ` (~${best.bpm} BPM)` : ''}.` };
}

/** Pone la canción elegida (o la que mejor va) como música del reel. */
export async function useLibraryTrack(dir: string, file?: string) {
  const tracks = await listTracks();
  const project = await readProject(dir);
  const chosen = file ? tracks.find((t) => t.file === file) : pickTrack(project, tracks)?.track;
  if (!chosen) throw new Error(file ? 'Esa canción ya no está en la biblioteca.' : 'Tu biblioteca de música está vacía: agrega canciones primero.');
  let p = await ops.setMusic(dir, path.join(MUSIC_DIR, chosen.file), { license: chosen.license, source: `Biblioteca de música: ${chosen.name}` });
  // En un montaje, los cortes se vuelven a poner en los golpes de la canción nueva.
  if (p.kind === 'montaje') p = (await buildMontage(dir, {})).project;
  return { project: p, track: chosen, why: file ? undefined : pickTrack(project, tracks)?.why };
}
