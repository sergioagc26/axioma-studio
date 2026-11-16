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
 * still = la cabeza casi quieta; sin still, se mueve como una persona. Tarda ~30 s por segundo de
 * audio con la GPU de un Mac (unas 4 veces más en CPU).
 */
export async function avatarSpeak(face: string, audio: string, out: string, opts: { still?: boolean; enhance?: boolean; onProgress?: (m: string) => void } = {}): Promise<string> {
  if (!avatarReady()) throw new Error('Falta el motor de avatares (SadTalker). Instálalo una vez con scripts/instalar-avatares.sh (unos 3 GB).');
  const work = path.join(os.tmpdir(), `axioma-avatar-${Date.now()}`);
  await mkdir(work, { recursive: true });
  // El motor quiere wav mono 16 kHz.
  const wav = path.join(work, 'voz.wav');
  await ffmpeg(['-i', audio, '-ac', '1', '-ar', '16000', wav]);
  opts.onProgress?.('El avatar está hablando el guion (unos 30 segundos por segundo de voz)…');
  // En Mac con Apple Silicon usa la GPU (unas 4 veces más rápido que la CPU); lo que la GPU no
  // sabe hacer pasa solo a la CPU.
  const mps = process.platform === 'darwin' && process.arch === 'arm64';
  if (mps) Object.assign(process.env, { SADTALKER_MPS: '1', PYTORCH_ENABLE_MPS_FALLBACK: '1' });
  const args = ['inference.py', '--driven_audio', wav, '--source_image', face, '--result_dir', work, '--preprocess', 'full'];
  if (!mps) args.push('--cpu');
  // Por defecto se mueve como una persona: la cabeza asiente y gira con la voz y la cara gesticula
  // más (still = cabeza casi quieta, para planos donde el cuerpo se deformaría).
  if (opts.still) args.push('--still');
  else args.push('--pose_style', '12', '--expression_scale', '1.3');
  if (opts.enhance) args.push('--enhancer', 'gfpgan');
  await run(AVATAR_PY, args, { cwd: SADTALKER, quiet: true });
  // El resultado queda en la carpeta de trabajo como <fecha>.mp4 (el plano completo, con la cara puesta).
  const top = (await readdir(work)).filter((f) => /\.mp4$/i.test(f));
  const video = top.length ? path.join(work, top.sort().pop()!) : '';
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
