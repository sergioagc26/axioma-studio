import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Brand, MotionSpec } from '@snz/schema';

export const MOTION_TEMPLATES = ['barras', 'contador', 'lista', 'logo', 'texto'] as const;

const BG = '#0B0B0D';

/** Texto que el usuario aún no ha dado: se muestra como marcador, nunca se inventa. */
const orMark = (v: unknown, mark = '[DATO]') => (v === undefined || v === null || v === '' ? mark : String(v));

const Title: React.FC<{ text?: string; font: string; color: string; upper: boolean }> = ({ text, font, color, upper }) =>
  text ? (
    <div style={{ fontFamily: font, fontWeight: 800, fontSize: 68, lineHeight: 1.08, color, textAlign: 'center', textTransform: upper ? 'uppercase' : 'none', padding: '0 70px' }}>{text}</div>
  ) : null;

/**
 * Motion graphics de pantalla completa. Los datos vienen de `scene.motionData`:
 * - barras:   { items: [{ label, value }], unidad? }
 * - contador: { valor, prefijo?, sufijo?, etiqueta? }
 * - lista:    { items: [string] }
 * - logo:     { texto? }  (usa el logo o el nombre del kit)
 * - texto:    usa el texto en pantalla de la escena
 */
export const MotionGraphic: React.FC<{ spec: MotionSpec; brand: Brand; font: string; upper: boolean; offset: number }> = ({ spec, brand, font, upper, offset }) => {
  const frame = useCurrentFrame() + offset;
  const { fps } = useVideoConfig();
  const enter = (delay = 0) => spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 140 } });
  const d = spec.data ?? {};

  let body: React.ReactNode = null;
  if (spec.template === 'barras') {
    const items: { label?: string; value?: number }[] = Array.isArray(d.items) && d.items.length ? d.items : [{}, {}];
    const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
    body = (
      <div style={{ width: '78%', display: 'flex', flexDirection: 'column', gap: 34 }}>
        {items.slice(0, 5).map((it, i) => {
          const has = typeof it.value === 'number';
          const w = (has ? it.value! / max : 0.6) * enter(8 + i * 8);
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: font, fontWeight: 700, fontSize: 40, color: brand.text }}>
                <span>{orMark(it.label, '[ETIQUETA]')}</span>
                <span>{has ? `${it.value}${d.unidad ?? ''}` : '[DATO]'}</span>
              </div>
              <div style={{ height: 44, borderRadius: 22, background: '#26262B', overflow: 'hidden' }}>
                <div style={{ width: `${w * 100}%`, height: '100%', borderRadius: 22, background: i % 2 ? brand.secondary : brand.primary }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (spec.template === 'contador') {
    const has = typeof d.valor === 'number';
    const shown = has ? Math.round(d.valor * interpolate(enter(6), [0, 1], [0, 1], { extrapolateRight: 'clamp' })) : null;
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div style={{ fontFamily: font, fontWeight: 800, fontSize: 230, lineHeight: 1, color: brand.primary }}>
          {d.prefijo ?? ''}{has ? shown : '[DATO]'}{d.sufijo ?? ''}
        </div>
        <div style={{ fontFamily: font, fontWeight: 700, fontSize: 48, color: brand.text, textAlign: 'center', padding: '0 80px' }}>{orMark(d.etiqueta, '')}</div>
      </div>
    );
  } else if (spec.template === 'lista') {
    const items: string[] = Array.isArray(d.items) && d.items.length ? d.items : ['[PUNTO 1]', '[PUNTO 2]', '[PUNTO 3]'];
    body = (
      <div style={{ width: '80%', display: 'flex', flexDirection: 'column', gap: 30 }}>
        {items.slice(0, 5).map((it, i) => {
          const e = enter(8 + i * 10);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 26, opacity: e, transform: `translateX(${interpolate(e, [0, 1], [-60, 0])}px)` }}>
              <div style={{ width: 76, height: 76, borderRadius: 38, flex: 'none', background: i % 2 ? brand.secondary : brand.primary, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font, fontWeight: 800, fontSize: 40 }}>{i + 1}</div>
              <div style={{ fontFamily: font, fontWeight: 700, fontSize: 50, lineHeight: 1.1, color: brand.text }}>{it}</div>
            </div>
          );
        })}
      </div>
    );
  } else if (spec.template === 'logo') {
    const e = enter(4);
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36, transform: `scale(${interpolate(e, [0, 1], [0.8, 1])})`, opacity: e }}>
        {brand.logoSrc
          ? <Img src={brand.logoSrc} style={{ maxWidth: 520, maxHeight: 420, objectFit: 'contain' }} />
          : <div style={{ fontFamily: font, fontWeight: 800, fontSize: 120, color: brand.primary, textAlign: 'center', padding: '0 60px' }}>{orMark(brand.name, '[MARCA]')}</div>}
        {d.texto ? <div style={{ fontFamily: font, fontWeight: 700, fontSize: 52, color: brand.text, textAlign: 'center', padding: '0 80px' }}>{d.texto}</div> : null}
      </div>
    );
  } else {
    // 'texto': tarjeta de texto a pantalla completa.
    const e = enter(2);
    return (
      <AbsoluteFill style={{ backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: font, fontWeight: 800, fontSize: 124, lineHeight: 1.02, color: '#000', textAlign: 'center', padding: '0 70px', textTransform: upper ? 'uppercase' : 'none', transform: `scale(${interpolate(e, [0, 1], [0.85, 1])})` }}>
          {spec.text}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: BG, alignItems: 'center', justifyContent: 'center', gap: 70, paddingBottom: '18%' }}>
      {spec.template !== 'logo' && <Title text={spec.text} font={font} color={brand.text} upper={upper} />}
      {body}
    </AbsoluteFill>
  );
};
