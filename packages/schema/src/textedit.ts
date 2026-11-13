import type { Project, Scene, Transcript } from './project.ts';
import { effectiveRanges } from './timeline.ts';

/**
 * Editar por texto (como Descript): quitar palabras del texto las quita del video y
 * recuperarlas las devuelve. Todo se hace sobre los tramos de las escenas.
 */

type Range = { start: number; end: number };
const MIN = 0.05;

/** Pasa los recortes de inicio y final de la escena a sus tramos (así se pueden editar directo). */
function bake(scene: Scene, duration: number) {
  if (scene.trimStart || scene.trimEnd) {
    scene.ranges = effectiveRanges(scene, duration).map((r) => ({ start: r.start, end: r.end }));
    scene.trimStart = 0;
    scene.trimEnd = 0;
  }
}

function merge(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 0.02) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Quita [a, b] (segundos del video) de todas las escenas. Las escenas que quedan vacías se borran. */
export function cutInterval(project: Project, a: number, b: number): Project {
  const p: Project = structuredClone(project);
  for (const s of p.scenes) {
    const eff = effectiveRanges(s, p.source.duration);
    if (!eff.some((r) => r.start < b && r.end > a)) continue;
    bake(s, p.source.duration);
    s.ranges = s.ranges.flatMap((r) => {
      if (r.end <= a || r.start >= b) return [r];
      return [{ start: r.start, end: Math.min(r.end, a) }, { start: Math.max(r.start, b), end: r.end }].filter((x) => x.end - x.start >= MIN);
    });
  }
  p.scenes = p.scenes.filter((s) => s.ranges.length);
  return p;
}

/** Devuelve [a, b] a la escena que va justo antes en el tiempo (o a la primera). */
export function restoreInterval(project: Project, a: number, b: number): Project {
  const p: Project = structuredClone(project);
  if (!p.scenes.length) return p;
  let best = 0;
  let bestEnd = -Infinity;
  p.scenes.forEach((s, i) => {
    for (const r of effectiveRanges(s, p.source.duration)) if (r.start <= a && r.end > bestEnd) { bestEnd = r.end; best = i; }
  });
  const s = p.scenes[best];
  bake(s, p.source.duration);
  s.ranges = merge([...s.ranges, { start: Math.max(0, a), end: Math.min(p.source.duration, b) }]);
  return p;
}

/** ¿Está esta palabra en el reel? (su centro cae dentro de algún tramo que quedó). */
export function keptMask(project: Project, t: Transcript): boolean[] {
  const kept = project.scenes.flatMap((s) => effectiveRanges(s, project.source.duration));
  return t.words.map((w) => { const m = (w.start + w.end) / 2; return kept.some((r) => m >= r.start && m < r.end); });
}

/**
 * Tramo de tiempo para las palabras i..j: desde el inicio de la primera hasta justo antes de la
 * siguiente palabra (así también se va la pausa que quedaba), con un margen mínimo.
 */
export function wordsSpan(t: Transcript, i: number, j: number): Range {
  const first = t.words[i], last = t.words[j], next = t.words[j + 1];
  const start = Math.max(0, first.start - 0.02);
  const end = next ? Math.max(last.end + 0.02, Math.min(last.end + 0.2, next.start - 0.02)) : last.end + 0.15;
  return { start, end };
}
