import { applyVariant, briefWarnings, forbiddenShotTags, motionIdeas, outputDuration, prohibidos, resolveCta, sceneLength, shortPhrases, speechOf, wantsLogoEnding, wantsProductEnding, type Project, type Scene } from '@axioma/schema';
import { applyPunchZooms } from './cuts.ts';
import { buildMontage, type Shot } from './montage.ts';
import { readKit } from './kit.ts';
import { SHOT_TAGS, tagShots, type ShotTag } from './voicesync.ts';
import { applyBrandStyle, applyPreset, saveVersion, setAutoSfx } from './ops.ts';
import { cutProject } from './pipeline.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { applyRecommendedTransitions } from './transitions.ts';
import { CTA_FOR } from '@axioma/schema';
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
  const v = Math.round(Math.max(...nums) * (/(^|[\d\s])min(?!im)/.test(t) ? 60 : 1));
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

/**
 * Cierra el montaje con el producto: si la última escena no es una toma de comida o producto, la
 * cambia por la última toma de comida del material (el plato servido suele grabarse al final), tomando
 * su final. Si no hay tomas reconocidas como comida, no cambia nada y devuelve null.
 */
export function endOnProduct(scenes: Pick<Scene, 'ranges'>[], shots: Pick<Shot, 'start' | 'end' | 'tag'>[], tags: ShotTag[] = SHOT_TAGS): { tag: string; changed: boolean } | null {
  const food = new Set(tags.filter((t) => t.food || t.id === 'producto').map((t) => t.id));
  const last = scenes[scenes.length - 1];
  const r = last?.ranges?.[0];
  if (!r) return null;
  const at = (t: number) => shots.find((s) => t >= s.start && t < s.end);
  const mid = (x: Pick<Scene, 'ranges'>) => (x.ranges[0].start + x.ranges[0].end) / 2;
  const cur = at(mid(last));
  if (cur?.tag && food.has(cur.tag)) return { tag: cur.tag, changed: false };
  const prev = scenes.length > 1 && scenes[scenes.length - 2].ranges?.length ? at(mid(scenes[scenes.length - 2])) : undefined;
  const pick = shots.filter((s) => s.tag && food.has(s.tag) && s.end - s.start >= 0.5)
    .sort((a, b) => Number(a === prev) - Number(b === prev) || b.start - a.start)[0];
  if (!pick) return null;
  const len = Math.min(r.end - r.start, pick.end - pick.start);
  last.ranges = [{ start: +(pick.end - len).toFixed(3), end: +pick.end.toFixed(3) }];
  return { tag: pick.tag!, changed: true };
}

/** Lo que vale una escena del medio al acortar: texto, gráfico, rol y cifras u ofertas en lo que se dice. */
function sceneValue(s: Scene, transcript?: Parameters<typeof speechOf>[1]): number {
  const said = transcript ? speechOf(s, transcript).toLowerCase() : '';
  return (s.onScreenText ? 3 : 0) + (s.visual === 'motion' ? 3 : 0) + (s.brollFile ? 1 : 0)
    + (s.role !== 'otro' && s.role !== 'gancho' && s.role !== 'cta' ? 1 : 0)
    + (/\d|\$|€|precio|oferta|gratis|descuento|promo|paso|truco|clave/.test(said) ? 2 : 0);
}

/**
 * Acorta un reel hablado hasta el máximo. Nunca quita el gancho ni el cierre: quita primero las
 * escenas del medio de menos valor (sin texto, sin gráfico, sin cifras ni ofertas en lo que se
 * dice); entre las de igual valor, la más cercana al final. Si aún no cabe, recorta el final.
 */
export function fitDuration(project: Project, max: number, transcript?: Parameters<typeof speechOf>[1]): string {
  let removed = 0;
  while (outputDuration(project) > max && project.scenes.length > 2) {
    let pick = -1;
    let best = Infinity;
    for (let i = project.scenes.length - 2; i >= 1; i--) {
      const v = sceneValue(project.scenes[i], transcript);
      if (v < best) { best = v; pick = i; }
    }
    project.scenes.splice(pick, 1);
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
  let shotsSeen: Shot[] | null = null;
  if (project.kind === 'montaje') {
    await applyPreset(dir, presetId);
    // Lo prohibido y el cierre con producto necesitan saber qué hay en cada toma.
    const skipTags = forbiddenShotTags(b);
    if (skipTags.length || wantsProductEnding(b)) {
      shotsSeen = await tagShots(dir).catch(() => null);
      if (!shotsSeen) summary.push('No pude reconocer qué hay en cada toma: revisa a mano que no salga lo prohibido y que el cierre muestre el producto.');
    }
    if (shotsSeen && skipTags.length) {
      const out = shotsSeen.filter((s) => s.tag && skipTags.includes(s.tag)).length;
      summary.push(out === shotsSeen.length ? 'Todas las tomas tienen personas: no pude dejarlas fuera. Revisa el video antes de publicar.'
        : out ? `Dejé fuera ${out} ${out === 1 ? 'toma' : 'tomas'} con personas (${prohibidos(b).join(', ')}).` : 'No vi tomas con personas en el material.');
      if (prohibidos(b).some((x) => /niñ/i.test(x))) summary.push('Ojo: la app no distingue niños de adultos. Revisa que no salga ninguno.');
    }
    // «Lo que dure» en un montaje: todo el material (sin pasar de 90 s), no los 15–30 s de siempre.
    const duration = max ?? (wantsAll(b.duracion) ? MONTAGE_ALL : undefined);
    // «Que decida la app»: la cadencia sale del estilo elegido, un paso más calmada que si se pidió
    // (si no, con músicas suaves salía un corte cada compás, demasiado lento para un montaje).
    const chosen = densityFor(presetId);
    const density = asked ? chosen : chosen === 'pulso' ? 'medio' : chosen;
    const m = await buildMontage(dir, { duration, density: density === 'auto' ? undefined : density, skipTags: shotsSeen ? skipTags : undefined });
    summary.push(`Montaje de ${m.duration.toFixed(0)} s: ${m.project.scenes.length} cortes, uno cada ~${(m.duration / Math.max(1, m.project.scenes.length)).toFixed(1)} s (ritmo ${b.ritmo && asked ? b.ritmo : presetId}).`);
  } else {
    // Se vuelve a cortar con el ritmo elegido: cambia cuánta pausa se deja entre frases.
    await cutProject(dir, presetId);
    summary.push(`Corte con ritmo ${b.ritmo ?? presetId}: sin silencios largos, muletillas ni tomas repetidas.`);
  }
  project = await readProject(dir);
  const transcript = await readTranscript(dir);

  // 2. Duración (videos hablados).
  if (project.kind === 'hablado' && max) summary.push(fitDuration(project, max, transcript));

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
    // En un montaje no se dice nada: «la que digo» pasa a ser el cierre del objetivo.
    // Manda la frase elegida; si no, la de dónde se compra; si no, la del objetivo (resolveCta).
    const asked = /digo en el video/i.test(b.cta ?? '') ? '' : (b.cta ?? '').trim();
    const cta = resolveCta(b, { talk, ad });
    if (cta) {
      last.onScreenText = cta;
      last.textStyle = 'banda';
      last.textPosition = 'arriba';
      const why = asked ? '' : b.canal && cta !== CTA_FOR[b.objetivo ?? ''] ? ` (el cliente compra ${b.canal.toLowerCase()})` : b.objetivo && CTA_FOR[b.objetivo] ? ` (según tu objetivo: ${b.objetivo})` : ' (anuncio: cierre fuerte)';
      summary.push(`Cierre con tu llamado a la acción: «${last.onScreenText}»${why}.`);
    } else if (talk) {
      last.onScreenText ??= shortPhrases(speechOf(last, transcript))[0];
    }
  }

  // 5a. Cómo termina: el producto terminado (montaje) y el logo de la marca.
  if (last && project.scenes.length > 1 && project.kind === 'montaje' && wantsProductEnding(b) && shotsSeen) {
    const end = endOnProduct(project.scenes, shotsSeen);
    summary.push(!end ? 'No encontré una toma del producto terminado para el cierre: elígela a mano en Tomas.'
      : end.changed ? `El video termina con el producto (toma de ${end.tag}).` : `El video ya terminaba con el producto (toma de ${end.tag}).`);
  }
  if (last && project.scenes.length > 1 && wantsLogoEnding(b)) {
    const kit = await readKit(project.client).catch(() => null);
    if (kit?.logo && last.onScreenText) { last.textLogo = true; summary.push('El logo de la marca va en el cierre, sobre la frase final.'); }
    else summary.push(kit?.logo ? 'El cierre no tiene frase: el logo no se pudo poner encima.' : 'Pediste el logo en el cierre, pero la marca no tiene logo guardado: súbelo en Marca.');
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

  // 7. Lo que choca con el brief (precios, canal de pedido, voz): se avisa, no se cambia.
  const final = await readProject(dir);
  for (const w of briefWarnings(final)) summary.push(`Revisa: ${w}`);
  return { project: final, summary };
}
