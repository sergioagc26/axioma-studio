import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkCancelled } from './cancel.ts';
import { avatarSpeak, enhanceFaces } from './avatar.ts';
import { ffmpeg, ffprobe } from './exec.ts';
import { llmJson, llmReady, visionJson, visionReady } from './llm.ts';
import { buildCutout } from './matte.ts';
import { setAutoSfx, setMusic } from './ops.ts';
import { WORKSPACE, slugify } from './paths.ts';
import { prepareMedia, transcribeProject } from './pipeline.ts';
import { listReferences } from './reference.ts';
import { renderProject } from './render.ts';
import { createProject, readProject, readTranscript, writeProject } from './store.ts';
import { synthesize, type TtsProvider } from './tts.ts';

/**
 * «Reel de creador» de un solo pedido: guion a la duración pedida → voz → avatar que habla (o tu
 * video) → escenas con palabras gigantes al ritmo de la voz, objetos según lo que se dice,
 * grabaciones de la app flotando, acercamientos de golpe → exportar → revisión automática.
 * Cada paso deja su resultado guardado: si algo se corta, al volver a pedirlo sigue donde iba.
 */

// ───────────────────────── Avatares guardados ─────────────────────────

/** workspace/avatares/<nombre>/: cara.png, fondos (estudio, noche, claro, oscuro, pc), miniaturas/ y caché/. */
export const AVATARS_DIR = path.join(WORKSPACE, 'avatares');

export interface SavedAvatar {
  id: string; name: string; description?: string;
  voice?: { provider?: TtsProvider; voice?: string };
  dir: string;
}

export async function listAvatars(): Promise<SavedAvatar[]> {
  if (!existsSync(AVATARS_DIR)) return [];
  const out: SavedAvatar[] = [];
  for (const d of await readdir(AVATARS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = path.join(AVATARS_DIR, d.name);
    if (!existsSync(path.join(dir, 'cara.png'))) continue;
    const meta = JSON.parse(await readFile(path.join(dir, 'avatar.json'), 'utf8').catch(() => '{}'));
    out.push({ id: d.name, name: meta.name ?? d.name, description: meta.description, voice: meta.voice, dir });
  }
  return out;
}

export async function getAvatar(id: string): Promise<SavedAvatar> {
  const a = (await listAvatars()).find((x) => x.id === id || slugify(x.name) === slugify(id));
  if (!a) throw new Error(`No hay un avatar guardado con el nombre «${id}». Crea uno con crear_avatar y guárdalo con guardar_avatar.`);
  return a;
}

/** Guarda un avatar (su cara y, si se dan, sus fondos y su voz) para usarlo en videos futuros. */
export async function saveAvatar(opts: { name: string; face: string; description?: string; voice?: { provider?: TtsProvider; voice?: string }; backgrounds?: Partial<Record<Background, string>>; thumbnails?: string[] }): Promise<SavedAvatar> {
  const id = slugify(opts.name);
  const dir = path.join(AVATARS_DIR, id);
  await mkdir(path.join(dir, 'miniaturas'), { recursive: true });
  await copyFile(opts.face, path.join(dir, 'cara.png'));
  // Miniatura liviana para la galería del estudio.
  await ffmpeg(['-i', opts.face, '-vf', 'scale=270:-2', '-q:v', '4', path.join(dir, 'cara-mini.jpg')]).catch(() => {});
  for (const [k, f] of Object.entries(opts.backgrounds ?? {})) if (f) await copyFile(f, path.join(dir, `fondo-${k}.png`));
  for (const [i, f] of (opts.thumbnails ?? []).entries()) await copyFile(f, path.join(dir, 'miniaturas', `m${i + 1}${path.extname(f)}`));
  await writeFile(path.join(dir, 'avatar.json'), JSON.stringify({ name: opts.name, description: opts.description, voice: opts.voice }, null, 2));
  return { id, name: opts.name, description: opts.description, voice: opts.voice, dir };
}

/** Fondos que usa el reel: estudio blanco, habitación de noche, liso claro/oscuro y una computadora moderna. */
export type Background = 'estudio' | 'noche' | 'claro' | 'oscuro' | 'pc';

// ───────────────────────── Biblioteca de material ─────────────────────────

/**
 * Grabaciones de la app etiquetadas por lo que muestran (workspace/marca/pantallas/biblioteca.json):
 * el reel elige la que corresponde a cada frase («subtítulos» → el editor, «exportar» → exportar…).
 */
export interface LibraryClip { file: string; start?: number; end?: number; tags: string[]; light?: boolean }
const LIBRARY = path.join(WORKSPACE, 'marca', 'pantallas', 'biblioteca.json');

export async function readLibrary(): Promise<LibraryClip[]> {
  if (!existsSync(LIBRARY)) return [];
  return JSON.parse(await readFile(LIBRARY, 'utf8')) as LibraryClip[];
}

export async function tagLibraryClip(clip: LibraryClip): Promise<LibraryClip[]> {
  const list = (await readLibrary()).filter((c) => !(c.file === clip.file && c.start === clip.start));
  list.push(clip);
  await mkdir(path.dirname(LIBRARY), { recursive: true });
  await writeFile(LIBRARY, JSON.stringify(list, null, 2));
  return list;
}

/**
 * Etiqueta sola la biblioteca: cada grabación de workspace/marca/pantallas que aún no esté en
 * biblioteca.json la mira la IA que ve imágenes (3 fotogramas) y le pone etiquetas de lo que muestra.
 */
export async function autoTagLibrary(onProgress: (m: string) => void = () => {}): Promise<LibraryClip[]> {
  const model = await visionReady();
  if (!model) throw new Error('Falta la IA que ve imágenes (qwen3-vl): instálala en Ajustes › IA.');
  const root = path.join(WORKSPACE, 'marca', 'pantallas');
  const walk = async (d: string): Promise<string[]> => (await Promise.all((await readdir(d, { withFileTypes: true })).map((e) => e.isDirectory() ? (e.name === 'descartadas' ? [] : walk(path.join(d, e.name))) : /\.(mp4|mov|m4v|webm)$/i.test(e.name) ? [path.join(d, e.name)] : []))).flat();
  const known = new Set((await readLibrary()).map((c) => c.file));
  const files = (await walk(root)).map((f) => path.relative(root, f).split(path.sep).join('/')).filter((f) => !known.has(f));
  let list = await readLibrary();
  for (const [i, rel] of files.entries()) {
    checkCancelled();
    onProgress(`Mirando ${rel} (${i + 1} de ${files.length})…`);
    const src = path.join(root, rel);
    const dur = await videoDuration(src).catch(() => 10);
    const frames: string[] = [];
    for (const k of [0.2, 0.5, 0.8]) {
      const f = path.join(root, `.etiqueta-${i}-${k}.jpg`);
      await ffmpeg(['-ss', (dur * k).toFixed(2), '-i', src, '-frames:v', '1', '-vf', 'scale=-2:540', '-q:v', '4', f]);
      frames.push(f);
    }
    try {
      const r = await visionJson<{ etiquetas: string[]; claro: boolean }>(
        'Describes grabaciones de pantalla de una app de edición de video para elegir cuál mostrar cuando la voz habla de algo.',
        'Estos son 3 fotogramas de una grabación. Devuelve de 4 a 10 etiquetas cortas en español, en minúsculas y sin tildes, de lo que se ve o se hace (por ejemplo: subtitulos, linea de tiempo, exportar, guion, musica, nuevo video, brief, plantillas). Y si la pantalla es de fondo claro.',
        frames, { type: 'object', properties: { etiquetas: { type: 'array', items: { type: 'string' } }, claro: { type: 'boolean' } }, required: ['etiquetas', 'claro'] },
      );
      list = await tagLibraryClip({ file: rel, start: 0, end: Math.min(dur, 10), tags: r.etiquetas.map((t) => t.split(/\s+/).map(norm).filter(Boolean).join(' ')).filter(Boolean), light: r.claro });
    } finally {
      for (const f of frames) await import('node:fs/promises').then((m) => m.rm(f, { force: true }));
    }
  }
  return list;
}

/**
 * Una frase por toma de un proyecto (qué se ve), con la IA que ve imágenes: queda en shots.json
 * («desc») y ayuda a elegir la toma que corresponde a cada frase.
 */
export async function describeShots(dir: string, onProgress: (m: string) => void = () => {}): Promise<{ id: string; desc: string }[]> {
  if (!(await visionReady())) throw new Error('Falta la IA que ve imágenes (qwen3-vl): instálala en Ajustes › IA.');
  const { detectShots } = await import('./montage.ts');
  const shots = await detectShots(dir) as (Awaited<ReturnType<typeof detectShots>>[number] & { desc?: string })[];
  const project = await readProject(dir);
  const source = path.join(dir, 'proxies', 'proxy.mp4');
  const out: { id: string; desc: string }[] = [];
  for (const [i, s] of shots.entries()) {
    checkCancelled();
    if (s.desc) { out.push({ id: s.id, desc: s.desc }); continue; }
    onProgress(`Describiendo la toma ${i + 1} de ${shots.length}…`);
    const f = path.join(dir, 'proxies', `.desc-${s.id}.jpg`);
    await ffmpeg(['-ss', ((s.start + s.end) / 2).toFixed(2), '-i', existsSync(source) ? source : path.join(dir, project.source.file), '-frames:v', '1', '-vf', 'scale=-2:448', '-q:v', '4', f]);
    try {
      const r = await visionJson<{ descripcion: string }>('Describes fotogramas de video en español, en una frase corta y concreta (qué se ve y qué pasa), sin adornos.', 'Describe este fotograma en máximo 12 palabras.', [f], { type: 'object', properties: { descripcion: { type: 'string' } }, required: ['descripcion'] });
      s.desc = r.descripcion.trim();
      out.push({ id: s.id, desc: s.desc });
    } finally { await import('node:fs/promises').then((m) => m.rm(f, { force: true })); }
  }
  await writeFile(path.join(dir, 'shots.json'), JSON.stringify(shots, null, 2));
  return out;
}

// ───────────────────────── Texto ─────────────────────────

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');

/** Palabras por segundo de la voz (ElevenLabs habla ~2,6; se mide si hay voz). */
export const WORDS_PER_SECOND = 2.6;

/** Frases del guion: por puntuación; las largas se parten en la coma más cercana a la mitad. */
export function scriptPhrases(script: string, maxWords = 16): string[] {
  const raw = script.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const out: string[] = [];
  for (const p of raw) {
    let rest = p;
    while (rest.split(' ').length > maxWords) {
      const words = rest.split(' ');
      let cut = -1;
      for (let d = 0; d < words.length / 2 && cut < 0; d++) for (const i of [Math.floor(words.length / 2) + d, Math.floor(words.length / 2) - d]) if (cut < 0 && i > 2 && i < words.length - 2 && /[,:;]$/.test(words[i])) cut = i;
      if (cut < 0) break;
      out.push(words.slice(0, cut + 1).join(' '));
      rest = words.slice(cut + 1).join(' ');
    }
    out.push(rest);
  }
  return out;
}

/** Palabras gigantes: 1–2 a la vez; las cortas (y, lo, la, de, tu…) van pegadas a la siguiente. */
export function chunkWords(words: { text: string; start: number }[]): { text: string; start: number; idx: number[] }[] {
  const out: { text: string; start: number; idx: number[] }[] = [];
  let cur: number[] = [];
  const clean = (i: number) => words[i].text.replace(/[.,;:«»"¿?¡!]/g, '');
  for (let i = 0; i < words.length; i++) {
    cur.push(i);
    const short = norm(words[i].text).length <= 3 && i + 1 < words.length && cur.length < 2;
    if (!short) { out.push({ text: cur.map(clean).join(' '), start: words[cur[0]].start, idx: cur }); cur = []; }
  }
  if (cur.length) out.push({ text: cur.map(clean).join(' '), start: words[cur[0]].start, idx: cur });
  return out;
}

// ───────────────────────── Plan de escenas ─────────────────────────

export type SceneKind = 'avatar' | 'pantalla-pc' | 'flotante' | 'chat' | 'pedido' | 'cierre';

export interface PlannedScene {
  phrase: string; kind: SceneKind;
  background?: Background; clip?: LibraryClip; light?: boolean;
}

const FEATURE = /(subtitul|corta|cortes|pausa|animaci|motion|musica|linea de tiempo|edit|export|reels|tiktok|guion|graba|plantilla|estilo|color|ritmo|texto|dibujad|avatar)/;

/** Qué se ve en cada frase: reglas simples sobre lo que dice (y que no se repita lo mismo seguido). */
export function planScenes(phrases: string[], library: LibraryClip[]): PlannedScene[] {
  const bgs: Background[] = ['noche', 'estudio'];
  let bgTurn = 0, lightTurn = 0;
  const out: PlannedScene[] = phrases.map((phrase, i) => {
    const n = norm(phrase.replace(/\s+/g, '_')).replace(/_/g, ' ');
    const t = phrase.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (i === phrases.length - 1) return { phrase, kind: 'cierre' };
    if (i === 0) return { phrase, kind: 'avatar', background: 'estudio' };
    if (/\b(link|enlace|mandas|mandale|pegas|envias|adjunt)/.test(t)) return { phrase, kind: 'chat', light: (lightTurn++ % 2) === 0 };
    if (/\b(pides|pidele|dile|dices|hablando|preguntale)\b/.test(t)) return { phrase, kind: 'pedido' };
    if (/\b(problema|no sabe|no puede|pero)\b/.test(t) && i < 4) return { phrase, kind: 'pantalla-pc' };
    const clip = pickClip(t, library);
    if (clip && FEATURE.test(t)) return { phrase, kind: 'flotante', clip, light: clip.light ?? (lightTurn++ % 2) === 0 };
    void n;
    return { phrase, kind: 'avatar', background: (i % 3 === 0 ? undefined : bgs[bgTurn++ % 2]) };
  });
  // Nunca cuatro escenas sin la persona seguidas: una del medio pasa a ser ella hablando.
  const person = (k: SceneKind) => k === 'avatar' || k === 'pedido' || k === 'cierre';
  for (let i = 3; i < out.length; i++) if (![out[i - 3], out[i - 2], out[i - 1], out[i]].some((s) => person(s.kind))) out[i - 1] = { phrase: out[i - 1].phrase, kind: 'avatar', background: bgs[bgTurn++ % 2] };
  return out;
}

/** La grabación de la biblioteca que más etiquetas comparte con la frase. */
export function pickClip(text: string, library: LibraryClip[]): LibraryClip | undefined {
  const t = norm(text.replace(/\s+/g, ' '));
  let best: LibraryClip | undefined, score = 0;
  for (const c of library) {
    const s = c.tags.filter((tag) => t.includes(norm(tag))).length;
    if (s > score) { best = c; score = s; }
  }
  return best;
}

// ───────────────────────── Reel completo ─────────────────────────

export interface CreatorReelOptions {
  /** Lo que dice (si falta, se escribe con la IA local a partir de la idea y la referencia). */
  script?: string;
  idea?: string;
  /** Id de una referencia analizada (su estructura guía el guion). */
  reference?: string;
  duration?: number;
  /** Un avatar guardado o un video tuyo hablando a cámara. */
  avatar?: string;
  video?: string;
  client?: string;
  name?: string;
  /** La palabra que se pide comentar («editor»): sale en caja amarilla al final. */
  cta?: string;
  provider?: TtsProvider;
  voice?: string;
  music?: string;
  brief?: Record<string, string>;
  /** Borrador rápido: la cara quieta (sin animar) y exportación liviana, para revisar antes de la versión final. */
  preview?: boolean;
  onProgress?: (message: string, progress: number) => void;
}

/** Guion a la duración pedida (IA local). Con Claude, mejor que lo escriba Claude y lo pase en «script». */
export async function writeCreatorScript(opts: { idea: string; duration: number; reference?: string; client?: string; cta?: string; brand?: string }): Promise<string> {
  if (!(await llmReady())) throw new Error('Para escribir el guion sin Claude hace falta la IA local; o pásalo ya escrito.');
  const words = Math.round(opts.duration * WORDS_PER_SECOND);
  const ref = opts.reference ? (await listReferences(opts.client).catch(() => [])).find((r) => r.id === opts.reference) : undefined;
  const refNote = ref?.understanding ? `Sigue la FORMA de esta referencia (no copies sus frases): ${ref.understanding.formato}; gancho: ${ref.understanding.gancho}; partes: ${ref.understanding.estructura.map((x) => x.parte).join(' → ')}.` : '';
  const r = await llmJson<{ guion: string }>(
    `Eres guionista de reels en español latino. Escribes lo que dice una persona a cámara: frases cortas, ritmo rápido, un gancho fuerte al inicio y una llamada a la acción clara al final. Nunca inventas datos, precios ni resultados. Solo afirmas lo que dice el tema: no prometes tiempos («en segundos»), resultados ni funciones que el tema no menciona.`,
    `Tema: ${opts.idea}\nMarca: ${opts.brand ?? opts.client ?? ''}\nDuración: ${opts.duration} s (unas ${words} palabras, ni más ni menos).\n${refNote}\n${opts.cta ? `Cierra pidiendo que comenten «${opts.cta}».` : ''}\nDevuelve solo el texto hablado.`,
    { type: 'object', properties: { guion: { type: 'string' } }, required: ['guion'] },
    { temperature: 0.6, timeoutMs: 240_000 },
  );
  // La IA suele quedarse corta: se le piden solo las frases que faltan y se meten antes del
  // cierre (los modelos chicos no alargan bien un texto entero). Si se pasa, se recorta.
  let text = r.guion.trim();
  for (let i = 0; i < 4; i++) {
    const n = text.split(/\s+/).filter(Boolean).length;
    if (Math.abs(n - words) <= words * 0.15) break;
    if (n < words) {
      const missing = words - n, k = Math.max(1, Math.round(missing / 10));
      const add = await llmJson<{ frases: string[] }>(
        'Eres guionista de reels en español latino. Escribes frases cortas y concretas para alargar un guion, sin inventar datos ni repetir lo que ya dice. Solo afirmas lo que dice el tema: no prometes tiempos («en segundos»), resultados ni funciones que el tema no menciona.',
        `Tema: ${opts.idea}\nGuion actual:\n${text}\n\nEscribe exactamente ${k} frases nuevas (unas ${missing} palabras en total) con más detalle concreto: qué hace, cómo funciona o para quién es. No repitas frases del guion ni pongas la llamada a la acción.`,
        { type: 'object', properties: { frases: { type: 'array', items: { type: 'string' } } }, required: ['frases'] },
        { temperature: 0.6, timeoutMs: 240_000 },
      );
      const parts = scriptPhrases(text, 99);
      const close = parts.length > 1 ? parts.pop()! : '';
      text = [...parts, ...add.frases.map((f) => f.trim()).filter(Boolean), close].join(' ').replace(/\s+/g, ' ').trim();
    } else {
      const parts = scriptPhrases(text, 99);
      // Se quitan frases del medio (nunca el gancho ni el cierre) hasta caber.
      while (parts.length > 3 && parts.join(' ').split(/\s+/).length > words * 1.1) parts.splice(Math.floor(parts.length / 2), 1);
      text = parts.join(' ');
    }
  }
  return text;
}

/** Las palabras de una frase dentro de la transcripción (desde «from»): índice de la primera. */
function findPhrase(words: { n: string }[], phrase: string, from: number): number {
  const first = phrase.split(/\s+/).map(norm).filter(Boolean).slice(0, 3);
  for (let i = from; i < words.length; i++) if (first.every((p, k) => words[i + k]?.n === p)) return i;
  for (let i = from; i < words.length; i++) if (words[i].n === first[0]) return i;
  return from;
}

const cacheKey = (...parts: string[]) => createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);

/** Hace el reel completo. Devuelve la carpeta del proyecto, el video y lo que encontró la revisión. */
export async function createCreatorReel(opts: CreatorReelOptions): Promise<{ dir: string; file: string; warnings: string[]; script: string }> {
  const say = (m: string, p: number) => { checkCancelled(); opts.onProgress?.(m, p); };
  const duration = opts.duration ?? 60;
  // 1. Guion.
  let script = opts.script?.trim() ?? '';
  if (!script) {
    say('Escribiendo el guion…', 0.01);
    script = await writeCreatorScript({ idea: opts.idea ?? 'Presentar la marca', duration, reference: opts.reference, client: opts.client, cta: opts.cta });
  }
  // 2. Quién habla: un avatar guardado (voz + cara animada + nitidez, con caché) o tu video.
  let talking = opts.video;
  let avatar: SavedAvatar | undefined;
  if (!talking) {
    avatar = await getAvatar(opts.avatar ?? (await listAvatars())[0]?.id ?? '');
    const cache = path.join(avatar.dir, 'cache');
    await mkdir(cache, { recursive: true });
    const provider = opts.provider ?? avatar.voice?.provider;
    const voice = opts.voice ?? avatar.voice?.voice;
    const key = cacheKey(script, provider ?? '', voice ?? '');
    const audio = path.join(cache, `${key}-voz.wav`);
    if (!existsSync(audio)) { say('Generando la voz…', 0.04); await synthesize(script, audio, { provider, voice }); }
    if (opts.preview) {
      // Borrador: la foto del avatar con la voz, a 15 cuadros por segundo (rápido de recortar y exportar).
      const still = path.join(cache, `${key}-borrador.mp4`);
      if (!existsSync(still)) { say('Preparando el borrador…', 0.1); await ffmpeg(['-loop', '1', '-framerate', '15', '-i', path.join(avatar.dir, 'cara.png'), '-i', audio, '-shortest', '-vf', 'scale=864:1536,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k', still]); }
      talking = still;
    }
    const raw = path.join(cache, `${key}-avatar.mp4`);
    if (!talking && !existsSync(raw)) await avatarSpeak(path.join(avatar.dir, 'cara.png'), audio, raw, { onProgress: (m) => say(m, 0.1) });
    const clear = path.join(cache, `${key}-nitida.mp4`);
    if (!talking && !existsSync(clear)) { say('Dando nitidez a la cara…', 0.45); await enhanceFaces(raw, clear); }
    talking ??= clear;
  }
  // 3. Proyecto, transcripción con el guion (palabras bien escritas) y recorte de la persona.
  say('Preparando el proyecto…', 0.62);
  const { dir } = await createProject({ input: talking, name: `${opts.name ?? `${opts.client ?? 'Reel'} · ${script.split(' ').slice(0, 5).join(' ')}`}${opts.preview ? ' (borrador)' : ''}`, client: opts.client });
  await prepareMedia(dir, () => {});
  await transcribeProject(dir, () => {}, { script });
  say('Recortando a la persona…', 0.68);
  await buildCutout(dir, () => {});
  // 4. Escenas.
  say('Armando las escenas…', 0.74);
  await planCreatorScenes(dir, { script, avatar, cta: opts.cta, brief: opts.brief, reference: opts.reference });
  if (opts.music) await setMusic(dir, opts.music, { source: 'archivo local', license: 'CC0', volume: 0.1 }).catch(() => {});
  await setAutoSfx(dir, true).catch(() => {});
  // 5. Exportar y revisar.
  say('Exportando…', 0.8);
  const file = (await renderProject(dir, { quality: opts.preview ? 'ligera' : undefined, onProgress: (p) => say('Exportando…', 0.8 + p * 0.17) })).out;
  say('Revisando el video…', 0.98);
  const warnings = await reviewCreatorReel(dir, String(file), duration);
  say('Listo', 1);
  return { dir, file: String(file), warnings, script };
}

/**
 * Las escenas de un reel de creador sobre un proyecto ya transcrito: una por frase, con lo que
 * se ve elegido por planScenes, palabras gigantes y objetos automáticos.
 */
export async function planCreatorScenes(dir: string, opts: { script: string; avatar?: SavedAvatar; cta?: string; brief?: Record<string, string>; reference?: string }) {
  const project = await readProject(dir);
  const tr = (await readTranscript(dir))!;
  const words = tr.words.map((w) => ({ ...w, n: norm(w.text) }));
  const lastEnd = words[words.length - 1].end + 0.35;
  const library = await readLibrary();
  // La referencia (si hay): si sus textos van abajo, aquí también (en las escenas sin persona).
  const ref = opts.reference ? (await listReferences(project.client).catch(() => [])).find((r) => r.id === opts.reference) : undefined;
  const refLow = (ref?.captions?.y ?? 0.2) > 0.6;
  const phrases = scriptPhrases(opts.script);
  const plan = planScenes(phrases, library);
  // Material de la escena: fondos y miniaturas del avatar, y los clips de la biblioteca recortados.
  const B = path.join(dir, 'media', 'broll');
  await mkdir(B, { recursive: true });
  const bg = async (k: Background) => {
    const src = opts.avatar ? path.join(opts.avatar.dir, `fondo-${k}.png`) : '';
    if (!src || !existsSync(src)) return undefined;
    await copyFile(src, path.join(B, `fondo-${k}.png`));
    return `media/broll/fondo-${k}.png`;
  };
  const thumbs: string[] = [];
  if (opts.avatar && existsSync(path.join(opts.avatar.dir, 'miniaturas'))) {
    for (const f of (await readdir(path.join(opts.avatar.dir, 'miniaturas'))).slice(0, 6)) { await copyFile(path.join(opts.avatar.dir, 'miniaturas', f), path.join(B, `mini-${f}`)); thumbs.push(`media/broll/mini-${f}`); }
  }
  const clipFile = async (c: LibraryClip, i: number) => {
    const out = `media/broll/clip-${i}${path.extname(c.file)}`;
    const src = path.isAbsolute(c.file) ? c.file : path.join(WORKSPACE, 'marca', 'pantallas', c.file);
    await ffmpeg(['-ss', String(c.start ?? 0), '-i', src, ...(c.end ? ['-t', String(c.end - (c.start ?? 0))] : ['-t', '10']), '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', path.join(dir, out)]);
    return out;
  };
  const brand = (project.client ?? '').replace(/-/g, ' ');
  const starts: number[] = [];
  let from = 0;
  for (const p of phrases) { const i = starts.length === 0 ? 0 : findPhrase(words, p, from); starts.push(i); from = i + 1; }
  const secAt = (i: number) => (i === 0 ? 0 : words[i].start - 0.05);
  // Nunca más de 8 s seguidos sin la persona: la escena que se pasa vuelve a ser ella hablando.
  let away = 0, turn = 0;
  for (const [si, sc] of plan.entries()) {
    const d = (si + 1 < plan.length ? secAt(starts[si + 1]) : lastEnd) - secAt(starts[si]);
    const person = sc.kind === 'avatar' || sc.kind === 'pedido' || sc.kind === 'cierre';
    if (person) { away = 0; continue; }
    if (away > 0 && away + d > 8) { plan[si] = { phrase: sc.phrase, kind: 'avatar', background: (['noche', 'estudio'] as Background[])[turn++ % 2] }; away = 0; }
    else away += d;
  }
  const base = project.scenes[0];
  const assets: string[] = [];
  const scenes = [];
  for (const [si, sc] of plan.entries()) {
    const a = starts[si], b = si + 1 < plan.length ? starts[si + 1] : words.length;
    const s0 = secAt(a), s1 = si + 1 < plan.length ? secAt(starts[si + 1]) : lastEnd;
    if (s1 - s0 < 0.3) continue;
    const rel = (t: number) => Math.max(0, t - s0 - 0.03);
    const els: Record<string, unknown>[] = [];
    const dark = sc.kind === 'pantalla-pc' ? true : sc.kind === 'flotante' || sc.kind === 'chat' ? !sc.light : sc.background !== 'estudio';
    const color = sc.kind === 'flotante' && sc.light ? 'rojo' : sc.kind === 'chat' && sc.light ? 'negro' : !dark ? 'rojo' : si % 4 === 3 ? 'amarillo' : 'blanco';
    const person = sc.kind === 'avatar' || sc.kind === 'pedido' || sc.kind === 'cierre';
    const y = person ? 0.12 : sc.kind === 'chat' ? 0.13 : refLow ? 0.84 : 0.15;
    // Palabras gigantes, con remarcados automáticos: la marca y la palabra a comentar en caja
    // amarilla, la acción negada («no sabe editar») tachada.
    if (sc.kind !== 'pantalla-pc') {
      const chunks = chunkWords(words.slice(a, b));
      for (const [ci, c] of chunks.entries()) {
        const prev = ci > 0 ? norm(chunks[ci - 1].text) : '';
        const special: Record<string, unknown> =
          (opts.cta && norm(c.text) === norm(opts.cta)) || (brand && norm(c.text).includes(norm(brand)) && si === 0) ? { style: 'resaltado', color: 'negro', size: 1.1 }
          : /^no/.test(prev) && /(ar|er|ir)$/.test(norm(c.text)) ? { style: 'tachado' }
          : si === 0 && /(edito|hizo|creo|armo)$/.test(norm(c.text)) ? { style: 'seleccion', size: 0.9 }
          : {};
        els.push({ text: c.text, at: rel(c.start), style: 'gigante', color, x: 0.5, y, size: 1, behind: person && !sc.background, ...special });
      }
    }
    // Objetos según lo que se dice.
    const t = sc.phrase.toLowerCase();
    const pct = sc.phrase.match(/(\d{1,3}) ?%/);
    if (si === 0 && thumbs.length) els.push({ text: '', at: 0, until: Math.min(3, s1 - s0), style: 'miniaturas', files: thumbs, x: 0.5, y: 0.5, size: 0.85, behind: false });
    if (pct) els.push({ text: `dato|${pct[1]}%`, at: 0.4, style: 'tarjeta', x: 0.26, y: 0.3, size: 1.1, behind: false });
    if (sc.kind === 'pedido') els.push({ text: sc.phrase.replace(/^[^,]*,\s*/, '').slice(0, 40), at: 0.3, style: 'mic', x: 0.64, y: 0.68, size: 1.1, behind: false });
    if (sc.kind === 'chat') els.push({ text: sc.phrase.slice(0, 70), at: 0, then: Math.max(0.5, (s1 - s0) * 0.55), style: 'chat', x: 0.5, y: 0.57, size: 1, files: thumbs.slice(2, 3), behind: false });
    if (sc.kind === 'pantalla-pc') {
      const w = sc.phrase.toUpperCase().replace(/[.,:;¿?¡!]/g, '').split(' ');
      const half = Math.ceil(w.length / 2);
      const line = (x: string[]) => x.reduce((acc, word) => { const last = acc[acc.length - 1]; if (last && (last + ' ' + word).length <= 14) acc[acc.length - 1] = `${last} ${word}`; else acc.push(word); return acc; }, [] as string[]).slice(0, 3).join('\n');
      els.push({ text: `${line(w.slice(0, half))}|${line(w.slice(half)).replace(/(\S+)$/, '*$1*')}`, at: 0.2, then: (s1 - s0) * 0.5, style: 'pantalla', x: 0.5, y: 0.44, size: 1.1, behind: false });
      els.push({ text: '¿subtítulos?', at: 0, style: 'nota', color: 'blanco', x: 0.2, y: 0.31, size: 0.7, rotate: -8, behind: false });
      els.push({ text: '¡no olvidar! cortar las *pausas*', at: 0.3, style: 'nota', color: 'blanco', x: 0.8, y: 0.56, size: 0.8, rotate: 5, behind: false });
    }
    if (/(motion|animaci)/.test(t) && sc.kind !== 'flotante') els.push({ text: '', at: 0.2, style: 'ruta', x: 0.5, y: 0.3, size: 1.05, behind: false });
    if (/(reels|tiktok|shorts)/.test(t)) els.push({ text: 'Listo para Reels y TikTok', at: 0.3, style: 'pildora', x: 0.5, y: person ? 0.86 : 0.8, size: 1, behind: false });
    if (/\b(app|aplicacion|axioma)\b/.test(t) && person && si > 0) els.push({ text: 'axioma', at: 0.3, style: 'icono', x: 0.84, y: 0.22, size: 0.9, rotate: -6, behind: false });
    // Los objetos duran hasta el final de la escena (salvo que digan otra cosa).
    for (const e of els) if (!['gigante', 'resaltado', 'seleccion', 'tachado'].includes(String(e.style)) && e.until === undefined) e.until = s1 - s0;
    // Las palabras grandes no se pisan: cada una se va cuando entra la siguiente.
    const big = els.filter((e) => ['gigante', 'resaltado', 'seleccion', 'tachado'].includes(String(e.style))).sort((x, z) => Number(x.at) - Number(z.at));
    big.forEach((e, i) => { e.until = i + 1 < big.length ? Number(big[i + 1].at) : s1 - s0; });
    // Visual.
    let visual: 'original' | 'broll' = person ? 'original' : 'broll';
    let brollFile: string | undefined;
    let backdropFile: string | undefined;
    if (sc.kind === 'flotante' && sc.clip) { brollFile = await clipFile(sc.clip, si); assets.push(brollFile); }
    else if (sc.kind === 'chat') { brollFile = await bg(sc.light ? 'claro' : 'oscuro'); }
    else if (sc.kind === 'pantalla-pc') { brollFile = await bg('pc'); if (!brollFile) { visual = 'original'; } }
    else if (sc.background) backdropFile = await bg(sc.background);
    if (visual === 'broll' && !brollFile) visual = 'original';
    for (const f of [brollFile, backdropFile]) if (f) assets.push(f);
    scenes.push({
      ...base,
      id: `s${String(si + 1).padStart(2, '0')}`,
      title: sc.phrase.slice(0, 40),
      ranges: [{ start: s0, end: s1 }], trimStart: 0, trimEnd: 0,
      visual, brollFile: visual === 'broll' ? brollFile : undefined,
      videoFit: sc.kind === 'flotante' ? 'flotante' : undefined, floatBg: sc.kind === 'flotante' ? (sc.light ? 'claro' : 'oscuro') : undefined,
      frameY: person ? (backdropFile ? 0.18 : 0.2) : undefined,
      backdrop: backdropFile ? 'imagen' : 'ninguno', backdropFile,
      camera: person ? 'respirar' : 'ninguno', cameraAmount: 0.08,
      punchZoom: true,
      transition: si === 0 ? undefined : { id: ['giro', 'zoom', 'golpe', 'rotar'][si % 4] },
      onScreenText: undefined, autoText: undefined, variants: [], sfx: [],
      words: els.map((e) => ({ color: 'blanco', behind: false, x: 0.5, y: 0.5, size: 1, ...e })),
    });
  }
  project.scenes = scenes as never;
  for (const file of [...new Set(assets)]) if (!project.assets.some((x) => x.file === file)) project.assets.push({ file, kind: 'broll', source: 'Material del reel (fondos del avatar o grabación de la app)', license: 'propia / generada con IA' } as never);
  project.audio.originalVolume = 1;
  project.briefAppliedAt = new Date().toISOString();
  project.brief = { formato: 'Reel 9:16', ritmo: 'Rápido', duracion: `${Math.round(lastEnd)} s`, ...(opts.cta ? { cta: `Comenta «${opts.cta}»` } : {}), ...project.brief, ...opts.brief };
  await writeProject(dir, project);
  return project;
}

// ───────────────────────── Revisión automática ─────────────────────────

/**
 * Revisa el video exportado antes de entregarlo: duración, tramos en negro, palabras repetidas
 * seguidas y escenas sin la persona demasiado largas. Devuelve avisos en palabras simples.
 */
export async function reviewCreatorReel(dir: string, file: string, target?: number): Promise<string[]> {
  const out: string[] = [];
  const dur = Number((await ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file])).stdout.trim());
  if (target && Math.abs(dur - target) > Math.max(3, target * 0.1)) out.push(`Dura ${dur.toFixed(0)} s y se pidió ${target} s: ajusta el largo del guion (unas ${Math.round(target * WORDS_PER_SECOND)} palabras).`);
  const black = (await ffmpeg(['-i', file, '-vf', 'blackdetect=d=0.4:pix_th=0.06', '-an', '-f', 'null', '-']).catch((e) => ({ stderr: String(e) }))).stderr ?? '';
  const n = (black.match(/black_start/g) ?? []).length;
  if (n) out.push(`Hay ${n} tramo(s) casi en negro de más de 0,4 s: revisa las transiciones o los fondos oscuros.`);
  const project = await readProject(dir);
  for (const s of project.scenes) {
    const w = (s.words ?? []).filter((x) => x.style === 'gigante').map((x) => norm(x.text));
    for (let i = 1; i < w.length; i++) if (w[i] && w[i] === w[i - 1]) out.push(`La escena ${s.id} repite «${w[i]}» seguido.`);
  }
  let run = 0;
  for (const s of project.scenes) { run = s.visual === 'original' ? 0 : run + (s.ranges[0].end - s.ranges[0].start); if (run > 9) { out.push('Hay más de 9 s seguidos sin la persona: el público se va; intercala un plano de ella.'); break; } }
  await writeFile(path.join(dir, 'revision.json'), JSON.stringify({ at: new Date().toISOString(), file, duration: dur, warnings: out }, null, 2)).catch(() => {});
  return out;
}

export async function videoDuration(file: string): Promise<number> {
  return Number((await ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file])).stdout.trim());
}

/** Atajo para pruebas: el plan de escenas de un guion, sin tocar archivos. */
export function previewPlan(script: string, library: LibraryClip[] = []) {
  return planScenes(scriptPhrases(script), library).map((s) => ({ frase: s.phrase, escena: s.kind, fondo: s.background, clip: s.clip?.file }));
}

