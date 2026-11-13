import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { cloneProjectFiles } from './clips.ts';
import { WORKSPACE } from './paths.ts';
import { readProject, writeProject } from './store.ts';

/** Copia un proyecto (los videos se enlazan, no ocupan espacio de más). Devuelve el id nuevo. */
export async function duplicateProject(dir: string): Promise<{ id: string; dir: string }> {
  const src = await readProject(dir);
  let id = `${src.id}-copia`;
  let out = path.join(path.dirname(dir), id);
  for (let n = 2; existsSync(out); n++) out = path.join(path.dirname(dir), (id = `${src.id}-copia-${n}`));
  await cloneProjectFiles(dir, out);
  const now = new Date().toISOString();
  await writeProject(out, { ...src, id, name: `${src.name} (copia)`, createdAt: now, updatedAt: now, approval: 'borrador', requests: [] });
  return { id, dir: out };
}

/**
 * Manda un proyecto a la papelera (workspace/papelera): deja de aparecer en la lista pero no se
 * borra; para recuperarlo, se mueve su carpeta de vuelta a clientes/<cliente>/proyectos.
 */
export async function trashProject(dir: string): Promise<string> {
  const trash = path.join(WORKSPACE, 'papelera');
  await mkdir(trash, { recursive: true });
  const client = path.basename(path.dirname(path.dirname(dir)));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(trash, `${client}--${path.basename(dir)}--${stamp}`);
  await rename(dir, dest);
  return dest;
}
