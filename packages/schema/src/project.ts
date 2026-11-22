import { z } from 'zod';

export const APP_NAME = 'Axioma Studio';
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
  /** Cómo se remarca la palabra que suena (ver CAPTION_EFFECTS). */
  effect: z.string().default('color'),
  /**
   * Diseño de los subtítulos. `clasico` es el básico; los demás son los llamativos:
   * impacto (palabras enormes inclinadas), bloque (línea dentro de un bloque de color),
   * cinta (cada palabra en su tira), neon (brillo) y elegante (serif fina en cursiva).
   */
  /** Diseño del subtítulo (ver CAPTION_DESIGNS). */
  design: z.string().default('clasico'),
  /** Remarca siempre la palabra más importante de cada línea (más grande y en color). */
  emphasis: z.boolean().default(true),
  /** Placa oscura translúcida detrás de la línea, para que se lea sobre cualquier fondo. */
  plate: z.boolean().default(false),
  /** Grosor del borde negro (1 = normal, 0 = sin borde). */
  strokeScale: z.number().min(0).max(2.5).default(1),
  /** Cómo entra cada línea. */
  lineAnim: z.enum(['pop', 'subir', 'deslizar', 'ninguna']).default('pop'),
  /** Separación entre letras (em). */
  spacing: z.number().min(-0.05).max(0.3).default(0),
  /** Subtítulos y títulos detrás de lo cercano (la comida, el producto), como en los anuncios. */
  behind: z.boolean().default(false),
  /** Emojis automáticos encima de los subtítulos cuando suena una palabra con emoji claro. */
  emojis: z.boolean().default(false),
  /** Subtítulos en otro idioma (la voz sigue igual). Sin valor: el idioma del video. */
  language: z.string().optional(),
});
export type CaptionStyle = z.infer<typeof CaptionStyle>;

/** Formas de mostrar el texto en pantalla de una escena. */
export const TextStyle = z.enum(['caja', 'resaltado', 'marcador', 'gigante', 'subrayado', 'neon', 'banda', 'contorno', 'degradado', 'sombra', 'etiqueta', 'cinta', 'sello', 'glitch', 'trazo', 'apilado', 'tresd', 'fuego', 'cromado', 'burbuja', 'retro', 'resplandor', 'lujo', 'palabra', 'rotulo', 'marca', 'brocha']);
/** Estilos de texto básicos; el resto son los llamativos. */
export const BASIC_TEXT_STYLES = ['caja', 'resaltado', 'subrayado', 'banda', 'etiqueta', 'contorno'] as const;
/** Cómo entra el texto en pantalla. */
export const TextAnim = z.enum(['subir', 'pop', 'deslizar', 'fundido', 'barrido', 'rebote', 'zoom', 'girar', 'desenfoque', 'palabra', 'maquina', 'caer', 'derecha', 'voltear', 'elastico', 'latido', 'golpe', 'cortina', 'estirar', 'parpadeo']);
export type TextAnim = z.infer<typeof TextAnim>;
export type TextStyle = z.infer<typeof TextStyle>;
/** Aspecto de color de la imagen. */
export const Look = z.enum(['normal', 'bn', 'calido', 'frio', 'contraste', 'vivo', 'cine', 'vintage', 'suave', 'dramatico', 'sepia']);
export type Look = z.infer<typeof Look>;
/** Movimiento de cámara simulado durante la escena. */
export const Camera = z.enum(['ninguno', 'acercar', 'alejar', 'izquierda', 'derecha', 'arriba', 'abajo', 'pulso', 'temblor', 'orbita', 'foco', 'respirar']);
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
  /** Qué cambia esta variante: gráficos, b-roll, color, tipografía o una idea general. */
  category: z.enum(['motion', 'broll', 'color', 'tipografia', 'camara', 'idea']).optional(),
  vignette: z.number().optional(),
  cameraAmount: z.number().optional(),
  textStyle: TextStyle.optional(),
  textKeyword: z.string().optional(),
  textPosition: z.enum(['arriba', 'centro']).optional(),
  textFont: z.string().optional(),
  textSize: z.number().optional(),
  textAnim: TextAnim.optional(),
  motionData: z.record(z.string(), z.any()).optional(),
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
  /**
   * Recorte del clip en segundos: positivo quita del inicio o del final;
   * negativo lo alarga con el material que hay antes o después. No se pierde nada.
   */
  trimStart: z.number().default(0),
  trimEnd: z.number().default(0),
  visual: SceneVisual.default('original'),
  /** Frase(s) del guion que se dicen en esta escena (cuando se cortó con el guion). */
  scriptText: z.string().optional(),
  onScreenText: z.string().optional(),
  /** Texto que puso un estilo (no el usuario): si sigue igual, otro estilo lo puede cambiar. */
  autoText: z.string().optional(),
  /** El motion graphic de esta escena lo puso un estilo. */
  autoMotion: z.boolean().optional(),
  textColor: z.string().optional(),
  /** Forma del texto en pantalla. */
  textStyle: TextStyle.default('caja'),
  /** Palabra que se remarca en el texto. Sin valor, se elige sola la más importante. */
  textKeyword: z.string().optional(),
  /** Dónde va el texto en pantalla. */
  textPosition: z.enum(['arriba', 'centro']).default('arriba'),
  /** El logo de la marca encima del texto (formato «App + App = 🔥» de los videos de producto). */
  textLogo: z.boolean().optional(),
  /** Otros íconos junto al logo (archivos del proyecto, p. ej. media/iconos/claude.png), en orden. */
  textIcons: z.array(z.string()).optional(),
  /** Posición libre del centro del texto (0–1). Si falta, manda textPosition. */
  textX: z.number().min(0).max(1).optional(),
  textY: z.number().min(0).max(1).optional(),
  /** Tamaño relativo del texto (1 = normal). */
  textSize: z.number().min(0.4).max(2.5).default(1),
  /** Tipografía del texto. Si falta, la de los subtítulos. */
  textFont: z.string().optional(),
  textAnim: TextAnim.default('subir'),
  look: Look.default('normal'),
  /** Ajustes finos de la imagen (1 = sin cambio; viñeta 0 = sin viñeta). */
  brightness: z.number().min(0.5).max(1.6).default(1),
  contrast: z.number().min(0.5).max(1.8).default(1),
  saturation: z.number().min(0).max(2).default(1),
  vignette: z.number().min(0).max(1).default(0),
  camera: Camera.default('ninguno'),
  /** Cuánto se mueve la cámara (0,05 sutil – 0,4 fuerte). */
  cameraAmount: z.number().min(0.03).max(0.5).default(0.14),
  /** Cómo se combina el b-roll con tu video: a pantalla completa, dividida (b-roll arriba o abajo) o tú en un recuadro. */
  brollLayout: z.enum(['completo', 'arriba', 'abajo', 'recuadro']).default('completo'),
  /** Cámara lenta: 1 normal, 0,5 a la mitad, 0,25 a un cuarto. La voz de la escena se silencia. */
  speed: z.number().min(0.2).max(1).default(1),
  /** Tramos ya interpolados (fotogramas intermedios) para la cámara lenta suave. */
  slowFiles: z.array(z.object({ start: z.number(), end: z.number(), speed: z.number(), file: z.string() })).optional(),
  brollFile: z.string().optional(),
  motionTemplate: z.string().optional(),
  /** Datos de la plantilla de motion graphics (los pone el usuario; nunca inventados). */
  motionData: z.record(z.string(), z.any()).optional(),
  /** Aspecto del motion graphic: se cambia sin regenerarlo. */
  motionStyle: z.object({
    /** Fondo: oscuro, claro, color de marca, degradado animado o el propio video desenfocado. */
    background: z.enum(['oscuro', 'claro', 'marca', 'degradado', 'video']).default('oscuro'),
    primary: z.string().optional(),
    secondary: z.string().optional(),
    font: z.string().optional(),
    /** Tamaño relativo de todo el gráfico. */
    scale: z.number().min(0.6).max(1.5).default(1),
  }).default({ background: 'oscuro', scale: 1 }),
  /** Tamaño del video dentro del cuadro (1 = llena la pantalla; menos deja ver un fondo desenfocado). */
  videoScale: z.number().min(0.4).max(2.5).default(1),
  /** «completo»: se ve el video entero aunque su forma no sea la del cuadro (una grabación de pantalla horizontal en un reel), con el mismo video desenfocado detrás. «monitor»: el video dentro de un monitor sobre un escritorio, como una toma grabada con el celular. */
  videoFit: z.enum(['cubrir', 'completo', 'monitor', 'flotante']).optional(),
  /** Fondo de la pantalla flotante («flotante»): claro (estudio) u oscuro. */
  floatBg: z.enum(['claro', 'oscuro']).optional(),
  /** Palabras gigantes al ritmo de la voz (reels de creador): at/until en segundos desde el inicio de la escena; behind = detrás de la persona (necesita el recorte del proyecto). */
  words: z.array(z.object({
    text: z.string(),
    at: z.number().min(0),
    until: z.number().min(0).optional(),
    color: z.enum(['blanco', 'rojo', 'amarillo', 'negro']).default('blanco'),
    x: z.number().min(0).max(1).default(0.5),
    y: z.number().min(0).max(1).default(0.17),
    size: z.number().min(0.3).max(3).default(1),
    behind: z.boolean().default(false),
    /** gigante: palabra grande · pildora: etiqueta · pantalla: texto que se escribe (*palabra* en rojo) · resaltado: caja amarilla · seleccion: caja roja con tiradores · tachado: palabra con raya roja · nota: papelito pegado · tarjeta: dato con barras (92%) · icono: tarjeta de app (axioma o chispa) · archivo: caja de selección con ícono y texto que se escribe · tira: línea de tiempo pequeña · ruta: curva de animación con puntos · miniaturas: collage de imágenes que entran volando (files) · chat: ventana de chat (text = mensaje; files[0] = adjunto que llega en «then») · mic: onda de voz con micrófono (text = lo que se pide). */
    style: z.enum(['gigante', 'pildora', 'pantalla', 'resaltado', 'seleccion', 'tachado', 'nota', 'tarjeta', 'icono', 'archivo', 'tira', 'ruta', 'miniaturas', 'chat', 'mic']).default('gigante'),
    rotate: z.number().min(-45).max(45).optional(),
    files: z.array(z.string()).optional(),
    /** Segundos (desde el inicio de la escena) del segundo paso del elemento (el adjunto del chat, el cambio de texto). */
    then: z.number().min(0).optional(),
  })).optional(),
  /** Bajar a la persona en el cuadro (0..0,4 de la altura) para dejar aire arriba para las palabras. */
  frameY: z.number().min(0).max(0.4).optional(),
  /** Foto real del escritorio para la «toma de escritorio»: imagen del proyecto con la pantalla transparente y las 4 esquinas de la pantalla (x,y de 0 a 1: arriba-izq, arriba-der, abajo-der, abajo-izq). Sin ella, la app dibuja el escritorio. */
  deskPhoto: z.object({ file: z.string(), screen: z.array(z.number()).length(8) }).optional(),
  /** Estilo «pizarra» (video explicativo dibujado): la imagen de la escena (brollFile) se dibuja a mano sobre papel y luego se colorea. lines: la misma imagen solo en líneas; title: el título de arriba (*palabra* va destacada); burst: globo de cómic («¡OJO!»); tag: la etiqueta de la serie arriba; draw: segundos que tarda en dibujarse (0 = aparece ya coloreada); hand: la mano con el plumón y la punta (0..1). */
  drawing: z.object({
    lines: z.string(),
    title: z.string().optional(),
    burst: z.string().optional(),
    tag: z.string().optional(),
    draw: z.number().min(0).max(8).default(2),
    hand: z.object({ file: z.string(), tipX: z.number(), tipY: z.number(), armX: z.number().optional(), armY: z.number().optional(), armW: z.number().optional(), armColor: z.string().optional() }).optional(),
  }).optional(),
  /** Fondo detrás de la persona recortada (necesita el recorte del proyecto). 'ninguno' = el video tal cual. */
  backdrop: z.enum(['ninguno', 'cine', 'oscuro', 'claro', 'marca', 'degradado', 'desenfoque', 'imagen']).default('ninguno'),
  /** Imagen o video del proyecto que va de fondo cuando backdrop es 'imagen'. */
  backdropFile: z.string().optional(),
  /** Giro del texto en grados y separación entre letras. */
  textRotate: z.number().min(-20).max(20).default(0),
  textSpacing: z.number().min(-0.05).max(0.4).default(0),
  /** Efectos de sonido de la escena. `offset` son segundos desde su inicio. */
  sfx: z.array(z.object({ id: z.string(), offset: z.number().min(0).default(0), volume: z.number().min(0).max(1).default(0.6) })).default([]),
  /** Transición de entrada desde la escena anterior (sin valor = corte seco). */
  transition: z.object({ id: z.string(), duration: z.number().min(0.1).max(1.5).optional() }).optional(),
  /** Zoom de golpe al inicio de la escena. */
  punchZoom: z.boolean().default(false),
  /** Silencia el sonido original de esta escena (tomas de producto con ruido de fondo). La voz de quien habla en pantalla nunca se silencia. */
  sinAudio: z.boolean().default(false),
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
    textFont: z.string().optional(),
    textAnim: TextAnim.optional(),
    look: Look.optional(),
    camera: Camera.optional(),
    /** Poner las transiciones recomendadas al aplicar el preset. */
    transitions: z.boolean().optional(),
    /** Destellos en los cortes (detectados en la referencia). */
    flashes: z.boolean().optional(),
    sfxAuto: z.boolean().optional(),
    // --- Receta de edición: lo que el estilo pone solo en el reel.
    /** Cuántos textos en pantalla saca de lo que se dice. */
    texts: z.enum(['ninguno', 'pocos', 'muchos']).optional(),
    /** Estilo del texto del gancho (primera escena). */
    hook: TextStyle.optional(),
    /** Zoom cuando aparece un texto. */
    zoomText: z.boolean().optional(),
    /** Movimientos de cámara que se van turnando entre escenas. */
    cameras: z.array(Camera).optional(),
    /** Un motion graphic hecho con lo que se dice cada tantas escenas (0 = ninguno). */
    motionEvery: z.number().int().min(0).optional(),
    /** Acabados de todo el reel. */
    finish: z.object({ progressBar: z.boolean().optional(), grain: z.boolean().optional(), vignette: z.boolean().optional(), halation: z.boolean().optional(), letterbox: z.boolean().optional() }).optional(),
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
  /** A qué se dedica la marca: decide el estilo (un gimnasio no se ve como una hamburguesería). */
  sector: z.string().optional(),
  /** Cómo habla la marca: enérgica, divertida, elegante, cercana, seria o rebelde. */
  personality: z.string().optional(),
  /** Lo que la app va aprendiendo: cuántas veces se exportó con cada diseño. */
  learned: z.record(z.string(), z.number()).default({}),
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
  /** Calidad del master en videos de baja resolución: normal (quita bloques de compresión y escala fino) o más nítido. Sin valor: master hecho antes de esta mejora. */
  quality: z.enum(['normal', 'nitido']).optional(),
  /** El video de edición se hizo en 4K (lado corto 2160): se puede exportar en 4K sin perder nitidez. */
  master4k: z.boolean().optional(),
  /** El video de edición está estabilizado (el original queda guardado para deshacer). */
  stabilized: z.boolean().optional(),
  /** Con dos o más personas, el encuadre va hacia quien habla (necesita hablantes.json). */
  followSpeaker: z.boolean().default(false),
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
  /** Quién lo pidió (por ejemplo, el cliente desde el enlace de revisión). */
  author: z.string().optional(),
  /** Segundo del reel al que se refiere. */
  time: z.number().optional(),
});

/** Una frase del guion escrito y lo que el corte encontró de ella en la grabación. */
export const ScriptCutLine = z.object({
  /** Fila (párrafo o fila del guion) a la que pertenece, desde 0. */
  row: z.number().int(),
  text: z.string(),
  found: z.boolean(),
  /** Cuántas veces se grabó (tomas reconocibles). */
  takes: z.number().int().default(0),
  /** Qué toma quedó (1 = la primera que se grabó). */
  chosenTake: z.number().int().optional(),
  /** Tramo de la grabación de la toma elegida (s). */
  start: z.number().optional(),
  end: z.number().optional(),
  /** Parte de la frase del guion que sí se dijo en esa toma (0–1). */
  coverage: z.number().default(0),
  sceneId: z.string().optional(),
});
export type ScriptCutLine = z.infer<typeof ScriptCutLine>;

export const ScriptCut = z.object({
  at: z.string(),
  /** El guion tal como se pegó. */
  text: z.string(),
  take: z.enum(['ultima', 'mejor', 'primera']).default('ultima'),
  lines: z.array(ScriptCutLine).default([]),
  /** Frases del guion que no se encontraron en la grabación. */
  missing: z.array(z.string()).default([]),
  removedFillers: z.number().default(0),
  removedRetakeWords: z.number().default(0),
  removedOffScriptWords: z.number().default(0),
  sourceDuration: z.number().default(0),
  outputDuration: z.number().default(0),
});
export type ScriptCut = z.infer<typeof ScriptCut>;

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
  /** Si el reel es un clip de un video largo: el tramo del original que usa (s). */
  clipRange: z.object({ start: z.number(), end: z.number() }).optional(),
  presetId: z.string().default('rapido'),
  /** Cuánto se edita al aplicar un estilo o editar con IA: más o menos textos, zooms, gráficos y sonidos. */
  intensity: z.enum(['suave', 'media', 'fuerte']).default('media'),
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
    targetLufs: z.number().default(-14),
    /** Audio de voz procesado (limpio y nivelado), relativo al proyecto. */
    processedVoice: z.string().optional(),
    music: z.string().optional(),
    /** El usuario quitó la música a mano: la edición automática no vuelve a poner una. */
    musicOff: z.boolean().optional(),
    /** El usuario apagó los efectos automáticos a mano: la edición automática los respeta. */
    sfxOff: z.boolean().optional(),
    musicVolume: z.number().min(0).max(1).default(0.18),
    /** Volumen del sonido original del video (0 = silenciado). */
    originalVolume: z.number().min(0).max(1).default(1),
    /** Voz en off generada: suena desde el inicio del reel, sobre el video. */
    voiceover: z.object({
      wordsFile: z.string().optional(),
      file: z.string(),
      text: z.string(),
      provider: z.string(),
      voice: z.string().optional(),
      duration: z.number(),
      /** Si es un doblaje: idioma (en, pt, fr…). */
      language: z.string().optional(),
      /** Volumen del sonido original antes de poner la voz en off (se recupera al quitarla). */
      prevOriginalVolume: z.number().min(0).max(1).optional(),
      /** Volumen de la voz en off (1 = como se grabó; hasta 2 = el doble). */
      volume: z.number().min(0).max(2).optional(),
      /** Segundo del video en que empieza la voz (0 = desde el inicio). */
      offset: z.number().min(0).max(600).optional(),
    }).optional(),
  }).default({ denoise: true, denoiseLevel: 'media', enhance: false, sfxAuto: false, targetLufs: -14, musicVolume: 0.18, originalVolume: 1 }),
  /** Acabados profesionales de todo el reel. */
  finish: z.object({
    /** Barra de progreso arriba: ayuda a que la gente se quede hasta el final. */
    progressBar: z.boolean().default(false),
    /** Grano de película sutil sobre toda la imagen. */
    grain: z.boolean().default(false),
    /** Bordes oscuros suaves en todo el reel. */
    vignette: z.boolean().default(false),
    /** Zoom suave en la palabra importante de cada frase, alternando acercar y alejar, centrado en la cara. */
    keywordZoom: z.boolean().default(true),
    /** Brillo de cine: las luces se abren con un halo suave. */
    halation: z.boolean().default(false),
    /** Barras de cine arriba y abajo. */
    letterbox: z.boolean().default(false),
    /** LUT de color aplicado a todo el video (incluido o .cube propio). */
    lut: z.object({ name: z.string(), strength: z.number().min(0.1).max(1).default(0.8), builtin: z.string().optional() }).optional(),
    /** Rótulo con nombre y cargo (como en entrevistas), unos segundos al inicio. */
    lowerThird: z.object({
      name: z.string(),
      role: z.string().optional(),
      at: z.number().min(0).default(0.8),
      duration: z.number().min(1).max(15).default(4),
    }).optional(),
    /** Marca de agua: el logo (o el nombre) de la marca fijo en una esquina. */
    watermark: z.object({
      corner: z.enum(['arriba-izq', 'arriba-der', 'abajo-izq', 'abajo-der']).default('arriba-der'),
      size: z.number().min(0.06).max(0.3).default(0.13),
      opacity: z.number().min(0.2).max(1).default(0.85),
    }).optional(),
  }).default({ progressBar: false, grain: false, vignette: false, keywordZoom: true, halation: false, letterbox: false }),
  /** Cómo y dónde se exporta. */
  export: z.object({
    /** maxima: casi sin compresión (archivos grandes); alta: la recomendada para redes; ligera: para enviar rápido. */
    quality: z.enum(['maxima', 'alta', 'ligera']).default('alta'),
    /** Carpeta donde guardar los videos. Sin valor, la carpeta `renders` del proyecto. */
    folder: z.string().optional(),
    /** Exportar en 4K (2160×3840 en vertical): el doble de píxeles por lado. Solo gana nitidez si el material original la tiene. */
    uhd: z.boolean().default(false),
  }).default({ quality: 'alta', uhd: false }),
  assets: z.array(Asset).default([]),
  approval: z.enum(['borrador', 'en_revision', 'aprobado']).default('borrador'),
  requests: z.array(Request).default([]),
  /** Último corte hecho con el guion escrito: qué frase quedó en cada escena y cuáles faltan. */
  scriptCut: ScriptCut.optional(),
  /** Enlace de revisión para el cliente: la clave que da acceso solo a este reel. */
  review: z.object({ token: z.string(), createdAt: z.string() }).optional(),
});
export type Project = z.infer<typeof Project>;
