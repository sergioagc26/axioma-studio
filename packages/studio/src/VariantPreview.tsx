import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Thumbnail } from '@remotion/player';
import { applyVariant, type Project, type SceneVariant, type Transcript } from '@axioma/schema';
import { Reel } from '@axioma/remotion/src/Reel.tsx';
import type { ProjectStore } from './useProject.ts';
import { timelineFor } from './timeline.ts';

type Built = { timeline: ReturnType<typeof timelineFor>; frame: number };
/**
 * Caché de miniaturas ya armadas. Cada versión del proyecto es un objeto nuevo (y Deshacer
 * devuelve el anterior), así que se guarda por objeto: volver a una escena, salir y entrar
 * a la pantalla o deshacer no vuelve a clonar el proyecto ni a armar el reel.
 */
const cache = new WeakMap<Project, Map<string, { deps: unknown[]; built: Built | null }>>();

/**
 * Fotograma REAL de cómo queda una escena con una variante aplicada: se arma
 * el reel con la variante puesta (misma receta que Resultado y el Editor) y se
 * muestra un fotograma de esa escena, con su texto, tipografía, color, b-roll o gráfico.
 *
 * Para que la pantalla no se trabe: solo se monta la escena (sin las vecinas),
 * sin ningún sonido, y solo cuando la miniatura entra en pantalla.
 */
export const VariantPreview: React.FC<{
  project: Project; sceneId: string; variant: SceneVariant | null; transcript: Transcript | null; store: ProjectStore; style?: React.CSSProperties;
}> = ({ project, sceneId, variant, transcript, store, style }) => {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const built = useMemo((): Built | null => {
    if (!visible) return null;
    const deps: unknown[] = [transcript, store.brand, store.extras];
    const key = `${sceneId}|${variant ? JSON.stringify(variant) : ''}`;
    let byKey = cache.get(project);
    if (!byKey) { byKey = new Map(); cache.set(project, byKey); }
    const hit = byKey.get(key);
    if (hit && hit.deps.every((d, i) => d === deps[i])) return hit.built;
    const make = (): Built | null => {
      const copy = structuredClone(project);
      const scene = copy.scenes.find((s) => s.id === sceneId);
      if (!scene) return null;
      if (variant) applyVariant(scene, variant);
      const t = timelineFor(copy, { ...store, transcript });
      const clips = t.clips.filter((c) => c.sceneId === sceneId);
      const from = clips[0]?.fromFrame ?? 0;
      const dur = clips.reduce((a, c) => a + c.durationInFrames, 0);
      // Un punto en que ya entraron el texto y los gráficos, pasada la transición.
      const settle = Math.max(Math.round(t.fps * 0.9), (clips[0]?.transition?.frames ?? 0) + 4);
      return {
        // Solo esta escena y sin audio: nada de voz, música, efectos ni sonido original.
        timeline: { ...t, clips, sfx: [], voiceoverSrc: undefined, voiceSrc: undefined, musicSrc: undefined, originalVolume: 0 },
        frame: Math.min(t.durationInFrames - 1, from + Math.min(settle, Math.max(0, dur - 2))),
      };
    };
    const out = make();
    byKey.set(key, { deps, built: out });
    return out;
  }, [visible, project, sceneId, variant, transcript, store.brand, store.extras]);

  return (
    <div ref={box} className="frame" style={{ background: 'var(--panel2)', ...style }}>
      {built ? (
        <Thumbnail
          component={Reel}
          inputProps={built.timeline}
          frameToDisplay={built.frame}
          durationInFrames={built.timeline.durationInFrames}
          fps={built.timeline.fps}
          compositionWidth={built.timeline.width}
          compositionHeight={built.timeline.height}
          style={{ width: '100%', height: '100%' }}
          renderLoading={() => <span className="small muted" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Cargando…</span>}
          errorFallback={() => <span className="small muted" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>No se pudo mostrar</span>}
        />
      ) : <span className="small muted" style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Cargando…</span>}
    </div>
  );
};
