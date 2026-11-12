import type { Project, Scene, SceneVariant, Transcript } from './project.ts';

/** Lo que se dice en una escena. */
export function speechOf(scene: Scene, transcript: Transcript | null): string {
  if (!transcript) return '';
  return scene.ranges
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
 * Tres variantes al instante para una escena, según lo que se dice, el papel
 * de la escena y el estilo del reel. No inventa contenido: los textos salen de
 * lo que dijo la persona y los datos que falten quedan como [DATO].
 * `round` cambia el set (para "otras 3").
 */
export function suggestVariants(project: Project, scene: Scene, transcript: Transcript | null, round = 0): SceneVariant[] {
  const speech = speechOf(scene, transcript);
  const phrases = shortPhrases(speech);
  const accent = project.captions.highlightColor;
  const fast = project.kind === 'montaje' || project.pacing.maxPause <= 0.22;
  const calm = project.pacing.maxPause > 0.42;
  const first = project.scenes[0]?.id === scene.id;
  const pool: Draft[] = [];
  const phrase = (i: number) => phrases[(i + round) % Math.max(1, phrases.length)];

  if (project.kind === 'montaje' || !speech) {
    // Sin voz: se juega con el movimiento y la entrada del corte.
    pool.push(
      { label: 'Con zoom de golpe', visual: 'original', punchZoom: true, transition: first ? undefined : 'golpe', notes: 'Entra con un pequeño rebote y zoom. Da energía.' },
      { label: 'Entrada con barrido', visual: 'original', punchZoom: false, transition: first ? undefined : 'giro', notes: 'Barrido rápido desde el corte anterior.' },
      { label: 'Con texto encima', visual: 'original', onScreenText: scene.onScreenText ?? '[TU TEXTO]', textColor: accent, notes: 'Un rótulo corto sobre la toma. Escribe tu texto.' },
      { label: 'Limpio, sin efectos', visual: 'original', punchZoom: false, onScreenText: '', notes: 'Corte seco, sin zoom ni texto.' },
      { label: 'Entrada con destello', visual: 'original', punchZoom: true, transition: first ? undefined : 'destello', notes: 'Un golpe de luz marca el cambio.' },
      { label: 'Deslizar desde abajo', visual: 'original', transition: first ? undefined : 'deslizar-arriba', notes: 'La toma sube desde abajo.' },
    );
  } else {
    const p0 = phrase(0);
    const p1 = phrase(1);
    if (p0) pool.push({ label: 'Texto destacado', visual: 'original', onScreenText: p0, textColor: accent, punchZoom: fast, notes: 'La frase clave arriba, en el color de la marca.' });
    if (p1 && p1 !== p0) pool.push({ label: 'Otra frase clave', visual: 'original', onScreenText: p1, textColor: '#FFFFFF', notes: 'Resalta otra parte de lo que dices, en blanco.' });
    pool.push({ label: 'Sobrio, sin texto', visual: 'original', onScreenText: '', punchZoom: false, transition: !first && calm ? 'fundido' : undefined, notes: 'Solo tú y los subtítulos. Deja respirar.' });
    if (p0) pool.push({ label: 'Tarjeta de texto', visual: 'texto', onScreenText: p0, transition: first ? undefined : 'golpe', notes: 'La frase ocupa toda la pantalla mientras sigue tu voz.' });
    const keys = keywords(speech);
    if (keys.length) pool.push({ label: 'B-roll', visual: 'broll', brollFile: keys.join(' '), onScreenText: p0, transition: first ? undefined : 'deslizar-arriba', notes: `Otro video encima mientras hablas. Búsqueda: ${keys.join(', ')}.` });

    // Según el papel de la escena, una opción que le va bien.
    if (scene.role === 'cta') pool.unshift({ label: 'Cierre con la marca', visual: 'motion', motionTemplate: 'logo', onScreenText: p0, transition: 'destello', notes: 'Logo o nombre de la marca con el llamado a la acción.' });
    else if (scene.role === 'prueba' || /\d/.test(speech)) pool.unshift({ label: 'Dato grande', visual: 'motion', motionTemplate: 'contador', onScreenText: p0, notes: 'Un número grande animado. Pon tu dato real: se ve [DATO] hasta que lo pongas.' });
    else if (scene.role === 'beneficio' || scene.role === 'demostracion') pool.unshift({ label: 'Lista de puntos', visual: 'motion', motionTemplate: 'lista', onScreenText: p0, notes: 'Los puntos uno por uno. Escribe tus puntos reales.' });
    else if (scene.role === 'gancho' && p0) pool.unshift({ label: 'Gancho con golpe', visual: 'original', onScreenText: p0, textColor: accent, punchZoom: true, notes: 'Texto grande y zoom desde el primer segundo.' });
  }

  // Tres distintas: se rota el orden según la ronda y se evita repetir tipo + texto.
  const rotated = pool.map((_, i) => pool[(i + round * 3) % pool.length]);
  const picked: Draft[] = [];
  for (const v of rotated) {
    if (picked.length >= 3) break;
    // Ni la misma etiqueta ni el mismo texto sobre el mismo tipo de imagen.
    const same = (x: Draft) => x.label === v.label || (x.visual === v.visual && Boolean(v.onScreenText) && x.onScreenText === v.onScreenText);
    if (!picked.some(same)) picked.push(v);
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
  if (v.brollFile) scene.brollFile = v.brollFile;
  if (v.motionTemplate) scene.motionTemplate = v.motionTemplate;
  if (v.punchZoom !== undefined) scene.punchZoom = v.punchZoom;
  if (v.transition !== undefined) scene.transition = v.transition && v.transition !== 'corte' ? { id: v.transition } : undefined;
}
