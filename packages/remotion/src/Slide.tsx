import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { keywordOf } from '@axioma/schema';
import { useFont } from './Reel.tsx';

/** Una imagen estática para redes: portada, punto de un carrusel o cierre. */
export interface SlideProps {
  width: number;
  height: number;
  kind: 'portada' | 'punto' | 'cierre';
  /** Fotograma del video de fondo. */
  bg?: string;
  title: string;
  body?: string;
  index?: number;
  total?: number;
  /** Texto del botón o llamado a la acción. */
  cta?: string;
  /** Historia: deja libre la franja de abajo (barra de respuesta). */
  story?: boolean;
  carousel?: boolean;
  brand: { primary: string; secondary: string; name?: string; logoSrc?: string };
  font: string;
  [key: string]: unknown;
}

const onColor = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return '#000';
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#0B0B0F' : '#FFFFFF';
};

/** El título con su palabra clave en el color de la marca. */
const Title: React.FC<{ text: string; color: string; size: number; font: string }> = ({ text, color, size, font }) => {
  const key = keywordOf(text);
  const norm = (w: string) => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');
  return (
    <div style={{ fontFamily: font, fontSize: size, fontWeight: 900, lineHeight: 1.02, letterSpacing: '-0.01em', textTransform: 'uppercase', color: '#fff', textShadow: '0 6px 24px rgba(0,0,0,0.45)' }}>
      {text.split(/\s+/).map((w, i) => (
        <span key={i} style={norm(w) === norm(key) ? { color } : undefined}>{w}{' '}</span>
      ))}
    </div>
  );
};

export const Slide: React.FC<SlideProps> = (p) => {
  const font = useFont(p.font || 'Anton');
  const body = useFont('DM Sans');
  const pad = Math.round(p.width * 0.075);
  const bottomSafe = p.story ? p.height * 0.17 : pad;
  const fg = onColor(p.brand.primary);
  const counter = p.carousel && p.total ? `${(p.index ?? 0) + 1}/${p.total}` : null;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B0B0F' }}>
      {p.bg ? <Img src={p.bg} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: p.kind === 'punto' ? 'blur(18px) brightness(0.45) saturate(1.1)' : 'brightness(0.92) contrast(1.05)', transform: p.kind === 'punto' ? 'scale(1.15)' : undefined }} /> : null}
      {p.kind !== 'punto' ? <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.88) 100%)' }} /> : null}

      {/* Cabecera: marca y contador */}
      <div style={{ position: 'absolute', top: pad * 0.8, left: pad, right: pad, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: body, fontWeight: 700, fontSize: p.width * 0.028, color: '#fff' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {p.brand.logoSrc ? <Img src={p.brand.logoSrc} style={{ height: p.width * 0.05, borderRadius: 8 }} /> : <span style={{ width: 14, height: 14, borderRadius: 7, background: p.brand.primary, display: 'inline-block' }} />}
          {p.brand.name ?? ''}
        </span>
        {counter ? <span style={{ padding: '6px 14px', borderRadius: 999, background: 'rgba(0,0,0,0.45)' }}>{counter}</span> : null}
      </div>

      {p.kind === 'portada' && (
        <div style={{ position: 'absolute', left: pad, right: pad, bottom: bottomSafe + (p.cta ? p.width * 0.11 : 0) }}>
          <div style={{ width: p.width * 0.12, height: 10, borderRadius: 5, background: p.brand.primary, marginBottom: 26 }} />
          <Title text={p.title} color={p.brand.primary} size={p.width * (p.title.length > 40 ? 0.085 : 0.105)} font={font} />
          {p.body ? <div style={{ marginTop: 22, fontFamily: body, fontSize: p.width * 0.036, color: 'rgba(255,255,255,0.88)', fontWeight: 500, lineHeight: 1.3 }}>{p.body}</div> : null}
        </div>
      )}

      {p.kind === 'punto' && (
        <div style={{ position: 'absolute', left: pad, right: pad, top: '50%', transform: 'translateY(-50%)', padding: pad * 0.8, borderRadius: 36, background: 'rgba(15,15,20,0.72)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ width: p.width * 0.12, height: p.width * 0.12, borderRadius: '50%', background: p.brand.primary, color: fg, display: 'grid', placeItems: 'center', fontFamily: font, fontSize: p.width * 0.06, fontWeight: 900, marginBottom: 30 }}>{p.index ?? 1}</div>
          <Title text={p.title} color={p.brand.primary} size={p.width * 0.072} font={font} />
          {p.body ? <div style={{ marginTop: 24, fontFamily: body, fontSize: p.width * 0.04, color: 'rgba(255,255,255,0.9)', fontWeight: 500, lineHeight: 1.35 }}>{p.body}</div> : null}
        </div>
      )}

      {p.kind === 'cierre' && (
        <div style={{ position: 'absolute', left: pad, right: pad, bottom: bottomSafe }}>
          <Title text={p.title} color={p.brand.primary} size={p.width * 0.09} font={font} />
          {p.body ? <div style={{ marginTop: 20, fontFamily: body, fontSize: p.width * 0.036, color: 'rgba(255,255,255,0.88)', fontWeight: 500 }}>{p.body}</div> : null}
        </div>
      )}

      {p.cta && p.kind !== 'punto' ? (
        <div style={{ position: 'absolute', left: pad, right: pad, bottom: bottomSafe - (p.kind === 'portada' ? 0 : p.width * 0.13), display: p.kind === 'cierre' ? 'none' : 'flex' }}>
          <span style={{ padding: `${p.width * 0.022}px ${p.width * 0.045}px`, borderRadius: 999, background: p.brand.primary, color: fg, fontFamily: body, fontWeight: 800, fontSize: p.width * 0.034 }}>{p.cta}</span>
        </div>
      ) : null}
      {p.kind === 'cierre' && p.cta ? (
        <div style={{ position: 'absolute', left: pad, top: pad * 2.2 }}>
          <span style={{ padding: `${p.width * 0.022}px ${p.width * 0.045}px`, borderRadius: 999, background: p.brand.primary, color: fg, fontFamily: body, fontWeight: 800, fontSize: p.width * 0.034 }}>{p.cta}</span>
        </div>
      ) : null}
      {p.carousel && p.kind === 'portada' ? (
        <div style={{ position: 'absolute', right: pad, bottom: pad * 0.7, fontFamily: body, fontWeight: 700, fontSize: p.width * 0.03, color: '#fff', opacity: 0.85 }}>Desliza →</div>
      ) : null}
    </AbsoluteFill>
  );
};
