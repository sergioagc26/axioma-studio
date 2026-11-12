import type { Project, Transcript } from './project.ts';
import { shortPhrases, speechOf } from './suggest.ts';
import { effectiveRanges } from './timeline.ts';

/**
 * Una mejora que la app detecta y el usuario decide si aplicar (como «Auto Edits» de VEED).
 * `fix` cambia el proyecto en el navegador; `op` es una operación del servidor.
 */
export interface Advice {
  id: string;
  title: string;
  why: string;
  fix?: (p: Project) => void;
  op?: Record<string, unknown>;
  /** Pestaña a la que llevar si el arreglo necesita algo del usuario (por ejemplo, subir música). */
  go?: 'audio' | 'brief';
}

const dur = (p: Project) => p.scenes.reduce((a, s) => a + effectiveRanges(s, p.source.duration).reduce((b, r) => b + r.end - r.start, 0), 0);

/** Revisa el reel y devuelve las mejoras que más suben la calidad, en orden de impacto. */
export function adviseProject(p: Project, transcript: Transcript | null): Advice[] {
  const out: Advice[] = [];
  const talk = p.kind === 'hablado';
  const first = p.scenes[0];
  const last = p.scenes[p.scenes.length - 1];
  const seconds = dur(p);

  if (talk && first && !first.onScreenText && first.visual === 'original') {
    const hook = shortPhrases(speechOf(first, transcript))[0];
    if (hook) out.push({
      id: 'gancho', title: 'Poner el gancho en pantalla',
      why: `El primer segundo no tiene texto. Los reels que retienen muestran el gancho de entrada: «${hook}».`,
      fix: (x) => { x.scenes[0].onScreenText = hook; x.scenes[0].textStyle = 'gigante'; x.scenes[0].punchZoom = true; },
    });
  }
  if (talk && !p.audio.enhance) out.push({
    id: 'voz', title: 'Voz de estudio',
    why: 'Ecualiza, quita las «s» molestas y comprime la voz para que suene como en un estudio.',
    op: { op: 'corregir-audio', enhance: true },
  });
  if (!p.finish.keywordZoom && talk) out.push({
    id: 'zoom', title: 'Zoom en la palabra importante',
    why: 'Un acercamiento suave en la palabra clave de cada frase mantiene el ritmo sin cortes.',
    fix: (x) => { x.finish.keywordZoom = true; },
  });
  const still = p.scenes.filter((s) => s.visual === 'original' && s.camera === 'ninguno' && effectiveRanges(s, p.source.duration).reduce((a, r) => a + r.end - r.start, 0) > 6);
  if (still.length) out.push({
    id: 'quietas', title: `Mover la cámara en ${still.length} escena${still.length > 1 ? 's' : ''} larga${still.length > 1 ? 's' : ''}`,
    why: 'Más de 6 segundos con la imagen quieta cansan. Un acercamiento lento lo evita.',
    fix: (x) => { const ids = new Set(still.map((s) => s.id)); x.scenes.forEach((s) => { if (ids.has(s.id)) s.camera = 'acercar'; }); },
  });
  if (seconds > 20 && !p.finish.progressBar) out.push({
    id: 'progreso', title: 'Barra de progreso',
    why: `El reel dura ${Math.round(seconds)} s. Una barra arriba ayuda a que la gente se quede hasta el final.`,
    fix: (x) => { x.finish.progressBar = true; },
  });
  if (!p.audio.sfxAuto) out.push({
    id: 'sonidos', title: 'Sonidos en transiciones y textos',
    why: 'Un barrido en cada transición y un «pop» al entrar un texto dan sensación de edición profesional.',
    op: { op: 'efectos-auto', on: true },
  });
  if (!p.audio.music) out.push({
    id: 'musica', title: 'Música de fondo', why: 'Sin música el reel se siente vacío. Se baja sola cuando hablas.', go: 'audio',
  });
  if (last && p.scenes.length > 1 && !last.onScreenText) {
    const cta = (p.brief.cta && !/digo en el video/i.test(p.brief.cta) ? p.brief.cta : '') || 'Sígueme para más';
    out.push({
      id: 'cierre', title: 'Llamado a la acción al final',
      why: `La última escena no pide nada. Propuesta: «${cta}».`,
      fix: (x) => { const l = x.scenes[x.scenes.length - 1]; l.onScreenText = cta; l.textStyle = 'banda'; l.textPosition = 'arriba'; },
    });
  }
  if (talk && !p.captions.emphasis) out.push({
    id: 'remarcar', title: 'Remarcar la palabra importante en los subtítulos',
    why: 'La palabra clave de cada línea en otro color guía la lectura.',
    fix: (x) => { x.captions.emphasis = true; },
  });
  if (seconds > 60) out.push({
    id: 'largo', title: `El reel dura ${Math.round(seconds)} s`,
    why: 'Los reels con más alcance suelen durar 30–45 s. Elige una duración en el brief y vuelve a crear la edición.', go: 'brief',
  });
  return out;
}
