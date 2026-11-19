import { settings } from './settings.ts';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AI_VOICES } from '@axioma/schema';
import { envValue } from './env.ts';
import { ffmpeg, run } from './exec.ts';
import { REPO_ROOT } from './paths.ts';
import { llmUnload } from './llm.ts';

export type TtsProvider = 'elevenlabs' | 'fish' | 'qwen' | 'piper' | 'sistema';

/**
 * Voces de la voz IA local (Qwen3-TTS): se describen con palabras y el modelo las crea. No imitan
 * a ninguna persona real. La instrucción va en inglés porque así la entiende mejor.
 */
export const QWEN_VOICES: Record<string, { name: string; instruct: string }> = Object.fromEntries(AI_VOICES.map((v) => [v.id, { name: v.name, instruct: v.instruct }]));
const QWEN_TAIL = ' Not an imitation of any real person. Dry studio recording, no music.';
const QWEN_PY = path.join(REPO_ROOT, '.venv-qwen', 'bin', 'python');
const QWEN_CACHE = path.join(REPO_ROOT, 'workspace', 'tts-qwen', 'cache');

/** Carpeta del modelo de voz local, si está instalado (venv + modelo descargado). */
async function qwenModel(): Promise<string | null> {
  if (!existsSync(QWEN_PY)) return null;
  const snaps = path.join(QWEN_CACHE, 'hub', 'models--Qwen--Qwen3-TTS-12Hz-1.7B-VoiceDesign', 'snapshots');
  const one = existsSync(snaps) ? (await readdir(snaps)).filter((d) => !d.startsWith('.'))[0] : undefined;
  return one ? path.join(snaps, one) : null;
}

async function has(bin: string) {
  try {
    await run(process.platform === 'win32' ? 'where' : 'which', [bin]);
    return true;
  } catch {
    return false;
  }
}

/** Proveedores disponibles en este computador, del mejor al más básico. */
export async function ttsProviders(): Promise<TtsProvider[]> {
  const out: TtsProvider[] = [];
  if (await envValue('ELEVENLABS_API_KEY')) out.push('elevenlabs');
  if (await envValue('FISH_API_KEY')) out.push('fish');
  if (await qwenModel()) out.push('qwen');
  if ((await has('piper')) && (await envValue('SE_PIPER_MODEL'))) out.push('piper');
  if (process.platform === 'darwin' || process.platform === 'win32' || (await has('espeak-ng'))) out.push('sistema');
  return out;
}

/**
 * Genera la voz en off en `out` (WAV 48 kHz). Proveedores:
 * - elevenlabs: la mejor calidad; de pago; necesita ELEVENLABS_API_KEY (y opcional ELEVENLABS_VOICE_ID) en .env.
 * - fish: Fish Audio en línea (muy natural, miles de voces en español); necesita FISH_API_KEY (opcional FISH_VOICE_ID y FISH_MODEL). Sin saldo usa el modelo gratis.
 * - qwen: voz IA local (Qwen3-TTS), natural y con acento a elegir (QWEN_VOICES o una descripción propia); gratis; tarda más o menos lo que dura el audio.
 * - piper: local y gratis; necesita `piper` instalado y SE_PIPER_MODEL con la ruta del modelo .onnx.
 * - sistema: la voz del sistema operativo (macOS `say`, Windows SAPI). Gratis y siempre disponible, suena más robótica.
 */
export async function synthesize(text: string, out: string, opts: { provider?: TtsProvider; voice?: string; /** Palabras por minuto (solo voz del sistema). */ rate?: number } = {}): Promise<{ provider: TtsProvider; voice?: string; aviso?: string }> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('El texto de la voz en off está vacío.');
  const available = await ttsProviders();
  // Sin elegir: la voz por defecto de Configuración (si está disponible aquí); si no, la mejor.
  const def = settings().voz;
  const useDef = !opts.provider && def?.proveedor && available.includes(def.proveedor);
  const provider = opts.provider ?? (useDef ? def!.proveedor! : available[0]);
  if (useDef && !opts.voice && def?.voz) opts = { ...opts, voice: def.voz };
  if (!provider || !available.includes(provider)) {
    throw new Error(`La voz "${opts.provider ?? 'en off'}" no está disponible aquí. Disponibles: ${available.join(', ') || 'ninguna'}.`);
  }
  await mkdir(path.dirname(out), { recursive: true });
  const tmp = out.replace(/\.wav$/i, '') + '.tmp';
  let voice = opts.voice;
  let raw: string;

  if (provider === 'elevenlabs') {
    voice ??= (await envValue('ELEVENLABS_VOICE_ID')) ?? 'EXAVITQu4vr4xnSDxMaL';
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': (await envValue('ELEVENLABS_API_KEY'))!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, model_id: 'eleven_multilingual_v2' }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok) throw Object.assign(new Error(await r.text().catch(() => '')), { status: r.status });
      raw = `${tmp}.mp3`;
      await writeFile(raw, Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      // «La mejor disponible» no falla por ElevenLabs: se usa la siguiente voz (la del computador).
      const next = available.find((p) => p !== 'elevenlabs');
      const why = elevenError(e);
      if (!opts.provider && next) {
        const r2 = await synthesize(clean, out, { ...opts, provider: next, voice: undefined });
        return { ...r2, aviso: `${why} Usé la voz del computador.` };
      }
      throw new Error(why);
    }
  } else if (provider === 'fish') {
    voice ??= (await envValue('FISH_VOICE_ID')) ?? FISH_DEFAULT_VOICE;
    try {
      raw = `${tmp}.mp3`;
      await writeFile(raw, await fishTts(clean, voice, (await envValue('FISH_MODEL')) ?? 's2.1-pro'));
    } catch (e) {
      const why = fishError(e);
      const next = available.find((p) => p !== 'fish' && p !== 'elevenlabs');
      if (!opts.provider && next) return { ...(await synthesize(clean, out, { ...opts, provider: next, voice: undefined })), aviso: `${why} Usé otra voz.` };
      throw new Error(why);
    }
  } else if (provider === 'qwen') {
    raw = `${tmp}.wav`;
    const txt = `${tmp}.txt`;
    await writeFile(txt, clean, 'utf8');
    voice ??= 'colombiana';
    // Una voz de la lista o una descripción escrita por el usuario.
    const instruct = (QWEN_VOICES[voice]?.instruct ?? voice) + QWEN_TAIL;
    // La IA de texto suelta su memoria: los dos modelos juntos no caben en 16 GB.
    await llmUnload().catch(() => {});
    process.env.HF_HOME = QWEN_CACHE;
    try {
      await run(QWEN_PY, [path.join(REPO_ROOT, 'scripts', 'voz-qwen.py'), (await qwenModel())!, txt, raw, instruct], { quiet: true });
    } catch (e) {
      const next = available.find((p) => p !== 'qwen' && p !== 'elevenlabs');
      if (!opts.provider && next) return { ...(await synthesize(clean, out, { ...opts, provider: next, voice: undefined })), aviso: 'La voz IA local falló: usé la voz del computador.' };
      throw new Error('La voz IA local no pudo generar el audio (¿poca memoria libre?). Cierra otras apps e inténtalo de nuevo.');
    } finally {
      await rm(txt, { force: true });
    }
    // Las pausas largas que a veces deja el modelo se acortan (el ritmo queda de anuncio).
    if (existsSync(raw)) {
      const tight = `${tmp}.t.wav`;
      await ffmpeg(['-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,silenceremove=stop_periods=-1:stop_duration=0.45:stop_threshold=-34dB:stop_silence=0.35', tight]);
      await rm(raw, { force: true });
      raw = tight;
    }
  } else if (provider === 'piper') {
    raw = `${tmp}.wav`;
    const txt = `${tmp}.txt`;
    await writeFile(txt, clean);
    await run('piper', ['--model', voice ?? (await envValue('SE_PIPER_MODEL'))!, '--input_file', txt, '--output_file', raw]);
    await rm(txt, { force: true });
  } else if (process.platform === 'darwin') {
    voice ??= 'Paulina';
    raw = `${tmp}.aiff`;
    await run('say', ['-v', voice, '-r', String(Math.round(opts.rate ?? 185)), '-o', raw, clean]);
  } else if (process.platform === 'win32') {
    raw = `${tmp}.wav`;
    const txt = `${tmp}.txt`;
    await writeFile(txt, clean, 'utf8');
    // Las rutas viajan por variables de entorno para no interpolar texto en el comando.
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      'if ($env:SE_TTS_VOICE) { $s.SelectVoice($env:SE_TTS_VOICE) } else { $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "es-*" } | Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) } }',
      '$s.SetOutputToWaveFile($env:SE_TTS_OUT)',
      '$s.Speak([System.IO.File]::ReadAllText($env:SE_TTS_IN, [System.Text.Encoding]::UTF8))',
      '$s.Dispose()',
    ].join('; ');
    process.env.SE_TTS_OUT = raw;
    process.env.SE_TTS_IN = txt;
    if (voice) process.env.SE_TTS_VOICE = voice; else delete process.env.SE_TTS_VOICE;
    await run('powershell', ['-NoProfile', '-Command', script]);
    await rm(txt, { force: true });
  } else {
    raw = `${tmp}.wav`;
    await run('espeak-ng', ['-v', voice ?? 'es-419', '-s', '165', '-w', raw, clean]);
  }

  if (!existsSync(raw)) throw new Error('No se generó el audio de la voz en off.');
  // Mismo tratamiento que la voz grabada: 48 kHz y -16 LUFS.
  await ffmpeg(['-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', out]);
  await rm(raw, { force: true });
  return { provider, voice };
}

/** Voz de Fish Audio por defecto: locutor masculino, grave y serio, en español. */
export const FISH_DEFAULT_VOICE = '3f45a7fd7a614655a61eb7027b955783';

/** Pide el audio a Fish Audio (MP3). Sin saldo (402) prueba con el modelo gratis. */
async function fishTts(text: string, voice: string, model: string): Promise<Buffer> {
  const key = (await envValue('FISH_API_KEY'))!;
  const call = async (m: string) => {
    const r = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: m },
      body: JSON.stringify({ text, reference_id: voice || undefined, format: 'mp3', mp3_bitrate: 192, normalize: true, latency: 'normal' }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) throw Object.assign(new Error(await r.text().catch(() => '')), { status: r.status });
    return Buffer.from(await r.arrayBuffer());
  };
  try {
    return await call(model);
  } catch (e) {
    if ((e as { status?: number }).status === 402 && model !== 's2.1-pro-free') return call('s2.1-pro-free');
    throw e;
  }
}

/** Error de Fish Audio en palabras sencillas. */
export function fishError(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 401 || status === 403) return 'La clave de Fish Audio no es válida.';
  if (status === 402) return 'La cuenta de Fish Audio no tiene saldo.';
  if (status === 404) return 'Esa voz de Fish Audio no existe.';
  if (status === 429) return 'Fish Audio está limitando las peticiones: espera un momento.';
  if (!status) return 'No hay conexión con Fish Audio.';
  return `Fish Audio respondió ${status}.`;
}

/** Voces de Fish Audio para elegir: las tuyas y algunas públicas en español (sin imitaciones de famosos). */
async function fishVoices(): Promise<VoiceOption[]> {
  const out: VoiceOption[] = [];
  const key = await envValue('FISH_API_KEY');
  type M = { _id: string; title: string; tags?: string[] };
  const get = async (q: string, auth: boolean) => {
    const r = await fetch(`https://api.fish.audio/model?${q}`, { headers: auth && key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(10_000) });
    return r.ok ? (((await r.json()) as { items?: M[] }).items ?? []) : [];
  };
  try {
    for (const m of await get('self=true&page_size=50', true)) out.push({ provider: 'fish', voice: m._id, name: `${m.title} (tuya)`, note: 'Tu voz de Fish Audio' });
  } catch { /* sin conexión */ }
  out.push({ provider: 'fish', voice: FISH_DEFAULT_VOICE, name: 'Locutor grave y serio (Fish)', gender: 'm' });
  try {
    for (const g of ['male', 'female'] as const) {
      const items = (await get(`language=es&page_size=20&sort_by=score&tag=${g}`, false)).filter((m) => m._id !== FISH_DEFAULT_VOICE && !looksLikeImitation(m));
      for (const m of items.slice(0, 6)) out.push({ provider: 'fish', voice: m._id, name: `${m.title.trim()} (Fish)`, gender: g === 'male' ? 'm' : 'f', note: (m.tags ?? []).filter((t) => !/^(male|female|spanish)$/i.test(t)).slice(0, 4).join(', ') });
    }
  } catch { /* sin conexión: solo las tuyas y la de por defecto */ }
  return out;
}

/** Descarta voces públicas que imitan a una persona o personaje conocido. */
export function looksLikeImitation(m: { title: string; tags?: string[] }): boolean {
  const tags = (m.tags ?? []).map((t) => t.toLowerCase());
  if (tags.some((t) => /character|anime|celebrity|famous|parody|meme|cartoon/.test(t))) return true;
  // Etiquetas con mayúscula y varias palabras suelen ser nombres propios (p. ej. «Mario Castañeda»).
  if ((m.tags ?? []).some((t) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+$/.test(t) && !/latin|american|spanish|español/i.test(t))) return true;
  return /\(.*\)/.test(m.title);
}

/** Error de ElevenLabs en palabras sencillas (sin volcar su respuesta en inglés). */
function elevenError(e: unknown): string {
  const status = (e as { status?: number })?.status;
  const msg = e instanceof Error ? e.message : String(e);
  if (status === 401) return 'La clave de ElevenLabs no es válida.';
  if (status === 429 || /quota/i.test(msg)) return 'Se agotó el cupo de ElevenLabs.';
  if (!status) return 'No hay conexión con ElevenLabs.';
  return `ElevenLabs respondió ${status}.`;
}

/** Una voz que se puede elegir: proveedor, id de la voz y cómo suena. */
export interface VoiceOption { provider: TtsProvider; voice?: string; name: string; gender?: 'f' | 'm'; note?: string }

/** Voces prediseñadas de ElevenLabs (multilingües: hablan español con el modelo multilingual v2). */
export const ELEVEN_PREMADE: VoiceOption[] = [
  { provider: 'elevenlabs', voice: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (cálida, joven)', gender: 'f' },
  { provider: 'elevenlabs', voice: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (alegre, rápida)', gender: 'f' },
  { provider: 'elevenlabs', voice: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice (clara, segura)', gender: 'f' },
  { provider: 'elevenlabs', voice: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda (amable, narradora)', gender: 'f' },
  { provider: 'elevenlabs', voice: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica (expresiva, juvenil)', gender: 'f' },
  { provider: 'elevenlabs', voice: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (suave, elegante)', gender: 'f' },
  { provider: 'elevenlabs', voice: 'nPczCjzI2devNBz1zQrb', name: 'Brian (profunda, cercana)', gender: 'm' },
  { provider: 'elevenlabs', voice: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (seria, de noticiero)', gender: 'm' },
  { provider: 'elevenlabs', voice: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (cálida, madura)', gender: 'm' },
  { provider: 'elevenlabs', voice: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (enérgica, joven)', gender: 'm' },
  { provider: 'elevenlabs', voice: 'iP95p4xoKVk53GoZ742B', name: 'Chris (relajada, natural)', gender: 'm' },
  { provider: 'elevenlabs', voice: 'cjVigY5qzO86Huf0OWal', name: 'Eric (amable, confiable)', gender: 'm' },
];

/**
 * Todas las voces que se pueden usar en este computador: las de ElevenLabs (las prediseñadas y,
 * si la clave lo permite, las tuyas y tus clones), las locales con acento (gratis) y la del sistema.
 */
export async function voiceCatalog(): Promise<VoiceOption[]> {
  const providers = await ttsProviders();
  const out: VoiceOption[] = [];
  if (providers.includes('elevenlabs')) {
    // Tus voces (clones y de la biblioteca): necesita el permiso «voices_read» en la clave.
    try {
      const r = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100&voice_type=personal', { headers: { 'xi-api-key': (await envValue('ELEVENLABS_API_KEY'))! }, signal: AbortSignal.timeout(10_000) });
      if (r.ok) for (const v of ((await r.json()) as { voices?: { voice_id: string; name: string }[] }).voices ?? []) out.push({ provider: 'elevenlabs', voice: v.voice_id, name: `${v.name} (tuya)`, note: 'Tu voz de ElevenLabs' });
    } catch { /* sin permiso o sin conexión: solo las prediseñadas */ }
    out.push(...ELEVEN_PREMADE);
  }
  if (providers.includes('fish')) out.push(...(await fishVoices()));
  if (providers.includes('qwen')) for (const v of AI_VOICES) out.push({ provider: 'qwen', voice: v.id, name: `${v.name} (local, gratis)`, gender: /mujer/i.test(v.name) ? 'f' : 'm' });
  if (providers.includes('sistema')) out.push({ provider: 'sistema', name: 'Voz del computador (gratis, más robótica)' });
  return out;
}
