import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { outputDuration, type Project } from '@axioma/schema';
import { readKit } from './kit.ts';
import { llmJson, llmReady } from './llm.ts';
import { localEdit } from './localedit.ts';
import { readProject, readTranscript, writeProject } from './store.ts';

/**
 * Brief inteligente, pensado para quien no sabe editar: la IA local lee lo que se dice en el
 * video, propone las respuestas (el cliente solo confirma o cambia), hace las preguntas puntuales
 * que le faltan para ese video y, con todo, escribe el prompt profesional con el que se edita.
 */
export interface ExtraQuestion { id: string; pregunta: string; ejemplo: string; uso: 'cierre' | 'destacar' | 'rotulo' }

/** Datos que solo el cliente sabe y que mejoran el video. La IA decide cuáles le faltan a cada uno. */
export const EXTRA_CATALOG: (ExtraQuestion & { cuando: string })[] = [
  { id: 'precio', pregunta: '¿Qué precio o promoción quieres que se vea en pantalla?', ejemplo: 'Combo mini a $13.000', uso: 'destacar', cuando: 'se ofrece un producto, servicio, plato o promoción' },
  { id: 'contacto', pregunta: '¿A dónde te escriben o te buscan?', ejemplo: 'WhatsApp 300 123 4567 · @minegocio', uso: 'cierre', cuando: 'se invita a comprar, reservar, escribir o visitar' },
  { id: 'lugar', pregunta: '¿Dónde queda o en qué horario atiendes?', ejemplo: 'Cra 11 #12-34 · todos los días de 12 a 9 pm', uso: 'destacar', cuando: 'es un negocio con local físico o un evento presencial' },
  { id: 'fecha', pregunta: '¿Hasta cuándo es válido?', ejemplo: 'Solo hasta el domingo', uso: 'destacar', cuando: 'hay una promoción, concurso, cupo o evento con fecha' },
  { id: 'rotulo', pregunta: '¿Nombre y cargo de quien habla? (sale unos segundos al inicio)', ejemplo: 'Laura Gómez · Nutricionista', uso: 'rotulo', cuando: 'habla un profesional, experto o dueño que conviene presentar' },
];
export interface BriefHelp { resumen: string; sugerido: Record<string, string>; preguntas: ExtraQuestion[]; ia: boolean }

export const BRIEF_VALUES = {
  objetivo: ['Mensajes por DM', 'Comentarios', 'Guardados', 'Compartidos', 'Ir al link', 'Seguidores'],
  publico: ['Gente que aún no me conoce', 'Seguidores que ya me conocen', 'Clientes listos para comprar', 'Dueños de negocio y emprendedores', 'Jóvenes de 18 a 25', 'Adultos y familias'],
  tono: ['Directo', 'Cercano', 'Educativo', 'Inspirador', 'Divertido', 'Elegante'],
};
const CTA_FOR: Record<string, string> = {
  'Mensajes por DM': 'Escríbeme «INFO» por DM', Comentarios: 'Comenta «QUIERO» y te lo envío', Guardados: 'Guárdalo para cuando lo necesites',
  'Ir al link': 'Entra al link de mi perfil', Seguidores: 'Sígueme para más como esto', Compartidos: 'Envíaselo a quien lo necesita',
};
const file = (dir: string) => path.join(dir, 'brief-ia.json');

/** Duración sugerida según lo que dura el material ya cortado. */
function durationFor(seconds: number): string {
  return seconds <= 17 ? '10–15 s' : seconds <= 24 ? '15–20 s' : seconds <= 34 ? '20–30 s' : seconds <= 50 ? '30–45 s' : seconds <= 70 ? '45–60 s' : 'Lo que dure';
}

/** Lo que la IA propone para el brief de este video. Se calcula una vez y se guarda. */
export async function suggestBrief(dir: string, refresh = false): Promise<BriefHelp> {
  if (!refresh && existsSync(file(dir))) { try { return JSON.parse(await readFile(file(dir), 'utf8')); } catch { /* se recalcula */ } }
  const project = await readProject(dir);
  const transcript = await readTranscript(dir).catch(() => null);
  const kit = await readKit(project.client);
  const speech = (transcript?.words ?? []).map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
  const base: BriefHelp = {
    resumen: speech ? '' : 'Video sin voz: se arma como montaje al ritmo de la música.',
    sugerido: { formato: 'Reel 9:16', ritmo: 'Que decida la app', duracion: project.kind === 'montaje' ? '15–20 s' : durationFor(outputDuration(project)) },
    preguntas: [], ia: false,
  };
  if (!speech || !(await llmReady())) { await writeFile(file(dir), JSON.stringify(base, null, 2)); return base; }
  try {
    const r = await llmJson<{ resumen: string; objetivo: string; publico: string; tono: string; cierra_con_llamado: boolean; faltan: string[] }>(
      `Eres productor de contenido para redes. Un cliente que NO sabe editar subió un video hablando a cámara. Lee lo que dice y prepara su brief de edición en español sencillo.
- resumen: una frase (máx. 20 palabras) de qué trata el video.
- objetivo, publico y tono: elige el valor que mejor encaja de las listas dadas.
- cierra_con_llamado: true si al final del video la persona ya dice un llamado a la acción (escríbeme, sígueme, visítanos, reserva, link…).
- faltan: de esta lista, los datos (máximo 3) que conviene pedirle al cliente porque aplican a este video y NO se dicen ya en él:
${EXTRA_CATALOG.map((q) => `  · ${q.id}: cuando ${q.cuando}.`).join('\n')}
  Si un dato ya se dice claramente en el video o no aplica, no lo incluyas. Puede quedar vacía.
Responde solo JSON.`,
      `Marca: ${kit?.name ?? project.client ?? 'sin marca'}${kit?.sector ? ` · sector ${kit.sector}` : ''}.\nLo que se dice en el video: «${speech.slice(0, 5000)}»`,
      {
        type: 'object',
        properties: {
          resumen: { type: 'string' }, objetivo: { type: 'string', enum: BRIEF_VALUES.objetivo }, publico: { type: 'string', enum: BRIEF_VALUES.publico }, tono: { type: 'string', enum: BRIEF_VALUES.tono },
          cierra_con_llamado: { type: 'boolean' },
          faltan: { type: 'array', maxItems: 3, items: { type: 'string', enum: EXTRA_CATALOG.map((q) => q.id) } },
        },
        required: ['resumen', 'objetivo', 'publico', 'tono', 'cierra_con_llamado', 'faltan'],
      },
      { temperature: 0.3, timeoutMs: 120_000 },
    );
    const help: BriefHelp = {
      resumen: r.resumen.trim().slice(0, 200),
      sugerido: { ...base.sugerido, objetivo: r.objetivo, publico: r.publico, tono: r.tono, cta: r.cierra_con_llamado ? 'La que digo en el video' : CTA_FOR[r.objetivo] ?? '' },
      preguntas: EXTRA_CATALOG.filter((q) => r.faltan.includes(q.id)).slice(0, 3).map(({ cuando: _c, ...q }) => q),
      ia: true,
    };
    await writeFile(file(dir), JSON.stringify(help, null, 2));
    return help;
  } catch {
    return base; // sin guardar: se vuelve a intentar la próxima vez
  }
}

/** Respuestas a las preguntas puntuales de la IA y nota libre del cliente. */
function wishes(project: Project, help: BriefHelp | null) {
  const extras = (help?.preguntas ?? []).map((q) => ({ ...q, respuesta: (project.brief[`extra:${q.id}`] ?? '').trim() })).filter((q) => q.respuesta && !/^no aplica$/i.test(q.respuesta));
  return { extras, notas: (project.brief.notas ?? '').trim() };
}

/**
 * El prompt profesional de edición: lo que un editor necesita saber, escrito a partir de lo que
 * respondió el cliente. Es lo que se le entrega a la IA que edita (Claude o la IA local).
 */
export async function buildPrompt(dir: string): Promise<string> {
  const p = await readProject(dir);
  const kit = await readKit(p.client);
  const help = existsSync(file(dir)) ? (JSON.parse(await readFile(file(dir), 'utf8')) as BriefHelp) : null;
  const b = p.brief;
  const { extras, notas } = wishes(p, help);
  const talk = p.kind !== 'montaje' && Boolean((await readTranscript(dir).catch(() => null))?.words.length);
  const lines = [
    `Edita este video ${talk ? 'hablado a cámara' : 'sin voz como un montaje de cortes al ritmo de la música'} para ${b.formato ?? 'Reel 9:16'}${kit?.name ? `, de la marca «${kit.name}»${kit.sector ? ` (${kit.sector})` : ''}` : ''}.`,
    help?.resumen ? `De qué trata: ${help.resumen}` : '',
    b.objetivo ? `Objetivo: que quien lo vea haga esto → ${b.objetivo}. Todo el video debe llevar a ese resultado.` : '',
    b.publico ? `Público: ${b.publico}.` : '',
    b.tono ? `Tono: ${b.tono}. Los textos, los subtítulos, el color y la música deben sentirse así.` : '',
    b.ritmo && !/decida/i.test(b.ritmo) ? `Ritmo de cortes: ${b.ritmo}.` : 'Ritmo de cortes: el que mejor le va al contenido y al nicho.',
    b.duracion ? (/dure/i.test(b.duracion) ? 'Duración: la que pida el contenido, sin cortar ideas.' : `Duración final: ${b.duracion}. Quita lo redundante antes que lo importante.`) : '',
    talk ? 'Apertura: nada de saludos. El primer segundo abre con un gancho en pantalla de 3 a 7 palabras, fiel a lo que se dice.' : 'Apertura: la toma más llamativa primero.',
    ...extras.filter((e) => e.uso === 'rotulo').map((e) => `Presenta a quien habla con un rótulo al inicio: ${e.respuesta}.`),
    ...extras.filter((e) => e.uso === 'destacar').map((e) => `Dato a mostrar en pantalla donde se mencione (${e.id}): ${e.respuesta}.`),
    b.cta ? (/digo en el video/i.test(b.cta) ? 'Cierre: el llamado a la acción ya se dice en el video; no agregues otro.' : `Cierre: termina con este llamado a la acción en pantalla → «${b.cta}».`) : '',
    ...extras.filter((e) => e.uso === 'cierre').map((e) => `En el cierre debe verse el contacto: ${e.respuesta}.`),
    talk ? 'Siempre: quita silencios, muletillas y tomas repetidas; subtítulos palabra por palabra dentro de las zonas seguras; música del ánimo del video, bajita debajo de la voz; efectos de sonido en transiciones y textos; no inventes cifras, nombres ni promesas.'
      : 'Siempre: cortes en los golpes de la música; textos dentro de las zonas seguras; efectos de sonido en las transiciones; no inventes cifras, nombres ni promesas.',
    notas ? `Pedido especial del cliente: ${notas}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Después de la edición automática, aplica lo que el cliente pidió de forma puntual (respuestas a
 * las preguntas de la IA y su nota libre). Lo hace la IA local con su lista cerrada de cambios.
 */
export async function applyWishes(dir: string): Promise<string[]> {
  const project = await readProject(dir);
  const help = existsSync(file(dir)) ? (JSON.parse(await readFile(file(dir), 'utf8')) as BriefHelp) : null;
  const { extras, notas } = wishes(project, help);
  const done: string[] = [];
  // El cierre respondido en una pregunta puntual se suma al llamado a la acción.
  const close = extras.find((e) => e.uso === 'cierre');
  const last = project.scenes[project.scenes.length - 1];
  if (close && last && project.scenes.length > 1 && !/digo en el video/i.test(project.brief.cta ?? '')) {
    const text = `${(project.brief.cta ?? '').trim()} ${close.respuesta}`.trim().slice(0, 60);
    last.onScreenText = text; last.autoText = text;
    await writeProject(dir, project);
    done.push(`Cierre con tu dato: «${text}».`);
  }
  // Rótulo con nombre y cargo de quien habla.
  const tag = extras.find((e) => e.uso === 'rotulo');
  if (tag) {
    const [name, ...role] = tag.respuesta.split(/\s*[·,|–-]\s+|\s*[·|]\s*/);
    const p2 = await readProject(dir);
    p2.finish.lowerThird = { name: name.trim().slice(0, 40), role: role.join(' ').trim().slice(0, 50) || undefined, at: 0.8, duration: 4 };
    await writeProject(dir, p2);
    done.push(`Rótulo al inicio: ${name.trim()}${role.length ? ` · ${role.join(' ').trim()}` : ''}.`);
  }
  const asks = [
    ...extras.filter((e) => e.uso === 'destacar').map((e) => `Pon como texto en pantalla, en la escena donde se habla de eso (si no se habla, en una escena del medio sin texto), este dato tal cual: «${e.respuesta}».`),
    ...(notas ? [notas] : []),
  ];
  if (asks.length && (await llmReady())) {
    try {
      const r = await localEdit(dir, asks.join(' '));
      if (r.applied.length) done.push(`Tus pedidos puntuales: ${r.text}`);
    } catch { /* si la IA local falla, queda la edición automática */ }
  }
  return done;
}
