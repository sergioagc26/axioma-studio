import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from './exec.ts';
import { WORKSPACE } from './paths.ts';
import { readKit } from './kit.ts';
import { llmJson, llmReady, visionJson, visionReady } from './llm.ts';
import { extractWav16k } from './media.ts';
import { hasSpeech, transcribeWav } from './transcribe.ts';
import type { ReferenceReport } from './reference.ts';

/**
 * Referencias desde un link (Instagram, TikTok, YouTube, Facebook…): se baja el video con yt-dlp
 * solo para analizarlo en este computador (no se guarda ni se publica), con su texto y sus números.
 */
export type RefSource = NonNullable<ReferenceReport['source']>;

const YTDLP = process.env.SE_YTDLP ?? 'yt-dlp';

/**
 * Sesión de Instagram para leer perfiles y reels que piden iniciar sesión. Apagada por defecto.
 * - navegador: la sesión abierta en un navegador de ESTE computador (Chrome, Safari, Firefox, Brave, Edge).
 * - archivo: un archivo de cookies exportado del navegador (formato cookies.txt), para cuando la
 *   sesión está en otro computador. Se guarda solo para el dueño y nunca se devuelve.
 * Todo queda en este computador: la sesión solo se usa para bajar los videos que pidas.
 */
export const IG_BROWSERS = ['chrome', 'safari', 'firefox', 'brave', 'edge'] as const;
export type IgSessionMode = 'apagado' | 'archivo' | (typeof IG_BROWSERS)[number];
const IG_SETTINGS = path.join(WORKSPACE, 'ajustes-instagram.json');
const IG_COOKIES = path.join(WORKSPACE, '.instagram-cookies.txt');

export async function igSession(): Promise<{ mode: IgSessionMode; hasFile: boolean }> {
  let mode: IgSessionMode = 'apagado';
  try { mode = (JSON.parse(await readFile(IG_SETTINGS, 'utf8')) as { mode: IgSessionMode }).mode ?? 'apagado'; } catch { /* sin ajustes */ }
  return { mode, hasFile: existsSync(IG_COOKIES) };
}

export async function setIgSession(mode: IgSessionMode): Promise<{ mode: IgSessionMode; hasFile: boolean }> {
  if (mode !== 'apagado' && mode !== 'archivo' && !(IG_BROWSERS as readonly string[]).includes(mode)) throw new Error('Esa opción no existe.');
  if (mode === 'archivo' && !existsSync(IG_COOKIES)) throw new Error('Primero sube el archivo de tu sesión.');
  await mkdir(WORKSPACE, { recursive: true });
  await writeFile(IG_SETTINGS, JSON.stringify({ mode }, null, 2));
  return igSession();
}

/** Guarda el archivo de cookies (solo las de Instagram, solo legible por el dueño). */
export async function saveIgCookies(text: string): Promise<{ mode: IgSessionMode; hasFile: boolean }> {
  const lines = text.replace(/\r/g, '').split('\n');
  const ig = lines.filter((l) => /^(#HttpOnly_)?\.?(www\.)?instagram\.com\t/.test(l));
  if (!ig.length) throw new Error('Ese archivo no trae cookies de Instagram. Expórtalo con la página de Instagram abierta y la sesión iniciada (formato cookies.txt).');
  if (!ig.some((l) => /\tsessionid\t/.test(l))) throw new Error('El archivo no trae la sesión de Instagram (falta «sessionid»): inicia sesión en instagram.com y vuelve a exportarlo.');
  await mkdir(WORKSPACE, { recursive: true });
  await writeFile(IG_COOKIES, `# Netscape HTTP Cookie File\n${ig.join('\n')}\n`, { mode: 0o600 });
  await chmod(IG_COOKIES, 0o600).catch(() => {});
  return setIgSession('archivo');
}

export async function removeIgCookies(): Promise<{ mode: IgSessionMode; hasFile: boolean }> {
  await rm(IG_COOKIES, { force: true });
  const s = await igSession();
  return s.mode === 'archivo' ? setIgSession('apagado') : s;
}

/** Lo que se le pasa a yt-dlp para usar la sesión (solo con links de Instagram). */
async function igAuthArgs(platform: string): Promise<string[]> {
  if (platform !== 'instagram') return [];
  const { mode, hasFile } = await igSession();
  if (mode === 'archivo') return hasFile ? ['--cookies', IG_COOKIES] : [];
  return mode === 'apagado' ? [] : ['--cookies-from-browser', mode];
}

/** Qué tipo de link es: un video suelto, un perfil o algo que no sirve. */
export function linkKind(raw: string): { url: string; platform: string; profile: boolean } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  const platform = /instagram\.com$/.test(host) ? 'instagram' : /tiktok\.com$/.test(host) ? 'tiktok' : /(youtube\.com|youtu\.be)$/.test(host) ? 'youtube'
    : /(facebook\.com|fb\.watch)$/.test(host) ? 'facebook' : /(x\.com|twitter\.com)$/.test(host) ? 'x' : 'web';
  const profile = platform === 'instagram' ? parts.length === 1 && !['reel', 'reels', 'p', 'tv', 'stories'].includes(parts[0])
    : platform === 'tiktok' ? parts.length === 1 && parts[0].startsWith('@')
    : platform === 'youtube' ? (parts[0]?.startsWith('@') && parts.length <= 2) : false;
  return { url: u.toString(), platform, profile };
}

/** Mensaje claro cuando yt-dlp no puede bajar el video. */
function downloadError(e: unknown, platform: string, profile: boolean, withSession = false): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Operation not permitted.*Cookies|Cookies\.binarycookies/i.test(msg)) return new Error('macOS no deja leer la sesión de Safari. En Ajustes del Sistema › Privacidad y seguridad › Acceso total al disco, activa la app con la que abres Axioma (Terminal), o usa Chrome o el archivo de sesión.');
  if (/could not find .*cookies database|failed to load cookies|no such file.*Cookies/i.test(msg)) return new Error('En este computador ese navegador no tiene una sesión abierta. Inicia sesión en Instagram en ese navegador, o sube el archivo de tu sesión.');
  if (/keyring|keychain|Safe Storage|decrypt/i.test(msg)) return new Error('El Mac pidió permiso para leer la sesión de Chrome: en el aviso del llavero pulsa «Permitir siempre» y vuelve a intentarlo.');
  if (/ENOENT|No se pudo ejecutar/.test(msg)) return new Error('Falta el programa que baja videos desde un link (yt-dlp). En Mac: brew install yt-dlp. Mientras tanto, sube el archivo del video.');
  if (/login|log in|cookies|private|rate-limit|requested content is not available/i.test(msg) || (profile && /Unable to extract/i.test(msg))) {
    // Con la sesión activada: Instagram no la aceptó (venció, se cerró o pidió verificar la cuenta).
    if (withSession && platform === 'instagram') return new Error('Instagram no aceptó tu sesión: puede que se haya cerrado o vencido, o que Instagram pida verificar la cuenta. Abre instagram.com, confirma que entras bien y vuelve a exportar el archivo (o vuelve a iniciar sesión en ese navegador).');
    return new Error(platform === 'instagram' && profile
      ? 'Instagram no deja ver los perfiles sin iniciar sesión. Activa «Usar mi sesión de Instagram» (arriba) o pega el link de cada reel (Compartir › Copiar enlace).'
      : 'Esa red pidió iniciar sesión o el video es privado. Prueba con el link de un video público, o descárgalo y súbelo.');
  }
  if (/Unsupported URL|is not a valid URL/i.test(msg)) return new Error('Ese link no es de un video que la app sepa bajar. Pega el link de un reel, TikTok o Short.');
  if (/File is larger than max-filesize/i.test(msg)) return new Error('El video es demasiado grande para usarlo de referencia (más de 300 MB).');
  return new Error(`No pude bajar el video del link. ${msg.split('\n').find((l) => /ERROR/.test(l))?.replace(/^.*ERROR:\s*/, '').slice(0, 160) ?? ''}`.trim());
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Baja un video desde su link a `tmp` y devuelve el archivo con lo que dice la publicación. */
export async function downloadReference(url: string, tmp: string): Promise<{ file: string; source: RefSource }> {
  const kind = linkKind(url);
  if (!kind) throw new Error('Pega un link completo, que empiece por https://');
  if (kind.profile) throw new Error('Es el link de un perfil: usa «Analizar perfil» o pega el link de un video.');
  await mkdir(tmp, { recursive: true });
  try {
    await run(YTDLP, [
      '--no-playlist', '--no-warnings', '--no-progress', '--max-filesize', '300M',
      '-f', 'bv*[height<=1920][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b', '--merge-output-format', 'mp4',
      '--write-info-json', '-o', path.join(tmp, 'ref.%(ext)s'), ...(await igAuthArgs(kind.platform)), kind.url,
    ], { quiet: true });
  } catch (e) { throw downloadError(e, kind.platform, false, (await igAuthArgs(kind.platform)).length > 0); }
  const files = await readdir(tmp);
  const video = files.find((f) => /^ref\.(mp4|mov|webm|mkv)$/i.test(f));
  if (!video) throw new Error('El link no tenía un video (¿es una foto o un carrusel?). Pega el link de un reel o video.');
  const info = files.includes('ref.info.json') ? JSON.parse(await readFile(path.join(tmp, 'ref.info.json'), 'utf8')) : {};
  return {
    file: path.join(tmp, video),
    source: {
      url: info.webpage_url ?? kind.url, platform: kind.platform,
      author: info.uploader ?? info.channel ?? info.uploader_id ?? undefined,
      caption: String(info.description ?? info.title ?? '').slice(0, 2200) || undefined,
      views: num(info.view_count), likes: num(info.like_count), comments: num(info.comment_count),
      date: typeof info.upload_date === 'string' ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}` : undefined,
    },
  };
}

/** Los últimos videos de un perfil (sus links), para analizarlos uno por uno. */
export async function profileVideos(url: string, max = 5): Promise<string[]> {
  const kind = linkKind(url);
  if (!kind?.profile) throw new Error('Ese link no es de un perfil.');
  try {
    const { stdout } = await run(YTDLP, ['--flat-playlist', '--playlist-end', String(max), '--no-warnings', '--print', '%(webpage_url)s', ...(await igAuthArgs(kind.platform)), kind.url], { quiet: true });
    const links = stdout.split('\n').map((l) => l.trim()).filter((l) => /^https?:/.test(l)).slice(0, max);
    if (!links.length) throw new Error('login');
    return links;
  } catch (e) { throw downloadError(e, kind.platform, true, (await igAuthArgs(kind.platform)).length > 0); }
}

/** Qué copiar de la referencia, según lo que pidió el usuario (si no dijo nada, todo el estilo). */
export function copyFromWish(wish?: string): NonNullable<ReferenceReport['copy']> {
  const w = (wish ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const all = { ritmo: true, subtitulos: true, color: true, musica: true, transiciones: true, estructura: true };
  if (!w.trim()) return all;
  const KEYS: Record<keyof typeof all, RegExp> = {
    ritmo: /ritmo|corte|velocidad|rapid|dinamic|edicion|montaje/,
    subtitulos: /subtitul|letra|tipograf|fuente|texto|caption/,
    color: /color|tono|filtro|luz|look|estetica|paleta/,
    musica: /music|cancion|audio|sonido|beat/,
    transiciones: /transici|efecto|destello|zoom|movimiento/,
    estructura: /estructura|guion|historia|gancho|hook|enganch|inicio|empieza|formato|idea|narrativ|como cuenta|orden|cierre|final/,
  };
  // Cada frase por separado: «me gusta el ritmo, pero el color no» copia el ritmo y no el color.
  const parts = w.split(/[.;,\n]|\bpero\b|\by\s+no\b|\bmenos\b/).map((x) => x.trim()).filter(Boolean);
  const neg = (t: string) => /\bno\b|\bnada\b|\bsin\b|\bevita|\bquita|no me (gusta|interesa)|\bfeo|\bodio/.test(t);
  const yes = { ritmo: false, subtitulos: false, color: false, musica: false, transiciones: false, estructura: false };
  const no = { ...yes };
  for (const part of parts) for (const k of Object.keys(KEYS) as (keyof typeof all)[]) if (KEYS[k].test(part)) (neg(part) ? no : yes)[k] = true;
  // «Todo» o «el estilo» sin nombrar nada: todo, menos lo que se rechazó.
  const anyYes = Object.values(yes).some(Boolean);
  const everything = /\btodo\b|completo|igualit|mismo estilo|el estilo/.test(w) && !/\bsolo\b|unicamente|nada mas/.test(w);
  const base = anyYes && !everything ? yes : { ...all };
  for (const k of Object.keys(no) as (keyof typeof all)[]) if (no[k]) base[k] = false;
  return base;
}

/** Qué dice la persona del video (si habla), con Whisper, local. */
async function spoken(file: string, tmp: string): Promise<string | undefined> {
  const wav = path.join(tmp, 'voz16k.wav');
  try {
    await extractWav16k(file, wav);
    const t = await transcribeWav(wav);
    return hasSpeech(t) ? t.words.map((w) => w.text).join(' ').slice(0, 3000) : undefined;
  } catch { return undefined; } finally { await rm(wav, { force: true }); }
}

/** Qué se ve, en pocas frases, con el modelo de visión local (si está). */
async function seen(frames: string[]): Promise<string | undefined> {
  if (!(await visionReady())) return undefined;
  const pick = [frames[0], frames[Math.floor(frames.length / 2)], frames[frames.length - 1]].filter(Boolean);
  try {
    const r = await visionJson<{ descripcion: string }>('Describes fotogramas de un video corto de redes sociales. Di en español, en 2 o 3 frases, qué se ve: quién o qué aparece, dónde, qué pasa y qué textos hay en pantalla. Sin inventar. Responde solo JSON.',
      'Tres fotogramas del inicio, el medio y el final del mismo video.', pick, { type: 'object', properties: { descripcion: { type: 'string' } }, required: ['descripcion'] }, { timeoutMs: 180_000 });
    return r.descripcion?.trim() || undefined;
  } catch { return undefined; }
}

/**
 * Entiende la referencia: de qué trata, cómo engancha, cómo está armada, por qué funciona y qué se
 * podría mejorar, y cómo llevarla a la marca del cliente respetando lo que pidió. IA local.
 */
export async function understandReference(file: string, report: ReferenceReport, dir: string, opts: { brand?: string; wish?: string; /** Lo que se sabe del cliente (brief, notas): para adaptar las ideas a su marca. */ context?: string; onStep?: (m: string) => void } = {}): Promise<Pick<ReferenceReport, 'transcript' | 'visual' | 'understanding'>> {
  const say = opts.onStep ?? (() => {});
  const tmp = path.join(dir, 'tmp-entender');
  await mkdir(tmp, { recursive: true });
  try {
    say('Escuchando lo que se dice…');
    const transcript = await spoken(file, tmp);
    say('Mirando qué pasa en el video…');
    const visual = await seen(report.frames.map((f) => path.join(dir, f)));
    if (!(await llmReady())) return { transcript, visual };
    say('Entendiendo de qué trata y por qué funciona…');
    const s = report.source;
    const kit = opts.brand ? await readKit(opts.brand).catch(() => null) : null;
    const facts = [
      `Duración ${report.duration.toFixed(0)} s, ${report.cuts.length} cortes (uno cada ${report.avgShot.toFixed(1)} s), música ${report.bpm ? `${report.bpm} bpm` : 'sin pulso claro'}, ${report.captions ? `subtítulos al ${Math.round(report.captions.y * 100)} % de alto, ${report.captions.wordsPerLine} palabras a la vez` : 'sin subtítulos detectados'}, ${report.flashes ? 'con destellos' : 'sin destellos'}.`,
      s?.platform ? `Publicado en ${s.platform}${s.author ? ` por ${s.author}` : ''}${s.date ? ` el ${s.date}` : ''}.` : '',
      s?.views != null || s?.likes != null ? `Números: ${s.views != null ? `${s.views} vistas` : ''}${s.likes != null ? `, ${s.likes} me gusta` : ''}${s.comments != null ? `, ${s.comments} comentarios` : ''}.` : '',
      s?.caption ? `Texto de la publicación: «${s.caption.slice(0, 900)}»` : '',
      transcript ? `Lo que se dice en el video: «${transcript.slice(0, 1800)}»` : 'En el video no se habla (o solo hay música).',
      visual ? `Lo que se ve: ${visual}` : '',
    ].filter(Boolean).join('\n');
    const who = [kit?.name ? `La marca del cliente es «${kit.name}»${kit.sector ? ` (${kit.sector})` : ''}.` : opts.brand ? `El cliente es «${opts.brand}».` : 'No se sabe la marca del cliente.', opts.context ? `Lo que se sabe del cliente: ${opts.context}` : ''].filter(Boolean).join(' ');
    const understanding = await llmJson<NonNullable<ReferenceReport['understanding']>>(
      `Eres estratega de contenido y editor de videos cortos (reels, TikTok, shorts). Analizas un video de referencia que le gustó a un cliente. Escribe en español claro y concreto, sin relleno, para alguien que no sabe editar.
- «tema»: de qué trata, en una frase.
- «formato»: qué tipo de video es (persona hablando a cámara, montaje de tomas, tutorial, antes y después, humor, testimonio, receta, detrás de cámaras…).
- «gancho»: qué pasa en los primeros 3 segundos y por qué detiene el scroll (o por qué no).
- «estructura»: las partes en orden, cada una con su segundo aproximado y qué pasa.
- «porQueFunciona»: 3 a 5 razones concretas (ritmo, emoción, curiosidad, prueba, humor…), basadas en lo que se ve, se dice y en sus números si los hay.
- «sugerencias»: 3 a 6 mejoras que harían el video aún mejor (optimización): gancho, duración, subtítulos, llamada a la acción, ritmo, texto de la publicación, hashtags. Concretas y accionables.
- «paraTuVideo»: 3 a 5 ideas para hacer un video propio inspirado en este, para la marca del cliente, respetando lo que el cliente pidió. Nunca copiar el contenido, las frases ni la marca de otros: solo la forma. En «paraTuVideo» nunca nombres la marca, tienda o persona del video de referencia: habla de los productos y la marca del cliente.
No inventes datos: si algo no se puede saber, dilo. Responde solo JSON.`,
      `${who}\n${opts.wish ? `Lo que el cliente quiere de esta referencia: «${opts.wish}»\n` : ''}\nDatos del video:\n${facts}`,
      { type: 'object', properties: {
        tema: { type: 'string' }, formato: { type: 'string' }, gancho: { type: 'string' },
        estructura: { type: 'array', items: { type: 'object', properties: { segundo: { type: 'number' }, parte: { type: 'string' }, que: { type: 'string' } }, required: ['segundo', 'parte', 'que'] } },
        porQueFunciona: { type: 'array', items: { type: 'string' } }, sugerencias: { type: 'array', items: { type: 'string' } }, paraTuVideo: { type: 'array', items: { type: 'string' } },
      }, required: ['tema', 'formato', 'gancho', 'estructura', 'porQueFunciona', 'sugerencias', 'paraTuVideo'] },
      { temperature: 0.4, timeoutMs: 300_000, think: true },
    ).catch(() => undefined);
    return { transcript, visual, understanding };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Texto dictado: un audio grabado en el navegador pasa a texto con Whisper (local). */
export async function dictate(audio: string): Promise<string> {
  const wav = audio.replace(/\.[^.]+$/, '') + '.16k.wav';
  try {
    await extractWav16k(audio, wav);
    const t = await transcribeWav(wav);
    return t.words.map((w) => w.text).join(' ').replace(/\s+([.,;:!?])/g, '$1').trim();
  } finally {
    if (existsSync(wav)) await rm(wav, { force: true });
  }
}

export async function saveReport(dir: string, report: ReferenceReport) {
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
}
