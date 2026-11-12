import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Crea una imagen a partir de una idea escrita. Usa Pollinations, un generador
 * gratuito que no pide clave. A ese servicio solo se le envía el texto de la idea:
 * nada del video, del proyecto ni del usuario.
 */
export async function generateImage(idea: string, size: { width: number; height: number }): Promise<string> {
  const clean = idea.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (clean.length < 3) throw new Error('Escribe la idea de la imagen (por ejemplo: taza de café humeante sobre una mesa de madera).');
  const prompt = `${clean}, fotografía profesional, luz cinematográfica, alta calidad, sin texto ni letras`;
  const seed = Math.floor(Math.random() * 1e9);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${size.width}&height=${size.height}&nologo=true&seed=${seed}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new Error('No se pudo conectar con el generador de imágenes. Revisa tu conexión a internet e inténtalo de nuevo.');
  }
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) {
    throw new Error(`El generador de imágenes no respondió bien (código ${res.status}). Inténtalo de nuevo en un momento.`);
  }
  const ext = (res.headers.get('content-type') ?? '').includes('png') ? 'png' : 'jpg';
  const dir = path.join(os.tmpdir(), `axioma-idea-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const slug = clean.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'imagen';
  const file = path.join(dir, `idea-${slug}-${seed % 10000}.${ext}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}
