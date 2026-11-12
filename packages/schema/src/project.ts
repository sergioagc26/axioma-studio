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
});
export type CaptionStyle = z.infer<typeof CaptionStyle>;

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
  notes: z.string().optional(),
});
export type SceneVariant = z.infer<typeof SceneVariant>;

export const Scene = z.object({
  id: z.string(),
  role: SceneRole.default('otro'),
  title: z.string().default(''),
  /** Tramos del video fuente que forman la escena, en orden. */
  ranges: z.array(Range).min(1),
  visual: SceneVisual.default('original'),
  onScreenText: z.string().optional(),
  textColor: z.string().optional(),
  brollFile: z.string().optional(),
  motionTemplate: z.string().optional(),
  /** Datos de la plantilla de motion graphics (los pone el usuario; nunca inventados). */
  motionData: z.record(z.string(), z.any()).optional(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
  format: z.object({
    width: z.number().int().default(1080),
    height: z.number().int().default(1920),
    fps: z.number().default(30),
  }),
  source: SourceMedia,
  brief: z.record(z.string(), z.string()).default({}),
  presetId: z.string().default('rapido'),
  pacing: Pacing,
  captions: CaptionStyle,
  scenes: z.array(Scene).default([]),
  audio: z.object({
    denoise: z.boolean().default(true),
    targetLufs: z.number().default(-16),
    /** Audio de voz procesado (limpio y nivelado), relativo al proyecto. */
    processedVoice: z.string().optional(),
    music: z.string().optional(),
    musicVolume: z.number().min(0).max(1).default(0.18),
  }).default({ denoise: true, targetLufs: -16, musicVolume: 0.18 }),
  assets: z.array(Asset).default([]),
  approval: z.enum(['borrador', 'en_revision', 'aprobado']).default('borrador'),
  requests: z.array(Request).default([]),
});
export type Project = z.infer<typeof Project>;
