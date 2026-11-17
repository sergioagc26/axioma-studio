import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadLocalFont } from './fonts/index.ts';
import { Axi, AxiLogo, BRAND, type AxiColor, type AxiState } from './Axi.tsx';

const sora = loadLocalFont('Sora');

/** Axi en un estado, para exportar como animación suelta (fondo transparente u oscuro). */
export interface AxiClipProps { state: AxiState; color?: AxiColor; background?: 'transparente' | 'oscuro' | 'petroleo'; progress?: boolean; [k: string]: unknown }
export const AxiClip: React.FC<AxiClipProps> = ({ state, color = 'lima', background = 'transparente', progress }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const bg = background === 'oscuro' ? BRAND.negro : background === 'petroleo' ? BRAND.petroleo : 'transparent';
  return (
    <AbsoluteFill style={{ background: bg, display: 'grid', placeItems: 'center' }}>
      <Axi state={state} t={frame / fps} size={width * 0.62} color={color} progress={progress ? frame / durationInFrames : undefined} />
    </AbsoluteFill>
  );
};

/** Abrir la app: Axi pasa de pausa a play (600 ms) y aparece el nombre. */
export const AxiIntro: React.FC<{ [k: string]: unknown }> = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const k = Math.min(1, frame / (fps * 0.6));
  const morph = spring({ frame, fps, config: { damping: 14, stiffness: 160 }, durationInFrames: Math.round(fps * 0.6) });
  const word = interpolate(frame, [fps * 0.55, fps * 0.95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tag = interpolate(frame, [fps * 1.0, fps * 1.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const s = width * 0.16;
  return (
    <AbsoluteFill style={{ background: BRAND.negro, display: 'grid', placeItems: 'center', fontFamily: sora }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s * 0.3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: s * 0.32 * word }}>
          <div style={{ position: 'relative', width: s, height: s }}>
            {/* De pausa (dormido) a play (despierto) en 600 ms: la pausa se encoge y el play entra con rebote. */}
            <div style={{ position: 'absolute', inset: 0, opacity: 1 - k, transform: `scale(${1 - 0.4 * k})` }}><Axi state="dormido" size={s} still /></div>
            <div style={{ position: 'absolute', inset: 0, opacity: k, transform: `scale(${0.6 + 0.4 * morph})` }}><Axi state="despierto" t={frame / fps} size={s} /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1, overflow: 'hidden', maxWidth: s * 3.4 * word, opacity: word }}>
            <span style={{ fontWeight: 600, fontSize: s * 0.62, color: BRAND.hueso, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>axioma</span>
            <span style={{ fontWeight: 600, fontSize: s * 0.24, color: BRAND.petroleoClaro, letterSpacing: '0.42em', marginTop: s * 0.06 }}>STUDIO</span>
          </div>
        </div>
        <div style={{ opacity: tag, transform: `translateY(${(1 - tag) * 10}px)`, color: BRAND.hueso, fontWeight: 300, fontSize: s * 0.22 }}>Dale play a tu idea.</div>
      </div>
    </AbsoluteFill>
  );
};

const CARDS: { state: AxiState; name: string; text: string }[] = [
  { state: 'despierto', name: 'Despierto', text: 'Está editando contigo.' },
  { state: 'dormido', name: 'Dormido', text: 'En pausa, esperando.' },
  { state: 'pensando', name: 'Pensando', text: 'La IA está trabajando.' },
  { state: 'listo', name: 'Listo', text: 'El render terminó.' },
  { state: 'error', name: 'Error', text: 'Algo falló, sin drama.' },
  { state: 'cortando', name: 'Cortando', text: 'Axi corta la escena 3.' },
  { state: 'buscando', name: 'Buscando b-roll', text: 'Axi busca el plano justo.' },
  { state: 'subtitulando', name: 'Subtitulando', text: 'Axi escribe lo que dices.' },
  { state: 'escuchando', name: 'Escuchando', text: 'Axi sincroniza con la música.' },
  { state: 'color', name: 'Eligiendo color', text: 'Axi prueba la paleta del cliente.' },
  { state: 'renderizando', name: 'Renderizando', text: 'Axi exporta tu reel.' },
  { state: 'celebrando', name: 'Celebrando', text: '¡Tu reel quedó!' },
];

/** Hoja de Axi: todos sus estados y trabajos animados, con la marca. */
export const AxiEstados: React.FC<{ [k: string]: unknown }> = () => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const u = width / 1920;
  return (
    <AbsoluteFill style={{ background: BRAND.negro, fontFamily: sora, padding: 90 * u, color: BRAND.hueso }}>
      <div style={{ color: BRAND.lima, fontWeight: 600, letterSpacing: '0.2em', fontSize: 22 * u }}>ESTADOS Y TRABAJOS DE AXI</div>
      <div style={{ fontWeight: 700, fontSize: 64 * u, margin: `${12 * u}px 0 ${44 * u}px` }}>Axi es quien edita por ti.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 22 * u }}>
        {CARDS.map((c, i) => {
          const enter = spring({ frame: frame - i * 3, fps, config: { damping: 16, stiffness: 180 }, durationInFrames: 12 });
          return (
            <div key={c.state} style={{ background: BRAND.grafito, border: '1px solid #24242E', borderRadius: 22 * u, padding: `${26 * u}px ${14 * u}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 * u, opacity: enter, transform: `translateY(${(1 - enter) * 30}px)` }}>
              <Axi state={c.state} t={frame / fps + i * 0.37} size={150 * u} progress={(frame % durationInFrames) / durationInFrames} />
              <div style={{ fontWeight: 600, fontSize: 26 * u, marginTop: 12 * u }}>{c.name}</div>
              <div style={{ fontWeight: 300, fontSize: 19 * u, color: '#B9B9C2', textAlign: 'center' }}>{c.text}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 90 * u, bottom: 60 * u }}><AxiLogo on="oscuro" height={44 * u} /></div>
    </AbsoluteFill>
  );
};
