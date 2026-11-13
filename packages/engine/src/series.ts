import { existsSync } from 'node:fs';
import path from 'node:path';
import { sceneLength, shortPhrases, speechOf, type Project, type Scene } from '@axioma/schema';
import { cloneProjectFiles } from './clips.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { TEASER_ID } from './teaser.ts';

/**
 * Serie «Parte 1, 2, 3» (como en TikTok): un reel largo se divide en partes parecidas, siempre
 * en un cambio de escena. Cada parte termina con «Sigue en la parte N →» y las siguientes abren
 * con «Parte N:». Cada parte es un proyecto nuevo; los videos se enlazan, no ocupan espacio.
 */
export function planParts(scenes: Scene[], maxSeconds: number): Scene[][] {
  const lens = scenes.map((s) => sceneLength(s));
  const total = lens.reduce((a, b) => a + b, 0);
  const n = Math.max(1, Math.ceil(total / maxSeconds));
  const target = total / n;
  const parts: Scene[][] = [];
  let cur: Scene[] = [];
  let acc = 0;
  scenes.forEach((s, i) => {
    // Se cierra la parte si con esta escena se pasaría más del objetivo que sin ella.
    if (cur.length && parts.length < n - 1 && Math.abs(acc + lens[i] - target) > Math.abs(acc - target) && acc >= target * 0.6) {
      parts.push(cur); cur = []; acc = 0;
    }
    cur.push(s); acc += lens[i];
  });
  if (cur.length) parts.push(cur);
  return parts;
}

export async function splitIntoParts(dir: string, maxSeconds = 60): Promise<{ ids: string[]; names: string[] }> {
  const src = await readProject(dir);
  const t = await readTranscript(dir);
  const scenes = src.scenes.filter((s) => s.id !== TEASER_ID);
  const total = scenes.reduce((a, s) => a + sceneLength(s), 0);
  if (total <= maxSeconds * 1.1) throw new Error(`El reel dura ${Math.round(total)} s: ya cabe en uno solo de hasta ${maxSeconds} s.`);
  const parts = planParts(scenes, maxSeconds);
  const n = parts.length;
  const ids: string[] = [];
  const names: string[] = [];
  for (const [k, part] of parts.entries()) {
    let id = `${src.id}-parte-${k + 1}`;
    let out = path.join(path.dirname(dir), id);
    for (let m = 2; existsSync(out); m++) out = path.join(path.dirname(dir), (id = `${src.id}-parte-${k + 1}-${m}`));
    await cloneProjectFiles(dir, out);
    const own: Scene[] = structuredClone(part);
    if (k > 0) {
      const first = own[0];
      const hook = first.onScreenText?.trim() || shortPhrases(speechOf(first, t))[0] || '';
      first.onScreenText = `Parte ${k + 1}${hook ? `: ${hook}` : ''}`;
      first.role = 'gancho';
    }
    if (k < n - 1) {
      const last = own[own.length - 1];
      last.onScreenText = `Sigue en la parte ${k + 2} →`;
      last.textStyle = 'banda';
    }
    const now = new Date().toISOString();
    const name = `${src.name} · Parte ${k + 1} de ${n}`;
    const project: Project = { ...src, id, name, createdAt: now, updatedAt: now, approval: 'borrador', requests: [], review: undefined, scenes: own };
    await writeProject(out, project);
    ids.push(id);
    names.push(name);
  }
  return { ids, names };
}
