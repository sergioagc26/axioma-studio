import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raíz del repositorio (dos niveles sobre packages/engine/src). */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

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
  shots: 'shots.json',
  voiceover: path.join('media', 'voz-en-off.wav'),
  voiceoverWords: 'voiceover.json',
  master: path.join('media', 'master.mp4'),
  proxy: path.join('proxies', 'proxy.mp4'),
  wav16k: path.join('media', 'audio-16k.wav'),
  voice: path.join('media', 'voz.wav'),
  renders: 'renders',
  versions: 'versions',
};
