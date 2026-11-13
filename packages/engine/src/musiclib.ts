import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { outputDuration, type Project } from '@axioma/schema';
import { analyzeBeats } from './beats.ts';
import { envValue } from './env.ts';
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

/** Qué se busca en el banco para cada ánimo: palabras sencillas (en inglés, como están etiquetadas) */
const BANK: Record<Mood, { queries: string[] }> = {
  energica: { queries: ['upbeat', 'energetic', 'dance', 'beat'] },
  media: { queries: ['happy', 'groove', 'pop', 'background'] },
  tranquila: { queries: ['lofi', 'chill', 'ambient', 'piano'] },
};

/**
 * Baja del banco gratuito (Freesound, solo CC0: uso libre, sin tener que dar crédito) una canción
 * del ánimo pedido y la deja en la biblioteca con su autor y licencia. El ánimo es el de la búsqueda
 * (animada, alegre, tranquila), así no hay que bajar varias para probar. Null si no hay clave,
 * internet o resultados.
 */
export async function fetchBankMusic(mood: Mood): Promise<MusicTrack | null> {
  const key = await envValue('FREESOUND_API_KEY');
  if (!key) return null;
  const have = (await listTracks()).map((t) => t.license);
  const { queries } = BANK[mood];
  for (const query of [...queries].sort(() => Math.random() - 0.5)) {
    try {
      const q = new URLSearchParams({
        query, page_size: '15', fields: 'id,name,duration,username,previews', sort: 'rating_desc',
        filter: 'duration:[40 TO 200] tag:music license:"Creative Commons 0"', token: key,
      });
      const r = await fetch(`https://freesound.org/apiv2/search/text/?${q}`, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) continue;
      const results = (((await r.json()) as { results?: any[] }).results ?? []).filter((s) => s.previews?.['preview-hq-mp3'] && !have.some((l) => l.endsWith(`#${s.id}`)));
      const s = results[Math.floor(Math.random() * Math.min(results.length, 6))];
      if (!s) continue;
      const tmp = path.join(os.tmpdir(), `freesound-${s.id}.mp3`);
      const d = await fetch(s.previews['preview-hq-mp3'], { signal: AbortSignal.timeout(60_000) });
      if (!d.ok) continue;
      await writeFile(tmp, Buffer.from(await d.arrayBuffer()));
      const track = await addTrack(tmp, {
        name: String(s.name ?? 'Canción').replace(/\.(wav|mp3|flac|ogg|aiff?)$/i, '').replace(/[_-]+/g, ' ').slice(0, 60),
        license: `CC0 (uso libre) · Freesound · ${s.username ?? 'autor'} #${s.id}`,
      });
      await rm(tmp, { force: true });
      // El ánimo es el que se pidió en la búsqueda.
      const all = await listTracks();
      const saved = all.find((t) => t.file === track.file);
      if (saved) { saved.mood = mood; await saveTracks(all); }
      return { ...track, mood };
    } catch { /* sin internet: se sigue con lo que haya */ }
  }
  return null;
}

let stocking: Promise<void> | null = null;
/** En segundo plano, deja 3 canciones de cada ánimo en la biblioteca para que editar no espere a bajarlas. */
export function stockMusic(): Promise<void> {
  stocking ??= (async () => {
    for (const mood of ['energica', 'media', 'tranquila'] as Mood[]) {
      for (let i = 0; i < 3; i++) {
        if ((await listTracks()).filter((t) => t.mood === mood).length >= 3) break;
        if (!(await fetchBankMusic(mood))) break;
      }
    }
  })().catch(() => {}).finally(() => { stocking = null; });
  return stocking;
}

/**
 * Música automática: si el reel no tiene, elige de la biblioteca la que va con su ánimo; si la
 * biblioteca no tiene suficientes de ese ánimo, baja una del banco gratuito. Varía entre las que van.
 */
export async function autoMusic(dir: string): Promise<string | null> {
  const project = await readProject(dir);
  if (project.audio.music) return null;
  const want = wantedMood(project);
  let fits = (await listTracks()).filter((t) => t.mood === want);
  // Solo se espera a bajar una si no hay ninguna de ese ánimo; el resto se trae en segundo plano.
  if (!fits.length) { const got = await fetchBankMusic(want); if (got) fits = [got]; }
  if (fits.length < 3) void stockMusic();
  const tracks = await listTracks();
  if (!tracks.length) return null;
  const pick = fits.length ? fits[Math.floor(Math.random() * fits.length)] : pickTrack(project, tracks)!.track;
  await useLibraryTrack(dir, pick.file);
  const label = { tranquila: 'tranquila', media: 'de ritmo medio', energica: 'enérgica' };
  return `Música ${label[pick.mood]}: «${pick.name}» (${pick.license.split(' · ')[0]})${project.kind === 'montaje' ? ', con los cortes en sus golpes' : ', bajita debajo de la voz'}.`;
}
