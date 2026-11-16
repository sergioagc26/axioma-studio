import { Scene, ScriptCut, type Pacing, type Range, type ScriptCutLine, type Word } from '@axioma/schema';
import { FILLERS, applyPunchZooms, normalize, phrasesToRanges, snapWordsToSpeech, type Phrase } from './cuts.ts';
import { analyzeAudio, readAnalysis } from './pipeline.ts';
import { readScript } from './script.ts';
import { readProject, readTranscript, writeProject } from './store.ts';

/**
 * Cortar con el guion: la persona escribió lo que pensaba decir y grabó (con repeticiones,
 * comentarios fuera del guion, muletillas y silencios). Cada frase del guion se busca en la
 * transcripción palabra por palabra; de las veces que se grabó se elige una toma (por defecto la
 * última completa) y todo lo demás se quita. Las escenas siguen el orden del guion.
 */

export type TakeChoice = 'ultima' | 'mejor' | 'primera';

const NUMBERS: Record<string, string> = {
  '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro', '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve', '10': 'diez',
  '11': 'once', '12': 'doce', '13': 'trece', '14': 'catorce', '15': 'quince', '16': 'dieciseis', '17': 'diecisiete', '18': 'dieciocho', '19': 'diecinueve', '20': 'veinte',
  un: 'uno', una: 'uno',
};
/** Palabra normalizada para comparar guion y transcripción («3» = «tres», «Más» = «mas»). */
const tok = (t: string) => { const n = normalize(t); return NUMBERS[n] ?? n; };

/** Filas del guion pegado: una por línea, sin viñetas, números de lista ni acotaciones entre paréntesis o corchetes. */
export function scriptRows(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/^\s*(#+|[-*•·>]|\d+[.)-])\s*/, '')
      .replace(/[«»"“”*_]/g, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((l) => l.split(' ').some((w) => tok(w)));
}

/** Frases de una fila: se parte por punto, signo de pregunta o de exclamación. */
export function scriptSentences(row: string): string[] {
  return row.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).some((w) => tok(w)));
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return d[b.length];
}

const MATCH = 2, NEAR = 1.2, MISS = -1, GAP = -1, BLOCKED = -4;
/** Cuánto se parecen una palabra del guion y una dicha: igual, casi igual («Zogamoso»/«Sogamoso») o distinta. */
function sim(a: string, b: string): number {
  if (a === b) return MATCH;
  if (Math.min(a.length, b.length) >= 3 && 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.75) return NEAR;
  return MISS;
}

export interface Take {
  /** Índices (en la transcripción limpia) donde empieza y termina la toma, inclusive. */
  from: number;
  to: number;
  /** Palabras de la transcripción limpia que forman la toma. */
  kept: number[];
  /** Parte de la frase del guion que se dijo (0–1). */
  coverage: number;
  /** Se dijo casi entera y hasta el final (no se cortó a medias). */
  complete: boolean;
  score: number;
}

/**
 * Todas las veces que se dijo una frase del guion (alineación semiglobal: la frase entera contra
 * cualquier tramo de la transcripción). Tras encontrar la mejor se bloquea ese tramo y se busca la
 * siguiente. Devuelve las tomas en orden de grabación.
 */
export function findTakes(S: string[], T: string[], blocked: boolean[] = [], maxTakes = 6): Take[] {
  const m = S.length, n = T.length;
  if (!m || !n) return [];
  const block = T.map((_, j) => Boolean(blocked[j]));
  const takes: Take[] = [];
  const W = n + 1;
  const H = new Float64Array((m + 1) * W);
  const B = new Uint8Array((m + 1) * W); // 1 diagonal, 2 falta palabra del guion, 3 palabra de más
  for (let round = 0; round < maxTakes; round++) {
    for (let i = 1; i <= m; i++) { H[i * W] = i * GAP; B[i * W] = 2; }
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const bl = block[j - 1];
        const diag = H[(i - 1) * W + j - 1] + (bl ? BLOCKED : sim(S[i - 1], T[j - 1]));
        const up = H[(i - 1) * W + j] + GAP;
        const left = H[i * W + j - 1] + (bl ? BLOCKED : GAP);
        let best = diag, how = 1;
        if (up > best) { best = up; how = 2; }
        if (left > best) { best = left; how = 3; }
        H[i * W + j] = best; B[i * W + j] = how;
      }
    }
    let end = -1, bestScore = -Infinity;
    for (let j = 1; j <= n; j++) if (H[m * W + j] > bestScore) { bestScore = H[m * W + j]; end = j; }
    if (end < 0) break;
    // Camino de vuelta: qué palabras dichas corresponden a qué palabras del guion.
    let i = m, j = end, matched = 0, lastSaid = false;
    const kept: number[] = [];
    let extra: number[] = [];
    const flushExtra = () => { if (extra.length && extra.length < 3) kept.push(...extra); extra = []; };
    while (i > 0 && j > 0) {
      const how = B[i * W + j];
      if (how === 1) {
        flushExtra();
        if (sim(S[i - 1], T[j - 1]) > 0) { matched++; if (i === m) lastSaid = true; }
        if (!block[j - 1]) kept.push(j - 1);
        i--; j--;
      } else if (how === 2) i--;
      else { if (!block[j - 1]) extra.push(j - 1); j--; }
    }
    // Lo que se dijo de más al principio de la toma no entra (nunca pasa con inicio libre, pero por si acaso).
    kept.sort((a, b) => a - b);
    const coverage = matched / m;
    if (matched < Math.min(2, m) || coverage < 0.6 || !kept.length) break;
    const from = kept[0], to = kept[kept.length - 1];
    takes.push({ from, to, kept, coverage, complete: coverage >= 0.85 && lastSaid, score: bestScore });
    for (let k = from; k <= to; k++) block[k] = true;
  }
  return takes.sort((a, b) => a.from - b.from);
}

/** Qué toma se queda: la última completa (como haría un editor), la primera o la de más palabras del guion. */
export function pickTake(takes: Take[], choice: TakeChoice = 'ultima'): number {
  if (!takes.length) return -1;
  const complete = takes.map((t, i) => (t.complete ? i : -1)).filter((i) => i >= 0);
  const bestOf = (idx: number[]) => idx.reduce((b, i) => (takes[i].coverage > takes[b].coverage || (takes[i].coverage === takes[b].coverage && takes[i].score >= takes[b].score) ? i : b), idx[0]);
  if (choice === 'mejor') return bestOf(takes.map((_, i) => i));
  if (complete.length) return choice === 'primera' ? complete[0] : complete[complete.length - 1];
  return bestOf(takes.map((_, i) => i));
}

export interface ScriptCutResult {
  scenes: Scene[];
  report: Omit<ScriptCut, 'at' | 'text' | 'take'>;
}

/**
 * El corte con el guion, sin tocar archivos: palabras de la transcripción + filas del guion →
 * escenas (en el orden del guion) y el reporte de qué frase quedó en cada escena.
 */
export function cutByScript(
  rawWords: Word[], rows: string[], pacing: Pacing, duration: number, silences: Range[] = [], opts: { take?: TakeChoice } = {},
): ScriptCutResult {
  const words = silences.length ? snapWordsToSpeech(rawWords, silences) : rawWords;
  // La transcripción sin muletillas: sobre esta se busca el guion.
  const clean: Word[] = [];
  let removedFillers = 0;
  for (const w of words) {
    const t = tok(w.text);
    if (!t) continue;
    if (FILLERS.has(t)) { removedFillers++; continue; }
    clean.push(w);
  }
  const T = clean.map((w) => tok(w.text));
  const used: boolean[] = new Array(T.length).fill(false);
  const inTake: boolean[] = new Array(T.length).fill(false);

  type Line = ScriptCutLine & { words: Word[] };
  const lines: Line[] = [];
  rows.forEach((row, r) => {
    for (const text of scriptSentences(row)) {
      const S = text.split(/\s+/).map(tok).filter(Boolean);
      const takes = findTakes(S, T, used);
      for (const t of takes) for (let k = t.from; k <= t.to; k++) inTake[k] = true;
      const c = pickTake(takes, opts.take);
      if (c < 0) { lines.push({ row: r, text, found: false, takes: 0, coverage: 0, words: [] }); continue; }
      const take = takes[c];
      for (let k = take.from; k <= take.to; k++) used[k] = true;
      const ws = take.kept.map((k) => clean[k]);
      lines.push({
        row: r, text, found: true, takes: takes.length, chosenTake: c + 1, coverage: +take.coverage.toFixed(2),
        start: +ws[0].start.toFixed(2), end: +ws[ws.length - 1].end.toFixed(2), words: ws,
      });
    }
  });

  const keptIdx = new Set<Word>(lines.flatMap((l) => l.words));
  let removedRetakeWords = 0, removedOffScriptWords = 0;
  clean.forEach((w, k) => { if (!keptIdx.has(w)) { if (inTake[k]) removedRetakeWords++; else removedOffScriptWords++; } });

  // Escenas: una por fila del guion (partida si pasa de ~7 s), en el orden del guion.
  const scenes: Scene[] = [];
  let group: Line[] = [], groupDur = 0;
  const asPhrase = (l: Line, i: number): Phrase => ({ id: `g${i}`, start: l.start!, end: l.end!, text: l.text, words: l.words, junk: false });
  const rangesOf = (ls: Line[]) => phrasesToRanges(ls.map(asPhrase), pacing, duration, silences);
  const flush = () => {
    if (!group.length) return;
    const ranges = rangesOf(group);
    // Dos filas dichas de corrido: el margen de cada corte se pisaría y se oiría un trozo dos veces.
    const prev = scenes[scenes.length - 1]?.ranges.at(-1);
    if (prev && ranges[0] && ranges[0].start >= prev.start && ranges[0].start < prev.end) {
      ranges[0].start = prev.end;
      if (ranges[0].end - ranges[0].start <= 0.05) ranges.shift();
    }
    if (ranges.length) {
      const id = `s${String(scenes.length + 1).padStart(2, '0')}`;
      scenes.push(Scene.parse({ id, ranges, scriptText: group.map((l) => l.text).join(' ') }));
      for (const l of group) l.sceneId = id;
    }
    group = []; groupDur = 0;
  };
  let row = -1;
  for (const l of lines) {
    if (!l.found) continue;
    if (l.row !== row) { flush(); row = l.row; }
    const d = rangesOf([l]).reduce((a, x) => a + x.end - x.start, 0);
    if (!d) { l.found = false; continue; }
    if (groupDur >= 2.5 && groupDur + d > 7) flush();
    group.push(l); groupDur += d;
  }
  flush();
  if (scenes.length) {
    scenes[0].role = 'gancho'; scenes[0].title = 'Gancho';
    if (scenes.length > 1) { scenes[scenes.length - 1].role = 'cta'; scenes[scenes.length - 1].title = 'Cierre'; }
  }
  applyPunchZooms(scenes, pacing.punchZoomEvery);

  const outputDuration = scenes.reduce((a, s) => a + s.ranges.reduce((b, r) => b + r.end - r.start, 0), 0);
  return {
    scenes,
    report: {
      lines: lines.map(({ words: _w, ...l }) => (l.found ? l : { ...l, start: undefined, end: undefined, chosenTake: undefined })),
      missing: lines.filter((l) => !l.found).map((l) => l.text),
      removedFillers, removedRetakeWords, removedOffScriptWords,
      sourceDuration: duration, outputDuration: +outputDuration.toFixed(2),
    },
  };
}

/** El reporte en texto: qué frase quedó en cada escena, de qué toma, y qué falta. */
export function formatScriptCut(r: Pick<ScriptCut, 'lines' | 'missing' | 'removedFillers' | 'removedRetakeWords' | 'removedOffScriptWords' | 'sourceDuration' | 'outputDuration'>): string {
  const out = [`Corte con el guion: ${r.sourceDuration.toFixed(1)} s → ${r.outputDuration.toFixed(1)} s`,
    `Se quitó: ${r.removedRetakeWords} palabras de tomas repetidas, ${r.removedOffScriptWords} fuera del guion y ${r.removedFillers} muletillas (más los silencios).`, ''];
  for (const l of r.lines) {
    if (!l.found) { out.push(`⚠ NO SE ENCONTRÓ: «${l.text}»`); continue; }
    const take = l.takes > 1 ? ` · toma ${l.chosenTake} de ${l.takes}` : '';
    const part = l.coverage < 0.85 ? ` · incompleta (${Math.round(l.coverage * 100)} % de la frase)` : '';
    out.push(`${l.sceneId} ← «${l.text}» (${l.start?.toFixed(1)}–${l.end?.toFixed(1)} s${take}${part})`);
  }
  if (r.missing.length) out.push('', `Faltan ${r.missing.length} frase(s) del guion en la grabación: grábalas o quítalas del guion.`);
  return out.join('\n');
}

/**
 * Corta el proyecto (video hablado) según el guion escrito: el texto pegado o, si no se da, la voz
 * del guion guardado. Reemplaza las escenas y deja el reporte en el proyecto (`scriptCut`).
 */
export async function cutProjectToScript(dir: string, opts: { text?: string; take?: TakeChoice } = {}): Promise<ScriptCut> {
  const project = await readProject(dir);
  if (project.kind === 'montaje') throw new Error('Este proyecto es un montaje sin voz: cortar con el guion funciona con videos de alguien hablando a cámara.');
  const transcript = await readTranscript(dir);
  if (!transcript?.words.length) throw new Error('El proyecto aún no está transcrito.');
  let text = opts.text?.trim() ?? '';
  if (!text) {
    const g = await readScript(dir);
    text = (g?.filas ?? []).map((f) => f.voz.trim()).filter(Boolean).join('\n');
  }
  const rows = scriptRows(text);
  if (!rows.length) throw new Error('Pega el guion (lo que pensabas decir) para cortar con él.');
  const { silences } = (await readAnalysis(dir)) ?? (await analyzeAudio(dir));
  const cr = project.clipRange;
  const words = cr ? transcript.words.filter((w) => w.start >= cr.start - 0.05 && w.end <= cr.end + 0.05) : transcript.words;
  const { scenes, report } = cutByScript(words, rows, project.pacing, project.source.duration, silences, { take: opts.take });
  if (!scenes.length) throw new Error('No encontré ninguna frase del guion en la grabación. Revisa que sea el guion de este video (y que esté transcrito en el mismo idioma).');
  const cut = ScriptCut.parse({ ...report, at: new Date().toISOString(), text, take: opts.take ?? 'ultima' });
  project.scenes = scenes;
  project.scriptCut = cut;
  await writeProject(dir, project);
  return cut;
}
