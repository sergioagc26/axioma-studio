import { z } from 'zod';
import type { Project, Scene } from './project.ts';

/** Animación de una capa: cada propiedad va de [inicio, fin] durante la transición. */
export const LayerMotion = z.object({
  opacidad: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  /** Desplazamiento horizontal en % del ancho. */
  x: z.tuple([z.number().min(-150).max(150), z.number().min(-150).max(150)]).optional(),
  /** Desplazamiento vertical en % del alto. */
  y: z.tuple([z.number().min(-150).max(150), z.number().min(-150).max(150)]).optional(),
  escala: z.tuple([z.number().min(0.1).max(4), z.number().min(0.1).max(4)]).optional(),
  /** Giro en grados. */
  giro: z.tuple([z.number().min(-180).max(180), z.number().min(-180).max(180)]).optional(),
  /** Desenfoque en píxeles. */
  desenfoque: z.tuple([z.number().min(0).max(60), z.number().min(0).max(60)]).optional(),
});
export type LayerMotion = z.infer<typeof LayerMotion>;

/**
 * Una transición es un dato, no código: cómo entra la escena nueva, cómo sale
 * la anterior y un destello opcional. Así Claude puede crear transiciones
 * nuevas sin tocar el programa.
 */
export const TransitionSpec = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string().default(''),
  /** Duración en segundos. */
  duration: z.number().min(0.1).max(1.5).default(0.35),
  easing: z.enum(['lineal', 'suave', 'rebote']).default('suave'),
  entra: LayerMotion.default({}),
  sale: LayerMotion.default({}),
  destello: z.object({ color: z.string().default('#FFFFFF'), pico: z.number().min(0).max(1).default(0.9) }).optional(),
  /** Para qué estilos sirve (lo usa la recomendación). */
  tags: z.array(z.string()).default([]),
});
export type TransitionSpec = z.infer<typeof TransitionSpec>;

const t = (x: z.input<typeof TransitionSpec>) => TransitionSpec.parse(x);

export const BUILTIN_TRANSITIONS: TransitionSpec[] = [
  t({ id: 'fundido', name: 'Fundido', description: 'La escena nueva aparece suavemente sobre la anterior. Calma y limpia.', duration: 0.4, entra: { opacidad: [0, 1] }, tags: ['sobrio'] }),
  t({ id: 'deslizar-izquierda', name: 'Deslizar a la izquierda', description: 'La nueva empuja a la anterior hacia la izquierda. Para pasar a la siguiente idea.', duration: 0.35, entra: { x: [100, 0] }, sale: { x: [0, -100] }, tags: ['ritmo'] }),
  t({ id: 'deslizar-arriba', name: 'Deslizar hacia arriba', description: 'La nueva sube desde abajo. Buena para entrar a b-roll o gráficos.', duration: 0.35, entra: { y: [100, 0] }, sale: { y: [0, -100] }, tags: ['ritmo'] }),
  t({ id: 'zoom', name: 'Zoom', description: 'La nueva entra desde un acercamiento. Da energía sin marear.', duration: 0.3, entra: { escala: [1.6, 1], opacidad: [0, 1] }, sale: { escala: [1, 0.75] }, tags: ['rapido', 'ritmo'] }),
  t({ id: 'giro', name: 'Barrido rápido', description: 'Barrido lateral con desenfoque, como un giro de cámara. Muy dinámico.', duration: 0.25, easing: 'suave', entra: { x: [60, 0], desenfoque: [24, 0] }, sale: { x: [0, -60], desenfoque: [0, 24] }, tags: ['rapido'] }),
  t({ id: 'destello', name: 'Destello', description: 'Un golpe de luz blanca tapa el cambio. Para momentos clave y el cierre.', duration: 0.3, entra: { opacidad: [0, 1] }, destello: { color: '#FFFFFF', pico: 0.9 }, tags: ['rapido', 'ritmo'] }),
  t({ id: 'desenfoque', name: 'Desenfoque', description: 'La anterior se desenfoca y la nueva se enfoca. Elegante.', duration: 0.45, entra: { desenfoque: [30, 0], opacidad: [0, 1] }, sale: { desenfoque: [0, 30] }, tags: ['sobrio'] }),
  t({ id: 'golpe', name: 'Golpe', description: 'La nueva entra con un pequeño rebote. Para remarcar una frase.', duration: 0.3, easing: 'rebote', entra: { escala: [0.82, 1] }, tags: ['rapido'] }),
  t({ id: 'rotar', name: 'Giro con zoom', description: 'La nueva entra girando un poco mientras se acerca. Llamativa: úsala poco.', duration: 0.35, entra: { giro: [-12, 0], escala: [1.35, 1], opacidad: [0, 1] }, tags: ['rapido'] }),
  t({ id: 'luz-calida', name: 'Luz cálida', description: 'Un destello naranja como un rayo de sol tapa el cambio. Cálida y cinematográfica.', duration: 0.45, entra: { escala: [1.12, 1], opacidad: [0, 1] }, destello: { color: '#FFB347', pico: 1 }, tags: ['dinamico', 'creador'] }),
  t({ id: 'luz-amarilla', name: 'Luz amarilla', description: 'Estallido de luz amarilla en el cambio de idea. Da energía.', duration: 0.35, entra: { escala: [1.18, 1], opacidad: [0, 1] }, destello: { color: '#FFE033', pico: 1 }, tags: ['dinamico', 'creador'] }),
  t({ id: 'luz-magenta', name: 'Luz magenta', description: 'Inundación de luz magenta de neón entre escenas. Tecnología y energía.', duration: 0.35, entra: { escala: [1.1, 1], opacidad: [0, 1] }, destello: { color: '#FF2BD6', pico: 0.95 }, tags: ['dinamico', 'tecnologia'] }),
  t({ id: 'luz-cian', name: 'Luz cian', description: 'Inundación de luz cian. Limpia, de tecnología.', duration: 0.35, entra: { escala: [1.1, 1], opacidad: [0, 1] }, destello: { color: '#22E5FF', pico: 0.95 }, tags: ['dinamico', 'tecnologia'] }),
  t({ id: 'luz-blanca', name: 'Luz blanca larga', description: 'Blanco total que se disuelve con desenfoque, para entrar a un gráfico sobre fondo claro.', duration: 0.5, entra: { desenfoque: [14, 0], opacidad: [0, 1] }, sale: { desenfoque: [0, 14] }, destello: { color: '#FFFFFF', pico: 1 }, tags: ['dinamico', 'sobrio'] }),
  t({ id: 'zoom-luz', name: 'Zoom con luz', description: 'Acercamiento fuerte con un destello cálido. Para el golpe de la frase clave.', duration: 0.3, easing: 'rebote', entra: { escala: [1.55, 1], opacidad: [0, 1] }, sale: { escala: [1, 0.8] }, destello: { color: '#FFD27A', pico: 0.9 }, tags: ['rapido', 'dinamico'] }),
  t({ id: 'tarjeta', name: 'Tarjeta que se achica', description: 'La escena nueva entra pequeña y crece, como una tarjeta que se abre. Para pasar de la persona a un gráfico.', duration: 0.4, easing: 'rebote', entra: { escala: [0.7, 1], opacidad: [0, 1] }, sale: { escala: [1, 1.12], desenfoque: [0, 10] }, tags: ['dinamico', 'creador'] }),
];

export function findTransition(id: string | undefined, custom: TransitionSpec[] = []): TransitionSpec | undefined {
  return id ? [...custom, ...BUILTIN_TRANSITIONS].find((x) => x.id === id) : undefined;
}

export type Easing = TransitionSpec['easing'];

/** Curva de avance de 0 a 1. */
export function ease(kind: Easing, p: number): number {
  const x = Math.min(1, Math.max(0, p));
  if (kind === 'lineal') return x;
  if (kind === 'rebote') {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  }
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Estilo CSS de una capa en el avance `p` (ya con la curva aplicada). */
export function layerStyle(m: LayerMotion, p: number): { opacity?: number; transform?: string; filter?: string } {
  const at = (v?: [number, number]) => (v ? v[0] + (v[1] - v[0]) * p : undefined);
  const tr: string[] = [];
  const x = at(m.x), y = at(m.y), s = at(m.escala), r = at(m.giro), b = at(m.desenfoque);
  if (x !== undefined || y !== undefined) tr.push(`translate(${x ?? 0}%, ${y ?? 0}%)`);
  if (s !== undefined) tr.push(`scale(${s})`);
  if (r !== undefined) tr.push(`rotate(${r}deg)`);
  const o = at(m.opacidad);
  return {
    ...(o !== undefined ? { opacity: Math.min(1, Math.max(0, o)) } : {}),
    ...(tr.length ? { transform: tr.join(' ') } : {}),
    ...(b !== undefined && b > 0.05 ? { filter: `blur(${b.toFixed(1)}px)` } : {}),
  };
}

export interface TransitionAdvice { sceneId: string; transition: string | null; reason: string }

/**
 * Recomienda la transición de entrada de cada escena según el estilo:
 * - rápido o montaje: casi todo corte seco, con golpes de energía cada pocas escenas;
 * - con ritmo: transiciones visibles pero cortas en los cambios de idea;
 * - sobrio: fundidos.
 * Entrar a b-roll o gráficos, y al cierre, tiene su propia regla.
 */
export function recommendTransitions(project: Project): TransitionAdvice[] {
  const style = project.kind === 'montaje' || project.pacing.maxPause <= 0.22 ? 'rapido' : project.pacing.maxPause <= 0.42 ? 'ritmo' : 'sobrio';
  const visual = (s: Scene) => (s.chosenVariant ? s.variants.find((v) => v.id === s.chosenVariant)?.visual : undefined) ?? s.visual;
  const out: TransitionAdvice[] = [];
  let accent = 0;
  project.scenes.forEach((s, i) => {
    if (i === 0) return void out.push({ sceneId: s.id, transition: null, reason: 'Primera escena: el gancho entra sin transición.' });
    const prev = project.scenes[i - 1];
    const v = visual(s);
    const last = i === project.scenes.length - 1;
    if (style === 'sobrio') {
      if (v === 'motion' || v === 'texto') return void out.push({ sceneId: s.id, transition: 'desenfoque', reason: 'Estilo sobrio: desenfoque para entrar al gráfico.' });
      return void out.push({ sceneId: s.id, transition: 'fundido', reason: 'Estilo sobrio: fundido suave entre ideas.' });
    }
    if (project.presetId === 'creador-neon') {
      // Estilo de creador con neón (sacado de reels de referencia): cada cambio entra con una luz de color distinto.
      if (last || s.role === 'cta') return void out.push({ sceneId: s.id, transition: 'luz-blanca', reason: 'Cierre: luz blanca larga hacia el llamado a la acción.' });
      if (v !== 'original' && visual(prev) === 'original') return void out.push({ sceneId: s.id, transition: 'tarjeta', reason: 'Entra un gráfico: la escena se abre como tarjeta.' });
      const pick = ['luz-calida', 'zoom-luz', 'luz-magenta', 'luz-cian', 'luz-amarilla'][accent++ % 5];
      return void out.push({ sceneId: s.id, transition: pick, reason: 'Estilo neón: destello de luz de color en cada cambio de escena.' });
    }
    if (last || s.role === 'cta') return void out.push({ sceneId: s.id, transition: 'destello', reason: 'Cierre: un destello marca el llamado a la acción.' });
    if (v !== 'original' && visual(prev) === 'original') {
      return void out.push({ sceneId: s.id, transition: 'deslizar-arriba', reason: 'Entra b-roll o gráfico: sube desde abajo para separar del presentador.' });
    }
    if (style === 'rapido') {
      // Dos cortes secos y un golpe de energía, alternando.
      if (i % 3 === 0) {
        const pick = ['giro', 'zoom', 'golpe'][accent++ % 3];
        return void out.push({ sceneId: s.id, transition: pick, reason: 'Estilo rápido: un golpe de energía cada tres escenas.' });
      }
      return void out.push({ sceneId: s.id, transition: null, reason: 'Estilo rápido: corte seco para no frenar el ritmo.' });
    }
    if (s.role !== prev.role && s.role !== 'otro') {
      const pick = ['deslizar-izquierda', 'zoom'][accent++ % 2];
      return void out.push({ sceneId: s.id, transition: pick, reason: 'Cambia la idea: transición corta para marcarlo.' });
    }
    return void out.push({ sceneId: s.id, transition: i % 2 ? null : 'deslizar-izquierda', reason: i % 2 ? 'Misma idea: corte seco.' : 'Con ritmo: desliza a la siguiente parte.' });
  });
  return out;
}
