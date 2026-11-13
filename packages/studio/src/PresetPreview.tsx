import React, { useMemo } from 'react';
import { Thumbnail } from '@remotion/player';
import type { Preset, Project } from '@axioma/schema';
import { Reel } from '@axioma/remotion/src/Reel.tsx';
import { timelineFor } from './timeline.ts';
import type { ProjectStore } from './useProject.ts';

/**
 * Miniatura REAL de un estilo: un fotograma de tu propio video con los subtítulos, el texto del
 * gancho y el color de ese estilo. Se entiende de un vistazo, sin leer la descripción.
 */
export const PresetPreview: React.FC<{ project: Project; preset: Preset; store: ProjectStore }> = ({ project, preset, store }) => {
  const { timeline, frame } = useMemo(() => {
    const copy = structuredClone(project);
    copy.captions = { ...copy.captions, ...preset.captions };
    const st = preset.style ?? {};
    copy.scenes.forEach((s, i) => {
      if (st.look) s.look = st.look;
      const ts = i === 0 ? st.hook ?? st.textStyle : st.textStyle;
      if (ts) s.textStyle = ts;
      if (st.textFont) s.textFont = st.textFont;
      // Sin transición ni cámara: la miniatura es una foto fija.
      s.transition = undefined;
    });
    const first = copy.scenes[0];
    if (first && !first.onScreenText && copy.kind !== 'montaje') first.onScreenText = preset.name;
    const t = timelineFor(copy, store);
    const clips = t.clips.filter((c) => c.sceneId === first?.id);
    const dur = clips.reduce((a, c) => a + c.durationInFrames, 0);
    return { timeline: t, frame: Math.max(0, Math.min(t.durationInFrames - 1, (clips[0]?.fromFrame ?? 0) + Math.min(Math.round(t.fps * 1.1), Math.max(0, dur - 2)))) };
  }, [project.id, project.scenes.length, preset, store.transcript, store.brand, store.extras]);

  return (
    <Thumbnail
      component={Reel}
      inputProps={timeline}
      frameToDisplay={frame}
      durationInFrames={Math.max(1, timeline.durationInFrames)}
      fps={timeline.fps}
      compositionWidth={timeline.width}
      compositionHeight={timeline.height}
      style={{ width: '100%', height: '100%' }}
    />
  );
};
