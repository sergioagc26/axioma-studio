import { Scene, sceneLength, type Pacing, type Range, type Word } from '@axioma/schema';

/** Muletillas puras. No incluye palabras reales como "este" o "bueno". */
const FILLERS = new Set(['eh', 'ehh', 'eeh', 'em', 'emm', 'mm', 'mmm', 'hmm', 'ah', 'ahh', 'uh', 'um', 'ehm']);
const SENTENCE_END = /[.!?…]$/;
const PHRASE_PAUSE = 0.7;

export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9]/g, '');

export interface CutReport {
  keptWords: number;
  removedFillers: number;
  removedRetakeWords: number;
  sourceDuration: number;
  outputDuration: number;
}

/** Divide palabras en frases por puntuación fuerte o pausas largas. */
export function splitPhrases(words: Word[]): Word[][] {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && w.start - prev.end > PHRASE_PAUSE) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
    if (SENTENCE_END.test(w.text.trim())) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Una frase es una toma descartada si la siguiente (o la de después) empieza
 * igual: la persona se equivocó y volvió a empezar. Se queda la última.
 */
export function isRetake(a: Word[], b: Word[]): boolean {
  const ta = a.map((w) => normalize(w.text)).filter(Boolean);
  const tb = b.map((w) => normalize(w.text)).filter(Boolean);
  if (ta.length < 2 || tb.length < 2) return false;
  let k = 0;
  while (k < ta.length && k < tb.length && ta[k] === tb[k]) k++;
  return k >= Math.min(3, ta.length) && k / ta.length >= 0.6;
}

/** Convierte palabras conservadas en tramos, cortando pausas largas. */
export function wordsToRanges(words: Word[], pacing: Pacing, duration: number): Range[] {
  const ranges: Range[] = [];
  for (const w of words) {
    const start = Math.max(0, w.start - pacing.pad);
    const end = Math.min(duration, w.end + pacing.pad);
    const last = ranges[ranges.length - 1];
    if (last && w.start - (last.end - pacing.pad) <= pacing.maxPause) {
      last.end = Math.max(last.end, end);
    } else {
      ranges.push({ start: last ? Math.max(start, last.end) : start, end });
    }
  }
  return ranges.filter((r) => r.end - r.start > 0.05);
}

/**
 * Ajusta las palabras a la voz real: si una palabra empieza o termina dentro
 * de un silencio, se mueve al borde. Whisper suele "estirar" palabras sobre
 * las pausas; esto lo corrige y mejora la sincronía de los subtítulos.
 */
export function snapWordsToSpeech(words: Word[], silences: Range[]): Word[] {
  return words.map((w) => {
    let { start, end } = w;
    for (const s of silences) {
      if (start >= s.start && start < s.end) start = Math.min(s.end, end);
      if (end > s.start && end <= s.end) end = Math.max(s.start, start);
    }
    if (end - start < 0.06) end = start + 0.06;
    return { ...w, start, end };
  });
}

/** Quita de los tramos los silencios más largos que `maxPause`, dejando `pad` a cada lado. */
export function subtractSilences(ranges: Range[], silences: Range[], pacing: Pacing): Range[] {
  let out = ranges.map((r) => ({ ...r }));
  for (const s of silences) {
    if (s.end - s.start <= pacing.maxPause) continue;
    const cutStart = s.start + pacing.pad;
    const cutEnd = s.end - pacing.pad;
    if (cutEnd <= cutStart) continue;
    const next: Range[] = [];
    for (const r of out) {
      if (cutEnd <= r.start || cutStart >= r.end) {
        next.push(r);
        continue;
      }
      if (cutStart > r.start) next.push({ start: r.start, end: cutStart });
      if (cutEnd < r.end) next.push({ start: cutEnd, end: r.end });
    }
    out = next;
  }
  return out.filter((r) => r.end - r.start > 0.05);
}

/** Frase del video con su estado de limpieza, para que Claude elija qué usar. */
export interface Phrase {
  id: string;
  start: number;
  end: number;
  text: string;
  words: Word[];
  /** Muletilla o palabra inventada por Whisper (se descarta por defecto). */
  junk: boolean;
  /** Id de la frase que la repite más adelante (esta es una toma descartada). */
  retakeOf?: string;
}

/**
 * Divide la transcripción en frases numeradas (f01, f02…) y marca las que
 * el corte automático descartaría. No borra nada: Claude decide.
 */
export function analyzePhrases(rawWords: Word[], pacing: Pacing, silences: Range[] = []): Phrase[] {
  const words = silences.length ? snapWordsToSpeech(rawWords, silences) : rawWords;
  const clean = pacing.removeFillers ? words.filter((w) => !FILLERS.has(normalize(w.text))) : words;
  const phrases: Phrase[] = splitPhrases(clean).map((p, i) => {
    const probs = p.map((w) => w.prob).filter((x): x is number => typeof x === 'number');
    return {
      id: `f${String(i + 1).padStart(2, '0')}`,
      start: p[0].start,
      end: p[p.length - 1].end,
      text: p.map((w) => w.text).join(' '),
      words: p,
      junk: pacing.removeFillers && p.length <= 2 && probs.length === p.length
        && probs.reduce((a, b) => a + b, 0) / probs.length < 0.4,
    };
  });
  if (pacing.removeRetakes) {
    const live = phrases.filter((p) => !p.junk);
    live.forEach((p, i) => {
      const later = live.slice(i + 1, i + 3).find((b) => isRetake(p.words, b.words));
      if (later) p.retakeOf = later.id;
    });
  }
  return phrases;
}

/** Tramos del video para una lista de frases, sin silencios largos ni solapes. */
export function phrasesToRanges(phrases: Phrase[], pacing: Pacing, duration: number, silences: Range[] = []): Range[] {
  const out: Range[] = [];
  for (const p of phrases) {
    for (const r of subtractSilences(wordsToRanges(p.words, pacing, duration), silences, pacing)) {
      const last = out[out.length - 1];
      // Solo se recorta el solape cuando el orden es cronológico; si Claude
      // reordena frases a propósito, los tramos pueden repetirse en el tiempo.
      if (last && r.start >= last.start && r.start < last.end) r.start = last.end;
      if (r.end - r.start > 0.05) out.push(r);
    }
  }
  return out;
}

export interface AutoCutResult {
  scenes: Scene[];
  report: CutReport;
}

/**
 * Corte automático: quita muletillas, tomas repetidas y silencios, y agrupa
 * las frases en escenas de 2,5–7 s. Claude puede reagrupar y nombrar escenas
 * después; esto es solo la base.
 */
export function autoCut(rawWords: Word[], pacing: Pacing, duration: number, silences: Range[] = []): AutoCutResult {
  let removedFillers = 0;
  let removedRetakeWords = 0;
  const words = silences.length ? snapWordsToSpeech(rawWords, silences) : rawWords;

  const clean = pacing.removeFillers
    ? words.filter((w) => {
        const f = FILLERS.has(normalize(w.text));
        if (f) removedFillers++;
        return !f;
      })
    : words;

  let phrases = splitPhrases(clean);
  if (pacing.removeFillers) {
    // Whisper a veces convierte un "eh" en una palabra inventada ("¿Qué?") con
    // confianza muy baja. Una frase de 1–2 palabras con confianza media < 0,4
    // se trata como muletilla.
    phrases = phrases.filter((p) => {
      const probs = p.map((w) => w.prob).filter((x): x is number => typeof x === 'number');
      const junk = p.length <= 2 && probs.length === p.length && probs.reduce((a, b) => a + b, 0) / probs.length < 0.4;
      if (junk) removedFillers += p.length;
      return !junk;
    });
  }
  if (pacing.removeRetakes) {
    const keep: Word[][] = [];
    for (let i = 0; i < phrases.length; i++) {
      const later = phrases.slice(i + 1, i + 3);
      if (later.some((b) => isRetake(phrases[i], b))) {
        removedRetakeWords += phrases[i].length;
        continue;
      }
      keep.push(phrases[i]);
    }
    phrases = keep;
  }

  const phraseRanges = phrases
    .map((p) => subtractSilences(wordsToRanges(p, pacing, duration), silences, pacing))
    .filter((r) => r.length);
  // Evitar solapes entre frases consecutivas.
  for (let i = 1; i < phraseRanges.length; i++) {
    const prevEnd = phraseRanges[i - 1][phraseRanges[i - 1].length - 1].end;
    const first = phraseRanges[i][0];
    if (first.start < prevEnd) first.start = prevEnd;
  }

  const scenes: Scene[] = [];
  let group: Range[] = [];
  let groupDur = 0;
  const flush = () => {
    if (!group.length) return;
    scenes.push(Scene.parse({
      id: `s${String(scenes.length + 1).padStart(2, '0')}`,
      ranges: group.filter((r) => r.end > r.start),
    }));
    group = [];
    groupDur = 0;
  };
  for (const ranges of phraseRanges) {
    const d = ranges.reduce((a, r) => a + r.end - r.start, 0);
    if (groupDur >= 2.5 && groupDur + d > 7) flush();
    group.push(...ranges);
    groupDur += d;
    if (groupDur >= 7) flush();
  }
  flush();

  if (scenes.length) {
    scenes[0].role = 'gancho';
    scenes[0].title = 'Gancho';
    if (scenes.length > 1) {
      scenes[scenes.length - 1].role = 'cta';
      scenes[scenes.length - 1].title = 'Cierre';
    }
  }
  applyPunchZooms(scenes, pacing.punchZoomEvery);

  const outputDuration = scenes.reduce((a, s) => a + s.ranges.reduce((b, r) => b + r.end - r.start, 0), 0);
  return {
    scenes,
    report: {
      keptWords: phrases.reduce((a, p) => a + p.length, 0),
      removedFillers,
      removedRetakeWords,
      sourceDuration: duration,
      outputDuration,
    },
  };
}

/** Marca zoom de golpe en la primera escena que empieza tras cada intervalo. */
export function applyPunchZooms(scenes: Scene[], every: number) {
  let t = 0;
  let next = every;
  for (const s of scenes) {
    s.punchZoom = false;
    if (every > 0 && t >= next) {
      s.punchZoom = true;
      next = t + every;
    }
    t += sceneLength(s);
  }
}
