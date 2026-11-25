import React from 'react';
import { AbsoluteFill, interpolate, spring } from 'remotion';

/**
 * Estilo «panel»: gráficos de interfaz animados (motion graphics) en vez de capturas de una web.
 * Una tarjeta oscura con acento de color entra en 3D y su contenido se arma por partes.
 * text = «tipo/título/…datos», separado por «/» (los campos de una fila, por «;»):
 *   dinero/Finanzas del mes/Cobrado:12400/Pendiente:3150   → montos que suben y barras
 *   lista/Tareas/Enviar cotización;AR;Hoy/…                → tareas con responsable y fecha que se marcan
 *   embudo/Clientes/Café Andino;Enviar propuesta/…         → clientes con su siguiente paso
 *   pasos/Cómo trabajamos/Diagnóstico/Plan/…               → línea de pasos que se llena
 *   cta/Diagnóstico Express/GRATIS/Comenta SISTEMA/a;b;c   → tarjeta de llamada a la acción con botón
 * Con color «negro» lleva su propio fondo oscuro de pantalla completa.
 */
const BG = '#0E1A15';
const CARD = '#14241D';
const LINE = 'rgba(255,255,255,0.08)';
const LIME = '#C8F135';
const AMBER = '#F5A524';
const MUTED = 'rgba(255,255,255,0.55)';
const AVATAR = ['#C8F135', '#7DD3FC', '#F9A8D4', '#FCD34D', '#A7F3D0'];

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const money = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

export const Panel: React.FC<{ text: string; local: number; dur: number; fps: number; u: number; k: number; x: number; y: number; out: number; font: string; wide: string; backdrop: boolean }> = ({ text, local, dur, fps, u, k, x, y, out, font, wide, backdrop }) => {
  const [kind, title, ...rows] = text.split('/').map((s) => s.trim());
  const e = spring({ frame: local, fps, config: { damping: 15, stiffness: 120 }, durationInFrames: 20 });
  const W = 880 * u * k;
  const P = 46 * u * k;
  const s = (n: number) => n * u * k;
  // Aparición escalonada de la parte i (en cuadros desde el inicio).
  const step = (start: number, len = 10) => spring({ frame: local - start, fps, config: { damping: 14, stiffness: 160 }, durationInFrames: len });
  const float = Math.sin(local / 18) * s(6);

  let body: React.ReactNode = null;
  if (kind === 'dinero') {
    const items = rows.map((r) => { const [l, v] = r.split(':'); return { l, v: Number(v) || 0 }; });
    const max = Math.max(...items.map((i) => i.v), 1);
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: s(34) }}>
        {items.map((it, i) => {
          const a = step(8 + i * 8, 14);
          const grow = interpolate(local, [10 + i * 8, 34 + i * 8], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
          const c = i === 0 ? LIME : AMBER;
          return (
            <div key={i} style={{ opacity: a, transform: `translateX(${interpolate(a, [0, 1], [s(-60), 0])}px)` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: s(14), fontSize: s(38), color: MUTED, fontWeight: 600 }}>
                  <span style={{ width: s(18), height: s(18), borderRadius: 99, background: c, boxShadow: `0 0 ${s(16)}px ${c}` }} />{it.l}
                </div>
                <div style={{ fontFamily: wide, fontSize: s(76), color: '#fff', letterSpacing: '0.01em' }}>{money(it.v * grow)}</div>
              </div>
              <div style={{ marginTop: s(14), height: s(26), borderRadius: 99, background: LINE, overflow: 'hidden' }}>
                <div style={{ width: `${(it.v / max) * grow * 100}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${c}, ${c}cc)`, boxShadow: `0 0 ${s(20)}px ${c}88` }} />
              </div>
            </div>
          );
        })}
        <div style={{ alignSelf: 'flex-start', opacity: step(40), transform: `scale(${interpolate(step(40), [0, 1], [0.6, 1])})`, padding: `${s(12)}px ${s(26)}px`, borderRadius: 99, background: 'rgba(200,241,53,0.14)', border: `${s(2)}px solid ${LIME}`, color: LIME, fontSize: s(32), fontWeight: 700 }}>✓ Separado y al día</div>
      </div>
    );
  } else if (kind === 'lista') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: s(18) }}>
        <div style={{ display: 'flex', fontSize: s(24), color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, padding: `0 ${s(8)}px` }}>
          <span style={{ flex: 1, paddingLeft: s(64) }}>Tarea</span><span style={{ width: s(110), textAlign: 'center' }}>Quién</span><span style={{ width: s(150), textAlign: 'center' }}>Fecha</span>
        </div>
        {rows.map((r, i) => {
          const [task, who = '', when = ''] = r.split(';').map((v) => v.trim());
          const a = step(6 + i * 7, 12);
          const done = step(26 + i * 9, 8);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: s(16), padding: `${s(20)}px ${s(18)}px`, borderRadius: s(22), background: 'rgba(255,255,255,0.04)', border: `${s(1.5)}px solid ${LINE}`, opacity: a, transform: `translateY(${interpolate(a, [0, 1], [s(40), 0])}px)` }}>
              <div style={{ width: s(46), height: s(46), borderRadius: s(12), border: `${s(3)}px solid ${done > 0.5 ? LIME : 'rgba(255,255,255,0.35)'}`, background: done > 0.5 ? LIME : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: BG, fontSize: s(32), fontWeight: 900, transform: `scale(${1 + Math.sin(Math.min(1, done) * Math.PI) * 0.25})` }}>{done > 0.5 ? '✓' : ''}</div>
              <div style={{ flex: 1, fontSize: s(36), fontWeight: 600, color: '#fff', opacity: interpolate(done, [0, 1], [1, 0.6]), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task}</div>
              <div style={{ width: s(110), display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: s(62), height: s(62), borderRadius: 99, background: AVATAR[i % AVATAR.length], color: BG, fontWeight: 800, fontSize: s(26), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{who}</div>
              </div>
              <div style={{ width: s(150), display: 'flex', justifyContent: 'center' }}>
                <div style={{ padding: `${s(8)}px ${s(18)}px`, borderRadius: 99, background: i === 0 ? 'rgba(200,241,53,0.16)' : 'rgba(255,255,255,0.07)', color: i === 0 ? LIME : '#ddd', fontSize: s(28), fontWeight: 700 }}>{when}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (kind === 'embudo') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: s(20) }}>
        {rows.map((r, i) => {
          const [name, next = ''] = r.split(';').map((v) => v.trim());
          const a = step(6 + i * 7, 12);
          const chip = step(18 + i * 9, 12);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: s(18), padding: `${s(20)}px ${s(20)}px`, borderRadius: s(22), background: 'rgba(255,255,255,0.04)', border: `${s(1.5)}px solid ${LINE}`, opacity: a, transform: `translateX(${interpolate(a, [0, 1], [s(80), 0])}px)` }}>
              <div style={{ width: s(64), height: s(64), borderRadius: s(18), background: AVATAR[(i + 1) % AVATAR.length], color: BG, fontWeight: 900, fontSize: s(30), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{name.slice(0, 1)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: s(36), fontWeight: 700, color: '#fff' }}>{name}</div>
                <div style={{ fontSize: s(24), color: MUTED, marginTop: s(2) }}>Siguiente paso</div>
              </div>
              <div style={{ opacity: chip, transform: `translateX(${interpolate(chip, [0, 1], [s(-30), 0])}px) scale(${interpolate(chip, [0, 1], [0.7, 1])})`, display: 'flex', alignItems: 'center', gap: s(10), padding: `${s(12)}px ${s(22)}px`, borderRadius: 99, background: LIME, color: BG, fontSize: s(28), fontWeight: 800 }}>→ {next}</div>
            </div>
          );
        })}
      </div>
    );
  } else if (kind === 'pasos') {
    const n = rows.length;
    const prog = interpolate(local, [10, Math.max(12, dur - 8)], [0, 1], clamp);
    body = (
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: s(30), paddingLeft: s(8) }}>
        <div style={{ position: 'absolute', left: s(8 + 40), top: s(40), bottom: s(40), width: s(6), borderRadius: 9, background: LINE }} />
        <div style={{ position: 'absolute', left: s(8 + 40), top: s(40), height: `calc(${prog * 100}% - ${s(80) * prog}px)`, width: s(6), borderRadius: 9, background: LIME, boxShadow: `0 0 ${s(18)}px ${LIME}` }} />
        {rows.map((r, i) => {
          const on = prog >= i / Math.max(1, n - 1) - 0.001;
          const a = step(4 + i * 5, 12);
          const pop = step(10 + Math.round((i / Math.max(1, n - 1)) * Math.max(0, dur - 18)), 10);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: s(28), opacity: a, transform: `translateX(${interpolate(a, [0, 1], [s(-40), 0])}px)` }}>
              <div style={{ position: 'relative', width: s(86), height: s(86), borderRadius: 99, background: on ? LIME : CARD, border: `${s(3)}px solid ${on ? LIME : 'rgba(255,255,255,0.2)'}`, color: on ? BG : '#fff', fontFamily: wide, fontSize: s(38), display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${on ? 1 + Math.sin(Math.min(1, pop) * Math.PI) * 0.18 : 1})`, boxShadow: on ? `0 0 ${s(26)}px ${LIME}99` : 'none' }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ fontSize: s(46), fontWeight: 700, color: on ? '#fff' : 'rgba(255,255,255,0.45)' }}>{r}</div>
            </div>
          );
        })}
      </div>
    );
  } else if (kind === 'cta') {
    const [badge = '', button = '', list = ''] = rows;
    const items = list ? list.split(';') : [];
    const b = step(10, 14);
    const btn = step(18 + items.length * 6, 14);
    const pulse = (local % 30) / 30;
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: s(26) }}>
        {items.map((it, i) => {
          const a = step(12 + i * 6, 10);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: s(18), opacity: a, transform: `translateX(${interpolate(a, [0, 1], [s(-40), 0])}px)`, fontSize: s(38), color: '#fff', fontWeight: 600 }}>
              <span style={{ width: s(48), height: s(48), borderRadius: 99, background: LIME, color: BG, fontWeight: 900, fontSize: s(28), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</span>{it}
            </div>
          );
        })}
        <div style={{ position: 'relative', marginTop: s(16), alignSelf: 'stretch', opacity: btn, transform: `translateY(${interpolate(btn, [0, 1], [s(30), 0])}px)` }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 99, border: `${s(3)}px solid ${LIME}`, transform: `scale(${1 + pulse * 0.12}, ${1 + pulse * 0.4})`, opacity: 1 - pulse }} />
          <div style={{ padding: `${s(28)}px 0`, borderRadius: 99, background: LIME, color: BG, textAlign: 'center', fontSize: s(44), fontWeight: 900, boxShadow: `0 ${s(14)}px ${s(40)}px rgba(200,241,53,0.35)` }}>{button}</div>
        </div>
        {badge ? <div style={{ position: 'absolute', right: s(-26), top: s(-34), transform: `rotate(${interpolate(b, [0, 1], [-40, 8])}deg) scale(${interpolate(b, [0, 1], [0.3, 1])})`, opacity: b, padding: `${s(14)}px ${s(30)}px`, borderRadius: s(16), background: LIME, color: BG, fontFamily: wide, fontSize: s(44), boxShadow: `0 ${s(10)}px ${s(30)}px rgba(0,0,0,0.45)` }}>{badge}</div> : null}
      </div>
    );
  }

  const ry = interpolate(e, [0, 1], [-28, -4]) + Math.sin(local / 26) * 3;
  const rx = interpolate(e, [0, 1], [22, 3]);
  return (
    <AbsoluteFill style={{ opacity: out, fontFamily: font }}>
      {backdrop ? <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 42%, #1B3327 0%, ${BG} 62%, #070D0A 100%)`, opacity: interpolate(local, [0, 6], [0, 1], clamp) }} /> : null}
      {backdrop ? <AbsoluteFill style={{ backgroundImage: `radial-gradient(rgba(200,241,53,0.10) ${s(2)}px, transparent ${s(2.5)}px)`, backgroundSize: `${s(44)}px ${s(44)}px`, backgroundPosition: `0 ${-local * 0.6 * u}px`, opacity: 0.8 }} /> : null}
      <div style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: W, transform: `translate(-50%, -50%) translateY(${interpolate(e, [0, 1], [s(160), 0]) + float}px) perspective(${1800 * u}px) rotateY(${ry}deg) rotateX(${rx}deg) scale(${interpolate(e, [0, 1], [0.86, 1])})`, opacity: Math.min(1, e * 1.6) }}>
        <div style={{ position: 'relative', padding: P, borderRadius: s(44), background: `linear-gradient(160deg, ${CARD} 0%, ${BG} 100%)`, border: `${s(2)}px solid rgba(200,241,53,0.28)`, boxShadow: `0 ${s(50)}px ${s(90)}px rgba(0,0,0,0.6), 0 0 ${s(60)}px rgba(200,241,53,0.10)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: s(14), marginBottom: s(14) }}>
            <span style={{ width: s(14), height: s(14), borderRadius: 99, background: LIME, boxShadow: `0 0 ${s(12)}px ${LIME}` }} />
            <span style={{ fontSize: s(24), letterSpacing: '0.16em', textTransform: 'uppercase', color: LIME, fontWeight: 700 }}>Sistema Empresarial</span>
          </div>
          <div style={{ fontFamily: kind === 'cta' ? wide : font, fontSize: s(kind === 'cta' ? 78 : 58), fontWeight: 800, color: '#fff', lineHeight: 1.02, marginBottom: s(34), textTransform: kind === 'cta' ? 'uppercase' : undefined, letterSpacing: kind === 'cta' ? '0.01em' : '-0.02em', whiteSpace: 'normal' }}>{title}</div>
          {body}
          {/* Brillo que cruza la tarjeta al entrar. */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: s(44), overflow: 'hidden', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: '-20%', bottom: '-20%', width: '26%', left: `${interpolate(local, [6, 26], [-40, 140], clamp)}%`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)', transform: 'skewX(-16deg)' }} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
