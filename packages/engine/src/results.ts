import { writeFile } from 'node:fs/promises';
import type { Project } from '@axioma/schema';
import { listEntries, type CalendarEntry } from './calendar.ts';
import { kitFile, readKit } from './kit.ts';
import { listProjects } from './ops.ts';
import { slugify } from './paths.ts';

/**
 * Aprender de los resultados: con las vistas y la interacción de cada reel publicado, la app ve
 * qué decisiones de edición le funcionan mejor a cada cliente (diseño de subtítulos, textos,
 * duración, música, hora y día) y las usa por defecto en los reels siguientes.
 * Las cifras las pone el usuario o, en lo publicado desde la app, se traen de Instagram; la app
 * no inventa nada.
 */
export interface Metrics { views: number; likes?: number; comments?: number; shares?: number; saves?: number; at?: string }

export interface Finding {
  /** Qué se comparó: diseño, texto, duración… */
  feature: string;
  label: string;
  /** El valor que mejor funcionó y cuántos reels lo usan. */
  best: string; bestCount: number;
  /** Cuántas veces más vistas que el resto (1.6 = 60 % más). */
  lift: number;
  text: string;
}

export interface Insights { client: string; reels: number; medianViews: number; engagement: number; findings: Finding[]; applied: string[]; note?: string }

const FEATURES: Record<string, string> = {
  design: 'Diseño de subtítulos', textStyle: 'Estilo de los textos', duracion: 'Duración', musica: 'Música',
  hora: 'Hora de publicación', dia: 'Día de publicación', red: 'Red', preset: 'Estilo de edición',
};
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const engagementOf = (m: Metrics) => (m.views > 0 ? ((m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0)) / m.views : 0);

function duration(p: Project): number {
  return p.scenes.reduce((s, sc) => s + sc.ranges.reduce((a, r) => a + (r.end - r.start), 0) - sc.trimStart - sc.trimEnd, 0);
}

/** Las decisiones de edición y publicación de un reel, en palabras. */
export function reelFeatures(p: Project, e: Pick<CalendarEntry, 'date' | 'time' | 'network'>): Record<string, string> {
  const d = duration(p);
  const styles = p.scenes.filter((s) => s.onScreenText).map((s) => s.textStyle);
  const top = styles.sort((a, b) => styles.filter((x) => x === b).length - styles.filter((x) => x === a).length)[0];
  const h = e.time ? Number(e.time.slice(0, 2)) : null;
  return {
    design: p.captions.design,
    ...(top ? { textStyle: top } : {}),
    preset: p.presetId,
    duracion: d < 20 ? 'menos de 20 s' : d < 40 ? '20 a 40 s' : d < 60 ? '40 a 60 s' : 'más de 60 s',
    musica: p.audio.music ? 'con música' : 'sin música',
    ...(h == null ? {} : { hora: h < 12 ? 'mañana' : h < 18 ? 'tarde' : 'noche' }),
    dia: DAYS[new Date(`${e.date}T12:00:00`).getDay()],
    red: e.network,
  };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

/**
 * Compara los reels entre sí. Cada reel vale por sus vistas frente a la mediana del cliente,
 * con un extra por la interacción (me gusta, comentarios, compartidos y guardados por vista).
 * Solo se dice algo si hay al menos 2 reels de cada lado y la diferencia es de 25 % o más.
 */
export function findInsights(reels: { features: Record<string, string>; metrics: Metrics }[]): { findings: Finding[]; medianViews: number; engagement: number } {
  const med = median(reels.map((r) => r.metrics.views)) || 1;
  const eng = median(reels.map((r) => engagementOf(r.metrics)));
  const score = (m: Metrics) => (m.views / med) * (1 + Math.min(1, engagementOf(m) / Math.max(eng, 0.01) - 1) * 0.3);
  const findings: Finding[] = [];
  for (const [feature, label] of Object.entries(FEATURES)) {
    const groups = new Map<string, number[]>();
    for (const r of reels) { const v = r.features[feature]; if (v) groups.set(v, [...(groups.get(v) ?? []), score(r.metrics)]); }
    if (groups.size < 2) continue;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const ranked = [...groups].filter(([, xs]) => xs.length >= 2).sort((a, b) => avg(b[1]) - avg(a[1]));
    if (!ranked.length) continue;
    const [best, xs] = ranked[0];
    const rest = reels.filter((r) => r.features[feature] && r.features[feature] !== best).map((r) => score(r.metrics));
    if (rest.length < 2) continue;
    const lift = avg(xs) / Math.max(avg(rest), 0.01);
    if (lift < 1.25) continue;
    findings.push({ feature, label, best, bestCount: xs.length, lift: Math.round(lift * 10) / 10, text: `${label}: con «${best}» les va ${lift >= 1.95 ? `${(Math.round(lift * 10) / 10).toString().replace('.', ',')} veces` : `un ${Math.round((lift - 1) * 100)} %`} mejor que con lo demás (${xs.length} reels).` });
  }
  return { findings: findings.sort((a, b) => b.lift - a.lift), medianViews: Math.round(med), engagement: Math.round(eng * 1000) / 10 };
}

/** Lo que funciona con un cliente y, si hay datos suficientes, lo deja como su estilo por defecto. */
export async function learnFromResults(client?: string, apply = true): Promise<Insights> {
  const slug = slugify(client ?? 'personal');
  const entries = (await listEntries()).filter((e) => e.status === 'publicado' && e.metrics && e.metrics.views > 0);
  const projects = new Map((await listProjects()).map((x) => [x.project.id, x.project]));
  const reels = entries.flatMap((e) => {
    const p = projects.get(e.projectId);
    return p && slugify(p.client ?? 'personal') === slug ? [{ features: reelFeatures(p, e), metrics: e.metrics! }] : [];
  });
  const name = client ?? 'personal';
  if (reels.length < 4) return { client: name, reels: reels.length, medianViews: 0, engagement: 0, findings: [], applied: [], note: `Faltan resultados: hay ${reels.length} reel${reels.length === 1 ? '' : 's'} con cifras y se necesitan al menos 4 para comparar. En Calendario, marca cada reel como publicado y pon sus vistas.` };
  const { findings, medianViews, engagement } = findInsights(reels);
  const applied: string[] = [];
  const kit = await readKit(client);
  if (apply && kit) {
    // Lo que mejor funcionó pasa a mandar sobre lo que más se ha usado.
    for (const k of Object.keys(kit.learned)) if (k.startsWith('exito:')) delete kit.learned[k];
    for (const f of findings) {
      if (f.feature === 'design') { kit.learned[`exito:design:${f.best}`] = f.bestCount; applied.push(`Subtítulos «${f.best}» por defecto`); }
      if (f.feature === 'textStyle') { kit.learned[`exito:titulo:${f.best}`] = f.bestCount; applied.push(`Textos «${f.best}» por defecto`); }
      if (f.feature === 'hora') { kit.learned[`exito:hora:${f.best}`] = f.bestCount; applied.push(`Publicar en la ${f.best}`); }
      if (f.feature === 'dia') { kit.learned[`exito:dia:${f.best}`] = f.bestCount; applied.push(`Publicar el ${f.best}`); }
    }
    await writeFile(kitFile(client), JSON.stringify(kit, null, 2));
  }
  return { client: name, reels: reels.length, medianViews, engagement, findings, applied, note: findings.length ? undefined : 'Con estos resultados no hay una diferencia clara todavía: sigue publicando y poniendo las cifras.' };
}

export function formatInsights(i: Insights): string {
  return [
    `Resultados de ${i.client}: ${i.reels} reels con cifras${i.reels >= 4 ? ` · vistas típicas ${i.medianViews.toLocaleString('es')} · interacción ${String(i.engagement).replace('.', ',')} %` : ''}.`,
    ...i.findings.map((f) => `• ${f.text}`),
    ...(i.applied.length ? [`Aplicado a sus próximos reels: ${i.applied.join(' · ')}.`] : []),
    ...(i.note ? [i.note] : []),
  ].join('\n');
}
