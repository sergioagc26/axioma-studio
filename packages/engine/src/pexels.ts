import { createWriteStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as pipe } from 'node:stream/promises';
import { envValue } from './env.ts';

export interface BrollResult { image?: string; id: number; duration: number; width: number; height: number; author: string; url: string; download: string }

async function pexelsKey(): Promise<string> {
  const key = await envValue('PEXELS_API_KEY');
  if (!key) throw new Error('Falta la clave de Pexels. Crea una gratis en pexels.com/api y guárdala en el archivo .env como PEXELS_API_KEY=tu_clave. Sin clave, usa un archivo local con usar_broll.');
  return key;
}

/** Busca videos verticales en Pexels (licencia Pexels: uso comercial gratuito). */
export async function searchBroll(query: string, perPage = 6): Promise<BrollResult[]> {
  // locale=es-ES: Pexels entiende la búsqueda en español.
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${perPage}&locale=es-ES`, {
    headers: { Authorization: await pexelsKey() },
  });
  if (!r.ok) throw new Error(`Pexels respondió ${r.status}. Revisa la clave.`);
  const data = (await r.json()) as { videos: any[] };
  return data.videos.map((v) => {
    // El archivo más cercano a 1080 px de ancho, sin pasarse de pesado.
    const files = (v.video_files as any[]).filter((f) => f.file_type === 'video/mp4' && f.width).sort((a, b) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080));
    return { image: v.image, id: v.id, duration: v.duration, width: files[0]?.width, height: files[0]?.height, author: v.user?.name ?? 'Pexels', url: v.url, download: files[0]?.link };
  }).filter((v) => v.download);
}

/** Descarga un resultado a una carpeta temporal del proyecto y devuelve la ruta. */
export async function downloadBroll(dir: string, item: BrollResult): Promise<string> {
  const out = path.join(dir, 'media', 'broll', `pexels-${item.id}.mp4`);
  await mkdir(path.dirname(out), { recursive: true });
  if (!existsSync(out)) {
    const r = await fetch(item.download);
    if (!r.ok || !r.body) throw new Error(`No se pudo descargar el video ${item.id} (${r.status}).`);
    await pipe(Readable.fromWeb(r.body as any), createWriteStream(out));
  }
  return out;
}
