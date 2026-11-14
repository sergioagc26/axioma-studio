import React, { useEffect, useRef, useState } from 'react';
import { Axi, type AxiColor, type AxiState } from '@axioma/remotion/src/Axi.tsx';

export type { AxiState } from '@axioma/remotion/src/Axi.tsx';

/** Si la persona pidió menos movimiento, Axi se queda quieto (sigue mostrando su estado). */
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Axi animado en la app: un reloj mueve su animación (la misma que en los videos de Remotion).
 * Al cambiar de estado, la animación empieza de cero (el salto de «listo», la sacudida del error).
 */
export const AxiLive: React.FC<{ state?: AxiState; size?: number; color?: AxiColor; progress?: number; title?: string; style?: React.CSSProperties }> = ({ state = 'despierto', size = 40, color, progress, title, style }) => {
  const [t, setT] = useState(0);
  const start = useRef(performance.now());
  const still = reduced();
  useEffect(() => {
    start.current = performance.now();
    setT(0);
    if (still) return;
    let raf = 0;
    // A 30 cuadros por segundo basta para un ícono (y gasta menos).
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 33) { last = now; setT((now - start.current) / 1000); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, still]);
  return <Axi state={state} t={t} size={size} color={color ?? (document.documentElement.dataset.theme === 'claro' ? 'petroleo' : 'lima')} progress={progress} still={still} title={title} style={style} />;
};

/** Qué hace Axi según lo que está haciendo la app (tipo de trabajo y su mensaje). */
export function axiForJob(kind: string | undefined, message = ''): AxiState {
  const m = message.toLowerCase();
  if (/cancel/.test(m)) return 'dormido';
  if (/subt[ií]t|transcrib|escuchando lo que se dice|escribiendo/.test(m)) return 'subtitulando';
  if (/m[uú]sica|ritmo|golpes|voz/.test(m)) return 'escuchando';
  if (/color|lut|paleta/.test(m)) return 'color';
  if (/broll|b-roll|tomas|mirando|buscando|bajando/.test(m)) return 'buscando';
  if (kind === 'render' || /export/.test(m)) return 'renderizando';
  if (kind === 'crear' || /cort|armando|montaje/.test(m)) return 'cortando';
  return 'pensando';
}

/** Axi para un aviso: listo cuando algo terminó bien, error cuando falló. */
export function axiForToast(msg: string): AxiState | null {
  if (/no se pudo|no pude|fall[oó]|error|no existe|no hay|no deja|falta|demasiado|inv[aá]lid/i.test(msg)) return 'error';
  if (/^listo|listo\.|exportad|guardad|lista y|quedó|analizad|sincronizad|copiad/i.test(msg)) return 'listo';
  return null;
}
