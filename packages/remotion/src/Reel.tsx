import React, { useMemo } from 'react';
import {
  AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadBebas } from '@remotion/google-fonts/BebasNeue';
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald';
import { loadFont as loadArchivoBlack } from '@remotion/google-fonts/ArchivoBlack';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { ease, layerStyle } from '@snz/schema';
import type { Timeline, TimelineClip, TimelineOverlay } from '@snz/schema';
import { chunkWords, type CaptionChunk } from './captions.ts';
import { MotionGraphic } from './Motion.tsx';

const FONTS: Record<string, () => { fontFamily: string }> = {
  Montserrat: () => loadMontserrat('normal', { weights: ['700', '800', '900'], subsets: ['latin', 'latin-ext'] }),
  Inter: () => loadInter('normal', { weights: ['600', '700', '800'], subsets: ['latin', 'latin-ext'] }),
  'Space Grotesk': () => loadSpaceGrotesk('normal', { weights: ['600', '700'], subsets: ['latin', 'latin-ext'] }),
  Poppins: () => loadPoppins('normal', { weights: ['700', '800'], subsets: ['latin', 'latin-ext'] }),
  Anton: () => loadAnton('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] }),
  'Bebas Neue': () => loadBebas('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] }),
  Oswald: () => loadOswald('normal', { weights: ['600', '700'], subsets: ['latin', 'latin-ext'] }),
  'Archivo Black': () => loadArchivoBlack('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] }),
  'DM Sans': () => loadDMSans('normal', { weights: ['600', '700', '800'], subsets: ['latin', 'latin-ext'] }),
};

function useFont(name: string): string {
  return useMemo(() => (FONTS[name] ? FONTS[name]().fontFamily : name), [name]);
}

export const Reel: React.FC<Timeline> = (t) => {
  const font = useFont(t.captions.fontFamily);
  const chunks = useMemo(
    () => chunkWords(t.words, t.captions.mode === 'phrase' ? Math.max(t.captions.wordsPerLine, 5) : t.captions.wordsPerLine, t.fps),
    [t.words, t.captions.mode, t.captions.wordsPerLine, t.fps],
  );
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {t.clips.map((c, i) => (
        <Sequence key={i} from={c.fromFrame} durationInFrames={c.durationInFrames} premountFor={t.fps}>
          <Clip clip={c} t={t} font={font} />
        </Sequence>
      ))}
      {t.overlays.map((o, i) => (
        <Sequence key={`o${i}`} from={o.fromFrame} durationInFrames={o.durationInFrames}>
          <Overlay overlay={o} font={font} t={t} />
        </Sequence>
      ))}
      {chunks.map((ch, i) => (
        <Sequence key={`c${i}`} from={ch.startFrame} durationInFrames={Math.max(1, ch.endFrame - ch.startFrame)}>
          <Caption chunk={ch} font={font} t={t} />
        </Sequence>
      ))}
      {t.voiceoverSrc ? <Audio src={t.voiceoverSrc} /> : null}
      {t.musicSrc ? <Music t={t} /> : null}
    </AbsoluteFill>
  );
};

const Clip: React.FC<{ clip: TimelineClip; t: Timeline; font: string }> = ({ clip, t, font }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = clip.punchZoom
    ? interpolate(spring({ frame, fps, config: { damping: 14, stiffness: 180 } }), [0, 1], [1.18, 1.08])
    : 1;
  const cover: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` };
  const pos = coverPosition(t, clip.focusX, clip.focusY);
  // El audio siempre es la voz del video original, aunque la imagen sea otra.
  const voice = t.originalVolume <= 0 ? null
    : t.voiceSrc ? <Audio src={t.voiceSrc} trimBefore={clip.sourceStartFrame} volume={t.originalVolume} />
    : clip.visual !== 'original' ? <Audio src={t.videoSrc} trimBefore={clip.sourceStartFrame} volume={t.originalVolume} /> : null;
  // Transición de entrada: la escena anterior sigue debajo mientras la nueva entra animada.
  const tr = clip.transition && frame < clip.transition.frames ? clip.transition : null;
  const p = tr ? ease(tr.spec.easing, frame / tr.frames) : 1;
  const inStyle = tr ? layerStyle(tr.spec.entra, p) : {};
  const outPos = tr?.out ? coverPosition(t, tr.out.focusX, tr.out.focusY) : null;
  return (
    <AbsoluteFill>
      {tr?.out && outPos ? (
        <AbsoluteFill style={layerStyle(tr.spec.sale, p)}>
          <OffthreadVideo src={t.videoSrc} trimBefore={tr.out.sourceStartFrame} muted style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${outPos.x * 100}% ${outPos.y * 100}%` }} />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={inStyle}>
      {clip.motion ? (
        <MotionGraphic spec={clip.motion} brand={t.brand} font={font} upper={t.captions.uppercase} offset={clip.sceneOffsetFrames} />
      ) : clip.brollSrc ? (
        <OffthreadVideo src={clip.brollSrc} trimBefore={clip.sceneOffsetFrames} muted style={cover} />
      ) : (
        <OffthreadVideo
          src={t.videoSrc}
          trimBefore={clip.sourceStartFrame}
          muted={Boolean(t.voiceSrc) || t.originalVolume <= 0}
          volume={t.originalVolume}
          style={{ ...cover, objectPosition: `${pos.x * 100}% ${pos.y * 100}%` }}
        />
      )}
      </AbsoluteFill>
      {tr?.spec.destello ? (
        <AbsoluteFill style={{ backgroundColor: tr.spec.destello.color, opacity: tr.spec.destello.pico * Math.sin(Math.PI * Math.min(1, frame / tr.frames)) }} />
      ) : null}
      {voice}
    </AbsoluteFill>
  );
};

/**
 * Posición del recorte para que el punto de interés (la cara) quede dentro
 * del cuadro: centrado en horizontal y un poco arriba del centro en vertical.
 */
export function coverPosition(t: Pick<Timeline, 'width' | 'height' | 'sourceWidth' | 'sourceHeight'>, fx: number, fy: number) {
  const src = t.sourceWidth / t.sourceHeight;
  const box = t.width / t.height;
  const solve = (focus: number, k: number, target: number) =>
    k <= 1.001 ? 0.5 : Math.min(1, Math.max(0, (focus * k - target) / (k - 1)));
  return { x: solve(fx, src / box, 0.5), y: solve(fy, box / src, 0.42) };
}

/**
 * Música con ducking: baja al volumen base mientras hay voz y sube (hasta 2,5×)
 * en los huecos sin palabras, con rampas de 0,25 s para que no se note el salto.
 */
const Music: React.FC<{ t: Timeline }> = ({ t }) => {
  const speech = useMemo(() => {
    const a = new Uint8Array(t.durationInFrames + 1);
    const pad = Math.round(0.15 * t.fps);
    for (const w of t.words) for (let f = Math.max(0, w.startFrame - pad); f <= Math.min(t.durationInFrames, w.endFrame + pad); f++) a[f] = 1;
    return a;
  }, [t.words, t.durationInFrames, t.fps]);
  const ramp = Math.max(1, Math.round(0.25 * t.fps));
  const volume = (f: number) => {
    // Distancia (en frames) hasta la voz más cercana, limitada a la rampa.
    let dist = ramp;
    for (let k = 0; k <= ramp; k++) {
      if (speech[Math.min(t.durationInFrames, f + k)] || speech[Math.max(0, f - k)]) { dist = k; break; }
    }
    const up = Math.min(1, t.musicVolume * 2.5);
    const fadeOut = interpolate(f, [t.durationInFrames - t.fps, t.durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return interpolate(dist, [0, ramp], [t.musicVolume, up]) * fadeOut;
  };
  return <Audio src={t.musicSrc!} volume={volume} loop />;
};

const Caption: React.FC<{ chunk: CaptionChunk; font: string; t: Timeline }> = ({ chunk, font, t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = t.captions;
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 220 }, durationInFrames: 8 });
  const scale = interpolate(pop, [0, 1], [0.86, 1]);
  const abs = chunk.startFrame + frame;
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: `${s.y * 100}%`,
          left: '8%',
          right: '8%',
          transform: `translateY(-50%) scale(${scale})`,
          textAlign: 'center',
          fontFamily: font,
          fontWeight: s.fontWeight,
          fontSize: s.fontSize,
          lineHeight: 1.1,
          color: s.color,
          textTransform: s.uppercase ? 'uppercase' : 'none',
          WebkitTextStroke: s.stroke ? `${Math.round(s.fontSize / 9)}px #000` : undefined,
          paintOrder: 'stroke fill',
          textShadow: '0 6px 18px rgba(0,0,0,0.45)',
        }}
      >
        {chunk.words.map((w, i) => {
          const active = s.mode === 'word' && abs >= w.startFrame && abs < (chunk.words[i + 1]?.startFrame ?? chunk.endFrame);
          return (
            <span key={i} style={{ color: active ? s.highlightColor : undefined }}>
              {w.text}{i < chunk.words.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Overlay: React.FC<{ overlay: TimelineOverlay; font: string; t: Timeline }> = ({ overlay, font, t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 200 }, durationInFrames: 10 });
  const color = overlay.color ?? t.captions.highlightColor;
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: '17%',
          maxWidth: '82%',
          padding: '18px 30px',
          borderRadius: 18,
          backgroundColor: color,
          color: '#000',
          fontFamily: font,
          fontWeight: 800,
          fontSize: 58,
          lineHeight: 1.1,
          textAlign: 'center',
          textTransform: t.captions.uppercase ? 'uppercase' : 'none',
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`,
        }}
      >
        {overlay.text}
      </div>
    </AbsoluteFill>
  );
};
