import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectShape } from '@axioma/schema';
import { editEverything } from './auto.ts';
import { ffmpeg } from './exec.ts';
import { saveClientLogo } from './kit.ts';
import { createMontage, detectShots, joinClips } from './montage.ts';
import { setBrief, setMusic } from './ops.ts';
import { APP_TMP, WORKSPACE, slugify } from './paths.ts';
import { prepareMedia, transcribeProject, cutProject } from './pipeline.ts';
import { analyzeReference } from './reference.ts';
import { renderProject } from './render.ts';
import { cutProjectToScript } from './scriptcut.ts';
import { createProject, readProject, writeProject } from './store.ts';
import { hasSpeech, transcribeWav } from './transcribe.ts';

/**
 * Pedidos: la forma más simple de usar la app. La persona deja sus videos en crudo en
 * «Para editar» (una carpeta por video, o un video suelto) y, si quiere, un pedido.txt, su guion,
 * un video de referencia, su logo y su música. La app reconoce cada archivo por su nombre, edita
 * sola y deja el video terminado en «Listos».
 */
export const INBOX_DIR = path.join(WORKSPACE, 'Para editar');
export const READY_DIR = path.join(WORKSPACE, 'Listos');
const STATE_FILE = path.join(INBOX_DIR, '.pedidos.json');

const VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const AUDIO = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const IMAGE = /\.(png|jpe?g|webp|svg)$/i;
const TEXT = /\.(txt|md)$/i;
const IGNORE = /^(\.|_|leeme|léeme|readme|plantilla)/i;

export interface OrderFiles {
  /** Lo grabado: lo que se edita. */
  videos: string[];
  /** Videos de referencia («quiero que se vea así»). */
  referencias: string[];
  guion?: string;
  pedido?: string;
  logo?: string;
  musica?: string;
  /** Otros archivos que la app no usa sola (imágenes, documentos). */
  otros: string[];
}

export type OrderStatus = 'pendiente' | 'editando' | 'listo' | 'error';

export interface OrderState {
  estado: OrderStatus;
  proyecto?: string;
  dir?: string;
  video?: string;
  at?: string;
  error?: string;
  resumen?: string[];
}

export interface Order {
  /** Nombre del pedido: la carpeta, o el video suelto sin extensión. */
  name: string;
  /** Carpeta del pedido, o el video suelto. */
  path: string;
  files: OrderFiles;
  state: OrderState;
}

const base = (f: string) => path.basename(f, path.extname(f)).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Reconoce cada archivo de un pedido por su nombre y su tipo. */
export function classifyFiles(files: string[]): OrderFiles {
  const out: OrderFiles = { videos: [], referencias: [], otros: [] };
  // Textos sin nombre conocido: el primero hace de pedido si no hay uno llamado así.
  const loose: string[] = [];
  for (const f of [...files].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))) {
    const b = base(f);
    const inRef = /(^|[\\/])referencias?([\\/]|$)/i.test(path.dirname(f));
    if (VIDEO.test(f)) {
      if (inRef || /^(referencia|ref)\b|^ref[-_ ]/.test(b)) out.referencias.push(f);
      else out.videos.push(f);
    } else if (AUDIO.test(f)) {
      if (!out.musica) out.musica = f; else out.otros.push(f);
    } else if (IMAGE.test(f)) {
      if (/^logo/.test(b) && !out.logo) out.logo = f; else out.otros.push(f);
    } else if (TEXT.test(f)) {
      if (/guion|script|libreto/.test(b) && !out.guion) out.guion = f;
      else if (/pedido|brief|instruc|indicac/.test(b) && !out.pedido) out.pedido = f;
      else loose.push(f);
    } else out.otros.push(f);
  }
  if (!out.pedido && loose.length) out.pedido = loose.shift();
  out.otros.push(...loose);
  out.otros.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  return out;
}

async function filesIn(dir: string, depth = 2): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (IGNORE.test(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth > 1) out.push(...(await filesIn(f, depth - 1))); } else out.push(f);
  }
  return out;
}

async function readStates(): Promise<Record<string, OrderState>> {
  return readFile(STATE_FILE, 'utf8').then((x) => JSON.parse(x)).catch(() => ({}));
}

async function saveState(name: string, s: OrderState) {
  const all = await readStates();
  all[name] = s;
  await mkdir(INBOX_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(all, null, 2));
}

export const ORDER_TEMPLATE = `PEDIDO — llena lo que quieras. Lo que dejes vacío lo decide Axioma.

Marca o cliente:
¿Qué es este video?:
¿Qué quieres que haga quien lo vea?:
¿Dónde lo vas a publicar?:
¿Cuánto debe durar?:
Ritmo o estilo:
Frase final (llamado a la acción):
Sí o sí debe salir / no debe salir:
`;

const README = `CÓMO PEDIR UN VIDEO

1. Crea aquí una carpeta con el nombre del video (por ejemplo: promo-noviembre).
2. Mete adentro lo que grabaste, tal cual salió del celular o la cámara.
3. Si quieres, agrega también (con estos nombres):
   - pedido.txt      → lo que quieres (copia la plantilla de la carpeta _plantilla)
   - guion.txt       → si grabaste leyendo un guion: el video se corta con él
   - referencia.mp4  → un video que te guste: se edita con su estilo
   - logo.png        → tu logo
   - musica.mp3      → tu canción (debe ser tuya o con licencia)
4. En Claude escribe:  hazme el video de promo-noviembre

El video terminado aparece en la carpeta «Listos».
`;

/** Crea «Para editar» y «Listos» (con sus instrucciones y la plantilla del pedido) si no existen. */
export async function ensureInbox() {
  await mkdir(path.join(INBOX_DIR, '_plantilla'), { recursive: true });
  await mkdir(READY_DIR, { recursive: true });
  const readme = path.join(INBOX_DIR, 'LEEME.txt');
  if (!existsSync(readme)) await writeFile(readme, README);
  const tpl = path.join(INBOX_DIR, '_plantilla', 'pedido.txt');
  if (!existsSync(tpl)) await writeFile(tpl, ORDER_TEMPLATE);
  return { inbox: INBOX_DIR, ready: READY_DIR };
}

/** Los pedidos de «Para editar»: una carpeta por pedido, o un video suelto. */
export async function listOrders(): Promise<Order[]> {
  await ensureInbox();
  const states = await readStates();
  const out: Order[] = [];
  for (const e of await readdir(INBOX_DIR, { withFileTypes: true })) {
    if (IGNORE.test(e.name)) continue;
    const p = path.join(INBOX_DIR, e.name);
    if (e.isDirectory()) {
      const files = classifyFiles(await filesIn(p));
      if (!files.videos.length && !files.referencias.length) continue;
      out.push({ name: e.name, path: p, files, state: states[e.name] ?? { estado: 'pendiente' } });
    } else if (VIDEO.test(e.name)) {
      const name = path.basename(e.name, path.extname(e.name));
      out.push({ name, path: p, files: { videos: [p], referencias: [], otros: [] }, state: states[name] ?? { estado: 'pendiente' } });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
}

/** Busca un pedido por su nombre (sin importar mayúsculas ni tildes). Si hay uno solo pendiente, ese. */
export async function findOrder(name?: string): Promise<Order> {
  const all = await listOrders();
  if (!all.length) throw new Error(`No hay videos en «Para editar» (${INBOX_DIR}). Deja ahí una carpeta con lo que grabaste.`);
  if (!name?.trim()) {
    const pending = all.filter((o) => o.state.estado !== 'listo');
    if (pending.length === 1) return pending[0];
    throw new Error(`Hay ${pending.length || all.length} pedidos: di cuál (${all.map((o) => o.name).join(', ')}).`);
  }
  const key = slugify(name);
  const hit = all.find((o) => slugify(o.name) === key) ?? all.find((o) => slugify(o.name).includes(key));
  if (!hit) throw new Error(`No encontré el pedido «${name}». Hay: ${all.map((o) => o.name).join(', ')}.`);
  return hit;
}

/** Claves del brief según la pregunta de la plantilla (o cualquier «Pregunta: respuesta»). */
const FIELDS: [RegExp, string][] = [
  [/marca|cliente|empresa|negocio/, 'cliente'],
  [/que es|de que (va|trata)|tema|sobre que/, 'notas'],
  [/que haga|objetivo|para que|meta/, 'objetivo'],
  [/donde|publica|red|plataforma|formato/, 'formato'],
  [/dura|largo|segundos|minutos/, 'duracion'],
  [/ritmo|estilo|velocidad/, 'ritmo'],
  [/tono|como (suena|habla)/, 'tono'],
  [/publico|para quien|audiencia/, 'publico'],
  [/frase final|llamado|cta|cierre/, 'cta'],
  [/si o si|no debe|debe salir|evitar|importante/, 'notas'],
];

/**
 * Lee un pedido escrito como quiera: líneas «Pregunta: respuesta» de la plantilla (las vacías se
 * ignoran) y el texto suelto como nota. Devuelve las respuestas del brief y el cliente si lo dice.
 */
export function parseOrder(text: string): { brief: Record<string, string>; client?: string } {
  const brief: Record<string, string> = {};
  const loose: string[] = [];
  let client: string | undefined;
  const add = (k: string, v: string) => { brief[k] = brief[k] ? `${brief[k]}. ${v}` : v; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^pedido\b.*(llena|vac[ií]o)/i.test(line) || /^#/.test(line)) continue;
    const m = line.match(/^([^:]{2,60}):\s*(.*)$/);
    if (m) {
      const q = m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?]/g, '');
      const v = m[2].trim();
      if (!v) continue;
      const key = FIELDS.find(([re]) => re.test(q))?.[1];
      if (key === 'cliente') client = v;
      else if (key) add(key, v);
      else loose.push(`${m[1].trim()}: ${v}`);
    } else loose.push(line);
  }
  if (loose.length) add('notas', loose.join(' '));
  return { brief, client };
}

/** Forma del video según dónde se publica: YouTube (no Shorts) va horizontal. */
export function shapeFor(formato?: string): ProjectShape {
  const f = (formato ?? '').toLowerCase();
  if (/youtube/.test(f) && !/short/.test(f)) return 'horizontal';
  if (/cuadrad|1:1/.test(f)) return 'cuadrado';
  return 'vertical';
}

let wavSeq = 0;

/** ¿Este video tiene a alguien hablando? Escucha sus primeros 45 s. Null si no se pudo saber. */
export async function videoHasSpeech(file: string): Promise<boolean | null> {
  // Nombre único: dos videos escuchados seguidos no pueden pisarse el audio.
  const wav = path.join(APP_TMP, `voz-${process.pid}-${++wavSeq}-${Date.now()}.wav`);
  try {
    await ffmpeg(['-y', '-t', '45', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
    return hasSpeech(await transcribeWav(wav));
  } catch {
    return null;
  } finally {
    await rm(wav, { force: true });
  }
}

export interface OrderResult {
  order: string;
  dir: string;
  kind: 'hablado' | 'montaje';
  out?: string;
  summary: string[];
  /** Videos sin voz que vinieron con un video hablado: Claude puede ponerlos como b-roll. */
  broll: string[];
}

/**
 * Hace el video de un pedido de principio a fin, sin preguntar: reconoce lo que hay (voz a cámara,
 * varias partes, video sin voz), usa el pedido, el guion, la referencia, el logo y la música si
 * vienen, edita todo con la IA y deja el video en «Listos».
 */
export async function makeOrder(name: string | undefined, opts: { client?: string; brief?: Record<string, string>; render?: boolean; onProgress?: (m: string) => void } = {}): Promise<OrderResult> {
  const say = (m: string) => opts.onProgress?.(m);
  const order = await findOrder(name);
  const f = order.files;
  if (!f.videos.length) throw new Error(`En «${order.name}» solo hay videos de referencia: falta lo que grabaste.`);
  await saveState(order.name, { estado: 'editando', at: new Date().toISOString() });
  try {
    const parsed = f.pedido ? parseOrder(await readFile(f.pedido, 'utf8')) : { brief: {} as Record<string, string>, client: undefined };
    const brief = { ...parsed.brief, ...(opts.brief ?? {}) };
    const client = opts.client || parsed.client || undefined;
    const shape = shapeFor(brief.formato);
    const summary: string[] = [];

    // 1. ¿Quién habla? Con un solo video lo dice la transcripción; con varios se escucha cada uno.
    say('Revisando lo que grabaste…');
    let talking = f.videos, silent: string[] = [];
    if (f.videos.length > 1) {
      // Uno por uno (whisper usa toda la máquina). Si no se pudo escuchar uno, se trata como
      // hablado: es peor perder una parte de lo que se dijo que sumar un clip sin voz.
      const voiced: (boolean | null)[] = [];
      for (const v of f.videos) voiced.push(await videoHasSpeech(v));
      talking = f.videos.filter((_, i) => voiced[i] !== false);
      silent = f.videos.filter((_, i) => voiced[i] === false);
    }

    let dir: string;
    let kind: 'hablado' | 'montaje';
    if (talking.length) {
      // 2a. Video hablado (una o varias partes, se unen en orden).
      let input = talking[0];
      let joined: string | undefined;
      if (talking.length > 1) {
        say(`Uniendo las ${talking.length} partes habladas…`);
        joined = path.join(APP_TMP, `${slugify(order.name)}-${Date.now()}.mp4`);
        await joinClips(talking, joined, shape);
        input = joined;
        summary.push(`Uní las ${talking.length} partes habladas en orden: ${talking.map((v) => path.basename(v)).join(', ')}.`);
      }
      ({ dir } = await createProject({ input, name: order.name, client, shape }));
      if (joined) await rm(joined, { force: true });
      say('Limpiando el audio…');
      await prepareMedia(dir, say);
      say('Escribiendo lo que dices…');
      const t = await transcribeProject(dir, say);
      kind = hasSpeech(t) ? 'hablado' : 'montaje';
      if (kind === 'hablado') {
        if (f.guion) {
          say('Cortando con tu guion…');
          const cut = await cutProjectToScript(dir, { text: await readFile(f.guion, 'utf8') });
          summary.push(`Corté con tu guion: ${cut.lines.filter((l) => l.found).length} de ${cut.lines.length} frases encontradas, ${cut.sourceDuration.toFixed(0)} s → ${cut.outputDuration.toFixed(0)} s.`);
          if (cut.missing.length) summary.push(`⚠ No encontré en la grabación: ${cut.missing.map((m) => `«${m}»`).join(', ')}.`);
        } else await cutProject(dir);
      } else if (talking.length === 1 && f.videos.length === 1) {
        // Un solo video que al final no tenía voz: se rehace como montaje (mejor que un hablado vacío).
        await rm(dir, { recursive: true, force: true });
        ({ dir } = await createMontage({ inputs: f.videos, name: order.name, client, shape }));
        await prepareMedia(dir, say);
        await detectShots(dir);
      }
    } else {
      // 2b. Nadie habla: montaje con todo lo grabado.
      kind = 'montaje';
      say('Armando el montaje con tus tomas…');
      ({ dir } = await createMontage({ inputs: f.videos, name: order.name, client, shape }));
      await prepareMedia(dir, say);
      await detectShots(dir);
      silent = [];
    }

    // 3. Lo que pidió, su marca y su música.
    if (Object.keys(brief).length) await setBrief(dir, brief);
    if (f.logo) {
      await saveClientLogo((await readProject(dir)).client, f.logo).then(() => summary.push(`Logo: ${path.basename(f.logo!)}.`)).catch((e) => summary.push(`No pude usar el logo: ${e instanceof Error ? e.message : e}`));
    }
    if (f.musica) {
      await setMusic(dir, f.musica, { license: 'del cliente (la trajo en su pedido)' });
      summary.push(`Música: ${path.basename(f.musica)} (la que trajiste).`);
    }
    let referenceId: string | undefined;
    if (f.referencias.length) {
      say('Mirando el estilo de tu referencia…');
      try {
        const { report } = await analyzeReference(f.referencias[0], { client: (await readProject(dir)).client, name: `${order.name} (referencia)` });
        referenceId = report.id;
        const p = await readProject(dir);
        p.brief.referencia = report.id;
        await writeProject(dir, p);
        summary.push(`Edité con el estilo de ${path.basename(f.referencias[0])}.`);
      } catch (e) {
        summary.push(`No pude leer la referencia: ${e instanceof Error ? e.message : e}`);
      }
    }

    // 4. La edición completa.
    say('Editando todo…');
    summary.push(...(await editEverything(dir, { referenceId, onProgress: say })).summary);
    kind = (await readProject(dir)).kind === 'montaje' ? 'montaje' : 'hablado';
    if (silent.length) summary.push(`Hay ${silent.length} video(s) sin voz que se pueden usar de apoyo: ${silent.map((v) => path.basename(v)).join(', ')}.`);

    // 5. Exportar a «Listos».
    let out: string | undefined;
    if (opts.render !== false) {
      say('Exportando…');
      out = await deliverOrder(order.name, dir);
    }
    const p = await readProject(dir);
    await saveState(order.name, { estado: out ? 'listo' : 'editando', proyecto: p.id, dir, video: out, at: new Date().toISOString(), resumen: summary });
    return { order: order.name, dir, kind, out, summary, broll: silent };
  } catch (e) {
    await saveState(order.name, { ...(await readStates())[order.name], estado: 'error', at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Exporta el proyecto de un pedido y deja el video (y su resumen) en «Listos/<pedido>.mp4». */
export async function deliverOrder(name: string, dir: string): Promise<string> {
  await mkdir(READY_DIR, { recursive: true });
  const { out } = await renderProject(dir);
  const ext = path.extname(out) || '.mp4';
  let dest = path.join(READY_DIR, `${name}${ext}`);
  // Si ya había uno, el anterior se conserva con la fecha.
  if (existsSync(dest)) {
    const old = (await stat(dest)).mtime.toISOString().slice(0, 16).replace(/[:T]/g, '-');
    await copyFile(dest, path.join(READY_DIR, `${name} (${old})${ext}`));
  }
  await copyFile(out, dest);
  const states = await readStates();
  const p = await readProject(dir);
  await saveState(name, { ...(states[name] ?? {}), estado: 'listo', proyecto: p.id, dir, video: dest, at: new Date().toISOString() });
  return dest;
}

/** Texto corto de los pedidos para Claude. */
export function formatOrders(orders: Order[]): string {
  if (!orders.length) return `No hay pedidos en ${INBOX_DIR}.`;
  return orders.map((o) => {
    const f = o.files;
    const extra = [
      f.pedido && `pedido: ${path.basename(f.pedido)}`,
      f.guion && `guion: ${path.basename(f.guion)}`,
      f.referencias.length && `referencia: ${f.referencias.map((r) => path.basename(r)).join(', ')}`,
      f.logo && `logo: ${path.basename(f.logo)}`,
      f.musica && `música: ${path.basename(f.musica)}`,
      f.otros.length && `otros (no se usan solos): ${f.otros.map((x) => path.basename(x)).join(', ')}`,
    ].filter(Boolean);
    const st = o.state.estado === 'listo' ? `listo → ${o.state.video}` : o.state.estado === 'error' ? `error: ${o.state.error}` : o.state.estado;
    return [`• ${o.name} [${st}]`, `  videos: ${f.videos.map((v) => path.basename(v)).join(', ') || '—'}`, ...extra.map((x) => `  ${x}`), o.state.proyecto ? `  proyecto: ${o.state.proyecto}` : ''].filter(Boolean).join('\n');
  }).join('\n');
}
