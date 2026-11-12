import type { TimelineWord } from '@snz/schema';

export interface CaptionChunk {
  words: TimelineWord[];
  startFrame: number;
  endFrame: number;
}

/**
 * Agrupa palabras en bloques de hasta `perLine` palabras. Corta antes si hay
 * una pausa larga o si la palabra termina en puntuación fuerte. Cada bloque
 * dura hasta que empieza el siguiente (máximo `holdFrames` después de su
 * última palabra), para que el texto no parpadee.
 */
export function chunkWords(words: TimelineWord[], perLine: number, fps: number): CaptionChunk[] {
  const gap = Math.round(0.6 * fps);
  const holdFrames = Math.round(0.4 * fps);
  const chunks: CaptionChunk[] = [];
  let cur: TimelineWord[] = [];
  const flush = () => {
    if (cur.length) chunks.push({ words: cur, startFrame: cur[0].startFrame, endFrame: cur[cur.length - 1].endFrame });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.startFrame - prev.endFrame > gap || cur.length >= perLine)) flush();
    cur.push(w);
    if (/[.!?…]$/.test(w.text)) flush();
  }
  flush();
  for (let i = 0; i < chunks.length; i++) {
    const next = chunks[i + 1];
    const limit = chunks[i].endFrame + holdFrames;
    chunks[i].endFrame = next ? Math.min(next.startFrame, limit) : limit;
  }
  return chunks;
}
