import React from 'react';
import { AbsoluteFill, Img, interpolate, OffthreadVideo, spring } from 'remotion';
import { Panel } from './Panel.tsx';

/**
 * Piezas de los reels «de creador»: palabras gigantes al ritmo de la voz (también detrás de la
 * persona) y los objetos que aparecen en pantalla: etiquetas, cajas de selección, notas pegadas,
 * tarjetas de datos, íconos de app, una ventana de chat, una línea de tiempo, curvas de animación,
 * miniaturas que entran volando y la onda de voz; y grabaciones de pantalla flotando en 3D.
 */
export interface KineticWord {
  text: string; from: number; to: number;
  color: 'blanco' | 'rojo' | 'amarillo' | 'negro';
  x: number; y: number; size: number; behind: boolean;
  style: 'gigante' | 'pildora' | 'pantalla' | 'resaltado' | 'seleccion' | 'tachado' | 'nota' | 'tarjeta' | 'icono' | 'archivo' | 'tira' | 'ruta' | 'miniaturas' | 'chat' | 'mic' | 'emoji' | 'neon' | 'circulo' | 'cristal' | 'ancho' | 'acomodar' | 'logo' | 'apoyo' | 'seccion' | 'eco' | 'apilado' | 'tresd' | 'app' | 'fondo' | 'foto' | 'objeto' | 'panel';
  rotate?: number; files?: string[]; then?: number;
}

const COLORS = { blanco: '#FFFFFF', rojo: '#E8261F', amarillo: '#F6E60B', negro: '#111114' } as const;
const ORANGE = '#D97757';
const LIME = '#C6F432';

/** Chispa de ocho puntas (el ícono de «IA» de la referencia, dibujado genérico). */
const Spark: React.FC<{ size: number; color?: string }> = ({ size, color = ORANGE }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    {Array.from({ length: 8 }, (_, i) => <rect key={i} x={46} y={8} width={8} height={42} rx={4} fill={color} transform={`rotate(${i * 45} 50 50)`} />)}
  </svg>
);

/** El ícono de Axioma Studio: triángulo de play lima con cara, sobre petróleo. */
const AxiomaMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <path d="M30 18 L84 50 L30 82 Z" fill={LIME} stroke={LIME} strokeWidth={10} strokeLinejoin="round" />
    <circle cx={46} cy={44} r={4} fill="#0F5C63" /><circle cx={60} cy={44} r={4} fill="#0F5C63" />
    <path d="M44 56 Q53 64 62 56" stroke="#0F5C63" strokeWidth={4} fill="none" strokeLinecap="round" />
  </svg>
);

const typedText = (text: string, local: number, speed = 1.3) => text.slice(0, Math.max(0, Math.ceil(local * speed)));

/** Un elemento con su entrada (crece desde un poco más chico y se enfoca) y su salida. */
/** Tipografías extra del estilo de creador: ancha (títulos), condensada (títulos apilados) y redonda (3D). */
export interface KineticFonts { wide: string; cond: string; round: string }

/** Color más oscuro (para el relieve de las letras 3D). */
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
};

/** Líneas de un título: «/» separa líneas, «!» al inicio la agranda y *línea* la remarca con barra de color. */
const titleLines = (text: string) => text.split('/').map((raw) => {
  let t = raw.trim();
  const big = t.startsWith('!');
  if (big) t = t.slice(1).trim();
  const mark = /^\*.*\*$/.test(t);
  if (mark) t = t.slice(1, -1);
  return { t, big, mark };
});

export const Word: React.FC<{ w: KineticWord; f: number; fps: number; width: number; font: string; mono: string; serif: string; extra?: KineticFonts }> = ({ w, f, fps, width, font, mono, serif, extra }) => {
  if (f < w.from || f >= w.to) return null;
  const local = f - w.from;
  const u = width / 1080;
  const k = w.size;
  const s = spring({ frame: local, fps, config: { damping: 14, stiffness: 230 }, durationInFrames: 9 });
  const out = interpolate(f, [w.to - 4, w.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rot = w.rotate ? ` rotate(${w.rotate}deg)` : '';
  const base: React.CSSProperties = { position: 'absolute', left: `${w.x * 100}%`, top: `${w.y * 100}%`, transform: `translate(-50%, -50%) scale(${interpolate(s, [0, 1], [0.82, 1])})${rot}`, opacity: Math.min(1, s * 1.6) * out, whiteSpace: 'nowrap' };
  const then = w.then !== undefined && f >= w.then;
  const color = COLORS[w.color];

  switch (w.style) {
    case 'panel':
      // Gráfico de interfaz animado (ver Panel.tsx); con color «negro» trae su propio fondo.
      return <Panel text={w.text} local={local} dur={w.to - w.from} fps={fps} u={u} k={k} x={w.x} y={w.y} out={out} font={font} wide={extra?.wide ?? font} backdrop={w.color === 'negro'} />;
    case 'pildora':
      return <div style={{ ...base, fontFamily: font, fontWeight: 600, fontSize: 40 * u * k, color: '#F2F2F2', padding: `${14 * u}px ${30 * u}px`, borderRadius: 999, border: `${2 * u}px solid rgba(255,255,255,0.28)`, background: 'rgba(30,30,32,0.72)' }}>{w.text}</div>;
    case 'pantalla': {
      // Texto de computadora que se escribe; con «then», se borra y se escribe el segundo (text = «uno|dos»).
      const [a, b = ''] = w.text.split('|');
      const cur = then && b ? b : a;
      const since = then && b ? f - w.then! : local;
      const shown = typedText(cur, since, 0.9);
      const parts = shown.split(/(\*[^*]*\*?)/g);
      return (
        <div style={{ ...base, transform: `translate(-50%, -50%)${rot}`, opacity: out, fontFamily: mono, fontWeight: 700, fontSize: 60 * u * k, lineHeight: 1.12, color: '#EDF6EA', textShadow: '0 0 10px rgba(220,255,220,0.65)', whiteSpace: 'pre', textAlign: 'left' }}>
          {parts.map((p, i) => p.startsWith('*') ? <span key={i} style={{ color: '#FF4B3E', textShadow: '0 0 12px rgba(255,80,60,0.7)' }}>{p.replace(/\*/g, '')}</span> : <span key={i}>{p}</span>)}
          <span style={{ opacity: Math.floor(local / 8) % 2 ? 0 : 1 }}>_</span>
        </div>
      );
    }
    case 'resaltado':
      // Palabra en caja amarilla (como «Más información»).
      return <div style={{ ...base, fontFamily: font, fontWeight: 900, fontSize: 104 * u * k, letterSpacing: '-0.04em', color: '#111', background: '#F6E60B', padding: `${4 * u}px ${14 * u}px`, outline: `${3 * u}px solid #111`, outlineOffset: -3 * u }}>{w.text}</div>;
    case 'seleccion': {
      // Palabra con la caja de selección de un editor (borde y tiradores rojos).
      const hs = 12 * u;
      return (
        <div style={{ ...base, fontFamily: font, fontWeight: 800, fontSize: 92 * u * k, letterSpacing: '-0.03em', color: color, padding: `${2 * u}px ${12 * u}px`, border: `${3 * u}px solid #E8261F` }}>
          {w.text}
          {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => <span key={i} style={{ position: 'absolute', left: `calc(${x * 100}% - ${hs / 2}px)`, top: `calc(${y * 100}% - ${hs / 2}px)`, width: hs, height: hs, background: '#fff', border: `${2.5 * u}px solid #E8261F` }} />)}
        </div>
      );
    }
    case 'tachado': {
      // La palabra y una raya roja que la cruza (se dibuja de izquierda a derecha).
      const line = interpolate(local, [4, 12], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return (
        <div style={{ ...base, fontFamily: font, fontWeight: 800, fontSize: 110 * u * k, letterSpacing: '-0.035em', color }}>
          {w.text}
          <span style={{ position: 'absolute', left: '-4%', top: '52%', height: 9 * u * k, width: `${line * 1.08}%`, background: '#E8261F', borderRadius: 6 * u, transform: 'rotate(-3deg)' }} />
        </div>
      );
    }
    case 'nota':
      // Papelito pegado con cinta, letra a mano; *palabra* resaltada en amarillo.
      return (
        <div style={{ ...base, transform: `translate(-50%, -50%) rotate(${w.rotate ?? -4}deg) scale(${interpolate(s, [0, 1], [0.6, 1])})`, width: 260 * u * k, padding: `${26 * u * k}px ${22 * u * k}px`, background: w.color === 'amarillo' ? '#FFF27A' : '#F7F3EA', boxShadow: `0 ${10 * u}px ${18 * u}px rgba(0,0,0,0.35)`, fontFamily: font, fontWeight: 700, fontSize: 34 * u * k, lineHeight: 1.15, color: '#222', whiteSpace: 'normal' }}>
          <span style={{ position: 'absolute', left: '30%', top: -14 * u, width: '40%', height: 26 * u, background: 'rgba(240,235,220,0.75)', transform: 'rotate(3deg)' }} />
          {w.text.split(/(\*[^*]+\*)/g).map((p, i) => p.startsWith('*') ? <span key={i} style={{ background: '#F6E60B', padding: `0 ${4 * u}px` }}>{p.slice(1, -1)}</span> : <span key={i}>{p}</span>)}
        </div>
      );
    case 'tarjeta': {
      // Tarjeta blanca de dato: título pequeño, el número en rojo y barras que crecen.
      const grow = interpolate(local, [3, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const [title, value] = w.text.includes('|') ? w.text.split('|') : ['retención', w.text];
      return (
        <div style={{ ...base, transform: `translate(-50%, -50%) rotate(${w.rotate ?? -3}deg) scale(${interpolate(s, [0, 1], [0.7, 1])})`, background: '#fff', borderRadius: 16 * u, padding: `${14 * u}px ${20 * u}px`, boxShadow: `0 ${12 * u}px ${30 * u}px rgba(0,0,0,0.25)`, display: 'flex', alignItems: 'flex-end', gap: 18 * u, fontFamily: font }}>
          <div><div style={{ fontSize: 16 * u * k, color: '#888', fontWeight: 600 }}>{title}</div><div style={{ fontSize: 54 * u * k, fontWeight: 800, color: '#E8261F', lineHeight: 1 }}>{value}</div></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 * u, height: 60 * u * k }}>{[0.35, 0.55, 0.75, 1].map((h, i) => <div key={i} style={{ width: 11 * u * k, height: `${h * 100 * grow}%`, background: '#E8261F', borderRadius: 3 * u }} />)}</div>
        </div>
      );
    }
    case 'icono':
      // Tarjeta blanca redondeada con el ícono (axioma o chispa).
      return (
        <div style={{ ...base, transform: `translate(-50%, -50%) rotate(${w.rotate ?? 0}deg) scale(${interpolate(s, [0, 1], [0.4, 1])})`, width: 110 * u * k, height: 110 * u * k, borderRadius: 26 * u * k, background: w.text === 'axioma' ? '#0F5C63' : '#FFFFFF', display: 'grid', placeItems: 'center', boxShadow: `0 ${10 * u}px ${24 * u}px rgba(0,0,0,0.35)` }}>
          {w.text === 'axioma' ? <AxiomaMark size={80 * u * k} /> : <Spark size={70 * u * k} />}
        </div>
      );
    case 'emoji': {
      // Sticker: un emoji grande que salta con rebote, flota y proyecta sombra (los íconos 3D de los reels de referencia).
      const pop = spring({ frame: local, fps, config: { damping: 8, stiffness: 210 }, durationInFrames: 14 });
      const float = Math.sin(local / 9) * 7 * u;
      return <div style={{ ...base, transform: `translate(-50%, calc(-50% + ${float}px)) rotate(${w.rotate ?? -8}deg) scale(${interpolate(pop, [0, 1], [0.15, 1])})`, fontSize: 190 * u * k, lineHeight: 1, filter: `drop-shadow(0 ${16 * u}px ${18 * u}px rgba(0,0,0,0.5)) drop-shadow(0 0 ${28 * u}px rgba(255,255,255,0.4))` }}>{w.text}</div>;
    }
    case 'neon': {
      // Título de neón: letras de contorno luminoso que parpadean al encender.
      const glow = { blanco: '#7DF9FF', rojo: '#FF3B6B', amarillo: '#FFE600', negro: '#FFFFFF' }[w.color];
      const flick = local < 12 ? (local % 5 < 2 ? 0.45 : 1) : 1;
      return <div style={{ ...base, opacity: Math.min(1, s * 1.6) * out * flick, fontFamily: font, fontWeight: 900, fontSize: 120 * u * k, letterSpacing: '0.02em', color: '#fff', textTransform: 'uppercase', textShadow: `0 0 ${6 * u}px #fff, 0 0 ${18 * u}px ${glow}, 0 0 ${40 * u}px ${glow}, 0 0 ${80 * u}px ${glow}` }}>{w.text}</div>;
    }
    case 'circulo': {
      // Sello: círculo de color con la palabra ancha y en mayúsculas cruzándolo (como «PIERDEN»).
      const d = 540 * u * k;
      const bg = { rojo: '#D3202A', amarillo: '#F6E60B', negro: '#111114', blanco: '#FFFFFF' }[w.color];
      const ink = w.color === 'amarillo' || w.color === 'blanco' ? '#111114' : '#FFFFFF';
      const grow = interpolate(spring({ frame: local, fps, config: { damping: 12, stiffness: 170 }, durationInFrames: 14 }), [0, 1], [0, 1]);
      return (
        <div style={{ ...base, transform: `translate(-50%, -50%) rotate(${w.rotate ?? 0}deg)` }}>
          <div style={{ width: d, height: d, borderRadius: '50%', background: bg, display: 'grid', placeItems: 'center', transform: `scale(${grow})`, boxShadow: `0 ${20 * u}px ${50 * u}px rgba(0,0,0,0.4)` }}>
            <span style={{ fontFamily: font, fontWeight: 900, fontSize: 118 * u * k, letterSpacing: '-0.02em', color: ink, textTransform: 'uppercase', transform: 'scaleX(1.35)', display: 'inline-block' }}>{w.text}</span>
          </div>
        </div>
      );
    }
    case 'cristal':
      // Tarjeta de cristal: fondo translúcido y borde brillante (como «INGRESOS» y «GASTOS»).
      return (
        <div style={{ ...base, padding: `${22 * u * k}px ${44 * u * k}px`, borderRadius: 22 * u, border: `${3 * u}px solid rgba(255,255,255,0.75)`, background: 'linear-gradient(135deg, rgba(255,255,255,0.34), rgba(255,255,255,0.08))', backdropFilter: `blur(${14 * u}px)`, boxShadow: `0 ${14 * u}px ${34 * u}px rgba(0,0,0,0.35), inset 0 0 ${24 * u}px rgba(255,255,255,0.25)`, fontFamily: font, fontWeight: 900, fontSize: 84 * u * k, letterSpacing: '0.03em', color: '#fff', textTransform: 'uppercase' }}>{w.text}</div>
      );
    case 'ancho': {
      // Título ancho (como «¿POR QUÉ NO USAR NOTION?»): las letras entran separadas y desenfocadas y se juntan, con relieve.
      const lines = titleLines(w.text);
      const dark = w.color === 'negro';
      const spacing = interpolate(local, [0, 14], [0.5, 0.025], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      let k0 = 0;
      return (
        <div style={{ ...base, transform: `translate(-50%, -50%)${rot}`, opacity: out, textAlign: 'center', fontFamily: extra?.wide ?? font, fontWeight: 400, textTransform: 'uppercase', color: dark ? '#111114' : '#FFFFFF', lineHeight: 1.0, textShadow: dark ? `0 ${3 * u}px 0 #c8c8c8, 0 ${10 * u}px ${18 * u}px rgba(0,0,0,0.18)` : `0 ${3 * u}px 0 #cfcfcf, 0 ${6 * u}px 0 #9d9d9d, 0 ${9 * u}px 0 #6e6e6e, 0 ${14 * u}px ${26 * u}px rgba(0,0,0,0.8), 0 0 ${44 * u}px rgba(0,0,0,0.55)` }}>
          {lines.map((ln, li) => (
            <div key={li} style={{ fontSize: Math.min((ln.big ? 230 : 124) * k, 1020 / Math.max(1, ln.t.length * 0.47)) * u, letterSpacing: `${spacing}em`, whiteSpace: 'nowrap' }}>
              {[...ln.t].map((ch, ci) => {
                const at = (k0++) * 0.9;
                const o = interpolate(local, [at, at + 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                return <span key={ci} style={{ opacity: o, filter: `blur(${(1 - o) * 10 * u}px)` }}>{ch}</span>;
              })}
            </div>
          ))}
        </div>
      );
    }
    case 'acomodar': {
      // Título que se acomoda solo alrededor de la cabeza: cada línea se parte en dos mitades que entran
      // volando desde los lados y se posan a ambos lados de la cara (la cara queda libre en el centro).
      // «/» separa las filas; *palabra* o *fila entera* lleva barra verde; x = centro de la cabeza.
      // Opcional: «texto|0.17» fija la mitad del hueco libre (fracción del ancho) cuando la cara es grande.
      const [titleText, gapText] = w.text.split('|');
      const rows = titleText.split('/').map((raw) => {
        let t = raw.trim();
        const all = /^\*.*\*$/.test(t) && !t.slice(1, -1).includes('*');
        if (all) t = t.slice(1, -1);
        const tk = t.split(/\s+/).map((x) => ({ t: x.replace(/\*/g, ''), mark: all || /^\*.*\*$/.test(x) }));
        const cut = tk.length === 1 ? 1 : Math.ceil(tk.length / 2);
        return { left: tk.slice(0, cut), right: tk.slice(cut) };
      });
      const gap = Number(gapText) > 0 ? Number(gapText) : 0.145, margin = 0.03;
      const colW = (0.5 - gap - margin) * 1080;
      const dark = w.color === 'negro';
      const side = (ws: { t: string; mark: boolean }[], dir: -1 | 1, ri: number, size: number) => {
        const e = spring({ frame: local - ri * 6 - (dir === 1 ? 3 : 0), fps, config: { damping: 11, stiffness: 150 }, durationInFrames: 18 });
        const bob = Math.sin((local + ri * 7 + (dir === 1 ? 4 : 0)) / 9) * 3 * u;
        return (
          <div style={{ display: 'flex', justifyContent: dir === -1 ? 'flex-end' : 'flex-start', gap: size * 0.28, opacity: Math.min(1, e * 1.8), transform: `translate(${interpolate(e, [0, 1], [dir * 420 * u, 0])}px, ${bob}px) rotate(${interpolate(e, [0, 1], [dir * 9, 0])}deg)`, filter: `blur(${(1 - Math.min(1, e)) * 9 * u}px)` }}>
            {ws.map((x, i) => (
              <span key={i} style={{ position: 'relative', padding: x.mark ? `0 ${size * 0.1}px` : undefined, color: dark && !x.mark ? '#111114' : '#fff' }}>
                {x.mark ? <span style={{ position: 'absolute', inset: '8% 0', background: '#2BD35F', zIndex: -1 }} /> : null}
                {x.t}
              </span>
            ))}
          </div>
        );
      };
      return (
        <div style={{ position: 'absolute', left: `${(w.x - 0.5) * 100}%`, width: '100%', top: `${(w.y - 0.055) * 100}%`, transform: `${rot.trim()}`, opacity: out, fontFamily: extra?.wide ?? font, fontWeight: 400, textTransform: 'uppercase', lineHeight: 1.04, textShadow: dark ? `0 ${3 * u}px 0 #c8c8c8, 0 ${10 * u}px ${18 * u}px rgba(0,0,0,0.18)` : `0 ${3 * u}px 0 #cfcfcf, 0 ${6 * u}px 0 #9d9d9d, 0 ${9 * u}px 0 #6e6e6e, 0 ${14 * u}px ${26 * u}px rgba(0,0,0,0.8), 0 0 ${44 * u}px rgba(0,0,0,0.55)` }}>
          {rows.map((r, ri) => {
            const longest = Math.max(1, ...[...r.left, ...r.right].map((x) => x.t.length));
            const longL = r.left.reduce((a, x) => a + x.t.length + 0.6, -0.6), longR = r.right.reduce((a, x) => a + x.t.length + 0.6, -0.6);
            const size = Math.min(170 * k, colW / (Math.max(longL, longR, longest * 0.9) * 0.47)) * u;
            return (
              <div key={ri} style={{ display: 'grid', gridTemplateColumns: `1fr ${gap * 2 * 100}% 1fr`, padding: `0 ${margin * 100}%`, fontSize: size, whiteSpace: 'nowrap' }}>
                {side(r.left, -1, ri, size)}
                <span />
                {side(r.right, 1, ri, size)}
              </div>
            );
          })}
        </div>
      );
    }
    case 'apilado': {
      // Título apilado condensado (como «¿SABES PORQUÉ / NUNCA DEJARÉ / DE USAR NOTION?»): cada línea entra
      // deslizándose con las letras abiertas; la línea entre asteriscos va sobre una barra verde.
      const lines = titleLines(w.text);
      const dark = w.color === 'negro';
      return (
        <div style={{ ...base, transform: `translate(-50%, -50%)${rot}`, opacity: out, display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: extra?.cond ?? font, fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.0 }}>
          {lines.map((ln, li) => {
            const e = spring({ frame: local - li * 5, fps, config: { damping: 18, stiffness: 190 }, durationInFrames: 12 });
            const bar = interpolate(local - li * 5, [6, 14], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <div key={li} style={{ position: 'relative', fontSize: Math.min((ln.big ? 170 : 118) * k, 1020 / Math.max(1, ln.t.length * 0.62)) * u, letterSpacing: `${interpolate(e, [0, 1], [0.35, 0])}em`, opacity: e, transform: `translateX(${interpolate(e, [0, 1], [60 * u, 0])}px)`, color: ln.mark ? '#FFFFFF' : dark ? '#111114' : '#FFFFFF', textShadow: dark && !ln.mark ? 'none' : `0 ${2 * u}px ${3 * u}px rgba(0,0,0,0.85), 0 ${6 * u}px ${22 * u}px rgba(0,0,0,0.75), 0 0 ${40 * u}px rgba(0,0,0,0.5)`, padding: `0 ${10 * u}px` }}>
                {ln.mark ? <span style={{ position: 'absolute', left: 0, top: '12%', height: '80%', width: `${bar}%`, background: '#2BD35F', zIndex: -1 }} /> : null}
                {ln.t}
              </div>
            );
          })}
        </div>
      );
    }
    case 'tresd': {
      // Palabra 3D de color (como «caos» en rojo): letras redondas con relieve del mismo color, más oscuro.
      const c = { rojo: '#E8261F', amarillo: '#F6D60B', blanco: '#FFFFFF', negro: '#26262B' }[w.color];
      const depth = Array.from({ length: 7 }, (_, i) => `0 ${(i + 1) * 1.6 * u}px 0 ${shade(c === '#FFFFFF' ? '#D9D9D9' : c, 0.78 - i * 0.05)}`).join(', ');
      const pop = spring({ frame: local, fps, config: { damping: 9, stiffness: 200 }, durationInFrames: 12 });
      return <div style={{ ...base, transform: `translate(-50%, -50%) rotate(${w.rotate ?? -4}deg) scale(${interpolate(pop, [0, 1], [0.3, 1])})`, fontFamily: extra?.round ?? font, fontWeight: 800, fontSize: 150 * u * k, letterSpacing: '-0.02em', color: c, textShadow: `${depth}, 0 ${16 * u}px ${26 * u}px rgba(0,0,0,0.5)` }}>{w.text}</div>;
    }
    case 'app': {
      // Ícono tipo app 3D: cuadro redondeado con degradado, brillo y el símbolo (un emoji) en blanco.
      const g = { rojo: ['#FF9A3D', '#F04E23'], amarillo: ['#FFE259', '#FFA751'], blanco: ['#9F7BFF', '#5B3BE8'], negro: ['#3A3A40', '#111114'] }[w.color];
      const pop = spring({ frame: local, fps, config: { damping: 9, stiffness: 210 }, durationInFrames: 13 });
      const float = Math.sin(local / 10) * 6 * u;
      const side = 190 * u * k;
      return (
        <div style={{ ...base, transform: `translate(-50%, calc(-50% + ${float}px)) rotate(${w.rotate ?? 6}deg) scale(${interpolate(pop, [0, 1], [0.2, 1])})`, width: side, height: side, borderRadius: side * 0.24, background: `linear-gradient(145deg, ${g[0]}, ${g[1]})`, display: 'grid', placeItems: 'center', boxShadow: `0 ${18 * u}px ${36 * u}px rgba(0,0,0,0.45), 0 0 ${46 * u}px ${g[0]}88, inset 0 ${6 * u}px ${10 * u}px rgba(255,255,255,0.45)` }}>
          <span style={{ fontSize: side * 0.56, lineHeight: 1, filter: `drop-shadow(0 ${4 * u}px ${6 * u}px rgba(0,0,0,0.35))` }}>{w.text}</span>
        </div>
      );
    }
    case 'fondo': {
      // Lienzo de pantalla completa para escenas de solo texto: blanco con sombra abajo (como las referencias) u oscuro.
      const o = interpolate(local, [0, 4], [0, 1], { extrapolateRight: 'clamp' }) * out;
      const bg = w.color === 'negro' ? 'radial-gradient(circle at 50% 40%, #2A2A33 0%, #0B0B0D 75%)' : 'linear-gradient(180deg, #FFFFFF 0%, #F6F6F6 72%, #2A2A2A 100%)';
      return <div style={{ position: 'absolute', inset: 0, background: bg, opacity: o }} />;
    }
    case 'foto': {
      // Imagen de apoyo flotando como tarjeta inclinada en 3D, con su etiqueta (el texto) debajo.
      const src = w.files?.[0];
      const e = spring({ frame: local, fps, config: { damping: 16, stiffness: 120 }, durationInFrames: 18 });
      const cw = 560 * u * k, ch = 700 * u * k;
      return (
        <div style={{ ...base, transform: `translate(-50%, -50%) translateX(${interpolate(e, [0, 1], [320 * u, 0])}px) perspective(${1400 * u}px) rotateY(${interpolate(e, [0, 1], [-38, -10])}deg) rotate(${w.rotate ?? -4}deg)`, opacity: Math.min(1, e * 1.5) * out, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 * u }}>
          {src ? <Img src={src} style={{ width: cw, height: ch, objectFit: 'cover', borderRadius: 34 * u, border: `${4 * u}px solid rgba(255,255,255,0.85)`, boxShadow: `0 ${30 * u}px ${60 * u}px rgba(0,0,0,0.55)` }} /> : null}
          {w.text && w.text !== '-' ? <div style={{ fontFamily: font, fontWeight: 800, fontSize: 46 * u * k, color: '#fff', padding: `${10 * u}px ${26 * u}px`, borderRadius: 999, background: 'rgba(15,15,18,0.78)' }}>{w.text}</div> : null}
        </div>
      );
    }
    case 'apoyo':
    case 'seccion': {
      // Video de apoyo en tarjeta (como la referencia): la escena de atrás se desenfoca, la tarjeta redondeada entra
      // girando en 3D y se mece; la imagen se mueve dentro (acercamiento y recorrido de arriba abajo en capturas altas).
      // Con varios archivos, cada tarjeta sale volando hacia un lado y entra la siguiente.
      // «apoyo»: text = etiquetas separadas por «|»; color negro = blanco y negro. «seccion»: fondo gris con encabezado
      // (text = «LÍNEA GRANDE/línea verde»).
      const files = w.files ?? [];
      if (!files.length) return null;
      const section = w.style === 'seccion';
      const total = Math.max(1, w.to - w.from);
      const per = total / files.length;
      const idx = Math.min(files.length - 1, Math.floor(local / per));
      const lf = local - idx * per;
      const labels = section ? [] : w.text.split('|');
      const [h1, h2] = section ? w.text.split('/') : ['', ''];
      const bw = w.color === 'negro';
      const appear = spring({ frame: local, fps, config: { damping: 16, stiffness: 140 }, durationInFrames: 16 });
      const cardW = 640 * u * k, cardH = (section ? 1000 : 1060) * u * k;
      const card = (i: number, t: number, leaving: number) => {
        const e = spring({ frame: t, fps, config: { damping: 13, stiffness: 130 }, durationInFrames: 18 });
        const ry = interpolate(e, [0, 1], [i === 0 ? 55 : -60, -7]) + Math.sin((t + i * 13) / 22) * 6 + leaving * 50;
        const rz = interpolate(e, [0, 1], [i === 0 ? 6 : -8, -2]) + leaving * -14;
        const tx = leaving * -900 * u + interpolate(e, [0, 1], [i === 0 ? 0 : 700 * u, 0]);
        const src = files[i];
        const tall = /pantallas|captura/.test(src);
        const prog = Math.min(1, t / Math.max(1, per));
        return (
          <div key={i} style={{ position: 'absolute', left: '50%', top: section ? '57%' : '50%', width: cardW, height: cardH, marginLeft: -cardW / 2, marginTop: -cardH / 2, transform: `translateX(${tx}px) perspective(${1600 * u}px) rotateY(${ry}deg) rotate(${rz}deg) scale(${interpolate(e, [0, 1], [0.78, 1])})`, opacity: Math.min(1, e * 1.6) * (1 - leaving), borderRadius: 40 * u, overflow: 'hidden', boxShadow: `0 ${40 * u}px ${70 * u}px rgba(0,0,0,0.55), 0 0 0 ${2 * u}px rgba(255,255,255,0.35)`, background: '#111' }}>
            <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: tall ? `50% ${interpolate(prog, [0, 1], [0, 100])}%` : '50% 50%', transform: `scale(${interpolate(prog, [0, 1], [1.16, 1.02])})`, filter: bw ? 'grayscale(1) contrast(1.15) brightness(0.92)' : undefined }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35))' }} />
            {labels[i] ? <div style={{ position: 'absolute', left: 0, right: 0, top: '46%', textAlign: 'center', fontFamily: extra?.round ?? font, fontWeight: 600, fontSize: 54 * u, color: '#fff', textShadow: `0 ${3 * u}px ${14 * u}px rgba(0,0,0,0.8)`, opacity: interpolate(t, [6, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), letterSpacing: `${interpolate(t, [6, 16], [0.25, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}em` }}>{labels[i]}</div> : null}
            <div style={{ position: 'absolute', top: '-30%', bottom: '-30%', width: '30%', left: `${interpolate(t, [4, 22], [-50, 150], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)', transform: 'skewX(-16deg)' }} />
          </div>
        );
      };
      const leavingPrev = idx > 0 ? interpolate(lf, [0, 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
      return (
        <AbsoluteFill style={{ opacity: out }}>
          {section
            ? <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 35%, #ECECEC 0%, #D2D2D2 70%, #C4C4C4 100%)', opacity: Math.min(1, appear * 1.4) }} />
            : <AbsoluteFill style={{ backdropFilter: `blur(${interpolate(appear, [0, 1], [0, 26]) * u}px)`, background: `rgba(0,0,0,${interpolate(appear, [0, 1], [0, 0.28])})` }} />}
          {section ? (
            <div style={{ position: 'absolute', left: 0, right: 0, top: '9%', textAlign: 'center', fontFamily: extra?.wide ?? font, textTransform: 'uppercase', lineHeight: 0.92 }}>
              <div style={{ fontSize: 150 * u, color: '#fff', letterSpacing: `${interpolate(local, [0, 14], [0.3, 0.02], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}em`, textShadow: `0 ${4 * u}px 0 #9a9a9a, 0 ${9 * u}px 0 #5d5d5d, 0 ${18 * u}px ${26 * u}px rgba(0,0,0,0.45)` }}>{h1}</div>
              <div style={{ fontSize: 62 * u, color: '#2BD35F', marginTop: 6 * u, opacity: interpolate(local, [8, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), textShadow: `0 ${3 * u}px ${8 * u}px rgba(0,0,0,0.35)` }}>{h2}</div>
            </div>
          ) : null}
          {idx > 0 && leavingPrev < 1 ? card(idx - 1, per + lf, leavingPrev) : null}
          {card(idx, lf, 0)}
        </AbsoluteFill>
      );
    }
    case 'eco': {
      // Palabra en eco (como «COMENTA»): la misma palabra en contorno repetida hacia abajo, cada copia entra un poco después.
      const n = 6;
      return (
        <div style={{ position: 'absolute', left: 0, right: 0, top: `${(w.y - 0.05) * 100}%`, textAlign: 'center', fontFamily: extra?.wide ?? font, textTransform: 'uppercase', lineHeight: 0.86, opacity: out }}>
          {Array.from({ length: n }, (_, i) => {
            const e = interpolate(local - i * 2.5, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const full = i === 0;
            return <div key={i} style={{ fontSize: 190 * u * k, color: full ? '#fff' : 'transparent', WebkitTextStroke: full ? undefined : `${2.5 * u}px rgba(255,255,255,${0.85 - i * 0.12})`, opacity: e, transform: `translateY(${interpolate(e, [0, 1], [-30 * u, 0])}px)`, textShadow: full ? `0 ${10 * u}px ${30 * u}px rgba(0,0,0,0.5)` : undefined }}>{w.text}</div>;
          })}
        </div>
      );
    }
    case 'logo': {
      // Logo de marca integrado: placa de vidrio 3D que entra girando en perspectiva, con el resplandor del color
      // de la marca, un brillo que la cruza una vez, reflejo abajo y flotación suave. text = color del resplandor (#hex).
      const src = w.files?.[0];
      if (!src) return null;
      const glow = /^#[0-9a-f]{6}$/i.test(w.text) ? w.text : '#D97757';
      const e = spring({ frame: local, fps, config: { damping: 12, stiffness: 120 }, durationInFrames: 22 });
      const float = Math.sin(local / 13) * 9 * u;
      const ry = interpolate(e, [0, 1], [-85, 0]) + Math.sin(local / 19) * 7;
      const rx = Math.sin(local / 23) * 4;
      const sweep = interpolate(local, [10, 30], [-60, 160], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const pulse = 0.55 + Math.sin(local / 9) * 0.12;
      const side = 300 * u * k;
      return (
        <div style={{ ...base, transform: `translate(-50%, calc(-50% + ${float}px)) perspective(${1400 * u}px) rotateY(${ry}deg) rotateX(${rx}deg) rotate(${w.rotate ?? 0}deg) scale(${interpolate(e, [0, 1], [0.4, 1])})`, opacity: Math.min(1, e * 1.5) * out }}>
          <div style={{ position: 'absolute', inset: -side * 0.35, borderRadius: '50%', background: `radial-gradient(circle, ${glow}${Math.round(pulse * 255).toString(16).padStart(2, '0')} 0%, transparent 62%)`, filter: `blur(${18 * u}px)` }} />
          <div style={{ position: 'relative', width: side, height: side, borderRadius: side * 0.26, overflow: 'hidden', background: 'linear-gradient(150deg, #FFFDF8 0%, #EFE9DD 100%)', border: `${2 * u}px solid rgba(255,255,255,0.9)`, boxShadow: `0 ${30 * u}px ${46 * u}px rgba(0,0,0,0.5), 0 ${8 * u}px ${14 * u}px rgba(0,0,0,0.25), inset 0 ${-10 * u}px ${24 * u}px rgba(0,0,0,0.08), inset 0 ${6 * u}px ${10 * u}px rgba(255,255,255,0.9)`, display: 'grid', placeItems: 'center' }}>
            <Img src={src} style={{ width: side * 0.62, height: side * 0.62, objectFit: 'contain', filter: `drop-shadow(0 ${4 * u}px ${6 * u}px rgba(0,0,0,0.18))` }} />
            <div style={{ position: 'absolute', top: '-20%', bottom: '-20%', width: '38%', left: `${sweep}%`, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)', transform: 'skewX(-18deg)' }} />
          </div>
          <div style={{ position: 'absolute', left: '8%', right: '8%', top: side * 1.04, height: side * 0.12, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', filter: `blur(${14 * u}px)`, transform: `scale(${1 - float / (60 * u)})` }} />
        </div>
      );
    }
    case 'objeto': {
      // Objeto 3D recortado (PNG transparente): entra girando en perspectiva con rebote, flota y proyecta sombra
      // sobre la escena, sin marco. Así se ve hecho para el video y no pegado encima.
      const src = w.files?.[0];
      if (!src) return null;
      const e = spring({ frame: local, fps, config: { damping: 11, stiffness: 150 }, durationInFrames: 18 });
      const float = Math.sin(local / 11) * 10 * u;
      const tilt = Math.sin(local / 17) * 4;
      const side = 520 * u * k;
      return (
        <div style={{ ...base, transform: `translate(-50%, calc(-50% + ${float}px)) perspective(${1200 * u}px) rotateY(${interpolate(e, [0, 1], [70, tilt])}deg) rotate(${(w.rotate ?? 0) + interpolate(e, [0, 1], [-18, 0])}deg) scale(${interpolate(e, [0, 1], [0.35, 1])})`, opacity: Math.min(1, e * 1.4) * out }}>
          <Img src={src} style={{ width: side, height: side, objectFit: 'contain', filter: `drop-shadow(0 ${28 * u}px ${30 * u}px rgba(0,0,0,0.55)) drop-shadow(0 0 ${36 * u}px rgba(255,255,255,0.18))` }} />
        </div>
      );
    }
    case 'archivo': {
      // Caja de selección (con tiradores blancos) con un ícono y el texto que se va escribiendo.
      const hs = 10 * u;
      return (
        <div style={{ ...base, display: 'flex', alignItems: 'center', gap: 22 * u, padding: `${20 * u}px ${26 * u}px`, minWidth: 340 * u * k, border: `${2 * u}px solid rgba(255,255,255,0.8)`, fontFamily: font, fontWeight: 700, fontSize: 40 * u * k, lineHeight: 1.05, color: '#fff', whiteSpace: 'pre' }}>
          <div style={{ width: 70 * u * k, height: 70 * u * k, borderRadius: 16 * u, background: '#fff', display: 'grid', placeItems: 'center', transform: 'rotate(-12deg)' }}><AxiomaMark size={56 * u * k} /></div>
          <div>{typedText(w.text, local, 0.8)}</div>
          {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y], i) => <span key={i} style={{ position: 'absolute', left: `calc(${x * 100}% - ${hs / 2}px)`, top: `calc(${y * 100}% - ${hs / 2}px)`, width: hs, height: hs, background: '#fff' }} />)}
        </div>
      );
    }
    case 'tira': {
      // Línea de tiempo pequeña en perspectiva: pistas con clips de colores y el cabezal que corre.
      const head = interpolate(local, [0, Math.max(1, w.to - w.from)], [12, 88]);
      const rows = [['#E8453C', '#F4B740', '#E8453C', '#F4B740'], ['#F4B740', '#7C5CFF', '#F4B740'], ['#3DB46D', '#3DB46D', '#3DB46D', '#3DB46D', '#3DB46D']];
      return (
        <div style={{ ...base, width: 900 * u * k, padding: `${14 * u}px`, background: 'rgba(18,18,22,0.92)', borderRadius: 14 * u, transform: `translate(-50%, -50%) perspective(${900 * u}px) rotateX(18deg) scale(${interpolate(s, [0, 1], [0.85, 1])})`, boxShadow: `0 ${20 * u}px ${40 * u}px rgba(0,0,0,0.5)` }}>
          {rows.map((r, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 6 * u, marginBottom: 8 * u, height: 26 * u }}>
              {r.map((c, ci) => <div key={ci} style={{ flex: 1 + ((ri + ci) % 3) * 0.6, background: c, borderRadius: 5 * u, opacity: 0.92 }} />)}
            </div>
          ))}
          <div style={{ position: 'absolute', left: `${head}%`, top: 4 * u, bottom: 4 * u, width: 3 * u, background: '#fff' }} />
        </div>
      );
    }
    case 'ruta': {
      // Curva de animación azul con sus puntos de control (como en un editor de motion).
      const draw = interpolate(local, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
      return (
        <svg style={{ ...base, overflow: 'visible' }} width={760 * u * k} height={160 * u * k} viewBox="0 0 760 160">
          <path d="M20 120 C 160 120, 200 40, 330 70 S 520 140, 600 60 S 700 30, 740 110" fill="none" stroke="#3B6FE8" strokeWidth={5} strokeDasharray={1200} strokeDashoffset={1200 * (1 - draw)} strokeLinecap="round" />
          {[[20, 120], [330, 70], [600, 60], [740, 110]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={11} fill="#fff" stroke="#3B6FE8" strokeWidth={4} opacity={draw > i / 4 ? 1 : 0} />)}
        </svg>
      );
    }
    case 'miniaturas': {
      // Collage de miniaturas (reels) que entran volando desde abajo, una tras otra, ladeadas.
      const files = w.files ?? [];
      const spots = [[0.11, 0.1, -8], [0.86, 0.08, 6], [0.27, 0.07, 4], [0.7, 0.12, -5], [0.12, 0.3, 7], [0.88, 0.3, -6], [0.1, 0.5, -4], [0.9, 0.52, 5]];
      return (
        <AbsoluteFill style={{ opacity: out }}>
          {files.slice(0, spots.length).map((src, i) => {
            const p = spring({ frame: local - i * 3, fps, config: { damping: 16, stiffness: 140 } });
            const [x, y, r] = spots[i];
            return <Img key={i} src={src} style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: 150 * u * k, height: 266 * u * k, objectFit: 'cover', borderRadius: 14 * u, boxShadow: `0 ${10 * u}px ${24 * u}px rgba(0,0,0,0.3)`, transform: `translate(-50%, ${interpolate(p, [0, 1], [900 * u, -50 * u])}px) rotate(${r}deg)`, opacity: Math.min(1, p * 2) }} />;
          })}
        </AbsoluteFill>
      );
    }
    case 'chat': {
      // Ventana de chat oscura: saludo con la chispa, el mensaje pegado y, en «then», el adjunto.
      const wpx = 940 * u * k;
      const attach = then && w.files?.[0];
      const ap = then ? spring({ frame: f - w.then!, fps, config: { damping: 15, stiffness: 180 } }) : 0;
      return (
        <div style={{ ...base, width: wpx, transform: `translate(-50%, -50%) perspective(${1600 * u}px) rotateY(-6deg) rotateX(4deg) scale(${interpolate(s, [0, 1], [0.86, 1])})`, background: '#262624', borderRadius: 26 * u, boxShadow: `0 ${40 * u}px ${80 * u}px rgba(0,0,0,0.45), 0 0 0 ${1.5 * u}px rgba(255,255,255,0.08)`, padding: `${34 * u}px ${38 * u}px ${44 * u}px`, minHeight: 760 * u * k, fontFamily: font, color: '#ECECEC', whiteSpace: 'normal' }}>
          <div style={{ display: 'flex', gap: 9 * u, marginBottom: 26 * u }}>{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <span key={c} style={{ width: 13 * u, height: 13 * u, borderRadius: 13 * u, background: c }} />)}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 * u, fontFamily: serif, fontSize: 56 * u * k, marginTop: 110 * u * k, marginBottom: 40 * u }}><Spark size={40 * u * k} />Buenas noches</div>
          <div style={{ background: '#30302E', border: `${1.5 * u}px solid rgba(255,255,255,0.12)`, borderRadius: 22 * u, padding: `${22 * u}px` }}>
            <div style={{ display: 'flex', gap: 18 * u, alignItems: 'flex-start' }}>
              <div style={{ width: 340 * u * k, background: '#3A3A37', borderRadius: 14 * u, padding: `${18 * u}px`, fontSize: 30 * u * k, lineHeight: 1.25 }}>{w.text}<div style={{ marginTop: 10 * u, fontSize: 15 * u * k, color: '#999', border: `1px solid #666`, display: 'inline-block', padding: `${2 * u}px ${8 * u}px`, borderRadius: 6 * u }}>PEGADO</div></div>
              {attach ? <div style={{ position: 'relative', width: 250 * u * k, height: 250 * u * k, borderRadius: 16 * u, overflow: 'hidden', transform: `scale(${ap})` }}><Img src={attach} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><div style={{ position: 'absolute', left: 8 * u, bottom: 8 * u, fontSize: 16 * u * k, fontWeight: 700, background: 'rgba(0,0,0,0.6)', padding: `${2 * u}px ${8 * u}px`, borderRadius: 6 * u }}>mi-video.mp4</div></div> : null}
            </div>
            <div style={{ marginTop: 26 * u, fontSize: 34 * u * k, color: '#9A9A96' }}>¿En qué te ayudo hoy?</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 * u }}><span style={{ width: 44 * u, height: 44 * u, borderRadius: 10 * u, background: ORANGE, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 26 * u, fontWeight: 800 }}>↑</span></div>
          </div>
        </div>
      );
    }
    case 'mic': {
      // Píldora oscura con el micrófono rojo y la onda de voz moviéndose; debajo, lo que se pide.
      const bars = Array.from({ length: 14 }, (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(local * 0.45 + i * 1.3)));
      return (
        <div style={{ ...base, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 * u, background: 'rgba(22,22,24,0.88)', borderRadius: 22 * u, padding: `${14 * u}px ${22 * u}px`, fontFamily: font }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u }}>
            <span style={{ width: 44 * u * k, height: 44 * u * k, borderRadius: 44 * u, background: '#E8453C', display: 'grid', placeItems: 'center' }}><span style={{ width: 12 * u * k, height: 20 * u * k, borderRadius: 8 * u, background: '#fff' }} /></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 * u, height: 40 * u * k }}>{bars.map((h, i) => <span key={i} style={{ width: 5 * u * k, height: `${h * 100}%`, background: '#fff', borderRadius: 3 * u }} />)}</div>
          </div>
          {w.text ? <div style={{ fontSize: 22 * u * k, color: '#ddd', fontWeight: 600 }}>{typedText(w.text, local - 6, 1.2)}</div> : null}
        </div>
      );
    }
    default: {
      // Palabra gigante: entra desenfocada y se enfoca; en blanco con brillo, roja, amarilla o negra.
      const glow = w.color === 'blanco' ? `0 0 ${18 * u}px rgba(255,255,255,0.55), 0 ${6 * u}px ${30 * u}px rgba(0,0,0,0.35)` : w.color === 'amarillo' ? `0 0 ${22 * u}px rgba(246,230,11,0.35)` : 'none';
      return <div style={{ ...base, fontFamily: font, fontWeight: 900, fontSize: 158 * u * k, letterSpacing: '-0.055em', lineHeight: 1, color, textShadow: glow, filter: `blur(${interpolate(s, [0, 1], [8, 0])}px)` }}>{w.text}</div>;
    }
  }
};

/** Los elementos de un tramo; los de «detrás» quedan bajo la persona recortada (si hay recorte). */
export const Words: React.FC<{ words: KineticWord[]; f: number; fps: number; width: number; font: string; mono: string; serif: string; layer: 'detras' | 'delante'; extra?: KineticFonts }> = ({ words, f, fps, width, font, mono, serif, extra, layer }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {words.filter((w) => (layer === 'detras') === w.behind).map((w, i) => <Word key={i} w={w} f={f} fps={fps} width={width} font={font} mono={mono} serif={serif} extra={extra} />)}
  </AbsoluteFill>
);

/**
 * Grabación de pantalla flotando en 3D: una ventana con esquinas redondas y sombra que entra
 * girando y queda en perspectiva, sobre fondo claro u oscuro.
 */
export const FloatScreen: React.FC<{ src: string; trimBefore: number; f: number; fps: number; width: number; height: number; bg: 'claro' | 'oscuro'; filter?: string }> = ({ src, trimBefore, f, fps, width, bg, filter }) => {
  const u = width / 1080;
  const s = spring({ frame: f, fps, config: { damping: 20, stiffness: 90 }, durationInFrames: 22 });
  const t = f / fps;
  const ry = interpolate(s, [0, 1], [24, 5]) - t * 0.8;
  const rx = interpolate(s, [0, 1], [16, 7]);
  const w = 1000 * u, h = w * 9 / 16;
  const light = bg === 'claro';
  return (
    <AbsoluteFill style={{ background: light ? 'radial-gradient(ellipse at 50% 40%, #FFFFFF 0%, #EFEFED 55%, #DEDEDB 100%)' : 'radial-gradient(ellipse at 50% 40%, #2A2A2E 0%, #121214 60%, #070708 100%)', perspective: 1700 * u }}>
      <div style={{ position: 'absolute', left: '50%', top: '56%', width: w, height: h, transform: `translate(-50%, -50%) rotateY(${ry}deg) rotateX(${rx}deg) scale(${interpolate(s, [0, 1], [0.86, 1]) + t * 0.006})`, transformStyle: 'preserve-3d' }}>
        <div style={{ position: 'absolute', inset: -10 * u, borderRadius: 26 * u, background: '#1C1C1F', boxShadow: light ? `0 ${60 * u}px ${80 * u}px rgba(0,0,0,0.28)` : `0 ${60 * u}px ${90 * u}px rgba(0,0,0,0.75)`, transform: `translateZ(${-30 * u}px)` }} />
        {/* Una sola pieza: la pantalla en perspectiva (en franjas curvas se veían huecos con videos claros). */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 16 * u, overflow: 'hidden', backgroundColor: '#000' }}>
          <OffthreadVideo src={src} trimBefore={trimBefore} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 40%, transparent 60%)' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: '50%', top: '78%', width: w * 0.8, height: 60 * u, transform: 'translateX(-50%)', borderRadius: '50%', background: light ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.6)', filter: `blur(${30 * u}px)` }} />
    </AbsoluteFill>
  );
};
