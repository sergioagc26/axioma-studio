import { checkCancelled } from './cancel.ts';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sceneLength, type Scene } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { detectShots, type Shot } from './montage.ts';
import { P } from './paths.ts';
import { readProject, writeProject } from './store.ts';
import { classifyImage } from './vision.ts';
import { cleanStart, shotQuality, type QualityMap } from './shotquality.ts';

/**
 * Qué se ve en cada toma y qué palabras de la voz lo nombran. `prompt` va en inglés porque así
 * lo entiende mejor el modelo de visión (CLIP). Las palabras se comparan sin tildes ni plural.
 */
export interface ShotTag {
  id: string; prompt: string; words: string[];
  /** Es un plato o una bebida (lo que se muestra al nombrarlo y en la apertura). */
  food?: boolean;
  /** No se corrige por sus vecinas (una bebida no es un paso de la preparación de un plato). */
  sticky?: boolean;
}

export const SHOT_TAGS: ShotTag[] = [
  { id: 'burro', food: true, prompt: 'a photo of a large burrito wrapped in a flour tortilla', words: ['burro', 'burrito'] },
  { id: 'torta', food: true, prompt: 'a photo of a sandwich made with a long golden toasted bun', words: ['torta', 'sanduche', 'sandwich', 'brioche'] },
  { id: 'nachos', food: true, prompt: 'a photo of a plate of nachos, tortilla chips covered with meat and sauce', words: ['nacho', 'totopo'] },
  { id: 'tacos', food: true, prompt: 'a photo of tacos', words: ['taco'] },
  { id: 'hamburguesa', food: true, prompt: 'a photo of a burger', words: ['hamburguesa', 'burger'] },
  { id: 'postre', food: true, prompt: 'a photo of a dessert', words: ['postre', 'helado', 'brownie'] },
  { id: 'bebida', food: true, sticky: true, prompt: 'a photo of drinks in tall glasses', words: ['bebida', 'agua', 'jamaica', 'tamarindo', 'horchata', 'limonada', 'soda', 'michelada', 'jugo', 'cerveza', 'coctel', 'cafe', 'malteada'] },
  { id: 'ejercicio', prompt: 'a photo of a person exercising in a gym', words: ['entrena', 'entrenar', 'entrenamiento', 'ejercicio', 'rutina', 'gimnasio', 'pesas'] },
  { id: 'producto', prompt: 'a close-up photo of a product on a table', words: ['producto', 'empaque', 'caja'] },
  { id: 'hablando', prompt: 'a photo of a person talking to the camera', words: [] },
  { id: 'manos', prompt: 'a close-up photo of hands working or making something', words: ['manos', 'hecho', 'artesanal'] },
  { id: 'exterior', prompt: 'a photo of a street or the outside of a building', words: ['calle', 'ciudad', 'fachada', 'afuera'] },
  { id: 'cocina', prompt: 'a photo of meat cooking on a hot flat griddle', words: ['cocina', 'parrilla', 'hambre', 'preparamos', 'cocinamos'] },
  { id: 'personas', prompt: 'a photo of people sitting at a restaurant table eating', words: ['familia', 'amigos', 'amigo', 'pareja', 'gente', 'parche', 'mesa', 'silencio'] },
  { id: 'local', prompt: 'a photo of an empty restaurant dining room or terrace with tables and chairs', words: ['bienvenido', 'bienvenidos', 'visitanos', 'local'] },
];

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');
const stem = (t: string) => { const n = norm(t); return n.length > 4 && n.endsWith('es') ? n.slice(0, -2) : n.length > 3 && n.endsWith('s') ? n.slice(0, -1) : n; };

/** Etiqueta de la palabra (si nombra algo de la lista): «nachos» → nachos, «aguas» → bebida. */
export function tagOfWord(word: string, tags: ShotTag[] = SHOT_TAGS): string | null {
  const s = stem(word);
  if (s.length < 3) return null;
  for (const t of tags) {
    // Exacta (sin plural) o en diminutivo, pero no otra palabra que empieza igual
    // («aguacate» no es «agua», «tortilla» no es «torta», «jugosa» no es «jugo»).
    if (t.words.some((w) => s === w || s === `${w}it` || s === `${w}ito` || s === `${w}ita`)) return t.id;
  }
  return null;
}

/**
 * Mira cada toma con el modelo de visión local y le pone una etiqueta (qué plato o qué momento
 * se ve). Queda guardada en shots.json; no se repite si ya están todas etiquetadas.
 */
export async function tagShots(dir: string, opts: { force?: boolean; tags?: ShotTag[] } = {}): Promise<Shot[]> {
  const shots = await detectShots(dir);
  // Ya miradas todas (con o sin etiqueta): no se repite. Las puestas a mano nunca se tocan.
  if (!opts.force && shots.every((s) => s.tag || s.tagAuto)) return shots;
  const tags = opts.tags ?? SHOT_TAGS;
  const tmp = path.join(dir, 'proxies', 'etiquetas');
  await mkdir(tmp, { recursive: true });
  const prompts = tags.map((t) => t.prompt);
  const source = path.join(dir, P.proxy);
  for (const s of shots) {
    if (s.tag && !s.tagAuto) continue;
    if (!opts.force && s.tagAuto) continue;
    checkCancelled();
    const score = new Map<string, number>();
    // Dos fotogramas por toma (a un tercio y a dos tercios), para no fiarse de uno movido.
    for (const k of [1, 2]) {
      const file = path.join(tmp, `${s.id}-${k}.jpg`);
      await ffmpeg(['-ss', (s.start + ((s.end - s.start) * k) / 3).toFixed(2), '-i', source, '-frames:v', '1', '-vf', 'scale=-2:448', '-q:v', '4', file]);
      for (const r of await classifyImage(file, prompts)) score.set(r.label, (score.get(r.label) ?? 0) + r.score / 2);
    }
    const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
    // Si nada se parece de verdad (video de otro tema), la toma queda sin etiqueta: no se adivina.
    s.tag = best[1] >= 0.3 ? tags.find((t) => t.prompt === best[0])?.id : undefined;
    s.tagAuto = true;
  }
  await rm(tmp, { recursive: true, force: true });
  smoothTags(shots, tags);
  await writeFile(path.join(dir, P.shots), JSON.stringify(shots, null, 2));
  return shots;
}

/**
 * Las tomas de preparación de un plato suelen ir seguidas (pan, salsa, queso, plato servido) y
 * el modelo confunde las de en medio con «cocina» o con otro plato. Si las vecinas (dos a cada
 * lado) dicen claramente otro plato, se corrige. Solo toca las que puso el modelo.
 */
export function smoothTags(shots: Shot[], tags: ShotTag[] = SHOT_TAGS) {
  const food = new Set(tags.filter((t) => t.food).map((t) => t.id));
  const sticky = new Set(tags.filter((t) => t.sticky).map((t) => t.id));
  for (let pass = 0; pass < 2; pass++) {
    // Cada pasada mira las etiquetas como estaban al empezar (sin efecto dominó).
    const before = shots.map((s) => s.tag);
    shots.forEach((s, i) => {
      if (!s.tagAuto || !s.tag || sticky.has(s.tag) || !(s.tag === 'cocina' || food.has(s.tag))) return;
      const near = [i - 2, i - 1, i + 1, i + 2].map((k) => before[k]).filter((t): t is string => Boolean(t));
      const count = (t: string) => near.filter((x) => x === t).length;
      const best = [...new Set(near.filter((t) => food.has(t) && !sticky.has(t)))].sort((a, b) => count(b) - count(a))[0];
      if (!best || best === s.tag || count(best) < 2 || count(best) <= count(s.tag)) return;
      // Una toma de un plato solo pasa a otro plato si ninguna vecina la acompaña.
      if (food.has(s.tag) && count(s.tag) > 0) return;
      s.tag = best;
    });
  }
}

/**
 * Hasta qué segundo de una escena (que empieza en `start` y dura `len`) se puede nombrar algo para
 * que ya salga en esa escena. Lo usan la sincronía y los títulos, para que el título aparezca en
 * la misma toma que el plato.
 */
export const sceneSwitchPoint = (start: number, len: number) => start + Math.min(len / 2, 0.4);
export const VOICE_LEAD = 0.25;

/**
 * Pone un corte justo donde empieza cada frase (un poquito antes, VOICE_LEAD): así la imagen de
 * cada fila del guion entra cuando la voz la dice, y no en el siguiente golpe de la música. Si ya
 * hay un corte muy cerca, se corre hasta ahí; si no, la escena se parte en dos. La duración total
 * no cambia. Devuelve cuántos cortes movió o agregó.
 */
export function cutAtTimes(project: { scenes: Scene[] }, times: number[], lead = VOICE_LEAD): number {
  let changed = 0;
  for (const at of times) {
    const target = at - lead;
    if (target < 0.3) continue;
    let t = 0, i = 0;
    for (; i < project.scenes.length; i++) { const len = sceneLength(project.scenes[i]); if (t + len > target) break; t += len; }
    const sc = project.scenes[i];
    if (!sc || sc.ranges.length !== 1 || sc.trimStart || sc.trimEnd) continue;
    const len = sceneLength(sc), off = target - t;
    const r = sc.ranges[0], ratio = (r.end - r.start) / len;
    const next = project.scenes[i + 1];
    if (off < 0.12) continue; // ya hay un corte ahí
    if (len - off < 0.4 && next && next.ranges.length === 1 && !next.trimStart && !next.trimEnd) {
      // El corte siguiente está a un pelo: se adelanta (esta escena se acorta y la siguiente crece).
      const d = (len - off) * ratio;
      r.end = +(r.end - d).toFixed(4);
      next.ranges[0].start = +(next.ranges[0].start - d).toFixed(4);
      changed++;
    } else if (off >= 0.4 && len - off >= 0.4) {
      const cut = +(r.start + off * ratio).toFixed(4);
      const tail: Scene = { ...sc, id: `${sc.id}f${changed}`, ranges: [{ start: cut, end: r.end }], transition: undefined, onScreenText: undefined, autoText: undefined };
      r.end = cut;
      project.scenes.splice(i + 1, 0, tail);
      changed++;
    } else if (off < 0.4 && i > 0) {
      // Recién empezada la escena: se alarga la anterior hasta la frase.
      const prev = project.scenes[i - 1];
      if (prev.ranges.length !== 1 || prev.trimStart || prev.trimEnd) continue;
      const d = off * ratio;
      prev.ranges[0].end = +(prev.ranges[0].end + d).toFixed(4);
      r.start = +(r.start + d).toFixed(4);
      changed++;
    }
  }
  return changed;
}

/**
 * Las etiquetas de la lista más las que escribió una persona («pizza», «Johan», «fachada»): una
 * etiqueta propia se reconoce en la voz por su misma palabra.
 */
export function withCustomTags(shots: { tag?: string }[], tags: ShotTag[] = SHOT_TAGS): ShotTag[] {
  const known = new Set(tags.map((t) => t.id));
  const extra = [...new Set(shots.map((s) => s.tag).filter((t): t is string => Boolean(t) && !known.has(t!)))];
  return [...tags, ...extra.map((id) => ({ id, prompt: '', words: id.split(/\s+/).map(stem).filter((w) => w.length >= 3), food: false }))];
}

/** Nombre para mostrar de cada etiqueta de la lista. */
export const TAG_NAMES: Record<string, string> = {
  burro: 'Burro / burrito', torta: 'Torta / sándwich', nachos: 'Nachos', tacos: 'Tacos', hamburguesa: 'Hamburguesa', postre: 'Postre', bebida: 'Bebida',
  ejercicio: 'Ejercicio', producto: 'Producto', hablando: 'Persona hablando', manos: 'Manos trabajando', exterior: 'Exterior / calle',
  cocina: 'Cocina / preparación', personas: 'Gente comiendo / reunida', local: 'El local por dentro',
};

/** Pone (o quita) a mano la etiqueta de una toma: manda sobre la del modelo y no se vuelve a calcular. */
export async function setShotTag(dir: string, id: string, tag: string | null): Promise<Shot[]> {
  const shots = await detectShots(dir);
  const s = shots.find((x) => x.id === id);
  if (!s) throw new Error(`No existe la toma ${id}.`);
  const clean = (tag ?? '').trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ').slice(0, 40);
  s.tag = clean || undefined;
  // Sin etiqueta a mano = «no la uses para nada en especial» (no se vuelve a adivinar).
  s.tagAuto = false;
  await writeFile(path.join(dir, P.shots), JSON.stringify(shots, null, 2));
  return shots;
}

/** Desde qué segundo de la voz manda cada etiqueta (cuando se nombra un plato, hasta el siguiente). */
export function voiceSegments(words: { text: string; start: number }[], available: Set<string>, tags: ShotTag[] = SHOT_TAGS) {
  const out: { tag: string; start: number; word: string }[] = [];
  for (const w of words) {
    const t = tagOfWord(w.text, tags);
    if (!t || !available.has(t)) continue;
    if (out.length && out[out.length - 1].tag === t) continue;
    out.push({ tag: t, start: w.start, word: w.text });
  }
  return out;
}

/**
 * Montaje con voz en off: cuando la voz nombra un plato, en pantalla sale ese plato. Conserva los
 * cortes (duraciones al ritmo de la música, textos y transiciones) y solo cambia qué trozo de qué
 * toma va en cada escena. Antes de la primera mención van los platos más vistosos, mezclados.
 * Devuelve las secciones que logró sincronizar.
 */
export async function syncShotsToVoice(dir: string, opts: { lead?: number; /** Secciones ya decididas (las filas de un guion técnico): mandan sobre las palabras sueltas. */ segments?: { tag: string; start: number; word: string }[] } = {}): Promise<{ tag: string; word: string; at: number }[]> {
  const project = await readProject(dir);
  const vo = project.audio.voiceover;
  if (project.kind !== 'montaje' || !vo) return [];
  const file = path.join(dir, vo.wordsFile ?? 'voiceover.json');
  if (!existsSync(file)) return [];
  const words = (JSON.parse(await readFile(file, 'utf8')).words ?? []) as { text: string; start: number; end: number }[];
  const every = await detectShots(dir);
  // Con un guion que nombra tomas exactas (t03) sirven todas; si no, solo las que tienen etiqueta.
  const shots = opts.segments?.length ? every : every.filter((s) => s.tag);
  if (!shots.length) return [];
  const pools = new Map<string, Shot[]>();
  for (const s of shots) if (s.tag) pools.set(s.tag, [...(pools.get(s.tag) ?? []), s]);
  // Una fila de guion puede pedir una toma exacta por su número.
  // Si esa toma se acaba antes que la frase, sigue con otra del mismo plato (nunca con otro plato).
  if (opts.segments?.length) for (const s of shots) pools.set(s.id, [s, ...shots.filter((o) => o !== s && s.tag && o.tag === s.tag)]);
  const segs = opts.segments?.length ? opts.segments.filter((x) => pools.has(x.tag)).sort((a, b) => a.start - b.start) : voiceSegments(words, new Set(pools.keys()), withCustomTags(shots));
  if (!segs.length) return [];
  const food = new Set(SHOT_TAGS.filter((t) => t.food).map((t) => t.id));
  // Apertura: lo más vistoso primero. En una secuencia de preparación la última toma suele ser el
  // plato servido, así que se toman de atrás hacia adelante, alternando entre platos.
  const order = [...new Set(segs.map((x) => x.tag).filter((x) => food.has(x)))];
  const byTag = order.map((tg) => shots.filter((s) => s.tag === tg).reverse());
  if (!byTag.length && opts.segments?.length) byTag.push([...shots]);
  const opening: Shot[] = [];
  for (let k = 0; byTag.some((l) => k < l.length); k++) for (const l of byTag) if (l[k]) opening.push(l[k]);
  // El plato aparece un poquito antes de que se diga (como lo cortaría un editor).
  const lead = opts.lead ?? VOICE_LEAD;
  // Trozos ya usados de cada toma (para no repetir imagen) y la última toma puesta.
  const cursor = new Map(shots.map((s) => [s.id, s.start + Math.min(0.3, (s.end - s.start) * 0.1)]));
  // Qué partes de cada toma se ven limpias (sin barridos ni desenfoques): solo esas se usan.
  const quality: QualityMap = await shotQuality(dir, every).catch(() => ({}));
  const startAt = new Map<string, number>();
  const turn = new Map<string, number>();
  let last = '';
  let run = 0;
  let t = 0;
  for (const scene of project.scenes) {
    const len = sceneLength(scene);
    // Largo del trozo de video (puede no ser igual al de la escena si tiene recortes).
    const rlen = scene.ranges.reduce((a, r) => a + r.end - r.start, 0);
    const mid = sceneSwitchPoint(t, len);
    t += len;
    let seg = [...segs].reverse().find((x) => x.start - lead <= mid);
    // Un plato nombrado de pasada no se queda el resto del video: manda unos segundos (según
    // cuánto material tiene) y después vuelven todas las tomas. Las filas de un guion sí mandan
    // hasta la fila siguiente.
    if (seg && !opts.segments?.length && mid - seg.start > Math.max(4, Math.min(9, 0.6 * pools.get(seg.tag)!.reduce((a, s) => a + s.end - s.start, 0)))) seg = undefined;
    const before = !seg && segs.length > 0 && mid < segs[0].start;
    const key = seg?.tag ?? (before ? '__apertura' : '__resto');
    const pool = seg ? pools.get(seg.tag)! : before && opening.length ? opening : shots;
    // Por turnos entre las tomas de ese plato, saltando la que acaba de salir y las que no
    // tienen material libre.
    const n = pool.length;
    let pick: Shot | null = null;
    for (let k = 0; k < n && !pick; k++) {
      const s = pool[((turn.get(key) ?? 0) + k) % n];
      // Nunca la misma toma seguida; si el plato tiene una sola, como mucho dos veces (partes distintas).
      // (Si un guion pide esa toma exacta, sigue en ella: es lo que mandó el guion.)
      if (s.id === last && (n > 1 || (run >= 2 && !opts.segments?.length))) continue;
      const st = cleanStart(quality[s.id], cursor.get(s.id)!, rlen, s.end);
      if (s.end - st >= rlen) { pick = s; startAt.set(s.id, st); turn.set(key, ((turn.get(key) ?? 0) + k + 1) % n); }
    }
    if (!pick && seg) {
      // El plato tiene una sola toma (o ya se gastó): en vez de repetir la misma imagen seguida,
      // entra otro plato vistoso y luego vuelve el que se nombra.
      // Si el plato acaba de salir, va otro; si no, se repite el plato desde el principio.
      if (pool.some((s) => s.id === last)) for (const s of opening) {
        const st = cleanStart(quality[s.id], cursor.get(s.id)!, rlen, s.end);
        if (s.id !== last && s.end - st >= rlen) { pick = s; startAt.set(s.id, st); break; }
      }
    }
    if (!pick) {
      // Sin material libre: se vuelve a usar la toma más larga del plato desde el principio.
      pick = pool.filter((s) => s.end - s.start >= rlen).sort((a, b) => (b.end - b.start) - (a.end - a.start))[0] ?? null;
      if (!pick) continue; // ninguna toma del plato es tan larga: se deja la escena como estaba
      startAt.set(pick.id, cleanStart(quality[pick.id], pick.start, rlen, pick.end));
    }
    const start = startAt.get(pick.id) ?? cursor.get(pick.id)!;
    startAt.delete(pick.id);
    scene.ranges = [{ start: +start.toFixed(4), end: +(start + rlen).toFixed(4) }];
    scene.title = `Toma ${pick.id.slice(1)}`;
    // Hueco entre trozos de la misma toma, para que la próxima vez se vea otra parte.
    cursor.set(pick.id, Math.min(pick.end, start + rlen + Math.min(1.5, (pick.end - pick.start) / 4)));
    run = pick.id === last ? run + 1 : 1;
    last = pick.id;
  }
  await writeProject(dir, project);
  return segs.map((s) => ({ tag: s.tag, word: s.word, at: s.start }));
}
