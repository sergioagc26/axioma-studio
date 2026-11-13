import { Scene, effectiveRanges, type Project, type Transcript } from '@axioma/schema';
import { hookScore, sentences } from './clips.ts';
import { readProject, readTranscript, writeProject } from './store.ts';

export const TEASER_ID = 'adelanto';

export interface TeaserIdea { start: number; end: number; text: string; score: number; reasons: string[]; sceneIndex: number }

/**
 * La frase que más atrapa del reel, para ponerla en el primer segundo (el "cold open" de los
 * creadores grandes): se elige entre lo que ya quedó en el corte, sin contar la primera escena,
 * corta (1,2–6 s) y que se entienda sola.
 */
export function bestTeaser(project: Project, t: Transcript): TeaserIdea | null {
  const scenes = project.scenes.filter((s) => s.id !== TEASER_ID);
  const kept = scenes.map((s, i) => ({ i, ranges: s.visual === 'original' || s.visual === 'texto' ? effectiveRanges(s, project.source.duration) : [] }));
  let best: TeaserIdea | null = null;
  for (const s of sentences(t)) {
    const dur = s.end - s.start;
    const words = s.text.split(/\s+/).length;
    if (dur < 1.2 || dur > 6 || words < 4) continue;
    const home = kept.find((k) => k.i > 0 && k.ranges.some((r) => r.start <= s.start + 0.15 && r.end >= s.end - 0.15));
    if (!home) continue;
    const { hook, reasons } = hookScore(s.text);
    // Bonus: frases que terminan en punto o exclamación se entienden solas.
    const score = hook + (/[.!?]$/.test(s.text) ? 8 : 0) - Math.max(0, words - 14) * 3;
    if (!best || score > best.score) best = { start: s.start, end: s.end, text: s.text, score, reasons, sceneIndex: home.i };
  }
  return best;
}

/** El proyecto con el adelanto al inicio (sin guardar). Null si no hay una frase que sirva. */
export function teaserProject(project: Project, t: Transcript): { project: Project; teaser: TeaserIdea } | null {
  const idea = bestTeaser(project, t);
  if (!idea) return null;
  const p: Project = structuredClone(project);
  // Se respetan los cortes de la escena de donde sale (sin muletillas ni pausas).
  const home = p.scenes.filter((s) => s.id !== TEASER_ID)[idea.sceneIndex];
  const ranges = effectiveRanges(home, p.source.duration)
    .map((r) => ({ start: Math.max(r.start, idea.start - 0.06), end: Math.min(r.end, idea.end + 0.12) }))
    .filter((r) => r.end - r.start > 0.05);
  const scene = Scene.parse({
    id: TEASER_ID,
    role: 'gancho',
    title: 'Adelanto',
    ranges,
    punchZoom: true,
    look: home.look,
    camera: 'acercar',
    cameraAmount: 0.1,
    backdrop: home.backdrop,
    backdropFile: home.backdropFile,
    sfx: [{ id: 'impacto', offset: 0, volume: 0.5 }],
  });
  p.scenes = [scene, ...p.scenes.filter((s) => s.id !== TEASER_ID)];
  // La escena que venía primero entra con un corte marcado después del adelanto.
  const next = p.scenes[1];
  if (next && !next.transition) next.transition = { id: 'destello' };
  return { project: p, teaser: idea };
}

/** Pone (o reemplaza) el adelanto al inicio. La escena original sigue en su sitio. */
export async function addTeaser(dir: string): Promise<{ project: Project; teaser: TeaserIdea }> {
  const project = await readProject(dir);
  const t = await readTranscript(dir);
  if (!t?.words.length) throw new Error('Este reel no tiene voz transcrita: no hay frases para adelantar.');
  const made = teaserProject(project, t);
  if (!made) throw new Error('No encontré una frase corta y fuerte para adelantar (hacen falta varias escenas con voz).');
  return { project: await writeProject(dir, made.project), teaser: made.teaser };
}

export async function removeTeaser(dir: string) {
  const project = await readProject(dir);
  project.scenes = project.scenes.filter((s) => s.id !== TEASER_ID);
  return writeProject(dir, project);
}
