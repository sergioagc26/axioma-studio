import { Cancelled, checkCancelled, currentSignal, onCancel } from './cancel.ts';
import { buildFront, readFront } from './front.ts';
import { cutoutCoverage } from './matte.ts';
import { llmUnload } from './llm.ts';
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { FORMATS, buildTimeline, frontKey, type Brand, type FormatId, type Project, type Transcript } from '@axioma/schema';
import { readSpeakers } from './speakers.ts';
import { captionWords } from './subtitles.ts';
import { readFaces } from './faces.ts';
import { clientLogo, learnFromExport, readKit } from './kit.ts';
import { allTransitions } from './transitions.ts';
import { normalizeMix } from './media.ts';
import { ensureUsedSfx } from './sfx.ts';
import { depthPath, ensureProjectDepth } from './depth.ts';
import { gradedMaster } from './lut.ts';
import { publishPack, publishText, toSrt } from '@axioma/schema';
import { P, REMOTION_ENTRY } from './paths.ts';
import { serveFolder } from './server.ts';
import { readProject, readTranscript } from './store.ts';

let bundled: Promise<string> | null = null;
/** Empaqueta la composición de Remotion una vez por proceso. */
export function getBundle() {
  bundled ??= bundle({ entryPoint: REMOTION_ENTRY, onProgress: () => {} });
  return bundled;
}

/** Colores, nombre y logo del kit del cliente para las plantillas. */
export async function brandFor(project: Project, asset: (rel: string) => string, dir: string): Promise<Brand> {
  const kit = await readKit(project.client);
  let logo = project.assets.find((a) => a.kind === 'logo')?.file;
  // Sin logo propio del proyecto: el de la marca del cliente (se copia dentro para poder servirlo).
  if (!logo || !existsSync(path.join(dir, logo))) {
    const fromKit = await clientLogo(project.client);
    if (fromKit) {
      const rel = path.join('media', 'marca', `logo-marca${path.extname(fromKit)}`);
      const dest = path.join(dir, rel);
      if (!existsSync(dest) || statSync(dest).mtimeMs < statSync(fromKit).mtimeMs) {
        await mkdir(path.dirname(dest), { recursive: true });
        await copyFile(fromKit, dest);
      }
      logo = rel.split(path.sep).join('/');
    }
  }
  return {
    primary: kit?.colors.primary ?? project.captions.highlightColor,
    secondary: kit?.colors.secondary ?? '#25F4EE',
    text: kit?.colors.text ?? '#FFFFFF',
    name: kit?.name ?? project.client,
    logoSrc: logo && existsSync(path.join(dir, logo)) ? asset(logo) : undefined,
  };
}

/** Capa de «texto detrás de la comida», si está pedida y hecha. */
async function frontFor(dir: string, project: Project, asset: (rel: string) => string) {
  if (!project.captions.behind) return undefined;
  const f = await readFront(dir, project);
  return f ? { src: asset(f.file.split(path.sep).join('/')), key: f.key } : undefined;
}

/** Voz en off (con sus palabras) y seguimiento de cara, para armar la línea de tiempo. */
export async function timelineExtras(dir: string, project: Project, asset: (rel: string) => string) {
  const vo = project.audio.voiceover;
  const wordsFile = path.join(dir, vo?.wordsFile ?? P.voiceoverWords);
  const voiceover = vo && existsSync(path.join(dir, vo.file))
    ? { src: asset(vo.file), words: existsSync(wordsFile) ? (JSON.parse(await readFile(wordsFile, 'utf8')).words as Transcript['words']) : [] }
    : undefined;
  const speakers = project.source.followSpeaker ? (await readSpeakers(dir))?.turns : undefined;
  const translated = await captionWords(dir, project.captions.language);
  return { voiceover, faces: await readFaces(dir), speakers, captionWords: translated, transitions: await allTransitions(project.client), cutout: existsSync(path.join(dir, P.cutout)) ? asset(P.cutout.split(path.sep).join('/')) : undefined, cutoutCoverage: await cutoutCoverage(dir), front: await frontFor(dir, project, asset), depth: project.scenes.flatMap((s) => [s.brollFile, s.backdropFile]).filter((f): f is string => Boolean(f)).map(depthPath).filter((f) => existsSync(path.join(dir, f))) };
}

export async function renderProject(dir: string, opts: { out?: string; format?: FormatId; quality?: 'maxima' | 'alta' | 'ligera'; onProgress?: (p: number) => void; /** Versión modificada del proyecto (sin guardarla), p. ej. otra variante de gancho. */ project?: Project; /** Se agrega al nombre del archivo. */ suffix?: string } = {}) {
  const project = opts.project ?? (await readProject(dir));
  if (!project.scenes.length) throw new Error('El proyecto no tiene escenas. Corre primero los cortes.');
  const transcript = await readTranscript(dir);
  // La IA local suelta su memoria: exportar la necesita.
  await llmUnload().catch(() => {});
  await ensureUsedSfx(dir, project);
  await ensureProjectDepth(dir, project);
  // Texto detrás de la comida: si los cortes cambiaron desde que se armó la capa, se rehace.
  let frontShare = 0;
  if (project.captions.behind && !opts.project && !(await readFront(dir, project).then((f) => f && f.key === frontKey(buildTimeline(project, transcript, { video: 'x' }).clips)).catch(() => false))) {
    frontShare = 0.3;
    await buildFront(dir, (p) => opts.onProgress?.(p * frontShare)).catch(() => {});
  }
  const server = await serveFolder(dir);
  try {
    const has = (rel?: string) => Boolean(rel && existsSync(path.join(dir, rel)));
    const timeline = buildTimeline(project, transcript, {
      video: server.url(gradedMaster(dir, project)),
      voice: has(project.audio.processedVoice) ? server.url(project.audio.processedVoice!) : undefined,
      music: has(project.audio.music) ? server.url(project.audio.music!) : undefined,
      asset: (rel) => server.url(rel),
      brand: await brandFor(project, server.url, dir),
      format: opts.format ? FORMATS[opts.format] : undefined,
      ...(await timelineExtras(dir, project, server.url)),
    });
    const serveUrl = await getBundle();
    // Con el computador muy ocupado, el navegador del render puede tardar en abrir: se reintenta.
    const composition = await retryBrowser(() => selectComposition({ serveUrl, id: 'Reel', inputProps: timeline, timeoutInMilliseconds: 120_000 }));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const suffix = opts.format && opts.format !== '9:16' ? `-${opts.format.replace(':', 'x')}` : '';
    // Carpeta elegida por el usuario, o la del proyecto.
    const folder = project.export.folder?.trim() ? path.resolve(project.export.folder.trim().replace(/^~(?=$|\/)/, os.homedir())) : path.join(dir, P.renders);
    await mkdir(folder, { recursive: true });
    const out = opts.out ?? path.join(folder, `${project.id}-${stamp}${suffix}${opts.suffix ?? ''}.mp4`);
    // Calidad: cuanto menor el CRF, menos compresión. 12 es prácticamente sin pérdida visible.
    // Audio AAC a lo más 256k: es lo máximo que conserva Instagram (más no se nota y lo recodifica).
    const q = { maxima: { crf: 12, audio: '256k' }, alta: { crf: 17, audio: '256k' }, ligera: { crf: 23, audio: '160k' } }[opts.quality ?? project.export.quality];
    const raw = out.replace(/\.mp4$/i, '') + '.sin-nivelar.mp4';
    // Lo previo (empaquetar, preparar el material) puede tardar: si ya se canceló, no se empieza.
    checkCancelled();
    // Si se cancela la exportación, Remotion para y se borra el archivo a medias.
    const { cancelSignal, cancel } = makeCancelSignal();
    const off = onCancel(cancel);
    try {
    await retryBrowser(() => renderMedia({
      cancelSignal,
      serveUrl,
      timeoutInMilliseconds: 120_000,
      composition,
      inputProps: timeline,
      codec: 'h264',
      crf: q.crf,
      audioBitrate: q.audio as never,
      pixelFormat: 'yuv420p',
      scale: project.export.uhd ? 2 : 1,
      outputLocation: raw,
      // Cada pestaña de render ocupa cerca de 1 GB con video vertical: se limita por la memoria del equipo.
      concurrency: Math.max(1, Math.min(project.export.uhd ? 4 : 8, Math.floor(os.cpus().length / 2), Math.max(2, Math.floor(os.totalmem() / 2 ** 30 / (project.export.uhd ? 8 : 4))))),
      onProgress: ({ progress }) => opts.onProgress?.(frontShare + progress * (0.95 - frontShare)),
    }));
    } catch (e) {
      if (currentSignal()?.aborted) { await rm(raw, { force: true }).catch(() => {}); throw new Cancelled(); }
      throw e;
    } finally { off(); }
    // Siempre se nivela el resultado final al volumen elegido (−14 LUFS para redes).
    try {
      await normalizeMix(raw, out, project.audio.targetLufs, q.audio);
      await rm(raw, { force: true });
    } catch {
      await rename(raw, out); // sin pista de audio no hay nada que nivelar
    }
    opts.onProgress?.(1);
    // Al lado del video queda el texto para publicar: título, descripción y hashtags.
    const kit = await readKit(project.client).catch(() => null);
    const pack = publishPack(project, transcript, kit?.sector);
    await writeFile(out.replace(/\.mp4$/i, '') + '.txt', publishText(pack)).catch(() => {});
    // Y los subtítulos en .srt, para subirlos aparte a YouTube, LinkedIn o Facebook.
    if (timeline.words.length) await writeFile(out.replace(/\.mp4$/i, '') + '.srt', toSrt(timeline.words, timeline.fps)).catch(() => {});
    // La marca aprende con qué diseño se exporta.
    const titles = project.scenes.filter((x) => x.onScreenText).map((x) => x.textStyle);
    await learnFromExport(project.client, project.captions.design, titles.sort((a, b) => titles.filter((x) => x === b).length - titles.filter((x) => x === a).length)[0]).catch(() => {});
    return { out, durationInFrames: timeline.durationInFrames, fps: timeline.fps };
  } finally {
    await server.close();
  }
}

/** Reintenta hasta 3 veces cuando el navegador interno no llega a abrir. */
export async function retryBrowser<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (currentSignal()?.aborted) throw new Cancelled();
      if (i >= 2 || !/connect to the browser|Timed out.*browser|browser.*closed/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/** Registro de la última exportación del proyecto (renders/ultimo.json). */
interface ExportRecord { file: string | null; path: string; at: string; projectUpdatedAt?: string; error?: string; errorAt?: string }
const recordFile = (dir: string) => path.join(dir, P.renders, 'ultimo.json');

async function readRecord(dir: string): Promise<ExportRecord | null> {
  try { return JSON.parse(await readFile(recordFile(dir), 'utf8')) as ExportRecord; } catch { return null; }
}

/**
 * Anota cómo terminó la última exportación: el archivo (y qué versión del proyecto se exportó) o
 * el error. Un error no borra el último archivo bueno.
 */
export async function recordExport(dir: string, r: { out?: string; projectUpdatedAt?: string; error?: string }): Promise<ExportRecord> {
  const prev = await readRecord(dir);
  const now = new Date().toISOString();
  const rec: ExportRecord = r.out
    ? { file: path.relative(dir, r.out).startsWith('..') ? null : path.relative(dir, r.out).split(path.sep).join('/'), path: r.out, at: now, projectUpdatedAt: r.projectUpdatedAt }
    : { ...(prev ?? { file: null, path: '', at: '' }), error: r.error ?? 'No se pudo exportar.', errorAt: now };
  await mkdir(path.join(dir, P.renders), { recursive: true });
  await writeFile(recordFile(dir), JSON.stringify(rec, null, 2));
  return rec;
}

/**
 * La última exportación: archivo (relativo al proyecto si está dentro), ruta, cuándo, si el
 * proyecto cambió después (`stale`) y el último error si fue posterior. Null si nunca se exportó.
 */
export async function lastExport(dir: string): Promise<{ file: string | null; path: string; at: string; stale: boolean; error?: string } | null> {
  const project = await readProject(dir);
  const rec = await readRecord(dir);
  let hit: { file: string | null; path: string; at: string; ref?: string } | null = rec?.path && existsSync(rec.path) ? { file: rec.file, path: rec.path, at: rec.at, ref: rec.projectUpdatedAt } : null;
  if (!hit) {
    // Sin registro (exportaciones viejas): el MP4 más nuevo de renders/ o de la carpeta elegida.
    const { readdir, stat } = await import('node:fs/promises');
    const folders = [path.join(dir, P.renders)];
    if (project.export.folder?.trim()) folders.push(path.resolve(project.export.folder.trim().replace(/^~(?=$|\/)/, os.homedir())));
    let best: { f: string; t: number } | null = null;
    for (const folder of folders) {
      if (!existsSync(folder)) continue;
      for (const f of await readdir(folder)) {
        if (!/\.mp4$/i.test(f) || /\.sin-nivelar\.mp4$/i.test(f) || !f.startsWith(project.id)) continue;
        // Si aún existe su versión «sin nivelar», la exportación sigue escribiendo este archivo.
        if (existsSync(path.join(folder, f.replace(/\.mp4$/i, '.sin-nivelar.mp4')))) continue;
        const t = (await stat(path.join(folder, f))).mtimeMs;
        if (!best || t > best.t) best = { f: path.join(folder, f), t };
      }
    }
    if (best) {
      const rel = path.relative(dir, best.f);
      hit = { file: rel.startsWith('..') ? null : rel.split(path.sep).join('/'), path: best.f, at: new Date(best.t).toISOString() };
    }
  }
  const error = rec?.error && rec.errorAt && (!hit || rec.errorAt > hit.at) ? rec.error : undefined;
  if (!hit) return error ? { file: null, path: '', at: rec?.errorAt ?? '', stale: true, error } : null;
  // Cambió si su versión no es la exportada (o, sin ese dato, si se guardó después de exportar).
  const stale = hit.ref ? project.updatedAt !== hit.ref : project.updatedAt > hit.at;
  return { file: hit.file, path: hit.path, at: hit.at, stale, ...(error ? { error } : {}) };
}
