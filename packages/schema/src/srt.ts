/**
 * Subtítulos en archivo .srt (YouTube, LinkedIn, Facebook, reproductores): las mismas palabras
 * del reel, con los tiempos del video final, agrupadas en líneas cortas fáciles de leer.
 */
export interface SrtWord { text: string; startFrame: number; endFrame: number }
export interface SrtCue { start: number; end: number; text: string }

const MAX_CHARS = 42;
const MAX_WORDS = 8;
const MAX_GAP = 0.7;
const MIN_LEN = 0.8;

/** Agrupa las palabras en líneas: corta en el punto, en una pausa o cuando la línea ya es larga. */
export function srtCues(words: SrtWord[], fps: number): SrtCue[] {
  const ws = [...words].filter((w) => w.text.trim()).sort((a, b) => a.startFrame - b.startFrame);
  const cues: SrtCue[] = [];
  let cur: SrtWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    cues.push({ start: cur[0].startFrame / fps, end: cur[cur.length - 1].endFrame / fps, text: cur.map((w) => w.text.trim()).join(' ') });
    cur = [];
  };
  for (const w of ws) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const gap = (w.startFrame - prev.endFrame) / fps;
      const len = cur.map((x) => x.text.trim()).join(' ').length + 1 + w.text.trim().length;
      if (gap > MAX_GAP || len > MAX_CHARS || cur.length >= MAX_WORDS || /[.?!…]$/.test(prev.text.trim())) flush();
    }
    cur.push(w);
  }
  flush();
  // Cada línea dura al menos un poco (sin pisar la siguiente) para que se alcance a leer.
  cues.forEach((c, i) => {
    const next = cues[i + 1]?.start ?? Number.POSITIVE_INFINITY;
    c.end = Math.min(Math.max(c.end, c.start + MIN_LEN), next);
  });
  return cues;
}

const stamp = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export function toSrt(words: SrtWord[], fps: number): string {
  return srtCues(words, fps).map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
}
