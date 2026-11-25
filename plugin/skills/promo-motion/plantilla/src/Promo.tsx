// Andamio mínimo: muestra cómo se conectan tiempos, marca y audio. El diseño real sale del concepto.
import {Audio} from '@remotion/media';
import type {ReactNode} from 'react';
import {AbsoluteFill, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, CONTENT, FONT} from './brand';
import {BEAT, SCENES} from './timeline';

const Pop = ({delay = 0, children}: {delay?: number; children: ReactNode}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - delay, fps, config: {damping: 14, stiffness: 160}});
  const visible = frame >= delay;
  return <div style={{transform: `translateY(${(1 - s) * 80}px) scale(${0.85 + s * 0.15})`, opacity: visible ? Math.min(1, s * 1.4) : 0}}>{children}</div>;
};

const Scene = ({children, bg = COLORS.bg, color = COLORS.ink}: {children: ReactNode; bg?: string; color?: string}) => (
  <AbsoluteFill
    style={{background: bg, color, fontFamily: FONT, fontWeight: 800, textAlign: 'center', justifyContent: 'center', alignItems: 'center', gap: 48, padding: '220px 120px 380px'}}
  >
    {children}
  </AbsoluteFill>
);

const Price = ({value}: {value: string}) => (
  <div style={{background: COLORS.accent, color: COLORS.bg, borderRadius: 32, padding: '20px 48px', fontSize: 120}}>{value}</div>
);

export const Promo = ({audio}: {audio: boolean}) => (
  <AbsoluteFill style={{background: COLORS.bg}}>
    <Sequence from={SCENES.gancho.from} durationInFrames={SCENES.gancho.dur}>
      <Scene bg={COLORS.accent} color={COLORS.bg}>
        <Pop>
          <div style={{fontSize: 130, lineHeight: 1.05}}>{CONTENT.gancho}</div>
        </Pop>
        <Pop delay={BEAT}>
          <div style={{fontSize: 60}}>{CONTENT.marca}</div>
        </Pop>
      </Scene>
    </Sequence>
    <Sequence from={SCENES.estrella.from} durationInFrames={SCENES.estrella.dur}>
      <Scene>
        <Pop>
          <div style={{fontSize: 100}}>{CONTENT.estrella.nombre}</div>
        </Pop>
        <Pop delay={BEAT * 2}>
          <Price value={CONTENT.estrella.precio} />
        </Pop>
      </Scene>
    </Sequence>
    <Sequence from={SCENES.lista.from} durationInFrames={SCENES.lista.dur}>
      <Scene>
        {CONTENT.lista.map((p, i) => (
          <Pop key={p.nombre} delay={BEAT * (i + 1)}>
            <div style={{fontSize: 72, marginBottom: 20}}>{p.nombre}</div>
            <div style={{fontSize: 96, color: COLORS.accent}}>{p.precio}</div>
          </Pop>
        ))}
      </Scene>
    </Sequence>
    <Sequence from={SCENES.cierre.from} durationInFrames={SCENES.cierre.dur}>
      <Scene>
        <Pop>
          <div style={{fontSize: 130}}>{CONTENT.marca}</div>
        </Pop>
        <Pop delay={BEAT}>
          <Price value={CONTENT.destino} />
        </Pop>
        <Pop delay={BEAT * 2}>
          <div style={{fontSize: 68}}>{CONTENT.accion}</div>
        </Pop>
      </Scene>
    </Sequence>
    {audio ? <Audio src={staticFile('audio/mix.wav')} /> : null}
  </AbsoluteFill>
);
