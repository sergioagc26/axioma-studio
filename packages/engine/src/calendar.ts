import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACE } from './paths.ts';

/**
 * Calendario de publicación: qué reel sale qué día, a qué hora y en qué red. Es un plan (la app
 * no publica sola en las redes); al llegar el día tienes el video y su texto listos para copiar.
 */
export const NETWORKS = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin'] as const;
export type Network = (typeof NETWORKS)[number];
export interface CalendarEntry { id: string; projectId: string; date: string; time?: string; network: Network; status: 'planificado' | 'publicado'; note?: string;
  /** Resultados del reel publicado (los pone el usuario). */
  metrics?: { views: number; likes?: number; comments?: number; shares?: number; saves?: number; at?: string } }

const FILE = path.join(WORKSPACE, 'calendario.json');

export async function listEntries(): Promise<CalendarEntry[]> {
  try { return JSON.parse(await readFile(FILE, 'utf8')) as CalendarEntry[]; } catch { return []; }
}

async function save(entries: CalendarEntry[]) {
  await mkdir(WORKSPACE, { recursive: true });
  const sorted = [...entries].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
  await writeFile(FILE, JSON.stringify(sorted, null, 2));
  return sorted;
}

const validDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const validTime = (t: unknown) => t == null || t === '' || (typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));

export async function addEntry(e: { projectId: string; date: string; time?: string; network: string; note?: string }) {
  if (!e.projectId) throw new Error('Elige el reel.');
  if (!validDate(e.date)) throw new Error('Fecha no válida.');
  if (!validTime(e.time)) throw new Error('Hora no válida (HH:MM).');
  const network = (NETWORKS as readonly string[]).includes(e.network) ? (e.network as Network) : 'instagram';
  const entry: CalendarEntry = { id: randomBytes(6).toString('base64url'), projectId: e.projectId, date: e.date, time: e.time || undefined, network, status: 'planificado', note: e.note?.trim().slice(0, 300) || undefined };
  return save([...(await listEntries()), entry]);
}

export async function updateEntry(id: string, patch: Partial<Pick<CalendarEntry, 'date' | 'time' | 'network' | 'status' | 'note' | 'metrics'>>) {
  const entries = await listEntries();
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
    e.metrics = views ? { views, likes: n(m!.likes), comments: n(m!.comments), shares: n(m!.shares), saves: n(m!.saves), at: new Date().toISOString() } : undefined;
    if (e.metrics) e.status = 'publicado';
  }
  if (patch.note !== undefined) e.note = patch.note.trim().slice(0, 300) || undefined;
  return save(entries);
}

export async function removeEntry(id: string) {
  return save((await listEntries()).filter((x) => x.id !== id));
}
