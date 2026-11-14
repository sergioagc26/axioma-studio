import React from 'react';

/**
 * Axi, el personaje de Axioma Studio (manual de marca, noviembre 2026): un botón de play con cara.
 * El mismo dibujo sirve en la app y en Remotion. La animación sale de `t` (segundos): en Remotion
 * se pasa frame/fps; en la app la mueve un reloj (ver useAxiClock en la app).
 *
 * Estados: despierto, dormido, pensando, listo, error.
 * Trabajos: cortando, buscando, subtitulando, escuchando, color, renderizando.
 * Expresiones: contento, sorprendido, guino, hablando, concentrado, celebrando.
 */
export type AxiState =
  | 'despierto' | 'dormido' | 'pensando' | 'listo' | 'error'
  | 'cortando' | 'buscando' | 'subtitulando' | 'escuchando' | 'color' | 'renderizando'
  | 'contento' | 'sorprendido' | 'guino' | 'hablando' | 'concentrado' | 'celebrando';

/** Colores de la marca. El lima manda. */
export const BRAND = {
  negro: '#09090B', hueso: '#F5F5F7', petroleo: '#0F5C63', lima: '#C6F432',
  grafito: '#16161D', petroleoClaro: '#3FA3A8',
} as const;

export type AxiColor = 'lima' | 'hueso' | 'petroleo' | 'petroleo-claro' | 'negro' | (string & {});
const bodyOf = (c: AxiColor) => (c === 'lima' ? BRAND.lima : c === 'hueso' ? BRAND.hueso : c === 'petroleo' ? BRAND.petroleo : c === 'petroleo-claro' ? BRAND.petroleoClaro : c === 'negro' ? BRAND.negro : c);
/** Cara oscura sobre colores claros; clara sobre colores oscuros. */
function faceOf(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return BRAND.negro;
  const n = parseInt(m[1], 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? BRAND.negro : hex.toLowerCase() === BRAND.negro.toLowerCase() ? BRAND.lima : BRAND.hueso;
}

const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3));
const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** Rebote suave (para saltos de 500 ms). */
const hop = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) * (1 - 0.35 * x));

export interface AxiProps {
  state?: AxiState;
  /** Segundos desde que empezó este estado (mueve la animación). */
  t?: number;
  size?: number;
  color?: AxiColor;
  /** Avance 0–1 para cortando y renderizando (barra de progreso). */
  progress?: number;
  /** Sin animación (impresión, íconos pequeños). */
  still?: boolean;
  /** Solo la forma del play (tamaños muy pequeños: menos de 40 px). */
  simple?: boolean;
  /** Accesorio: lentes, gorra, audífonos o moño. */
  accessory?: 'lentes' | 'gorra' | 'audifonos' | 'mono';
  title?: string;
  style?: React.CSSProperties;
}

/** Triángulo de play con esquinas redondeadas (viewBox 0 0 120 120). */
const PLAY = 'M30 22 L30 98 L96 60 Z';

export const Axi: React.FC<AxiProps> = ({ state = 'despierto', t = 0, size = 96, color = 'lima', progress, still, simple, accessory, title, style }) => {
  const time = still ? 0 : t;
  const isError = state === 'error';
  const body = bodyOf(isError && color === 'lima' ? 'hueso' : color);
  const face = faceOf(body);
  const bar = state === 'cortando' || state === 'renderizando';
  const p = clamp(progress ?? (time % 3) / 3);

  // ── Movimiento de todo el cuerpo ──
  let dy = 0, dx = 0, sc = 1, rot = 0;
  if (!still) {
    if (state === 'listo' || state === 'celebrando') { const k = (time % 2.2) / 0.5; dy = -hop(k) * 14; sc = 1 + hop(k) * 0.06; }
    else if (isError) { const k = time / 0.4; if (k < 1) { sc = 1 - 0.12 * Math.sin(Math.PI * k); dx = Math.sin(k * Math.PI * 6) * 5 * (1 - k); } }
    else if (state === 'dormido') { sc = 1 + Math.sin(time * 1.6) * 0.02; }
    else { dy = Math.sin(time * 2.2) * 2.6; rot = state === 'escuchando' ? Math.sin(time * 4) * 4 : 0; }
  }

  // ── Ojos ──
  const blink = !still && (time % 4) > 3.86; // parpadea cada 4 s
  let look = 0, lookY = 0;
  if (state === 'pensando') lookY = -5;
  if ((state === 'cortando' || state === 'renderizando' || state === 'buscando') && !still) look = Math.sin(time * 2.4) * 3.2;
  const eyeH = blink ? 2 : 13;
  const eye = (x: number) => <rect x={x + look - 3.2} y={48 + lookY - eyeH / 2} width={6.4} height={eyeH} rx={3.2} fill={face} />;
  const happyEye = (x: number) => <path d={`M${x - 4.5} ${51} Q${x} ${44} ${x + 4.5} ${51}`} fill="none" stroke={face} strokeWidth={3.4} strokeLinecap="round" />;
  const closedEye = (x: number) => <path d={`M${x - 4.5} ${48} Q${x} ${53} ${x + 4.5} ${48}`} fill="none" stroke={face} strokeWidth={3.4} strokeLinecap="round" />;
  const brows = (angry: boolean) => (
    <g stroke={face} strokeWidth={3.2} strokeLinecap="round">
      <path d={angry ? 'M38 38 L48 42' : 'M38 40 L48 40'} />
      <path d={angry ? 'M62 38 L52 42' : 'M52 40 L62 40'} />
    </g>
  );

  // ── Boca ──
  const smile = <path d="M41 63 Q49 70 57 63" fill="none" stroke={face} strokeWidth={3.4} strokeLinecap="round" />;
  const bigSmile = <path d="M40 61 Q49 74 58 61 Z" fill={face} />;
  const flat = <path d="M43 64 L54 64" stroke={face} strokeWidth={3.4} strokeLinecap="round" />;
  const oh = (r = 3.6) => <circle cx={49} cy={65} r={r} fill={face} />;
  const wavy = <path d="M41 66 Q44.5 62 48 66 T55 66" fill="none" stroke={face} strokeWidth={3.2} strokeLinecap="round" />;
  const frown = <path d="M42 67 Q49 61 56 67" fill="none" stroke={face} strokeWidth={3.4} strokeLinecap="round" />;

  let features: React.ReactNode;
  switch (state) {
    case 'listo': case 'contento': features = <>{happyEye(42)}{happyEye(56)}{state === 'listo' ? bigSmile : smile}</>; break;
    case 'celebrando': features = <>{star(42, 48, 5, face)}{star(56, 48, 5, face)}{bigSmile}</>; break;
    case 'escuchando': features = <>{closedEye(42)}{closedEye(56)}{smile}</>; break;
    case 'guino': features = <>{eye(42)}{happyEye(56)}{smile}</>; break;
    case 'sorprendido': features = <>{eye(42)}{eye(56)}{oh(3.4)}</>; break;
    case 'hablando': features = <>{eye(42)}{eye(56)}{oh(still ? 3.6 : 2.6 + Math.abs(Math.sin(time * 9)) * 2)}</>; break;
    case 'concentrado': features = <>{brows(true)}{eye(42)}{eye(56)}{flat}</>; break;
    case 'error': features = <>{brows(true)}{eye(42)}{eye(56)}{wavy}</>; break;
    case 'pensando': case 'cortando': features = <>{eye(42)}{eye(56)}{flat}</>; break;
    case 'subtitulando': features = <>{eye(42)}{eye(56)}{oh(3)}</>; break;
    case 'renderizando': features = <>{eye(42)}{eye(56)}{frown}</>; break;
    default: features = <>{eye(42)}{eye(56)}{smile}</>;
  }

  // ── Extras alrededor (en coordenadas del dibujo) ──
  const extras: React.ReactNode[] = [];
  if (state === 'pensando') {
    // Tres burbujas que aparecen una tras otra, en bucle.
    [[96, 30, 3.2], [104, 20, 4.4], [114, 8, 5.8]].forEach(([x, y, r], i) => {
      const on = still ? 1 : clamp(((time * 1.4) % 3) - i * 0.6);
      extras.push(<circle key={`b${i}`} cx={x} cy={y} r={r} fill="none" stroke={BRAND.hueso} strokeWidth={2.2} opacity={on} />);
    });
  }
  if (state === 'listo' || state === 'celebrando') {
    const tw = still ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(time * 3));
    extras.push(<g key="s1" opacity={tw}>{star(16, 30, 6, BRAND.hueso)}</g>, <g key="s2" opacity={1.4 - tw}>{star(104, 18, 8, BRAND.hueso)}</g>);
    if (state === 'listo') extras.push(<g key="ok"><circle cx={98} cy={98} r={11} fill={BRAND.petroleo} stroke={BRAND.hueso} strokeWidth={3} /><path d="M92 98 L96.5 102.5 L104 94" fill="none" stroke={BRAND.hueso} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" /></g>);
    else ['#C6F432', BRAND.hueso, '#3FA3A8'].forEach((c, i) => extras.push(<rect key={`c${i}`} x={[10, 104, 18][i]} y={[12 + (time * 20) % 20, 6, 104][i]} width={5} height={5} rx={1} fill={c} transform={`rotate(${time * 90 + i * 40} ${[12, 106, 20][i]} ${[14, 8, 106][i]})`} />));
  }
  if (isError) extras.push(<path key="drop" d="M100 16 Q106 26 100 30 Q94 26 100 16 Z" fill={BRAND.lima} />);
  if (state === 'dormido') {
    const k = still ? 0.5 : (time % 2.4) / 2.4;
    extras.push(<text key="z1" x={92} y={28 - k * 6} fontSize={16} fontWeight={800} fill={BRAND.lima} opacity={1 - k * 0.6} fontFamily="Sora, sans-serif">z</text>, <text key="z2" x={102} y={16 - k * 6} fontSize={22} fontWeight={800} fill={BRAND.lima} fontFamily="Sora, sans-serif">Z</text>);
  }
  if (bar) {
    extras.push(<g key="bar"><rect x={14} y={108} width={92} height={8} rx={4} fill={BRAND.petroleo} /><rect x={14} y={108} width={Math.max(8, 92 * p)} height={8} rx={4} fill={BRAND.lima} />{state === 'cortando' && <rect x={14 + 92 * p - 1.5} y={102} width={3} height={20} rx={1.5} fill={BRAND.hueso} />}</g>);
    if (state === 'renderizando') extras.push(<path key="sweat" d="M100 26 Q104 33 100 36 Q96 33 100 26 Z" fill={BRAND.hueso} opacity={0.9} />);
  }
  if (state === 'buscando') { const bx = still ? 0 : Math.sin(time * 2.4) * 3; extras.push(<g key="lupa" transform={`translate(${bx} 0)`}><circle cx={102} cy={22} r={9} fill="none" stroke={BRAND.hueso} strokeWidth={3.4} /><path d="M108.5 28.5 L116 36" stroke={BRAND.hueso} strokeWidth={3.8} strokeLinecap="round" /></g>); }
  if (state === 'subtitulando') extras.push(<g key="msg"><rect x={86} y={6} width={30} height={20} rx={5} fill={BRAND.hueso} /><path d="M92 26 L90 32 L97 26 Z" fill={BRAND.hueso} />{[12, 17, 22].map((y, i) => <rect key={i} x={91} y={y - 1.4} width={i === 2 ? 12 : 20} height={2.8} rx={1.4} fill={BRAND.negro} opacity={still || (time * 3) % 3 > i ? 1 : 0.2} />)}</g>);
  if (state === 'escuchando' || accessory === 'audifonos') extras.push(<g key="audi"><path d="M70 42 Q86 60 70 80" fill="none" stroke={BRAND.petroleoClaro} strokeWidth={6} strokeLinecap="round" /><circle cx={70} cy={42} r={6} fill={BRAND.petroleoClaro} /><circle cx={70} cy={80} r={6} fill={BRAND.petroleoClaro} />{state === 'escuchando' && <text x={96} y={34 + (still ? 0 : Math.sin(time * 4) * 3)} fontSize={22} fill={BRAND.hueso} fontFamily="Sora, sans-serif">♪</text>}</g>);
  if (state === 'color') ['#F5F5F7', '#3FA3A8', '#C6F432'].forEach((c, i) => { const on = still ? 1 : 0.5 + 0.5 * Math.sin(time * 3 - i); extras.push(<circle key={`p${i}`} cx={[100, 110, 104][i]} cy={[16, 24, 36][i]} r={5} fill={i === 2 ? 'none' : c} stroke={c} strokeWidth={2.4} opacity={on} />); });
  if (state === 'hablando') extras.push(<g key="ondas" fill="none" stroke={BRAND.hueso} strokeWidth={3} strokeLinecap="round">{[0, 1].map((i) => <path key={i} d={`M${102 + i * 7} ${48 - i * 4} Q${108 + i * 8} 60 ${102 + i * 7} ${72 + i * 4}`} opacity={still ? 1 : 0.4 + 0.6 * Math.abs(Math.sin(time * 4 - i))} />)}</g>);
  if (accessory === 'lentes') extras.push(<g key="lentes" fill={BRAND.negro}><rect x={35} y={42} width={13} height={11} rx={5} /><rect x={50} y={42} width={13} height={11} rx={5} /><rect x={46} y={46} width={6} height={2.4} /></g>);
  if (accessory === 'gorra') extras.push(<path key="gorra" d="M24 26 Q34 10 58 18 L76 24 Q60 18 30 30 Z" fill={BRAND.petroleo} />);
  if (accessory === 'mono') extras.push(<g key="mono" fill={BRAND.petroleo}><path d="M76 58 L88 52 L88 66 Z" /><path d="M100 58 L88 52 L88 66 Z" /><circle cx={88} cy={59} r={3} fill={BRAND.hueso} /></g>);

  // Dormido: el play se vuelve pausa (dos barras con ojos cerrados).
  const sleeping = state === 'dormido';
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title ?? `Axi ${state}`} style={{ overflow: 'visible', display: 'block', ...style }}>
      {title ? <title>{title}</title> : null}
      <g transform={`translate(${dx} ${dy}) rotate(${rot} 60 60) translate(60 60) scale(${sc}) translate(-60 -60)`}>
        {sleeping ? (
          <g>
            {[34, 62].map((x) => (
              <g key={x}>
                <rect x={x} y={22} width={22} height={76} rx={11} fill={BRAND.petroleo} stroke={BRAND.petroleoClaro} strokeWidth={4} />
                <path d={`M${x + 6} 54 Q${x + 11} 59 ${x + 16} 54`} fill="none" stroke={BRAND.hueso} strokeWidth={3.2} strokeLinecap="round" />
              </g>
            ))}
          </g>
        ) : (
          <>
            <path d={PLAY} fill={body} stroke={body} strokeWidth={16} strokeLinejoin="round" />
            {!simple && features}
          </>
        )}
        {!simple && extras}
      </g>
    </svg>
  );
};

function star(cx: number, cy: number, r: number, fill: string) {
  const d = `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z`;
  return <path d={d} fill={fill} />;
}

/**
 * Logo: Axi + «axioma» + «STUDIO». Sobre oscuro el play es lima; sobre claro, verde petróleo; sobre
 * lima, negro (manual, página 5).
 */
export const AxiLogo: React.FC<{ on?: 'oscuro' | 'claro' | 'lima'; height?: number; state?: AxiState; t?: number; wordmark?: boolean }> = ({ on = 'oscuro', height = 32, state = 'despierto', t = 0, wordmark = true }) => {
  const play = on === 'oscuro' ? 'lima' : on === 'claro' ? 'petroleo' : 'negro';
  const word = on === 'oscuro' ? BRAND.hueso : BRAND.negro;
  const studio = on === 'oscuro' ? BRAND.petroleoClaro : on === 'claro' ? BRAND.petroleo : BRAND.negro;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: height * 0.32 }}>
      <Axi state={state} t={t} size={height * 1.05} color={play} still={state === 'despierto' && t === 0} />
      {wordmark && (
        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1, fontFamily: "'Sora', sans-serif" }}>
          <span style={{ fontWeight: 600, fontSize: height * 0.62, color: word, letterSpacing: '-0.01em' }}>axioma</span>
          <span style={{ fontWeight: 600, fontSize: height * 0.24, color: studio, letterSpacing: '0.42em', marginTop: height * 0.06 }}>STUDIO</span>
        </span>
      )}
    </span>
  );
};
