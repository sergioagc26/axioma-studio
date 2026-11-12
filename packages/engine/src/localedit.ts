import { BUILTIN_PRESETS, CAPTION_DESIGNS, CAPTION_EFFECTS, Camera, Look, TextAnim, TextStyle, effectiveRanges, speechOf, type Project } from '@axioma/schema';
import { llmJson } from './llm.ts';
import { applyPreset, saveVersion } from './ops.ts';
import { listPresets } from './presets.ts';
import { readProject, readTranscript, writeProject } from './store.ts';
import { allTransitions } from './transitions.ts';

const ACTIONS = ['texto', 'estilo_texto', 'entrada_texto', 'camara', 'color', 'zoom', 'quitar_escena', 'mover_escena', 'recortar_inicio', 'recortar_final', 'transicion', 'diseno_subtitulos', 'remarcar', 'mayusculas', 'palabras_por_linea', 'estilo', 'intensidad', 'acabado', 'volumen_musica'] as const;
const FINISH = ['progressBar', 'grain', 'vignette', 'keywordZoom', 'halation', 'letterbox'] as const;

const SCHEMA = {
  type: 'object',
  properties: {
    respuesta: { type: 'string' },
    cambios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          accion: { type: 'string', enum: [...ACTIONS] },
          escena: { type: 'integer' },
          valor: { type: 'string' },
          numero: { type: 'number' },
        },
        required: ['accion'],
      },
    },
  },
  required: ['respuesta', 'cambios'],
};

type Change = { accion: (typeof ACTIONS)[number]; escena?: number; valor?: string; numero?: number };

/** Resumen compacto del reel para el modelo: escenas, lo que se dice y cómo están vestidas. */
function describe(p: Project, transcript: Awaited<ReturnType<typeof readTranscript>>): string {
  const lines = p.scenes.map((s, i) => {
    const d = effectiveRanges(s, p.source.duration).reduce((a, r) => a + r.end - r.start, 0);
    const said = speechOf(s, transcript).slice(0, 140);
    return `${i + 1}. ${d.toFixed(1)} s · ${s.visual} · texto: ${s.onScreenText ? `«${s.onScreenText}» (${s.textStyle})` : 'ninguno'} · cámara ${s.camera} · color ${s.look}${s.transition ? ` · entra con ${s.transition.id}` : ''}${s.punchZoom ? ' · zoom' : ''}\n   dice: «${said}»`;
  });
  return `Reel «${p.name}», ${p.scenes.length} escenas. Subtítulos: diseño ${p.captions.design}, remarcar ${p.captions.effect}, ${p.captions.uppercase ? 'mayúsculas' : 'minúsculas'}, ${p.captions.wordsPerLine} palabras por línea. Estilo ${p.presetId}, intensidad ${p.intensity}. Acabados: ${FINISH.filter((k) => p.finish[k]).join(', ') || 'ninguno'}.\n\n${lines.join('\n')}`;
}

/**
 * Edita el reel por chat con el modelo local: el modelo propone cambios de una lista cerrada,
 * la app valida cada uno y los aplica. Antes guarda una versión para poder volver.
 */
export async function localEdit(dir: string, request: string, sceneId?: string): Promise<{ text: string; applied: string[] }> {
  const project = await readProject(dir);
  const transcript = await readTranscript(dir).catch(() => null);
  const presets = [...(await listPresets(project.client)), ...BUILTIN_PRESETS];
  const transitions = (await allTransitions(project.client)).map((t) => t.id);
  const focus = sceneId ? project.scenes.findIndex((s) => s.id === sceneId) + 1 : 0;

  const system = `Eres el editor de video de la app Axioma Studio. Recibes un reel y un pedido en español y respondes SOLO con JSON: {"respuesta": "<una frase en español diciendo qué hiciste>", "cambios": [...]}.
Cada cambio tiene "accion" y, según la acción, "escena" (número de escena desde 1; 0 = todas), "valor" (texto) o "numero".
Acciones y valores permitidos:
- texto: escena, valor = texto corto en pantalla (máx. 8 palabras; "" para quitarlo).
- estilo_texto: escena o 0, valor uno de: ${TextStyle.options.join(', ')}.
- entrada_texto: escena o 0, valor uno de: ${TextAnim.options.join(', ')}.
- camara: escena o 0, valor uno de: ${Camera.options.join(', ')}.
- color: escena o 0, valor uno de: ${Look.options.join(', ')}.
- zoom: escena, valor "si" o "no" (zoom de golpe al entrar).
- quitar_escena: escena.  mover_escena: escena, numero = nueva posición.
- recortar_inicio / recortar_final: escena, numero = segundos a quitar (negativo alarga).
- transicion: escena, valor uno de: ${transitions.join(', ')}, o "ninguna".
- diseno_subtitulos: valor uno de: ${CAPTION_DESIGNS.map((d) => d.id).join(', ')}.
- remarcar (cómo se resalta en los SUBTÍTULOS la palabra que está sonando; "que rebote" = rebote, "en caja" = caja, "que crezca" = crece): valor uno de: ${CAPTION_EFFECTS.map((d) => d.id).join(', ')}.
- mayusculas: valor "si" o "no".  palabras_por_linea: numero 1 a 8.
- estilo: valor uno de: ${presets.map((x) => x.id).join(', ')} (cambia todo el estilo del reel).
- intensidad: valor "suave", "media" o "fuerte".
- acabado: valor uno de ${FINISH.join(', ')} y numero 1 (activar) o 0 (quitar). progressBar = barra de progreso, grain = grano, vignette = bordes oscuros, keywordZoom = zoom en la palabra clave, halation = brillo de cine, letterbox = barras de cine.
- volumen_musica: numero entre 0 y 1.
Reglas: incluye SOLO los cambios que el pedido pide, uno por cosa pedida; no repitas lo que ya está en el reel; no uses "estilo" salvo que pidan cambiar todo el estilo; haz solo lo que se pide; no inventes datos ni cifras; los textos en pantalla salen de lo que se dice en la escena; si el pedido no se puede hacer con estas acciones, deja "cambios" vacío y explica en "respuesta" qué sí puedes hacer.`;
  const user = `${describe(project, transcript)}\n\n${focus > 0 ? `El usuario está mirando la escena ${focus}. Si no dice otra, el pedido se refiere a ella.\n` : ''}Pedido: ${request}`;

  const out = await llmJson<{ respuesta: string; cambios: Change[] }>(system, user, SCHEMA);
  await saveVersion(dir, 'antes-de-ia-local');
  // El estilo completo solo si se pidió, y primero: así no deshace los demás cambios.
  const wantsStyle = /\bestilo\b|preset/i.test(request);
  const styleChange = wantsStyle ? (out.cambios ?? []).find((c) => c.accion === 'estilo' && presets.some((x) => x.id === String(c.valor ?? '').trim())) : undefined;
  if (styleChange) await applyPreset(dir, String(styleChange.valor).trim());
  const p = await readProject(dir);
  const applied: string[] = [];
  const pick = (n?: number) => (n && n >= 1 && n <= p.scenes.length ? [p.scenes[n - 1]] : n === 0 ? p.scenes : focus > 0 ? [p.scenes[focus - 1]] : []);
  const removed = new Set<string>();
  for (const c of out.cambios ?? []) {
    const v = String(c.valor ?? '').trim();
    if (c.numero === undefined && /^-?\d+(\.\d+)?$/.test(v)) c.numero = Number(v);
    // Se descartan los cambios que dejan todo igual (el modelo a veces repite el estado actual).
    const targets = pick(c.escena);
    const same =
      (c.accion === 'diseno_subtitulos' && p.captions.design === v) || (c.accion === 'remarcar' && p.captions.effect === v) ||
      (c.accion === 'intensidad' && p.intensity === v) || (c.accion === 'mayusculas' && p.captions.uppercase === /^s/i.test(v)) ||
      (c.accion === 'acabado' && (FINISH as readonly string[]).includes(v) && p.finish[v as (typeof FINISH)[number]] === (Number(c.numero ?? 1) !== 0)) ||
      (targets.length > 0 && ((c.accion === 'camara' && targets.every((s) => s.camera === v)) || (c.accion === 'color' && targets.every((s) => s.look === v)) ||
        (c.accion === 'estilo_texto' && targets.every((s) => s.textStyle === v)) || (c.accion === 'texto' && targets.every((s) => (s.onScreenText ?? '') === v))));
    if (same || c.accion === 'estilo') continue;
    const where = c.escena === 0 ? 'todas las escenas' : `escena ${c.escena ?? focus}`;
    switch (c.accion) {
      case 'texto': {
        // El texto en pantalla va de a una escena y es corto: primera frase, máximo 7 palabras.
        if (c.escena === 0 || !targets.length) break;
        const short = v.split(/[,.;:!?]/)[0].split(/\s+/).filter(Boolean).slice(0, 7).join(' ');
        for (const s of targets) s.onScreenText = short || undefined;
        applied.push(short ? `texto «${short}» en ${where}` : `sin texto en ${where}`);
        break;
      }
      case 'estilo_texto': if (TextStyle.safeParse(v).success) { for (const s of pick(c.escena)) s.textStyle = v as never; applied.push(`estilo de texto ${v} en ${where}`); } break;
      case 'entrada_texto': if (TextAnim.safeParse(v).success) { for (const s of pick(c.escena)) s.textAnim = v as never; applied.push(`entrada ${v} en ${where}`); } break;
      case 'camara': if (Camera.safeParse(v).success) { for (const s of pick(c.escena)) s.camera = v as never; applied.push(`cámara ${v} en ${where}`); } break;
      case 'color': if (Look.safeParse(v).success) { for (const s of pick(c.escena)) s.look = v as never; applied.push(`color ${v} en ${where}`); } break;
      case 'zoom': for (const s of pick(c.escena)) s.punchZoom = /^s/i.test(v); applied.push(`${/^s/i.test(v) ? 'zoom' : 'sin zoom'} en ${where}`); break;
      case 'quitar_escena': for (const s of pick(c.escena)) removed.add(s.id); break;
      case 'mover_escena': {
        const [s] = pick(c.escena); const to = Math.round(c.numero ?? 0);
        if (s && to >= 1 && to <= p.scenes.length) { p.scenes.splice(p.scenes.indexOf(s), 1); p.scenes.splice(to - 1, 0, s); applied.push(`escena movida a la posición ${to}`); }
        break;
      }
      case 'recortar_inicio': case 'recortar_final': {
        const n = Number(c.numero); if (!Number.isFinite(n)) break;
        for (const s of pick(c.escena)) { if (c.accion === 'recortar_inicio') s.trimStart = Math.max(-5, Math.min(30, (s.trimStart ?? 0) + n)); else s.trimEnd = Math.max(-5, Math.min(30, (s.trimEnd ?? 0) + n)); }
        applied.push(`${n >= 0 ? 'recorté' : 'alargué'} ${Math.abs(n)} s ${c.accion === 'recortar_inicio' ? 'al inicio' : 'al final'} de ${where}`);
        break;
      }
      case 'transicion': for (const s of pick(c.escena)) s.transition = v === 'ninguna' || !transitions.includes(v) ? undefined : { id: v }; applied.push(v === 'ninguna' ? `sin transición en ${where}` : `transición ${v} en ${where}`); break;
      case 'diseno_subtitulos': if (CAPTION_DESIGNS.some((d) => d.id === v)) { p.captions.design = v; applied.push(`subtítulos con diseño ${v}`); } break;
      case 'remarcar': if (CAPTION_EFFECTS.some((d) => d.id === v)) { p.captions.effect = v; applied.push(`la palabra que suena se remarca con ${v}`); } break;
      case 'mayusculas': p.captions.uppercase = /^s/i.test(v); applied.push(p.captions.uppercase ? 'subtítulos en mayúsculas' : 'subtítulos en minúsculas'); break;
      case 'palabras_por_linea': { const n = Math.round(Number(c.numero)); if (n >= 1 && n <= 8) { p.captions.wordsPerLine = n; applied.push(`${n} palabras por línea`); } break; }
      case 'intensidad': if (['suave', 'media', 'fuerte'].includes(v)) { p.intensity = v as never; applied.push(`intensidad ${v}`); } break;
      case 'acabado': if ((FINISH as readonly string[]).includes(v)) { p.finish[v as (typeof FINISH)[number]] = Number(c.numero ?? 1) !== 0; applied.push(`${Number(c.numero ?? 1) !== 0 ? 'activé' : 'quité'} ${v}`); } break;
      case 'volumen_musica': { const n = Number(c.numero); if (n >= 0 && n <= 1) { p.audio.musicVolume = n; applied.push(`música al ${Math.round(n * 100)} %`); } break; }
    }
  }
  // Pedidos que la app entiende sin el modelo (más fiable que dejarlo a su criterio).
  const wpl = request.match(/(\d)\s*palabras?\s+(por|en cada)\s+l[ií]nea/i);
  if (wpl && Number(wpl[1]) >= 1 && Number(wpl[1]) <= 8 && p.captions.wordsPerLine !== Number(wpl[1])) { p.captions.wordsPerLine = Number(wpl[1]); applied.push(`${wpl[1]} palabras por línea`); }
  if (/min[uú]scula/i.test(request) && p.captions.uppercase) { p.captions.uppercase = false; applied.push('subtítulos en minúsculas'); }
  if (/may[uú]scula/i.test(request) && !/min[uú]scula/i.test(request) && !p.captions.uppercase) { p.captions.uppercase = true; applied.push('subtítulos en mayúsculas'); }
  if (removed.size && removed.size < p.scenes.length) { p.scenes = p.scenes.filter((s) => !removed.has(s.id)); applied.push(`quité ${removed.size} escena${removed.size > 1 ? 's' : ''}`); }
  await writeProject(dir, p);
  if (styleChange) applied.unshift(`estilo ${String(styleChange.valor).trim()}`);
  return { text: out.respuesta || (applied.length ? 'Listo.' : 'No encontré un cambio que pueda hacer con eso.'), applied };
}
