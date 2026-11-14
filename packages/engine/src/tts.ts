import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AI_VOICES } from '@axioma/schema';
import { envValue } from './env.ts';
import { ffmpeg, run } from './exec.ts';
import { REPO_ROOT } from './paths.ts';
import { llmUnload } from './llm.ts';

export type TtsProvider = 'elevenlabs' | 'qwen' | 'piper' | 'sistema';

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
  if (await qwenModel()) out.push('qwen');
  if ((await has('piper')) && (await envValue('SE_PIPER_MODEL'))) out.push('piper');
  if (process.platform === 'darwin' || process.platform === 'win32' || (await has('espeak-ng'))) out.push('sistema');
  return out;
}

/**
 * Genera la voz en off en `out` (WAV 48 kHz). Proveedores:
 * - elevenlabs: la mejor calidad; de pago; necesita ELEVENLABS_API_KEY (y opcional ELEVENLABS_VOICE_ID) en .env.
 * - qwen: voz IA local (Qwen3-TTS), natural y con acento a elegir (QWEN_VOICES o una descripción propia); gratis; tarda más o menos lo que dura el audio.
 * - piper: local y gratis; necesita `piper` instalado y SE_PIPER_MODEL con la ruta del modelo .onnx.
 * - sistema: la voz del sistema operativo (macOS `say`, Windows SAPI). Gratis y siempre disponible, suena más robótica.
 */
export async function synthesize(text: string, out: string, opts: { provider?: TtsProvider; voice?: string; /** Palabras por minuto (solo voz del sistema). */ rate?: number } = {}): Promise<{ provider: TtsProvider; voice?: string; aviso?: string }> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('El texto de la voz en off está vacío.');
  const available = await ttsProviders();
  const provider = opts.provider ?? available[0];
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

/** Error de ElevenLabs en palabras sencillas (sin volcar su respuesta en inglés). */
function elevenError(e: unknown): string {
  const status = (e as { status?: number })?.status;
  const msg = e instanceof Error ? e.message : String(e);
  if (status === 401) return 'La clave de ElevenLabs no es válida.';
  if (status === 429 || /quota/i.test(msg)) return 'Se agotó el cupo de ElevenLabs.';
  if (!status) return 'No hay conexión con ElevenLabs.';
  return `ElevenLabs respondió ${status}.`;
}
