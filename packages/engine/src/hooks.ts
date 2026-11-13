import { speechOf, type FormatId, type Project } from '@axioma/schema';
import { llmHook, llmReady } from './llm.ts';
import { renderProject } from './render.ts';
import { readProject, readTranscript } from './store.ts';
import { TEASER_ID, bestTeaser, teaserProject } from './teaser.ts';

/**
 * Variantes de gancho para probar cuál retiene más (como los creadores que suben la misma
 * pieza con otra apertura): A tal cual, B con tu frase más fuerte en el primer segundo y
 * C con otro texto de gancho. Se exportan las tres sin cambiar el proyecto.
 */
export interface HookVariant { id: 'A' | 'B' | 'C'; label: string; project: Project }

const short = (s: string, n = 6) => s.replace(/[«»"“”.,;:!?¿¡]/g, '').split(/\s+/).filter(Boolean).slice(0, n).join(' ');

export async function hookVariants(dir: string): Promise<HookVariant[]> {
  const base = await readProject(dir);
  const t = await readTranscript(dir);
  const out: HookVariant[] = [{ id: 'A', label: 'Tal cual', project: base }];
  if (!t?.words.length) return out;

  // B: la frase más fuerte primero (si ya la tiene, la versión B es sin adelanto).
  const hasTeaser = base.scenes[0]?.id === TEASER_ID;
  if (hasTeaser) {
    const p = structuredClone(base);
    p.scenes = p.scenes.filter((s) => s.id !== TEASER_ID);
    if (p.scenes.length) out.push({ id: 'B', label: 'Sin el adelanto', project: p });
  } else {
    const made = teaserProject(base, t);
    if (made) out.push({ id: 'B', label: `Abre con «${short(made.teaser.text, 8)}…»`, project: made.project });
  }

  // C: otro texto de gancho en la primera escena (la IA local lo redacta; si no, la frase con más gancho).
  const first = base.scenes.find((s) => s.id !== TEASER_ID);
  if (first) {
    const current = (first.onScreenText ?? '').trim().toLowerCase();
    let alt: string | null = null;
    if (await llmReady()) {
      const said = speechOf(first, t);
      for (let i = 0; i < 2 && (!alt || alt.toLowerCase() === current); i++) alt = await llmHook(said).catch(() => null);
    }
    if (!alt || alt.toLowerCase() === current) {
      const idea = bestTeaser(base, t);
      if (idea) alt = short(idea.text);
    }
    if (alt && alt.toLowerCase() !== current) {
      const p = structuredClone(base);
      const sc = p.scenes.find((s) => s.id === first.id)!;
      sc.onScreenText = alt;
      sc.textKeyword = undefined;
      out.push({ id: 'C', label: `Gancho «${alt}»`, project: p });
    }
  }
  return out;
}

/** Exporta todas las variantes. Cada archivo lleva -gancho-A/B/C en el nombre. */
export async function renderHookVariants(dir: string, opts: { format?: FormatId; onProgress?: (msg: string, p: number) => void } = {}) {
  opts.onProgress?.('Preparando las versiones del gancho…', 0);
  const variants = await hookVariants(dir);
  const files: { id: string; label: string; path: string }[] = [];
  for (const [i, v] of variants.entries()) {
    const { out } = await renderProject(dir, {
      project: v.project, format: opts.format, suffix: `-gancho-${v.id}`,
      onProgress: (p) => opts.onProgress?.(`Exportando la versión ${v.id} (${i + 1}/${variants.length})…`, (i + p) / variants.length),
    });
    files.push({ id: v.id, label: v.label, path: out });
  }
  return files;
}
