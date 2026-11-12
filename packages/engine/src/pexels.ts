import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as pipe } from 'node:stream/promises';
import { REPO_ROOT } from './paths.ts';

export interface BrollResult { id: number; duration: number; width: number; height: number; author: string; url: string; download: string }

/** Clave de Pexels: variable de entorno o archivo .env en la raíz (PEXELS_API_KEY=…). */
async function pexelsKey(): Promise<string> {
  if (process.env.PEXELS_API_KEY) return process.env.PEXELS_API_KEY;
  const env = path.join(REPO_ROOT, '.env');
  const m = existsSync(env) ? (await readFile(env, 'utf8')).match(/^PEXELS_API_KEY\s*=\s*(.+)$/m) : null;
  if (!m) throw new Error('Falta la clave de Pexels. Crea una gratis en pexels.com/api y guárdala en el archivo .env como PEXELS_API_KEY=tu_clave. Sin clave, usa un archivo local con usar_broll.');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

/** Busca videos verticales en Pexels (licencia Pexels: uso comercial gratuito). */
export async function searchBroll(query: string, perPage = 6): Promise<BrollResult[]> {
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${perPage}`, {
    headers: { Authorization: await pexelsKey() },
  });
  if (!r.ok) throw new Error(`Pexels respondió ${r.status}. Revisa la clave.`);
  const data = (await r.json()) as { videos: any[] };
  return data.videos.map((v) => {
    // El archivo más cercano a 1080 px de ancho, sin pasarse de pesado.
    const files = (v.video_files as any[]).filter((f) => f.file_type === 'video/mp4' && f.width).sort((a, b) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080));
    return { id: v.id, duration: v.duration, width: files[0]?.width, height: files[0]?.height, author: v.user?.name ?? 'Pexels', url: v.url, download: files[0]?.link };
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
