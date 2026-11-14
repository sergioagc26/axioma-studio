import { Preset, sceneLength, SECTORS, TRENDS, TRENDS_DATE, VISION_TOPICS, getPreset, outputDuration, recommendPreset } from '@axioma/schema';
import { MONTAGE_ALL, applyBrief, ctaForGoal, fitDuration, maxSeconds, wantsAll } from './brief.ts';
import { autoMusic } from './musiclib.ts';
import { applyWishes, buildPrompt } from './briefai.ts';
import { setAutoSfx } from './ops.ts';
import { readKit } from './kit.ts';
import { buildMontage } from './montage.ts';
import { applyPresetObject, saveVersion } from './ops.ts';
import { cutProject } from './pipeline.ts';
import { listPresets, savePreset } from './presets.ts';
import { listReferences, presetFromReference } from './reference.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { readVision } from './vision.ts';
import { envValue } from './env.ts';
import { llmHook, llmReady } from './llm.ts';
import { downloadBroll, searchBroll, stockSource } from './pexels.ts';
import { keywords, speechOf } from '@axioma/schema';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { asMontage, createMontage, detectShots } from './montage.ts';
import { prepareMedia, transcribeProject } from './pipeline.ts';
import { hasSpeech } from './transcribe.ts';
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
  // «Sin referencia» en el brief: no se usa ninguna, aunque el cliente tenga guardadas.
  const none = referenceId === 'ninguna';
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

  // Referencia: solo la que se eligió. Sin elegir (o «Sin referencia») no se usa ninguna.
  const refs = own.filter((p) => p.reference);
  const ref = none || !opts.referenceId ? undefined : refs.find((p) => p.reference === opts.referenceId || p.id === opts.referenceId);

  let base: Preset;
  if (ref) {
    base = ref;
    // El nombre actual de la referencia (si se renombró, no el que tenía al guardar el estilo).
    const refName = (await listReferences(project.client)).find((r) => r.id === ref.reference)?.name ?? ref.name;
    lines.push(`Seguí tu referencia «${refName}»: su ritmo de cortes, subtítulos y estilo de textos.`);
  } else if (trend) {
    base = getPreset(trend.preset, own);
    lines.push(`Sin referencia: usé lo que funciona en ${sectorName ?? 'tu nicho'} (${kit?.sector ? 'el nicho de tu marca' : rec0.reason.replace(/\.$/, '')}).`);
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

/** Las respuestas del brief que deciden la edición. */
const ANSWERS = ['ritmo', 'tono', 'duracion', 'cta', 'objetivo'] as const;

/**
 * Cómo se va a editar: con la referencia elegida en el brief (la única que manda), con el brief
 * (si tiene 2 o más respuestas y no hay referencia) o con la tendencia del nicho. Solo lee.
 */
export async function editRoute(project: Awaited<ReturnType<typeof readProject>>, forced?: string): Promise<{ referenceId?: string; reference?: Awaited<ReturnType<typeof listReferences>>[number]; useBrief: boolean; answered: number }> {
  const answered = ANSWERS.filter((k) => project.brief[k]).length;
  const chosen = forced ?? project.brief.referencia;
  let referenceId: string | undefined;
  let reference: Awaited<ReturnType<typeof listReferences>>[number] | undefined;
  if (chosen && chosen !== 'ninguna') {
    reference = (await listReferences(project.client)).find((r) => r.id === chosen);
    // Un estilo propio también vale como referencia (p. ej. desde «auto-editar» con refId de un estilo).
    if (reference) referenceId = reference.id;
    else if ((await listPresets(project.client)).some((p) => p.reference && (p.id === chosen || p.reference === chosen))) referenceId = chosen;
  }
  return { referenceId, reference, useBrief: answered >= 2 && !referenceId, answered };
}

/**
 * Plan de la edición con IA, sin aplicar nada: qué estilo, qué tendencia y qué hará con el
 * reel. Se muestra antes de «Editar todo con IA» para que el usuario lo apruebe.
 */
export async function planAutoEdit(dir: string): Promise<string[]> {
  const project = await readProject(dir);
  const route = await editRoute(project);
  const b = project.brief;
  const asked = maxSeconds(b.duracion);
  const max = /short|youtube/i.test(b.formato ?? '') && (asked == null || asked > 60) ? 60 : asked;
  const cta = /digo en el video/i.test(b.cta ?? '') ? '' : (b.cta ?? '').trim() || ctaForGoal(b.objetivo, /anuncio/i.test(b.formato ?? ''));
  const musicLine = project.audio.music ? 'Dejaré la música que ya tiene.' : project.audio.musicOff ? 'No pondré música: la quitaste a mano.' : project.kind === 'montaje' ? 'Elegiré la música primero y cortaré en sus golpes.' : 'Pondré música del ánimo del video, bajita debajo de la voz.';
  if (route.useBrief) {
    // Con el brief respondido se edita con el brief: el plan dice eso, no la tendencia.
    const plan = [`Editaré según tu brief${b.ritmo && !/decida/i.test(b.ritmo) ? `: ritmo ${b.ritmo}` : ''}${b.tono ? `${b.ritmo && !/decida/i.test(b.ritmo) ? ',' : ':'} tono ${b.tono}` : ''}. Sin referencia.`];
    if (project.kind === 'hablado') plan.push('Cortaré silencios largos, muletillas y tomas repetidas, y abriré con el gancho.');
    if (max) plan.push(`Lo dejaré en máximo ${max} s, como pediste.`);
    else if (project.kind === 'montaje') plan.push(wantsAll(b.duracion) ? `Montaje con todo el material (hasta ${MONTAGE_ALL} s).` : 'Montaje con cortes al ritmo de la música.');
    if (cta) plan.push(`Cierre con tu llamado a la acción: «${cta}».`);
    plan.push(musicLine);
    plan.push('Antes guardaré una versión para que puedas volver atrás.');
    return plan;
  }
  const { trend, merged, lines, transcript0 } = await decideStyle(dir, project, route.referenceId ?? 'ninguna');
  const st = merged.style ?? {};
  const level = project.intensity ?? 'media';
  // En el plan se habla en futuro.
  const plan = lines.map((l) => l.replace(/^Seguí/, 'Seguiré').replace(/usé lo que/, 'usaré lo que').replace(/elegí el estilo/, 'elegiré el estilo').replace(/^Tendencia aplicada/, 'Aplicaré la tendencia'));
  // La referencia elegida aún no tiene estilo guardado: se creará al editar.
  if (route.reference && !lines.some((l) => l.startsWith('Seguí'))) plan[0] = `Seguiré tu referencia «${route.reference.name}»: su ritmo de cortes, subtítulos y estilo de textos.`;
  plan.push(`Intensidad ${level}: ${level === 'suave' ? 'pocos textos, sin zooms de golpe ni sonidos' : level === 'fuerte' ? 'textos en muchas escenas, zooms, gráficos frecuentes y sonidos' : `${st.texts === 'muchos' ? 'textos en una de cada dos escenas' : 'textos en una de cada tres escenas'}${st.zoomText ? ', zoom cuando aparece un texto' : ''}${st.motionEvery ? `, un gráfico cada ${st.motionEvery} escenas con tus cifras y frases` : ''}`}.`);
  if (project.kind === 'hablado') {
    plan.push('Cortaré silencios largos, muletillas y tomas repetidas.');
    const probe = { scenes: project.scenes.map((s) => ({ ranges: s.ranges.map((r) => ({ ...r })) })) };
    const g = skipGreeting(probe, transcript0);
    if (g) plan.push(`Quitaré el saludo del inicio («${g}») para abrir con el gancho.`);
    if (max) plan.push(`Lo dejaré en máximo ${max} s, como pediste en el brief.`);
    const bank = await stockSource();
    if (bank) plan.push(`Pondré b-roll de ${bank} en algunas escenas del medio, elegido por lo que dices.`);
  } else {
    plan.push(`Montaje con cortes al ritmo, de unos ${max ?? (wantsAll(b.duracion) ? MONTAGE_ALL : trend?.seconds ?? 30)} s.`);
  }
  if (st.transitions) plan.push(`Transiciones recomendadas${st.flashes ? ' con destellos' : ''}${st.sfxAuto && !project.audio.sfxOff ? ' y efectos de sonido' : ''}.`);
  if (cta) plan.push(`Cierre con tu llamado a la acción: «${cta}».`);
  plan.push(musicLine);
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

  // Formato del brief (también con referencia): YouTube Short máximo 60 s; Historia deja libre la
  // zona de respuesta (se aplica después del estilo); el anuncio siempre lleva cierre (ver el paso 3).
  const formato = project.brief.formato ?? '';
  const short = /short|youtube/i.test(formato);
  const askedMax = maxSeconds(project.brief.duracion);
  const formatMax = short && (askedMax == null || askedMax > 60) ? 60 : askedMax;
  if (short && formatMax !== askedMax) summary.push('Formato YouTube Short: máximo 60 s.');

  // 1. Corte con el ritmo elegido.
  if (project.kind === 'montaje') {
    project.pacing = merged.pacing;
    await writeProject(dir, project);
    const max = formatMax ?? (wantsAll(project.brief.duracion) ? MONTAGE_ALL : short ? Math.min(60, trend?.seconds ?? 60) : trend?.seconds);
    const m = await buildMontage(dir, { duration: max });
    summary.push(`Montaje de ${m.duration.toFixed(0)} s: ${m.project.scenes.length} cortes, uno cada ~${(m.duration / Math.max(1, m.project.scenes.length)).toFixed(1)} s.`);
  } else {
    await cutProject(dir, base.id);
    project = await readProject(dir);
    // Abrir con el gancho, no con el saludo: los mejores reels no empiezan con «hola a todos».
    const greeting = skipGreeting(project, await readTranscript(dir).catch(() => null));
    if (greeting) { project = await writeProject(dir, project); summary.push(`Quité el saludo del inicio («${greeting}») para abrir directo con el gancho.`); }
    // Solo se acorta si el brief pidió una duración: quitar partes por cuenta propia rompe el mensaje.
    const max = formatMax;
    summary.push('Corté silencios largos, muletillas y tomas repetidas.');
    if (max && outputDuration(project) > max) {
      summary.push(fitDuration(project, max, await readTranscript(dir).catch(() => null)));
      await writeProject(dir, project);
    }
  }

  // 2. La edición: gancho, textos, zoom, cámara, gráficos, transiciones, sonidos y acabados.
  project = await applyPresetObject(dir, merged);
  project.presetId = base.id;
  if (/historia/i.test(formato)) project.captions.y = 0.62; // deja libre la zona de respuesta de las historias

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
      const hook = await llmHook(said, project.brief.publico);
      if (hook) {
        first.onScreenText = hook;
        first.autoText = hook;
        project = await writeProject(dir, project);
        summary.push(`Gancho escrito por la IA local: «${hook}».`);
      }
    } catch { /* sin IA local se queda el gancho sacado de lo que se dice */ }
  }

  // 3. Cierre con el llamado a la acción del brief (o el de su objetivo), si lo hay.
  const cta = project.kind === 'hablado' && /digo en el video/i.test(project.brief.cta ?? '') ? '' : (/digo en el video/i.test(project.brief.cta ?? '') ? '' : (project.brief.cta ?? '').trim()) || ctaForGoal(project.brief.objetivo, /anuncio/i.test(project.brief.formato ?? ''));
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
  if (!hasSpeech(t)) {
    // Sin voz: se rehace como montaje de tomas.
    log('  sin voz: se arma como montaje');
    await rm(dir, { recursive: true, force: true });
    ({ dir } = await createMontage({ inputs: [input], client: opts.client }));
    await prepareMedia(dir, log);
    await detectShots(dir);
  }
  const { summary } = await editEverything(dir);
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

/**
 * La edición completa de principio a fin, sin que el usuario busque nada: corta, viste el reel
 * (con el brief si lo respondió; si no, con la referencia o la tendencia del nicho), pone música
 * del ánimo que pide, efectos de sonido y deja todo listo para exportar.
 */
export async function editEverything(dir: string, opts: { referenceId?: string; onProgress?: (m: string) => void } = {}): Promise<{ summary: string[] }> {
  const say = opts.onProgress ?? (() => {});
  let project = await readProject(dir);
  const fixes: string[] = [];
  // Montaje con la mezcla de un video hablado (música bajita, sonido del celular a tope): se corrige.
  if (project.kind === 'montaje') { asMontage(project); await writeProject(dir, project); }
  // Un video marcado como «hablado» sin voz real (Whisper inventa «*música*» sobre la música) se
  // edita como montaje: si no, se recortaba a lo poco que «se dijo» y se subtitulaba el ruido.
  if (project.kind === 'hablado' && !hasSpeech(await readTranscript(dir).catch(() => null))) {
    say('No hay voz: lo armo como montaje…');
    asMontage(project);
    project.scenes = [];
    await writeProject(dir, project);
    await detectShots(dir).catch(() => []);
    project = await readProject(dir);
    fixes.push('No encontré voz en el video: lo edité como montaje al ritmo de la música (sin subtítulos).');
  }
  // La referencia elegida en el brief es la única que manda: su estilo (ritmo, subtítulos, textos)
  // va sobre el tono; el brief sigue decidiendo la duración y el cierre. Sin elegir, ninguna.
  const route = await editRoute(project, opts.referenceId);
  const referenceId = route.referenceId;
  // Si aún no hay un estilo guardado de esa referencia, se crea ahora.
  if (route.reference && !(await listPresets(project.client)).some((p) => p.reference === route.reference!.id)) await savePreset(project.client, presetFromReference(route.reference));

  // Montaje: la música se elige ANTES de cortar, para armarlo una sola vez en sus golpes con la
  // duración del brief (si se pusiera después, se rehacía el montaje y se perdía todo).
  const musicLines: string[] = [];
  if (project.kind === 'montaje') {
    say('Eligiendo la música…');
    musicLines.push(...(await musicFor(dir)));
  }

  let summary: string[];
  if (route.useBrief) {
    say('Cortando y armando según tu brief…');
    summary = (await applyBrief(dir)).summary;
    // Lo que el brief no hace y la edición automática sí: abrir con el gancho y redactarlo con la IA local.
    project = await readProject(dir);
    if (project.kind === 'hablado') {
      const greeting = skipGreeting(project, await readTranscript(dir).catch(() => null));
      if (greeting) { await writeProject(dir, project); summary.push(`Quité el saludo del inicio («${greeting}») para abrir directo con el gancho.`); }
      // El gancho lo redacta la IA local: una idea que enganche, no la primera frase tal cual.
      const first = project.scenes[0];
      if (first && (await llmReady())) {
        try {
          const hook = await llmHook(speechOf(first, await readTranscript(dir).catch(() => null)), project.brief.publico);
          if (hook) {
            first.onScreenText = hook; first.autoText = hook;
            await writeProject(dir, project);
            const i = summary.findIndex((l) => l.startsWith('Gancho:'));
            const line = `Gancho escrito por la IA: «${hook}» en grande desde el primer segundo.`;
            if (i >= 0) summary[i] = line; else summary.push(line);
          }
        } catch { /* queda el gancho sacado de lo que se dice */ }
      }
    }
  } else {
    say('Cortando y armando el video…');
    summary = (await autoEdit(dir, { referenceId: referenceId ?? 'ninguna' })).summary;
  }

  // Los pedidos puntuales del cliente (respuestas a las preguntas de la IA y su nota).
  say('Aplicando lo que pediste…');
  summary.push(...(await applyWishes(dir).catch(() => ['No pude aplicar tus pedidos puntuales: cámbialos a mano en el editor.'])));
  // El prompt profesional con el que se editó queda guardado en el proyecto.
  project = await readProject(dir);
  project.brief.prompt = await buildPrompt(dir);
  await writeProject(dir, project);

  // Música: sola, del ánimo que pide el reel (en los montajes ya se eligió antes de cortar).
  if (project.kind !== 'montaje') {
    say('Eligiendo la música…');
    musicLines.push(...(await musicFor(dir)));
  }
  summary.push(...musicLines);

  // Efectos de sonido: siempre, salvo que se haya pedido algo sobrio o se apagaron a mano.
  project = await readProject(dir);
  const calm = project.intensity === 'suave' || /elegante|serio|sobrio/i.test(`${project.brief.tono ?? ''} ${project.brief.ritmo ?? ''}`);
  if (project.audio.sfxOff) {
    if (project.audio.sfxAuto) await setAutoSfx(dir, false);
    summary.push('Sin efectos de sonido automáticos: los apagaste a mano.');
  } else if (!calm && !project.audio.sfxAuto) {
    say('Poniendo efectos de sonido…');
    await setAutoSfx(dir, true);
    summary.push('Efectos de sonido en las transiciones y al entrar cada texto.');
  }
  // Montaje: un video sin voz necesita un gancho en pantalla desde el primer segundo (antes solo
  // llevaba el texto del cierre). Sale del brief y de lo que se ve; nunca inventa cifras.
  project = await readProject(dir);
  const opening = project.kind === 'montaje' ? project.scenes[0] : undefined;
  if (opening && !opening.onScreenText) {
    const hook = await montageHook(dir, project).catch(() => null);
    if (hook) {
      opening.onScreenText = hook; opening.autoText = hook;
      opening.textStyle = opening.textStyle === 'caja' ? 'gigante' : opening.textStyle;
      opening.textPosition = 'arriba';
      // En un montaje los planos duran menos de un segundo: el gancho sigue en las escenas
      // siguientes hasta ~2,5 s (se dibuja como un solo rótulo, sin volver a entrar).
      let shown = sceneLength(opening);
      for (const s of project.scenes.slice(1, -1)) {
        if (shown >= 2.5 || s.onScreenText || s.visual === 'motion') break;
        s.onScreenText = hook; s.autoText = hook;
        s.textStyle = opening.textStyle; s.textPosition = opening.textPosition; s.textAnim = opening.textAnim;
        s.textKeyword = opening.textKeyword; s.textColor = opening.textColor; s.textFont = opening.textFont;
        shown += sceneLength(s);
      }
      await writeProject(dir, project);
      summary.push(`Gancho en pantalla: «${hook}» desde el primer segundo.`);
    }
  }
  summary.unshift(...fixes);
  // Lo que se hizo queda guardado para mostrarlo en Resultado (también tras recargar).
  await writeFile(path.join(dir, 'resumen-edicion.json'), JSON.stringify({ at: new Date().toISOString(), summary }, null, 2)).catch(() => {});
  return { summary };
}

/** Pone la música automática y dice qué pasó (también cuando no se pudo o se quitó a mano). */
async function musicFor(dir: string): Promise<string[]> {
  const before = await readProject(dir);
  if (before.audio.music) return [];
  if (before.audio.musicOff) return ['Sin música: la quitaste a mano (ponla de nuevo en Audio si la quieres).'];
  // En el montaje no se rehace aquí: el corte viene justo después, ya con la canción.
  const music = await autoMusic(dir, undefined, { rebuild: false }).catch(() => null);
  if (music) return [music];
  if (!(await envValue('FREESOUND_API_KEY'))) return ['Sin música: falta la clave gratuita de Freesound (Proyectos › Ajustes › Claves). También puedes agregar canciones en Audio.'];
  return ['Sin música: no encontré una canción (revisa el internet) o agrega canciones en Audio.'];
}

/**
 * Gancho para un montaje sin voz: con la IA local, a partir de lo que pide el brief (nota, datos,
 * objetivo) y de lo que se ve; sin IA, la nota o el dato del cliente acortados. Nunca inventa cifras.
 */
export async function montageHook(dir: string, project: Awaited<ReturnType<typeof readProject>>): Promise<string | null> {
  const b = project.brief;
  const extras = Object.entries(b).filter(([k, v]) => k.startsWith('extra:') && v && !/^no aplica$/i.test(v)).map(([, v]) => v);
  const seen = (await readVision(dir).catch(() => null))?.scores?.[0]?.label;
  const kit = await readKit(project.client).catch(() => null);
  const context = [
    b.notas ? `Lo que dice el cliente: ${b.notas}` : '',
    extras.length ? `Datos del cliente: ${extras.join(' · ')}` : '',
    seen ? `En el video se ve: ${seen}` : '',
    kit?.name ? `Marca: ${kit.name}${kit.sector ? ` (${kit.sector})` : ''}` : '',
  ].filter(Boolean).join('\n');
  if (await llmReady()) {
    const hook = await llmHook(`(Video sin voz: escribe el texto de apertura que le hable a quien lo ve, sobre lo que se ve en el video, a partir de esto y sin inventar datos ni mencionar seguidores, likes o redes)\n${context}`, b.publico).catch(() => null);
    if (hook) return hook;
  }
  // Sin IA: la nota o el dato del cliente, cortado a 6 palabras.
  const plain = (b.notas || extras[0] || '').replace(/[.!?¡¿"«»]/g, '').trim();
  if (!plain) return null;
  const words = plain.split(/\s+/).slice(0, 6).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
