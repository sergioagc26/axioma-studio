import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo } from 'remotion';

/**
 * «Toma de escritorio»: el video (una grabación de pantalla) dentro de un monitor sobre un
 * escritorio con luz de ambiente, y la cámara en mano que respira, como una toma hecha con el
 * celular. La cámara usa el tiempo absoluto: entre escenas solo cambia lo que muestra la pantalla.
 */
export const DeskShot: React.FC<{
  src: string; trimBefore: number; absFrame: number; fps: number; width: number; height: number;
  accent: string; name?: string; font?: string; filter?: string;
  /** Foto real del escritorio con la pantalla transparente y sus 4 esquinas (0..1). */
  photo?: { src: string; screen: number[] };
}> = ({ src, trimBefore, absFrame, fps, width, height, accent, name, font, filter, photo }) => {
  const u = width / 1080;
  const s = absFrame / fps;
  // Cámara en mano: varias ondas lentas sumadas (nunca se repite igual) y un acercamiento muy lento.
  const hx = (Math.sin(s * 0.71) * 9 + Math.sin(s * 1.93 + 1) * 3.5 + Math.sin(s * 3.7) * 1.2) * u;
  const hy = (Math.cos(s * 0.53) * 7 + Math.sin(s * 1.41 + 2) * 3 + Math.cos(s * 4.1) * 1) * u;
  const rot = Math.sin(s * 0.37) * 0.7 + Math.sin(s * 1.3) * 0.2;
  const push = 1.06 + Math.min(0.05, s * 0.004);
  if (photo) {
    // La grabación se deforma para calzar exacto en las 4 esquinas de la pantalla de la foto, y la
    // foto va encima (su pantalla es transparente): el marco y lo que está delante tapan los bordes.
    const W = 1600, H = 900;
    const q = photo.screen.map((v, i) => v * (i % 2 ? height : width));
    const cx = (q[0] + q[2] + q[4] + q[6]) / 4, cy = (q[1] + q[3] + q[5] + q[7]) / 4;
    const g = q.map((v, i) => (i % 2 ? cy + (v - cy) * 1.012 : cx + (v - cx) * 1.012));
    return (
      <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#120818' }}>
        <AbsoluteFill style={{ transform: `translate(${hx}px, ${hy}px) rotate(${rot}deg) scale(${push})`, transformOrigin: '50% 45%' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: quadMatrix(W, H, g), backgroundColor: '#000', overflow: 'hidden' }}>
            <OffthreadVideo src={src} trimBefore={trimBefore} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: ['saturate(1.08) contrast(1.03) brightness(0.96)', filter].filter(Boolean).join(' ') }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 35%, transparent 50%, rgba(255,180,255,0.05) 100%)' }} />
          </div>
          <Img src={photo.src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(20,0,30,0.3) 100%)', pointerEvents: 'none' }} />
      </AbsoluteFill>
    );
  }
  const mw = 1580 * u; const mh = mw * 9 / 16;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#2A1240' }}>
      <AbsoluteFill style={{ transform: `translate(${hx}px, ${hy}px) rotate(${rot}deg) scale(${push})`, transformOrigin: '50% 45%' }}>
        {/* Pared con luz morada y un neón de la marca arriba. */}
        <AbsoluteFill style={{ background: 'linear-gradient(180deg, #4A1F73 0%, #8E4FC0 22%, #B67AD4 40%, #C995DD 52%)' }} />
        <div style={{ position: 'absolute', left: '22%', top: 0, width: 900 * u, height: 700 * u, transform: 'translate(-50%, -40%)', background: 'radial-gradient(ellipse, rgba(255,120,230,0.6), transparent 65%)', filter: `blur(${30 * u}px)` }} />
        {name ? (
          // Letrero de neón con el nombre de la marca, cortado arriba como en la toma real.
          <div style={{ position: 'absolute', left: 50 * u, top: -46 * u, fontFamily: font, fontWeight: 700, fontSize: 168 * u, letterSpacing: '-0.02em', color: '#F4FFD6', transform: 'rotate(-5deg)', textShadow: `0 0 ${6 * u}px #fff, 0 0 ${18 * u}px ${accent}, 0 0 ${42 * u}px ${accent}, 0 0 ${90 * u}px ${accent}`, whiteSpace: 'nowrap' }}>{name.split(' ')[0].toLowerCase()}</div>
        ) : null}
        {/* Escritorio: madera clara con la luz cálida de una lámpara a la izquierda. */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: '60%', bottom: 0, background: 'linear-gradient(180deg, #D6AFCB 0%, #F1D5CB 20%, #F8E4D6 55%, #EFCDB9 100%)' }} />
        <div style={{ position: 'absolute', left: '-30%', top: '62%', width: 1000 * u, height: 760 * u, background: 'radial-gradient(ellipse, rgba(255,175,90,0.85), transparent 62%)', filter: `blur(${20 * u}px)` }} />
        {/* Luz de la pantalla sobre la pared y el escritorio. */}
        <div style={{ position: 'absolute', left: '50%', top: '38%', width: 1500 * u, height: 900 * u, transform: 'translate(-50%, -50%)', background: 'radial-gradient(ellipse, rgba(170,200,255,0.35), transparent 60%)', filter: `blur(${30 * u}px)` }} />
        {/* Monitor en perspectiva (se sale un poco del cuadro, como en la toma real). */}
        <div style={{ position: 'absolute', left: '52%', top: '19%', width: mw, height: mh, transform: 'translateX(-50%) perspective(1900px) rotateY(-11deg) rotateX(4deg) rotateZ(-1.5deg)', transformOrigin: '50% 50%' }}>
          <div style={{ position: 'absolute', inset: -16 * u, borderRadius: 18 * u, background: '#0A0A0D', boxShadow: `0 ${40 * u}px ${90 * u}px rgba(30,0,50,0.6), 0 0 ${120 * u}px rgba(150,180,255,0.25)` }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: 6 * u, overflow: 'hidden', backgroundColor: '#000' }}>
            <OffthreadVideo src={src} trimBefore={trimBefore} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: ['saturate(1.1) contrast(1.04)', filter].filter(Boolean).join(' ') }} />
            {/* Reflejo del vidrio. */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 35%, transparent 50%, rgba(255,180,255,0.06) 100%)' }} />
          </div>
        </div>
        {/* Lámpara redonda a la izquierda (la luz cálida del escritorio). */}
        <div style={{ position: 'absolute', left: -60 * u, top: '64%', width: 230 * u, height: 90 * u, borderRadius: '50%', background: 'radial-gradient(ellipse at 50% 40%, #FFF6E8, #F2D2B4 70%)', boxShadow: `0 0 ${60 * u}px rgba(255,190,120,0.9)`, filter: `blur(${1.2 * u}px)` }} />
        {/* Teclado blanco en ángulo, más cerca de la cámara (un poco desenfocado). */}
        <div style={{ position: 'absolute', left: '66%', top: '79%', width: 820 * u, height: 300 * u, transform: 'translateX(-50%) perspective(1000px) rotateX(50deg) rotateZ(-9deg)', borderRadius: 30 * u, background: 'linear-gradient(180deg, #F7F4FA, #DCD6E4)', boxShadow: `0 ${30 * u}px ${46 * u}px rgba(120,60,80,0.35)`, padding: 20 * u, filter: `blur(${1.4 * u}px)`, display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gridTemplateRows: 'repeat(5, 1fr)', gap: 7 * u }}>
          {Array.from({ length: 70 }, (_, i) => <div key={i} style={{ borderRadius: 8 * u, background: 'linear-gradient(180deg, #FFFFFF, #EEE9F3)', boxShadow: `0 ${3 * u}px 0 #C9C1D3` }} />)}
        </div>
        {/* Mouse. */}
        <div style={{ position: 'absolute', left: '6%', top: '86%', width: 120 * u, height: 76 * u, borderRadius: '50%', background: 'radial-gradient(ellipse at 40% 35%, #8a8590, #2a2830 70%)', transform: 'rotate(-18deg)', filter: `blur(${1.5 * u}px)`, boxShadow: `0 ${10 * u}px ${18 * u}px rgba(60,20,50,0.4)` }} />
      </AbsoluteFill>
      {/* Viñeta suave y grano: que se sienta cámara de celular, no un render. */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(20,0,30,0.35) 100%)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

/** matrix3d que lleva un rectángulo W×H (desde 0,0) a un cuadrilátero (x0,y0 … x3,y3 en sentido horario). */
export function quadMatrix(W: number, H: number, d: number[]): string {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = d;
  // Homografía del cuadrado unidad al cuadrilátero.
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const dd = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  // Escala del rectángulo W×H al cuadrado unidad.
  const m = [a / W, dd / W, 0, g / W, b / H, e / H, 0, h / H, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(10)).join(',')})`;
}
