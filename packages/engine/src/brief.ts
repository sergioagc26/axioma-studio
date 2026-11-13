import { applyVariant, motionIdeas, outputDuration, sceneLength, shortPhrases, speechOf, type Project, type Scene } from '@axioma/schema';
import { applyPunchZooms } from './cuts.ts';
import { buildMontage } from './montage.ts';
import { applyBrandStyle, applyPreset, saveVersion, setAutoSfx } from './ops.ts';
import { cutProject } from './pipeline.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { applyRecommendedTransitions } from './transitions.ts';
import { CTA_FOR } from './briefai.ts';
import type { BeatDensity } from './beats.ts';

const RITMO: Record<string, string> = { rapido: 'rapido', 'con ritmo': 'con-ritmo', sobrio: 'sobrio', energico: 'energia', 'pausado y elegante': 'elegante', elegante: 'elegante' };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Estilo de textos, subtítulos e imagen según el tono elegido. */
const TONO: Record<string, { textStyle: Scene['textStyle']; effect: Project['captions']['effect']; look: Scene['look']; camera: Scene['camera']; why: string }> = {
  directo: { textStyle: 'resaltado', effect: 'pop', look: 'normal', camera: 'ninguno', why: 'textos con la palabra clave en color y subtítulos que saltan' },
  cercano: { textStyle: 'subrayado', effect: 'color', look: 'calido', camera: 'acercar', why: 'tonos cálidos, la cámara se acerca y textos subrayados' },
  educativo: { textStyle: 'marcador', effect: 'caja', look: 'normal', camera: 'ninguno', why: 'la idea clave marcada con marcador y subtítulos con caja' },
  inspirador: { textStyle: 'gigante', effect: 'pop', look: 'contraste', camera: 'acercar', why: 'palabras gigantes, más contraste y la cámara acercándose' },
  elegante: { textStyle: 'sombra', effect: 'color', look: 'cine', camera: 'acercar', why: 'textos limpios con sombra, imagen de cine y la cámara acercándose despacio' },
  energico: { textStyle: 'apilado', effect: 'pop', look: 'vivo', camera: 'pulso', why: 'palabras apiladas, colores vivos y la cámara con pulso' },
  divertido: { textStyle: 'banda', effect: 'caja', look: 'contraste', camera: 'ninguno', why: 'bandas de titular y colores fuertes' },
};

/**
 * Duración máxima pedida, en segundos: "15–20 s" → 20; "1 minuto" → 60; "1:30" → 90;
 * "Lo que dure" → null. Menos de 5 s no es una duración real y se ignora (null).
 */
export function maxSeconds(answer?: string): number | null {
  const t = (answer ?? '').toLowerCase();
  const mmss = t.match(/(\d+):(\d{1,2})/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const nums = t.match(/\d+(?:[.,]\d+)?/g)?.map((n) => Number(n.replace(',', '.'))) ?? [];
  if (!nums.length) return /medio minuto/.test(t) ? 30 : /\bun minuto\b/.test(t) ? 60 : null;
  const v = Math.round(Math.max(...nums) * (/\bmin/.test(t) ? 60 : 1));
  return v >= 5 ? v : null;
}

/** «Lo que dure»: sin recortar ideas. En un montaje se usa todo el material (hasta 90 s). */
export const wantsAll = (answer?: string) => /dure|todo|complet/i.test(answer ?? '') && maxSeconds(answer) == null;
/** Tope de un montaje con «Lo que dure»: todo el material, sin pasar de 90 s. */
export const MONTAGE_ALL = 90;

/** Ritmo escrito a mano («Otra…»): se entiende por palabras clave. */
function ritmoFor(answer?: string): string | undefined {
  const t = norm(answer ?? '');
  if (!t || /decida/.test(t)) return undefined;
  if (RITMO[t]) return RITMO[t];
  if (/rapid|dinamic|vivo|veloz|frenetic/.test(t)) return 'rapido';
  if (/energ|potente|fuerte|intens/.test(t)) return 'energia';
  if (/elegan|pausad|lent|calm|tranquil|suave/.test(t)) return 'elegante';
  if (/sobri|serio|natural/.test(t)) return 'sobrio';
  if (/ritmo|medio|normal/.test(t)) return 'con-ritmo';
  return undefined;
}

/** Tono escrito a mano («Otra…»): se entiende por palabras clave; si no, «directo». */
function toneFor(answer?: string): { key: string; known: boolean } {
  const t = norm(answer ?? '');
  if (TONO[t]) return { key: t, known: true };
  const hit = ([['divert', 'divertido'], ['humor', 'divertido'], ['gracios', 'divertido'], ['energ', 'energico'], ['motiv', 'inspirador'], ['inspir', 'inspirador'], ['emoci', 'inspirador'],
    ['elegan', 'elegante'], ['lujo', 'elegante'], ['premium', 'elegante'], ['serio', 'elegante'], ['sobri', 'elegante'], ['cercan', 'cercano'], ['calid', 'cercano'], ['amig', 'cercano'], ['famil', 'cercano'],
    ['educ', 'educativo'], ['enseñ', 'educativo'], ['ensen', 'educativo'], ['explic', 'educativo'], ['directo', 'directo'], ['vend', 'directo']] as const).find(([k]) => t.includes(k));
  return hit ? { key: hit[1], known: true } : { key: 'directo', known: !t };
}

/** Cadencia de los cortes al ritmo de la música según el ritmo elegido. */
export function densityFor(presetId?: string): BeatDensity {
  return presetId === 'rapido' || presetId === 'energia' ? 'pulso' : presetId === 'elegante' || presetId === 'sobrio' ? 'compas' : presetId === 'con-ritmo' ? 'medio' : 'auto';
}

/** Cierre según el objetivo, cuando no se eligió uno. En un anuncio siempre hay cierre. */
export function ctaForGoal(objetivo?: string, ad = false): string {
  return (objetivo && CTA_FOR[objetivo]) || (ad ? 'Escríbenos y te contamos' : '');
}

/** Acorta un reel hablado hasta el máximo: quita escenas del medio, de atrás hacia adelante, y si aún no cabe recorta el final. */
export function fitDuration(project: Project, max: number): string {
  let removed = 0;
  while (outputDuration(project) > max && project.scenes.length > 2) {
    project.scenes.splice(project.scenes.length - 2, 1);
    removed++;
  }
  const over = outputDuration(project) - max;
  if (over > 0 && project.scenes.length) {
    const last = project.scenes[project.scenes.length - 1];
    last.trimEnd = Math.min(over, Math.max(0, sceneLength(last) - 1));
  }
  return removed ? `Duración ajustada a ${outputDuration(project).toFixed(0)} s (máximo ${max} s): se quitaron ${removed} partes del medio.` : `Duración: ${outputDuration(project).toFixed(0)} s, dentro del máximo de ${max} s.`;
}

/**
 * Arma la edición a partir del brief. Es el primer paso después de responderlo:
 * - ritmo → preset (pausas, zooms, subtítulos);
 * - duración → se acorta el reel hasta el máximo pedido;
 * - tono → estilo de textos, subtítulos, imagen y cámara;
 * - gancho y llamado a la acción → textos de la primera y la última escena;
 * - transiciones recomendadas y efectos de sonido si el ritmo es rápido.
 * No inventa contenido: los textos salen de lo que se dijo o de lo que escribió el usuario.
 * Antes guarda una versión por si se quiere volver.
 */
export async function applyBrief(dir: string): Promise<{ project: Project; summary: string[] }> {
  let project = await readProject(dir);
  const b = project.brief;
  const summary: string[] = [];
  await saveVersion(dir, 'antes-del-brief');

  // 0. Formato: lo que promete cada uno.
  const formato = b.formato ?? '';
  const tiktok = /tiktok/i.test(formato);
  const short = /short|youtube/i.test(formato);
  const ad = /anuncio/i.test(formato);

  // 1. Ritmo (el escrito a mano se entiende por palabras; TikTok sin ritmo elegido va rápido).
  const asked = ritmoFor(b.ritmo);
  const presetId = asked ?? (tiktok ? 'rapido' : project.presetId);
  if (b.ritmo && !/decida/i.test(b.ritmo) && !asked) summary.push(`No entendí el ritmo «${b.ritmo}»: dejé el del estilo actual.`);
  if (tiktok && !asked) summary.push('Formato TikTok: cortes rápidos.');
  let max = maxSeconds(b.duracion);
  if (b.duracion && max == null && !wantsAll(b.duracion)) summary.push(`No entendí la duración «${b.duracion}»: la dejé como salió.`);
  if (short && (max == null || max > 60)) { max = 60; summary.push('Formato YouTube Short: máximo 60 s.'); }
  if (project.kind === 'montaje') {
    await applyPreset(dir, presetId);
    // «Lo que dure» en un montaje: todo el material (sin pasar de 90 s), no los 15–30 s de siempre.
    const duration = max ?? (wantsAll(b.duracion) ? MONTAGE_ALL : undefined);
    const m = await buildMontage(dir, { duration, density: asked ? densityFor(presetId) : undefined });
    summary.push(`Montaje de ${m.duration.toFixed(0)} s con cortes de ~${m.clip.toFixed(1)} s (ritmo ${b.ritmo && asked ? b.ritmo : presetId}).`);
  } else {
    // Se vuelve a cortar con el ritmo elegido: cambia cuánta pausa se deja entre frases.
    await cutProject(dir, presetId);
    summary.push(`Corte con ritmo ${b.ritmo ?? presetId}: sin silencios largos, muletillas ni tomas repetidas.`);
  }
  project = await readProject(dir);
  const transcript = await readTranscript(dir);

  // 2. Duración (videos hablados).
  if (project.kind === 'hablado' && max) summary.push(fitDuration(project, max));

  // 3. Tono → estilo (el escrito a mano se entiende por palabras clave).
  const toneHit = toneFor(b.tono);
  const tone = TONO[toneHit.key];
  project.captions.effect = tone.effect;
  project.captions.emphasis = true;
  if (/historia/i.test(b.formato ?? '')) project.captions.y = 0.62; // deja libre la zona de respuesta de las historias
  const talk = project.kind === 'hablado';
  project.scenes.forEach((s, i) => {
    s.role = i === 0 ? 'gancho' : i === project.scenes.length - 1 && project.scenes.length > 1 ? 'cta' : s.role === 'gancho' || s.role === 'cta' ? 'otro' : s.role;
    s.textStyle = tone.textStyle;
    s.look = tone.look;
    s.camera = 'ninguno';
    // Texto en una de cada tres escenas del medio, sacado de lo que se dice.
    if (talk && i > 0 && i < project.scenes.length - 1 && i % 3 === 1) s.onScreenText ??= shortPhrases(speechOf(s, transcript))[0];
  });
  summary.push(!b.tono || TONO[norm(b.tono)] ? `Tono ${b.tono ?? 'directo'}: ${tone.why}.` : `Tono «${b.tono}» (lo apliqué como ${toneHit.key}${toneHit.known ? '' : ', no lo entendí'}): ${tone.why}.`);

  // 4. Gancho
  const first = project.scenes[0];
  if (first) {
    first.title ||= 'Gancho';
    first.camera = tone.camera;
    if (talk) {
      first.onScreenText ??= shortPhrases(speechOf(first, transcript))[0];
      first.textStyle = 'gigante';
      if (first.onScreenText) summary.push(`Gancho: «${first.onScreenText}» en grande desde el primer segundo.`);
    }
  }

  // 5. Llamado a la acción
  const last = project.scenes[project.scenes.length - 1];
  if (last && project.scenes.length > 1) {
    last.title ||= 'Cierre';
    // «La que digo en el video» no añade texto: el cierre es el que ya se dijo. Sin cierre elegido,
    // va el que corresponde al objetivo (y en un anuncio siempre hay cierre).
    const spoken = /digo en el video/i.test(b.cta ?? '');
    const cta = spoken ? '' : (b.cta ?? '').trim() || ctaForGoal(b.objetivo, ad);
    if (cta) {
      last.onScreenText = cta;
      last.textStyle = 'banda';
      last.textPosition = 'arriba';
      summary.push(`Cierre con tu llamado a la acción: «${last.onScreenText}»${(b.cta ?? '').trim() ? '' : b.objetivo && CTA_FOR[b.objetivo] ? ` (según tu objetivo: ${b.objetivo})` : ' (anuncio: cierre fuerte)'}.`);
    } else if (talk) {
      last.onScreenText ??= shortPhrases(speechOf(last, transcript))[0];
    }
  }

  // 5b. Motion graphics hechos con lo que se dice: uno cada tres o cuatro escenas del medio.
  if (talk) {
    let placed = 0;
    project.scenes.forEach((s, i) => {
      if (i === 0 || i === project.scenes.length - 1 || i % 3 !== 2) return;
      const idea = motionIdeas(speechOf(s, transcript), s, false).find((m) => ['pregunta', 'porcentaje', 'contador', 'comparacion', 'pasos', 'checklist'].includes(m.motionTemplate ?? ''));
      if (!idea) return;
      applyVariant(s, { ...idea, id: 'a' });
      s.chosenVariant = undefined;
      placed++;
    });
    if (placed) summary.push(`Gráficos animados: ${placed} hechos con tus cifras y frases.`);
  }

  applyPunchZooms(project.scenes, project.pacing.punchZoomEvery);
  project.briefAppliedAt = new Date().toISOString();
  await writeProject(dir, project);

  // 5c. El estilo de la marca manda sobre el del tono.
  const brand = await applyBrandStyle(dir);
  if (brand) {
    summary.push(`Estilo de la marca: ${brand.why}.`);
    const p2 = await readProject(dir);
    if (p2.scenes[0] && talk) p2.scenes[0].textStyle = brand.project.scenes[0]?.textStyle === 'apilado' ? 'apilado' : 'gigante';
    await writeProject(dir, p2);
  }

  // 6. Transiciones y efectos
  const { advice } = await applyRecommendedTransitions(dir);
  const withFx = advice.filter((a) => a.transition).length;
  summary.push(`Transiciones: ${withFx} con efecto y ${advice.length - withFx} con corte seco.`);
  const fast = presetId === 'rapido' || Boolean(brand?.project.audio.sfxAuto);
  await setAutoSfx(dir, fast);
  if (fast) summary.push('Efectos de sonido automáticos en transiciones y textos.');

  return { project: await readProject(dir), summary };
}
