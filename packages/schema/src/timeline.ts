import type { Camera, CaptionStyle, Look, Project, Scene, TextAnim, TextStyle, Transcript } from './project.ts';
import { keywordOf } from './suggest.ts';
import { findTransition, type TransitionSpec } from './transitions.ts';

/** Duración mínima que queda de un clip después de recortarlo. */
export const MIN_CLIP = 0.3;

/**
 * Tramos de la escena después de aplicar su recorte. Un recorte positivo quita
 * del inicio o del final; uno negativo alarga el clip con el material vecino
 * (sin pasar de 0 ni de `maxEnd`, la duración del video fuente).
 */
export function effectiveRanges(scene: Pick<Scene, 'ranges' | 'trimStart' | 'trimEnd'>, maxEnd = Number.POSITIVE_INFINITY): { start: number; end: number }[] {
  const ranges = scene.ranges.map((r) => ({ start: r.start, end: Math.max(r.start, r.end) }));
  if (!ranges.length) return ranges;
  const ts = scene.trimStart ?? 0;
  const te = scene.trimEnd ?? 0;
  if (ts < 0) ranges[0].start = Math.max(0, ranges[0].start + ts);
  if (te < 0) ranges[ranges.length - 1].end = Math.min(maxEnd, ranges[ranges.length - 1].end - te);
  const total = ranges.reduce((a, r) => a + r.end - r.start, 0);
  let s = Math.max(0, Math.min(ts, total - MIN_CLIP));
  let e = Math.max(0, Math.min(te, total - MIN_CLIP - s));
  for (const r of ranges) {
    const cut = Math.min(s, r.end - r.start);
    r.start += cut;
    s -= cut;
  }
  for (const r of [...ranges].reverse()) {
    const cut = Math.min(e, r.end - r.start);
    r.end -= cut;
    e -= cut;
  }
  return ranges.filter((r) => r.end - r.start > 0.001);
}

/** Duración de una escena en la salida (con su recorte). */
export const sceneLength = (scene: Pick<Scene, 'ranges' | 'trimStart' | 'trimEnd'>) => effectiveRanges(scene).reduce((a, r) => a + r.end - r.start, 0);

export type MotionSpec = {
  template: string; data: Record<string, any>; text?: string;
  /** Fondo, colores, letra y tamaño del gráfico. */
  style?: { background: string; primary?: string; secondary?: string; font?: string; scale: number };
  /** Palabras que se dicen en la escena, en frames desde su inicio (para tipografía en movimiento). */
  words?: TimelineWord[];
};

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
  /** Punto de interés del recorte (0–1), normalmente la cara. */
  focusX: number;
  focusY: number;
  look: Look;
  /** Filtro CSS con los ajustes finos (brillo, contraste, saturación). */
  adjust?: string;
  vignette: number;
  camera: Camera;
  cameraAmount: number;
  videoScale: number;
  /** Fondo detrás de la persona recortada. */
  backdrop?: string;
  backdropSrc?: string;
  /** Mapas de profundidad de las imágenes (cámara 3D). */
  brollDepthSrc?: string;
  backdropDepthSrc?: string;
  /** Posición de este tramo dentro de su escena (para el movimiento de cámara continuo). */
  sceneFrames: number;
  visual: Scene['visual'];
  brollSrc?: string;
  motion?: MotionSpec;
  /** Transición de entrada (solo en el primer tramo de una escena). */
  transition?: {
    spec: TransitionSpec;
    frames: number;
    /** Continuación de la escena anterior, que se ve debajo mientras dura la transición. */
    out?: { sourceStartFrame: number; focusX: number; focusY: number };
  };
};

export type TimelineWord = { text: string; startFrame: number; endFrame: number };

export type TimelineOverlay = {
  sceneId: string; text: string; color?: string; fromFrame: number; durationInFrames: number;
  style: TextStyle; keyword: string;
  /** Centro del texto (0–1), tamaño relativo, tipografía y animación de entrada. */
  x: number; y: number; size: number; font?: string; anim: TextAnim; rotate: number; spacing: number;
};

export type Brand = { primary: string; secondary: string; text: string; name?: string; logoSrc?: string };

/** Todo lo que necesita la composición de Remotion para renderizar. */
export type Timeline = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  videoSrc: string;
  /** El mismo video con la persona recortada y fondo transparente. */
  cutoutSrc?: string;
  /** Si existe, se usa en lugar del audio del video. */
  voiceSrc?: string;
  musicSrc?: string;
  musicVolume: number;
  /** Volumen del sonido original (voz grabada o ambiente). */
  originalVolume: number;
  /** Voz en off: suena desde el frame 0 de la salida. */
  voiceoverSrc?: string;
  sourceWidth: number;
  sourceHeight: number;
  clips: TimelineClip[];
  words: TimelineWord[];
  overlays: TimelineOverlay[];
  captions: CaptionStyle;
  brand: Brand;
  /** Acabados de todo el reel. */
  finish: { progressBar: boolean; grain: boolean; vignette: boolean; keywordZoom: boolean; halation: boolean; letterbox: boolean };
  /** Fotogramas donde el zoom cambia (acercar/alejar) en la palabra importante de una frase. */
  emphasis: number[];
  /** Efectos de sonido colocados en la salida. */
  sfx: { src: string; fromFrame: number; volume: number }[];
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
  /** Voz en off y sus palabras (en tiempo de salida) para los subtítulos. */
  voiceover?: { src: string; words: Transcript['words'] };
  /** Video con la persona recortada, si ya se hizo. */
  cutout?: string;
  /** Mapas de profundidad que existen en el proyecto (rutas relativas). */
  depth?: string[];
  /** Parte del cuadro que ocupa la persona, dos veces por segundo. */
  cutoutCoverage?: number[];
  /** Posición de la cara a lo largo del video fuente. */
  faces?: FacePoint[];
  /** Transiciones propias del cliente (además de las incluidas). */
  transitions?: TransitionSpec[];
}

export type FacePoint = { t: number; x: number; y: number };

/** Posición media de la cara en un tramo del video fuente. */
export function focusFor(faces: FacePoint[] | undefined, start: number, end: number, fallback: { x: number; y: number }) {
  const hit = (faces ?? []).filter((f) => f.t >= start - 0.25 && f.t <= end + 0.25);
  if (!hit.length) return fallback;
  return { x: hit.reduce((a, f) => a + f.x, 0) / hit.length, y: hit.reduce((a, f) => a + f.y, 0) / hit.length };
}

export const FORMATS = { '9:16': { width: 1080, height: 1920 }, '4:5': { width: 1080, height: 1350 }, '1:1': { width: 1080, height: 1080 } } as const;
export type FormatId = keyof typeof FORMATS;

/**
 * Convierte el proyecto (escenas con tramos del video fuente) en una línea de
 * tiempo en frames. Los límites se redondean sobre el tiempo acumulado para que
 * no se acumule desfase entre clips.
 */
/** ¿Hay una persona en este tramo? Sin ella no se cambia el fondo: el cuadro quedaría vacío. */
const depthOf = (rel: string) => rel.replace(/\.(jpe?g|png|webp)$/i, '.depth.png');

function hasPerson(cov: number[] | undefined, start: number, end: number): boolean {
  if (!cov?.length) return true;
  const part = cov.slice(Math.floor(start * 2), Math.max(Math.floor(start * 2) + 1, Math.ceil(end * 2)));
  return part.length ? part.reduce((a, b) => a + b, 0) / part.length >= 0.2 : true;
}

/**
 * Dónde hacer zoom: en la palabra importante de cada frase (un número o la palabra con
 * más significado), con una separación mínima según la intensidad para no marear.
 */
function emphasisFrames(words: { text: string; startFrame: number; endFrame: number }[], fps: number, level: 'suave' | 'media' | 'fuerte'): number[] {
  const gap = fps * (level === 'suave' ? 6 : level === 'fuerte' ? 2.2 : 3.5);
  const out: number[] = [];
  let phrase: typeof words = [];
  const flush = () => {
    if (phrase.length >= 2) {
      const key = keywordOf(phrase.map((w) => w.text).join(' '));
      const hit = key ? phrase.find((w) => w.text.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() === key.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()) : undefined;
      if (hit && (!out.length || hit.startFrame - out[out.length - 1] >= gap)) out.push(hit.startFrame);
    }
    phrase = [];
  };
  words.forEach((w, i) => {
    phrase.push(w);
    const next = words[i + 1];
    if (/[.,;:!?…]$/.test(w.text) || !next || next.startFrame - w.endFrame > fps * 0.35) flush();
  });
  return out;
}

export function buildTimeline(project: Project, transcript: Transcript | null, urls: TimelineUrls): Timeline {
  const { fps } = project.format;
  const { width, height } = urls.format ?? project.format;
  const toFrame = (s: number) => Math.round(s * fps);

  const clips: TimelineClip[] = [];
  const auto = project.source.autoFocus;
  const manual = { x: project.source.focusX, y: 0.5 };
  // Con voz en off, los subtítulos salen de ella y no de lo que se dijo en el video.
  const sourceWords = urls.voiceover ? null : transcript;
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
    const brollSrc = visual === 'broll' && brollFile && /\.(mp4|mov|m4v|webm|jpe?g|png|webp)$/i.test(brollFile) && urls.asset ? urls.asset(brollFile) : undefined;
    const motion: MotionSpec | undefined = visual === 'motion' && template
      ? { template, data: scene.motionData ?? {}, text: activeText(scene), style: scene.motionStyle }
      : visual === 'texto' && activeText(scene) ? { template: 'texto', data: {}, text: activeText(scene), style: scene.motionStyle } : undefined;

    effectiveRanges(scene, project.source.duration).forEach((r, i) => {
      const dur = Math.max(0, r.end - r.start);
      if (dur <= 0) return;
      const from = toFrame(acc);
      const to = toFrame(acc + dur);
      if (to > from) {
        // Un encuadre fijo por tramo (media de la cara): sigue a la persona sin temblar.
        const focus = auto ? focusFor(urls.faces, r.start, r.end, manual) : manual;
        clips.push({
          focusX: focus.x,
          focusY: focus.y,
          look: scene.look,
          adjust: [scene.brightness !== 1 ? `brightness(${scene.brightness})` : '', scene.contrast !== 1 ? `contrast(${scene.contrast})` : '', scene.saturation !== 1 ? `saturate(${scene.saturation})` : ''].filter(Boolean).join(' ') || undefined,
          vignette: scene.vignette,
          camera: scene.camera,
          cameraAmount: scene.cameraAmount,
          videoScale: scene.videoScale,
          backdrop: urls.cutout && scene.backdrop !== 'ninguno' && hasPerson(urls.cutoutCoverage, r.start, r.end) ? scene.backdrop : undefined,
          backdropSrc: scene.backdrop === 'imagen' && scene.backdropFile && urls.asset ? urls.asset(scene.backdropFile) : undefined,
          brollDepthSrc: brollSrc && urls.depth?.includes(depthOf(brollFile!)) ? urls.asset!(depthOf(brollFile!)) : undefined,
          backdropDepthSrc: scene.backdrop === 'imagen' && scene.backdropFile && urls.depth?.includes(depthOf(scene.backdropFile)) ? urls.asset!(depthOf(scene.backdropFile)) : undefined,
          sceneFrames: 0,
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
      if (sourceWords) {
        for (const w of sourceWords.words) {
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
        style: scene.textStyle,
        keyword: scene.textKeyword || keywordOf(text),
        x: scene.textX ?? 0.5,
        y: scene.textY ?? (scene.textPosition === 'centro' ? 0.45 : 0.2),
        size: scene.textSize,
        font: scene.textFont,
        anim: scene.textAnim,
        rotate: scene.textRotate,
        spacing: scene.textSpacing,
        fromFrame: toFrame(sceneStart),
        durationInFrames: toFrame(acc) - toFrame(sceneStart),
      });
    }
  }

  // Duración total de cada escena en frames, para que el movimiento de cámara sea continuo entre sus tramos.
  for (const c of clips) c.sceneFrames = clips.filter((x) => x.sceneId === c.sceneId).reduce((a, x) => a + x.durationInFrames, 0);

  // Las escenas con gráficos reciben sus palabras, medidas desde el inicio de la escena.
  for (const c of clips) {
    if (!c.motion) continue;
    const start = c.fromFrame - c.sceneOffsetFrames;
    c.motion = { ...c.motion, words: words.filter((w) => w.startFrame >= start && w.startFrame < start + c.sceneFrames).map((w) => ({ text: w.text, startFrame: w.startFrame - start, endFrame: w.endFrame - start })) };
  }

  // Transiciones: se resuelven al final, cuando ya se conoce el clip anterior.
  const sourceFrames = toFrame(project.source.duration);
  for (const scene of project.scenes) {
    const spec = findTransition(scene.transition?.id, urls.transitions);
    const idx = clips.findIndex((c) => c.sceneId === scene.id);
    if (!spec || idx <= 0) continue;
    const clip = clips[idx];
    const prev = clips[idx - 1];
    const frames = Math.max(2, Math.min(toFrame(scene.transition?.duration ?? spec.duration), Math.floor(clip.durationInFrames / 2)));
    const tail = prev.sourceStartFrame + prev.durationInFrames;
    clip.transition = {
      spec,
      frames,
      // Solo si la escena anterior es la toma original y queda material después del corte.
      out: prev.visual === 'original' && tail + frames <= sourceFrames ? { sourceStartFrame: tail, focusX: prev.focusX, focusY: prev.focusY } : undefined,
    };
  }

  // Efectos de sonido: los de cada escena y, si están activados, los automáticos.
  const sfx: Timeline['sfx'] = [];
  const sfxSrc = (id: string) => (urls.asset ? urls.asset(`media/sfx/${id}.wav`) : undefined);
  const add = (id: string, fromFrame: number, volume: number) => {
    const src = sfxSrc(id);
    if (src && fromFrame < toFrame(acc)) sfx.push({ src, fromFrame: Math.max(0, fromFrame), volume });
  };
  for (const scene of project.scenes) {
    const start = clips.find((c) => c.sceneId === scene.id)?.fromFrame;
    if (start === undefined) continue;
    for (const e of scene.sfx) add(e.id, start + toFrame(e.offset), e.volume);
  }
  if (project.audio.sfxAuto) {
    // Se van turnando varios sonidos para que no suene siempre igual.
    const sweeps = ['whoosh', 'barrido-agudo', 'barrido-grave'];
    const hits = ['impacto', 'bombo'];
    const pops = ['pop', 'burbuja', 'clic'];
    let n = 0;
    for (const c of clips) if (c.transition) { add(c.transition.spec.destello ? hits[n % hits.length] : sweeps[n % sweeps.length], c.fromFrame - Math.round(fps * 0.08), 0.45); n++; }
    overlays.forEach((o, i) => add(pops[i % pops.length], o.fromFrame, 0.4));
  }

  if (urls.voiceover) {
    for (const w of urls.voiceover.words) {
      if (w.start >= acc) break;
      words.push({ text: w.text, startFrame: toFrame(w.start), endFrame: Math.max(toFrame(w.start) + 1, toFrame(Math.min(acc, w.end))) });
    }
  }

  return {
    width,
    height,
    fps,
    durationInFrames: Math.max(1, toFrame(acc)),
    originalVolume: project.audio.originalVolume,
    voiceoverSrc: urls.voiceover?.src,
    videoSrc: urls.video,
    cutoutSrc: urls.cutout,
    voiceSrc: urls.voice,
    musicSrc: urls.music,
    musicVolume: project.audio.musicVolume,
    sourceWidth: project.source.width,
    sourceHeight: project.source.height,
    clips,
    words,
    overlays,
    captions: project.captions,
    sfx,
    finish: project.finish,
    emphasis: project.finish.keywordZoom ? emphasisFrames(words, fps, project.intensity ?? 'media') : [],
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
  return project.scenes.reduce((a, s) => a + sceneLength(s), 0);
}
