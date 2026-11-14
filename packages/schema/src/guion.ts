import { z } from 'zod';

/**
 * Guiones: el literario (lo que dice la voz) y el técnico (fila por fila: qué se dice, qué se ve,
 * con qué plano y movimiento, qué texto sale, cómo se entra y qué suena). El técnico es el que la
 * app convierte en video: cada fila manda sobre la imagen mientras la voz la dice.
 */

/** Estructuras narrativas que usa un guionista de redes, con sus tiempos (partes en orden). */
export const SCRIPT_STRUCTURES = [
  { id: 'historia', name: 'Historia corta', when: 'Entretiene y vende sin parecer anuncio: alguien tiene un problema, pasa algo y termina bien.', beats: ['gancho', 'situación', 'conflicto', 'giro', 'resolución', 'llamada'] },
  { id: 'pas', name: 'Problema · Agitar · Solución', when: 'Cuando el cliente tiene un dolor claro que tú resuelves.', beats: ['gancho', 'problema', 'agitar', 'solución', 'prueba', 'llamada'] },
  { id: 'aida', name: 'AIDA', when: 'Anuncio clásico: Atención, Interés, Deseo y Acción.', beats: ['atención', 'interés', 'deseo', 'acción'] },
  { id: 'antes-despues', name: 'Antes y después', when: 'Transformaciones: se ve el cambio.', beats: ['gancho', 'antes', 'proceso', 'después', 'llamada'] },
  { id: 'lista', name: 'Lista (3 razones, 5 tips)', when: 'Enseñar o convencer con puntos cortos y numerados.', beats: ['gancho', 'punto 1', 'punto 2', 'punto 3', 'llamada'] },
  { id: 'tutorial', name: 'Paso a paso', when: 'Enseñar a hacer algo de principio a fin.', beats: ['gancho', 'resultado', 'paso 1', 'paso 2', 'paso 3', 'llamada'] },
  { id: 'producto', name: 'Demostración de producto', when: 'Mostrar qué es, qué trae y por qué provoca.', beats: ['gancho', 'presentación', 'detalle', 'detalle', 'prueba', 'llamada'] },
  { id: 'testimonio', name: 'Testimonio o caso', when: 'Un cliente real cuenta cómo le fue.', beats: ['gancho', 'quién', 'problema', 'experiencia', 'resultado', 'llamada'] },
  { id: 'mito', name: 'Mito y realidad', when: 'Corregir una creencia falsa de tu sector.', beats: ['gancho', 'mito', 'realidad', 'prueba', 'llamada'] },
  { id: 'detras', name: 'Detrás de cámaras', when: 'Mostrar cómo se hace: da confianza y cercanía.', beats: ['gancho', 'inicio', 'proceso', 'detalle', 'resultado', 'llamada'] },
  { id: 'pregunta', name: 'Pregunta y respuesta', when: 'Responder la duda más frecuente de tus clientes.', beats: ['pregunta', 'respuesta corta', 'explicación', 'ejemplo', 'llamada'] },
  { id: 'oferta', name: 'Oferta directa', when: 'Vender algo concreto con urgencia (solo con datos reales).', beats: ['gancho', 'oferta', 'qué incluye', 'por qué ahora', 'llamada'] },
] as const;
export type ScriptStructureId = (typeof SCRIPT_STRUCTURES)[number]['id'];
export const scriptStructure = (id?: string) => SCRIPT_STRUCTURES.find((s) => s.id === id) ?? SCRIPT_STRUCTURES[0];

/** Tamaños de plano del guion técnico. */
export const SHOT_SIZES = ['detalle', 'primer plano', 'plano medio', 'plano general', 'cenital', 'subjetivo'] as const;
/** Movimientos de cámara del guion técnico (la app los simula sobre la toma). */
export const SHOT_MOVES = ['fijo', 'acercar', 'alejar', 'paneo', 'cámara en mano', 'pulso'] as const;
/** Cómo entra cada fila. */
export const SCRIPT_TRANSITIONS = ['corte', 'barrido', 'zoom', 'deslizar', 'destello', 'fundido', 'golpe'] as const;

export const GuionRow = z.object({
  /** Parte de la estructura: gancho, problema, llamada… */
  seccion: z.string().default(''),
  /** Lo que dice la voz en esta fila (una o dos frases). */
  voz: z.string().default(''),
  /** Qué se ve, descrito para quien graba o elige la toma. */
  imagen: z.string().default(''),
  /** Etiqueta de las tomas del proyecto que muestran eso (burro, nachos, personas…), si hay. */
  toma: z.string().optional(),
  plano: z.string().default('primer plano'),
  movimiento: z.string().default('acercar'),
  /** Texto en pantalla (pocas palabras) o vacío. */
  texto: z.string().default(''),
  transicion: z.string().default('corte'),
  /** Efecto de sonido o indicación de música para esta fila. */
  sonido: z.string().default(''),
  /** Duración estimada (s), según las palabras de la voz. */
  segundos: z.number().default(0),
});
export type GuionRow = z.infer<typeof GuionRow>;

export const Guion = z.object({
  titulo: z.string().default(''),
  /** La idea en una frase (logline). */
  idea: z.string().default(''),
  estructura: z.string().default('historia'),
  tono: z.string().default(''),
  /** Duración pedida (s). */
  duracion: z.number().default(30),
  /** Voz sugerida para narrarlo (ver AI_VOICES). */
  voz: z.string().optional(),
  filas: z.array(GuionRow).default([]),
  /** Quién lo escribió: la IA, la plantilla de la estructura o una persona. */
  origen: z.enum(['ia', 'plantilla', 'manual']).default('manual'),
  /** Cosas por revisar antes de usarlo (datos que no salen del brief, duración pasada…). */
  avisos: z.array(z.string()).default([]),
  updatedAt: z.string().optional(),
});
export type Guion = z.infer<typeof Guion>;

/** Palabras por segundo de una voz a ritmo de anuncio. */
export const WORDS_PER_SECOND = 2.6;
export const spokenSeconds = (text: string) => +(text.trim().split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND).toFixed(1);
/** El guion literario: todo lo que dice la voz, seguido. */
export const guionVoice = (g: Pick<Guion, 'filas'>) => g.filas.map((f) => f.voz.trim()).filter(Boolean).join(' ');
export const guionSeconds = (g: Pick<Guion, 'filas'>) => +g.filas.reduce((a, f) => a + (f.segundos || spokenSeconds(f.voz)), 0).toFixed(1);

/** Deja el guion consistente: duraciones según las palabras y sin filas vacías. */
export function tidyGuion(g: Guion): Guion {
  const filas = g.filas.filter((f) => f.voz.trim() || f.imagen.trim() || f.texto.trim()).map((f) => ({ ...f, segundos: Math.max(0.8, spokenSeconds(f.voz)) }));
  return { ...g, filas };
}

/** El guion en texto (Markdown): literario arriba, técnico en tabla. Para copiar, imprimir o enviar. */
export function guionMarkdown(g: Guion): string {
  const cell = (t: string) => (t || '—').replace(/\|/g, '/').replace(/\n+/g, ' ');
  let t = 0;
  const rows = g.filas.map((f, i) => {
    const from = t; t += f.segundos;
    return `| ${i + 1} | ${from.toFixed(1)}–${t.toFixed(1)} s | ${cell(f.seccion)} | ${cell(f.voz)} | ${cell(f.imagen)} | ${cell(f.plano)} · ${cell(f.movimiento)} | ${cell(f.texto)} | ${cell(f.transicion)} | ${cell(f.sonido)} |`;
  });
  return [
    `# ${g.titulo || 'Guion'}`,
    g.idea ? `**Idea:** ${g.idea}` : '',
    `**Estructura:** ${scriptStructure(g.estructura).name} · **Duración:** ${guionSeconds(g).toFixed(0)} s${g.tono ? ` · **Tono:** ${g.tono}` : ''}`,
    '', '## Guion literario (lo que dice la voz)', '', ...g.filas.filter((f) => f.voz.trim()).map((f) => f.voz.trim()),
    '', '## Guion técnico', '',
    '| # | Tiempo | Parte | Voz | Imagen | Plano · movimiento | Texto en pantalla | Entrada | Sonido |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    ...(g.avisos.length ? ['', '## Por revisar', '', ...g.avisos.map((a) => `- ${a}`)] : []),
  ].filter((l) => l !== undefined).join('\n');
}

/** Voces de la voz IA local: se describen y el modelo las crea (no imitan a nadie). La instrucción va en inglés. */
export const AI_VOICES = [
  { id: 'colombiana', name: 'Mujer colombiana, cálida', instruct: 'Original young adult woman voice, warm and melodic, with a natural Colombian Spanish accent from Bogotá. Witty, smiling and confident; lively rhythm, clear diction.' },
  { id: 'colombiano', name: 'Hombre colombiano, cercano', instruct: 'Original adult male voice with a natural Colombian Spanish accent from Bogotá. Warm, trustworthy and close; medium-fast pace, very clear diction.' },
  { id: 'mexicana', name: 'Mujer mexicana, alegre', instruct: 'Original young adult woman voice with a natural Mexican Spanish accent. Bright, cheerful and charming, smiling; lively pace, clear diction.' },
  { id: 'mexicano', name: 'Hombre mexicano, cálido', instruct: 'Original adult male voice, warm baritone with a natural Mexican Spanish accent. Friendly, confident and close, natural smile; brisk flowing pace, clear diction, short expressive pauses.' },
  { id: 'neutra', name: 'Mujer latina neutra, profesional', instruct: 'Original adult woman voice, neutral Latin American Spanish. Clear, professional and friendly narrator; medium pace.' },
  { id: 'neutro', name: 'Hombre latino neutro, serio', instruct: 'Original adult male voice, neutral Latin American Spanish. Calm, professional and trustworthy narrator; medium pace, clear diction.' },
  { id: 'energico', name: 'Hombre enérgico (anuncio)', instruct: 'Original adult male voice, Latin American Spanish, very energetic and excited like a radio ad host, big smile, fast pace, punchy and clear.' },
  { id: 'elegante', name: 'Mujer elegante (lujo)', instruct: 'Original adult woman voice, neutral Latin American Spanish, low, smooth and elegant like a luxury brand commercial; slow confident pace, intimate, clear diction.' },
] as const;
