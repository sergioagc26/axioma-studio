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

/**
 * Tres variantes al instante para una escena. Cada una es una IDEA completa
 * (texto + forma del texto + cámara + color de imagen), no un ajuste suelto,
 * y depende de lo que se dice, del papel de la escena y del estilo del reel.
 * No inventa contenido: los textos salen de lo que dijo la persona y los datos
 * que falten quedan como [DATO]. `round` cambia el set (para "otras 3").
 */
export function suggestVariants(project: Project, scene: Scene, transcript: Transcript | null, round = 0): SceneVariant[] {
  const speech = speechOf(scene, transcript);
  const phrases = shortPhrases(speech);
  const accent = project.captions.highlightColor;
  const fast = project.kind === 'montaje' || project.pacing.maxPause <= 0.22;
  const first = project.scenes[0]?.id === scene.id;
  const tr = (id: string) => (first ? undefined : id);
  const pool: Draft[] = [];
  const p0 = phrases[round % Math.max(1, phrases.length)];
  const p1 = phrases[(round + 1) % Math.max(1, phrases.length)];

  if (project.kind === 'montaje' || !speech) {
    // Sin voz: la idea está en cómo se ve y se mueve la toma.
    const txt = scene.onScreenText ?? '[TU TEXTO]';
    pool.push(
      { label: 'Acercamiento lento', visual: 'original', camera: 'acercar', look: 'normal', punchZoom: false, onScreenText: '', notes: 'La cámara se acerca despacio durante la toma. Da intención sin distraer.' },
      { label: 'Blanco y negro con golpe', visual: 'original', look: 'bn', punchZoom: true, transition: tr('golpe'), onScreenText: '', notes: 'Imagen en blanco y negro que entra con un golpe. Dramático, para el esfuerzo.' },
      { label: 'Título gigante', visual: 'original', onScreenText: txt, textStyle: 'gigante', textColor: accent, textPosition: 'centro', camera: 'alejar', notes: 'Una palabra enorme sobre la toma mientras la cámara se aleja. Escribe tu texto.' },
      { label: 'Cinemático cálido', visual: 'original', look: 'calido', camera: 'alejar', punchZoom: false, onScreenText: '', notes: 'Tonos cálidos y la cámara alejándose. Para comida y momentos de calma.' },
      { label: 'Alto contraste con destello', visual: 'original', look: 'contraste', punchZoom: true, transition: tr('destello'), onScreenText: '', notes: 'Colores fuertes y un destello al entrar. Para el momento más potente.' },
      { label: 'Rótulo en banda', visual: 'original', onScreenText: txt, textStyle: 'banda', textColor: accent, look: 'normal', notes: 'Una banda de color con el texto, como un titular. Escribe tu texto.' },
      { label: 'Frío y limpio', visual: 'original', look: 'frio', camera: 'acercar', onScreenText: '', notes: 'Tonos fríos, sin texto. Para producto y tecnología.' },
    );
  } else {
    if (p0) pool.push({ label: 'Palabra clave gigante', visual: 'original', onScreenText: p0, textStyle: 'gigante', textColor: accent, punchZoom: fast, notes: `La palabra más importante («${keywordOf(p0) || p0}») enorme, y el resto pequeño encima.` });
    if (p0) pool.push({ label: 'Marcador sobre la clave', visual: 'original', onScreenText: p1 && p1 !== p0 ? p1 : p0, textStyle: 'marcador', textColor: accent, camera: 'acercar', notes: 'Un trazo de marcador pinta la palabra clave mientras la cámara se acerca.' });
    pool.push({ label: 'Limpio y cercano', visual: 'original', onScreenText: '', camera: 'acercar', look: 'normal', punchZoom: false, notes: 'Sin texto: solo tú, los subtítulos y un acercamiento lento. Para decir algo personal.' });
    if (p0) pool.push({ label: 'Tarjeta de texto', visual: 'texto', onScreenText: p0, transition: tr('golpe'), notes: 'La frase ocupa toda la pantalla mientras sigue tu voz. Corta la monotonía.' });
    if (p0) pool.push({ label: 'Blanco y negro dramático', visual: 'original', look: 'bn', onScreenText: p0, textStyle: 'resaltado', textColor: accent, punchZoom: true, notes: 'Imagen en blanco y negro con la palabra clave en color. Para el problema o un momento serio.' });
    const keys = keywords(speech);
    if (keys.length) pool.push({ label: 'B-roll con titular', visual: 'broll', brollFile: keys.join(' '), onScreenText: p0, textStyle: 'banda', transition: tr('deslizar-arriba'), notes: `Otro video encima con una banda de titular. Búsqueda: ${keys.join(', ')}.` });
    if (p0) pool.push({ label: 'Subrayado elegante', visual: 'original', onScreenText: p1 && p1 !== p0 ? p1 : p0, textStyle: 'subrayado', textColor: '#FFFFFF', look: 'calido', notes: 'Texto blanco con la clave subrayada y tonos cálidos. Sobrio y profesional.' });
    if (p0) pool.push({ label: 'Neón', visual: 'original', onScreenText: p0, textStyle: 'neon', textColor: accent, look: 'contraste', notes: 'Texto con brillo de neón y más contraste. Para un tono nocturno o tecnológico.' });

    // Según el papel de la escena, la idea que mejor le va, primero.
    if (scene.role === 'cta') pool.unshift({ label: 'Cierre con la marca', visual: 'motion', motionTemplate: 'logo', onScreenText: p0, transition: 'destello', notes: 'Logo o nombre de la marca con el llamado a la acción.' });
    else if (scene.role === 'prueba' || /\d/.test(speech)) pool.unshift({ label: 'Dato grande', visual: 'motion', motionTemplate: 'contador', onScreenText: p0, notes: 'Un número grande animado. Pon tu dato real: se ve [DATO] hasta que lo pongas.' });
    else if (scene.role === 'beneficio' || scene.role === 'demostracion') pool.unshift({ label: 'Lista de puntos', visual: 'motion', motionTemplate: 'lista', onScreenText: p0, notes: 'Los puntos uno por uno. Escribe tus puntos reales.' });
    else if (scene.role === 'problema' && p0) pool.unshift(...pool.splice(pool.findIndex((x) => x.label === 'Blanco y negro dramático'), 1));
  }

  // Tres distintas: se rota el orden según la ronda.
  const rotated = pool.map((_, i) => pool[(i + round * 3) % pool.length]);
  const picked: Draft[] = [];
  for (const v of rotated) {
    if (picked.length >= 3) break;
    if (!picked.some((x) => x.label === v.label)) picked.push(v);
  }
  return picked.map((v, i) => ({ ...v, id: String.fromCharCode(97 + i) }));
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
  scene.textKeyword = v.textKeyword;
  // La imagen y la cámara son parte de la idea: lo que la variante no pide vuelve a lo normal.
  scene.look = v.look ?? 'normal';
  scene.camera = v.camera ?? 'ninguno';
  if (v.brollFile) scene.brollFile = v.brollFile;
  if (v.motionTemplate) scene.motionTemplate = v.motionTemplate;
  if (v.punchZoom !== undefined) scene.punchZoom = v.punchZoom;
  if (v.transition !== undefined) scene.transition = v.transition && v.transition !== 'corte' ? { id: v.transition } : undefined;
}
