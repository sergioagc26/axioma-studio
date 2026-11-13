import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildTimeline, type Project, type Transcript } from '@axioma/schema';
import { cloneProjectFiles } from './clips.ts';
import { ffmpeg } from './exec.ts';
import { llmJson, llmReady } from './llm.ts';
import { mediaDuration } from './media.ts';
import { P } from './paths.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { synthesize, ttsProviders, type TtsProvider } from './tts.ts';

/**
 * Doblaje a otro idioma, sin sincronía de labios: se traduce lo que se dice frase por frase
 * (IA local), se genera la voz de cada frase y se ajusta su velocidad para que entre en el
 * mismo momento del reel. Se crea una copia del proyecto; la versión original no se toca.
 */

export const DUB_LANGUAGES: Record<string, { name: string; english: string; voice: string }> = {
  en: { name: 'inglés', english: 'English', voice: 'Samantha' },
  pt: { name: 'portugués', english: 'Brazilian Portuguese', voice: 'Luciana' },
  fr: { name: 'francés', english: 'French', voice: 'Thomas' },
  it: { name: 'italiano', english: 'Italian', voice: 'Alice' },
  de: { name: 'alemán', english: 'German', voice: 'Anna' },
};

const RATE = 48_000;
/** Lo más rápido que se acelera una frase para que entre en su espacio (más suena atropellado). */
export const MAX_TEMPO = 1.35;

export interface DubLine { start: number; end: number; text: string }

/** Frases del reel ya editado, en tiempo de salida (después de cortes, adelanto y transiciones). */
export function outputSentences(project: Project, t: Transcript): DubLine[] {
  const tl = buildTimeline(project, t, { video: '' });
  const fps = tl.fps;
  const out: DubLine[] = [];
  let cur: typeof tl.words = [];
  const flush = () => {
    if (cur.length) out.push({ start: cur[0].startFrame / fps, end: cur[cur.length - 1].endFrame / fps, text: cur.map((w) => w.text).join(' ').trim() });
    cur = [];
  };
  tl.words.forEach((w, i) => {
    cur.push(w);
    const next = tl.words[i + 1];
    // Frases largas se parten en una coma, nunca a mitad de una idea.
    if (/[.!?…]$/.test(w.text) || !next || (next.startFrame - w.endFrame) / fps > 0.6 || (cur.length >= 14 && /[,;:]$/.test(w.text)) || cur.length >= 30) flush();
  });
  // Un pedazo de 1–2 palabras se une a la frase anterior si van seguidas.
  const merged: DubLine[] = [];
  for (const l of out.filter((x) => x.text)) {
    const prev = merged[merged.length - 1];
    if (prev && l.text.split(/\s+/).length <= 2 && l.start - prev.end < 0.4) Object.assign(prev, { end: l.end, text: `${prev.text} ${l.text}` });
    else merged.push(l);
  }
  return merged;
}

/**
 * Dónde va cada frase doblada: en su momento original; si la anterior se alargó, justo
 * después. Devuelve el inicio y la velocidad (tempo ≥ 1) de cada una.
 */
export function placeLines(lines: { start: number; nextStart: number; duration: number }[], total: number): { at: number; tempo: number }[] {
  let prevEnd = Number.NEGATIVE_INFINITY;
  return lines.map((l) => {
    const at = Math.max(l.start, prevEnd + 0.05);
    const room = Math.max(0.3, Math.min(l.nextStart, total) - at - 0.08);
    const tempo = Math.min(MAX_TEMPO, Math.max(1, l.duration / room));
    prevEnd = at + l.duration / tempo;
    return { at, tempo };
  });
}

/** Palabras con tiempos para los subtítulos: se reparten en la duración real de cada frase. */
export function spreadWords(text: string, at: number, duration: number): Transcript['words'] {
  const words = text.split(/\s+/).filter(Boolean);
  const weight = words.map((w) => w.length + 2);
  const sum = weight.reduce((a, b) => a + b, 0) || 1;
  let t = at;
  return words.map((w, i) => {
    const d = (duration * weight[i]) / sum;
    const word = { text: w, start: +t.toFixed(3), end: +(t + d * 0.92).toFixed(3) };
    t += d;
    return word;
  });
}

/** Traduce frases sueltas (en orden) con la IA local, en tandas. */
export async function translateLines(lines: string[], lang: string): Promise<string[]> {
  const target = DUB_LANGUAGES[lang].english;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 18) {
    const chunk = lines.slice(i, i + 18);
    const r = await llmJson<{ lineas: string[] }>(
      `You translate Spanish video speech into natural spoken ${target} for dubbing. Translate each line separately, keeping the same meaning, tone and roughly the same length (shorter is better than longer). Keep numbers, names and brands. Return exactly ${chunk.length} lines in the same order. Reply only JSON.`,
      JSON.stringify({ lineas: chunk }),
      { type: 'object', properties: { lineas: { type: 'array', items: { type: 'string' }, minItems: chunk.length, maxItems: chunk.length } }, required: ['lineas'] },
      { temperature: 0.2, timeoutMs: 240_000 },
    );
    if (!Array.isArray(r.lineas) || r.lineas.length !== chunk.length) throw new Error('La IA local devolvió una traducción incompleta. Inténtalo de nuevo.');
    out.push(...r.lineas.map((x, k) => String(x ?? '').trim() || chunk[k]));
  }
  return out;
}

/** Crea una copia del reel doblada al idioma `lang`. Devuelve la carpeta y el id del nuevo proyecto. */
export async function dubProject(dir: string, lang: string, opts: { provider?: TtsProvider; voice?: string; onProgress?: (msg: string, p?: number) => void } = {}) {
  const L = DUB_LANGUAGES[lang];
  if (!L) throw new Error(`Idioma no disponible: ${lang}. Opciones: ${Object.values(DUB_LANGUAGES).map((x) => x.name).join(', ')}.`);
  if (!(await llmReady())) throw new Error('Para traducir hace falta la IA local (Ollama con qwen3). Ábrela y vuelve a intentarlo.');
  const src = await readProject(dir);
  const t = await readTranscript(dir);
  if (!t?.words.length) throw new Error('Este reel no tiene voz transcrita: no hay nada que doblar.');
  const lines = outputSentences(src, t);
  if (!lines.length) throw new Error('No quedó ninguna frase en el corte para doblar.');
  const total = buildTimeline(src, t, { video: '' }).durationInFrames / src.format.fps;

  const progress = opts.onProgress ?? (() => {});
  progress(`Traduciendo ${lines.length} frases al ${L.name}…`, 0.05);
  const texts = src.scenes.map((s) => s.onScreenText ?? '');
  const translated = await translateLines([...lines.map((l) => l.text), ...texts.filter(Boolean)], lang);
  const spoken = translated.slice(0, lines.length);
  let k = lines.length;
  const sceneTexts = texts.map((x) => (x ? translated[k++] : x));

  const providers = await ttsProviders();
  // Piper tiene un modelo por idioma (el configurado es el de español): se usa la voz del sistema.
  const provider: TtsProvider = opts.provider && opts.provider !== 'piper' ? opts.provider : (providers.includes('elevenlabs') && !opts.provider ? 'elevenlabs' : 'sistema');
  const voice = opts.voice ?? (provider === 'sistema' && process.platform === 'darwin' ? L.voice : undefined);
  // La voz del sistema habla al ritmo de la persona (sin pasarse: más de 230 no se entiende).
  const spokenWords = lines.reduce((a, l) => a + l.text.split(/\s+/).length, 0);
  const spokenTime = lines.reduce((a, l) => a + (l.end - l.start), 0);
  const rate = Math.max(170, Math.min(230, (spokenWords / Math.max(1, spokenTime)) * 60 * 0.95));
  const tmp = path.join(os.tmpdir(), `axioma-doblaje-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  try {
    const pieces: { file: string; duration: number }[] = [];
    for (const [i, text] of spoken.entries()) {
      progress(`Grabando la voz (${i + 1}/${spoken.length})…`, 0.3 + 0.5 * (i / spoken.length));
      const file = path.join(tmp, `${i}.wav`);
      await synthesize(text, file, { provider, voice, rate });
      // Sin silencios al inicio y al final, para aprovechar el espacio de la frase.
      const trimmed = path.join(tmp, `${i}-t.wav`);
      await ffmpeg(['-i', file, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', trimmed]);
      pieces.push({ file: trimmed, duration: await mediaDuration(trimmed) });
    }
    const places = placeLines(lines.map((l, i) => ({ start: l.start, nextStart: lines[i + 1]?.start ?? total, duration: pieces[i].duration })), total);

    progress('Mezclando la voz doblada…', 0.85);
    const mix = new Float32Array(Math.ceil(total * RATE) + RATE);
    const words: Transcript['words'] = [];
    for (const [i, p] of pieces.entries()) {
      const raw = path.join(tmp, `${i}.f32`);
      await ffmpeg(['-i', p.file, '-af', `atempo=${places[i].tempo.toFixed(3)}`, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', raw]);
      const buf = await readFile(raw);
      const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
      const off = Math.round(places[i].at * RATE);
      for (let s = 0; s < samples.length && off + s < mix.length; s++) mix[off + s] += samples[s];
      words.push(...spreadWords(spoken[i], places[i].at, samples.length / RATE));
    }

    // Copia del proyecto (enlaces: no duplica el video) con la voz doblada.
    let id = `${src.id}-${lang}`;
    let out = path.join(path.dirname(dir), id);
    for (let n = 2; existsSync(out); n++) out = path.join(path.dirname(dir), (id = `${src.id}-${lang}-${n}`));
    await cloneProjectFiles(dir, out);
    const rawMix = path.join(tmp, 'mezcla.f32');
    await writeFile(rawMix, Buffer.from(mix.buffer));
    const file = path.join('media', `doblaje-${lang}.wav`);
    await ffmpeg(['-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', rawMix, '-t', total.toFixed(3), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', String(RATE), '-c:a', 'pcm_s16le', path.join(out, file)]);
    await writeFile(path.join(out, P.voiceoverWords), JSON.stringify({ language: lang, words }, null, 2));

    const now = new Date().toISOString();
    const project: Project = {
      ...src,
      id,
      name: `${src.name} · ${L.name}`,
      createdAt: now,
      updatedAt: now,
      approval: 'borrador',
      requests: [],
      scenes: src.scenes.map((s, i) => ({ ...s, onScreenText: sceneTexts[i] || s.onScreenText })),
      audio: {
        ...src.audio,
        // La voz original se apaga; la música y los efectos siguen igual.
        originalVolume: 0,
        voiceover: { file: file.split(path.sep).join('/'), text: spoken.join(' '), provider, voice, duration: total, language: lang },
      },
    };
    await writeProject(out, project);
    // Frases que ni acelerándolas entraron en su espacio (empujan a la siguiente).
    const tight = places.filter((p) => p.tempo >= MAX_TEMPO - 0.001).length;
    return { dir: out, id, lines: lines.length, tight, provider, voice };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
