import type { Project, Transcript } from './project.ts';
import { speechOf } from './suggest.ts';
import { sceneLength } from './timeline.ts';

/**
 * Puntaje del reel (0–100), como el puntaje viral de Opus Clip pero explicando por qué: lo que
 * más pesa en que la gente se quede (gancho, ritmo, que pase algo en pantalla, subtítulos,
 * duración, cierre y audio). Cada parte dice cómo subirla.
 */
export interface ScorePart { id: string; label: string; points: number; max: number; tip?: string }
export interface ReelScore { score: number; grade: 'excelente' | 'bueno' | 'mejorable' | 'flojo'; parts: ScorePart[] }

const HOOK_WORDS = /\b(nadie|nunca|error|secreto|deja|dejar|verdad|mentira|cómo|como|por qué|porque|si quieres|esto|así|mira|ojo|cuidado|gratis|dinero|\d+)\b/i;

export function reelScore(p: Project, t: Transcript | null): ReelScore {
  const scenes = p.scenes;
  const lens = scenes.map((s) => sceneLength(s));
  const total = lens.reduce((a, b) => a + b, 0);
  const parts: ScorePart[] = [];
  if (!scenes.length) return { score: 0, grade: 'flojo', parts: [] };
  const first = scenes[0];

  // 1. Gancho (25): texto en el primer segundo, que la primera frase atrape y entre rápido.
  let hook = 0;
  const firstText = first.onScreenText?.trim() ?? '';
  if (firstText) hook += 10;
  const said = speechOf(first, t);
  if (first.id === 'adelanto' || /\?/.test(said) || HOOK_WORDS.test(said) || HOOK_WORDS.test(firstText)) hook += 10;
  if (lens[0] <= 4) hook += 5;
  parts.push({ id: 'gancho', label: 'Gancho', points: hook, max: 25,
    tip: hook >= 25 ? undefined : !firstText ? 'Pon un texto de gancho en la primera escena (o usa «Editar todo con IA»).' : hook < 20 ? 'Abre con tu frase más fuerte: «Poner la frase más fuerte en el primer segundo».' : 'Acorta la primera escena a menos de 4 s.' });

  // 2. Ritmo (20): planos de 1,5–4 s; los zooms y cambios de cámara cuentan como cambio.
  const changes = scenes.length + scenes.filter((s) => s.punchZoom).length;
  const avg = total / Math.max(1, changes);
  const pace = avg >= 1.5 && avg <= 4 ? 20 : avg < 1.5 ? 14 : avg <= 6 ? 12 : 6;
  parts.push({ id: 'ritmo', label: 'Ritmo', points: pace, max: 20,
    tip: pace === 20 ? undefined : avg > 4 ? `Cada plano dura ${avg.toFixed(1)} s: corta más seguido o pon zooms y b-roll (estilo «Rápido»).` : 'Los cortes van muy rápido para seguir lo que dices: prueba el estilo «Con ritmo».' });

  // 3. Que pase algo en pantalla (15): textos, gráficos, b-roll, cámara.
  const busy = scenes.filter((s) => s.onScreenText || s.visual !== 'original' || s.camera !== 'ninguno' || s.punchZoom).length / scenes.length;
  const visual = Math.round(15 * Math.min(1, busy / 0.6));
  parts.push({ id: 'visual', label: 'Movimiento en pantalla', points: visual, max: 15,
    tip: visual >= 15 ? undefined : `Solo en ${Math.round(busy * 100)} % de las escenas pasa algo (texto, gráfico, b-roll o cámara). Usa las variantes de cada escena.` });

  // 4. Subtítulos (15): siempre hay; suma remarcar la palabra clave y el zoom en ella.
  const caps = 9 + (p.captions.emphasis ? 3 : 0) + (p.finish.keywordZoom ? 3 : 0);
  parts.push({ id: 'subtitulos', label: 'Subtítulos', points: caps, max: 15,
    tip: caps >= 15 ? undefined : 'Activa «Remarcar la palabra más importante» y el zoom en la palabra clave.' });

  // 5. Duración (10): en reels, 15–45 s retiene mejor.
  const dur = total >= 15 && total <= 45 ? 10 : total < 15 ? 7 : total <= 60 ? 7 : total <= 90 ? 4 : 2;
  parts.push({ id: 'duracion', label: 'Duración', points: dur, max: 10,
    tip: dur === 10 ? undefined : total > 45 ? `Dura ${Math.round(total)} s: entre 15 y 45 s retiene mejor. Quita partes en «Texto» o elige una duración en el brief.` : 'Es muy corto: suma una escena con contexto o un cierre.' });

  // 6. Cierre (10): última escena con llamado a la acción.
  const last = scenes[scenes.length - 1];
  const cta = last.role === 'cta' || /(s[ií]gue|comenta|guarda|comparte|link|enlace|escr[ií]be|dm|bio|suscr)/i.test(`${last.onScreenText ?? ''} ${speechOf(last, t)}`);
  parts.push({ id: 'cierre', label: 'Cierre', points: cta ? 10 : 3, max: 10,
    tip: cta ? undefined : 'Termina con un llamado a la acción: «Sígueme», «Guárdalo», «Comenta…».' });

  // 7. Audio (5): música o efectos, y la voz realzada.
  const audio = (p.audio.music || p.audio.sfxAuto || p.scenes.some((s) => s.sfx?.length) ? 3 : 0) + (p.audio.enhance || p.kind === 'montaje' ? 2 : 0);
  parts.push({ id: 'audio', label: 'Audio', points: audio, max: 5,
    tip: audio >= 5 ? undefined : !p.audio.music && !p.audio.sfxAuto ? 'Pon música de fondo o efectos de sonido automáticos (Audio).' : 'Activa «Realzar la voz» en Audio.' });

  const score = Math.round(parts.reduce((a, x) => a + x.points, 0));
  const grade = score >= 85 ? 'excelente' : score >= 70 ? 'bueno' : score >= 50 ? 'mejorable' : 'flojo';
  return { score, grade, parts };
}
