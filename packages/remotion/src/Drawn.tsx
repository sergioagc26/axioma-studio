import React from 'react';
import { AbsoluteFill, Img, interpolate, spring } from 'remotion';

/**
 * Estilo «pizarra»: video explicativo dibujado. Papel de fondo, una etiqueta de serie arriba, un
 * título con una palabra destacada, y la ilustración de la escena que una mano dibuja con plumón
 * (las líneas aparecen fila por fila, como un trazo) y después se colorea. Un globo de cómic
 * («¡OJO!») salta al terminar el dibujo.
 */
export const INK = '#1B1B22';
export const PURPLE = '#5B4FD6';
const LAVENDER = '#DCD7FB';
const PAPER = '#EDE8DF';

export interface DrawnSpec {
  color: string; lines: string; title?: string; burst?: string; tag?: string; draw: number;
  hand?: { src: string; tipX: number; tipY: number; armX?: number; armY?: number; armW?: number; armColor?: string }; sameTitle?: boolean;
}

/** Título con *palabras* destacadas: en cursiva con serifa, del color de acento y subrayadas. */
const Title: React.FC<{ text: string; f: number; fps: number; still: boolean; font: string; serif: string; size: number }> = ({ text, f, fps, still, font, serif, size }) => {
  const enter = still ? 1 : spring({ frame: f, fps, config: { damping: 18, stiffness: 160 }, durationInFrames: 12 });
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <div style={{ position: 'absolute', left: '7%', right: '7%', top: '8.5%', fontFamily: font, fontWeight: 700, fontSize: size, lineHeight: 1.08, letterSpacing: '-0.02em', color: INK, opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)` }}>
      {parts.map((p, i) => p.startsWith('*') ? (
        <span key={i} style={{ fontFamily: serif, fontStyle: 'italic', fontWeight: 500, color: PURPLE, letterSpacing: 0, backgroundImage: `linear-gradient(transparent 62%, ${LAVENDER} 62%, ${LAVENDER} 92%, transparent 92%)`, textDecoration: 'underline', textDecorationThickness: Math.max(2, size / 22), textUnderlineOffset: size * 0.12 }}>{p.slice(1, -1)}</span>
      ) : <span key={i}>{p}</span>)}
    </div>
  );
};

/** Globo de cómic: estrella amarilla con borde negro, puntos de trama y el texto en letra de cómic. */
const Burst: React.FC<{ text: string; f: number; fps: number; font: string; u: number }> = ({ text, f, fps, font, u }) => {
  const s = spring({ frame: f, fps, config: { damping: 7, stiffness: 210, mass: 0.6 } });
  if (f < 0) return null;
  const n = 14, R = 150, r = 112;
  const pts = Array.from({ length: n * 2 }, (_, i) => { const a = (i / (n * 2)) * Math.PI * 2; const k = i % 2 ? r : R * (0.9 + 0.1 * Math.sin(i * 7)); return `${180 + Math.cos(a) * k * 1.25},${150 + Math.sin(a) * k * 0.82}`; }).join(' ');
  return (
    <div style={{ position: 'absolute', left: '3%', top: '62%', width: 360 * u, height: 300 * u, transform: `scale(${s * 0.9}) rotate(-9deg)`, transformOrigin: '30% 60%' }}>
      <svg viewBox="0 0 360 300" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs><pattern id="trama" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="2" fill="#E8453C" /></pattern></defs>
        <polygon points={pts} fill="url(#trama)" transform="translate(14 12)" opacity={0.75} />
        <polygon points={pts} fill="#FFD43B" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: font, fontSize: 74 * u, color: '#E8453C', WebkitTextStroke: `${3 * u}px ${INK}`, paintOrder: 'stroke fill', letterSpacing: '0.02em', textShadow: `${4 * u}px ${4 * u}px 0 ${INK}` }}>{text}</div>
    </div>
  );
};

export const Drawn: React.FC<{ spec: DrawnSpec; f: number; fps: number; width: number; height: number; font: string; serif: string; comic: string; mono: string }> = ({ spec, f, fps, width, height, font, serif, comic, mono }) => {
  const u = width / 1080;
  const D = Math.round(spec.draw * fps);
  // Recuadro de la ilustración (cuadrado, al centro).
  const box = { w: 1030 * u, h: 1030 * u, x: (width - 1030 * u) / 2, y: height * 0.215 };
  // Dibujo: filas en zigzag, como quien rellena un dibujo de arriba abajo.
  const rows = 6;
  const p = D > 0 ? Math.min(1, Math.max(0, f / D)) : 1;
  const done = p * rows;
  const row = Math.min(rows - 1, Math.floor(done));
  const inRow = done - row;
  const rh = box.h / rows;
  const ltr = row % 2 === 0;
  const fx = ltr ? inRow * box.w : (1 - inRow) * box.w;
  const clip = p >= 1 ? undefined
    : `path('M0 0 H${box.w} V${row * rh} H0 Z M${ltr ? 0 : fx} ${row * rh} H${ltr ? fx : box.w} V${(row + 1) * rh} H${ltr ? 0 : fx} Z')`;
  // Color: entra cuando termina el trazo.
  const colorIn = D > 0 ? interpolate(f, [D, D + 0.5 * fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  const pop = D > 0 ? 1 : spring({ frame: f, fps, config: { damping: 16, stiffness: 170 }, durationInFrames: 12 });
  // La mano: entra por la derecha, sigue la punta del trazo con un pequeño temblor y se va.
  const tip = { x: box.x + fx + Math.sin(f * 1.7) * 6 * u, y: box.y + (row + 0.55) * rh + Math.cos(f * 2.3) * 9 * u };
  const handIn = interpolate(f, [-4, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const handOut = interpolate(f, [D, D + 0.45 * fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const hw = 620 * u;
  const hx = tip.x - (spec.hand?.tipX ?? 0) * hw + (1 - handIn) * 500 * u + handOut * 700 * u;
  const hy = tip.y - (spec.hand?.tipY ?? 0) * hw + handOut * 160 * u;
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {/* Papel: viñeta muy suave y fibra. */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.55), transparent 65%), radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(120,100,70,0.12) 100%)' }} />
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, opacity: 0.18, mixBlendMode: 'multiply' }}>
        <filter id="fibra"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" /><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.32  0 0 0 0.55 0" /></filter>
        <rect width="100%" height="100%" filter="url(#fibra)" />
      </svg>
      {spec.tag ? (
        <div style={{ position: 'absolute', left: '50%', top: '4.4%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10 * u, padding: `${7 * u}px ${18 * u}px`, borderRadius: 999, border: `${2.5 * u}px solid ${INK}`, backgroundColor: 'rgba(255,255,255,0.55)', fontFamily: mono, fontSize: 21 * u, fontWeight: 700, letterSpacing: '0.12em', color: INK, whiteSpace: 'nowrap' }}>
          <span style={{ width: 9 * u, height: 9 * u, borderRadius: 9, backgroundColor: INK }} />{spec.tag.toUpperCase()}
        </div>
      ) : null}
      {spec.title ? <Title text={spec.title} f={f} fps={fps} still={Boolean(spec.sameTitle)} font={font} serif={serif} size={74 * u} /> : null}
      {/* El blanco del dibujo se funde con el papel (multiplicar): la capa entera se mezcla con el fondo. */}
      <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, mixBlendMode: 'multiply', opacity: Math.min(1, pop * 1.5), transform: pop < 1 ? `scale(${interpolate(pop, [0, 1], [0.94, 1])})` : undefined }}>
        <Img src={spec.lines} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', clipPath: clip, opacity: 1 - colorIn * 0.85 }} />
        {colorIn > 0 ? <Img src={spec.color} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: colorIn }} /> : null}
      </div>
      {spec.burst ? <Burst text={spec.burst} f={f - D - Math.round(0.35 * fps)} fps={fps} font={comic} u={u} /> : null}
      {spec.hand && D > 0 && handOut < 1 ? (
        <>
          {/* La manga sigue hasta salir del cuadro (abajo a la derecha), como un brazo de verdad. */}
          {spec.hand.armX !== undefined ? (
            <div style={{ position: 'absolute', left: hx + spec.hand.armX * hw, top: hy + spec.hand.armY! * hw, width: spec.hand.armW! * hw * 0.92, height: 2200 * u, backgroundColor: spec.hand.armColor, transform: 'translate(-50%, -6%) rotate(-38deg)', transformOrigin: '50% 0', borderRadius: 30 * u, boxShadow: '0 18px 22px rgba(60,40,20,0.28)' }} />
          ) : null}
          <Img src={spec.hand.src} style={{ position: 'absolute', left: hx, top: hy, width: hw, filter: 'drop-shadow(0 18px 22px rgba(60,40,20,0.28))' }} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
