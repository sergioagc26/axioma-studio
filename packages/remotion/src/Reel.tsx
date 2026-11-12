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
import { ease, isKeyword, keywordOf, layerStyle } from '@snz/schema';
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
      {t.sfx.map((e, i) => (
        <Sequence key={`fx${i}`} from={e.fromFrame}>
          <Audio src={e.src} volume={e.volume} />
        </Sequence>
      ))}
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
  // Movimiento de cámara lento y continuo a lo largo de toda la escena.
  const at = Math.min(1, (clip.sceneOffsetFrames + frame) / Math.max(1, clip.sceneFrames));
  const drift = clip.camera === 'acercar' ? 1 + 0.14 * at : clip.camera === 'alejar' ? 1.14 - 0.14 * at : 1;
  const cover: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom * drift})`, filter: LOOKS[clip.look] };
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

const LOOKS: Record<string, string | undefined> = {
  normal: undefined,
  bn: 'grayscale(1) contrast(1.15)',
  calido: 'sepia(0.25) saturate(1.25) contrast(1.05)',
  frio: 'hue-rotate(-12deg) saturate(0.9) contrast(1.08) brightness(1.02)',
  contraste: 'contrast(1.3) saturate(1.2)',
};

/** ¿Se lee mejor texto negro o blanco sobre este color? */
const onColor = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return '#000';
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#000' : '#fff';
};

const Caption: React.FC<{ chunk: CaptionChunk; font: string; t: Timeline }> = ({ chunk, font, t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = t.captions;
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 220 }, durationInFrames: 8 });
  const scale = interpolate(pop, [0, 1], [0.86, 1]);
  const abs = chunk.startFrame + frame;
  const stroke = Math.round(s.fontSize / 9);
  // La palabra más importante de la línea se remarca siempre (si la línea tiene más de una palabra).
  const key = s.emphasis && chunk.words.length > 1 ? keywordOf(chunk.words.map((w) => w.text).join(' ')) : '';
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: `${s.y * 100}%`,
          left: '7%',
          right: '7%',
          transform: `translateY(-50%) scale(${scale})`,
          textAlign: 'center',
          fontFamily: font,
          fontWeight: s.fontWeight,
          fontSize: s.fontSize,
          lineHeight: 1.18,
          color: s.color,
          textTransform: s.uppercase ? 'uppercase' : 'none',
          WebkitTextStroke: s.stroke ? `${stroke}px #000` : undefined,
          paintOrder: 'stroke fill',
          textShadow: '0 6px 18px rgba(0,0,0,0.45)',
        }}
      >
        {chunk.words.map((w, i) => {
          const start = w.startFrame;
          const end = chunk.words[i + 1]?.startFrame ?? chunk.endFrame;
          const active = s.mode === 'word' && abs >= start && abs < end;
          const strong = isKeyword(w.text, key);
          const hit = active ? spring({ frame: abs - start, fps, config: { damping: 10, stiffness: 260 }, durationInFrames: 6 }) : 0;
          const style: React.CSSProperties = { display: 'inline-block', margin: '0 0.12em' };
          if (strong) { style.color = s.highlightColor; style.fontSize = '1.14em'; }
          if (active) {
            if (s.effect === 'caja') {
              Object.assign(style, { backgroundColor: s.highlightColor, color: onColor(s.highlightColor), WebkitTextStroke: '0', textShadow: 'none', borderRadius: '0.18em', padding: '0 0.18em', margin: '0 0.02em', transform: `scale(${interpolate(hit, [0, 1], [0.9, 1])})` });
            } else if (s.effect === 'pop') {
              Object.assign(style, { color: s.highlightColor, transform: `scale(${interpolate(hit, [0, 1], [1, 1.2])}) translateY(${interpolate(hit, [0, 1], [0, -4])}px)` });
            } else if (s.effect === 'subrayado') {
              Object.assign(style, { boxShadow: `0 ${Math.round(s.fontSize / 7)}px 0 ${s.highlightColor}`, transform: 'translateY(-2px)' });
            } else {
              style.color = s.highlightColor;
            }
          }
          return <span key={i} style={style}>{w.text}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Texto en pantalla de una escena, en uno de siete estilos. La palabra clave se remarca. */
const Overlay: React.FC<{ overlay: TimelineOverlay; font: string; t: Timeline }> = ({ overlay, font, t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 200 }, durationInFrames: 10 });
  // La palabra clave entra un instante después, para que el ojo vaya a ella.
  const kw = spring({ frame: frame - 5, fps, config: { damping: 11, stiffness: 220 }, durationInFrames: 12 });
  const color = overlay.color ?? t.captions.highlightColor;
  const upper = t.captions.uppercase;
  const words = overlay.text.split(/\s+/).filter(Boolean);
  const isKey = (w: string) => isKeyword(w, overlay.keyword);
  const top = overlay.position === 'centro' ? '40%' : '15%';
  const wrap: React.CSSProperties = {
    position: 'absolute', top, left: '7%', right: '7%', textAlign: 'center', fontFamily: font, fontWeight: 800,
    lineHeight: 1.1, textTransform: upper ? 'uppercase' : 'none', opacity: enter,
    transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`,
  };
  const outline: React.CSSProperties = { color: '#fff', WebkitTextStroke: '9px #000', paintOrder: 'stroke fill', textShadow: '0 8px 22px rgba(0,0,0,0.5)' };
  const gap = (i: number) => (i < words.length - 1 ? ' ' : '');

  if (overlay.style === 'banda') {
    return (
      <AbsoluteFill>
        <div style={{ position: 'absolute', top: overlay.position === 'centro' ? '42%' : '11%', left: 0, right: 0, padding: '22px 60px', backgroundColor: color, color: onColor(color), fontFamily: font, fontWeight: 800, fontSize: 56, lineHeight: 1.1, textAlign: 'center', textTransform: upper ? 'uppercase' : 'none', transform: `scaleX(${interpolate(enter, [0, 1], [0, 1])})` }}>
          <span style={{ opacity: interpolate(enter, [0.6, 1], [0, 1], { extrapolateLeft: 'clamp' }) }}>{overlay.text}</span>
        </div>
      </AbsoluteFill>
    );
  }

  if (overlay.style === 'gigante') {
    const rest = words.filter((w) => !isKey(w)).join(' ');
    const key = words.find(isKey) ?? '';
    return (
      <AbsoluteFill>
        <div style={{ ...wrap, ...outline }}>
          {rest ? <div style={{ fontSize: 50 }}>{rest}</div> : null}
          {key ? <div style={{ fontSize: Math.min(190, Math.max(96, 1150 / Math.max(4, key.length))), color, lineHeight: 0.98, transform: `scale(${interpolate(kw, [0, 1], [0.6, 1])})` }}>{key}</div> : null}
        </div>
      </AbsoluteFill>
    );
  }

  if (overlay.style === 'caja') {
    return (
      <AbsoluteFill style={{ alignItems: 'center' }}>
        <div style={{ ...wrap, left: undefined, right: undefined, maxWidth: '84%', padding: '18px 30px', borderRadius: 18, backgroundColor: color, color: onColor(color), fontSize: 58 }}>
          {words.map((w, i) => <span key={i} style={isKey(w) ? { fontSize: '1.12em', textDecoration: 'underline', textDecorationThickness: 6, textUnderlineOffset: 8 } : undefined}>{w}{gap(i)}</span>)}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <div style={{ ...wrap, fontSize: 68, ...(overlay.style === 'neon' ? { color, textShadow: `0 0 18px ${color}, 0 0 46px ${color}, 0 4px 10px rgba(0,0,0,0.8)` } : outline) }}>
        {words.map((w, i) => {
          if (!isKey(w)) return <span key={i}>{w}{gap(i)}</span>;
          if (overlay.style === 'marcador') {
            // Trazo de marcador que se pinta de izquierda a derecha detrás de la palabra.
            return (
              <span key={i} style={{ position: 'relative', display: 'inline-block', padding: '0 0.16em', margin: '0 0.06em', color: onColor(color), WebkitTextStroke: '0', textShadow: 'none' }}>
                <span style={{ position: 'absolute', inset: '6% 0', backgroundColor: color, borderRadius: 10, transformOrigin: 'left center', transform: `scaleX(${Math.min(1, Math.max(0, kw))}) rotate(-1.2deg)` }} />
                <span style={{ position: 'relative' }}>{w}</span>
              </span>
            );
          }
          if (overlay.style === 'subrayado') {
            return (
              <span key={i} style={{ position: 'relative', display: 'inline-block', margin: '0 0.1em' }}>
                {w}
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: -10, height: 12, borderRadius: 6, backgroundColor: color, transformOrigin: 'left center', transform: `scaleX(${Math.min(1, Math.max(0, kw))})` }} />
              </span>
            );
          }
          if (overlay.style === 'neon') return <span key={i} style={{ display: 'inline-block', margin: '0 0.1em', color: '#fff', fontSize: '1.15em' }}>{w}</span>;
          // resaltado: la palabra clave en color y más grande.
          return <span key={i} style={{ display: 'inline-block', margin: '0 0.1em', color, fontSize: '1.22em', transform: `scale(${interpolate(kw, [0, 1], [0.8, 1])})` }}>{w}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};
