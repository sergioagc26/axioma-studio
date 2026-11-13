import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { P, WORKSPACE, slugify } from './paths.ts';

/**
 * Papelera (workspace/papelera): lo que se quita de la app (proyectos, referencias, estilos) no se
 * borra; queda aquí para recuperarlo o borrarlo para siempre. Los nombres de cada cosa dicen qué es:
 * - proyecto:   <cliente>--<carpeta>--<fecha>/
 * - referencia: referencia--<cliente>--<id>--<fecha>/
 * - estilo:     estilo--<cliente>--<id>--<fecha>.json
 */
export interface TrashItem { nombre: string; tipo: 'proyecto' | 'referencia' | 'estilo' | 'otro'; titulo: string; cliente?: string; fecha: string }

export const trashDir = () => path.join(WORKSPACE, 'papelera');

/** «2026-11-13T16-14-46-123Z» → fecha ISO (o null si no tiene ese formato). */
function stampDate(stamp: string): string | null {
  const m = stamp.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

/** Qué es cada cosa de la papelera (sin moverla). */
async function describe(nombre: string): Promise<TrashItem & { id: string }> {
  const full = path.join(trashDir(), nombre);
  const parts = nombre.replace(/\.json$/i, '').split('--');
  const st = await stat(full);
  const fecha = stampDate(parts[parts.length - 1] ?? '') ?? st.mtime.toISOString();
  if (parts[0] === 'referencia' && parts.length >= 4 && st.isDirectory()) {
    const r = await readJson(path.join(full, 'report.json'));
    return { nombre, tipo: 'referencia', titulo: String(r?.name ?? parts[2]), cliente: parts[1], fecha, id: parts.slice(2, -1).join('--') };
  }
  if (parts[0] === 'estilo' && parts.length >= 4 && st.isFile()) {
    const p = await readJson(full);
    return { nombre, tipo: 'estilo', titulo: String(p?.name ?? parts[2]), cliente: parts[1], fecha, id: parts.slice(2, -1).join('--') };
  }
  if (parts.length >= 3 && st.isDirectory() && existsSync(path.join(full, P.project))) {
    const p = await readJson(path.join(full, P.project));
    return { nombre, tipo: 'proyecto', titulo: String(p?.name ?? parts[1]), cliente: parts[0], fecha, id: parts.slice(1, -1).join('--') };
  }
  return { nombre, tipo: 'otro', titulo: nombre, fecha, id: nombre };
}

/** Lo que hay en la papelera, lo más reciente primero. */
export async function listTrash(): Promise<TrashItem[]> {
  if (!existsSync(trashDir())) return [];
  const out: TrashItem[] = [];
  for (const f of await readdir(trashDir())) {
    if (f.startsWith('.')) continue;
    try { const { id, ...item } = await describe(f); void id; out.push(item); } catch { /* se ignora */ }
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** El nombre tiene que ser una cosa de la papelera (no una ruta). */
function entry(nombre: string): string {
  const full = path.join(trashDir(), path.basename(nombre));
  if (!nombre || path.basename(nombre) !== nombre || !existsSync(full)) throw Object.assign(new Error('Eso ya no está en la papelera.'), { status: 404 });
  return full;
}

/** Destino libre: si ya existe, se le añade «-recuperado», «-recuperado-2»… */
function freePath(dir: string, base: string, ext = ''): { dest: string; name: string } {
  let name = base;
  for (let n = 1; existsSync(path.join(dir, name + ext)); n++) name = `${base}-recuperado${n > 1 ? `-${n}` : ''}`;
  return { dest: path.join(dir, name + ext), name };
}

/** Devuelve algo de la papelera a su sitio. Devuelve la lista actualizada. */
export async function restoreTrash(nombre: string): Promise<TrashItem[]> {
  const full = entry(nombre);
  const it = await describe(nombre);
  const client = slugify(it.cliente ?? 'personal');
  const root = path.join(WORKSPACE, 'clientes', client);
  if (it.tipo === 'proyecto') {
    const dir = path.join(root, 'proyectos');
    await mkdir(dir, { recursive: true });
    const { dest, name } = freePath(dir, it.id);
    await rename(full, dest);
    // Si ya había otro proyecto con el mismo nombre de carpeta, el recuperado toma el nuevo id.
    if (name !== it.id) {
      const p = await readJson(path.join(dest, P.project));
      if (p) { p.id = name; await writeFile(path.join(dest, P.project), JSON.stringify(p, null, 2)); }
    }
  } else if (it.tipo === 'referencia') {
    const dir = path.join(root, 'referencias');
    await mkdir(dir, { recursive: true });
    const { dest, name } = freePath(dir, it.id);
    await rename(full, dest);
    if (name !== it.id) {
      const r = await readJson(path.join(dest, 'report.json'));
      if (r) { r.id = name; await writeFile(path.join(dest, 'report.json'), JSON.stringify(r, null, 2)); }
    }
  } else if (it.tipo === 'estilo') {
    const dir = path.join(root, 'presets');
    await mkdir(dir, { recursive: true });
    const p = await readJson(full);
    const { dest, name } = freePath(dir, it.id, '.json');
    if (p && name !== it.id) { p.id = name; await writeFile(full, JSON.stringify(p, null, 2)); }
    await rename(full, dest);
  } else {
    throw Object.assign(new Error('No sé a dónde devolver eso: muévelo a mano desde la carpeta papelera.'), { status: 400 });
  }
  return listTrash();
}

/** Borra para siempre una cosa de la papelera o, sin nombre, la vacía entera. */
export async function emptyTrash(nombre?: string): Promise<TrashItem[]> {
  if (nombre) await rm(entry(nombre), { recursive: true, force: true });
  else if (existsSync(trashDir())) for (const f of await readdir(trashDir())) await rm(path.join(trashDir(), f), { recursive: true, force: true });
  return listTrash();
}
