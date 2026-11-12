import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BUILTIN_TRANSITIONS, TransitionSpec, findTransition, recommendTransitions, type TransitionAdvice } from '@snz/schema';
import { WORKSPACE, slugify } from './paths.ts';
import { readProject, writeProject } from './store.ts';

const transitionsDir = (client?: string) => path.join(WORKSPACE, 'clientes', slugify(client ?? 'personal'), 'transiciones');

/** Transiciones propias del cliente (las crea Claude o el usuario). */
export async function listCustomTransitions(client?: string): Promise<TransitionSpec[]> {
  const dir = transitionsDir(client);
  if (!existsSync(dir)) return [];
  const out: TransitionSpec[] = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      out.push(TransitionSpec.parse(JSON.parse(await readFile(path.join(dir, f), 'utf8'))));
    } catch {
      /* archivo inválido: se ignora */
    }
  }
  return out;
}

export async function allTransitions(client?: string): Promise<TransitionSpec[]> {
  const own = await listCustomTransitions(client);
  return [...own, ...BUILTIN_TRANSITIONS.filter((b) => !own.some((o) => o.id === b.id))];
}

/** Guarda una transición nueva para el cliente. Es solo un dato validado: no ejecuta código. */
export async function saveTransition(client: string | undefined, input: unknown): Promise<TransitionSpec> {
  const raw = input as { id?: string; name?: string };
  const spec = TransitionSpec.parse({ ...raw, id: raw.id ?? slugify(raw.name ?? 'transicion') });
  const empty = (m: object) => Object.keys(m).length === 0;
  if (empty(spec.entra) && empty(spec.sale) && !spec.destello) throw new Error('La transición no anima nada: define "entra", "sale" o "destello".');
  await mkdir(transitionsDir(client), { recursive: true });
  await writeFile(path.join(transitionsDir(client), `${spec.id}.json`), JSON.stringify(spec, null, 2));
  return spec;
}

/** Pone (o quita, con null) la transición de entrada de una escena. */
export async function setTransition(dir: string, sceneId: string, id: string | null, duration?: number) {
  const project = await readProject(dir);
  const i = project.scenes.findIndex((s) => s.id === sceneId);
  if (i < 0) throw new Error(`No existe la escena ${sceneId}.`);
  if (id === null || id === 'corte') {
    project.scenes[i].transition = undefined;
  } else {
    if (i === 0) throw new Error('La primera escena no lleva transición de entrada.');
    const all = await allTransitions(project.client);
    if (!findTransition(id, all)) throw new Error(`No existe la transición "${id}". Disponibles: corte, ${all.map((t) => t.id).join(', ')}.`);
    project.scenes[i].transition = { id, duration };
  }
  return writeProject(dir, project);
}

/** Aplica la recomendación automática a todas las escenas. */
export async function applyRecommendedTransitions(dir: string): Promise<{ advice: TransitionAdvice[] }> {
  const project = await readProject(dir);
  const advice = recommendTransitions(project);
  for (const a of advice) {
    const s = project.scenes.find((x) => x.id === a.sceneId);
    if (s) s.transition = a.transition ? { id: a.transition } : undefined;
  }
  await writeProject(dir, project);
  return { advice };
}

export function formatTransitions(list: TransitionSpec[]): string {
  return ['corte · Corte seco: sin transición.', ...list.map((t) => `${t.id} · ${t.name} (${t.duration} s): ${t.description}`)].join('\n');
}
