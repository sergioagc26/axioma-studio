import { Preset, SECTORS, TRENDS, TRENDS_DATE, VISION_TOPICS, getPreset, outputDuration, recommendPreset } from '@axioma/schema';
import { fitDuration } from './brief.ts';
import { readKit } from './kit.ts';
import { buildMontage } from './montage.ts';
import { applyPresetObject, saveVersion } from './ops.ts';
import { cutProject } from './pipeline.ts';
import { listPresets } from './presets.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { readVision } from './vision.ts';
import { envValue } from './env.ts';
import { llmHook, llmReady } from './llm.ts';
import { downloadBroll, searchBroll, stockSource } from './pexels.ts';
import { keywords, speechOf } from '@axioma/schema';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createMontage, detectShots } from './montage.ts';
import { prepareMedia, transcribeProject } from './pipeline.ts';
import { renderProject } from './render.ts';
import { createProject } from './store.ts';

const GREETING = /^(hola|holaa+|buenas|buenos|buen|que|qué|bienvenidos|bienvenidas|bienvenido|bienvenida|hey|ey)$/;
const GREETING_TAIL = new Set(['a', 'todos', 'todas', 'amigos', 'amigas', 'chicos', 'chicas', 'gente', 'tal', 'dias', 'días', 'tardes', 'noches', 'como', 'cómo', 'estan', 'están', 'mi', 'este', 'al', 'canal', 'nuevo', 'video', 'de', 'nuevo,', 'que', 'qué']);
const plain = (w: string) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñ]/g, '');

/**
 * Si el reel empieza con un saludo («hola a todos», «qué tal amigos», «bienvenidos al canal»),
 * mueve el inicio de la primera escena justo después. Devuelve el saludo quitado o ''.
 */
export function skipGreeting(project: { scenes: { ranges: { start: number; end: number }[] }[] }, transcript: { words: { text: string; start: number; end: number }[] } | null): string {
  const first = project.scenes[0];
  if (!first || !transcript) return '';
  const r0 = first.ranges[0];
  const words = transcript.words.filter((w) => (w.start + w.end) / 2 >= r0.start && (w.start + w.end) / 2 < r0.end).slice(0, 8);
  if (!words.length || !GREETING.test(plain(words[0].text))) return '';
  // «qué» solo cuenta si va seguido de «tal».
  if (/^qu[eé]$/i.test(plain(words[0].text)) && plain(words[1]?.text ?? '') !== 'tal') return '';
  let n = 1;
  while (n < words.length && GREETING_TAIL.has(plain(words[n].text)) && !/[.!?]$/.test(words[n - 1].text)) n++;
  const cutAt = words[n - 1].end + 0.05;
  const rest = first.ranges.reduce((a, r) => a + Math.max(0, r.end - Math.max(r.start, cutAt)), 0);
  if (rest < 1.2) return ''; // la escena quedaría casi vacía
  r0.start = Math.min(cutAt, r0.end - 0.3);
  return words.slice(0, n).map((w) => w.text).join(' ').replace(/[,.!¡¿?]+$/g, '');
}

/** Decide con qué estilo editar: referencia del cliente, tendencia del nicho o lo que se ve y se oye. */
async function decideStyle(dir: string, project: Awaited<ReturnType<typeof readProject>>, referenceId?: string) {
  const lines: string[] = [];
  const opts = { referenceId };
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
    lines.push(`Seguí tu referencia «${ref.name}»: su ritmo de cortes, subtítulos y estilo de textos.`);
  } else if (trend) {
    base = getPreset(trend.preset, own);
    lines.push(`No hay referencia guardada: usé lo que funciona en ${sectorName ?? 'tu nicho'} (${kit?.sector ? 'el nicho de tu marca' : rec0.reason.replace(/\.$/, '')}).`);
  } else {
    const rec = recommendPreset(project, transcript0, vision);
    base = getPreset(rec.id, own);
    lines.push(`Sin referencia ni marca: elegí el estilo «${base.name}». ${rec.reason}`);
  }
  if (trend) lines.push(`Tendencia aplicada (${TRENDS_DATE}): ${trend.points.join('; ').toLowerCase()}.`);

  // Mezcla: la receta de edición sale de la tendencia; lo que define la referencia manda.
  const recipe = getPreset(trend?.preset ?? base.id, own).style ?? {};
  const merged = Preset.parse({
    ...base,
    captions: { ...base.captions, ...(ref ? {} : trend?.captions ?? {}) },
    style: { ...recipe, ...(trend?.style ?? {}), ...(base.style ?? {}), ...(ref ? {} : trend?.style ?? {}) },
  });

  return { kit, ref, trend, base, merged, lines, transcript0 };
}

/**
 * Plan de la edición con IA, sin aplicar nada: qué estilo, qué tendencia y qué hará con el
 * reel. Se muestra antes de «Editar todo con IA» para que el usuario lo apruebe.
 */
export async function planAutoEdit(dir: string): Promise<string[]> {
  const project = await readProject(dir);
  const { trend, merged, lines, transcript0 } = await decideStyle(dir, project);
  const st = merged.style ?? {};
  const level = project.intensity ?? 'media';
  // En el plan se habla en futuro.
  const plan = lines.map((l) => l.replace(/^Seguí/, 'Seguiré').replace(/usé lo que/, 'usaré lo que').replace(/elegí el estilo/, 'elegiré el estilo').replace(/^Tendencia aplicada/, 'Aplicaré la tendencia'));
  plan.push(`Intensidad ${level}: ${level === 'suave' ? 'pocos textos, sin zooms de golpe ni sonidos' : level === 'fuerte' ? 'textos en muchas escenas, zooms, gráficos frecuentes y sonidos' : `${st.texts === 'muchos' ? 'textos en una de cada dos escenas' : 'textos en una de cada tres escenas'}${st.zoomText ? ', zoom cuando aparece un texto' : ''}${st.motionEvery ? `, un gráfico cada ${st.motionEvery} escenas con tus cifras y frases` : ''}`}.`);
  if (project.kind === 'hablado') {
    plan.push('Cortaré silencios largos, muletillas y tomas repetidas.');
    const probe = { scenes: project.scenes.map((s) => ({ ranges: s.ranges.map((r) => ({ ...r })) })) };
    const g = skipGreeting(probe, transcript0);
    if (g) plan.push(`Quitaré el saludo del inicio («${g}») para abrir con el gancho.`);
    const asked = (project.brief.duracion ?? '').match(/\d+/g)?.map(Number) ?? [];
    if (asked.length) plan.push(`Lo dejaré en máximo ${Math.max(...asked)} s, como pediste en el brief.`);
    const bank = await stockSource();
    if (bank) plan.push(`Pondré b-roll de ${bank} en algunas escenas del medio, elegido por lo que dices.`);
  } else {
    plan.push(`Montaje con cortes al ritmo${trend ? `, de unos ${trend.seconds} s` : ''}.`);
  }
  if (st.transitions) plan.push(`Transiciones recomendadas${st.flashes ? ' con destellos' : ''}${st.sfxAuto ? ' y efectos de sonido' : ''}.`);
  const cta = /digo en el video/i.test(project.brief.cta ?? '') ? '' : (project.brief.cta ?? '').trim();
  if (cta) plan.push(`Cierre con tu llamado a la acción: «${cta}».`);
  plan.push('Antes guardaré una versión para que puedas volver atrás.');
  return plan;
}

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

  const { kit, ref, trend, base, merged, lines, transcript0 } = await decideStyle(dir, project, opts.referenceId);
  void kit; void transcript0;
  summary.push(...lines);

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
    // Abrir con el gancho, no con el saludo: los mejores reels no empiezan con «hola a todos».
    const greeting = skipGreeting(project, await readTranscript(dir).catch(() => null));
    if (greeting) { project = await writeProject(dir, project); summary.push(`Quité el saludo del inicio («${greeting}») para abrir directo con el gancho.`); }
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

  // 2b. B-roll automático de Pexels o Pixabay (si hay clave): una de cada cuatro escenas del medio,
  // nunca el gancho ni el cierre, y solo donde no hay texto ni gráfico.
  const stock = project.kind === 'hablado' ? await stockSource() : null;
  if (stock) {
    const transcript = await readTranscript(dir).catch(() => null);
    let put = 0;
    for (const [i, s] of project.scenes.entries()) {
      if (i === 0 || i === project.scenes.length - 1 || i % 4 !== 2 || s.visual !== 'original' || s.onScreenText) continue;
      const words = keywords(speechOf(s, transcript), 2);
      if (!words.length) continue;
      try {
        const found = (await searchBroll(words.join(' '), 3))[0] ?? (await searchBroll(words[0], 3))[0];
        if (!found) continue;
        const file = await downloadBroll(dir, found);
        const rel = path.relative(dir, file).split(path.sep).join('/');
        s.brollFile = rel;
        s.visual = 'broll';
        project.assets = [...project.assets.filter((a) => a.file !== rel), { file: rel, kind: 'broll', source: found.source, license: found.license, author: found.author, url: found.url }];
        put++;
      } catch { /* sin internet o sin resultados: la escena queda con el video original */ }
    }
    if (put) { project = await writeProject(dir, project); summary.push(`B-roll de ${stock} en ${put} escenas, elegido por lo que dices en cada una.`); }
  }

  // 2c. Gancho redactado por la IA local (si está instalada), fiel a lo que se dice.
  if (project.kind === 'hablado' && project.scenes[0]?.onScreenText && (await llmReady())) {
    const first = project.scenes[0];
    const said = speechOf(first, await readTranscript(dir).catch(() => null));
    try {
      const hook = await llmHook(said);
      if (hook) {
        first.onScreenText = hook;
        first.autoText = hook;
        project = await writeProject(dir, project);
        summary.push(`Gancho escrito por la IA local: «${hook}».`);
      }
    } catch { /* sin IA local se queda el gancho sacado de lo que se dice */ }
  }

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
