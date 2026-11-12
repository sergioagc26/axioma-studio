import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { envValue } from './env.ts';
import { ffmpeg } from './exec.ts';
import { readProject, writeProject } from './store.ts';

export interface SoundResult { id: number; name: string; duration: number; author: string; license: string; preview: string }

async function freesoundKey(): Promise<string> {
  const key = await envValue('FREESOUND_API_KEY');
  if (!key) throw new Error('Falta la clave de Freesound. Es gratis: créala en freesound.org/apiv2/apply y pégala en la app.');
  return key;
}

const shape = (s: any): SoundResult => ({
  id: s.id, name: String(s.name ?? '').replace(/\.(wav|mp3|flac|ogg|aiff?)$/i, ''), duration: +Number(s.duration ?? 0).toFixed(1),
  author: s.username ?? 'Freesound', license: licenseName(s.license ?? ''), preview: s.previews?.['preview-hq-mp3'] ?? s.previews?.['preview-lq-mp3'] ?? '',
});

/** Nombre corto de la licencia Creative Commons a partir de su dirección. */
function licenseName(url: string): string {
  if (/publicdomain|zero/i.test(url)) return 'CC0 (uso libre)';
  if (/by-nc/i.test(url)) return 'CC BY-NC (no comercial)';
  if (/\/by\//i.test(url)) return 'CC BY (pide dar crédito)';
  return url || 'ver en Freesound';
}

/**
 * Busca efectos de sonido cortos en Freesound. Por defecto solo trae los que se
 * pueden usar en contenido comercial (CC0 y CC BY); los «no comercial» se dejan fuera.
 */
export async function searchSounds(query: string, perPage = 12): Promise<SoundResult[]> {
  const q = new URLSearchParams({
    query, page_size: String(perPage), fields: 'id,name,duration,username,license,previews', sort: 'rating_desc',
    filter: 'duration:[0.1 TO 8] (license:"Creative Commons 0" OR license:"Attribution")', token: await freesoundKey(),
  });
  const r = await fetch(`https://freesound.org/apiv2/search/text/?${q}`, { signal: AbortSignal.timeout(30_000) });
  if (r.status === 401) throw new Error('Freesound no aceptó la clave. Revisa que la hayas copiado completa.');
  if (!r.ok) throw new Error(`Freesound respondió ${r.status}. Inténtalo de nuevo en un momento.`);
  const data = (await r.json()) as { results?: any[] };
  return (data.results ?? []).map(shape).filter((s) => s.preview);
}

/**
 * Descarga un sonido de Freesound al proyecto y lo pone en una escena. El sonido se
 * vuelve a pedir por su número (no se confía en una dirección que llegue de fuera),
 * y queda anotado con su autor y licencia.
 */
export async function addBankSound(dir: string, sceneId: string, soundId: number, opts: { offset?: number; volume?: number } = {}) {
  const key = await freesoundKey();
  const r = await fetch(`https://freesound.org/apiv2/sounds/${Math.trunc(soundId)}/?fields=id,name,duration,username,license,previews&token=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`No se encontró ese sonido en Freesound (${r.status}).`);
  const s = shape(await r.json());
  if (!s.preview || !/^https:\/\/([a-z0-9-]+\.)*freesound\.org\//i.test(s.preview)) throw new Error('Ese sonido no tiene una vista previa descargable.');
  const id = `banco-${s.id}`;
  const out = path.join(dir, 'media', 'sfx', `${id}.wav`);
  if (!existsSync(out)) {
    await mkdir(path.dirname(out), { recursive: true });
    const tmp = out + '.mp3';
    const a = await fetch(s.preview, { signal: AbortSignal.timeout(60_000) });
    if (!a.ok) throw new Error(`No se pudo descargar el sonido (${a.status}).`);
    await writeFile(tmp, Buffer.from(await a.arrayBuffer()));
    try {
      await ffmpeg(['-i', tmp, '-t', '8', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out]);
    } finally {
      await rm(tmp, { force: true });
    }
  }
  const project = await readProject(dir);
  const scene = project.scenes.find((x) => x.id === sceneId);
  if (!scene) throw new Error('No existe esa escena.');
  scene.sfx.push({ id, offset: opts.offset ?? 0, volume: opts.volume ?? 0.6 });
  const rel = `media/sfx/${id}.wav`;
  project.assets = [...project.assets.filter((x) => x.file !== rel), { file: rel, kind: 'otro', source: `Freesound · ${s.name}`, license: s.license, author: s.author, url: `https://freesound.org/s/${s.id}/` }];
  return { project: await writeProject(dir, project), sound: s };
}
