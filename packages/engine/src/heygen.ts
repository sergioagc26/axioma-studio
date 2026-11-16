import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { checkCancelled } from './cancel.ts';
import { envValue } from './env.ts';

/**
 * Avatares de HeyGen (de la cuenta del usuario): la lista de sus avatares y videos de un avatar
 * diciendo un guion, con la voz que ya hizo la app (audio) o con una voz de HeyGen (texto).
 * Necesita HEYGEN_API_KEY (Proyectos › Ajustes › Claves). Cada video gasta créditos de su plan.
 * Solo avatares con consentimiento: el gemelo del usuario, de stock o de quien lo autorizó.
 */
const API = 'https://api.heygen.com';
const UPLOAD = 'https://upload.heygen.com';

async function key(): Promise<string> {
  const k = await envValue('HEYGEN_API_KEY');
  if (!k) throw new Error('Falta la clave de HeyGen: pégala en Proyectos › Ajustes › Claves (la sacas en app.heygen.com › Settings › API).');
  return k;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'X-Api-Key': await key(), Accept: 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(120_000) });
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* respuesta no JSON */ }
  if (!r.ok || body?.error) {
    const msg = body?.error?.message ?? body?.message ?? text.slice(0, 200);
    if (r.status === 401 || r.status === 403) throw new Error('HeyGen no aceptó la clave: revisa que sea la de API (Settings › API) y que tu plan tenga acceso a la API.');
    throw new Error(`HeyGen respondió con un error (${r.status}): ${msg}`);
  }
  return body as T;
}

export interface HeygenAvatar { id: string; name: string; kind: 'avatar' | 'foto'; preview?: string; gender?: string }

/** Tus avatares de HeyGen (también las fotos que hablan). */
export async function heygenAvatars(): Promise<HeygenAvatar[]> {
  const r = await call<{ data: { avatars?: any[]; talking_photos?: any[] } }>(`${API}/v2/avatars`);
  const avatars = (r.data.avatars ?? []).map((a) => ({ id: String(a.avatar_id), name: String(a.avatar_name ?? a.avatar_id), kind: 'avatar' as const, preview: a.preview_image_url, gender: a.gender }));
  const photos = (r.data.talking_photos ?? []).map((p) => ({ id: String(p.talking_photo_id), name: String(p.talking_photo_name ?? p.talking_photo_id), kind: 'foto' as const, preview: p.preview_image_url }));
  return [...avatars, ...photos];
}

/** Sube el audio de la voz a HeyGen y devuelve su id. */
async function uploadAudio(file: string): Promise<string> {
  const ext = path.extname(file).toLowerCase();
  const type = ext === '.wav' ? 'audio/x-wav' : 'audio/mpeg';
  const r = await call<{ data: { id: string } }>(`${UPLOAD}/v1/asset`, { method: 'POST', headers: { 'Content-Type': type }, body: await readFile(file) });
  return r.data.id;
}

/**
 * Un avatar de HeyGen dice un guion: con «audio» usa esa voz (la de ElevenLabs que hizo la app),
 * con «text» + «voiceId» usa una voz de HeyGen. Espera a que HeyGen termine y baja el video.
 */
export async function heygenVideo(opts: {
  avatarId: string; kind?: 'avatar' | 'foto'; out: string; audio?: string; text?: string; voiceId?: string;
  width?: number; height?: number; background?: string; onProgress?: (m: string) => void;
}): Promise<string> {
  if (!opts.audio && !(opts.text && opts.voiceId)) throw new Error('Pasa el audio de la voz, o el texto y una voz de HeyGen.');
  const say = (m: string) => { checkCancelled(); opts.onProgress?.(m); };
  const voice = opts.audio
    ? (say('Subiendo la voz a HeyGen…'), { type: 'audio', audio_asset_id: await uploadAudio(opts.audio) })
    : { type: 'text', input_text: opts.text, voice_id: opts.voiceId };
  const character = opts.kind === 'foto'
    ? { type: 'talking_photo', talking_photo_id: opts.avatarId }
    : { type: 'avatar', avatar_id: opts.avatarId, avatar_style: 'normal' };
  say('Pidiendo el video a HeyGen…');
  const gen = await call<{ data: { video_id: string } }>(`${API}/v2/video/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_inputs: [{ character, voice, ...(opts.background ? { background: { type: 'color', value: opts.background } } : {}) }], dimension: { width: opts.width ?? 1080, height: opts.height ?? 1920 } }),
  });
  const id = gen.data.video_id;
  // HeyGen tarda unos minutos: se pregunta cada 10 s (hasta 40 min).
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    say(`HeyGen está haciendo el video${i ? ` (${Math.round((i * 10) / 60)} min)` : ''}…`);
    const st = await call<{ data: { status: string; video_url?: string; error?: { message?: string } } }>(`${API}/v1/video_status.get?video_id=${encodeURIComponent(id)}`);
    if (st.data.status === 'failed') throw new Error(`HeyGen no pudo hacer el video: ${st.data.error?.message ?? 'sin detalle'}`);
    if (st.data.status === 'completed' && st.data.video_url) {
      await mkdir(path.dirname(opts.out), { recursive: true });
      const r = await fetch(st.data.video_url);
      if (!r.ok || !r.body) throw new Error('No se pudo bajar el video de HeyGen.');
      await pipeline(Readable.fromWeb(r.body as never), createWriteStream(opts.out));
      return opts.out;
    }
  }
  throw new Error('HeyGen tardó demasiado (más de 40 minutos). Revisa el video en tu cuenta de HeyGen.');
}
