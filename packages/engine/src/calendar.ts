import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE } from './paths.ts';
import { writeJsonAtomic } from './store.ts';

/**
 * Calendario de publicación: qué reel sale qué día, a qué hora y en qué red. Nada se publica solo
 * a la hora planeada: al llegar el día tienes el video y su texto listos, y en Instagram puedes
 * publicarlo desde la app (siempre con tu confirmación). Lo publicado así guarda aquí su enlace.
 */
export const NETWORKS = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin'] as const;
export type Network = (typeof NETWORKS)[number];
/** Lo que pasó al publicar desde la app: en qué cuenta, cómo va y dónde quedó. No lleva tokens. */
export interface Remote {
  /** Cuenta conectada (id de workspace/cuentas.json). */
  account: string;
  state: 'subiendo' | 'procesando' | 'publicado' | 'error';
  /** Id y enlace de la publicación en la red. */
  id?: string; url?: string;
  /** Subida en curso: sirve para reintentar sin publicar dos veces. `firma` identifica video y texto. */
  containerId?: string; containerAt?: string; firma?: string; tries?: number;
  duration?: number; sentAt: string; syncedAt?: string; error?: string;
}
export interface CalendarEntry { id: string; projectId: string; date: string; time?: string; network: Network; status: 'planificado' | 'publicado'; note?: string;
  /** Resultados del reel publicado: los pone el usuario ('manual') o se traen de la red ('api'). */
  metrics?: { views: number; likes?: number; comments?: number; shares?: number; saves?: number; at?: string; source?: 'api' | 'manual' };
  remote?: Remote }

const FILE = path.join(WORKSPACE, 'calendario.json');

/** Lee el calendario. `strict`: si el archivo existe pero no se puede leer, falla (para no guardar encima una lista vacía). */
async function readEntries(strict: boolean): Promise<CalendarEntry[]> {
  let text: string;
  try { text = await readFile(FILE, 'utf8'); } catch (e) {
    if (!strict || (e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  try { return JSON.parse(text) as CalendarEntry[]; } catch {
    if (strict) throw new Error('No se pudo leer el calendario (workspace/calendario.json está dañado). No se cambió nada.');
    return [];
  }
}

export function listEntries(): Promise<CalendarEntry[]> {
  return readEntries(false);
}

async function save(entries: CalendarEntry[]) {
  await mkdir(WORKSPACE, { recursive: true });
  const sorted = [...entries].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
  // Atómico: quien lo lea a la vez nunca ve el archivo vacío ni a medias.
  await writeJsonAtomic(FILE, sorted);
  return sorted;
}

// Los cambios van en fila: publicar, traer cifras y editar el calendario a la vez no se pisan.
let queue: Promise<unknown> = Promise.resolve();
function edit<T>(fn: (entries: CalendarEntry[]) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => fn(await readEntries(true)));
  queue = next.catch(() => {});
  return next;
}

const validDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const validTime = (t: unknown) => t == null || t === '' || (typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));

function newEntry(e: { projectId: string; date: string; time?: string; network: string; note?: string }): CalendarEntry {
  if (!e.projectId) throw new Error('Elige el reel.');
  if (!validDate(e.date)) throw new Error('Fecha no válida.');
  if (!validTime(e.time)) throw new Error('Hora no válida (HH:MM).');
  const network = (NETWORKS as readonly string[]).includes(e.network) ? (e.network as Network) : 'instagram';
  return { id: randomBytes(6).toString('base64url'), projectId: e.projectId, date: e.date, time: e.time || undefined, network, status: 'planificado', note: e.note?.trim().slice(0, 300) || undefined };
}

export async function addEntry(e: { projectId: string; date: string; time?: string; network: string; note?: string }) {
  const entry = newEntry(e);
  return edit((entries) => save([...entries, entry]));
}

export function updateEntry(id: string, patch: Partial<Pick<CalendarEntry, 'date' | 'time' | 'network' | 'status' | 'note' | 'metrics'>>) {
  return edit((entries) => {
    const e = entries.find((x) => x.id === id);
    if (!e) throw new Error('Esa publicación ya no está en el calendario.');
    if (patch.date !== undefined) { if (!validDate(patch.date)) throw new Error('Fecha no válida.'); e.date = patch.date; }
    if (patch.time !== undefined) { if (!validTime(patch.time)) throw new Error('Hora no válida (HH:MM).'); e.time = patch.time || undefined; }
    if (patch.network && (NETWORKS as readonly string[]).includes(patch.network)) e.network = patch.network;
    if (patch.status === 'planificado' || patch.status === 'publicado') e.status = patch.status;
    if (patch.metrics !== undefined) {
      const n = (x: unknown) => (x === '' || x == null ? undefined : Math.max(0, Math.round(Number(x))) || 0);
      const m = patch.metrics as Record<string, unknown> | null;
      const views = m ? n(m.views) : undefined;
      // Las cifras traídas de la red no borran lo que la red no da y el usuario puso a mano.
      const source = m?.source === 'api' ? 'api' as const : 'manual' as const;
      const old = source === 'api' ? e.metrics : undefined;
      e.metrics = views ? { views, likes: n(m!.likes) ?? old?.likes, comments: n(m!.comments) ?? old?.comments, shares: n(m!.shares) ?? old?.shares, saves: n(m!.saves) ?? old?.saves, at: new Date().toISOString(), source } : undefined;
      if (e.metrics) e.status = 'publicado';
    }
    if (patch.note !== undefined) e.note = patch.note.trim().slice(0, 300) || undefined;
    return save(entries);
  });
}

export function removeEntry(id: string) {
  return edit((entries) => save(entries.filter((x) => x.id !== id)));
}

/**
 * Anota cómo va la publicación en la red (se fusiona con lo que había; null lo borra). No pasa por
 * PUT /api/calendario: el navegador no puede inventar ids ni enlaces.
 */
export function setRemote(id: string, patch: Partial<Remote> | null): Promise<CalendarEntry> {
  return edit(async (entries) => {
    const e = entries.find((x) => x.id === id);
    if (!e) throw new Error('Esa publicación ya no está en el calendario.');
    e.remote = patch ? { account: '', state: 'subiendo', sentAt: new Date().toISOString(), ...e.remote, ...patch } : undefined;
    await save(entries);
    return e;
  });
}

/**
 * La entrada del calendario donde anotar una publicación: la indicada, o la planificada más
 * reciente de ese reel y red que aún no se publicó, o una nueva con la fecha y hora de hoy.
 */
export function ensureEntry(projectId: string, network: Network, entryId?: string): Promise<CalendarEntry> {
  return edit(async (entries) => {
    if (entryId) {
      const e = entries.find((x) => x.id === entryId);
      if (!e) throw new Error('Esa publicación ya no está en el calendario.');
      if (e.projectId !== projectId || e.network !== network) throw new Error('Esa publicación del calendario es de otro reel o de otra red.');
      return e;
    }
    const planned = entries.filter((x) => x.projectId === projectId && x.network === network && x.status === 'planificado' && !x.remote?.id);
    if (planned.length) return planned[planned.length - 1];
    const entry = newEntry({ projectId, ...localNow(), network });
    await save([...entries, entry]);
    return entry;
  });
}

/** Fecha (AAAA-MM-DD) y hora (HH:MM) de ahora, en la hora de este computador. */
export function localNow(d = new Date()): { date: string; time: string } {
  const p = (x: number) => String(x).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
