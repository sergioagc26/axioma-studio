import { checkCancelled } from './cancel.ts';
import { listReferences } from './reference.ts';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Guion, SCRIPT_STRUCTURES, SCRIPT_TRANSITIONS, SHOT_MOVES, SHOT_SIZES, guionMarkdown, guionSeconds, guionVoice, sceneLength, scriptStructure, tidyGuion, type GuionRow } from '@axioma/schema';
import { VOICEOVER_CAPTIONS } from './auto.ts';
import { montageToBeat } from './beats.ts';
import { askClaude, claudeReady } from './assistant.ts';
import { readKit } from './kit.ts';
import { llmJson, llmReady } from './llm.ts';
import { detectShots } from './montage.ts';
import { autoMusic } from './musiclib.ts';
import { setAutoSfx, setVoiceover } from './ops.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import type { TtsProvider } from './tts.ts';
import { SHOT_TAGS, VOICE_LEAD, sceneSwitchPoint, syncShotsToVoice, tagShots } from './voicesync.ts';

const FILE = 'guion.json';
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');

export async function readScript(dir: string): Promise<Guion | null> {
  const f = path.join(dir, FILE);
  if (!existsSync(f)) return null;
  try { return Guion.parse(JSON.parse(await readFile(f, 'utf8'))); } catch { return null; }
}

/** Guarda el guion (ordenado: duraciones según las palabras) y su versión en texto al lado. */
export async function saveScript(dir: string, guion: Guion): Promise<Guion> {
  const g = tidyGuion(Guion.parse({ ...guion, updatedAt: new Date().toISOString() }));
  g.avisos = checkScript(g, await factsOf(dir));
  await writeFile(path.join(dir, FILE), JSON.stringify(g, null, 2));
  await writeFile(path.join(dir, 'guion.md'), guionMarkdown(g));
  return g;
}

/** Lo que el cliente sí dijo (brief, nota, datos, marca): de ahí salen los datos del guion. */
async function factsOf(dir: string) {
  const project = await readProject(dir);
  const b = project.brief;
  const kit = await readKit(project.client).catch(() => null);
  const extras = Object.entries(b).filter(([k, v]) => k.startsWith('extra:') && v && !/^no aplica$/i.test(v)).map(([k, v]) => `${k.slice(6)}: ${v}`);
  const text = [b.notas, b.cta, b.publico, b.objetivo, ...extras, kit?.name].filter(Boolean).join(' · ');
  return { project, kit, extras, text };
}

/**
 * Revisión de un guion antes de usarlo: cifras o datos que no salen de lo que dio el cliente
 * (no se inventan precios, teléfonos ni promociones), duración y gancho.
 */
export function checkScript(g: Guion, facts: { text: string }): string[] {
  const out: string[] = [];
  const known = new Set((facts.text.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]/g, '')));
  const voice = guionVoice(g) + ' ' + g.filas.map((f) => f.texto).join(' ');
  const odd = [...new Set((voice.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]/g, '')).filter((n) => n.length >= 2 && !known.has(n)))];
  if (odd.length) out.push(`Revisa estos números: no salen de tu brief (${odd.slice(0, 5).join(', ')}). No uses precios, teléfonos ni cifras que no sean reales.`);
  if (/\b(gratis|descuento|2x1|promo|oferta)\b/i.test(voice) && !/\b(gratis|descuento|2x1|promo|oferta)\b/i.test(facts.text)) out.push('El guion habla de una promoción que no está en tu brief: confírmala o quítala.');
  const secs = guionSeconds(g);
  if (g.duracion && secs > g.duracion * 1.15) out.push(`Dura unos ${secs.toFixed(0)} s y pediste ${g.duracion} s: acorta alguna fila.`);
  const first = g.filas[0]?.voz.trim().split(/\s+/).length ?? 0;
  if (first > 16) out.push('El gancho es largo: la primera frase debería decirse en menos de 3 segundos.');
  if (g.filas.length && !/llamada|acci[oó]n|cta/i.test(g.filas[g.filas.length - 1].seccion)) out.push('La última fila debería ser la llamada a la acción.');
  return out;
}

/** Qué hay para mostrar: las etiquetas de las tomas del proyecto, con cuántas tomas tiene cada una. */
async function availableShots(dir: string): Promise<{ tag: string; count: number; seconds: number }[]> {
  const project = await readProject(dir);
  if (project.kind !== 'montaje') return [];
  const shots = await tagShots(dir).catch(() => detectShots(dir).catch(() => []));
  const m = new Map<string, { count: number; seconds: number }>();
  for (const s of shots) if (s.tag) { const x = m.get(s.tag) ?? { count: 0, seconds: 0 }; x.count++; x.seconds += s.end - s.start; m.set(s.tag, x); }
  return [...m.entries()].map(([tag, x]) => ({ tag, count: x.count, seconds: +x.seconds.toFixed(0) }));
}

const SYSTEM = `Eres guionista y director de videos cortos para redes (reels, TikTok, shorts, anuncios e historias). Escribes en español de Latinoamérica, natural y hablado, nunca acartonado.

OFICIO
- Guion literario: lo que dice la voz. Frases cortas, una idea por frase, verbos activos, segunda persona («tú»). Se escribe para el oído: sin paréntesis, sin siglas raras, los números como se dicen.
- Guion técnico: cada fila es un momento. Dice qué se oye (voz), qué se ve (imagen), el tamaño de plano, el movimiento de cámara, el texto en pantalla, cómo se entra (transición) y qué suena.
- El gancho va en la primera fila y se dice en menos de 3 segundos: una pregunta, una promesa, algo inesperado o un dato real. Nunca «hola, bienvenidos».
- Mostrar, no contar: lo que la voz nombra se ve en ese mismo momento. Si la voz dice «nachos», la imagen son los nachos.
- Ritmo: una fila dura de 2 a 6 segundos. A ritmo de anuncio se dicen unas 2,6 palabras por segundo: una fila de 4 segundos lleva unas 10 palabras.
- Texto en pantalla: de 1 a 4 palabras, no repite toda la frase; resalta la palabra que importa. Puede ir vacío.
- Cada pieza termina en una sola llamada a la acción, clara y concreta.
- Humor y emoción según el tono pedido; el remate de un chiste va al final de la frase, después de una pausa.

REGLAS QUE NO SE ROMPEN
- No inventes precios, promociones, teléfonos, direcciones, horarios, cifras, premios ni testimonios. Usa solo los datos que te dan. Si falta un dato, no lo pongas.
- No prometas resultados médicos, legales ni de dinero.
- En «toma» escribe SOLO una de las etiquetas disponibles que te dan (exacta), o cadena vacía si ninguna sirve. No inventes tomas que no existen cuando hay material: el video se arma con lo que ya está grabado.
- «plano» es uno de: ${SHOT_SIZES.join(', ')}. «movimiento» es uno de: ${SHOT_MOVES.join(', ')}. «transicion» es uno de: ${SCRIPT_TRANSITIONS.join(', ')}.
- Respeta la estructura pedida, en su orden, y la duración total.
- «imagen» describe lo que se VE con detalle de director (qué objeto, qué acción, desde dónde): «la mano baña los totopos con salsa de queso, de cerca», no solo «nachos».
- Cada fila dice algo nuevo: no repitas la llamada a la acción en varias filas ni rellenes con frases vacías («todo es posible», «lo mejor de lo mejor»).
- Primero escribe en «literario» el texto completo de la voz, de corrido, como lo diría una persona. Después pártelo en filas sin cambiarle palabras.

EJEMPLO (panadería, 15 s, historia corta; solo para ver el nivel, no copies su contenido):
literario: «Son las seis de la mañana y tú sigues dormido. Nosotros no. A esta hora sale el pan de masa madre, crocante por fuera y suave por dentro. Para cuando despiertes, ya te está esperando. Pasa hoy por el tuyo.»
filas: 1) gancho · voz «Son las seis de la mañana y tú sigues dormido. Nosotros no.» · imagen «manos enharinadas amasan sobre la mesa, luz tenue» · plano detalle · movimiento acercar · texto «6:00 a. m.» · transicion corte · sonido «golpe suave». 2) situación · voz «A esta hora sale el pan de masa madre, crocante por fuera y suave por dentro.» · imagen «la pala saca el pan dorado del horno, sale vapor» · plano primer plano · movimiento alejar · texto «Masa madre» · transicion barrido. 3) llamada · voz «Para cuando despiertes, ya te está esperando. Pasa hoy por el tuyo.» · imagen «el pan en la vitrina, alguien lo recibe en una bolsa de papel» · plano plano medio · movimiento fijo · texto «Pasa hoy» · transicion destello.
Responde solo JSON.`;

const ROW_SCHEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string' }, idea: { type: 'string' }, literario: { type: 'string' },
    filas: { type: 'array', minItems: 3, maxItems: 16, items: { type: 'object', properties: {
      seccion: { type: 'string' }, voz: { type: 'string' }, imagen: { type: 'string' }, toma: { type: 'string' },
      plano: { type: 'string' }, movimiento: { type: 'string' }, texto: { type: 'string' }, transicion: { type: 'string' }, sonido: { type: 'string' },
    }, required: ['seccion', 'voz', 'imagen', 'toma', 'plano', 'movimiento', 'texto', 'transicion', 'sonido'] } },
  },
  required: ['titulo', 'idea', 'literario', 'filas'],
};

export interface ScriptRequest { idea?: string; estructura?: string; duracion?: number; tono?: string; voz?: string }

/**
 * Escribe el guion (literario y técnico) del video: con la IA local a partir del brief, la marca y
 * lo que hay grabado; sin IA, deja la plantilla de la estructura para llenarla. Lo guarda en el proyecto.
 */
export async function writeScript(dir: string, req: ScriptRequest = {}): Promise<Guion> {
  const { project, kit, text } = await factsOf(dir);
  const b = project.brief;
  const st = scriptStructure(req.estructura);
  const duracion = Math.max(8, Math.min(180, req.duracion ?? (Number(String(b.duracion ?? '').match(/\d+/)?.[0]) || 30)));
  const tono = req.tono || b.tono || 'Cercano';
  const shots = await availableShots(dir);
  const said = project.kind === 'hablado' ? ((await readTranscript(dir).catch(() => null))?.words ?? []).map((w) => w.text).join(' ').slice(0, 1500) : '';
  const base = { estructura: st.id, tono, duracion, voz: req.voz, idea: req.idea ?? '' };
  // La referencia elegida en el brief: si el cliente pidió su estructura, el guion la sigue (la forma, nunca el contenido).
  const ref = b.referencia && b.referencia !== 'ninguna' ? (await listReferences(project.client).catch(() => [])).find((r) => r.id === b.referencia) : undefined;
  const refNote = ref?.understanding && (ref.copy?.estructura ?? true)
    ? `Referencia que le gustó al cliente (sigue su forma, NO copies sus frases ni su contenido): ${ref.understanding.formato}; gancho: ${ref.understanding.gancho}; partes: ${ref.understanding.estructura.map((x) => `${x.parte} (${x.que})`).join(' → ')}.${ref.wish ? ` Lo que el cliente quiere de ella: «${ref.wish}».` : ''}`
    : '';

  // Con Claude conectado, el guion lo escribe Claude (mira las tomas y el brief con sus herramientas
  // y lo guarda con guardar_guion): escribe mejor que la IA local. Si no responde, sigue la local.
  if (await claudeReady().catch(() => false)) {
    const before = (await readScript(dir))?.updatedAt;
    try {
      await askClaude(project.id, [
        `Escribe el guion profesional de este video y guárdalo con la herramienta guardar_guion (no edites nada más del proyecto).`,
        `Estructura: ${st.name} (${st.beats.join(' → ')}). Duración: ${duracion} s (unas ${Math.round(duracion * 2.5)} palabras de voz). Tono: ${tono}.`,
        req.idea ? `Idea del cliente: ${req.idea}` : 'Propón la idea a partir del brief.',
        refNote,
        project.kind === 'montaje' ? 'Es un montaje de tomas: mira con leer_tomas qué hay grabado y en «toma» pon la etiqueta de la toma que debe verse en cada fila (lo que la voz nombra se ve en ese momento).' : 'Es una persona hablando a cámara: es su guion para grabar; deja «toma» vacío.',
        'Reglas: español latino hablado, frases cortas; gancho en menos de 3 s; «imagen» con detalle de director; texto en pantalla de 1 a 4 palabras; una sola llamada a la acción al final (la del brief). No inventes precios, promociones, teléfonos, horarios ni cifras: solo lo que está en el brief y la marca.',
      ].join('\n'));
      const made = await readScript(dir);
      if (made?.filas.length && made.updatedAt !== before) return saveScript(dir, { ...made, ...base, idea: req.idea || made.idea, origen: 'ia' });
    } catch { /* sin Claude: la IA local */ }
  }
  if (await llmReady()) {
    const words = Math.round(duracion * 2.5);
    const user = [
      `Marca: ${kit?.name ?? project.client ?? 'sin nombre'}${kit?.sector ? ` (${kit.sector})` : ''}${kit?.personality ? `, personalidad ${kit.personality}` : ''}.`,
      text ? `Datos reales del cliente (lo único que puedes afirmar): ${text}` : 'El cliente no dio datos: no afirmes nada concreto del negocio.',
      b.publico ? `Público: ${b.publico}.` : '', b.objetivo ? `Objetivo: ${b.objetivo}.` : '',
      b.cta ? `Llamada a la acción (úsala en la última fila, con estas palabras o muy parecidas): «${b.cta}».` : '',
      `Tono: ${tono}. Duración total: ${duracion} s (unas ${words} palabras de voz en total, no más).`,
      `Estructura: ${st.name}. Partes en orden: ${st.beats.join(' → ')}. (${st.when})`,
      req.idea ? `Idea del cliente para este video: ${req.idea}` : 'Propón tú la idea, a partir de los datos.',
      refNote,
      project.kind === 'montaje'
        ? (shots.length ? `Material grabado (etiquetas disponibles para «toma» · cuántas tomas): ${shots.map((s) => `${s.tag} (${s.count})`).join(', ')}. Reparte las filas entre lo que hay; lo que tiene más tomas puede durar más.` : 'No se sabe qué hay grabado: describe la imagen ideal y deja «toma» vacío.')
        : `Es un video de una persona hablando a cámara: la voz es lo que dirá esa persona (guion para grabar o regrabar). En «imagen» indica si va la persona a cámara o un recurso encima (b-roll, captura, gráfico). Deja «toma» vacío.${said ? ` Esto es lo que ya dijo en la grabación actual, por si sirve de base: «${said}»` : ''}`,
    ].filter(Boolean).join('\n');
    try {
      const r = await llmJson<{ titulo: string; idea: string; literario: string; filas: GuionRow[] }>(SYSTEM, user, ROW_SCHEMA, { temperature: 0.7, timeoutMs: 300_000, think: true });
      const tags = new Set(shots.map((s) => s.tag));
      const pick = <T extends string>(v: string, list: readonly T[], def: T): T => list.find((x) => norm(x) === norm(v ?? '')) ?? def;
      const filas = (r.filas ?? []).map((f) => ({
        ...f, voz: String(f.voz ?? '').replace(/\s+/g, ' ').trim(), texto: String(f.texto ?? '').replace(/[.«»"]/g, '').trim(),
        toma: tags.has(norm(f.toma ?? '')) || /^t\d+$/.test(norm(f.toma ?? '')) ? norm(f.toma ?? '') : undefined,
        plano: pick(f.plano, SHOT_SIZES, 'primer plano'), movimiento: pick(f.movimiento, SHOT_MOVES, 'acercar'), transicion: pick(f.transicion, SCRIPT_TRANSITIONS, 'corte'),
      })).filter((f) => f.voz);
      if (filas.length >= 3) return saveScript(dir, Guion.parse({ ...base, titulo: r.titulo, idea: req.idea || r.idea, filas, origen: 'ia' }));
    } catch { /* cae a la plantilla */ }
  }
  // Sin IA (o si falló): la plantilla de la estructura, lista para llenar a mano.
  const each = duracion / st.beats.length;
  const filas = st.beats.map((beat, i) => ({
    seccion: beat,
    voz: i === st.beats.length - 1 ? (b.cta || 'Escríbenos y te contamos.') : i === 0 ? (req.idea || b.notas || '').split(/[.!?]/)[0].trim() : '',
    imagen: `(${beat}: qué se ve aquí, unos ${each.toFixed(0)} s)`,
    toma: shots[i % Math.max(1, shots.length)]?.tag,
    plano: i === 0 ? 'detalle' : 'primer plano', movimiento: 'acercar', texto: '', transicion: i === 0 ? 'corte' : 'barrido', sonido: '',
  }));
  const g = await saveScript(dir, Guion.parse({ ...base, titulo: req.idea?.slice(0, 60) || `Guion · ${st.name}`, filas, origen: 'plantilla' }));
  return { ...g, avisos: ['La IA local no está disponible: dejé la plantilla de esta estructura para que la llenes (o enciende Ollama y vuelve a intentar).', ...g.avisos] };
}

/** En qué segundo de la voz empieza cada fila del guion (por sus primeras palabras, en orden). */
export function rowStarts(words: { text: string; start: number }[], filas: { voz: string }[]): number[] {
  const w = words.map((x) => norm(x.text));
  const total = filas.reduce((a, f) => a + f.voz.split(/\s+/).filter(Boolean).length, 0) || 1;
  const out: number[] = [];
  let from = 0, said = 0;
  for (const f of filas) {
    const first = f.voz.split(/\s+/).map(norm).filter(Boolean);
    // Donde debería ir por la cuenta de palabras: la búsqueda se queda cerca de ahí.
    const guess = Math.round((said / total) * w.length);
    let at = -1;
    for (let i = Math.max(from, guess - 12); i < Math.min(w.length, Math.max(from, guess) + 14) && at < 0; i++) {
      const n = Math.min(3, first.length);
      let ok = n > 0;
      for (let k = 0; k < n && ok; k++) if (w[i + k] !== first[k]) ok = false;
      if (ok) at = i;
    }
    if (at < 0) at = Math.min(w.length - 1, Math.max(from, guess));
    out.push(words[at]?.start ?? 0);
    from = at + 1;
    said += first.length;
  }
  return out;
}

/**
 * Vuelve a poner la imagen sobre la voz: con las filas del guion si el video salió de un guion (y
 * la voz es la de ese guion); si no, con lo que la voz nombra.
 */
export async function resyncToVoice(dir: string): Promise<{ tag: string; word: string; at: number }[]> {
  const project = await readProject(dir);
  const vo = project.audio.voiceover;
  const g = await readScript(dir);
  if (vo?.wordsFile && g?.filas.some((f) => f.toma) && vo.text && norm(vo.text).startsWith(norm(guionVoice(g)).slice(0, 40))) {
    const words = (JSON.parse(await readFile(path.join(dir, vo.wordsFile), 'utf8')).words ?? []) as { text: string; start: number }[];
    const at = rowStarts(words, g.filas);
    const segments = g.filas.map((f, i) => ({ tag: f.toma ?? '', start: at[i], word: f.seccion || f.voz.split(' ').slice(0, 2).join(' ') })).filter((x) => x.tag);
    return syncShotsToVoice(dir, { segments });
  }
  return syncShotsToVoice(dir);
}

const CAM: Record<string, 'ninguno' | 'acercar' | 'alejar' | 'izquierda' | 'temblor' | 'pulso'> = { fijo: 'ninguno', acercar: 'acercar', alejar: 'alejar', paneo: 'izquierda', 'cámara en mano': 'temblor', pulso: 'pulso' };
/** El movimiento del guion (lista fija o texto libre de un director) llevado a los que simula la app. */
function cameraOf(m: string): (typeof CAM)[string] {
  const t = norm(m);
  if (CAM[m.trim().toLowerCase()]) return CAM[m.trim().toLowerCase()];
  if (/fijo|estable|estatic/.test(t) && !/acerc/.test(t)) return 'ninguno';
  if (/alej|abre|sube/.test(t)) return 'alejar';
  if (/mano|vaiven|tembl/.test(t)) return 'temblor';
  if (/pane|later|gir|sigue|recorr/.test(t)) return 'izquierda';
  if (/puls|golpe|ritmo/.test(t)) return 'pulso';
  return 'acercar';
}
const TRANS: Record<string, string | undefined> = { corte: undefined, barrido: 'giro', zoom: 'zoom', deslizar: 'deslizar-izquierda', destello: 'destello', fundido: 'fundido', golpe: 'golpe' };

/**
 * Del guion técnico al video (montajes): genera la voz, corta al ritmo de la música y, fila por
 * fila, pone en pantalla la toma que el guion pide mientras la voz dice esa fila, con su
 * movimiento de cámara, su entrada, su texto y sus sonidos.
 */
export async function applyScript(dir: string, opts: { provider?: TtsProvider; voice?: string; onProgress?: (m: string) => void } = {}): Promise<{ summary: string[] }> {
  const say = (m: string) => { checkCancelled(); opts.onProgress?.(m); };
  const g = await readScript(dir);
  if (!g?.filas.length) throw new Error('Este proyecto todavía no tiene guion. Escríbelo primero.');
  let project = await readProject(dir);
  if (project.kind !== 'montaje') throw new Error('Este video es de alguien hablando a cámara: el guion es para grabarlo (o regrabarlo). Convertir el guion en video funciona con montajes de tomas.');
  const text = guionVoice(g);
  if (text.split(/\s+/).length < 4) throw new Error('El guion casi no tiene voz: escribe lo que dirá en cada fila.');
  const summary: string[] = [];

  say('Generando la voz del guion…');
  const voiced = await setVoiceover(dir, text, { provider: opts.provider, voice: opts.voice ?? g.voz });
  summary.push(`Voz en off generada con el guion (${voiced.audio.voiceover?.duration.toFixed(0)} s).`);
  project = await readProject(dir);
  if (project.audio.musicVolume > 0.3) project.audio.musicVolume = 0.24;
  await writeProject(dir, project);
  if (!project.audio.music && !project.audio.musicOff) {
    say('Eligiendo la música…');
    const m = await autoMusic(dir, undefined, { rebuild: false }).catch(() => null);
    if (m) summary.push(m);
  }

  say('Cortando al ritmo…');
  await tagShots(dir).catch(() => {});
  const fast = /r[aá]pid|en[eé]rg|din[aá]m/i.test(`${g.tono} ${project.brief.ritmo ?? ''}`);
  try {
    await montageToBeat(dir, { minClip: fast ? 0.7 : 1.1, density: fast ? 'pulso' : 'medio' });
  } catch (e) {
    throw new Error(`No pude cortar el montaje: ${(e as Error).message}`);
  }

  say('Poniendo cada imagen con su frase…');
  project = await readProject(dir);
  const words = (JSON.parse(await readFile(path.join(dir, project.audio.voiceover!.wordsFile!), 'utf8')).words ?? []) as { text: string; start: number; end: number }[];
  const at = rowStarts(words, g.filas);
  const segments = g.filas.map((f, i) => ({ tag: f.toma ?? '', start: at[i], word: f.seccion || f.voz.split(' ').slice(0, 2).join(' ') })).filter((s) => s.tag);
  const synced = await syncShotsToVoice(dir, { segments });
  if (synced.length) summary.push(`Imagen y voz sincronizadas fila por fila: ${synced.length} momentos del guion muestran lo que la voz está diciendo.`);
  else summary.push('No pude emparejar las filas con las tomas (el guion no dice qué toma va en cada fila): el montaje sigue el orden del material.');

  // Fila por fila: movimiento de cámara, entrada y texto en pantalla.
  project = await readProject(dir);
  const starts: number[] = []; let acc = 0;
  for (const sc of project.scenes) { starts.push(acc); acc += sceneLength(sc); }
  const sceneFor = (t: number) => {
    let i = 0; while (i + 1 < starts.length && starts[i + 1] <= t) i++;
    if (i + 1 < starts.length && t - VOICE_LEAD > sceneSwitchPoint(starts[i], sceneLength(project.scenes[i]))) i++;
    return i;
  };
  for (const sc of project.scenes) { sc.onScreenText = undefined; sc.autoText = undefined; sc.transition = undefined; }
  const rowScene = at.map(sceneFor);
  let titles = 0;
  g.filas.forEach((f, r) => {
    const from = rowScene[r], to = r + 1 < rowScene.length ? Math.max(rowScene[r + 1], from + 1) : project.scenes.length;
    const last = r === g.filas.length - 1;
    for (let i = from; i < to && i < project.scenes.length; i++) {
      const sc = project.scenes[i];
      sc.camera = cameraOf(f.movimiento);
      if (sc.camera !== 'ninguno') sc.cameraAmount = 0.12;
      // La entrada del guion va en el primer corte de la fila; dentro de la fila, cortes limpios o barridos cortos.
      const id = i === from ? TRANS[norm(f.transicion)] : fast ? 'giro' : undefined;
      if (i > 0 && id) sc.transition = { id };
    }
    const txt = f.texto.trim();
    if (!txt) return;
    const few = txt.split(/\s+/).length <= 2;
    let shown = 0;
    for (let i = from; i < to && i < project.scenes.length && (last || shown < 1.6); i++) {
      const sc = project.scenes[i];
      sc.onScreenText = txt; sc.autoText = txt;
      sc.textStyle = few ? 'palabra' : last ? 'banda' : 'resaltado';
      sc.textPosition = few ? 'centro' : 'arriba';
      sc.textAnim = 'pop';
      shown += sceneLength(sc);
    }
    titles++;
  });
  // Subtítulos discretos y abajo: los textos del guion son los que mandan en pantalla.
  Object.assign(project.captions, VOICEOVER_CAPTIONS, { y: 0.8, fontSize: 58, behind: false });
  await writeProject(dir, project);
  if (titles) summary.push(`${titles} textos en pantalla, cada uno cuando la voz dice su frase.`);
  if (!project.audio.sfxOff) { await setAutoSfx(dir, true); summary.push('Efectos de sonido en las transiciones y al entrar cada texto.'); }
  await writeFile(path.join(dir, 'resumen-edicion.json'), JSON.stringify({ at: new Date().toISOString(), summary }, null, 2)).catch(() => {});
  return { summary };
}

export { SCRIPT_STRUCTURES, SHOT_TAGS };
