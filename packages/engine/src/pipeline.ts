import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CaptionStyle, Pacing, getPreset, type Range } from '@snz/schema';
import { autoCut, snapWordsToSpeech, type CutReport } from './cuts.ts';
import { detectSilences, extractWav16k, makeMaster, makeProxy, probe, processVoice } from './media.ts';

export interface Analysis {
  silences: Range[];
}
import { P } from './paths.ts';
import { renderProject } from './render.ts';
import { createProject, readProject, readTranscript, writeProject, writeTranscript } from './store.ts';
import { transcribeWav } from './transcribe.ts';

type Log = (msg: string) => void;

/** Master, proxy, WAV para Whisper y voz procesada. Salta lo que ya exista. */
export async function prepareMedia(dir: string, log: Log = console.log) {
  const project = await readProject(dir);
  const abs = (rel: string) => path.join(dir, rel);
  if (!existsSync(abs(P.master))) {
    log('Creando master de edición (fps constante)…');
    await makeMaster(abs(project.source.file), abs(P.master), project.format.fps, await probe(abs(project.source.file)));
  }
  if (!existsSync(abs(P.proxy))) {
    log('Creando proxy para vista previa…');
    await makeProxy(abs(P.master), abs(P.proxy));
  }
  if (!existsSync(abs(P.wav16k))) await extractWav16k(abs(P.master), abs(P.wav16k));
  if (!existsSync(abs(P.voice))) {
    log(`Limpiando y nivelando la voz a ${project.audio.targetLufs} LUFS…`);
    await processVoice(abs(P.master), abs(P.voice), project.audio);
  }
  project.source.proxy = P.proxy;
  project.source.audio = P.wav16k;
  project.audio.processedVoice = P.voice;
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
    const preset = getPreset(presetId);
    project.presetId = preset.id;
    project.pacing = Pacing.parse(preset.pacing);
    project.captions = CaptionStyle.parse(preset.captions);
  }
  const { silences } = (await readAnalysis(dir)) ?? (await analyzeAudio(dir));
  const { scenes, report } = autoCut(transcript.words, project.pacing, project.source.duration, silences);
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
