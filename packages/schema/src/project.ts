import { z } from 'zod';

export const APP_NAME = 'SNZ Studio';
export const SCHEMA_VERSION = 1;

/** Una palabra transcrita, con tiempos en segundos del archivo fuente. */
export const Word = z.object({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  prob: z.number().min(0).max(1).optional(),
});
export type Word = z.infer<typeof Word>;

export const Transcript = z.object({
  language: z.string(),
  model: z.string(),
  words: z.array(Word),
});
export type Transcript = z.infer<typeof Transcript>;

/** Tramo del video fuente que se conserva, en segundos. */
export const Range = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});
export type Range = z.infer<typeof Range>;

export const CaptionStyle = z.object({
  mode: z.enum(['word', 'phrase']).default('word'),
  /** Palabras visibles a la vez en modo "word" (se resalta la que suena). */
  wordsPerLine: z.number().int().min(1).max(8).default(3),
  fontFamily: z.string().default('Montserrat'),
  fontWeight: z.number().int().default(800),
  fontSize: z.number().default(78),
  color: z.string().default('#FFFFFF'),
  highlightColor: z.string().default('#FE2C55'),
  uppercase: z.boolean().default(true),
  /** Posición vertical del centro del subtítulo, 0 = arriba, 1 = abajo. */
  y: z.number().min(0).max(1).default(0.68),
  stroke: z.boolean().default(true),
  /** Cómo se marca la palabra que suena: color, caja detrás, salto (crece) o subrayado. */
  effect: z.enum(['color', 'caja', 'pop', 'subrayado']).default('color'),
  /** Remarca siempre la palabra más importante de cada línea (más grande y en color). */
  emphasis: z.boolean().default(true),
});
export type CaptionStyle = z.infer<typeof CaptionStyle>;

/** Formas de mostrar el texto en pantalla de una escena. */
export const TextStyle = z.enum(['caja', 'resaltado', 'marcador', 'gigante', 'subrayado', 'neon', 'banda']);
export type TextStyle = z.infer<typeof TextStyle>;
/** Aspecto de color de la imagen. */
export const Look = z.enum(['normal', 'bn', 'calido', 'frio', 'contraste']);
export type Look = z.infer<typeof Look>;
/** Movimiento de cámara simulado durante la escena. */
export const Camera = z.enum(['ninguno', 'acercar', 'alejar']);
export type Camera = z.infer<typeof Camera>;

export const SceneRole = z.enum(['gancho', 'problema', 'beneficio', 'demostracion', 'prueba', 'cta', 'otro']);
export const SceneVisual = z.enum(['original', 'broll', 'motion', 'texto']);

export const SceneVariant = z.object({
  id: z.string(),
  label: z.string(),
  visual: SceneVisual,
  onScreenText: z.string().optional(),
  textColor: z.string().optional(),
  brollFile: z.string().optional(),
  motionTemplate: z.string().optional(),
  textStyle: TextStyle.optional(),
  textKeyword: z.string().optional(),
  textPosition: z.enum(['arriba', 'centro']).optional(),
  look: Look.optional(),
  camera: Camera.optional(),
  /** Zoom de golpe al entrar. */
  punchZoom: z.boolean().optional(),
  /** Id de la transición de entrada ("corte" = sin transición). */
  transition: z.string().optional(),
  notes: z.string().optional(),
});
export type SceneVariant = z.infer<typeof SceneVariant>;

export const Scene = z.object({
  id: z.string(),
  role: SceneRole.default('otro'),
  title: z.string().default(''),
  /** Tramos del video fuente que forman la escena, en orden. */
  ranges: z.array(Range).min(1),
  /** Recorte del clip: segundos que se quitan del inicio y del final (sin perder el material). */
  trimStart: z.number().min(0).default(0),
  trimEnd: z.number().min(0).default(0),
  visual: SceneVisual.default('original'),
  onScreenText: z.string().optional(),
  textColor: z.string().optional(),
  /** Forma del texto en pantalla. */
  textStyle: TextStyle.default('caja'),
  /** Palabra que se remarca en el texto. Sin valor, se elige sola la más importante. */
  textKeyword: z.string().optional(),
  /** Dónde va el texto en pantalla. */
  textPosition: z.enum(['arriba', 'centro']).default('arriba'),
  look: Look.default('normal'),
  camera: Camera.default('ninguno'),
  brollFile: z.string().optional(),
  motionTemplate: z.string().optional(),
  /** Datos de la plantilla de motion graphics (los pone el usuario; nunca inventados). */
  motionData: z.record(z.string(), z.any()).optional(),
  /** Efectos de sonido de la escena. `offset` son segundos desde su inicio. */
  sfx: z.array(z.object({ id: z.string(), offset: z.number().min(0).default(0), volume: z.number().min(0).max(1).default(0.6) })).default([]),
  /** Transición de entrada desde la escena anterior (sin valor = corte seco). */
  transition: z.object({ id: z.string(), duration: z.number().min(0.1).max(1.5).optional() }).optional(),
  /** Zoom de golpe al inicio de la escena. */
  punchZoom: z.boolean().default(false),
  variants: z.array(SceneVariant).default([]),
  chosenVariant: z.string().optional(),
});
export type Scene = z.infer<typeof Scene>;

export const Pacing = z.object({
  /** Silencio máximo que se deja entre palabras (s). */
  maxPause: z.number().min(0).default(0.35),
  /** Margen que se deja antes/después de cada tramo hablado (s). */
  pad: z.number().min(0).default(0.08),
  /** Quitar muletillas ("eh", "em"...). */
  removeFillers: z.boolean().default(true),
  /** Quitar tomas repetidas y quedarse con la última. */
  removeRetakes: z.boolean().default(true),
  /** Zoom de golpe cada N segundos de salida (0 = nunca). */
  punchZoomEvery: z.number().min(0).default(0),
});
export type Pacing = z.infer<typeof Pacing>;

export const Preset = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  pacing: Pacing.default(Pacing.parse({})),
  captions: CaptionStyle.default(CaptionStyle.parse({})),
  /** Estilo de las escenas que trae el preset (lo usan las plantillas desde referencia). */
  style: z.object({
    textStyle: TextStyle.optional(),
    look: Look.optional(),
    camera: Camera.optional(),
    /** Poner las transiciones recomendadas al aplicar el preset. */
    transitions: z.boolean().optional(),
    /** Destellos en los cortes (detectados en la referencia). */
    flashes: z.boolean().optional(),
    sfxAuto: z.boolean().optional(),
  }).optional(),
  /** Colores de la referencia o del cliente (informativo). */
  palette: z.array(z.string()).optional(),
  /** Id de la referencia de la que salió el preset. */
  reference: z.string().optional(),
});
export type Preset = z.infer<typeof Preset>;

export const BrandKit = z.object({
  id: z.string(),
  name: z.string(),
  colors: z.object({ primary: z.string(), secondary: z.string(), text: z.string() }),
  fonts: z.object({ heading: z.string(), body: z.string() }),
  logo: z.string().optional(),
  /** Ajustes de subtítulos propios del cliente (solo los que se indiquen). */
  captions: z.record(z.string(), z.any()).default({}),
});
export type BrandKit = z.infer<typeof BrandKit>;

export const SourceMedia = z.object({
  /** Rutas relativas a la carpeta del proyecto. */
  file: z.string(),
  proxy: z.string().optional(),
  audio: z.string().optional(),
  duration: z.number(),
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number(),
  rotation: z.number().default(0),
  /** Punto de interés horizontal (0 izquierda, 1 derecha) al recortar a vertical. */
  focusX: z.number().min(0).max(1).default(0.5),
  /** El encuadre sigue la cara automáticamente. Si es false, manda focusX. */
  autoFocus: z.boolean().default(true),
});
export type SourceMedia = z.infer<typeof SourceMedia>;

/** Recurso externo usado en el proyecto, con su licencia. */
export const Asset = z.object({
  file: z.string(),
  kind: z.enum(['broll', 'musica', 'logo', 'otro']),
  source: z.string(),
  license: z.string(),
  author: z.string().optional(),
  url: z.string().optional(),
});
export type Asset = z.infer<typeof Asset>;

export const Request = z.object({
  id: z.string(),
  at: z.string(),
  sceneId: z.string().optional(),
  text: z.string(),
  status: z.enum(['pendiente', 'hecha', 'descartada']).default('pendiente'),
});

export const Project = z.object({
  version: z.literal(SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  client: z.string().optional(),
  /** hablado: se corta según lo que se dice. montaje: cortes rápidos de tomas, sin depender de la voz. */
  kind: z.enum(['hablado', 'montaje']).default('hablado'),
  createdAt: z.string(),
  updatedAt: z.string(),
  format: z.object({
    width: z.number().int().default(1080),
    height: z.number().int().default(1920),
    fps: z.number().default(30),
  }),
  source: SourceMedia,
  brief: z.record(z.string(), z.string()).default({}),
  /** Cuándo se armó la edición a partir del brief. */
  briefAppliedAt: z.string().optional(),
  presetId: z.string().default('rapido'),
  pacing: Pacing,
  captions: CaptionStyle,
  scenes: z.array(Scene).default([]),
  audio: z.object({
    denoise: z.boolean().default(true),
    /** Fuerza de la limpieza de ruido. */
    denoiseLevel: z.enum(['suave', 'media', 'fuerte']).default('media'),
    /** Realce de voz: más presencia y volumen parejo (ecualización y compresión). */
    enhance: z.boolean().default(false),
    /** Efectos automáticos: barrido en cada transición y un "pop" al entrar cada texto. */
    sfxAuto: z.boolean().default(false),
    targetLufs: z.number().default(-16),
    /** Audio de voz procesado (limpio y nivelado), relativo al proyecto. */
    processedVoice: z.string().optional(),
    music: z.string().optional(),
    musicVolume: z.number().min(0).max(1).default(0.18),
    /** Volumen del sonido original del video (0 = silenciado). */
    originalVolume: z.number().min(0).max(1).default(1),
    /** Voz en off generada: suena desde el inicio del reel, sobre el video. */
    voiceover: z.object({
      file: z.string(),
      text: z.string(),
      provider: z.string(),
      voice: z.string().optional(),
      duration: z.number(),
    }).optional(),
  }).default({ denoise: true, denoiseLevel: 'media', enhance: false, sfxAuto: false, targetLufs: -16, musicVolume: 0.18, originalVolume: 1 }),
  assets: z.array(Asset).default([]),
  approval: z.enum(['borrador', 'en_revision', 'aprobado']).default('borrador'),
  requests: z.array(Request).default([]),
});
export type Project = z.infer<typeof Project>;
