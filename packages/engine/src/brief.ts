import { outputDuration, sceneLength, shortPhrases, speechOf, type Project, type Scene } from '@snz/schema';
import { applyPunchZooms } from './cuts.ts';
import { buildMontage } from './montage.ts';
import { applyPreset, saveVersion, setAutoSfx } from './ops.ts';
import { cutProject } from './pipeline.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { applyRecommendedTransitions } from './transitions.ts';

const RITMO: Record<string, string> = { rapido: 'rapido', 'con ritmo': 'con-ritmo', sobrio: 'sobrio' };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Estilo de textos, subtítulos e imagen según el tono elegido. */
const TONO: Record<string, { textStyle: Scene['textStyle']; effect: Project['captions']['effect']; look: Scene['look']; camera: Scene['camera']; why: string }> = {
  directo: { textStyle: 'resaltado', effect: 'pop', look: 'normal', camera: 'ninguno', why: 'textos con la palabra clave en color y subtítulos que saltan' },
  cercano: { textStyle: 'subrayado', effect: 'color', look: 'calido', camera: 'acercar', why: 'tonos cálidos, la cámara se acerca y textos subrayados' },
  educativo: { textStyle: 'marcador', effect: 'caja', look: 'normal', camera: 'ninguno', why: 'la idea clave marcada con marcador y subtítulos con caja' },
  inspirador: { textStyle: 'gigante', effect: 'pop', look: 'contraste', camera: 'acercar', why: 'palabras gigantes, más contraste y la cámara acercándose' },
  divertido: { textStyle: 'banda', effect: 'caja', look: 'contraste', camera: 'ninguno', why: 'bandas de titular y colores fuertes' },
};

/** "15–20 s" → 20; "Lo que dure" → null. */
function maxSeconds(answer?: string): number | null {
  const nums = (answer ?? '').match(/\d+/g)?.map(Number) ?? [];
  return nums.length ? Math.max(...nums) : null;
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

  // 1. Ritmo
  const presetId = RITMO[norm(b.ritmo ?? '')] ?? project.presetId;
  const max = maxSeconds(b.duracion);
  if (project.kind === 'montaje') {
    await applyPreset(dir, presetId);
    const m = await buildMontage(dir, { duration: max ?? undefined });
    summary.push(`Montaje de ${m.duration.toFixed(0)} s con cortes de ~${m.clip.toFixed(1)} s (ritmo ${b.ritmo ?? presetId}).`);
  } else {
    // Se vuelve a cortar con el ritmo elegido: cambia cuánta pausa se deja entre frases.
    await cutProject(dir, presetId);
    summary.push(`Corte con ritmo ${b.ritmo ?? presetId}: sin silencios largos, muletillas ni tomas repetidas.`);
  }
  project = await readProject(dir);
  const transcript = await readTranscript(dir);

  // 2. Duración (videos hablados): se quitan escenas del medio, de atrás hacia adelante, hasta caber.
  if (project.kind === 'hablado' && max) {
    let removed = 0;
    while (outputDuration(project) > max && project.scenes.length > 2) {
      project.scenes.splice(project.scenes.length - 2, 1);
      removed++;
    }
    // Si aún no cabe, se recorta el final de la última escena.
    const over = outputDuration(project) - max;
    if (over > 0 && project.scenes.length) {
      const last = project.scenes[project.scenes.length - 1];
      last.trimEnd = Math.min(over, Math.max(0, sceneLength(last) - 1));
    }
    summary.push(removed ? `Duración ajustada a ${outputDuration(project).toFixed(0)} s (máximo ${max} s): se quitaron ${removed} partes del medio.` : `Duración: ${outputDuration(project).toFixed(0)} s, dentro del máximo de ${max} s.`);
  }

  // 3. Tono → estilo
  const tone = TONO[norm(b.tono ?? '')] ?? TONO.directo;
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
  summary.push(`Tono ${b.tono ?? 'directo'}: ${tone.why}.`);

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
    if (b.cta?.trim()) {
      last.onScreenText = b.cta.trim();
      last.textStyle = 'banda';
      last.textPosition = 'arriba';
      summary.push(`Cierre con tu llamado a la acción: «${last.onScreenText}».`);
    } else if (talk) {
      last.onScreenText ??= shortPhrases(speechOf(last, transcript))[0];
    }
  }

  applyPunchZooms(project.scenes, project.pacing.punchZoomEvery);
  project.briefAppliedAt = new Date().toISOString();
  await writeProject(dir, project);

  // 6. Transiciones y efectos
  const { advice } = await applyRecommendedTransitions(dir);
  const withFx = advice.filter((a) => a.transition).length;
  summary.push(`Transiciones: ${withFx} con efecto y ${advice.length - withFx} con corte seco.`);
  const fast = presetId === 'rapido';
  await setAutoSfx(dir, fast);
  if (fast) summary.push('Efectos de sonido automáticos en transiciones y textos.');

  return { project: await readProject(dir), summary };
}
