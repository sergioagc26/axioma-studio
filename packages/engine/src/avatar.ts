import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ffmpeg, run } from './exec.ts';
import { generateImageLocal } from './imagegen.ts';
import { REPO_ROOT } from './paths.ts';
import { synthesize, type TtsProvider } from './tts.ts';

/**
 * Avatares de IA: una persona FICTICIA (creada con el generador local) que habla un guion con
 * movimiento de boca, parpadeo y gestos. Motor: SadTalker (Apache-2.0), en este computador y sin
 * internet: .avatar/SadTalker con su entorno .venv-avatar (≈2,4 GB de modelos).
 * Nunca se usa para imitar a una persona real; al publicar, marca el video como «hecho con IA».
 */
const SADTALKER = path.join(REPO_ROOT, '.avatar', 'SadTalker');
const AVATAR_PY = path.join(REPO_ROOT, '.venv-avatar', 'bin', 'python');

export function avatarReady(): boolean {
  return existsSync(AVATAR_PY) && existsSync(path.join(SADTALKER, 'checkpoints', 'SadTalker_V0.0.2_256.safetensors'));
}

/** Cómo se pide la foto: plano medio vertical, mirando a cámara, boca cerrada (lo que mejor anima el motor). */
const FACE_FRAME = 'photorealistic vertical smartphone video still, facing the camera directly and looking straight into the lens, calm friendly expression with lips closed, medium close-up framed from the chest up with head in the upper third, small black lavalier microphone on the collar, natural skin texture, sharp focus on the face';

/**
 * Crea la cara de un avatar a partir de una descripción (quién es, ropa, fondo). Siempre una
 * persona ficticia: la descripción no debe nombrar ni imitar a nadie real.
 */
export async function createAvatarFace(description: string, out: string, seed?: number): Promise<string> {
  if (/\b(como|igual a|parecid[oa] a|look ?alike|lookalike|celebrity|famos[oa])\b/i.test(description)) {
    throw new Error('El avatar tiene que ser una persona inventada: describe cómo es (edad, pelo, ropa, fondo) sin nombrar ni imitar a nadie real.');
  }
  const raw = await generateImageLocal(`${FACE_FRAME}, fictional person: ${description.trim()}`, { width: 864, height: 1536 }, seed);
  await mkdir(path.dirname(out), { recursive: true });
  await copyFile(raw, out);
  await rm(path.dirname(raw), { recursive: true, force: true });
  return out;
}

/**
 * El avatar dice un audio: devuelve un video vertical del tamaño de la foto, con el audio.
 * still = la cabeza casi quieta (no deforma el cuerpo en planos medios). Tarda ~2 min por segundo
 * de audio en la CPU de un Mac.
 */
export async function avatarSpeak(face: string, audio: string, out: string, opts: { still?: boolean; enhance?: boolean; onProgress?: (m: string) => void } = {}): Promise<string> {
  if (!avatarReady()) throw new Error('Falta el motor de avatares (SadTalker). Instálalo una vez con scripts/instalar-avatares.sh (unos 3 GB).');
  const work = path.join(os.tmpdir(), `axioma-avatar-${Date.now()}`);
  await mkdir(work, { recursive: true });
  // El motor quiere wav mono 16 kHz.
  const wav = path.join(work, 'voz.wav');
  await ffmpeg(['-i', audio, '-ac', '1', '-ar', '16000', wav]);
  opts.onProgress?.('El avatar está hablando el guion (unos 2 minutos por segundo de voz)…');
  const args = ['inference.py', '--driven_audio', wav, '--source_image', face, '--result_dir', work, '--preprocess', 'full', '--cpu'];
  if (opts.still !== false) args.push('--still');
  if (opts.enhance) args.push('--enhancer', 'gfpgan');
  await run(AVATAR_PY, args, { cwd: SADTALKER, quiet: true });
  // El resultado queda en una subcarpeta con fecha: <foto>##voz_full.mp4 (o _enhanced).
  const sub = (await readdir(work, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => path.join(work, d.name));
  let video = '';
  for (const d of sub) for (const f of await readdir(d)) if (/_full(_enhanced)?\.mp4$/.test(f) || (/\.mp4$/.test(f) && !f.startsWith('temp_') && !video)) video = path.join(d, f);
  if (!video) throw new Error('El motor de avatares no devolvió el video.');
  await mkdir(path.dirname(out), { recursive: true });
  // Video del avatar + el audio original en buena calidad.
  await ffmpeg(['-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
  await rm(work, { recursive: true, force: true });
  return out;
}

/** Guion → voz (la voz elegida) → avatar hablando. Devuelve el video, listo para crear un proyecto «hablando a cámara». */
export async function avatarVideo(opts: { face: string; text: string; out: string; provider?: TtsProvider; voice?: string; onProgress?: (m: string) => void }): Promise<string> {
  const audio = opts.out.replace(/\.mp4$/i, '') + '-voz.wav';
  opts.onProgress?.('Generando la voz del avatar…');
  await synthesize(opts.text, audio, { provider: opts.provider, voice: opts.voice });
  return avatarSpeak(opts.face, audio, opts.out, { onProgress: opts.onProgress });
}
