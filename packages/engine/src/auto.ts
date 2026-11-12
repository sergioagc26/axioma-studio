import { Preset, SECTORS, TRENDS, TRENDS_DATE, VISION_TOPICS, getPreset, outputDuration, recommendPreset } from '@snz/schema';
import { fitDuration } from './brief.ts';
import { readKit } from './kit.ts';
import { buildMontage } from './montage.ts';
import { applyPresetObject, saveVersion } from './ops.ts';
import { cutProject } from './pipeline.ts';
import { listPresets } from './presets.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { readVision } from './vision.ts';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createMontage, detectShots } from './montage.ts';
import { prepareMedia, transcribeProject } from './pipeline.ts';
import { renderProject } from './render.ts';
import { createProject } from './store.ts';

/**
 * Edita el reel completo sin preguntar nada. Decide con lo que ya sabe:
 * 1. la referencia guardada del cliente (su ritmo, subtítulos y textos mandan);
 * 2. lo que está funcionando en su nicho (la marca, o lo que se ve en el video);
 * 3. lo que se ve y se oye en el video, si no hay ninguna de las dos.
 * Corta, pone gancho, textos, zooms, cámara, gráficos, transiciones y sonidos.
 * Antes guarda una versión por si se quiere volver.
 */
export async function autoEdit(dir: string, opts: { referenceId?: string } = {}): Promise<{ summary: string[] }> {
  let project = await readProject(dir);
  const summary: string[] = [];
  await saveVersion(dir, 'antes-de-editar-con-ia');

  const kit = await readKit(project.client);
  const vision = await readVision(dir).catch(() => null);
  const own = await listPresets(project.client);
  const transcript0 = await readTranscript(dir).catch(() => null);

  // Nicho: el de la marca; si no hay, el que corresponde a lo que se ve.
  const seen = VISION_TOPICS.find((t) => t.id === vision?.topic);
  // Sin marca, el nicho sale de lo que se dice (si el tema es claro) y, si no, de lo que se ve.
  const rec0 = recommendPreset(project, transcript0, vision);
  const heard = Object.entries(TRENDS).find(([, t]) => t.preset === rec0.id)?.[0];
  const sector = kit?.sector || heard || seen?.sector || null;
  const trend = sector ? TRENDS[sector] ?? TRENDS.otro : null;
  const sectorName = SECTORS.find(([id]) => id === sector)?.[1];

  // Referencia: la que se pida o la más reciente guardada del cliente.
  const refs = own.filter((p) => p.reference);
  const ref = (opts.referenceId ? refs.find((p) => p.reference === opts.referenceId || p.id === opts.referenceId) : undefined) ?? refs[refs.length - 1];

  let base: Preset;
  if (ref) {
    base = ref;
    summary.push(`Seguí tu referencia «${ref.name}»: su ritmo de cortes, subtítulos y estilo de textos.`);
  } else if (trend) {
    base = getPreset(trend.preset, own);
    summary.push(`No hay referencia guardada: usé lo que funciona en ${sectorName ?? 'tu nicho'} (${kit?.sector ? 'el nicho de tu marca' : rec0.reason.replace(/\.$/, '')}).`);
  } else {
    const rec = recommendPreset(project, transcript0, vision);
    base = getPreset(rec.id, own);
    summary.push(`Sin referencia ni marca: elegí el estilo «${base.name}». ${rec.reason}`);
  }
  if (trend) summary.push(`Tendencia aplicada (${TRENDS_DATE}): ${trend.points.join('; ').toLowerCase()}.`);

  // Mezcla: la receta de edición sale de la tendencia; lo que define la referencia manda.
  const recipe = getPreset(trend?.preset ?? base.id, own).style ?? {};
  const merged = Preset.parse({
    ...base,
    captions: { ...base.captions, ...(ref ? {} : trend?.captions ?? {}) },
    style: { ...recipe, ...(trend?.style ?? {}), ...(base.style ?? {}), ...(ref ? {} : trend?.style ?? {}) },
  });

  // 1. Corte con el ritmo elegido.
  if (project.kind === 'montaje') {
    project.pacing = merged.pacing;
    await writeProject(dir, project);
    const max = Number((project.brief.duracion ?? '').match(/\d+/g)?.map(Number).sort((a, b) => b - a)[0]) || trend?.seconds;
    const m = await buildMontage(dir, { duration: max });
    summary.push(`Montaje de ${m.duration.toFixed(0)} s con cortes de ~${m.clip.toFixed(1)} s.`);
  } else {
    await cutProject(dir, base.id);
    project = await readProject(dir);
    const asked = (project.brief.duracion ?? '').match(/\d+/g)?.map(Number) ?? [];
    // Solo se acorta si el brief pidió una duración: quitar partes por cuenta propia rompe el mensaje.
    const max = asked.length ? Math.max(...asked) : null;
    summary.push('Corté silencios largos, muletillas y tomas repetidas.');
    if (max && outputDuration(project) > max) {
      summary.push(fitDuration(project, max));
      await writeProject(dir, project);
    }
  }

  // 2. La edición: gancho, textos, zoom, cámara, gráficos, transiciones, sonidos y acabados.
  project = await applyPresetObject(dir, merged);
  project.presetId = base.id;

  // 3. Cierre con el llamado a la acción del brief, si lo hay.
  const cta = /digo en el video/i.test(project.brief.cta ?? '') ? '' : (project.brief.cta ?? '').trim();
  const last = project.scenes[project.scenes.length - 1];
  if (cta && last && project.scenes.length > 1) {
    last.onScreenText = cta;
    last.autoText = cta;
    last.textStyle = 'banda';
    last.textPosition = 'arriba';
    summary.push(`Cierre con tu llamado a la acción: «${cta}».`);
  }
  project.briefAppliedAt = new Date().toISOString();
  project = await writeProject(dir, project);

  const texts = project.scenes.filter((s) => s.onScreenText).length;
  const motions = project.scenes.filter((s) => s.visual === 'motion').length;
  const trans = project.scenes.filter((s) => s.transition).length;
  summary.push(`Quedó en ${outputDuration(project).toFixed(0)} s y ${project.scenes.length} escenas: ${texts} textos en pantalla, ${motions} gráficos animados y ${trans} transiciones${project.audio.sfxAuto ? ', con efectos de sonido' : ''}.`);
  return { summary };
}

/**
 * De un archivo de video a un reel terminado, sin intervención: crea el proyecto,
 * lo prepara, lo transcribe, lo edita con `autoEdit` y lo exporta. Si el video no
 * tiene voz, lo arma como montaje. Es lo que usa el modo automático.
 */
export async function autoVideo(input: string, opts: { client?: string; outFolder?: string; render?: boolean } = {}, log: (m: string) => void = console.log) {
  let { dir } = await createProject({ input, client: opts.client });
  log(`Proyecto: ${dir}`);
  await prepareMedia(dir, log);
  const t = await transcribeProject(dir, log);
  if (!t.words.length) {
    // Sin voz: se rehace como montaje de tomas.
    log('  sin voz: se arma como montaje');
    await rm(dir, { recursive: true, force: true });
    ({ dir } = await createMontage({ inputs: [input], client: opts.client }));
    await prepareMedia(dir, log);
    await detectShots(dir);
  }
  const { summary } = await autoEdit(dir);
  for (const line of summary) log(`  ${line}`);
  let out: string | undefined;
  if (opts.render !== false) {
    log('Exportando…');
    const name = path.basename(input, path.extname(input)).replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'reel';
    if (opts.outFolder) await mkdir(opts.outFolder, { recursive: true });
    ({ out } = await renderProject(dir, opts.outFolder ? { out: path.join(opts.outFolder, `${name}-editado.mp4`) } : {}));
    log(`Listo: ${out}`);
  }
  return { dir, out, summary };
}
