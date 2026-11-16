import React from 'react';
import { AbsoluteFill, interpolate, OffthreadVideo, spring } from 'remotion';

/**
 * Piezas de los reels «de creador»: palabras gigantes que salen al ritmo de la voz (también
 * detrás de la persona), etiquetas en píldora, texto en una pantalla vieja, y grabaciones de
 * pantalla flotando en 3D.
 */
export interface KineticWord {
  text: string; from: number; to: number;
  color: 'blanco' | 'rojo' | 'amarillo' | 'negro';
  x: number; y: number; size: number; behind: boolean;
  style: 'gigante' | 'pildora' | 'pantalla';
}

const COLORS = { blanco: '#FFFFFF', rojo: '#E8261F', amarillo: '#F6E60B', negro: '#111114' } as const;

/** Una palabra (o frase corta) con su entrada: crece desde un poco más chica y se enfoca. */
export const Word: React.FC<{ w: KineticWord; f: number; fps: number; width: number; font: string; mono: string }> = ({ w, f, fps, width, font, mono }) => {
  if (f < w.from || f >= w.to) return null;
  const local = f - w.from;
  const u = width / 1080;
  const s = spring({ frame: local, fps, config: { damping: 14, stiffness: 230 }, durationInFrames: 9 });
  const out = interpolate(f, [w.to - 4, w.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const base: React.CSSProperties = { position: 'absolute', left: `${w.x * 100}%`, top: `${w.y * 100}%`, transform: `translate(-50%, -50%) scale(${interpolate(s, [0, 1], [0.82, 1])})`, opacity: Math.min(1, s * 1.6) * out, whiteSpace: 'nowrap' };
  if (w.style === 'pildora') {
    // Etiqueta oscura con borde claro (como «Le pegas un archivo»).
    return <div style={{ ...base, fontFamily: font, fontWeight: 600, fontSize: 40 * u * w.size, color: '#F2F2F2', padding: `${14 * u}px ${30 * u}px`, borderRadius: 999, border: `${2 * u}px solid rgba(255,255,255,0.28)`, background: 'rgba(30,30,32,0.72)', backdropFilter: 'blur(6px)' }}>{w.text}</div>;
  }
  if (w.style === 'pantalla') {
    // Texto en una pantalla de computadora vieja: monoespaciado, verde claro con brillo y un cursor.
    const typed = w.text.slice(0, Math.ceil(local * 1.3));
    return <div style={{ ...base, transform: 'translate(-50%, -50%)', opacity: out, fontFamily: mono, fontWeight: 700, fontSize: 58 * u * w.size, lineHeight: 1.15, color: '#E9F5E4', textShadow: '0 0 10px rgba(200,255,200,0.7)', whiteSpace: 'pre', textAlign: 'left' }}>{typed}<span style={{ opacity: Math.floor(local / 8) % 2 ? 0 : 1 }}>_</span></div>;
  }
  const color = COLORS[w.color];
  const glow = w.color === 'blanco' ? `0 0 ${18 * u}px rgba(255,255,255,0.55), 0 ${6 * u}px ${30 * u}px rgba(0,0,0,0.35)` : w.color === 'amarillo' ? `0 0 ${22 * u}px rgba(246,230,11,0.35)` : 'none';
  return (
    <div style={{ ...base, fontFamily: font, fontWeight: 800, fontSize: 150 * u * w.size, letterSpacing: '-0.035em', lineHeight: 1, color, textShadow: glow, filter: `blur(${interpolate(s, [0, 1], [6, 0])}px)` }}>{w.text}</div>
  );
};

/** Las palabras de un tramo; las de «detrás» quedan bajo la persona recortada (si hay recorte). */
export const Words: React.FC<{ words: KineticWord[]; f: number; fps: number; width: number; font: string; mono: string; layer: 'detras' | 'delante' }> = ({ words, f, fps, width, font, mono, layer }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {words.filter((w) => (layer === 'detras') === w.behind).map((w, i) => <Word key={i} w={w} f={f} fps={fps} width={width} font={font} mono={mono} />)}
  </AbsoluteFill>
);

/**
 * Grabación de pantalla flotando en 3D: una ventana con esquinas redondas y sombra que entra
 * girando y queda en perspectiva, girando muy lento, sobre fondo claro o oscuro.
 */
export const FloatScreen: React.FC<{ src: string; trimBefore: number; f: number; fps: number; width: number; height: number; bg: 'claro' | 'oscuro'; filter?: string }> = ({ src, trimBefore, f, fps, width, height, bg, filter }) => {
  const u = width / 1080;
  const s = spring({ frame: f, fps, config: { damping: 20, stiffness: 90 }, durationInFrames: 22 });
  const t = f / fps;
  const ry = interpolate(s, [0, 1], [34, 14]) - t * 1.6;
  const rx = interpolate(s, [0, 1], [18, 9]);
  const w = 1040 * u, h = w * 9 / 16;
  const light = bg === 'claro';
  return (
    <AbsoluteFill style={{ background: light ? 'radial-gradient(ellipse at 50% 40%, #FFFFFF 0%, #ECECEA 55%, #D9D9D6 100%)' : 'radial-gradient(ellipse at 50% 40%, #2A2A2E 0%, #121214 60%, #070708 100%)', perspective: 1800 * u }}>
      <div style={{ position: 'absolute', left: '50%', top: '52%', width: w, height: h, transform: `translate(-50%, -50%) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${-2 + t * 0.3}deg) scale(${interpolate(s, [0, 1], [0.86, 1.02]) + t * 0.006})`, transformStyle: 'preserve-3d' }}>
        <div style={{ position: 'absolute', inset: -10 * u, borderRadius: 26 * u, background: light ? '#2B2B2F' : '#1C1C1F', boxShadow: light ? `0 ${60 * u}px ${80 * u}px rgba(0,0,0,0.28), 0 ${12 * u}px ${24 * u}px rgba(0,0,0,0.18)` : `0 ${60 * u}px ${90 * u}px rgba(0,0,0,0.75), 0 0 0 ${1.5 * u}px rgba(255,255,255,0.08)` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 18 * u, overflow: 'hidden', backgroundColor: '#000' }}>
          <OffthreadVideo src={src} trimBefore={trimBefore} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 40%, transparent 60%)' }} />
        </div>
      </div>
      {/* Reflejo en el piso. */}
      <div style={{ position: 'absolute', left: '50%', top: '74%', width: w * 0.8, height: 60 * u, transform: 'translateX(-50%)', borderRadius: '50%', background: light ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.6)', filter: `blur(${30 * u}px)` }} />
    </AbsoluteFill>
  );
};
