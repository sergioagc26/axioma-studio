import { FONT_FAMILIES } from '@axioma/schema';

/**
 * La marca escrita como la escribe una persona en el pedido («azul oscuro y dorado», «letra
 * Montserrat», «somos un gym», «elegante»): se pasa a lo que entiende el kit de marca.
 * Lo que no se entiende no se inventa: queda vacío y la app (o Claude) lo pregunta.
 */
export interface OrderBrand {
  /** Colores en hexadecimal, en el orden en que se escribieron (el primero es el principal). */
  colors: string[];
  /** Tipografías de la lista de la app, en el orden en que se escribieron. */
  fonts: string[];
  sector?: string;
  personality?: string;
  /** Enlaces de videos que le gustan (Instagram, TikTok, YouTube…): se analiza su estilo. */
  references: string[];
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Nombres de color en español (y algunos en inglés), los compuestos primero. */
const COLOR_NAMES: [string, string][] = [
  ['azul oscuro', '#0B2A5B'], ['azul marino', '#0B2A5B'], ['azul rey', '#1E3FAE'], ['azul claro', '#6EC1FF'],
  ['verde oscuro', '#1B5E20'], ['verde limon', '#9BE31E'], ['verde menta', '#7FE0C0'], ['verde oliva', '#6B7A2A'],
  ['rojo oscuro', '#8E1B1B'], ['rosa palo', '#F2C4CE'], ['gris oscuro', '#3A3D44'], ['gris claro', '#D5D8DE'],
  ['vino tinto', '#7A1530'], ['vinotinto', '#7A1530'],
  ['rojo', '#E53935'], ['azul', '#1E63D6'], ['celeste', '#4FC3F7'], ['verde', '#2E9E44'], ['amarillo', '#FFD200'],
  ['naranja', '#FF7A00'], ['anaranjado', '#FF7A00'], ['morado', '#7B3FBF'], ['violeta', '#8E5CE0'], ['lila', '#B79CED'],
  ['purpura', '#6A1B9A'], ['rosado', '#FF4F9A'], ['rosa', '#FF4F9A'], ['fucsia', '#E6007E'], ['magenta', '#E6007E'],
  ['negro', '#111111'], ['blanco', '#FFFFFF'], ['gris', '#8A8F98'], ['dorado', '#D4A537'], ['oro', '#D4A537'],
  ['plateado', '#C0C4CC'], ['cafe', '#6D4C33'], ['marron', '#6D4C33'], ['beige', '#E8D9BF'], ['crema', '#F3E9D2'],
  ['turquesa', '#1BB5B0'], ['aguamarina', '#3FD0C9'], ['coral', '#FF6F61'], ['salmon', '#FA8072'], ['terracota', '#C4643A'],
  ['mostaza', '#D8A31A'], ['vino', '#7A1530'], ['cyan', '#00BCD4'],
  ['black', '#111111'], ['white', '#FFFFFF'], ['red', '#E53935'], ['blue', '#1E63D6'], ['green', '#2E9E44'], ['yellow', '#FFD200'], ['gold', '#D4A537'],
];

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

/** Colores escritos con código (#1E63D6) o con nombre («azul oscuro y dorado»), sin repetir. */
export function parseColors(text: string): string[] {
  const t = norm(text);
  const hits: { at: number; hex: string }[] = [];
  for (const m of t.matchAll(HEX)) {
    const h = m[0].length === 4 ? `#${[...m[0].slice(1)].map((c) => c + c).join('')}` : m[0];
    hits.push({ at: m.index!, hex: h.toUpperCase() });
  }
  // Nombres: el más largo primero; lo ya tomado por uno compuesto («azul oscuro») no cuenta otra vez como «azul».
  const taken: [number, number][] = [];
  for (const [name, hex] of [...COLOR_NAMES].sort((a, b) => b[0].length - a[0].length)) {
    for (const m of t.matchAll(new RegExp(`\\b${name}s?\\b`, 'g'))) {
      const a = m.index!, b = a + m[0].length;
      if (taken.some(([x, y]) => a < y && b > x)) continue;
      taken.push([a, b]);
      hits.push({ at: a, hex });
    }
  }
  return [...new Set(hits.sort((a, b) => a.at - b.at).map((h) => h.hex))];
}

/** Tipografías de la lista de la app que se nombran en el texto, en su orden. */
export function parseFonts(text: string): string[] {
  const t = norm(text);
  const hits: { at: number; font: string }[] = [];
  const taken: [number, number][] = [];
  for (const font of [...FONT_FAMILIES].sort((a, b) => b.length - a.length)) {
    const i = t.indexOf(norm(font));
    if (i < 0 || taken.some(([x, y]) => i < y && i + font.length > x)) continue;
    taken.push([i, i + font.length]);
    hits.push({ at: i, font });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.font);
}

const SECTORS: [RegExp, string][] = [
  [/gym|gimnasio|crossfit|entrena|fitness|deporte|spinning|box(eo)?\b|yoga|pilates/, 'gimnasio'],
  [/comida rapida|hamburgues|perro caliente|pizza|salchipapa|mazorcada|asadero|fritos/, 'comida-rapida'],
  [/restaurante|cafe(teria)?\b|panaderia|pasteleria|reposteria|\bbar\b|cocina/, 'restaurante'],
  [/moda|ropa|boutique|belleza|maquillaje|peluqueria|barberia|manicure|estetica|\bspa\b|joyeria|calzado|zapatos/, 'moda'],
  [/tecnologia|software|\bapps?\b|celulares|computador|digital|\bia\b|inteligencia artificial/, 'tecnologia'],
  [/educacion|academia|curso|colegio|clases|ensenanza|tutor|idiomas|universidad/, 'educacion'],
  [/salud|clinica|medic|odontolog|dental|nutricion|psicolog|fisioterapia|farmacia/, 'salud'],
  [/inmobiliaria|finca raiz|bienes raices|apartamentos|arriendo|casas en venta/, 'inmobiliaria'],
  [/entretenimiento|eventos|musica|fiesta|discoteca|juegos|\bcine\b/, 'entretenimiento'],
  [/abogad|contador|contabilidad|consultor|asesor|seguros|servicios/, 'servicios'],
  [/negocio|emprend|empresa|ventas|tienda|comercio|mayorista/, 'negocios'],
];

const PERSONALITIES: [RegExp, string][] = [
  [/energ|motiv|intens|fuerte|potente/, 'energica'],
  [/divert|chistos|alegre|jocos|humor|relajad/, 'divertida'],
  [/elegan|lujo|premium|sofistic|\bfina?\b|exclusiv/, 'elegante'],
  [/cercan|amable|familiar|calid|amig|humilde/, 'cercana'],
  [/seri|formal|profesional|sobri|tecnic|confiable/, 'seria'],
  [/rebeld|atrevid|irreverent|disruptiv|urbano|calle/, 'rebelde'],
];

export function parseSector(text: string): string | undefined {
  const t = norm(text);
  return SECTORS.find(([re]) => re.test(t))?.[1];
}

export function parsePersonality(text: string): string | undefined {
  const t = norm(text);
  return PERSONALITIES.find(([re]) => re.test(t))?.[1];
}

/** Enlaces de video (no de carpetas de material) que se escribieron como referencia. */
export function parseReferenceLinks(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/[^\s,;)>\]]+/gi) ?? []).map((u) => u.replace(/[.]+$/, '')))];
}
