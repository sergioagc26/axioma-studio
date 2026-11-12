import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { buildTimeline } from '@snz/schema';
import { P, REMOTION_ENTRY } from './paths.ts';
import { serveFolder } from './server.ts';
import { readProject, readTranscript } from './store.ts';

let bundled: Promise<string> | null = null;
/** Empaqueta la composición de Remotion una vez por proceso. */
export function getBundle() {
  bundled ??= bundle({ entryPoint: REMOTION_ENTRY, onProgress: () => {} });
  return bundled;
}

export async function renderProject(dir: string, opts: { out?: string; onProgress?: (p: number) => void } = {}) {
  const project = await readProject(dir);
  if (!project.scenes.length) throw new Error('El proyecto no tiene escenas. Corre primero los cortes.');
  const transcript = await readTranscript(dir);
  const server = await serveFolder(dir);
  try {
    const timeline = buildTimeline(project, transcript, {
      video: server.url(P.master),
      voice: project.audio.processedVoice && existsSync(path.join(dir, project.audio.processedVoice))
        ? server.url(project.audio.processedVoice) : undefined,
      music: project.audio.music ? server.url(project.audio.music) : undefined,
    });
    const serveUrl = await getBundle();
    const composition = await selectComposition({ serveUrl, id: 'Reel', inputProps: timeline });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const out = opts.out ?? path.join(dir, P.renders, `${project.id}-${stamp}.mp4`);
    await renderMedia({
      serveUrl,
      composition,
      inputProps: timeline,
      codec: 'h264',
      crf: 18,
      audioBitrate: '192k',
      pixelFormat: 'yuv420p',
      outputLocation: out,
      concurrency: Math.max(1, Math.min(8, Math.floor(os.cpus().length / 2))),
      onProgress: ({ progress }) => opts.onProgress?.(progress),
    });
    return { out, durationInFrames: timeline.durationInFrames, fps: timeline.fps };
  } finally {
    await server.close();
  }
}
