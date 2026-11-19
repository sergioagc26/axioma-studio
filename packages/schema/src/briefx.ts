/**
 * Las preguntas del brief que salieron del reel de Filette (noviembre 2026): qué producto sale y a qué
 * precio, dónde se compra, cómo termina el video, qué voz lleva y qué no puede salir. Aquí está lo que
 * comparten la app, el motor y las skills, para que el cierre y la voz salgan igual en todas partes.
 */

/** Frase de cierre que va con cada objetivo, cuando no se eligió otra ni se dijo dónde se compra. */
export const CTA_FOR: Record<string, string> = {
  'Mensajes por DM': 'Escríbeme «INFO» por DM', Comentarios: 'Comenta «QUIERO» y te lo envío', Guardados: 'Guárdalo para cuando lo necesites',
  'Ir al link': 'Entra al link de mi perfil', Seguidores: 'Sígueme para más como esto', Compartidos: 'Envíaselo a quien lo necesita',
};

/** Respuesta «La que digo en el video» del cierre. */
export const SPOKEN_CTA = 'La que digo en el video';

/** Dónde compra o pide el cliente: decide el cierre (el reel de Filette cerró con WhatsApp y era la web). */
export const CANALES = ['En la página web', 'Por WhatsApp', 'Por mensaje directo (DM)', 'En el local', 'Por llamada'] as const;

/** Cómo termina el video. */
export const CIERRES = ['Producto terminado y logo', 'Solo el logo', 'Persona hablando a cámara', 'Que decida la app'] as const;

/** Voces del brief → voz IA (AI_VOICES). «Sin voz» no genera voz en off. */
export const BRIEF_VOICES: { value: string; voice: string | null; desc: string }[] = [
  { value: 'Hombre de voz grave', voice: 'grave', desc: 'Barítono profundo y serio, como un comercial.' },
  { value: 'Hombre cercano', voice: 'colombiano', desc: 'Cálido y de confianza.' },
  { value: 'Hombre enérgico', voice: 'energico', desc: 'Como un anuncio de radio.' },
  { value: 'Mujer cálida', voice: 'colombiana', desc: 'Alegre y cercana.' },
  { value: 'Mujer elegante', voice: 'elegante', desc: 'Suave y pausada, de marca de lujo.' },
  { value: 'Sin voz, solo música', voice: null, desc: 'El video no lleva voz en off.' },
];

/** Lo que no puede salir en el video. Se guarda separado por comas. */
export const PROHIBIDOS = ['Personas del equipo', 'Clientes del local', 'Niños', 'Precios', 'Nada en especial'] as const;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
type Brief = Record<string, string | undefined>;

/**
 * Voz IA que pide el brief: el id de AI_VOICES, `null` si pidió «sin voz», `undefined` si no respondió
 * (o escribió algo que no se entiende: entonces manda la voz por defecto de Configuración).
 */
export function voiceForBrief(brief: Brief): string | null | undefined {
  const t = norm(brief.voz ?? '');
  if (!t) return undefined;
  const hit = BRIEF_VOICES.find((v) => norm(v.value) === t);
  if (hit) return hit.voice;
  if (/sin voz|solo musica|ninguna/.test(t)) return null;
  if (/grave|gruesa|profund|barit/.test(t)) return 'grave';
  if (/energ|radio/.test(t)) return 'energico';
  if (/elegan|lujo/.test(t)) return 'elegante';
  if (/mujer|femen/.test(t)) return 'colombiana';
  if (/hombre|mascul/.test(t)) return 'colombiano';
  return undefined;
}

/** Lo prohibido, como lista («Personas del equipo, Niños» → dos). «Nada en especial» es lista vacía. */
export function prohibidos(brief: Brief): string[] {
  return (brief.prohibido ?? '').split(/\s*[,;·]\s*/).map((x) => x.trim()).filter((x) => x && !/^nada/i.test(x));
}

/** Etiquetas de toma que no pueden entrar al montaje según lo prohibido. */
export function forbiddenShotTags(brief: Brief): string[] {
  const p = prohibidos(brief).map(norm);
  return p.some((x) => /persona|equipo|client|nino|gente/.test(x)) ? ['personas', 'hablando'] : [];
}

/** El brief pide cerrar con el producto terminado (y el logo). */
export const wantsProductEnding = (brief: Brief) => /producto/i.test(brief.cierre ?? '');
/** El brief pide el logo en el cierre. */
export const wantsLogoEnding = (brief: Brief) => /logo/i.test(brief.cierre ?? '');

/** «https://www.filetteburger.com/carta» → «filetteburger.com». */
export function shortWeb(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/?#].*$/, '');
}

/**
 * Cierre según dónde se compra. Solo usa el contacto que escribió el usuario (web, número o dirección):
 * nunca inventa uno. Sin canal, cadena vacía.
 */
export function ctaForChannel(canal?: string, contacto?: string): string {
  const c = norm(canal ?? '');
  const k = (contacto ?? '').trim();
  if (!c) return '';
  if (/web|pagina|sitio|tienda en linea/.test(c)) {
    const web = /\.[a-z]{2,}/i.test(k) ? shortWeb(k) : '';
    return web ? `Pide directo en ${web}` : 'Pide directo en nuestra página web';
  }
  if (/whats/.test(c)) return /\d{7,}/.test(k.replace(/\D/g, '')) ? `Pide por WhatsApp al ${k}` : 'Pide por WhatsApp';
  if (/dm|mensaje|direct/.test(c)) return 'Escríbenos por DM para pedir';
  if (/local|tienda|visit/.test(c)) return k ? `Visítanos en ${k}` : 'Visítanos en el local';
  if (/llam|telef/.test(c)) return /\d{7,}/.test(k.replace(/\D/g, '')) ? `Llámanos al ${k}` : 'Llámanos y pide';
  return '';
}

/**
 * La frase de cierre del video. Manda, en orden: la frase elegida en «¿Con qué frase cierras?», la de
 * dónde se compra, la del objetivo y, en un anuncio, una genérica. Con «La que digo en el video» en un
 * video hablado no se añade texto (cadena vacía); en un montaje no hay nada dicho y se sigue con el resto.
 */
export function resolveCta(brief: Brief, opts: { talk: boolean; ad?: boolean }): string {
  const spoken = /digo en el video/i.test(brief.cta ?? '');
  if (spoken && opts.talk) return '';
  const asked = spoken ? '' : (brief.cta ?? '').trim();
  const channel = ctaForChannel(brief.canal, brief.contacto);
  // Una frase genérica (la de un objetivo, casi siempre sugerida por la IA) no le gana a dónde se compra.
  if (asked && !(channel && isGenericCta(asked))) return asked;
  return channel || (brief.objetivo && CTA_FOR[brief.objetivo]) || (opts.ad ? 'Escríbenos y te contamos' : '');
}

/** Frase de cierre de las que pone la app sola (objetivo o canal), no escrita por el usuario. */
export function isGenericCta(cta: string): boolean {
  const t = cta.trim();
  return Object.values(CTA_FOR).includes(t) || /^(Pide directo en |Pide por WhatsApp|Escríbenos por DM para pedir|Visítanos en |Llámanos)/.test(t);
}

/** Precios escritos en un texto: «$12.000», «12 mil», «doce mil pesos» no (solo cifras). */
export function pricesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\$\s?\d{1,3}(?:[.,]\d{3})+|\$\s?\d+|\b\d{1,3}(?:[.,]\d{3})+\s?(?:pesos|cop)\b|\b\d+\s?mil\b/gi)) {
    out.add(m[0].replace(/\D/g, '').replace(/^(\d+)$/, (d) => (/mil/i.test(m[0]) ? `${d}000` : d)));
  }
  return [...out];
}

const CHANNEL_WORDS: [RegExp, RegExp][] = [
  [/web|pagina|sitio/, /whats ?app|wa\.me/i],
  [/whats/, /\b(?:www\.|https?:)|\.com\b|p[aá]gina web/i],
];

/**
 * Avisos antes de entregar: lo que el video dice o muestra y choca con el brief. Revisa los textos en
 * pantalla, la frase de cierre y el texto de la voz en off. No cambia nada: solo avisa.
 */
export function briefWarnings(project: {
  brief: Brief;
  scenes: { onScreenText?: string }[];
  audio?: { voiceover?: { text?: string } };
}): string[] {
  const b = project.brief;
  const texts = project.scenes.map((s) => s.onScreenText ?? '').filter(Boolean);
  const voice = project.audio?.voiceover?.text ?? '';
  const all = [...texts, voice].join(' \n ');
  const warn: string[] = [];
  const shown = pricesIn(all);
  const prohibited = prohibidos(b).map(norm);
  if (prohibited.some((x) => x.startsWith('precio')) && shown.length) {
    warn.push(`Pediste que no salgan precios y el video dice ${shown.map((p) => '$' + Number(p).toLocaleString('es-CO')).join(', ')}.`);
  } else if (shown.length) {
    const known = new Set(pricesIn([b.producto, b.notas].filter(Boolean).join(' ')));
    const extra = shown.filter((p) => !known.has(p));
    if (extra.length) warn.push(`El video dice ${extra.map((p) => '$' + Number(p).toLocaleString('es-CO')).join(', ')} y ese precio no está en el brief. Confírmalo con el cliente.`);
  }
  const canal = norm(b.canal ?? '');
  for (const [mine, other] of CHANNEL_WORDS) {
    if (mine.test(canal) && other.test(all)) {
      warn.push(`El cliente pide ${b.canal?.toLowerCase()}, pero el video menciona otro canal (${all.match(other)?.[0]}).`);
      break;
    }
  }
  if (voiceForBrief(b) === null && voice.trim()) warn.push('Pediste «sin voz» y el video tiene voz en off.');
  return warn;
}
