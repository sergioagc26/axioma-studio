import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Project, Transcript } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { llmJson, llmReady } from './llm.ts';
import { probe } from './media.ts';
import * as ops from './ops.ts';
import { P, REPO_ROOT } from './paths.ts';
import { readProject, readTranscript } from './store.ts';

/**
 * Búsqueda en tu propio material: "una persona en la playa", "la pantalla del portátil",
 * "cuando hablo de precios". Se mira lo que se VE (CLIP, local) y lo que se DICE (la
 * transcripción) en todos los proyectos del cliente, y el momento elegido entra como b-roll.
 */

const MODELS = path.resolve(process.env.SE_MODELS_DIR ?? path.join(REPO_ROOT, '.modelos'));
const MODEL_ID = 'Xenova/clip-vit-base-patch32';
export const INDEX_FILE = 'indice-visual.json';
const INDEX_VERSION = 1;
const DIM = 512;
const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;

interface IndexItem { file: string; mtime: number; duration: number; image: boolean; frames: { t: number; v: string }[] }
interface IndexFile { version: number; model: string; items: IndexItem[] }

export interface LibraryHit {
  projectId: string;
  projectName: string;
  /** Archivo dentro del proyecto: el video del reel (proxy) o un b-roll. */
  file: string;
  /** Segundo del archivo donde está el momento. */
  t: number;
  /** Cuánto dura lo que se dijo (solo resultados por voz). */
  duration?: number;
  image: boolean;
  kind: 'se-ve' | 'se-dice';
  score: number;
  /** Lo que se dice en ese momento (resultados por voz). */
  text?: string;
}

// --- Modelo CLIP (imagen y texto en el mismo espacio) ---
type Clip = { image: (file: string) => Promise<Float32Array>; text: (q: string[]) => Promise<Float32Array[]> };
let clip: Promise<Clip> | null = null;

function getClip(): Promise<Clip> {
  clip ??= (async () => {
    const T = await import('@huggingface/transformers');
    T.env.cacheDir = MODELS;
    const [tok, txt, proc, vis] = await Promise.all([
      T.AutoTokenizer.from_pretrained(MODEL_ID),
      T.CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
      T.AutoProcessor.from_pretrained(MODEL_ID),
      T.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
    ]);
    return {
      image: async (file) => {
        const { image_embeds } = await (vis as any)(await (proc as any)(await T.RawImage.read(file)));
        return unit(Float32Array.from(image_embeds.data as Float32Array));
      },
      text: async (q) => {
        const { text_embeds } = await (txt as any)((tok as any)(q, { padding: true, truncation: true }));
        const d = text_embeds.data as Float32Array;
        return q.map((_, i) => unit(Float32Array.from(d.slice(i * DIM, (i + 1) * DIM))));
      },
    };
  })();
  clip.catch(() => { clip = null; });
  return clip;
}

export function unit(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const pack = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
const unpack = (s: string) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };

/** Archivos que se pueden buscar en un proyecto: el video del reel y sus b-rolls. */
async function searchableFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  if (existsSync(path.join(dir, P.proxy))) out.push(P.proxy.split(path.sep).join('/'));
  const broll = path.join(dir, 'media', 'broll');
  if (existsSync(broll)) for (const f of (await readdir(broll)).sort()) if (VIDEO.test(f) || IMAGE.test(f)) out.push(`media/broll/${f}`);
  return out;
}

async function readIndex(dir: string): Promise<IndexFile> {
  try {
    const idx = JSON.parse(await readFile(path.join(dir, INDEX_FILE), 'utf8')) as IndexFile;
    if (idx.version === INDEX_VERSION && idx.model === MODEL_ID) return idx;
  } catch { /* se crea */ }
  return { version: INDEX_VERSION, model: MODEL_ID, items: [] };
}

/** Cada cuántos segundos se mira un fotograma: 1 s en videos cortos, menos en los largos (máx. 150 fotogramas). */
export const frameStep = (duration: number) => Math.max(1, Math.ceil(duration / 150));

/**
 * Indexa lo que se ve en un proyecto (solo lo que cambió desde la última vez).
 * Devuelve cuántos archivos se indexaron de nuevo.
 */
export async function indexProject(dir: string, onProgress?: (msg: string) => void): Promise<number> {
  const idx = await readIndex(dir);
  const files = await searchableFiles(dir);
  let fresh = 0;
  const items: IndexItem[] = [];
  for (const rel of files) {
    const abs = path.join(dir, rel);
    const mtime = Math.round((await stat(abs)).mtimeMs);
    const old = idx.items.find((i) => i.file === rel && i.mtime === mtime);
    if (old) { items.push(old); continue; }
    const model = await getClip();
    const image = IMAGE.test(rel);
    const tmp = path.join(os.tmpdir(), `axioma-indice-${Date.now()}-${Math.floor(Math.random() * 1e4)}`);
    await mkdir(tmp, { recursive: true });
    try {
      let duration = 0;
      let step = 1;
      if (image) {
        await ffmpeg(['-i', abs, '-vf', 'scale=-2:256', '-q:v', '4', path.join(tmp, '000001.jpg')]);
      } else {
        duration = (await probe(abs)).duration;
        step = frameStep(duration);
        // Un fotograma en el centro de cada tramo de `step` segundos.
        await ffmpeg(['-ss', (step / 2).toFixed(2), '-i', abs, '-vf', `fps=1/${step},scale=-2:256`, '-q:v', '4', path.join(tmp, '%06d.jpg')]);
      }
      const shots = (await readdir(tmp)).filter((f) => f.endsWith('.jpg')).sort();
      const frames: IndexItem['frames'] = [];
      for (let i = 0; i < shots.length; i++) {
        if (i % 10 === 0) onProgress?.(`Mirando ${path.basename(rel)}… ${i}/${shots.length}`);
        const t = image ? 0 : Math.min(duration, step / 2 + i * step);
        frames.push({ t: +t.toFixed(2), v: pack(await model.image(path.join(tmp, shots[i]))) });
      }
      items.push({ file: rel, mtime, duration, image, frames });
      fresh++;
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
  if (fresh || items.length !== idx.items.length) await writeFile(path.join(dir, INDEX_FILE), JSON.stringify({ ...idx, items }));
  return fresh;
}

// --- Consulta ---
const translations = new Map<string, string>();

/** CLIP entiende inglés: la búsqueda en español se traduce con la IA local si está disponible. */
async function toEnglish(q: string): Promise<string> {
  const key = q.trim().toLowerCase();
  if (translations.has(key)) return translations.get(key)!;
  let out = q.trim();
  if (await llmReady()) {
    try {
      const r = await llmJson<{ en: string }>(
        'Translate the user\'s search into English, literally and just as short. Do not add details, adjectives or context that are not in the original. Reply only JSON.',
        q, { type: 'object', properties: { en: { type: 'string' } }, required: ['en'] }, { temperature: 0, timeoutMs: 45_000 },
      );
      if (r.en?.trim()) out = r.en.trim();
    } catch { /* se usa tal cual */ }
  }
  translations.set(key, out);
  return out;
}

/** Parecido mínimo (CLIP menos la línea base) para mostrar un resultado por imagen. */
export const MIN_SCORE = 0.1;

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ');

/** Momentos donde se dicen las palabras buscadas (todas, sin importar tildes). */
export function spokenHits(t: Transcript, query: string): { start: number; end: number; text: string; score: number }[] {
  const terms = fold(query).split(/\s+/).filter((w) => w.length > 2);
  if (!terms.length || !t.words.length) return [];
  const words = t.words.map((w) => ({ ...w, f: fold(w.text).trim() }));
  const out: { start: number; end: number; text: string; score: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    // ¿Están todos los términos cerca de esta palabra?
    if (!terms.some((term) => words[i].f.startsWith(term))) continue;
    // Ventana por tiempo (unos segundos alrededor), no por cantidad de palabras.
    const win = words.filter((w) => w.start >= words[i].start - 1.5 && w.start <= words[i].start + 3.5);
    const found = terms.filter((term) => win.some((w) => w.f.startsWith(term))).length;
    if (found < terms.length) continue;
    if (out.length && words[i].start - out[out.length - 1].start < 4) continue;
    out.push({ start: win[0].start, end: win[win.length - 1].end, text: win.map((w) => w.text).join(' '), score: found / terms.length });
  }
  return out;
}

/** Busca en todos los proyectos del cliente (o en todos si no hay cliente). */
/** Carpeta del cliente al que pertenece un proyecto (clientes/<carpeta>/proyectos/<reel>). */
export const clientFolder = (dir: string) => path.basename(path.dirname(path.dirname(path.resolve(dir))));

/** Busca en todos los proyectos del mismo cliente que `near` (o en todos si no se indica). */
export async function searchLibrary(opts: { query: string; near?: string; limit?: number; onProgress?: (msg: string) => void }): Promise<{ hits: LibraryHit[]; english: string }> {
  const query = opts.query.trim();
  if (query.length < 2) throw new Error('Escribe qué quieres encontrar (por ejemplo «manos escribiendo en el portátil»).');
  const all = (await ops.listProjects()).filter((p) => !opts.near || clientFolder(p.dir) === clientFolder(opts.near!));
  if (!all.length) return { hits: [], english: query };
  if (!existsSync(MODELS) || !existsSync(path.join(MODELS, 'Xenova', 'clip-vit-base-patch32'))) opts.onProgress?.('Descargando el modelo de visión (solo la primera vez)…');
  for (const [i, p] of all.entries()) {
    opts.onProgress?.(`Revisando tu material (${i + 1}/${all.length}): ${p.project.name}`);
    await indexProject(p.dir, opts.onProgress);
  }
  opts.onProgress?.('Buscando…');
  const english = await toEnglish(query);
  const model = await getClip();
  const [q] = await model.text([english]);
  // Línea base: qué tanto se parece cualquier imagen a una descripción vacía. Ayuda a no
  // premiar fotogramas que se parecen a todo.
  const [base] = await model.text(['a photo']);

  const visual: (LibraryHit & { v: Float32Array })[] = [];
  const spoken: LibraryHit[] = [];
  for (const p of all) {
    const idx = await readIndex(p.dir);
    for (const item of idx.items) {
      const scored = item.frames.map((f) => { const v = unpack(f.v); return { t: f.t, v, s: dot(v, q) - 0.5 * dot(v, base) }; });
      // Mejores momentos del archivo, separados al menos 4 s entre sí.
      scored.sort((a, b) => b.s - a.s);
      const picked: typeof scored = [];
      for (const s of scored) {
        if (picked.length >= 3) break;
        if (picked.every((x) => Math.abs(x.t - s.t) >= 4)) picked.push(s);
      }
      for (const s of picked) visual.push({ projectId: p.project.id, projectName: p.project.name, file: item.file, t: s.t, image: item.image, kind: 'se-ve', score: s.s, v: s.v });
    }
    const t = await readTranscript(p.dir);
    if (t) for (const h of spokenHits(t, query)) {
      spoken.push({ projectId: p.project.id, projectName: p.project.name, file: P.proxy.split(path.sep).join('/'), t: h.start, duration: h.end - h.start, image: false, kind: 'se-dice', score: h.score, text: h.text });
    }
  }
  visual.sort((a, b) => b.score - a.score);
  // Solo lo que se parece de verdad: un mínimo, cerca del mejor y sin repetir el mismo plano
  // (proyectos duplicados o tomas casi iguales).
  const best = visual[0]?.score ?? 0;
  const goodVisual: typeof visual = [];
  for (const h of visual) {
    if (h.score < MIN_SCORE || h.score < best - 0.035) break;
    if (goodVisual.some((g) => dot(g.v, h.v) > 0.95)) continue;
    goodVisual.push(h);
  }
  const limit = opts.limit ?? 12;
  const hits: LibraryHit[] = [...spoken.slice(0, Math.ceil(limit / 3)), ...goodVisual.map(({ v: _v, ...h }) => h)].slice(0, limit);
  return { hits: hits.map((h) => ({ ...h, score: +h.score.toFixed(3) })), english };
}

/**
 * Pone un momento de tu material como b-roll de una escena: se corta un tramo del video
 * original (con la mejor calidad, no la vista previa) o se usa la imagen.
 */
export async function useLibraryHit(dir: string, sceneId: string, hit: { projectId: string; file: string; t: number; duration?: number }, opts: { seconds?: number; asBackdrop?: boolean } = {}) {
  const src = (await ops.listProjects()).find((p) => p.project.id === hit.projectId);
  if (!src) throw new Error('Ese proyecto ya no existe.');
  const files = await searchableFiles(src.dir);
  if (!files.includes(hit.file)) throw new Error('Ese archivo ya no está en el proyecto.');
  const target = await readProject(dir);
  const scene = target.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`No existe la escena ${sceneId}.`);
  const isProxy = hit.file === P.proxy.split(path.sep).join('/');
  const abs = isProxy && existsSync(path.join(src.dir, P.master)) ? path.join(src.dir, P.master) : path.join(src.dir, hit.file);
  const srcAsset = (src.project as Project).assets.find((a) => a.file === hit.file);
  const license = srcAsset?.license ?? 'Material propio';
  const label = `Tu material: ${src.project.name}${IMAGE.test(hit.file) ? '' : ` (segundo ${hit.t.toFixed(1)})`}`;
  if (IMAGE.test(hit.file)) {
    return opts.asBackdrop ? ops.setBackdropFile(dir, sceneId, abs) : ops.setBroll(dir, sceneId, abs, { license, source: label, author: srcAsset?.author, url: srcAsset?.url });
  }
  const info = await probe(abs);
  const want = opts.seconds ?? Math.max(2.5, Math.min(6, hit.duration ?? 3.5));
  const start = Math.max(0, Math.min(hit.t - (hit.duration ? 0.1 : 1), info.duration - want));
  const tmpDir = path.join(os.tmpdir(), `axioma-material-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const out = path.join(tmpDir, `${src.project.id}-${Math.round(start * 10)}.mp4`.replace(/[^\w.-]+/g, '-'));
  try {
    await ffmpeg(['-ss', start.toFixed(3), '-i', abs, '-t', want.toFixed(3), '-map', '0:v:0', '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', out]);
    return opts.asBackdrop ? await ops.setBackdropFile(dir, sceneId, out) : await ops.setBroll(dir, sceneId, out, { license, source: label });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
