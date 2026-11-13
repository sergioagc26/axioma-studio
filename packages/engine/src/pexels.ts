import { createWriteStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as pipe } from 'node:stream/promises';
import { envValue } from './env.ts';

/**
 * Videos de stock para b-roll. Dos bancos gratuitos con uso comercial: Pexels y Pixabay.
 * Se usa el que tenga clave (Pexels primero); la búsqueda y la descarga son iguales para los dos.
 */
export type StockSource = 'Pexels' | 'Pixabay';
export interface BrollResult { image?: string; id: number; duration: number; width: number; height: number; author: string; url: string; download: string; source: StockSource; license: string }

const LICENSE: Record<StockSource, string> = {
  Pexels: 'Pexels (uso comercial gratuito)',
  Pixabay: 'Pixabay Content License (uso comercial gratuito)',
};

/** Qué banco de videos está disponible (null si no hay ninguna clave). */
export async function stockSource(): Promise<StockSource | null> {
  if (await envValue('PEXELS_API_KEY')) return 'Pexels';
  if (await envValue('PIXABAY_API_KEY')) return 'Pixabay';
  return null;
}

const NO_KEY = 'Falta la clave de un banco de videos. Saca una gratis en pixabay.com/api/docs (al iniciar sesión aparece tu clave) y pégala en Proyectos → 🔑 Claves. Sin clave, usa un archivo local con usar_broll.';

async function searchPexels(query: string, perPage: number, key: string): Promise<BrollResult[]> {
  // locale=es-ES: Pexels entiende la búsqueda en español.
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${perPage}&locale=es-ES`, { headers: { Authorization: key } });
  if (!r.ok) throw new Error(`Pexels respondió ${r.status}. Revisa la clave.`);
  const data = (await r.json()) as { videos: any[] };
  return data.videos.map((v) => {
    // El archivo más cercano a 1080 px de ancho, sin pasarse de pesado.
    const files = (v.video_files as any[]).filter((f) => f.file_type === 'video/mp4' && f.width).sort((a, b) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080));
    return { image: v.image, id: v.id, duration: v.duration, width: files[0]?.width, height: files[0]?.height, author: v.user?.name ?? 'Pexels', url: v.url, download: files[0]?.link, source: 'Pexels' as const, license: LICENSE.Pexels };
  }).filter((v) => v.download);
}

/** Pixabay no filtra por orientación: se piden más y se ponen primero los verticales (la app recorta el resto a 9:16). */
export function pickPixabay(hits: any[], perPage: number): BrollResult[] {
  return hits.map((h) => {
    const sizes = ['large', 'medium', 'small', 'tiny'].map((k) => h.videos?.[k]).filter((f) => f?.url && f.width);
    // La versión más cercana a 1080 px por el lado corto.
    const best = [...sizes].sort((a, b) => Math.abs(Math.min(a.width, a.height) - 1080) - Math.abs(Math.min(b.width, b.height) - 1080))[0];
    const thumb = h.videos?.medium?.thumbnail ?? h.videos?.small?.thumbnail ?? h.videos?.tiny?.thumbnail;
    return best && { image: thumb, id: h.id, duration: h.duration, width: best.width, height: best.height, author: h.user ?? 'Pixabay', url: h.pageURL, download: best.url, source: 'Pixabay' as const, license: LICENSE.Pixabay };
  }).filter(Boolean)
    .sort((a: BrollResult, b: BrollResult) => Number(b.height > b.width) - Number(a.height > a.width))
    .slice(0, perPage) as BrollResult[];
}

async function searchPixabay(query: string, perPage: number, key: string): Promise<BrollResult[]> {
  const n = Math.min(200, Math.max(3, perPage * 3));
  const r = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query.slice(0, 100))}&lang=es&safesearch=true&per_page=${n}`);
  if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error('Pixabay no aceptó la clave. Revísala en Proyectos → 🔑 Claves.');
  if (!r.ok) throw new Error(`Pixabay respondió ${r.status}. Prueba de nuevo en un momento.`);
  const data = (await r.json()) as { hits: any[] };
  return pickPixabay(data.hits ?? [], perPage);
}

/** Busca videos de stock (verticales primero) en el banco que tenga clave. */
export async function searchBroll(query: string, perPage = 6): Promise<BrollResult[]> {
  const pexels = await envValue('PEXELS_API_KEY');
  if (pexels) return searchPexels(query, perPage, pexels);
  const pixabay = await envValue('PIXABAY_API_KEY');
  if (pixabay) return searchPixabay(query, perPage, pixabay);
  throw new Error(NO_KEY);
}

/** Descarga un resultado a la carpeta de b-roll del proyecto y devuelve la ruta. */
export async function downloadBroll(dir: string, item: BrollResult): Promise<string> {
  const out = path.join(dir, 'media', 'broll', `${item.source.toLowerCase()}-${item.id}.mp4`);
  await mkdir(path.dirname(out), { recursive: true });
  if (!existsSync(out)) {
    const r = await fetch(item.download);
    if (!r.ok || !r.body) throw new Error(`No se pudo descargar el video ${item.id} (${r.status}).`);
    await pipe(Readable.fromWeb(r.body as any), createWriteStream(out));
  }
  return out;
}
