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
/** Palabras que no pueden abrir ni cerrar un texto en pantalla: enlaces y muletillas. */
const WEAK = new Set([...STOP, ...'aunque porque mientras tambien ademas entonces pues mismo misma cada todo toda todos todas hasta solo aqui ahi asi luego despues antes habia he ha han fue ser estar esta estoy estaba tenia tengo tiene voy va vamos puede pueden quien cuyo otro otra nunca siempre casi mucho poco tan tanto'.split(' ')]);
const LEAD = new Set('aunque pero porque pues entonces y o que ademas tambien mientras'.split(' '));
const norm = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9]/g, '');
const clean = (s: string) => s.replace(/^[\s,.;:¡!¿?"'-]+|[\s,.;:"'-]+$/g, '');

/** Frases cortas (2–6 palabras) sacadas de lo que se dijo, de la más útil a la menos. */
export function shortPhrases(speech: string): string[] {
  const clauses = speech.split(/[,.;:!?…]+/).map(clean).filter(Boolean);
  const out: string[] = [];
  const cut: string[] = []; // recortes de frases largas: van después de las frases completas
  for (const c of clauses) {
    const words = c.split(/\s+/);
    // Un conector al inicio («aunque», «pero», «porque»…) sobra en un texto en pantalla.
    while (words.length > 2 && LEAD.has(norm(words[0]))) words.shift();
    if (words.length >= 2 && words.length <= 6) out.push(words.join(' '));
    else if (words.length > 6) {
      // De una frase larga se toma un tramo de 3 a 5 palabras que se lea solo: no empieza ni
      // termina en una palabra de enlace, y se prefiere el arranque de la frase y los números.
      let best = -1, pick = '';
      for (let len = 5; len >= 3; len--) {
        for (let i = 0; i + len <= words.length; i++) {
          const w = words.slice(i, i + len);
          if (WEAK.has(norm(w[0])) || WEAK.has(norm(w[len - 1]))) continue;
          const score = w.filter((x) => !WEAK.has(norm(x))).length / len + (i === 0 ? 0.6 : 0) + (w.some((x) => /\d/.test(x)) ? 0.5 : 0) + len * 0.05;
          if (score > best) { best = score; pick = w.join(' '); }
        }
      }
      if (pick) cut.push(clean(pick));
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

const LOOKS: [NonNullable<SceneVariant['look']>, string][] = [
  ['calido', 'tonos cálidos'], ['bn', 'blanco y negro'], ['cine', 'aspecto de cine'], ['vivo', 'colores vivos'], ['dramatico', 'dramático'],
  ['frio', 'tonos fríos'], ['vintage', 'aire antiguo'], ['contraste', 'alto contraste'], ['suave', 'suave y luminoso'],
];
const TEXT_COLORS = ['#FACC15', '#25F4EE', '#FFFFFF', '#A78BFA', '#34D399', '#FB923C', '#F472B6'];
const TYPO: [NonNullable<SceneVariant['textStyle']>, string, NonNullable<SceneVariant['textAnim']>, string][] = [
  ['gigante', 'Anton', 'pop', 'Palabra gigante'],
  ['cinta', 'Poppins', 'rebote', 'Tiras de color'],
  ['degradado', 'Archivo Black', 'barrido', 'Degradado'],
  ['sello', 'Bebas Neue', 'zoom', 'Sello'],
  ['trazo', 'Caveat', 'palabra', 'Rodeado a mano'],
  ['glitch', 'Teko', 'girar', 'Glitch'],
  ['marcador', 'Permanent Marker', 'subir', 'Marcador a mano'],
  ['apilado', 'League Spartan', 'deslizar', 'Palabras apiladas'],
  ['sombra', 'Bangers', 'rebote', 'Sombra de cómic'],
  ['neon', 'Righteous', 'desenfoque', 'Neón'],
  ['subrayado', 'Playfair Display', 'fundido', 'Elegante subrayado'],
  ['etiqueta', 'Sora', 'maquina', 'Etiqueta que se escribe'],
  ['contorno', 'Barlow Condensed', 'zoom', 'Contorno'],
  ['tresd', 'Archivo Black', 'golpe', 'Letras 3D con golpe'],
  ['fuego', 'Anton', 'elastico', 'Fuego'],
  ['cromado', 'Kanit', 'voltear', 'Cromado que se voltea'],
  ['burbuja', 'Bangers', 'caer', 'Burbuja de cómic'],
  ['retro', 'Righteous', 'cortina', 'Retro en capas'],
  ['resplandor', 'Sora', 'estirar', 'Resplandor'],
];
const CAMS: [NonNullable<SceneVariant['camera']>, number, number, string][] = [
  ['acercar', 0.2, 0.35, 'La cámara se acerca despacio, con los bordes oscurecidos: foco en ti.'],
  ['pulso', 0.16, 0, 'Golpes de zoom al ritmo: energía.'],
  ['derecha', 0.14, 0, 'Paneo lento hacia la derecha: sensación de recorrido.'],
  ['temblor', 0.12, 0.2, 'Cámara en mano con un leve temblor: se siente real.'],
  ['alejar', 0.22, 0, 'La cámara se aleja y revela la escena.'],
  ['arriba', 0.14, 0.3, 'Paneo hacia arriba con bordes oscuros: cinematográfico.'],
];

const firstWords = (c: string, n: number) => clean(c.split(/\s+/).slice(0, n).join(' '));

/**
 * Todos los motion graphics que se pueden armar con lo que se dice en una
 * escena. Cada uno se llena con las palabras, cifras y frases reales: no se
 * inventa ningún dato. Van del más específico al más general.
 */
export function motionIdeas(speech: string, scene: Scene, first: boolean): Draft[] {
  const tr = (id: string) => (first ? undefined : id);
  const phrases = shortPhrases(speech);
  const clauses = speech.split(/[,.;:!?…]+/).map(clean).filter((c) => c.split(/\s+/).length >= 2);
  const text = scene.onScreenText ?? phrases[0];
  const out: Draft[] = [];
  const add = (label: string, motionTemplate: string, motionData: Record<string, unknown>, notes: string, extra: Partial<Draft> = {}) =>
    out.push({ label: `Gráfico animado · ${label}`, category: 'motion', visual: 'motion', motionTemplate, motionData, transition: tr('golpe'), notes, ...extra });

  const question = speech.match(/¿[^?]{4,90}\?/)?.[0] ?? (/\?\s*$/.test(speech.trim()) ? clean(clauses[clauses.length - 1] ?? '') + '?' : null);
  if (question) add('pregunta', 'pregunta', { pregunta: question }, 'Tu pregunta en grande con un signo animado. Engancha.');

  const pct = speech.match(/(\d+(?:[.,]\d+)?)\s*(?:%|por ciento)/);
  const num = speech.match(/\d+(?:[.,]\d+)?/);
  const labelFor = (n: string) => firstWords((speech.split(/[.!?…]/).find((c) => c.includes(n)) ?? '').replace(n, '').replace(/%|por ciento/, ''), 5);
  if (pct) add('porcentaje', 'porcentaje', { valor: Number(pct[1].replace(',', '.')), etiqueta: labelFor(pct[1]) }, `El ${pct[1]} % que dices, en un anillo que se llena.`);
  else if (num) add('número animado', 'contador', { valor: Number(num[0].replace(',', '.')), etiqueta: labelFor(num[0]) }, `El ${num[0]} que dices, grande y contando hacia arriba.`);

  // Contraste: "antes… ahora", "sin… con", "no… sino".
  const a = clauses.find((c) => /\b(antes|sin|no)\b/i.test(c));
  const b = clauses.find((c) => c !== a && /\b(ahora|despues|después|con|sino|pero)\b/i.test(c));
  if (a && b) add('antes y después', 'comparacion', { izquierda: firstWords(a, 6), derecha: firstWords(b.replace(/^(pero|sino)\s+/i, ''), 6) }, 'Dos columnas que contrastan lo que dices: lo malo y lo bueno.', { transition: tr('deslizar-arriba') });

  if (phrases.length >= 2) {
    const items = phrases.slice(0, 4);
    if (/\b(primero|segundo|tercero|paso|pasos|luego|despues|después)\b/i.test(speech)) add('pasos', 'pasos', { items }, 'Tus pasos numerados, avanzando uno por uno.', { transition: tr('deslizar-arriba') });
    add('lista con vistos', 'checklist', { items }, 'Tus ideas con un visto que se marca en cada una.', { transition: tr('deslizar-arriba') });
    add('lista', 'lista', { items: items.slice(0, 3) }, 'Tus ideas de esta parte, entrando una por una.', { transition: tr('deslizar-arriba'), onScreenText: keywordOf(speech) || undefined });
  }
  if (speech) {
    add('palabras en movimiento', 'palabras', {}, 'Cada palabra aparece enorme justo cuando la dices. Muy llamativo.');
    const quote = clauses.find((c) => c.split(/\s+/).length <= 10) ?? firstWords(speech, 10);
    if (quote) add('frase destacada', 'cita', { texto: quote }, 'Tu frase como una cita, con comillas grandes.', { transition: tr('fundido') });
  }
  if (scene.role === 'cta') out.unshift({ label: 'Gráfico animado · cierre con marca', category: 'motion', visual: 'motion', motionTemplate: 'logo', motionData: { texto: text }, transition: tr('destello'), notes: 'El nombre o logo de la marca con el llamado a la acción.' });
  out.push({ label: 'Gráfico animado · tarjeta de texto', category: 'motion', visual: 'texto', onScreenText: text, transition: tr('golpe'), notes: 'La frase a pantalla completa sobre el color de la marca mientras sigue el audio.' });
  return out;
}

/** Galería completa de motion graphics para una escena (ids m1, m2…). */
export function motionGallery(project: Project, scene: Scene, transcript: Transcript | null): SceneVariant[] {
  return motionIdeas(speechOf(scene, transcript), scene, project.scenes[0]?.id === scene.id).map((v, i) => ({ ...v, id: `m${i + 1}` }));
}

/**
 * Cinco variantes para una escena, una de cada tipo, para comparar de verdad:
 *   a) Motion graphics · b) B-roll · c) Color · d) Tipografía · e) Cámara.
 * Todo sale de lo que hay: los gráficos usan las cifras y frases que se dijeron,
 * el b-roll usa los clips del proyecto (o pide uno), y los textos son frases reales.
 * `round` cambia el set (para "otras").
 */
export function suggestVariants(project: Project, scene: Scene, transcript: Transcript | null, round = 0, seenLook?: string | null): SceneVariant[] {
  const speech = speechOf(scene, transcript);
  const phrases = shortPhrases(speech);
  const accent = project.captions.highlightColor;
  const first = project.scenes[0]?.id === scene.id;
  const tr = (id: string) => (first ? undefined : id);
  const p0 = phrases[round % Math.max(1, phrases.length)];
  const text = scene.onScreenText ?? p0;
  const out: Draft[] = [];

  // a) Motion graphics: con lo que se dijo, sin inventar datos.
  const motion = motionIdeas(speech, scene, first);
  out.push(motion[round % motion.length]);

  // b) B-roll: un clip del proyecto si ya hay; si no, se pide uno.
  const clips = project.assets.filter((x) => x.kind === 'broll').map((x) => x.file);
  const keys = keywords(speech);
  out.push(clips.length
    ? { label: 'B-roll', category: 'broll', visual: 'broll', brollFile: clips[round % clips.length], onScreenText: scene.onScreenText ?? p0, textStyle: 'etiqueta', transition: tr('deslizar-arriba'), notes: 'Otro video encima mientras sigue el audio, con una etiqueta de texto.' }
    : { label: 'B-roll', category: 'broll', visual: 'broll', brollFile: keys.join(' ') || 'toma de apoyo', onScreenText: scene.onScreenText ?? p0, textStyle: 'etiqueta', transition: tr('deslizar-arriba'), notes: `Falta el clip: sube uno${keys.length ? ` (ideas: ${keys.join(', ')})` : ''}.` });

  // c) Color: aspecto de la imagen y color del texto.
  // Si la app vio de qué trata el video, el primer aspecto que propone es el que le va.
  const order = seenLook ? [...LOOKS.filter(([id]) => id === seenLook), ...LOOKS.filter(([id]) => id !== seenLook)] : LOOKS;
  const [look, lookName] = order[round % order.length];
  const tcolor = TEXT_COLORS.filter((c) => c.toUpperCase() !== accent.toUpperCase())[round % 6];
  out.push({ label: `Color · ${lookName}`, category: 'color', visual: 'original', look, textColor: tcolor, onScreenText: scene.onScreenText ?? p0, textStyle: scene.textStyle === 'caja' ? 'resaltado' : scene.textStyle, camera: 'acercar', notes: `Imagen en ${lookName} y el texto en ${tcolor}.` });

  // d) Tipografía: forma, letra y entrada del texto.
  const [textStyle, textFont, textAnim, typoName] = TYPO[round % TYPO.length];
  out.push({ label: `Tipografía · ${typoName}`, category: 'tipografia', visual: 'original', onScreenText: text, textStyle, textFont, textAnim, textSize: textStyle === 'etiqueta' ? 1 : 1.15, textColor: accent, notes: `${typoName} con letra ${textFont}.` });

  // e) Cámara: cómo se mueve la toma.
  const [camera, cameraAmount, vignette, camWhy] = CAMS[round % CAMS.length];
  out.push({ label: `Cámara · ${({ acercar: 'se acerca', alejar: 'se aleja', derecha: 'paneo', arriba: 'paneo vertical', pulso: 'pulso', temblor: 'en mano', orbita: 'órbita', foco: 'cambio de foco' } as Record<string, string>)[camera]}`, category: 'camara', visual: 'original', camera, cameraAmount, vignette, onScreenText: scene.onScreenText, notes: camWhy });

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
  scene.cameraAmount = v.cameraAmount ?? 0.14;
  scene.vignette = v.vignette ?? 0;
  if (v.brollFile) scene.brollFile = v.brollFile;
  if (v.motionTemplate) scene.motionTemplate = v.motionTemplate;
  if (v.motionData) scene.motionData = v.motionData;
  if (v.punchZoom !== undefined) scene.punchZoom = v.punchZoom;
  if (v.transition !== undefined) scene.transition = v.transition && v.transition !== 'corte' ? { id: v.transition } : undefined;
}
