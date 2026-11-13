import React, { useMemo } from 'react';
import { Thumbnail } from '@remotion/player';
import { applyVariant, buildTimeline, type Project, type SceneVariant, type Transcript } from '@axioma/schema';
import { Reel } from '@axioma/remotion/src/Reel.tsx';
import type { ProjectStore } from './useProject.ts';

/**
 * Fotograma REAL de cómo queda una escena con una variante aplicada: se arma
 * el reel con la variante puesta y se muestra un fotograma de esa escena, con
 * su texto, tipografía, color de imagen, b-roll o gráfico.
 */
export const VariantPreview: React.FC<{
  project: Project; sceneId: string; variant: SceneVariant | null; transcript: Transcript | null; store: ProjectStore; style?: React.CSSProperties;
}> = ({ project, sceneId, variant, transcript, store, style }) => {
  const media = (rel: string) => `/media/${encodeURIComponent(project.id)}/${rel.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
  const { timeline, frame } = useMemo(() => {
    const copy = structuredClone(project);
    const scene = copy.scenes.find((s) => s.id === sceneId)!;
    if (variant) applyVariant(scene, variant);
    const t = buildTimeline(copy, transcript, {
      video: media(copy.source.proxy ?? 'media/master.mp4'),
      asset: media, brand: store.brand, faces: store.extras?.faces, speakers: store.extras?.speakers, captionWords: store.extras?.captionWords, transitions: store.extras?.transitions, voiceover: store.extras?.voiceover, cutout: store.extras?.cutout, cutoutCoverage: store.extras?.cutoutCoverage, depth: store.extras?.depth,
    });
    const clips = t.clips.filter((c) => c.sceneId === sceneId);
    const from = clips[0]?.fromFrame ?? 0;
    const dur = clips.reduce((a, c) => a + c.durationInFrames, 0);
    // Un punto en que ya entraron el texto y los gráficos, pasada la transición.
    const settle = Math.max(Math.round(t.fps * 0.9), (clips[0]?.transition?.frames ?? 0) + 4);
    return { timeline: t, frame: Math.min(t.durationInFrames - 1, from + Math.min(settle, Math.max(0, dur - 2))) };
  }, [project, sceneId, variant, transcript, store.brand, store.extras]);

  return (
    <div className="frame" style={{ background: '#000', ...style }}>
      <Thumbnail
        component={Reel}
        inputProps={timeline}
        frameToDisplay={frame}
        durationInFrames={timeline.durationInFrames}
        fps={timeline.fps}
        compositionWidth={timeline.width}
        compositionHeight={timeline.height}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
