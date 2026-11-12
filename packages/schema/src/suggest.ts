import type { Project, Scene, SceneVariant, Transcript } from './project.ts';
import { effectiveRanges } from './timeline.ts';

/** Lo que se dice en una escena. */
export function speechOf(scene: Scene, transcript: Transcript | null): string {
  if (!transcript) return '';
  return effectiveRanges(scene)
    .flatMap((r) => transcript.words.filter((w) => { const m = (w.start + w.end) / 2; return m >= r.start && m < r.end; }))
    .map((w) => w.text).join(' ');
}

const STOP = new Set('a al algo ante como con cual cuando de del desde donde el ella ellos en entre era es esa ese eso esta este esto hay la las le les lo los mas me mi mis muy ni no nos o para pero por que se si sin sobre su sus te ti tu tus un una uno unos y ya yo'.split(' '));
const norm = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9]/g, '');
const clean = (s: string) => s.replace(/^[\s,.;:¡!¿?"'-]+|[\s,.;:"'-]+$/g, '');

/** Frases cortas (2–6 palabras) sacadas de lo que se dijo, de la más útil a la menos. */
export function shortPhrases(speech: string): string[] {
  const clauses = speech.split(/[,.;:!?…]+/).map(clean).filter(Boolean);
  const out: string[] = [];
  const cut: string[] = []; // recortes de frases largas: van después de las frases completas
  for (const c of clauses) {
    const words = c.split(/\s+/);
    if (words.length >= 2 && words.length <= 6) out.push(c);
    else if (words.length > 6) {
      // De una frase larga se toma el tramo de 4 palabras con más palabras con significado.
      let best = 0, at = 0;
      for (let i = 0; i + 4 <= words.length; i++) {
        const score = words.slice(i, i + 4).filter((w) => !STOP.has(norm(w))).length + (i === 0 ? 0.5 : 0);
        if (score > best) { best = score; at = i; }
      }
      cut.push(clean(words.slice(at, at + 4).join(' ')));
    }
  }
  // Primero las que tienen más palabras con significado.
  const weight = (p: string) => p.split(/\s+/).filter((w) => !STOP.has(norm(w))).length / p.split(/\s+/).length;
  const byWeight = (list: string[]) => [...list].sort((a, b) => weight(b) - weight(a));
  return [...new Set([...byWeight(out), ...byWeight(cut)])];
}

/**
 * La palabra más importante de un texto corto: un número si lo hay; si no, la
 * palabra con significado más larga. Devuelve '' si no hay ninguna clara.
 */
export function keywordOf(text: string): string {
  const words = text.split(/\s+/).map(clean).filter(Boolean);
  const num = words.find((w) => /\d/.test(w));
  if (num) return num;
  const cand = words.filter((w) => !STOP.has(norm(w)) && norm(w).length >= 4);
  return cand.sort((a, b) => norm(b).length - norm(a).length)[0] ?? '';
}

/** ¿Es `word` la palabra clave `keyword`? (sin tildes ni mayúsculas) */
export const isKeyword = (word: string, keyword: string) => Boolean(keyword) && norm(word) === norm(keyword);

/** Palabras clave para buscar b-roll. */
export function keywords(speech: string, max = 4): string[] {
  const seen = new Set<string>();
  return speech.split(/\s+/).map(clean).filter((w) => {
    const n = norm(w);
    if (n.length < 5 || STOP.has(n) || seen.has(n)) return false;
    seen.add(n);
    return true;
  }).sort((a, b) => b.length - a.length).slice(0, max);
}

type Draft = Omit<SceneVariant, 'id'>;

const LOOKS: [NonNullable<SceneVariant['look']>, string][] = [['calido', 'tonos cálidos'], ['bn', 'blanco y negro'], ['contraste', 'alto contraste'], ['frio', 'tonos fríos']];
const TEXT_COLORS = ['#FACC15', '#25F4EE', '#FFFFFF', '#A78BFA', '#34D399', '#FB923C'];
const TYPO: [NonNullable<SceneVariant['textStyle']>, string, NonNullable<SceneVariant['textAnim']>, string][] = [
  ['gigante', 'Anton', 'pop', 'Palabra gigante'],
  ['marcador', 'Poppins', 'subir', 'Marcador'],
  ['degradado', 'Archivo Black', 'barrido', 'Degradado'],
  ['sombra', 'Bebas Neue', 'pop', 'Sombra retro'],
  ['contorno', 'Montserrat', 'deslizar', 'Contorno'],
  ['etiqueta', 'DM Sans', 'deslizar', 'Etiqueta'],
  ['neon', 'Space Grotesk', 'fundido', 'Neón'],
  ['subrayado', 'Oswald', 'barrido', 'Subrayado'],
];

/**
 * Cuatro variantes para una escena, una de cada tipo, para comparar de verdad:
 *   a) Motion graphics · b) B-roll · c) Color · d) Tipografía.
 * Todo sale de lo que hay: los gráficos usan las cifras y frases que se dijeron,
 * el b-roll usa los clips del proyecto (o pide uno), y los textos son frases reales.
 * `round` cambia el set (para "otras").
 */
export function suggestVariants(project: Project, scene: Scene, transcript: Transcript | null, round = 0): SceneVariant[] {
  const speech = speechOf(scene, transcript);
  const phrases = shortPhrases(speech);
  const accent = project.captions.highlightColor;
  const first = project.scenes[0]?.id === scene.id;
  const tr = (id: string) => (first ? undefined : id);
  const p0 = phrases[round % Math.max(1, phrases.length)];
  const text = scene.onScreenText ?? p0 ?? '[TU TEXTO]';
  const out: Draft[] = [];

  // a) Motion graphics: con lo que se dijo, sin inventar datos.
  const num = speech.match(/\d+(?:[.,]\d+)?/);
  const motion: Draft[] = [];
  if (num) {
    const label = clean(speech.split(/[.!?…]/).find((c) => c.includes(num[0])) ?? '').replace(num[0], '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ');
    motion.push({ label: 'Motion graphics · número animado', category: 'motion', visual: 'motion', motionTemplate: 'contador', motionData: { valor: Number(num[0].replace(',', '.')), etiqueta: label }, onScreenText: undefined, transition: tr('golpe'), notes: `El ${num[0]} que dices, grande y contando hacia arriba.` });
  }
  if (phrases.length >= 2) motion.push({ label: 'Motion graphics · lista', category: 'motion', visual: 'motion', motionTemplate: 'lista', motionData: { items: phrases.slice(0, 3) }, onScreenText: keywordOf(speech) || undefined, transition: tr('deslizar-arriba'), notes: 'Tus ideas de esta parte, entrando una por una.' });
  if (scene.role === 'cta') motion.unshift({ label: 'Motion graphics · cierre con marca', category: 'motion', visual: 'motion', motionTemplate: 'logo', motionData: { texto: text === '[TU TEXTO]' ? undefined : text }, transition: tr('destello'), notes: 'El nombre o logo de la marca con el llamado a la acción.' });
  motion.push({ label: 'Motion graphics · tarjeta de texto', category: 'motion', visual: 'texto', onScreenText: text, transition: tr('golpe'), notes: 'La frase a pantalla completa sobre el color de la marca mientras sigue el audio.' });
  out.push(motion[round % motion.length]);

  // b) B-roll: un clip del proyecto si ya hay; si no, se pide uno.
  const clips = project.assets.filter((x) => x.kind === 'broll').map((x) => x.file);
  const keys = keywords(speech);
  out.push(clips.length
    ? { label: 'B-roll', category: 'broll', visual: 'broll', brollFile: clips[round % clips.length], onScreenText: scene.onScreenText ?? p0, textStyle: 'etiqueta', transition: tr('deslizar-arriba'), notes: 'Otro video encima mientras sigue el audio, con una etiqueta de texto.' }
    : { label: 'B-roll', category: 'broll', visual: 'broll', brollFile: keys.join(' ') || 'toma de apoyo', onScreenText: scene.onScreenText ?? p0, textStyle: 'etiqueta', transition: tr('deslizar-arriba'), notes: `Falta el clip: sube uno${keys.length ? ` (ideas: ${keys.join(', ')})` : ''}.` });

  // c) Color: aspecto de la imagen y color del texto.
  const [look, lookName] = LOOKS[round % LOOKS.length];
  const tcolor = TEXT_COLORS.filter((c) => c.toUpperCase() !== accent.toUpperCase())[round % (TEXT_COLORS.length - 1)];
  out.push({ label: `Color · ${lookName}`, category: 'color', visual: 'original', look, textColor: tcolor, onScreenText: scene.onScreenText ?? p0, textStyle: scene.textStyle === 'caja' ? 'resaltado' : scene.textStyle, camera: 'acercar', notes: `Imagen en ${lookName} y el texto en ${tcolor}.` });

  // d) Tipografía: forma, letra y entrada del texto.
  const [textStyle, textFont, textAnim, typoName] = TYPO[round % TYPO.length];
  out.push({ label: `Tipografía · ${typoName}`, category: 'tipografia', visual: 'original', onScreenText: text, textStyle, textFont, textAnim, textSize: textStyle === 'etiqueta' ? 1 : 1.15, textColor: accent, notes: `${typoName} con letra ${textFont}.` });

  return out.map((v, i) => ({ ...v, id: String.fromCharCode(97 + i) }));
}

/** Aplica una variante a una escena (null = solo quita la marca de elegida). */
export function applyVariant(scene: Scene, v: SceneVariant | null) {
  if (!v) {
    scene.chosenVariant = undefined;
    return;
  }
  scene.chosenVariant = v.id;
  scene.visual = v.visual;
  if (v.onScreenText !== undefined) scene.onScreenText = v.onScreenText || undefined;
  if (v.textColor) scene.textColor = v.textColor;
  if (v.textStyle) scene.textStyle = v.textStyle;
  if (v.textPosition) scene.textPosition = v.textPosition;
  if (v.textFont) scene.textFont = v.textFont;
  if (v.textSize) scene.textSize = v.textSize;
  if (v.textAnim) scene.textAnim = v.textAnim;
  scene.textKeyword = v.textKeyword;
  // La imagen y la cámara son parte de la idea: lo que la variante no pide vuelve a lo normal.
  scene.look = v.look ?? 'normal';
  scene.camera = v.camera ?? 'ninguno';
  if (v.brollFile) scene.brollFile = v.brollFile;
  if (v.motionTemplate) scene.motionTemplate = v.motionTemplate;
  if (v.motionData) scene.motionData = v.motionData;
  if (v.punchZoom !== undefined) scene.punchZoom = v.punchZoom;
  if (v.transition !== undefined) scene.transition = v.transition && v.transition !== 'corte' ? { id: v.transition } : undefined;
}
