import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { FORMATS, buildTimeline, type Brand, type FormatId, type Project } from '@snz/schema';
import { readKit } from './kit.ts';
import { normalizeMix } from './media.ts';
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
  const logo = project.assets.find((a) => a.kind === 'logo')?.file;
  return {
    primary: kit?.colors.primary ?? project.captions.highlightColor,
    secondary: kit?.colors.secondary ?? '#25F4EE',
    text: kit?.colors.text ?? '#FFFFFF',
    name: kit?.name ?? project.client,
    logoSrc: logo && existsSync(path.join(dir, logo)) ? asset(logo) : undefined,
  };
}

export async function renderProject(dir: string, opts: { out?: string; format?: FormatId; onProgress?: (p: number) => void } = {}) {
  const project = await readProject(dir);
  if (!project.scenes.length) throw new Error('El proyecto no tiene escenas. Corre primero los cortes.');
  const transcript = await readTranscript(dir);
  const server = await serveFolder(dir);
  try {
    const has = (rel?: string) => Boolean(rel && existsSync(path.join(dir, rel)));
    const timeline = buildTimeline(project, transcript, {
      video: server.url(P.master),
      voice: has(project.audio.processedVoice) ? server.url(project.audio.processedVoice!) : undefined,
      music: has(project.audio.music) ? server.url(project.audio.music!) : undefined,
      asset: (rel) => server.url(rel),
      brand: await brandFor(project, server.url, dir),
      format: opts.format ? FORMATS[opts.format] : undefined,
    });
    const serveUrl = await getBundle();
    // Con el computador muy ocupado, el navegador del render puede tardar en abrir: se reintenta.
    const composition = await retryBrowser(() => selectComposition({ serveUrl, id: 'Reel', inputProps: timeline, timeoutInMilliseconds: 120_000 }));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const suffix = opts.format && opts.format !== '9:16' ? `-${opts.format.replace(':', 'x')}` : '';
    const out = opts.out ?? path.join(dir, P.renders, `${project.id}-${stamp}${suffix}.mp4`);
    const raw = out.replace(/\.mp4$/i, '') + '.sin-nivelar.mp4';
    await retryBrowser(() => renderMedia({
      serveUrl,
      timeoutInMilliseconds: 120_000,
      composition,
      inputProps: timeline,
      codec: 'h264',
      crf: 18,
      audioBitrate: '192k',
      pixelFormat: 'yuv420p',
      outputLocation: raw,
      concurrency: Math.max(1, Math.min(8, Math.floor(os.cpus().length / 2))),
      onProgress: ({ progress }) => opts.onProgress?.(progress * 0.95),
    }));
    // Con música la mezcla sube de volumen: se nivela el resultado final.
    if (timeline.musicSrc) {
      await normalizeMix(raw, out, project.audio.targetLufs);
      await rm(raw, { force: true });
    } else {
      await rename(raw, out);
    }
    opts.onProgress?.(1);
    return { out, durationInFrames: timeline.durationInFrames, fps: timeline.fps };
  } finally {
    await server.close();
  }
}

/** Reintenta hasta 3 veces cuando el navegador interno no llega a abrir. */
async function retryBrowser<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (i >= 2 || !/connect to the browser|Timed out.*browser|browser.*closed/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
