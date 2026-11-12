import { CaptionStyle, Pacing, Preset } from './project.ts';

const p = (x: { id: string; name: string; description: string; pacing?: Partial<Pacing>; captions?: Partial<CaptionStyle>; style?: Preset['style'] }) =>
  Preset.parse({ ...x, pacing: Pacing.parse(x.pacing ?? {}), captions: CaptionStyle.parse(x.captions ?? {}) });

/** Presets base. Cada cliente puede tener los suyos en su kit. */
export const BUILTIN_PRESETS: Preset[] = [
  p({
    id: 'rapido',
    name: 'Rápido',
    description: 'Sin pausas, zoom de golpe frecuente, subtítulos palabra a palabra en mayúsculas.',
    pacing: { maxPause: 0.2, pad: 0.06, punchZoomEvery: 4 },
    captions: { wordsPerLine: 3, uppercase: true, effect: 'pop' },
  }),
  p({
    id: 'con-ritmo',
    name: 'Con ritmo',
    description: 'Pausas cortas que respiran, zoom moderado.',
    pacing: { maxPause: 0.35, pad: 0.08, punchZoomEvery: 7 },
    captions: { wordsPerLine: 4 },
  }),
  p({
    id: 'sobrio',
    name: 'Sobrio',
    description: 'Ritmo natural, sin zooms, subtítulos por frase en minúsculas.',
    pacing: { maxPause: 0.6, pad: 0.12, punchZoomEvery: 0 },
    captions: { mode: 'phrase', wordsPerLine: 6, uppercase: false, fontWeight: 700, fontSize: 64, highlightColor: '#FFFFFF', fontFamily: 'Inter', effect: 'subrayado', emphasis: false },
  }),
  p({
    id: 'testimonio',
    name: 'Testimonio',
    description: 'Deja respirar a la persona: frases completas, sin zooms.',
    pacing: { maxPause: 0.5, pad: 0.12, punchZoomEvery: 0, removeRetakes: true },
    captions: { mode: 'phrase', wordsPerLine: 6, uppercase: false, fontFamily: 'Inter', fontWeight: 700, fontSize: 62, highlightColor: '#FFFFFF', y: 0.72, emphasis: false },
  }),
  p({
    id: 'antes-despues',
    name: 'Antes / después',
    description: 'Cortes secos y zoom en cada cambio, resaltado cian.',
    pacing: { maxPause: 0.18, pad: 0.05, punchZoomEvery: 3 },
    captions: { wordsPerLine: 2, uppercase: true, fontFamily: 'Anton', fontWeight: 400, fontSize: 92, highlightColor: '#25F4EE', effect: 'caja' },
  }),
  p({
    id: 'oferta-cta',
    name: 'Oferta con CTA',
    description: 'Directo y grande, resaltado amarillo, pensado para historias.',
    pacing: { maxPause: 0.25, pad: 0.06, punchZoomEvery: 5 },
    captions: { wordsPerLine: 3, uppercase: true, fontFamily: 'Poppins', fontWeight: 800, fontSize: 80, highlightColor: '#FACC15', effect: 'caja' },
  }),
  // --- Estilos profesionales completos: subtítulos, textos, imagen, transiciones y efectos.
  p({
    id: 'negocio-directo', name: 'Negocio directo',
    description: 'Para ventas, marketing y emprendimiento: frases cortas, clave en amarillo con caja y marcador en los textos.',
    pacing: { maxPause: 0.2, pad: 0.06, punchZoomEvery: 4 },
    captions: { wordsPerLine: 3, uppercase: true, fontFamily: 'Montserrat', fontWeight: 800, fontSize: 80, highlightColor: '#FACC15', effect: 'caja', emphasis: true },
    style: { textStyle: 'marcador', textFont: 'Montserrat', textAnim: 'pop', look: 'normal', transitions: true, sfxAuto: true },
  }),
  p({
    id: 'energia', name: 'Energía',
    description: 'Para gimnasio, deporte y retos: muy rápido, letras condensadas, alto contraste y destellos.',
    pacing: { maxPause: 0.15, pad: 0.05, punchZoomEvery: 2.5 },
    captions: { wordsPerLine: 2, uppercase: true, fontFamily: 'Anton', fontWeight: 400, fontSize: 96, highlightColor: '#FE2C55', effect: 'pop', emphasis: true },
    style: { textStyle: 'sombra', textFont: 'Anton', textAnim: 'pop', look: 'contraste', transitions: true, flashes: true, sfxAuto: true },
  }),
  p({
    id: 'comida-calida', name: 'Comida cálida',
    description: 'Para recetas y restaurantes: tonos cálidos, ritmo medio, etiquetas discretas y la cámara acercándose.',
    pacing: { maxPause: 0.35, pad: 0.08, punchZoomEvery: 0 },
    captions: { wordsPerLine: 4, uppercase: false, fontFamily: 'Poppins', fontWeight: 800, fontSize: 70, highlightColor: '#FB923C', effect: 'color', emphasis: true },
    style: { textStyle: 'etiqueta', textFont: 'Poppins', textAnim: 'deslizar', look: 'calido', camera: 'acercar', transitions: true, sfxAuto: false },
  }),
  p({
    id: 'tech-neon', name: 'Tecnología neón',
    description: 'Para apps, herramientas e IA: tonos fríos, cian, textos con degradado y entradas que se revelan.',
    pacing: { maxPause: 0.25, pad: 0.06, punchZoomEvery: 5 },
    captions: { wordsPerLine: 3, uppercase: false, fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 74, highlightColor: '#25F4EE', effect: 'subrayado', emphasis: true },
    style: { textStyle: 'degradado', textFont: 'Space Grotesk', textAnim: 'barrido', look: 'frio', transitions: true, sfxAuto: true },
  }),
  p({
    id: 'clase-clara', name: 'Clase clara',
    description: 'Para explicar paso a paso: ritmo que respira, idea clave con marcador verde y subtítulos fáciles de leer.',
    pacing: { maxPause: 0.4, pad: 0.1, punchZoomEvery: 8 },
    captions: { wordsPerLine: 4, uppercase: false, fontFamily: 'DM Sans', fontWeight: 800, fontSize: 70, highlightColor: '#34D399', effect: 'caja', emphasis: true },
    style: { textStyle: 'marcador', textFont: 'DM Sans', textAnim: 'subir', look: 'normal', transitions: true, sfxAuto: false },
  }),
  p({
    id: 'elegante', name: 'Elegante',
    description: 'Para marca personal y servicios de alto valor: sobrio, minúsculas, subrayados finos y fundidos.',
    pacing: { maxPause: 0.55, pad: 0.12, punchZoomEvery: 0 },
    captions: { mode: 'phrase', wordsPerLine: 5, uppercase: false, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 60, highlightColor: '#FFFFFF', effect: 'subrayado', emphasis: false, y: 0.72 },
    style: { textStyle: 'subrayado', textFont: 'DM Sans', textAnim: 'fundido', look: 'calido', camera: 'acercar', transitions: true, sfxAuto: false },
  }),
];

const TOPICS: [string, string, RegExp][] = [
  ['energia', 'habla de entrenamiento o retos', /\b(gym|gimnasio|entren\w*|ejercicio\w*|musculo\w*|rutina\w*|pesas?|reto\w*|flexion\w*|cardio)\b/g],
  ['comida-calida', 'habla de comida', /\b(receta\w*|cocin\w*|pizza\w*|plato\w*|sabor\w*|restaurante\w*|comer|comida\w*|ingrediente\w*|horno)\b/g],
  ['tech-neon', 'habla de tecnología o herramientas', /\b(app|aplicacion\w*|software|inteligencia|artificial|herramienta\w*|automatiz\w*|codigo|notion|plataforma\w*|digital\w*)\b/g],
  ['negocio-directo', 'habla de negocio o ventas', /\b(negocio\w*|venta\w*|vender|cliente\w*|dinero|empresa\w*|emprend\w*|marketing|ingreso\w*|factur\w*|precio\w*)\b/g],
  ['clase-clara', 'explica paso a paso', /\b(paso\w*|aprend\w*|tip\w*|consejo\w*|error\w*|regla\w*|primero|segundo|tercero|clave\w*)\b/g],
];

/**
 * Estudia lo que se dice (y el tipo de video) y recomienda el estilo profesional
 * que mejor le va, con el motivo.
 */
export function recommendPreset(project: { kind: string }, transcript: { words: { text: string; start: number; end: number }[] } | null): { id: string; reason: string } {
  const text = (transcript?.words ?? []).map((w) => w.text).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const scored = TOPICS.map(([id, why, re]) => ({ id, why, n: (text.match(re) ?? []).length })).sort((a, b) => b.n - a.n);
  if (scored[0].n >= 2) return { id: scored[0].id, reason: `El video ${scored[0].why} (${scored[0].n} menciones).` };
  if (project.kind === 'montaje' || !transcript?.words.length) return { id: 'energia', reason: 'Es un montaje sin voz: le va un estilo rápido y con fuerza.' };
  const words = transcript.words;
  const rate = words.length / Math.max(1, words[words.length - 1].end - words[0].start);
  return rate > 2.8
    ? { id: 'negocio-directo', reason: 'Hablas rápido y directo: le va un estilo de frases cortas y con golpe.' }
    : { id: 'elegante', reason: 'Hablas con calma: le va un estilo sobrio que deje respirar.' };
}

/** Fuentes disponibles en el render (Google Fonts). */
export const FONT_FAMILIES = ['Montserrat', 'Inter', 'Space Grotesk', 'Poppins', 'Anton', 'Bebas Neue', 'Oswald', 'Archivo Black', 'DM Sans'] as const;

export function getPreset(id: string, extra: Preset[] = []): Preset {
  const found = [...extra, ...BUILTIN_PRESETS].find((x) => x.id === id);
  if (!found) throw new Error(`No existe el preset "${id}". Disponibles: ${[...extra, ...BUILTIN_PRESETS].map((x) => x.id).join(', ')}`);
  return found;
}
