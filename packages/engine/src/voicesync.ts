import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sceneLength } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { detectShots, type Shot } from './montage.ts';
import { P } from './paths.ts';
import { readProject, writeProject } from './store.ts';
import { classifyImage } from './vision.ts';

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
  { id: 'cocina', prompt: 'a photo of meat cooking on a hot flat griddle', words: ['cocina', 'carne', 'parrilla', 'preparamos', 'cocinamos'] },
  { id: 'personas', prompt: 'a photo of people sitting at a restaurant table eating', words: ['familia', 'amigos', 'pareja', 'gente', 'parche'] },
  { id: 'local', prompt: 'a photo of an empty restaurant dining room or terrace with tables and chairs', words: ['bienvenido', 'bienvenidos', 'visitanos', 'local'] },
];

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');
const stem = (t: string) => { const n = norm(t); return n.length > 4 && n.endsWith('es') ? n.slice(0, -2) : n.length > 3 && n.endsWith('s') ? n.slice(0, -1) : n; };

/** Etiqueta de la palabra (si nombra algo de la lista): «nachos» → nachos, «aguas» → bebida. */
export function tagOfWord(word: string, tags: ShotTag[] = SHOT_TAGS): string | null {
  const s = stem(word);
  if (s.length < 3) return null;
  for (const t of tags) {
    // Exacta, o con una terminación corta («burritos», «totopos»), pero no otra palabra
    // que empieza igual («aguacate» no es «agua», «tortilla» no es «torta»).
    if (t.words.some((w) => s === w || (s.startsWith(w) && s.length - w.length <= 2))) return t.id;
  }
  return null;
}

/**
 * Mira cada toma con el modelo de visión local y le pone una etiqueta (qué plato o qué momento
 * se ve). Queda guardada en shots.json; no se repite si ya están todas etiquetadas.
 */
export async function tagShots(dir: string, opts: { force?: boolean; tags?: ShotTag[] } = {}): Promise<Shot[]> {
  const shots = await detectShots(dir);
  if (!opts.force && shots.every((s) => s.tag)) return shots;
  const tags = opts.tags ?? SHOT_TAGS;
  const tmp = path.join(dir, 'proxies', 'etiquetas');
  await mkdir(tmp, { recursive: true });
  const prompts = tags.map((t) => t.prompt);
  const source = path.join(dir, P.proxy);
  for (const s of shots) {
    if (s.tag && !opts.force && !s.tagAuto) continue;
    const score = new Map<string, number>();
    // Dos fotogramas por toma (a un tercio y a dos tercios), para no fiarse de uno movido.
    for (const k of [1, 2]) {
      const file = path.join(tmp, `${s.id}-${k}.jpg`);
      await ffmpeg(['-ss', (s.start + ((s.end - s.start) * k) / 3).toFixed(2), '-i', source, '-frames:v', '1', '-vf', 'scale=-2:448', '-q:v', '4', file]);
      for (const r of await classifyImage(file, prompts)) score.set(r.label, (score.get(r.label) ?? 0) + r.score / 2);
    }
    const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
    s.tag = tags.find((t) => t.prompt === best[0])?.id;
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
export async function syncShotsToVoice(dir: string, opts: { lead?: number } = {}): Promise<{ tag: string; word: string; at: number }[]> {
  const project = await readProject(dir);
  const vo = project.audio.voiceover;
  if (project.kind !== 'montaje' || !vo) return [];
  const file = path.join(dir, vo.wordsFile ?? 'voiceover.json');
  if (!existsSync(file)) return [];
  const words = (JSON.parse(await readFile(file, 'utf8')).words ?? []) as { text: string; start: number; end: number }[];
  const shots = (await detectShots(dir)).filter((s) => s.tag);
  if (!shots.length) return [];
  const pools = new Map<string, Shot[]>();
  for (const s of shots) pools.set(s.tag!, [...(pools.get(s.tag!) ?? []), s]);
  const segs = voiceSegments(words, new Set(pools.keys()));
  if (!segs.length) return [];
  const food = new Set(SHOT_TAGS.filter((t) => t.food).map((t) => t.id));
  // Apertura: lo más vistoso primero. En una secuencia de preparación la última toma suele ser el
  // plato servido, así que se toman de atrás hacia adelante, alternando entre platos.
  const order = [...new Set(segs.map((x) => x.tag).filter((x) => food.has(x)))];
  const byTag = order.map((tg) => shots.filter((s) => s.tag === tg).reverse());
  const opening: Shot[] = [];
  for (let k = 0; byTag.some((l) => k < l.length); k++) for (const l of byTag) if (l[k]) opening.push(l[k]);
  // El plato aparece un poquito antes de que se diga (como lo cortaría un editor).
  const lead = opts.lead ?? VOICE_LEAD;
  // Trozos ya usados de cada toma (para no repetir imagen) y la última toma puesta.
  const cursor = new Map(shots.map((s) => [s.id, s.start + Math.min(0.3, (s.end - s.start) * 0.1)]));
  const turn = new Map<string, number>();
  let last = '';
  let t = 0;
  for (const scene of project.scenes) {
    const len = sceneLength(scene);
    // Largo del trozo de video (puede no ser igual al de la escena si tiene recortes).
    const rlen = scene.ranges.reduce((a, r) => a + r.end - r.start, 0);
    const mid = sceneSwitchPoint(t, len);
    t += len;
    const seg = [...segs].reverse().find((x) => x.start - lead <= mid);
    const key = seg?.tag ?? '__apertura';
    const pool = seg ? pools.get(seg.tag)! : (opening.length ? opening : shots);
    // Por turnos entre las tomas de ese plato, saltando la que acaba de salir y las que no
    // tienen material libre.
    const n = pool.length;
    let pick: Shot | null = null;
    for (let k = 0; k < n && !pick; k++) {
      const s = pool[((turn.get(key) ?? 0) + k) % n];
      if (s.id === last && n > 1) continue;
      if (s.end - cursor.get(s.id)! >= rlen) { pick = s; turn.set(key, ((turn.get(key) ?? 0) + k + 1) % n); }
    }
    if (!pick) {
      // Sin material libre: se vuelve a usar la toma más larga del plato desde el principio.
      pick = pool.filter((s) => s.end - s.start >= rlen).sort((a, b) => (b.end - b.start) - (a.end - a.start))[0] ?? null;
      if (!pick) continue; // ninguna toma del plato es tan larga: se deja la escena como estaba
      cursor.set(pick.id, pick.start);
    }
    const start = cursor.get(pick.id)!;
    scene.ranges = [{ start: +start.toFixed(4), end: +(start + rlen).toFixed(4) }];
    scene.title = `Toma ${pick.id.slice(1)}`;
    // Hueco entre trozos de la misma toma, para que la próxima vez se vea otra parte.
    cursor.set(pick.id, Math.min(pick.end, start + rlen + Math.min(1.5, (pick.end - pick.start) / 4)));
    last = pick.id;
  }
  await writeProject(dir, project);
  return segs.map((s) => ({ tag: s.tag, word: s.word, at: s.start }));
}
