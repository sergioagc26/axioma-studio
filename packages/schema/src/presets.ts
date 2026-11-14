import { CaptionStyle, Pacing, Preset } from './project.ts';

const p = (x: { id: string; name: string; description: string; pacing?: Partial<Pacing>; captions?: Partial<CaptionStyle>; style?: Preset['style'] }) =>
  Preset.parse({ ...x, pacing: Pacing.parse(x.pacing ?? {}), captions: CaptionStyle.parse(x.captions ?? {}) });

/** Presets base. Cada cliente puede tener los suyos en su kit. */
export const BUILTIN_PRESETS: Preset[] = [
  p({
    id: 'rapido',
    name: 'Rápido',
    description: 'Gancho gigante con zoom, texto en casi cada escena, gráficos con tus cifras, cámara con pulso, efectos de sonido y barra de progreso.',
    pacing: { maxPause: 0.2, pad: 0.06, punchZoomEvery: 4 },
    captions: { wordsPerLine: 3, uppercase: true, effect: 'pop' },
    style: { texts: 'muchos', hook: 'gigante', zoomText: true, cameras: ['pulso', 'acercar', 'ninguno'], motionEvery: 4, finish: { progressBar: true }, textStyle: 'resaltado', textAnim: 'pop', look: 'vivo', camera: 'pulso', transitions: true, sfxAuto: true },
  }),
  p({
    id: 'con-ritmo',
    name: 'Con ritmo',
    description: 'Gancho en palabras apiladas, textos clave con zoom suave, algún gráfico y pausas cortas que respiran.',
    pacing: { maxPause: 0.35, pad: 0.08, punchZoomEvery: 7 },
    captions: { wordsPerLine: 4 },
    style: { texts: 'pocos', hook: 'apilado', zoomText: true, cameras: ['acercar', 'ninguno', 'alejar'], motionEvery: 5, finish: {}, textStyle: 'caja', textAnim: 'deslizar', look: 'normal', camera: 'ninguno', transitions: true, sfxAuto: false },
  }),
  p({
    id: 'sobrio',
    name: 'Sobrio',
    description: 'Pocos textos en etiquetas discretas, la cámara se acerca despacio, fundidos y bordes oscuros.',
    pacing: { maxPause: 0.6, pad: 0.12, punchZoomEvery: 0 },
    captions: { mode: 'phrase', wordsPerLine: 6, uppercase: false, fontWeight: 700, fontSize: 64, highlightColor: '#FFFFFF', fontFamily: 'Inter', effect: 'subrayado', emphasis: false },
    style: { texts: 'pocos', hook: 'etiqueta', cameras: ['acercar', 'ninguno'], motionEvery: 0, finish: { vignette: true }, textStyle: 'etiqueta', textAnim: 'fundido', look: 'suave', camera: 'acercar', transitions: true, sfxAuto: false },
  }),
  p({
    id: 'testimonio',
    name: 'Testimonio',
    description: 'Deja hablar a la persona: frases completas, pocas ideas subrayadas, tonos cálidos y grano de cine.',
    pacing: { maxPause: 0.5, pad: 0.12, punchZoomEvery: 0, removeRetakes: true },
    captions: { mode: 'phrase', wordsPerLine: 6, uppercase: false, fontFamily: 'Inter', fontWeight: 700, fontSize: 62, highlightColor: '#FFFFFF', y: 0.72, emphasis: false },
    style: { texts: 'pocos', hook: 'subrayado', cameras: ['acercar', 'ninguno'], motionEvery: 0, finish: { vignette: true, grain: true }, textStyle: 'subrayado', textAnim: 'desenfoque', look: 'calido', camera: 'acercar', transitions: true, sfxAuto: false },
  }),
  p({
    id: 'antes-despues',
    name: 'Antes / después',
    description: 'Sellos que caen con zoom, cámara en mano, destellos en cada cambio y barra de progreso.',
    pacing: { maxPause: 0.18, pad: 0.05, punchZoomEvery: 3 },
    captions: { wordsPerLine: 2, uppercase: true, fontFamily: 'Anton', fontWeight: 400, fontSize: 92, highlightColor: '#25F4EE', effect: 'caja' },
    style: { texts: 'muchos', hook: 'sello', zoomText: true, cameras: ['temblor', 'acercar'], motionEvery: 0, finish: { progressBar: true }, textStyle: 'sello', textAnim: 'zoom', look: 'contraste', camera: 'temblor', transitions: true, flashes: true, sfxAuto: true },
  }),
  p({
    id: 'oferta-cta',
    name: 'Oferta con CTA',
    description: 'Gancho gigante, tiras de color que rebotan, gráficos con tus cifras, zoom en cada texto y sonidos.',
    pacing: { maxPause: 0.25, pad: 0.06, punchZoomEvery: 5 },
    captions: { wordsPerLine: 3, uppercase: true, fontFamily: 'Poppins', fontWeight: 800, fontSize: 80, highlightColor: '#FACC15', effect: 'caja' },
    style: { texts: 'muchos', hook: 'gigante', zoomText: true, cameras: ['acercar', 'pulso'], motionEvery: 3, finish: { progressBar: true }, textStyle: 'cinta', textAnim: 'rebote', look: 'vivo', camera: 'ninguno', transitions: true, sfxAuto: true },
  }),
  // --- Estilos profesionales completos: subtítulos, textos, imagen, transiciones y efectos.
  p({
    id: 'negocio-directo', name: 'Negocio directo',
    description: 'Para ventas y marketing: gancho gigante, ideas clave con marcador y zoom, gráficos con tus cifras y barra de progreso.',
    pacing: { maxPause: 0.2, pad: 0.06, punchZoomEvery: 4 },
    captions: { wordsPerLine: 3, uppercase: true, fontFamily: 'Montserrat', fontWeight: 800, fontSize: 80, highlightColor: '#FACC15', effect: 'caja', emphasis: true },
    style: { texts: 'muchos', hook: 'gigante', zoomText: true, cameras: ['acercar', 'ninguno', 'pulso'], motionEvery: 3, finish: { progressBar: true }, textStyle: 'marcador', textFont: 'Montserrat', textAnim: 'pop', look: 'normal', transitions: true, sfxAuto: true },
  }),
  p({
    id: 'energia', name: 'Energía',
    description: 'Para gimnasio y retos: palabras apiladas, cámara con pulso y temblor, destellos, sonidos y cortes muy rápidos.',
    pacing: { maxPause: 0.15, pad: 0.05, punchZoomEvery: 2.5 },
    captions: { wordsPerLine: 2, uppercase: true, fontFamily: 'Anton', fontWeight: 400, fontSize: 96, highlightColor: '#FE2C55', effect: 'pop', emphasis: true },
    style: { texts: 'muchos', hook: 'apilado', zoomText: true, cameras: ['pulso', 'temblor', 'acercar'], motionEvery: 4, finish: { progressBar: true }, textStyle: 'sombra', textFont: 'Anton', textAnim: 'pop', look: 'contraste', transitions: true, flashes: true, sfxAuto: true },
  }),
  p({
    id: 'comida-calida', name: 'Comida cálida',
    description: 'Para recetas y restaurantes: tonos cálidos, paneos suaves sobre la comida, pocas etiquetas y bordes oscuros.',
    pacing: { maxPause: 0.35, pad: 0.08, punchZoomEvery: 0 },
    captions: { wordsPerLine: 4, uppercase: false, fontFamily: 'Poppins', fontWeight: 800, fontSize: 70, highlightColor: '#FB923C', effect: 'color', emphasis: true },
    style: { texts: 'pocos', hook: 'cinta', cameras: ['acercar', 'derecha', 'alejar', 'izquierda'], motionEvery: 0, finish: { vignette: true }, textStyle: 'etiqueta', textFont: 'Poppins', textAnim: 'deslizar', look: 'calido', camera: 'acercar', transitions: true, sfxAuto: false },
  }),
  p({
    id: 'tech-neon', name: 'Tecnología neón',
    description: 'Para apps e IA: gancho con glitch, textos en degradado que se revelan, gráficos con tus datos y tonos fríos.',
    pacing: { maxPause: 0.25, pad: 0.06, punchZoomEvery: 5 },
    captions: { wordsPerLine: 3, uppercase: false, fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 74, highlightColor: '#25F4EE', effect: 'subrayado', emphasis: true },
    style: { texts: 'muchos', hook: 'glitch', zoomText: true, cameras: ['acercar', 'ninguno'], motionEvery: 3, finish: { progressBar: true }, textStyle: 'degradado', textFont: 'Space Grotesk', textAnim: 'barrido', look: 'frio', transitions: true, sfxAuto: true },
  }),
  p({
    id: 'clase-clara', name: 'Clase clara',
    description: 'Para explicar: pasos y listas hechos gráfico, la idea clave con marcador verde y barra de progreso.',
    pacing: { maxPause: 0.4, pad: 0.1, punchZoomEvery: 8 },
    captions: { wordsPerLine: 4, uppercase: false, fontFamily: 'DM Sans', fontWeight: 800, fontSize: 70, highlightColor: '#34D399', effect: 'caja', emphasis: true },
    style: { texts: 'pocos', hook: 'marcador', zoomText: true, cameras: ['ninguno', 'acercar'], motionEvery: 2, finish: { progressBar: true }, textStyle: 'marcador', textFont: 'DM Sans', textAnim: 'subir', look: 'normal', transitions: true, sfxAuto: false },
  }),
  p({
    id: 'elegante', name: 'Elegante',
    description: 'Para marca personal: pocos textos finos, cámara lenta, fundidos, grano de cine y bordes oscuros.',
    pacing: { maxPause: 0.55, pad: 0.12, punchZoomEvery: 0 },
    captions: { mode: 'phrase', wordsPerLine: 5, uppercase: false, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 60, highlightColor: '#FFFFFF', effect: 'subrayado', emphasis: false, y: 0.72 },
    style: { texts: 'pocos', hook: 'sombra', cameras: ['acercar', 'alejar'], motionEvery: 0, finish: { grain: true, vignette: true }, textStyle: 'subrayado', textFont: 'DM Sans', textAnim: 'fundido', look: 'calido', camera: 'acercar', transitions: true, sfxAuto: false },
  }),
];

const TOPICS: [string, string, RegExp][] = [
  ['energia', 'habla de entrenamiento o retos', /\b(gym|gimnasio|entren\w*|ejercicio\w*|musculo\w*|rutina\w*|pesas?|reto\w*|flexion\w*|cardio)\b/g],
  ['comida-calida', 'habla de comida', /\b(receta\w*|cocin\w*|pizza\w*|plato\w*|sabor\w*|restaurante\w*|comer|comida\w*|ingrediente\w*|horno)\b/g],
  ['tech-neon', 'habla de tecnología o herramientas', /\b(app|aplicacion\w*|software|inteligencia|artificial|herramienta\w*|automatiz\w*|codigo|notion|plataforma\w*|digital\w*)\b/g],
  ['negocio-directo', 'habla de negocio o ventas', /\b(negocio\w*|venta\w*|vender|cliente\w*|dinero|empresa\w*|emprend\w*|marketing|ingreso\w*|factur\w*|precio\w*)\b/g],
  ['clase-clara', 'explica paso a paso', /\b(paso\w*|aprend\w*|tip\w*|consejo\w*|error\w*|regla\w*|primero|segundo|tercero|clave\w*)\b/g],
];

/** Lo que la app sabe reconocer en la imagen, y a qué sector y estilo lleva. */
export const VISION_TOPICS = [
  { id: 'ejercicio', label: 'gente entrenando', prompt: 'people exercising or working out', sector: 'gimnasio', preset: 'energia', look: 'dramatico' },
  { id: 'comida', label: 'comida', prompt: 'food or cooking', sector: 'restaurante', preset: 'comida-calida', look: 'calido' },
  { id: 'hablando', label: 'una persona hablando a cámara', prompt: 'a person talking to the camera', sector: null, preset: null, look: null },
  { id: 'pantalla', label: 'una pantalla o un programa', prompt: 'a computer screen or software', sector: 'tecnologia', preset: 'tech-neon', look: 'frio' },
  { id: 'producto', label: 'un producto de cerca', prompt: 'a product close-up', sector: 'negocios', preset: 'negocio-directo', look: 'vivo' },
  { id: 'calle', label: 'la calle', prompt: 'a city street', sector: null, preset: 'energia', look: 'cine' },
  { id: 'naturaleza', label: 'naturaleza', prompt: 'nature or landscape', sector: null, preset: 'elegante', look: 'cine' },
  { id: 'moda', label: 'moda o belleza', prompt: 'fashion or beauty', sector: 'moda', preset: 'elegante', look: 'suave' },
  { id: 'casa', label: 'una casa por dentro', prompt: 'a house or real estate interior', sector: 'inmobiliaria', preset: 'elegante', look: 'calido' },
  { id: 'fiesta', label: 'una fiesta o un concierto', prompt: 'a party or concert', sector: 'entretenimiento', preset: 'energia', look: 'vivo' },
] as const;

/** Lo que se ve en el video: el tema principal (si es claro) y la puntuación de cada uno. */
export type VisionReport = { topic: string | null; scores: { id: string; label: string; score: number }[] };

/**
 * Estudia el video y recomienda el estilo profesional que mejor le va, con el
 * motivo. Usa tres fuentes: lo que se VE en la imagen, lo que se DICE y el tipo
 * de video. Si la imagen y las palabras coinciden, mejor; si no, manda lo que
 * más claro esté.
 */
export function recommendPreset(project: { kind: string }, transcript: { words: { text: string; start: number; end: number }[] } | null, vision?: VisionReport | null): { id: string; reason: string } {
  const text = (transcript?.words ?? []).map((w) => w.text).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const scored = TOPICS.map(([id, why, re]) => ({ id, why, n: (text.match(re) ?? []).length })).sort((a, b) => b.n - a.n);
  const seen = vision?.topic ? VISION_TOPICS.find((t) => t.id === vision.topic) : undefined;
  const pct = seen ? Math.round((vision!.scores[0].score) * 100) : 0;
  if (seen?.preset && (scored[0].n < 2 || scored[0].id === seen.preset)) {
    return { id: seen.preset, reason: `En la imagen se ve ${seen.label} (${pct} %)${scored[0].n >= 2 ? ` y además ${scored[0].why}` : ''}.` };
  }
  if (scored[0].n >= 2) return { id: scored[0].id, reason: `El video ${scored[0].why} (${scored[0].n} menciones)${seen ? `; en la imagen se ve ${seen.label}` : ''}.` };
  if (project.kind === 'montaje' || !transcript?.words.length) return { id: 'energia', reason: 'Es un montaje sin voz: le va un estilo rápido y con fuerza.' };
  const words = transcript.words;
  const rate = words.length / Math.max(1, words[words.length - 1].end - words[0].start);
  return rate > 2.8
    ? { id: 'negocio-directo', reason: 'Hablas rápido y directo: le va un estilo de frases cortas y con golpe.' }
    : { id: 'elegante', reason: 'Hablas con calma: le va un estilo sobrio que deje respirar.' };
}

/** Fuentes disponibles en el render (Google Fonts). */
/** Fuentes disponibles en el render (Google Fonts). */
export const FONT_FAMILIES = ['Montserrat', 'Poppins', 'Archivo Black', 'League Spartan', 'Rubik', 'Kanit', 'Sora', 'Outfit', 'Manrope', 'Plus Jakarta Sans', 'Urbanist', 'Figtree', 'Lexend', 'Work Sans', 'Syne', 'Unbounded', 'Red Hat Display', 'Josefin Sans', 'Quicksand', 'Bricolage Grotesque', 'Inter', 'DM Sans', 'Space Grotesk', 'Raleway', 'Nunito', 'Anton', 'Bebas Neue', 'Oswald', 'Barlow Condensed', 'Roboto Condensed', 'Teko', 'Fjalla One', 'Antonio', 'Saira Condensed', 'Staatliches', 'Alfa Slab One', 'Titan One', 'Passion One', 'Russo One', 'Lilita One', 'Luckiest Guy', 'Playfair Display', 'Lora', 'Cormorant Garamond', 'DM Serif Display', 'Fraunces', 'Libre Baskerville', 'Bodoni Moda', 'Cinzel', 'Abril Fatface', 'Marcellus', 'Yeseva One', 'Prata', 'Italiana', 'Caveat', 'Pacifico', 'Lobster', 'Permanent Marker', 'Dancing Script', 'Great Vibes', 'Satisfy', 'Kaushan Script', 'Sacramento', 'Amatic SC', 'Shadows Into Light', 'Yellowtail', 'Bangers', 'Righteous', 'Fredoka', 'Baloo 2', 'Chewy', 'Space Mono', 'JetBrains Mono', 'Orbitron', 'Press Start 2P', 'Roboto Slab', 'Zilla Slab', 'Bitter', 'Monoton', 'Rye'] as const;
/** Grupos para mostrar las tipografías ordenadas. */
export const FONT_GROUPS: [string, string[]][] = [
  ['Fuertes', ['Montserrat', 'Poppins', 'Archivo Black', 'League Spartan', 'Rubik', 'Kanit', 'Sora']],
  ['Modernas', ['Outfit', 'Manrope', 'Plus Jakarta Sans', 'Urbanist', 'Figtree', 'Lexend', 'Work Sans', 'Syne', 'Unbounded', 'Red Hat Display', 'Josefin Sans', 'Quicksand', 'Bricolage Grotesque']],
  ['Limpias', ['Inter', 'DM Sans', 'Space Grotesk', 'Raleway', 'Nunito']],
  ['Condensadas', ['Anton', 'Bebas Neue', 'Oswald', 'Barlow Condensed', 'Roboto Condensed', 'Teko', 'Fjalla One', 'Antonio', 'Saira Condensed', 'Staatliches']],
  ['Impacto', ['Alfa Slab One', 'Titan One', 'Passion One', 'Russo One', 'Lilita One', 'Luckiest Guy']],
  ['Elegantes', ['Playfair Display', 'Lora', 'Cormorant Garamond', 'DM Serif Display', 'Fraunces', 'Libre Baskerville', 'Bodoni Moda', 'Cinzel', 'Abril Fatface', 'Marcellus', 'Yeseva One', 'Prata', 'Italiana']],
  ['Manuscritas', ['Caveat', 'Pacifico', 'Lobster', 'Permanent Marker', 'Dancing Script', 'Great Vibes', 'Satisfy', 'Kaushan Script', 'Sacramento', 'Amatic SC', 'Shadows Into Light', 'Yellowtail']],
  ['Con carácter', ['Bangers', 'Righteous', 'Fredoka', 'Baloo 2', 'Chewy']],
  ['Técnicas y retro', ['Space Mono', 'JetBrains Mono', 'Orbitron', 'Press Start 2P', 'Roboto Slab', 'Zilla Slab', 'Bitter', 'Monoton', 'Rye']],
];
/** Fuentes que solo traen un grosor (el normal): no se les pide negrita, que saldría falsa y borrosa. */
export const FONT_SINGLE_WEIGHT: string[] = ['Anton', 'Bebas Neue', 'Archivo Black', 'Bangers', 'Righteous', 'Permanent Marker', 'Pacifico', 'Lobster', 'DM Serif Display', 'Abril Fatface', 'Marcellus', 'Yeseva One', 'Prata', 'Italiana', 'Fjalla One', 'Alfa Slab One', 'Titan One', 'Staatliches', 'Passion One', 'Russo One', 'Lilita One', 'Luckiest Guy', 'Great Vibes', 'Satisfy', 'Kaushan Script', 'Sacramento', 'Shadows Into Light', 'Yellowtail', 'Press Start 2P', 'Monoton', 'Rye', 'Chewy'];
/** Grosor con el que se ve mejor cada fuente en subtítulos y títulos. */
export const fontWeightFor = (font: string) => (FONT_SINGLE_WEIGHT.includes(font) ? 400 : ['Oswald', 'Cormorant Garamond', 'Cinzel', 'Bodoni Moda', 'Libre Baskerville', 'Fraunces', 'Dancing Script', 'Amatic SC', 'Space Mono', 'JetBrains Mono'].includes(font) ? 700 : 800);

export function getPreset(id: string, extra: Preset[] = []): Preset {
  const found = [...extra, ...BUILTIN_PRESETS].find((x) => x.id === id);
  if (!found) throw new Error(`No existe el preset "${id}". Disponibles: ${[...extra, ...BUILTIN_PRESETS].map((x) => x.id).join(', ')}`);
  return found;
}
