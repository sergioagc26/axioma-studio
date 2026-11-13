import { buildTimeline, type Project } from '@axioma/schema';
import type { ProjectStore } from './useProject.ts';

export const mediaUrl = (project: Project) => (rel: string) => `/media/${encodeURIComponent(project.id)}/${rel.split(/[\\/]/).map(encodeURIComponent).join('/')}`;

/** El reel tal como se ve y se oye, listo para el reproductor (misma receta que el editor). */
export function timelineFor(project: Project, store: ProjectStore) {
  const media = mediaUrl(project);
  return buildTimeline(project, store.transcript, {
    video: project.finish.lut ? `${media('proxies/proxy-lut.mp4')}?v=${encodeURIComponent(project.finish.lut.name + project.finish.lut.strength)}` : media(project.source.proxy ?? 'media/master.mp4'),
    voice: project.audio.processedVoice ? media(project.audio.processedVoice) : undefined,
    music: project.audio.music ? media(project.audio.music) : undefined,
    asset: media,
    brand: store.brand,
    voiceover: store.extras?.voiceover,
    cutout: store.extras?.cutout,
    cutoutCoverage: store.extras?.cutoutCoverage,
    depth: store.extras?.depth,
    faces: store.extras?.faces, speakers: store.extras?.speakers, captionWords: store.extras?.captionWords,
    transitions: store.extras?.transitions,
  });
}
