import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Brand, MotionSpec } from '@snz/schema';

export const MOTION_TEMPLATES = ['barras', 'contador', 'porcentaje', 'lista', 'checklist', 'pasos', 'comparacion', 'pregunta', 'cita', 'palabras', 'logo', 'texto'] as const;

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
export const MotionGraphic: React.FC<{ spec: MotionSpec; brand: Brand; font: string; upper: boolean; offset: number }> = ({ spec, brand: baseBrand, font, upper, offset }) => {
  // Aspecto del gráfico: se cambia sin tocar su contenido.
  const st = spec.style ?? { background: 'oscuro', scale: 1 };
  const primary = st.primary ?? baseBrand.primary;
  const secondary = st.secondary ?? baseBrand.secondary;
  const light = st.background === 'claro';
  const brand: Brand = { ...baseBrand, primary: st.background === 'marca' ? secondary : primary, secondary: st.background === 'marca' ? '#000000' : secondary, text: light ? '#111113' : st.background === 'marca' ? '#000000' : baseBrand.text };
  const panel = light || st.background === 'marca' ? 'rgba(0,0,0,0.14)' : st.background === 'video' ? 'rgba(255,255,255,0.16)' : '#26262B';
  const frame = useCurrentFrame() + offset;
  const { fps } = useVideoConfig();
  const enter = (delay = 0) => spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 140 } });
  const d = spec.data ?? {};
  const bg = st.background === 'claro' ? '#F4F4F5'
    : st.background === 'marca' ? primary
    // Degradado que gira despacio entre los dos colores de la marca, oscurecido para que el texto se lea.
    : st.background === 'degradado' ? `linear-gradient(${(frame * 1.2) % 360}deg, ${primary}, #0B0B0D 55%, ${secondary})`
    // "video": el propio video desenfocado se ve detrás (lo pone el clip); aquí solo se oscurece.
    : st.background === 'video' ? 'rgba(0,0,0,0.5)'
    : BG;

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
              <div style={{ height: 44, borderRadius: 22, background: panel, overflow: 'hidden' }}>
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
  } else if (spec.template === 'porcentaje') {
    const has = typeof d.valor === 'number';
    const v = has ? Math.min(100, Math.max(0, d.valor)) : 0;
    const p = interpolate(enter(6), [0, 1], [0, v / 100], { extrapolateRight: 'clamp' });
    const R = 250, C = 2 * Math.PI * R;
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
        <div style={{ position: 'relative', width: 600, height: 600 }}>
          <svg width={600} height={600} viewBox="0 0 600 600" aria-hidden="true">
            <circle cx={300} cy={300} r={R} fill="none" stroke="#26262B" strokeWidth={54} />
            <circle cx={300} cy={300} r={R} fill="none" stroke={brand.primary} strokeWidth={54} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform="rotate(-90 300 300)" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font, fontWeight: 800, fontSize: 170, color: brand.text }}>{has ? `${Math.round(p * 100)}%` : '[DATO]'}</div>
        </div>
        <div style={{ fontFamily: font, fontWeight: 700, fontSize: 50, color: brand.text, textAlign: 'center', padding: '0 80px' }}>{orMark(d.etiqueta, '')}</div>
      </div>
    );
  } else if (spec.template === 'checklist' || spec.template === 'pasos') {
    const items: string[] = Array.isArray(d.items) && d.items.length ? d.items : ['[PUNTO 1]', '[PUNTO 2]', '[PUNTO 3]'];
    const steps = spec.template === 'pasos';
    // Cada punto entra repartido a lo largo de la escena.
    const gapF = Math.max(8, Math.min(26, Math.round(fps * 0.7)));
    body = (
      <div style={{ width: '82%', display: 'flex', flexDirection: 'column', gap: 34, position: 'relative' }}>
        {steps ? <div style={{ position: 'absolute', left: 43, top: 44, bottom: 44, width: 6, borderRadius: 3, background: panel }} /> : null}
        {items.slice(0, 5).map((it, i) => {
          const e = enter(6 + i * gapF);
          const done = enter(14 + i * gapF);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 28, opacity: Math.max(0.25, e), transform: `translateY(${interpolate(e, [0, 1], [24, 0])}px)`, position: 'relative' }}>
              <div style={{ width: 92, height: 92, borderRadius: 46, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done > 0.5 ? brand.primary : panel, color: done > 0.5 ? '#000' : brand.text, fontFamily: font, fontWeight: 800, fontSize: 46, transform: `scale(${interpolate(done, [0, 1], [0.8, 1])})` }}>
                {steps ? i + 1 : done > 0.5 ? '✓' : ''}
              </div>
              <div style={{ fontFamily: font, fontWeight: 700, fontSize: 52, lineHeight: 1.1, color: brand.text }}>{it}</div>
            </div>
          );
        })}
      </div>
    );
  } else if (spec.template === 'comparacion') {
    const col = (title: string, text: unknown, good: boolean, delay: number) => {
      const e = enter(delay);
      return (
        <div style={{ flex: 1, borderRadius: 34, padding: '46px 34px', background: good ? brand.primary : panel, color: good ? '#000' : brand.text, display: 'flex', flexDirection: 'column', gap: 22, alignItems: 'center', textAlign: 'center', opacity: e, transform: `translateX(${interpolate(e, [0, 1], [good ? 80 : -80, 0])}px) scale(${good ? interpolate(enter(delay + 8), [0, 1], [0.94, 1.04]) : 1})` }}>
          <div style={{ fontFamily: font, fontWeight: 800, fontSize: 84, lineHeight: 1 }}>{good ? '✓' : '✕'}</div>
          <div style={{ fontFamily: font, fontWeight: 700, fontSize: 30, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 2 }}>{title}</div>
          <div style={{ fontFamily: font, fontWeight: 800, fontSize: 50, lineHeight: 1.1 }}>{orMark(text, '[TEXTO]')}</div>
        </div>
      );
    };
    body = <div style={{ width: '88%', display: 'flex', gap: 26, alignItems: 'stretch' }}>{col(d.tituloIzquierda ?? 'Antes', d.izquierda, false, 6)}{col(d.tituloDerecha ?? 'Ahora', d.derecha, true, 18)}</div>;
  } else if (spec.template === 'pregunta') {
    const e = enter(2);
    const wob = Math.sin(frame / 7) * 6;
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
        <div style={{ fontFamily: font, fontWeight: 800, fontSize: 420, lineHeight: 0.85, color: brand.primary, transform: `scale(${interpolate(e, [0, 1], [0.3, 1])}) rotate(${wob}deg)` }}>?</div>
        <div style={{ fontFamily: font, fontWeight: 800, fontSize: 76, lineHeight: 1.08, color: brand.text, textAlign: 'center', padding: '0 70px', textTransform: upper ? 'uppercase' : 'none', opacity: enter(10) }}>{orMark(d.pregunta, '[TU PREGUNTA]')}</div>
      </div>
    );
  } else if (spec.template === 'cita') {
    const e = enter(4);
    body = (
      <div style={{ width: '82%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 300, lineHeight: 0.7, color: brand.primary, transform: `scale(${interpolate(e, [0, 1], [0.5, 1])})`, transformOrigin: 'left top' }}>“</div>
        <div style={{ fontFamily: font, fontWeight: 800, fontSize: 78, lineHeight: 1.12, color: brand.text, opacity: enter(8), transform: `translateY(${interpolate(enter(8), [0, 1], [30, 0])}px)` }}>{orMark(d.texto, '[TU FRASE]')}</div>
        <div style={{ height: 12, width: `${interpolate(enter(18), [0, 1], [0, 46])}%`, borderRadius: 6, background: brand.secondary, marginTop: 30 }} />
        {d.autor ? <div style={{ fontFamily: font, fontWeight: 700, fontSize: 40, color: brand.text, opacity: 0.8, marginTop: 14 }}>{d.autor}</div> : null}
      </div>
    );
  } else if (spec.template === 'palabras') {
    // Tipografía en movimiento: cada palabra aparece enorme justo cuando se dice.
    const ws = spec.words ?? [];
    const i = Math.max(0, ws.findIndex((w, k) => frame >= w.startFrame && frame < (ws[k + 1]?.startFrame ?? Infinity)));
    const w = ws[i];
    const prev = ws[i - 1];
    const hit = w ? spring({ frame: frame - w.startFrame, fps, config: { damping: 10, stiffness: 260 }, durationInFrames: 7 }) : 0;
    const colors = [brand.text, brand.primary, brand.secondary];
    const size = w ? Math.min(250, Math.max(110, 1500 / Math.max(4, w.text.length))) : 150;
    return (
      <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 26, paddingBottom: '10%' }}>
        <div style={{ fontFamily: font, fontWeight: 800, fontSize: 60, color: brand.text, opacity: 0.35, textTransform: 'uppercase', height: 70 }}>{prev?.text ?? ''}</div>
        <div style={{ fontFamily: font, fontWeight: 800, fontSize: size, lineHeight: 1, color: colors[i % 3], textTransform: 'uppercase', textAlign: 'center', padding: '0 40px', transform: `scale(${interpolate(hit, [0, 1], [0.6, 1])}) rotate(${i % 2 ? 2 : -2}deg)` }}>{w?.text ?? orMark(spec.text, '')}</div>
      </AbsoluteFill>
    );
  } else {
    // 'texto': tarjeta de texto a pantalla completa.
    const e = enter(2);
    return (
      <AbsoluteFill style={{ background: st.background === 'oscuro' ? primary : bg, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: font, fontWeight: 800, fontSize: 124, lineHeight: 1.02, color: st.background === 'oscuro' || st.background === 'marca' || light ? '#000' : '#fff', textAlign: 'center', padding: '0 70px', textTransform: upper ? 'uppercase' : 'none', transform: `scale(${interpolate(e, [0, 1], [0.85, 1]) * st.scale})` }}>
          {spec.text}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: bg }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 70, paddingBottom: '18%', transform: `scale(${st.scale})` }}>
        {spec.template !== 'logo' && <Title text={spec.text} font={font} color={brand.text} upper={upper} />}
        {body}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
