import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { envValue } from './env.ts';
import { ffmpeg, run } from './exec.ts';

export type TtsProvider = 'elevenlabs' | 'piper' | 'sistema';

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
  if ((await has('piper')) && (await envValue('SE_PIPER_MODEL'))) out.push('piper');
  if (process.platform === 'darwin' || process.platform === 'win32' || (await has('espeak-ng'))) out.push('sistema');
  return out;
}

/**
 * Genera la voz en off en `out` (WAV 48 kHz). Proveedores:
 * - elevenlabs: la mejor calidad; de pago; necesita ELEVENLABS_API_KEY (y opcional ELEVENLABS_VOICE_ID) en .env.
 * - piper: local y gratis; necesita `piper` instalado y SE_PIPER_MODEL con la ruta del modelo .onnx.
 * - sistema: la voz del sistema operativo (macOS `say`, Windows SAPI). Gratis y siempre disponible, suena más robótica.
 */
export async function synthesize(text: string, out: string, opts: { provider?: TtsProvider; voice?: string } = {}): Promise<{ provider: TtsProvider; voice?: string }> {
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
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': (await envValue('ELEVENLABS_API_KEY'))!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean, model_id: 'eleven_multilingual_v2' }),
    });
    if (!r.ok) throw new Error(`ElevenLabs respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
    raw = `${tmp}.mp3`;
    await writeFile(raw, Buffer.from(await r.arrayBuffer()));
  } else if (provider === 'piper') {
    raw = `${tmp}.wav`;
    const txt = `${tmp}.txt`;
    await writeFile(txt, clean);
    await run('piper', ['--model', voice ?? (await envValue('SE_PIPER_MODEL'))!, '--input_file', txt, '--output_file', raw]);
    await rm(txt, { force: true });
  } else if (process.platform === 'darwin') {
    voice ??= 'Paulina';
    raw = `${tmp}.aiff`;
    await run('say', ['-v', voice, '-r', '185', '-o', raw, clean]);
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
