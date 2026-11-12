import type { CaptionStyle, Project, Scene, Transcript } from './project.ts';

/** Un tramo del video fuente colocado en la línea de tiempo de salida. */
export interface TimelineClip {
  sceneId: string;
  fromFrame: number;
  durationInFrames: number;
  /** Inicio del tramo en el archivo fuente, en frames del fps de salida. */
  sourceStartFrame: number;
  punchZoom: boolean;
}

export interface TimelineWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface TimelineOverlay {
  sceneId: string;
  text: string;
  color?: string;
  fromFrame: number;
  durationInFrames: number;
}

/** Todo lo que necesita la composición de Remotion para renderizar. */
export type Timeline = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  videoSrc: string;
  /** Si existe, se usa en lugar del audio del video. */
  voiceSrc?: string;
  musicSrc?: string;
  musicVolume: number;
  sourceWidth: number;
  sourceHeight: number;
  clips: TimelineClip[];
  words: TimelineWord[];
  overlays: TimelineOverlay[];
  captions: CaptionStyle;
};

export interface TimelineUrls {
  video: string;
  voice?: string;
  music?: string;
}

/**
 * Convierte el proyecto (escenas con tramos del video fuente) en una línea de
 * tiempo en frames. Los límites se redondean sobre el tiempo acumulado para que
 * no se acumule desfase entre clips.
 */
export function buildTimeline(project: Project, transcript: Transcript | null, urls: TimelineUrls): Timeline {
  const { fps, width, height } = project.format;
  const toFrame = (s: number) => Math.round(s * fps);

  const clips: TimelineClip[] = [];
  const words: TimelineWord[] = [];
  const overlays: TimelineOverlay[] = [];
  let acc = 0;

  for (const scene of project.scenes) {
    const sceneStart = acc;
    scene.ranges.forEach((r, i) => {
      const dur = Math.max(0, r.end - r.start);
      if (dur <= 0) return;
      const from = toFrame(acc);
      const to = toFrame(acc + dur);
      if (to > from) {
        clips.push({
          sceneId: scene.id,
          fromFrame: from,
          durationInFrames: to - from,
          sourceStartFrame: toFrame(r.start),
          punchZoom: scene.punchZoom && i === 0,
        });
      }
      if (transcript) {
        for (const w of transcript.words) {
          const mid = (w.start + w.end) / 2;
          if (mid < r.start || mid >= r.end) continue;
          const s = acc + Math.max(0, w.start - r.start);
          const e = acc + Math.min(dur, w.end - r.start);
          words.push({ text: w.text, startFrame: toFrame(s), endFrame: Math.max(toFrame(s) + 1, toFrame(e)) });
        }
      }
      acc += dur;
    });
    const text = activeText(scene);
    if (text && acc > sceneStart) {
      overlays.push({
        sceneId: scene.id,
        text,
        color: activeColor(scene),
        fromFrame: toFrame(sceneStart),
        durationInFrames: toFrame(acc) - toFrame(sceneStart),
      });
    }
  }

  return {
    width,
    height,
    fps,
    durationInFrames: Math.max(1, toFrame(acc)),
    videoSrc: urls.video,
    voiceSrc: urls.voice,
    musicSrc: urls.music,
    musicVolume: project.audio.musicVolume,
    sourceWidth: project.source.width,
    sourceHeight: project.source.height,
    clips,
    words,
    overlays,
    captions: project.captions,
  };
}

function chosen(scene: Scene) {
  return scene.chosenVariant ? scene.variants.find((v) => v.id === scene.chosenVariant) : undefined;
}

function activeText(scene: Scene) {
  return chosen(scene)?.onScreenText ?? scene.onScreenText;
}

function activeColor(scene: Scene) {
  return chosen(scene)?.textColor ?? scene.textColor;
}

/** Duración total de salida del proyecto en segundos. */
export function outputDuration(project: Project): number {
  return project.scenes.reduce((a, s) => a + s.ranges.reduce((b, r) => b + Math.max(0, r.end - r.start), 0), 0);
}
