import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run } from './exec.ts';
import { REPO_ROOT } from './paths.ts';

/**
 * Generador local (gratis, sin internet, en este computador): Z-Image Turbo con mflux, solo en Mac
 * con Apple Silicon. Se instala en .venv-imagen y el modelo en .modelos/z-image-turbo-q4 (~6 GB).
 */
const LOCAL_BIN = path.join(REPO_ROOT, '.venv-imagen', 'bin', 'mflux-generate-z-image-turbo');
const LOCAL_MODEL = path.resolve(process.env.SE_MODELS_DIR ?? path.join(REPO_ROOT, '.modelos'), 'z-image-turbo-q4');
export const LOCAL_PY = path.join(REPO_ROOT, '.venv-imagen', 'bin', 'python');

export function localImageReady(): boolean {
  return existsSync(LOCAL_BIN) && existsSync(path.join(LOCAL_MODEL, 'transformer'));
}

/** Quién hizo la imagen (para la licencia del recurso). */
export const imageEngineName = () => (localImageReady() ? 'Z-Image Turbo, local' : 'Pollinations');

/** Imagen con el generador local. El texto va tal cual (entiende inglés y español). */
export async function generateImageLocal(prompt: string, size: { width: number; height: number }, seed = Math.floor(Math.random() * 1e9)): Promise<string> {
  if (!localImageReady()) throw new Error('El generador de imágenes local no está instalado.');
  const m16 = (n: number) => Math.max(256, Math.round(n / 16) * 16);
  const dir = path.join(os.tmpdir(), `axioma-imagen-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `imagen-${seed}.png`);
  await run(LOCAL_BIN, ['--model', LOCAL_MODEL, '--base-model', 'z-image-turbo', '--prompt', prompt, '--width', String(m16(size.width)), '--height', String(m16(size.height)), '--steps', '9', '--seed', String(seed), '--low-ram', '--output', file], { quiet: true });
  if (!existsSync(file)) {
    const any = (await readdir(dir)).find((f) => /\.png$/i.test(f));
    if (any) return path.join(dir, any);
    throw new Error('El generador local no devolvió la imagen.');
  }
  return file;
}

/**
 * Crea una imagen a partir de una idea escrita. Usa Pollinations, un generador
 * gratuito que no pide clave. A ese servicio solo se le envía el texto de la idea:
 * nada del video, del proyecto ni del usuario.
 */
export async function generateImage(idea: string, size: { width: number; height: number }): Promise<string> {
  const clean = idea.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (clean.length < 3) throw new Error('Escribe la idea de la imagen (por ejemplo: taza de café humeante sobre una mesa de madera).');
  // Si está el generador local, se usa ese: mejor calidad, sin marca de agua y sin internet.
  if (localImageReady()) return generateImageLocal(`${clean}, fotografía realista, alta calidad, sin texto ni letras`, size);
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
