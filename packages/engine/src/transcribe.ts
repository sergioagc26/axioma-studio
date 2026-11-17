import { settings } from './settings.ts';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import {
  downloadWhisperModel, installWhisperCpp, toCaptions, transcribe as whisperTranscribe, type WhisperModel,
} from '@remotion/install-whisper-cpp';
import type { Transcript, Word } from '@axioma/schema';
import { WHISPER_DIR, WHISPER_MODELS, WHISPER_VERSION } from './paths.ts';

export const DEFAULT_MODEL: WhisperModel = (process.env.SE_WHISPER_MODEL as WhisperModel) ?? 'small';
/** El modelo de transcripción a usar: el de Configuración (según el computador) o el normal. */
export const whisperModel = (): WhisperModel => (process.env.SE_WHISPER_MODEL as WhisperModel) ?? settings().whisper ?? 'small';

/** Instala whisper.cpp y descarga el modelo si faltan. */
export async function ensureWhisper(model: WhisperModel = whisperModel(), log = console.log) {
  if (!existsSync(WHISPER_DIR)) log(`Instalando whisper.cpp ${WHISPER_VERSION} (solo la primera vez, tarda unos minutos)…`);
  await installWhisperCpp({ version: WHISPER_VERSION, to: WHISPER_DIR, printOutput: false });
  await mkdir(WHISPER_MODELS, { recursive: true });
  await downloadWhisperModel({ model, folder: WHISPER_MODELS, printOutput: false });
}

/** Transcribe un WAV 16 kHz mono con tiempos por palabra. */
export async function transcribeWav(
  wav: string,
  { model = whisperModel(), language = 'es', onProgress, prompt }: { model?: WhisperModel; language?: string; onProgress?: (p: number) => void; /** Palabras que Whisper debe conocer (nombres de marca: «Axioma Studio, Claude»). */ prompt?: string } = {},
): Promise<Transcript> {
  await ensureWhisper(model);
  const out = await whisperTranscribe({
    inputPath: wav,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: WHISPER_VERSION,
    model,
    modelFolder: WHISPER_MODELS,
    tokenLevelTimestamps: true,
    splitOnWord: true,
    language: language as any,
    printOutput: false,
    onProgress,
    // La atención flash (activa por defecto desde 1.8) desactiva la alineación DTW.
    additionalArgs: ['-nfa', ...(prompt?.trim() ? ['--prompt', prompt.trim().slice(0, 200)] : [])],
  });
  const { captions } = toCaptions({ whisperCppOutput: out });
  const items = captions
    .map((c) => ({ ...c, text: c.text.trim() }))
    .filter((c) => c.text && !isNoise(c.text)); // [música], *música*, (aplausos), ♪…
  // Con DTW, `timestampMs` marca cuándo suena cada palabra con mucha más precisión
  // que `startMs`. El final de una palabra es el inicio de la siguiente (luego se
  // recorta contra los silencios detectados por FFmpeg).
  const words: Word[] = items.map((c, i) => {
    const start = (c.timestampMs ?? c.startMs) / 1000;
    const next = items[i + 1];
    const nextStart = next ? (next.timestampMs ?? next.startMs) / 1000 : c.endMs / 1000;
    return {
      text: c.text,
      start,
      end: Math.max(start + 0.05, Math.min(nextStart, start + 1.2)),
      prob: typeof c.confidence === 'number' ? Math.min(1, Math.max(0, c.confidence)) : undefined,
    };
  });
  return { language, model, words };
}

/**
 * Lo que Whisper escribe cuando NO hay voz: etiquetas entre corchetes, asteriscos o paréntesis
 * («[música]», «*música*», «(aplausos)»), notas musicales o subtítulos fantasma típicos.
 */
export function isNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^[\[\(\*♪♫¶#]+.*[\]\)\*♪♫¶#]+$/.test(t) || /^[♪♫¶#\s.,!-]+$/.test(t)) return true;
  const plain = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim();
  // Una palabra suelta como «música» o «silencio» puede ser parte de lo que se dice: solo se toma
  // como ruido entre corchetes/asteriscos (arriba) o en frases fantasma de Whisper.
  return /^(blank audio|sin audio|subtitulos realizados por.*|subtitles by.*|gracias por ver|thanks for watching)$/.test(plain);
}

/**
 * ¿Hay voz de verdad? Unas pocas «palabras» sueltas en un video de música son alucinaciones de
 * Whisper: hacen falta al menos 3 palabras y 1,5 s de habla para tratarlo como video hablado.
 */
export function hasSpeech(t: Transcript | null | undefined): boolean {
  const words = (t?.words ?? []).filter((w) => !isNoise(w.text));
  const spoken = words.reduce((a, w) => a + Math.max(0, w.end - w.start), 0);
  return words.length >= 3 && spoken >= 1.5;
}

/** Texto compacto para Claude: una línea por frase con su tiempo de inicio. */
export function compactTranscript(t: Transcript): string {
  const lines: string[] = [];
  let cur: string[] = [];
  let start = 0;
  for (let i = 0; i < t.words.length; i++) {
    const w = t.words[i];
    if (!cur.length) start = w.start;
    cur.push(w.text);
    const next = t.words[i + 1];
    if (!next || /[.!?…]$/.test(w.text) || next.start - w.end > 0.7) {
      lines.push(`[${start.toFixed(2)}] ${cur.join(' ')}`);
      cur = [];
    }
  }
  return lines.join('\n');
}
