import type { Camera, CaptionStyle, Look, Project, Scene, TextAnim, TextStyle, Transcript } from './project.ts';
import { keywordOf } from './suggest.ts';
import { findTransition, type TransitionSpec } from './transitions.ts';
import { clampX, clampY, safeZone, type SafeZone } from './zones.ts';

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
export const sceneLength = (scene: Pick<Scene, 'ranges' | 'trimStart' | 'trimEnd'> & { speed?: number }) => effectiveRanges(scene).reduce((a, r) => a + r.end - r.start, 0) / Math.min(1, Math.max(0.2, scene.speed ?? 1));

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
  /** Sin sonido original en este tramo. */
  sinAudio?: boolean;
  /** Cámara lenta: velocidad (< 1) y, si ya existe, el video con fotogramas intermedios. */
  speed?: number;
  /** B-roll combinado con tu video (pantalla dividida o recuadro). */
  brollLayout?: 'arriba' | 'abajo' | 'recuadro';
  slowSrc?: string;
  /** El audio sigue sin corte desde el tramo anterior / hacia el siguiente (solo cambia el encuadre). */
  seamIn?: boolean;
  seamOut?: boolean;
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
  /** Se ve el video entero (con fondo desenfocado) en vez de recortarlo al cuadro. */
  fit?: 'completo' | 'monitor' | 'flotante';
  floatBg?: 'claro' | 'oscuro';
  /** Palabras gigantes de la escena (frames desde el inicio de la escena). */
  words?: { text: string; from: number; to: number; color: 'blanco' | 'rojo' | 'amarillo' | 'negro'; x: number; y: number; size: number; behind: boolean; style: NonNullable<Scene['words']>[number]['style']; rotate?: number; files?: string[]; then?: number }[];
  /** La persona más abajo en el cuadro (fracción de la altura). */
  frameY?: number;
  /** Foto real del escritorio (toma de escritorio): la imagen y las 4 esquinas de la pantalla. */
  desk?: { src: string; screen: number[] };
  /** Estilo pizarra: la imagen se dibuja a mano y luego se colorea (ver Scene.drawing). */
  drawing?: { lines: string; title?: string; burst?: string; tag?: string; draw: number; hand?: { src: string; tipX: number; tipY: number; armX?: number; armY?: number; armW?: number; armColor?: string }; sameTitle?: boolean };
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
  /** Logo de la marca encima del texto. */
  logo?: boolean;
  /** Otros íconos junto al logo (URLs). */
  icons?: string[];
};

export type Brand = { primary: string; secondary: string; text: string; name?: string; logoSrc?: string };

/** Todo lo que necesita la composición de Remotion para renderizar. */
export type Timeline = {
  width: number;
  height: number;
  /** Lienzo final si es distinto (16:9 con el reel vertical centrado). */
  canvas?: { width: number; height: number };
  fps: number;
  durationInFrames: number;
  videoSrc: string;
  /** El mismo video con la persona recortada y fondo transparente. */
  cutoutSrc?: string;
  /**
   * Lo cercano (la comida) con fondo transparente, en tiempo de la salida: va encima del texto
   * para que el texto quede detrás. Solo si se armó para estos mismos cortes (ver frontKey).
   */
  frontSrc?: string;
  /** Si existe, se usa en lugar del audio del video. */
  voiceSrc?: string;
  musicSrc?: string;
  musicVolume: number;
  /** Volumen del sonido original (voz grabada o ambiente). */
  originalVolume: number;
  /** Voz en off: suena desde el frame 0 de la salida. */
  voiceoverSrc?: string;
  /** Cuadro en que empieza la voz en off y su volumen. */
  voiceoverFrom?: number;
  voiceoverVolume?: number;
  sourceWidth: number;
  sourceHeight: number;
  clips: TimelineClip[];
  words: TimelineWord[];
  overlays: TimelineOverlay[];
  captions: CaptionStyle;
  /** Zona libre de la red donde se publica (márgenes 0–1): nada importante va fuera de ella. */
  safe: SafeZone;
  brand: Brand;
  /** Acabados de todo el reel. */
  finish: { progressBar: boolean; grain: boolean; vignette: boolean; keywordZoom: boolean; halation: boolean; letterbox: boolean; watermark?: { corner: 'arriba-izq' | 'arriba-der' | 'abajo-izq' | 'abajo-der'; size: number; opacity: number }; lowerThird?: { name: string; role?: string; at: number; duration: number } };
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
  /** Capa de «comida por delante» y la clave de los cortes con que se armó. */
  front?: { src: string; key: string };
  /** Mapas de profundidad que existen en el proyecto (rutas relativas). */
  depth?: string[];
  /** Parte del cuadro que ocupa la persona, dos veces por segundo. */
  cutoutCoverage?: number[];
  /** Posición de la cara a lo largo del video fuente. */
  faces?: FacePoint[];
  /** Subtítulos traducidos (palabras en tiempo del video fuente), si se eligió otro idioma. */
  captionWords?: Transcript['words'];
  /** Turnos de quién habla (reencuadre al hablante), si está activado. */
  speakers?: SpeakerTurn[];
  /** Transiciones propias del cliente (además de las incluidas). */
  transitions?: TransitionSpec[];
}

export type FacePoint = { t: number; x: number; y: number };
/** Quién habla de `start` a `end` (segundos del video fuente) y dónde está su cara. */
export type SpeakerTurn = { start: number; end: number; track: number; x: number; y: number };

/**
 * Parte un tramo del video fuente donde cambia quien habla. Cada pedazo lleva el encuadre de
 * esa persona; pedazos de menos de 0,6 s se unen al vecino (no marea).
 */
export function splitBySpeaker(r: { start: number; end: number }, turns: SpeakerTurn[] | undefined): { start: number; end: number; turn?: SpeakerTurn }[] {
  if (!turns?.length) return [r];
  const out: { start: number; end: number; turn?: SpeakerTurn }[] = [];
  for (const t of turns) {
    const start = Math.max(r.start, t.start), end = Math.min(r.end, t.end);
    if (end - start <= 0) continue;
    const prev = out[out.length - 1];
    if (prev && (end - start < 0.6 || prev.turn?.track === t.track)) prev.end = end;
    else if (prev && prev.end - prev.start < 0.6) Object.assign(prev, { end, turn: t });
    else out.push({ start, end, turn: t });
  }
  if (!out.length) return [r];
  out[0].start = r.start;
  out[out.length - 1].end = r.end;
  return out;
}

/** Posición media de la cara en un tramo del video fuente. */
export function focusFor(faces: FacePoint[] | undefined, start: number, end: number, fallback: { x: number; y: number }) {
  const hit = (faces ?? []).filter((f) => f.t >= start - 0.25 && f.t <= end + 0.25);
  if (!hit.length) return fallback;
  return { x: hit.reduce((a, f) => a + f.x, 0) / hit.length, y: hit.reduce((a, f) => a + f.y, 0) / hit.length };
}

export const FORMATS = {
  '9:16': { width: 1080, height: 1920 }, '4:5': { width: 1080, height: 1350 }, '3:4': { width: 1080, height: 1440 }, '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 }, '21:9': { width: 2520, height: 1080 },
} as const;
/** Forma del proyecto: se elige al crearlo y es como se arma, se ve y se exporta por defecto. */
export const PROJECT_SHAPES = {
  vertical: { width: 1080, height: 1920, name: 'Vertical', use: 'Reels, TikTok, Shorts, historias' },
  horizontal: { width: 1920, height: 1080, name: 'Horizontal', use: 'YouTube, web, televisores, cursos' },
  cuadrado: { width: 1080, height: 1080, name: 'Cuadrado', use: 'Feed y anuncios' },
} as const;
export type ProjectShape = keyof typeof PROJECT_SHAPES;
export const shapeOf = (f: { width: number; height: number }): ProjectShape => (f.width > f.height * 1.2 ? 'horizontal' : f.height > f.width * 1.2 ? 'vertical' : 'cuadrado');
/** El formato de salida propio del proyecto (el que se exporta si no se pide otro). */
export const nativeFormat = (f: { width: number; height: number }): keyof typeof FORMATS => ({ vertical: '9:16', horizontal: '16:9', cuadrado: '1:1' } as const)[shapeOf(f)];

/** Formatos de salida con su nombre y para qué sirve cada uno (en el orden en que se ofrecen). */
export const FORMAT_INFO: { id: keyof typeof FORMATS; name: string; use: string }[] = [
  { id: '9:16', name: 'Vertical', use: 'Reels, TikTok, Shorts, historias' },
  { id: '4:5', name: 'Post vertical', use: 'Feed de Instagram y Facebook' },
  { id: '3:4', name: 'Vertical clásico', use: 'Feed nuevo de Instagram, Pinterest' },
  { id: '1:1', name: 'Cuadrado', use: 'Feed y anuncios' },
  { id: '16:9', name: 'Horizontal', use: 'YouTube, web, televisores' },
  { id: '21:9', name: 'Cine', use: 'Panorámico de cine (material grabado en horizontal)' },
];
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
  // Horizontal (16:9) desde un reel vertical: el reel va entero y centrado en un lienzo más ancho
  // (no se recorta). La línea de tiempo se arma en el tamaño del reel.
  const out = urls.format ?? project.format;
  // Las zonas seguras de las redes son del video vertical; en horizontal solo quedan márgenes mínimos.
  const zone = out.height > out.width ? safeZone(project.platform) : safeZone('ninguna');
  // Si el material se grabó en horizontal, el formato horizontal o de cine llena todo el cuadro.
  const wideSource = project.source.width > project.source.height * 1.2;
  const landscape = out.width > out.height * 1.2 && project.format.height > project.format.width && !wideSource;
  const { width, height } = landscape ? project.format : out;
  const canvas = landscape ? { width: out.width, height: out.height } : undefined;
  const toFrame = (s: number) => Math.round(s * fps);

  const clips: TimelineClip[] = [];
  const auto = project.source.autoFocus;
  const manual = { x: project.source.focusX, y: 0.5 };
  // Con voz en off, los subtítulos salen de ella y no de lo que se dijo en el video.
  const sourceWords = urls.voiceover ? null : urls.captionWords ? { words: urls.captionWords } : transcript;
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
      // Cámara lenta: el tramo dura más en la salida (dur / velocidad).
      const speed = Math.min(1, Math.max(0.2, scene.speed ?? 1));
      const slow = speed < 1;
      const dur = Math.max(0, r.end - r.start) / speed;
      if (dur <= 0) return;
      // Video ya interpolado para este tramo (si no, se reproduce más lento sin fotogramas nuevos).
      const slowFile = slow ? scene.slowFiles?.find((f) => Math.abs(f.start - r.start) < 0.02 && Math.abs(f.end - r.end) < 0.02 && Math.abs(f.speed - speed) < 0.001)?.file : undefined;
      // Con reencuadre al hablante, el tramo se parte donde cambia quien habla.
      const pieces = !slow && auto && urls.speakers?.length ? splitBySpeaker(r, urls.speakers) : [r as { start: number; end: number; turn?: SpeakerTurn }];
      pieces.forEach((pc, pi) => {
        const from = toFrame(acc + (pc.start - r.start) / speed);
        const to = toFrame(acc + (pc.end - r.start) / speed);
        if (to > from) {
          // Un encuadre fijo por tramo (media de la cara): sigue a la persona sin temblar.
          const focus = pc.turn ? { x: pc.turn.x, y: pc.turn.y } : auto ? focusFor(urls.faces, pc.start, pc.end, manual) : manual;
          clips.push({
            focusX: focus.x,
            focusY: focus.y,
            look: scene.look,
            adjust: [scene.brightness !== 1 ? `brightness(${scene.brightness})` : '', scene.contrast !== 1 ? `contrast(${scene.contrast})` : '', scene.saturation !== 1 ? `saturate(${scene.saturation})` : ''].filter(Boolean).join(' ') || undefined,
            vignette: scene.vignette,
            camera: scene.camera,
            cameraAmount: scene.cameraAmount,
            videoScale: scene.videoScale,
            fit: scene.videoFit === 'completo' || scene.videoFit === 'monitor' || scene.videoFit === 'flotante' ? scene.videoFit : undefined,
            floatBg: scene.floatBg,
            words: scene.words?.length ? scene.words.map((w, wi, all) => ({ text: w.text, from: Math.round(w.at * fps), to: Math.round((w.until ?? all[wi + 1]?.at ?? 999) * fps), color: w.color, x: clampX(zone, w.x, 0.12), y: clampY(zone, w.y, 0.06), size: w.size, behind: w.behind, style: w.style, rotate: w.rotate, files: w.files?.map((f) => (urls.asset ? urls.asset(f) : f)), then: w.then !== undefined ? Math.round(w.then * fps) : undefined })) : undefined,
            frameY: scene.frameY,
            drawing: scene.drawing && urls.asset ? { lines: urls.asset(scene.drawing.lines), title: scene.drawing.title, burst: scene.drawing.burst, tag: scene.drawing.tag, draw: scene.drawing.draw, hand: scene.drawing.hand ? { ...scene.drawing.hand, src: urls.asset(scene.drawing.hand.file) } : undefined, sameTitle: Boolean(scene.drawing.title) && project.scenes[project.scenes.indexOf(scene) - 1]?.drawing?.title === scene.drawing.title } : undefined,
            desk: scene.videoFit === 'monitor' && scene.deskPhoto && urls.asset ? { src: urls.asset(scene.deskPhoto.file), screen: scene.deskPhoto.screen } : undefined,
            backdrop: urls.cutout && scene.backdrop !== 'ninguno' && hasPerson(urls.cutoutCoverage, pc.start, pc.end) ? scene.backdrop : undefined,
            backdropSrc: scene.backdrop === 'imagen' && scene.backdropFile && urls.asset ? urls.asset(scene.backdropFile) : undefined,
            brollDepthSrc: brollSrc && urls.depth?.includes(depthOf(brollFile!)) ? urls.asset!(depthOf(brollFile!)) : undefined,
            backdropDepthSrc: scene.backdrop === 'imagen' && scene.backdropFile && urls.depth?.includes(depthOf(scene.backdropFile)) ? urls.asset!(depthOf(scene.backdropFile)) : undefined,
            sceneFrames: 0,
            sceneId: scene.id,
            fromFrame: from,
            durationInFrames: to - from,
            sourceStartFrame: toFrame(pc.start),
            seamIn: pi > 0 || undefined,
            speed: slow ? speed : undefined,
            brollLayout: brollSrc && scene.brollLayout && scene.brollLayout !== 'completo' ? scene.brollLayout : undefined,
            slowSrc: slowFile && urls.asset ? urls.asset(slowFile) : undefined,
            seamOut: pi < pieces.length - 1 || undefined,
            sceneOffsetFrames: from - toFrame(sceneStart),
            punchZoom: scene.punchZoom && i === 0 && pi === 0,
            sinAudio: scene.sinAudio || undefined,
            visual: brollSrc ? 'broll' : motion ? (visual as Scene['visual']) : 'original',
            brollSrc,
            motion,
          });
        }
      });
      // En cámara lenta no suena la voz: tampoco hay subtítulos.
      // Con palabras gigantes, esas palabras hacen de subtítulo: la escena no lleva los normales.
      if (sourceWords && !slow && !scene.words?.length) {
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
        x: clampX(zone, scene.textX ?? 0.5, 0.2),
        y: clampY(zone, scene.textY ?? (scene.textPosition === 'centro' ? 0.45 : 0.2), 0.07),
        size: scene.textSize,
        font: scene.textFont,
        anim: scene.textAnim,
        rotate: scene.textRotate,
        spacing: scene.textSpacing,
        logo: scene.textLogo || undefined,
        icons: scene.textIcons?.length && urls.asset ? scene.textIcons.map((f) => urls.asset!(f)) : undefined,
        fromFrame: toFrame(sceneStart),
        durationInFrames: toFrame(acc) - toFrame(sceneStart),
      });
    }
  }

  // El mismo texto en escenas seguidas es UN rótulo que dura todo ese tiempo (no vuelve a entrar en
  // cada corte): así un gancho de montaje se queda lo suficiente para leerlo aunque cambien las tomas.
  for (let i = overlays.length - 1; i > 0; i--) {
    const a = overlays[i - 1], b = overlays[i];
    if (a.text === b.text && a.style === b.style && a.fromFrame + a.durationInFrames === b.fromFrame) {
      a.durationInFrames += b.durationInFrames;
      overlays.splice(i, 1);
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
    // Solo si la escena anterior es la toma original tal cual (sin fondo cambiado ni pantalla
    // flotante) y queda material después del corte.
    const out = prev.visual === 'original' && !prev.backdrop && !prev.fit && !prev.motion && tail + frames <= sourceFrames ? { sourceStartFrame: tail, focusX: prev.focusX, focusY: prev.focusY } : undefined;
    // Sin la escena anterior debajo, aparecer desde transparente sería aparecer desde negro:
    // la nueva entra con el resto del efecto (desenfoque, escala…) pero ya visible.
    const { opacidad: _o, ...entra } = spec.entra ?? {};
    clip.transition = { spec: out || !spec.entra?.opacidad ? spec : { ...spec, entra }, frames, out };
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
    // La voz puede empezar más tarde: sus palabras (los subtítulos) se corren lo mismo.
    const off = project.audio.voiceover?.offset ?? 0;
    for (const w of urls.voiceover.words) {
      if (w.start + off >= acc) break;
      words.push({ text: w.text, startFrame: toFrame(w.start + off), endFrame: Math.max(toFrame(w.start + off) + 1, toFrame(Math.min(acc, w.end + off))) });
    }
  }

  return {
    width,
    height,
    canvas,
    fps,
    durationInFrames: Math.max(1, toFrame(acc)),
    originalVolume: project.audio.originalVolume,
    voiceoverSrc: urls.voiceover?.src,
    voiceoverFrom: toFrame(project.audio.voiceover?.offset ?? 0),
    voiceoverVolume: project.audio.voiceover?.volume ?? 1,
    videoSrc: urls.video,
    cutoutSrc: urls.cutout,
    frontSrc: urls.front && urls.front.key === frontKey(clips) ? urls.front.src : undefined,
    voiceSrc: urls.voice,
    musicSrc: urls.music,
    musicVolume: project.audio.musicVolume,
    sourceWidth: project.source.width,
    sourceHeight: project.source.height,
    clips,
    words,
    overlays: mergeOverlays(overlays),
    captions: { ...project.captions, y: clampY(zone, project.captions.y, 0.07) },
    safe: zone,
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

/**
 * Clave de los cortes de una línea de tiempo: si cambia (otro orden, otra toma, otra duración),
 * la capa de «comida por delante» ya no calza y hay que volver a armarla.
 */
export function frontKey(clips: Pick<TimelineClip, 'fromFrame' | 'durationInFrames' | 'sourceStartFrame' | 'speed'>[]): string {
  let h = 5381;
  for (const c of clips) for (const ch of `${c.fromFrame}:${c.durationInFrames}:${c.sourceStartFrame}:${c.speed ?? 1};`) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `${clips.length}-${h.toString(36)}`;
}

/**
 * El mismo texto en escenas seguidas es un solo rótulo: se queda quieto en pantalla mientras
 * cambia la imagen (no vuelve a entrar animado en cada corte).
 */
export function mergeOverlays(list: TimelineOverlay[]): TimelineOverlay[] {
  const out: TimelineOverlay[] = [];
  for (const o of list) {
    const prev = out[out.length - 1];
    const same = prev && prev.text === o.text && prev.style === o.style && prev.color === o.color && prev.x === o.x && prev.y === o.y
      && prev.logo === o.logo && (prev.icons ?? []).join() === (o.icons ?? []).join()
      && Math.abs(prev.fromFrame + prev.durationInFrames - o.fromFrame) <= 1;
    if (same) prev.durationInFrames = o.fromFrame + o.durationInFrames - prev.fromFrame;
    else out.push({ ...o });
  }
  return out;
}
