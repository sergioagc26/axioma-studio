import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { sceneLength, type Project } from '@axioma/schema';
import * as ops from './ops.ts';
import { P } from './paths.ts';
import { readProject, writeProject } from './store.ts';

/**
 * Revisión del cliente (como Frame.io): un enlace con su propia clave que solo da acceso a este
 * reel. El cliente ve el último video exportado, comenta en el segundo exacto y puede aprobarlo.
 * Los comentarios llegan al proyecto como peticiones.
 */

export async function ensureReviewToken(dir: string): Promise<string> {
  const p = await readProject(dir);
  if (p.review?.token) return p.review.token;
  p.review = { token: randomBytes(12).toString('base64url'), createdAt: new Date().toISOString() };
  await writeProject(dir, p);
  return p.review.token;
}

/** Nueva clave: el enlace anterior deja de funcionar. */
export async function resetReviewToken(dir: string): Promise<string> {
  const p = await readProject(dir);
  p.review = undefined;
  await writeProject(dir, p);
  return ensureReviewToken(dir);
}

export async function findByToken(token: string): Promise<{ dir: string; project: Project } | null> {
  if (!/^[\w-]{12,40}$/.test(token)) return null;
  const hit = (await ops.listProjects()).find((x) => x.project.review?.token === token);
  return hit ? { dir: hit.dir, project: hit.project } : null;
}

/**
 * El último video exportado: lo que el cliente debe revisar. Si todavía no hay uno, no se
 * muestra nada (la vista previa es el video original sin editar y confundiría al cliente).
 */
export async function reviewVideo(dir: string, project: Project): Promise<{ file: string | null; exported: boolean }> {
  const folders = [path.join(dir, P.renders), project.export.folder].filter((f): f is string => Boolean(f && existsSync(f)));
  let best: { file: string; t: number } | null = null;
  for (const folder of folders) {
    for (const f of await readdir(folder)) {
      if (!f.endsWith('.mp4') || f.includes('.sin-nivelar') || !f.startsWith(project.id)) continue;
      const t = (await stat(path.join(folder, f))).mtimeMs;
      if (!best || t > best.t) best = { file: path.join(folder, f), t };
    }
  }
  return best ? { file: best.file, exported: true } : { file: null, exported: false };
}

/** Escena que está en pantalla en el segundo `t` del reel. */
export function sceneAt(project: Project, t: number): string | undefined {
  let acc = 0;
  for (const s of project.scenes) {
    acc += sceneLength(s);
    if (t < acc) return s.id;
  }
  return project.scenes[project.scenes.length - 1]?.id;
}

export async function addReviewComment(dir: string, c: { name: string; text: string; time?: number }) {
  const text = c.text.trim().slice(0, 1000);
  if (!text) throw new Error('Escribe el comentario.');
  const p = await readProject(dir);
  const time = c.time != null && Number.isFinite(c.time) ? Math.max(0, +c.time.toFixed(1)) : undefined;
  p.requests.push({
    id: `r${Date.now().toString(36)}${randomBytes(2).toString('hex')}`,
    at: new Date().toISOString(),
    text,
    status: 'pendiente',
    author: c.name.trim().slice(0, 60) || 'Cliente',
    time,
    sceneId: time != null ? sceneAt(p, time) : undefined,
  });
  if (p.approval === 'borrador') p.approval = 'en_revision';
  return writeProject(dir, p);
}

export async function approveReview(dir: string, name: string) {
  const p = await readProject(dir);
  p.approval = 'aprobado';
  p.requests.push({ id: `r${Date.now().toString(36)}`, at: new Date().toISOString(), text: '✓ Aprobado', status: 'hecha', author: name.trim().slice(0, 60) || 'Cliente' });
  return writeProject(dir, p);
}

/** Lo que ve el cliente (sin rutas ni datos internos). */
export function publicReview(project: Project, exported: boolean) {
  return {
    name: project.name,
    client: project.client ?? '',
    approval: project.approval,
    exported,
    comments: project.requests.filter((r) => r.author).map((r) => ({ id: r.id, author: r.author, text: r.text, time: r.time, at: r.at, status: r.status })),
  };
}
