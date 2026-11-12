import type { CaptionStyle, Project, Scene, Transcript } from './project.ts';

export type MotionSpec = { template: string; data: Record<string, any>; text?: string };

/** Un tramo del video fuente colocado en la línea de tiempo de salida. */
export type TimelineClip = {
  sceneId: string;
  fromFrame: number;
  durationInFrames: number;
  /** Inicio del tramo en el archivo fuente, en frames del fps de salida. */
  sourceStartFrame: number;
  /** Frames de la escena que ya pasaron antes de este tramo (para b-roll continuo). */
  sceneOffsetFrames: number;
  punchZoom: boolean;
  visual: Scene['visual'];
  brollSrc?: string;
  motion?: MotionSpec;
};

export type TimelineWord = { text: string; startFrame: number; endFrame: number };

export type TimelineOverlay = { sceneId: string; text: string; color?: string; fromFrame: number; durationInFrames: number };

export type Brand = { primary: string; secondary: string; text: string; name?: string; logoSrc?: string };

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
  focusX: number;
  clips: TimelineClip[];
  words: TimelineWord[];
  overlays: TimelineOverlay[];
  captions: CaptionStyle;
  brand: Brand;
};

export interface TimelineUrls {
  video: string;
  voice?: string;
  music?: string;
  /** Convierte una ruta relativa del proyecto en una URL. */
  asset?: (rel: string) => string;
  brand?: Brand;
  /** Formato de salida distinto al del proyecto (4:5, 1:1). */
  format?: { width: number; height: number };
}

export const FORMATS = { '9:16': { width: 1080, height: 1920 }, '4:5': { width: 1080, height: 1350 }, '1:1': { width: 1080, height: 1080 } } as const;
export type FormatId = keyof typeof FORMATS;

/**
 * Convierte el proyecto (escenas con tramos del video fuente) en una línea de
 * tiempo en frames. Los límites se redondean sobre el tiempo acumulado para que
 * no se acumule desfase entre clips.
 */
export function buildTimeline(project: Project, transcript: Transcript | null, urls: TimelineUrls): Timeline {
  const { fps } = project.format;
  const { width, height } = urls.format ?? project.format;
  const toFrame = (s: number) => Math.round(s * fps);

  const clips: TimelineClip[] = [];
  const words: TimelineWord[] = [];
  const overlays: TimelineOverlay[] = [];
  let acc = 0;

  for (const scene of project.scenes) {
    const sceneStart = acc;
    const v = chosen(scene);
    const visual = v?.visual ?? scene.visual;
    const brollFile = v?.brollFile ?? scene.brollFile;
    const template = v?.motionTemplate ?? scene.motionTemplate;
    // Solo cuenta como b-roll si es un archivo del proyecto (no una búsqueda pendiente).
    const brollSrc = visual === 'broll' && brollFile && /\.(mp4|mov|m4v|webm)$/i.test(brollFile) && urls.asset ? urls.asset(brollFile) : undefined;
    const motion: MotionSpec | undefined = visual === 'motion' && template
      ? { template, data: scene.motionData ?? {}, text: activeText(scene) }
      : visual === 'texto' && activeText(scene) ? { template: 'texto', data: {}, text: activeText(scene) } : undefined;

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
          sceneOffsetFrames: from - toFrame(sceneStart),
          punchZoom: scene.punchZoom && i === 0,
          visual: brollSrc ? 'broll' : motion ? (visual as Scene['visual']) : 'original',
          brollSrc,
          motion,
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
    // En escenas de texto o motion el texto va dentro de la plantilla, no como rótulo.
    if (text && !motion && acc > sceneStart) {
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
    focusX: project.source.focusX,
    clips,
    words,
    overlays,
    captions: project.captions,
    brand: urls.brand ?? { primary: project.captions.highlightColor, secondary: '#25F4EE', text: '#FFFFFF' },
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
