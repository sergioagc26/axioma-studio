import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CaptionStyle, Pacing, getPreset, type Range } from '@axioma/schema';
import { autoCut, snapWordsToSpeech, type CutReport } from './cuts.ts';
import { detectSilences, extractWav16k, makeMaster, makeProxy, probe, processVoice } from './media.ts';

export interface Analysis {
  silences: Range[];
}
import { kitCaptions, readKit } from './kit.ts';
import { P } from './paths.ts';
import { analyzeFaces } from './faces.ts';
import { analyzeVision } from './vision.ts';
import { buildMontage, createMontage, detectShots } from './montage.ts';
import { listPresets } from './presets.ts';
import { setMusic, setVoiceover } from './ops.ts';
import { renderProject } from './render.ts';
import { createProject, readProject, readTranscript, writeProject, writeTranscript } from './store.ts';
import { transcribeWav } from './transcribe.ts';

type Log = (msg: string) => void;

/**
 * Prepara el material: master, proxy, seguimiento de cara y audio.
 * - hablado: WAV para Whisper y voz limpia y nivelada.
 * - montaje: se usa el sonido original tal cual (es ambiente, no voz).
 * Salta lo que ya exista.
 */
export async function prepareMedia(dir: string, log: Log = console.log) {
  const project = await readProject(dir);
  const abs = (rel: string) => path.join(dir, rel);
  const info = await probe(abs(project.source.file));
  if (!existsSync(abs(P.master))) {
    log('Creando master de edición (fps constante)…');
    await makeMaster(abs(project.source.file), abs(P.master), project.format.fps, info, project.source.quality ?? 'normal');
    project.source.quality ??= 'normal';
  }
  if (!existsSync(abs(P.proxy))) {
    log('Creando proxy para vista previa…');
    await makeProxy(abs(P.master), abs(P.proxy));
  }
  project.source.proxy = P.proxy;
  try {
    log('Buscando la cara para el encuadre…');
    const faces = await analyzeFaces(dir, project.source.width, project.source.height);
    log(faces.length ? `  cara detectada en ${faces.length} momentos` : '  no se detectó cara: el encuadre queda centrado');
  } catch (e) {
    log(`  no se pudo analizar la cara (${e instanceof Error ? e.message : e}); el encuadre queda centrado`);
  }
  try {
    log('Mirando el video para saber de qué trata…');
    const v = await analyzeVision(dir, info.duration, log);
    log(`  se ve: ${v.scores.slice(0, 2).map((x) => `${x.label} (${Math.round(x.score * 100)} %)`).join(', ')}`);
  } catch (e) {
    log(`  no se pudo mirar el video (${e instanceof Error ? e.message : e}); las recomendaciones usarán solo lo que se dice`);
  }
  if (project.kind === 'hablado') {
    if (!info.hasAudio) throw new Error('El video no tiene audio. Para videos sin voz usa el modo montaje (se montaje).');
    if (!existsSync(abs(P.wav16k))) await extractWav16k(abs(P.master), abs(P.wav16k));
    if (!existsSync(abs(P.voice))) {
      log(`Limpiando y nivelando la voz a ${project.audio.targetLufs} LUFS…`);
      await processVoice(abs(P.master), abs(P.voice), project.audio);
    }
    project.source.audio = P.wav16k;
    project.audio.processedVoice = P.voice;
  } else if (!info.hasAudio) {
    project.audio.originalVolume = 0;
  }
  return writeProject(dir, project);
}

export async function readAnalysis(dir: string): Promise<Analysis | null> {
  const f = path.join(dir, P.analysis);
  return existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : null;
}

/** Silencios de la voz (para cortes y para ajustar los tiempos de las palabras). */
export async function analyzeAudio(dir: string): Promise<Analysis> {
  const project = await readProject(dir);
  const voice = path.join(dir, project.audio.processedVoice ?? P.voice);
  const silences = (await detectSilences(voice)).map((s) => ({
    start: s.start,
    end: Math.min(s.end, project.source.duration),
  }));
  const analysis: Analysis = { silences };
  await writeFile(path.join(dir, P.analysis), JSON.stringify(analysis, null, 2));
  return analysis;
}

export async function transcribeProject(dir: string, log: Log = console.log) {
  const existing = await readTranscript(dir);
  if (existing) return existing;
  log('Transcribiendo con whisper.cpp…');
  let last = -1;
  const raw = await transcribeWav(path.join(dir, P.wav16k), {
    onProgress: (p) => {
      const pct = Math.floor(p * 10) * 10;
      if (pct !== last) log(`  transcripción ${(last = pct)}%`);
    },
  });
  await writeFile(path.join(dir, P.transcriptRaw), JSON.stringify(raw, null, 2));
  const { silences } = (await readAnalysis(dir)) ?? (await analyzeAudio(dir));
  const t = { ...raw, words: snapWordsToSpeech(raw.words, silences) };
  await writeTranscript(dir, t);
  return t;
}

/** Aplica cortes automáticos según el preset/pacing del proyecto. */
export async function cutProject(dir: string, presetId?: string): Promise<CutReport> {
  const project = await readProject(dir);
  const transcript = await readTranscript(dir);
  if (!transcript) throw new Error('Falta la transcripción.');
  if (presetId) {
    const preset = getPreset(presetId, await listPresets(project.client));
    project.presetId = preset.id;
    project.pacing = Pacing.parse(preset.pacing);
    project.captions = CaptionStyle.parse({ ...preset.captions, ...kitCaptions(await readKit(project.client)) });
  }
  const { silences } = (await readAnalysis(dir)) ?? (await analyzeAudio(dir));
  // Un clip de un video largo solo usa su tramo.
  const cr = project.clipRange;
  const words = cr ? transcript.words.filter((w) => w.start >= cr.start - 0.05 && w.end <= cr.end + 0.05) : transcript.words;
  const { scenes, report } = autoCut(words, project.pacing, project.source.duration, silences);
  project.scenes = scenes;
  await writeProject(dir, project);
  return report;
}

/** Flujo completo: crear → preparar → transcribir → cortar → renderizar. */
export async function editVideo(
  input: string,
  opts: { name?: string; client?: string; preset?: string; render?: boolean },
  log: Log = console.log,
) {
  const { dir } = await createProject({ input, name: opts.name, client: opts.client, presetId: opts.preset });
  log(`Proyecto: ${dir}`);
  await prepareMedia(dir, log);
  const t = await transcribeProject(dir, log);
  log(`  ${t.words.length} palabras`);
  if (!t.words.length) {
    throw new Error('No se detectó voz en el video. Para videos sin voz (gimnasio, comida, cortes rápidos) usa el modo montaje: npm run se -- montaje "<video o carpeta>"');
  }
  const report = await cutProject(dir);
  log(
    `Cortes: ${report.sourceDuration.toFixed(1)} s → ${report.outputDuration.toFixed(1)} s ` +
      `(muletillas: ${report.removedFillers}, palabras de tomas repetidas: ${report.removedRetakeWords})`,
  );
  let out: string | undefined;
  if (opts.render !== false) {
    log('Renderizando…');
    let last = -1;
    ({ out } = await renderProject(dir, {
      onProgress: (p) => {
        const pct = Math.floor(p * 10) * 10;
        if (pct !== last) log(`  render ${(last = pct)}%`);
      },
    }));
    log(`Listo: ${out}`);
  }
  return { dir, report, out };
}

/** Flujo completo de un montaje sin voz: crear → preparar → detectar tomas → armar → renderizar. */
export async function editMontage(
  inputs: string[],
  opts: { name?: string; client?: string; preset?: string; duration?: number; music?: string; musicLicense?: string; voiceover?: string; render?: boolean },
  log: Log = console.log,
) {
  const { dir } = await createMontage({ inputs, name: opts.name, client: opts.client, presetId: opts.preset });
  log(`Proyecto: ${dir}`);
  await prepareMedia(dir, log);
  const shots = await detectShots(dir);
  log(`  ${shots.length} tomas detectadas`);
  if (opts.music) await setMusic(dir, opts.music, { license: opts.musicLicense });
  if (opts.voiceover) {
    log('Generando la voz en off…');
    await setVoiceover(dir, opts.voiceover);
  }
  const m = await buildMontage(dir, { duration: opts.duration });
  log(`Montaje: ${m.project.scenes.length} cortes de ~${m.clip.toFixed(2)} s${m.beat ? ' (al compás de la música)' : ''} · ${m.duration.toFixed(1)} s`);
  let out: string | undefined;
  if (opts.render !== false) {
    log('Renderizando…');
    let last = -1;
    ({ out } = await renderProject(dir, {
      onProgress: (p) => {
        const pct = Math.floor(p * 10) * 10;
        if (pct !== last) log(`  render ${(last = pct)}%`);
      },
    }));
    log(`Listo: ${out}`);
  }
  return { dir, out };
}
