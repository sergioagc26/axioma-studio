import type { BrandKit, CaptionStyle, Preset } from './project.ts';

export const SECTORS: [string, string][] = [
  ['gimnasio', 'Gimnasio y deporte'], ['comida-rapida', 'Comida rápida'], ['restaurante', 'Restaurante y café'],
  ['moda', 'Moda y belleza'], ['tecnologia', 'Tecnología y software'], ['educacion', 'Educación y cursos'],
  ['salud', 'Salud y bienestar'], ['negocios', 'Negocios y marketing'], ['inmobiliaria', 'Inmobiliaria y hogar'],
  ['entretenimiento', 'Entretenimiento y eventos'], ['servicios', 'Servicios profesionales'], ['otro', 'Otro'],
];
export const PERSONALITIES: [string, string][] = [
  ['energica', 'Enérgica'], ['divertida', 'Divertida'], ['elegante', 'Elegante'], ['cercana', 'Cercana'], ['seria', 'Seria'], ['rebelde', 'Rebelde'],
];

type Look = { captions: Partial<CaptionStyle>; style: NonNullable<Preset['style']>; colors: [string, string]; why: string };

/** Cómo se ve cada sector: subtítulos, títulos, letra, imagen y colores de partida. */
const BY_SECTOR: Record<string, Look> = {
  gimnasio: { colors: ['#FF2D2D', '#FACC15'], why: 'palabras enormes e inclinadas, alto contraste y destellos: fuerza',
    captions: { design: 'impacto', fontFamily: 'Anton', fontWeight: 400, fontSize: 92, wordsPerLine: 2, uppercase: true },
    style: { textStyle: 'sombra', textFont: 'Anton', textAnim: 'pop', look: 'contraste', transitions: true, flashes: true, sfxAuto: true } },
  'comida-rapida': { colors: ['#FF3B1F', '#FFC700'], why: 'tiras de color torcidas, tonos cálidos y entradas que saltan: antojo y diversión',
    captions: { design: 'cinta', fontFamily: 'Poppins', fontWeight: 800, fontSize: 78, wordsPerLine: 3, uppercase: true },
    style: { textStyle: 'cinta', textFont: 'Poppins', textAnim: 'pop', look: 'calido', transitions: true, sfxAuto: true } },
  restaurante: { colors: ['#E8C07A', '#FFFFFF'], why: 'letra fina en cursiva, tonos cálidos y fundidos: se saborea despacio',
    captions: { design: 'elegante', fontSize: 70, wordsPerLine: 4, mode: 'phrase', emphasis: false },
    style: { textStyle: 'subrayado', textFont: 'Playfair Display', textAnim: 'fundido', look: 'calido', camera: 'acercar', transitions: true, sfxAuto: false } },
  moda: { colors: ['#FFFFFF', '#E7B8C8'], why: 'cursiva elegante, palabras apiladas y cámara lenta: estilo editorial',
    captions: { design: 'elegante', fontSize: 68, wordsPerLine: 3, emphasis: true },
    style: { textStyle: 'apilado', textFont: 'DM Sans', textAnim: 'fundido', look: 'normal', camera: 'acercar', transitions: true, sfxAuto: false } },
  tecnologia: { colors: ['#25F4EE', '#A78BFA'], why: 'brillo de neón, degradados y efecto glitch: se siente digital',
    captions: { design: 'neon', fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 76, wordsPerLine: 3, uppercase: false },
    style: { textStyle: 'glitch', textFont: 'Space Grotesk', textAnim: 'barrido', look: 'frio', transitions: true, sfxAuto: true } },
  educacion: { colors: ['#34D399', '#FACC15'], why: 'bloques claros, la idea clave rodeada a mano y ritmo que respira: se entiende',
    captions: { design: 'bloque', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 68, wordsPerLine: 4 },
    style: { textStyle: 'trazo', textFont: 'DM Sans', textAnim: 'subir', look: 'normal', transitions: true, sfxAuto: false } },
  salud: { colors: ['#5EEAD4', '#FFFFFF'], why: 'limpio y suave, etiquetas discretas y tonos frescos: da confianza',
    captions: { design: 'clasico', effect: 'subrayado', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 66, wordsPerLine: 4, uppercase: false },
    style: { textStyle: 'etiqueta', textFont: 'DM Sans', textAnim: 'fundido', look: 'frio', camera: 'acercar', transitions: true, sfxAuto: false } },
  negocios: { colors: ['#FACC15', '#FFFFFF'], why: 'palabras grandes con golpe y marcador amarillo: directo y con autoridad',
    captions: { design: 'impacto', fontFamily: 'Montserrat', fontWeight: 800, fontSize: 80, wordsPerLine: 3, uppercase: true },
    style: { textStyle: 'marcador', textFont: 'Montserrat', textAnim: 'pop', look: 'normal', transitions: true, sfxAuto: true } },
  inmobiliaria: { colors: ['#D4AF37', '#FFFFFF'], why: 'sobrio, con banda de titular y cámara que se acerca: se ve de valor',
    captions: { design: 'clasico', effect: 'color', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 64, wordsPerLine: 4, uppercase: false },
    style: { textStyle: 'banda', textFont: 'DM Sans', textAnim: 'deslizar', look: 'calido', camera: 'acercar', transitions: true, sfxAuto: false } },
  entretenimiento: { colors: ['#FF2D95', '#25F4EE'], why: 'tiras de color, sellos y efecto glitch: fiesta y movimiento',
    captions: { design: 'cinta', fontFamily: 'Archivo Black', fontWeight: 400, fontSize: 76, wordsPerLine: 3, uppercase: true },
    style: { textStyle: 'sello', textFont: 'Archivo Black', textAnim: 'pop', look: 'contraste', transitions: true, flashes: true, sfxAuto: true } },
  servicios: { colors: ['#3B82F6', '#FFFFFF'], why: 'bloques ordenados y títulos subrayados: profesional y claro',
    captions: { design: 'bloque', fontFamily: 'Inter', fontWeight: 800, fontSize: 66, wordsPerLine: 4, uppercase: false },
    style: { textStyle: 'subrayado', textFont: 'Inter', textAnim: 'subir', look: 'normal', transitions: true, sfxAuto: false } },
};

/**
 * Estilo que le corresponde a una marca según su sector y su personalidad.
 * La personalidad matiza el sector (una marca elegante no usa destellos; una
 * rebelde lleva glitch). Si la marca ya exportó varias veces con un diseño,
 * ese diseño aprendido manda. Devuelve null si la marca no tiene sector.
 */
export function brandStyle(kit: BrandKit | null): (Look & { captions: Partial<CaptionStyle> }) | null {
  const base = kit?.sector ? BY_SECTOR[kit.sector] : undefined;
  if (!kit || !base) return null;
  const captions = { ...base.captions, highlightColor: kit.colors.primary, color: kit.colors.text };
  const style = { ...base.style };
  let why = base.why;
  switch (kit.personality) {
    case 'elegante': Object.assign(captions, { design: 'elegante', uppercase: false }); Object.assign(style, { textAnim: 'fundido', flashes: false, sfxAuto: false, camera: 'acercar' }); why += '; por ser elegante, sin destellos y con cursiva'; break;
    case 'divertida': Object.assign(style, { textAnim: 'pop', sfxAuto: true }); if (captions.design === 'clasico') captions.design = 'cinta'; why += '; por ser divertida, todo entra saltando'; break;
    case 'rebelde': Object.assign(style, { textStyle: 'glitch', look: 'contraste', flashes: true }); why += '; por ser rebelde, glitch y alto contraste'; break;
    case 'seria': Object.assign(captions, { design: captions.design === 'cinta' ? 'bloque' : captions.design }); Object.assign(style, { flashes: false, sfxAuto: false, textAnim: 'subir' }); why += '; por ser seria, sin efectos de más'; break;
    case 'cercana': Object.assign(style, { look: 'calido', camera: 'acercar' }); why += '; por ser cercana, tonos cálidos y la cámara acercándose'; break;
    case 'energica': Object.assign(style, { sfxAuto: true, textAnim: 'pop' }); break;
  }
  // Lo aprendido: el diseño de subtítulos con el que más se ha exportado (3 veces o más).
  const top = Object.entries(kit.learned ?? {}).filter(([k]) => k.startsWith('design:')).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) { captions.design = top[0].slice(7) as CaptionStyle['design']; why += `; ya exportaste ${top[1]} veces con este diseño de subtítulos`; }
  const title = Object.entries(kit.learned ?? {}).filter(([k]) => k.startsWith('titulo:')).sort((a, b) => b[1] - a[1])[0];
  if (title && title[1] >= 3) style.textStyle = title[0].slice(7) as NonNullable<Preset['style']>['textStyle'];
  return { captions, style, colors: base.colors, why };
}
