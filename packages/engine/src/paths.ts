import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raíz del repositorio (dos niveles sobre packages/engine/src). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Todo lo de la app vive junto a la app (p. ej. en el disco externo): los archivos temporales
 * (renders, imágenes, descargas) van a .tmp/ y los modelos de Hugging Face a .modelos/hf, no al
 * disco del sistema. os.tmpdir() lee TMPDIR en cada llamada, así que basta con fijarlo aquí.
 */
export const APP_TMP = path.resolve(process.env.SE_TMP ?? path.join(REPO_ROOT, '.tmp'));
try {
  mkdirSync(APP_TMP, { recursive: true });
  process.env.TMPDIR = APP_TMP; process.env.TMP = APP_TMP; process.env.TEMP = APP_TMP;
  process.env.HF_HOME ??= path.join(REPO_ROOT, '.modelos', 'hf');
} catch { /* sin permiso de escritura: se queda el temporal del sistema */ }

export const WORKSPACE = path.resolve(process.env.SE_WORKSPACE ?? path.join(REPO_ROOT, 'workspace'));
/** 1.7.4+ trae alineación DTW: tiempos por palabra mucho más precisos. */
export const WHISPER_VERSION = process.env.SE_WHISPER_VERSION ?? '1.9.5';
const WHISPER_ROOT = path.resolve(process.env.SE_WHISPER_DIR ?? path.join(REPO_ROOT, '.whisper'));
export const WHISPER_DIR = path.join(WHISPER_ROOT, `whisper.cpp-${WHISPER_VERSION}`);
export const WHISPER_MODELS = path.join(WHISPER_ROOT, 'models');
export const REMOTION_ENTRY = path.join(REPO_ROOT, 'packages', 'remotion', 'src', 'index.ts');

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proyecto';

export function projectDir(client: string | undefined, slug: string) {
  return path.join(WORKSPACE, 'clientes', slugify(client ?? 'personal'), 'proyectos', slug);
}

/** Archivos estándar dentro de la carpeta de un proyecto (rutas relativas). */
export const P = {
  project: 'project.json',
  transcript: 'transcript.json',
  transcriptRaw: 'transcript.raw.json',
  analysis: 'analysis.json',
  faces: 'faces.json',
  vision: 'vision.json',
  shots: 'shots.json',
  voiceover: path.join('media', 'voz-en-off.wav'),
  voiceoverWords: 'voiceover.json',
  master: path.join('media', 'master.mp4'),
  proxy: path.join('proxies', 'proxy.mp4'),
  cutout: path.join('proxies', 'recorte.webm'),
  wav16k: path.join('media', 'audio-16k.wav'),
  voice: path.join('media', 'voz.wav'),
  renders: 'renders',
  versions: 'versions',
};
