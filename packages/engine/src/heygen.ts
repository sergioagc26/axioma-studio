import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
    if (r.status === 402) throw new Error('Tu cuenta de HeyGen no tiene créditos de API. La API se paga aparte del plan de la web: compra créditos de API en app.heygen.com › Settings › API (o en heygen.com/api-pricing) y vuelve a intentarlo.');
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

// ───────────── API v3: looks de tu gemelo, escenas, voz sola y videos de tu cuenta ─────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(url: string, out: string): Promise<string> {
  await mkdir(path.dirname(out), { recursive: true });
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error('No se pudo bajar el archivo de HeyGen.');
  await pipeline(Readable.fromWeb(r.body as never), createWriteStream(out));
  return out;
}

/** Recorre todas las páginas de una lista de la API v3. */
async function pages<T>(url: string, max = 10): Promise<T[]> {
  const all: T[] = [];
  let token = '';
  for (let i = 0; i < max; i++) {
    const r = await call<{ data?: T[]; has_more?: boolean; next_token?: string }>(url + (token ? `&token=${encodeURIComponent(token)}` : ''));
    all.push(...(r.data ?? []));
    if (!r.has_more || !r.next_token) break;
    token = r.next_token;
  }
  return all;
}

export interface HeygenLook { id: string; name: string; group: string; groupId: string; orientation?: string; voiceId?: string; engines: string[]; preview?: string }

/** Los looks (escenarios, ropa, planos) de tus avatares propios, p. ej. tu gemelo digital. */
export async function heygenLooks(): Promise<HeygenLook[]> {
  const groups = await pages<{ id: string; name: string }>(`${API}/v3/avatars?ownership=private&limit=50`);
  const out: HeygenLook[] = [];
  for (const g of groups) {
    const looks = await pages<any>(`${API}/v3/avatars/looks?group_id=${encodeURIComponent(g.id)}&limit=50`);
    for (const l of looks) {
      if (l.status && l.status !== 'completed') continue;
      out.push({ id: String(l.id), name: String(l.name ?? l.id).trim(), group: g.name, groupId: g.id, orientation: l.preferred_orientation, voiceId: l.default_voice_id, engines: (l.supported_api_engines ?? []).map(String), preview: l.preview_image_url });
    }
  }
  return out;
}

export interface HeygenVoice { id: string; name: string; language?: string; gender?: string; type?: string }

/** Voces de HeyGen; «propias» deja primero tus voces clonadas. */
export async function heygenVoices(): Promise<HeygenVoice[]> {
  const list = await pages<any>(`${API}/v3/voices?ownership=private&limit=100`, 3);
  const voices: HeygenVoice[] = list.map((v) => ({ id: String(v.voice_id), name: String(v.name ?? v.voice_id), language: v.language, gender: v.gender, type: v.type }));
  // La voz clonada no siempre sale en la lista: es la voz por defecto de los looks de tu gemelo.
  const own = new Map<string, HeygenVoice>();
  for (const l of await heygenLooks().catch(() => [])) {
    if (l.voiceId && !own.has(l.voiceId)) own.set(l.voiceId, { id: l.voiceId, name: `Tu voz (${l.group} › ${l.name})`, type: 'propia' });
  }
  const rest = voices.filter((v) => !own.has(v.id)).sort((a, b) => Number(a.type === 'public') - Number(b.type === 'public'));
  return [...own.values(), ...rest];
}

export interface HeygenRemote { id: string; title: string; status: string; duration?: number; created?: string; url?: string }

/** Los últimos videos de tu cuenta de HeyGen (también los hechos en la web). Listar y bajar no gasta créditos. */
export async function heygenMyVideos(limit = 20): Promise<HeygenRemote[]> {
  const r = await call<{ data?: any[] }>(`${API}/v3/videos?limit=${Math.max(1, Math.min(100, limit))}`);
  return (r.data ?? []).map((v) => ({ id: String(v.id ?? v.video_id), title: String(v.title ?? ''), status: String(v.status ?? ''), duration: v.duration, created: v.created_at ? new Date(Number(v.created_at) * 1000).toISOString() : undefined, url: v.video_url }));
}

async function videoStatus(id: string): Promise<{ status: string; url?: string; duration?: number; error?: string }> {
  const r = await call<{ data?: any }>(`${API}/v3/videos/${encodeURIComponent(id)}`);
  const d = r.data ?? {};
  return { status: String(d.status ?? ''), url: d.video_url, duration: d.duration, error: d.failure_message ?? d.failure_code };
}

/**
 * Baja un video de tu cuenta de HeyGen (hecho en la web o por la API), por id o por parte del título.
 * Si todavía se está haciendo, espera (hasta «minutos»). No gasta créditos.
 */
export async function heygenDownload(opts: { id?: string; title?: string; out: string; minutes?: number; onProgress?: (m: string) => void }): Promise<{ out: string; title: string; duration?: number }> {
  if (!opts.id && !opts.title) throw new Error('Pasa el id del video de HeyGen o parte de su título.');
  const say = (m: string) => { checkCancelled(); opts.onProgress?.(m); };
  const tries = Math.ceil(((opts.minutes ?? 30) * 60) / 15);
  for (let i = 0; i <= tries; i++) {
    let id = opts.id;
    let title = opts.title ?? '';
    if (!id) {
      const needle = opts.title!.toLowerCase();
      const hit = (await heygenMyVideos(100)).find((v) => v.title.toLowerCase().includes(needle));
      if (!hit) throw new Error(`No hay ningún video en tu HeyGen con «${opts.title}» en el título.`);
      id = hit.id;
      title = hit.title;
    }
    const st = await videoStatus(id);
    if (st.status === 'failed') throw new Error(`HeyGen no pudo hacer ese video: ${st.error ?? 'sin detalle'}`);
    if (st.status === 'completed' && st.url) return { out: await download(st.url, opts.out), title, duration: st.duration };
    say(`HeyGen todavía está haciendo «${title || id}» (${st.status || 'en cola'})…`);
    await sleep(15_000);
  }
  throw new Error('El video de HeyGen sigue sin terminar. Vuelve a intentarlo en unos minutos.');
}

/**
 * Varias escenas con tus looks y tu voz clonada (API v3): una escena por texto, cada una con su look
 * (si hay menos looks que escenas, se repiten en orden). Se reanuda: las ya pedidas no se vuelven a pagar
 * (los ids quedan en «carpeta/heygen-ids.json») y las ya bajadas no se bajan otra vez.
 * Gasta créditos de API de HeyGen (aparte del plan de la web).
 */
export async function heygenScenes(opts: {
  scripts: string[]; looks: string[]; voiceId: string; outDir: string; title?: string; locale?: string;
  engine?: string; aspect?: '9:16' | '16:9' | '1:1'; resolution?: '720p' | '1080p'; onProgress?: (m: string) => void;
}): Promise<string[]> {
  if (!opts.scripts.length) throw new Error('Pasa al menos un texto de escena.');
  if (!opts.looks.length) throw new Error('Pasa al menos un look (de heygen_looks).');
  const say = (m: string) => { checkCancelled(); opts.onProgress?.(m); };
  await mkdir(opts.outDir, { recursive: true });
  const idsFile = path.join(opts.outDir, 'heygen-ids.json');
  const ids: Record<string, string> = await readFile(idsFile, 'utf8').then(JSON.parse).catch(() => ({}));
  const outs = opts.scripts.map((_, i) => path.join(opts.outDir, `escena${String(i + 1).padStart(2, '0')}.mp4`));
  for (const [i, text] of opts.scripts.entries()) {
    if (ids[i] || existsSync(outs[i])) continue;
    say(`Pidiendo la escena ${i + 1} de ${opts.scripts.length} a HeyGen…`);
    const body = {
      type: 'avatar', avatar_id: opts.looks[i % opts.looks.length], script: text, voice_id: opts.voiceId,
      title: `${opts.title ?? 'Axioma'} · escena ${i + 1}`, resolution: opts.resolution ?? '1080p', aspect_ratio: opts.aspect ?? '9:16',
      ...(opts.engine ? { engine: { type: opts.engine } } : {}), voice_settings: { locale: opts.locale ?? 'es-MX' },
    };
    const r = await call<{ data: { video_id: string } }>(`${API}/v3/videos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    ids[i] = r.data.video_id;
    await writeFile(idsFile, JSON.stringify(ids, null, 1));
  }
  for (let t = 0; t < 200; t++) {
    let pending = 0;
    for (const [k, id] of Object.entries(ids)) {
      const i = Number(k);
      if (existsSync(outs[i])) continue;
      const st = await videoStatus(id);
      if (st.status === 'failed') throw new Error(`HeyGen no pudo hacer la escena ${i + 1}: ${st.error ?? 'sin detalle'}`);
      if (st.status === 'completed' && st.url) { await download(st.url, outs[i]); say(`Escena ${i + 1} lista.`); continue; }
      pending++;
    }
    if (!pending) return outs;
    say(`HeyGen está haciendo ${pending} escena${pending > 1 ? 's' : ''}…`);
    await sleep(15_000);
  }
  throw new Error('HeyGen tardó demasiado (más de 50 minutos). Vuelve a llamar con la misma carpeta: retoma sin pagar de nuevo.');
}

/** Solo la voz (sin video): tu voz clonada de HeyGen leyendo un texto. Devuelve la ruta del audio. */
export async function heygenSpeech(opts: { text: string; voiceId: string; out: string; locale?: string }): Promise<string> {
  const r = await fetch(`${API}/v3/voices/speech`, {
    method: 'POST', headers: { 'X-Api-Key': await key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: opts.text, voice_id: opts.voiceId, locale: opts.locale ?? 'es-MX' }), signal: AbortSignal.timeout(180_000),
  });
  if (r.status === 402) throw new Error('Tu cuenta de HeyGen no tiene saldo de API para la voz. Recarga en app.heygen.com › Settings › API.');
  const type = r.headers.get('content-type') ?? '';
  if (!r.ok) throw new Error(`HeyGen respondió con un error (${r.status}): ${(await r.text()).slice(0, 200)}`);
  await mkdir(path.dirname(opts.out), { recursive: true });
  if (type.includes('json')) {
    const url = JSON.stringify(await r.json()).match(/https?:[^"]+/)?.[0];
    if (!url) throw new Error('HeyGen no devolvió el audio.');
    return download(url, opts.out);
  }
  await writeFile(opts.out, Buffer.from(await r.arrayBuffer()));
  return opts.out;
}
