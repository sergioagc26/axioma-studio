import React, { useMemo } from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig,
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
import { ease, isKeyword, keywordOf, layerStyle } from '@axioma/schema';
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as loadRubik } from '@remotion/google-fonts/Rubik';
import { loadFont as loadRaleway } from '@remotion/google-fonts/Raleway';
import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito';
import { loadFont as loadBarlowCondensed } from '@remotion/google-fonts/BarlowCondensed';
import { loadFont as loadRobotoCondensed } from '@remotion/google-fonts/RobotoCondensed';
import { loadFont as loadLeagueSpartan } from '@remotion/google-fonts/LeagueSpartan';
import { loadFont as loadTeko } from '@remotion/google-fonts/Teko';
import { loadFont as loadKanit } from '@remotion/google-fonts/Kanit';
import { loadFont as loadSora } from '@remotion/google-fonts/Sora';
import { loadFont as loadBangers } from '@remotion/google-fonts/Bangers';
import { loadFont as loadRighteous } from '@remotion/google-fonts/Righteous';
import { loadFont as loadPermanentMarker } from '@remotion/google-fonts/PermanentMarker';
import { loadFont as loadPacifico } from '@remotion/google-fonts/Pacifico';
import { loadFont as loadLobster } from '@remotion/google-fonts/Lobster';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { loadFont as loadLora } from '@remotion/google-fonts/Lora';
import type { CapColor, CaptionEffectSpec, Timeline, TimelineClip, TimelineOverlay } from '@axioma/schema';
import { captionDesign, captionEffect } from '@axioma/schema';
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
  'Playfair Display': () => loadPlayfair('italic', { weights: ['600', '700'], subsets: ['latin', 'latin-ext'] }),
  'Rubik': () => loadRubik('normal', { subsets: ['latin'] }),
  'Raleway': () => loadRaleway('normal', { subsets: ['latin'] }),
  'Nunito': () => loadNunito('normal', { subsets: ['latin'] }),
  'Barlow Condensed': () => loadBarlowCondensed('normal', { subsets: ['latin'] }),
  'Roboto Condensed': () => loadRobotoCondensed('normal', { subsets: ['latin'] }),
  'League Spartan': () => loadLeagueSpartan('normal', { subsets: ['latin'] }),
  'Teko': () => loadTeko('normal', { subsets: ['latin'] }),
  'Kanit': () => loadKanit('normal', { subsets: ['latin'] }),
  'Sora': () => loadSora('normal', { subsets: ['latin'] }),
  'Bangers': () => loadBangers('normal', { subsets: ['latin'] }),
  'Righteous': () => loadRighteous('normal', { subsets: ['latin'] }),
  'Permanent Marker': () => loadPermanentMarker('normal', { subsets: ['latin'] }),
  'Pacifico': () => loadPacifico('normal', { subsets: ['latin'] }),
  'Lobster': () => loadLobster('normal', { subsets: ['latin'] }),
  'Caveat': () => loadCaveat('normal', { subsets: ['latin'] }),
  'Lora': () => loadLora('normal', { subsets: ['latin'] }),
  'DM Sans': () => loadDMSans('normal', { weights: ['600', '700', '800'], subsets: ['latin', 'latin-ext'] }),
};

export function useFont(name: string): string {
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
      {t.finish.halation ? <AbsoluteFill style={{ backdropFilter: 'blur(18px) brightness(1.35) saturate(1.2)', WebkitBackdropFilter: 'blur(18px) brightness(1.35) saturate(1.2)', mixBlendMode: 'screen', opacity: 0.28, pointerEvents: 'none' }} /> : null}
      {t.finish.letterbox ? (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '7%', background: '#000' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '7%', background: '#000' }} />
        </AbsoluteFill>
      ) : null}
      {t.finish.vignette ? <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)', pointerEvents: 'none' }} /> : null}
      {t.finish.grain ? <Grain /> : null}
      {t.finish.progressBar ? <Progress t={t} /> : null}
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

/**
 * Cámara 3D sobre una foto: con el mapa de profundidad, lo cercano (claro en el mapa) se mueve
 * y crece más que el fondo, como un paralaje de cine. Sin mapa, zoom plano.
 */
const Parallax: React.FC<{ src: string; depth?: string; clip: TimelineClip; base: React.CSSProperties }> = ({ src, depth, clip, base }) => {
  const frame = useCurrentFrame();
  const at = Math.min(1, (clip.sceneOffsetFrames + frame) / Math.max(1, clip.sceneFrames || clip.durationInFrames));
  // Movimiento suave (entra y sale despacio), como un dolly real.
  const e = at * at * (3 - 2 * at);
  const a = Math.max(0.06, clip.cameraAmount);
  const dir = clip.camera === 'alejar' ? -1 : 1;
  const sx = clip.camera === 'izquierda' ? -1 : clip.camera === 'derecha' ? 1 : 0;
  const sy = clip.camera === 'arriba' ? -1 : clip.camera === 'abajo' ? 1 : 0;
  const layer = (k: number): React.CSSProperties => {
    const common = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: base.filter } as React.CSSProperties;
    if (clip.camera === 'orbita') {
      // Órbita: la cámara gira alrededor del sujeto. Las dos capas se desplazan juntas en arco y
      // giran en perspectiva; el fondo se queda un poco atrás (paralaje). La separación entre
      // capas es pequeña: el fondo es la misma foto y una separación grande duplicaría al sujeto.
      const th = (e - 0.5) * 2; // -1 → 1
      const shift = th * a * (k >= 1 ? 30 : 22);
      return { ...common, transform: `perspective(1600px) translateX(${shift}%) rotateY(${-th * a * 40}deg) scale(${1.12 + a * 0.8})` };
    }
    if (clip.camera === 'foco') {
      // Cambio de foco: se acerca muy poco; el desenfoque lo pone cada capa.
      return { ...common, transform: `scale(${1.06 + a * 0.35 * e * k})` };
    }
    return { ...common, transform: `translate(${(at - 0.5) * sx * a * 60 * k}%, ${(at - 0.5) * sy * a * 60 * k}%) scale(${1.06 + a * k * (dir > 0 ? at : 1 - at)})` };
  };
  // Cambio de foco: empieza enfocado en el fondo y pasa a lo cercano a mitad de la escena.
  const rack = clip.camera === 'foco' ? Math.min(1, Math.max(0, (at - 0.3) / 0.35)) : null;
  const rackE = rack == null ? 0 : rack * rack * (3 - 2 * rack);
  if (!depth) {
    // Sin mapa de profundidad: órbita como paneo con giro; foco como imagen que se enfoca.
    if (clip.camera === 'orbita') return <Img src={src} style={{ ...base, ...layer(0.8) }} />;
    if (rack != null) return <Img src={src} style={{ ...base, ...layer(1), filter: `${base.filter ?? ''} blur(${(8 * (1 - rackE)).toFixed(2)}px)`.trim() }} />;
    return <Img src={src} style={base} />;
  }
  const bgBlur = rack == null ? (clip.camera === 'orbita' ? 4 : 2.5) : 1 + 7 * rackE;
  const fgBlur = rack == null ? 0 : 7 * (1 - rackE);
  return (
    <AbsoluteFill>
      <Img src={src} style={{ ...layer(0.55), filter: `${base.filter ?? ''} blur(${bgBlur.toFixed(2)}px)`.trim() }} />
      <Img src={src} style={{ ...layer(1), filter: `${base.filter ?? ''}${fgBlur > 0.05 ? ` blur(${fgBlur.toFixed(2)}px)` : ''}`.trim() || undefined, maskImage: `url(${depth})`, maskMode: 'luminance', maskSize: 'cover', maskPosition: 'center', WebkitMaskImage: `url(${depth})`, WebkitMaskSize: 'cover' } as React.CSSProperties} />
    </AbsoluteFill>
  );
};

/** Grano de película: ruido que cambia en cada fotograma, muy sutil. */
const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: 0.13, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
      <svg width="100%" height="100%" aria-hidden="true">
        <filter id="grano"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame % 24} /><feColorMatrix type="saturate" values="0" /></filter>
        <rect width="100%" height="100%" filter="url(#grano)" />
      </svg>
    </AbsoluteFill>
  );
};

/** Barra de progreso arriba, con el color de la marca. */
const Progress: React.FC<{ t: Timeline }> = ({ t }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 12, background: 'rgba(255,255,255,0.22)' }}>
        <div style={{ height: '100%', width: `${(frame / Math.max(1, t.durationInFrames - 1)) * 100}%`, background: t.brand.primary, borderRadius: '0 6px 6px 0' }} />
      </div>
    </AbsoluteFill>
  );
};

const Clip: React.FC<{ clip: TimelineClip; t: Timeline; font: string }> = ({ clip, t, font }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mfont = useFont(clip.motion?.style?.font ?? '');
  const zoom = clip.punchZoom
    ? interpolate(spring({ frame, fps, config: { damping: 14, stiffness: 180 } }), [0, 1], [1.18, 1.08])
    : 1;
  // Movimiento de cámara continuo a lo largo de toda la escena.
  const at = Math.min(1, (clip.sceneOffsetFrames + frame) / Math.max(1, clip.sceneFrames));
  const amt = clip.cameraAmount;
  const abs = clip.sceneOffsetFrames + frame;
  let drift = 1, dx = 0, dy = 0;
  switch (clip.camera) {
    case 'acercar': drift = 1 + amt * at; break;
    case 'alejar': drift = 1 + amt - amt * at; break;
    // Paneos: se amplía un poco la imagen para tener margen y se desplaza.
    case 'izquierda': drift = 1 + amt; dx = (0.5 - at) * amt * 100; break;
    case 'derecha': drift = 1 + amt; dx = (at - 0.5) * amt * 100; break;
    case 'arriba': drift = 1 + amt; dy = (0.5 - at) * amt * 100; break;
    case 'abajo': drift = 1 + amt; dy = (at - 0.5) * amt * 100; break;
    // Pulso: un pequeño golpe de zoom dos veces por segundo, como al ritmo de la música.
    case 'pulso': drift = 1 + amt * 0.5 * Math.max(0, 1 - ((abs % Math.round(fps / 2)) / (fps / 6))); break;
    // Temblor: cámara en mano.
    case 'temblor': drift = 1 + amt * 0.5; dx = Math.sin(abs * 0.9) * amt * 9; dy = Math.cos(abs * 1.3) * amt * 9; break;
    // En video, la órbita es un arco lento (paneo que acelera y frena con un leve acercamiento).
    case 'orbita': { const e = at * at * (3 - 2 * at); drift = 1 + amt * (0.8 + 0.4 * Math.sin(Math.PI * e)); dx = (e - 0.5) * amt * 70; break; }
  }
  // En video, el cambio de foco es la imagen que se enfoca al empezar la escena.
  const rackBlur = clip.camera === 'foco' ? Math.max(0, 8 * (1 - Math.min(1, abs / (fps * 0.9)))) : 0;
  const filter = [LOOKS[clip.look], clip.adjust, rackBlur > 0.05 ? `blur(${rackBlur.toFixed(2)}px)` : ''].filter(Boolean).join(' ') || undefined;
  const pos = coverPosition(t, clip.focusX, clip.focusY);
  // Zoom en la palabra importante: cada énfasis alterna entre acercar y alejar, con un muelle corto.
  let kz = 1;
  if (t.emphasis?.length && clip.visual === 'original' && !clip.motion) {
    const absF = clip.fromFrame + frame;
    let n = 0;
    while (n < t.emphasis.length && t.emphasis[n] <= absF) n++;
    if (n > 0) {
      const p = spring({ frame: absF - t.emphasis[n - 1], fps, config: { damping: 18, stiffness: 220 }, durationInFrames: 8 });
      const from = (n - 1) % 2 === 1 ? 1.13 : 1;
      const to = n % 2 === 1 ? 1.13 : 1;
      kz = interpolate(p, [0, 1], [from, to]);
    }
  }
  const cover: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${dx}%, ${dy}%) scale(${zoom * drift * kz * clip.videoScale})`, transformOrigin: `${pos.x * 100}% ${pos.y * 100}%`, filter, borderRadius: clip.videoScale < 1 ? 36 : undefined };
  // El audio siempre es la voz del video original, aunque la imagen sea otra.
  // Microfundido en cada corte: evita el «clic» y el aspecto de corte automático.
  // Si solo cambia el encuadre (reencuadre al hablante), el audio sigue sin fundido.
  const fadeVol = (f: number) => t.originalVolume * Math.min(1, clip.seamIn ? 1 : (f + 1) / 2, clip.seamOut ? 1 : (clip.durationInFrames - f) / 2);
  const voice = t.originalVolume <= 0 || clip.speed ? null
    : t.voiceSrc ? <Audio src={t.voiceSrc} trimBefore={clip.sourceStartFrame} volume={fadeVol} />
    : clip.visual !== 'original' ? <Audio src={t.videoSrc} trimBefore={clip.sourceStartFrame} volume={fadeVol} /> : null;
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
      {clip.videoScale < 1 && !clip.motion && !clip.brollSrc ? (
        // Video más pequeño que el cuadro: detrás va el mismo video desenfocado, como fondo.
        <OffthreadVideo src={t.videoSrc} trimBefore={clip.sourceStartFrame} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(30px) brightness(0.6)', transform: 'scale(1.2)' }} />
      ) : null}
      {clip.motion?.style?.background === 'video' ? (
        <OffthreadVideo src={t.videoSrc} trimBefore={clip.sourceStartFrame} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(26px) saturate(1.2)', transform: 'scale(1.18)' }} />
      ) : null}
      {clip.motion ? (
        <AbsoluteFill><MotionGraphic spec={clip.motion} brand={t.brand} font={mfont || font} upper={t.captions.uppercase} offset={clip.sceneOffsetFrames} /></AbsoluteFill>
      ) : clip.brollSrc ? (
        // Una imagen como b-roll: el movimiento de cámara de la escena la anima.
        /\.(jpe?g|png|webp)(\?|$)/i.test(clip.brollSrc) ? <Parallax src={clip.brollSrc} depth={clip.brollDepthSrc} clip={clip} base={cover} />
        : <OffthreadVideo src={clip.brollSrc} trimBefore={clip.sceneOffsetFrames} muted style={cover} />
      ) : clip.backdrop && t.cutoutSrc ? (
        // Persona recortada sobre otro fondo: color, degradado, el video desenfocado o una imagen.
        <>
          {clip.backdrop === 'cine' ? <OffthreadVideo src={t.videoSrc} trimBefore={clip.sourceStartFrame} muted style={{ ...cover, objectPosition: `${pos.x * 100}% ${pos.y * 100}%`, filter: `${filter ?? ''} blur(11px) brightness(0.92)`.trim() }} />
            : clip.backdrop === 'desenfoque' ? <OffthreadVideo src={t.videoSrc} trimBefore={clip.sourceStartFrame} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.55)', transform: 'scale(1.2)' }} />
            : clip.backdrop === 'imagen' && clip.backdropSrc ? (/\.(jpe?g|png|webp)(\?|$)/i.test(clip.backdropSrc)
              ? <Parallax src={clip.backdropSrc} depth={clip.backdropDepthSrc} clip={clip} base={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.05 + 0.08 * (frame / Math.max(1, clip.durationInFrames))})` }} />
              : <OffthreadVideo src={clip.backdropSrc} trimBefore={clip.sceneOffsetFrames} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
            : <AbsoluteFill style={{ background: clip.backdrop === 'claro' ? '#F4F1EA' : clip.backdrop === 'marca' ? t.brand.primary : clip.backdrop === 'degradado' ? `linear-gradient(${150 + 40 * Math.sin((clip.fromFrame + frame) / 45)}deg, ${t.brand.primary}, ${t.brand.secondary})` : '#0B0B0F' }} />}
          <AbsoluteFill>
            <OffthreadVideo src={t.cutoutSrc} transparent trimBefore={clip.sourceStartFrame} muted style={{ ...cover, objectPosition: `${pos.x * 100}% ${pos.y * 100}%` }} />
          </AbsoluteFill>
          {!t.voiceSrc && t.originalVolume > 0 && !clip.speed ? <Audio src={t.videoSrc} trimBefore={clip.sourceStartFrame} volume={fadeVol} /> : null}
        </>
      ) : (
        <OffthreadVideo
          // Cámara lenta: el video interpolado (suave) o, mientras se prepara, el original más lento.
          src={clip.slowSrc ?? t.videoSrc}
          trimBefore={clip.slowSrc ? 0 : clip.sourceStartFrame}
          playbackRate={clip.speed && !clip.slowSrc ? clip.speed : 1}
          muted={Boolean(t.voiceSrc) || t.originalVolume <= 0 || Boolean(clip.speed)}
          volume={fadeVol}
          style={{ ...cover, objectPosition: `${pos.x * 100}% ${pos.y * 100}%` }}
        />
      )}
        {clip.vignette > 0 ? <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${0.85 * clip.vignette}) 100%)`, pointerEvents: 'none' }} /> : null}
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
  vivo: 'saturate(1.6) contrast(1.08)',
  cine: 'contrast(1.15) saturate(0.85) sepia(0.18) hue-rotate(-8deg) brightness(0.96)',
  vintage: 'sepia(0.45) contrast(0.92) saturate(0.8) brightness(1.05)',
  suave: 'contrast(0.88) brightness(1.08) saturate(0.9)',
  dramatico: 'contrast(1.4) brightness(0.85) saturate(0.9)',
  sepia: 'sepia(0.9) contrast(1.05)',
};

/** ¿Se lee mejor texto negro o blanco sobre este color? */
const onColor = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return '#000';
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#000' : '#fff';
};

const Caption: React.FC<{ chunk: CaptionChunk; font: string; t: Timeline }> = ({ chunk, font: baseFont, t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = t.captions;
  const serif = useFont('Playfair Display');
  const d = s.design;
  // Diseños descritos como datos (todos menos los cinco con dibujo propio).
  const spec = captionDesign(d);
  const G = spec.legacy ? null : spec;
  const gfont = useFont(G?.font ?? '');
  const font = d === 'elegante' ? serif : gfont || baseFont;
  const fx = captionEffect(s.effect);
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 220 }, durationInFrames: 8 });
  const abs = chunk.startFrame + frame;
  const size = s.fontSize * (d === 'impacto' ? 1.3 : d === 'elegante' ? 0.86 : d === 'cinta' ? 0.92 : G?.size ?? 1);
  const stroke = Math.round((size / (d === 'impacto' ? 6.5 : 9)) * s.strokeScale * (G?.strokeMult ?? 1));
  const la = s.lineAnim;
  const hl = s.highlightColor;
  const upper = d === 'elegante' ? false : d === 'impacto' || d === 'cinta' || d === 'bloque' ? true : G?.upper ?? s.uppercase;
  const sec = t.brand.secondary;
  const col = (c: CapColor | undefined, fallback: string) => (c === 'acento' ? hl : c === 'secundario' ? sec : c === 'blanco' ? '#fff' : c === 'negro' ? '#000' : c === 'texto' ? s.color : fallback);
  // Fondos que fijan el color de la letra.
  const bgText = G?.bg === 'caja-acento' || G?.bg === 'pildora-acento' ? onColor(hl) : G?.bg === 'blanca' ? '#000' : G?.bg === 'negra' ? '#fff' : null;
  const wordBg = G?.bg === 'palabra' || G?.bg === 'palabra-acento' || G?.bg === 'palabra-blanca' || G?.bg === 'alterna';
  const FILLS: Record<string, string> = {
    degradado: `linear-gradient(100deg, ${hl}, ${sec})`,
    fuego: 'linear-gradient(180deg, #FFF3B0 10%, #FACC15 40%, #F97316 70%, #DC2626 100%)',
    hielo: 'linear-gradient(180deg, #FFFFFF 0%, #BAE6FD 45%, #38BDF8 100%)',
    cromado: 'linear-gradient(180deg, #FFFFFF 0%, #D4D8DD 38%, #6B7280 52%, #E5E7EB 66%, #FFFFFF 100%)',
    oro: 'linear-gradient(180deg, #FFF6C8 0%, #F5C542 40%, #B8860B 60%, #FDE68A 100%)',
  };
  const fill = G?.fill && G.fill !== 'hueco' ? FILLS[G.fill] : null;
  const gShadow = !G?.shadow ? null
    : G.shadow === 'suave' ? '0 6px 18px rgba(0,0,0,0.55)'
    : G.shadow === 'dura' ? '0.06em 0.06em 0 #000'
    : G.shadow === 'dura-acento' ? `0.06em 0.06em 0 ${hl}, 0.12em 0.12em 0 #000`
    : G.shadow === 'doble' ? `0.05em 0.05em 0 ${hl}, 0.1em 0.1em 0 ${sec}, 0.15em 0.15em 0 #000`
    : G.shadow === 'neon' ? `0 0 14px ${hl}, 0 0 40px ${hl}, 0 3px 8px rgba(0,0,0,0.9)`
    : G.shadow === 'halo' ? `0 0 12px rgba(255,255,255,0.9), 0 0 36px ${hl}, 0 0 70px ${hl}`
    : G.shadow === 'volumen' ? Array.from({ length: 8 }, (_, i) => `${(i + 1) * 0.012}em ${(i + 1) * 0.012}em 0 ${i < 4 ? sec : '#000'}`).join(', ') + ', 0.14em 0.16em 14px rgba(0,0,0,0.6)'
    : G.shadow === 'larga' ? Array.from({ length: 14 }, (_, i) => `${(i + 1) * 0.012}em ${(i + 1) * 0.012}em 0 rgba(0,0,0,${0.55 - i * 0.03})`).join(', ')
    : 'none';
  // La palabra más importante de la línea se remarca siempre (si la línea tiene más de una palabra).
  const key = s.emphasis && chunk.words.length > 1 ? keywordOf(chunk.words.map((w) => w.text).join(' ')) : '';
  const plain = d === 'bloque' || d === 'cinta' || d === 'neon' || d === 'elegante' || Boolean(G && (G.stroke === 'ninguno' || fill || bgText || wordBg || G.bg)); // diseños sin borde
  const strokeColor = G?.fill === 'hueco' ? '#fff' : G?.stroke === 'blanco' ? '#fff' : G?.stroke === 'acento' ? hl : '#000';
  const tapes = [hl, '#FFFFFF', t.brand.secondary];

  const box: React.CSSProperties = {
    position: 'absolute', top: `${s.y * 100}%`, left: '7%', right: '7%',
    transform: `translateY(${la === 'subir' ? `calc(-50% + ${interpolate(pop, [0, 1], [40, 0])}px)` : '-50%'}) translateX(${la === 'deslizar' ? interpolate(pop, [0, 1], [-80, 0]) : 0}px) scale(${la === 'pop' ? interpolate(pop, [0, 1], [0.86, 1]) : 1})${d === 'bloque' ? ' rotate(-2deg)' : ''}${G?.tilt ? ` rotate(${G.tilt}deg)` : ''}${G?.skew ? ` skewX(${G.skew}deg)` : ''}`,
    opacity: la === 'ninguna' ? 1 : Math.min(1, pop * 2),
    textAlign: 'center', fontFamily: font, fontWeight: d === 'elegante' ? 600 : G?.weight ?? s.fontWeight, fontStyle: d === 'elegante' || G?.italic ? 'italic' : undefined,
    fontSize: size, lineHeight: d === 'cinta' || wordBg ? 1.45 : 1.18, letterSpacing: `${s.spacing + (d === 'elegante' ? 0.01 : 0) + (G?.spacing ?? 0)}em`,
    color: d === 'neon' ? hl : G?.fill === 'hueco' ? 'transparent' : bgText ?? col(G?.color, s.color), textTransform: upper ? 'uppercase' : 'none',
    WebkitTextStroke: G?.fill === 'hueco' ? `${Math.max(2, Math.round(size / 22))}px #fff` : s.stroke && !plain && stroke > 0 ? `${stroke}px ${strokeColor}` : undefined, paintOrder: 'stroke fill',
    textShadow: d === 'neon' ? `0 0 14px ${hl}, 0 0 40px ${hl}, 0 3px 8px rgba(0,0,0,0.9)` : d === 'elegante' ? '0 3px 14px rgba(0,0,0,0.75)' : fill || bgText || wordBg ? 'none' : gShadow ?? (plain ? 'none' : '0 6px 18px rgba(0,0,0,0.45)'),
    filter: fill || G?.fill === 'hueco' ? 'drop-shadow(0 5px 8px rgba(0,0,0,0.7))' : undefined,
  };
  // Fondo de toda la línea.
  const lineBg: React.CSSProperties | undefined =
    d === 'bloque' ? { display: 'inline-block', backgroundColor: hl, color: onColor(hl), padding: '0.12em 0.4em', borderRadius: '0.16em', boxShadow: '0 10px 0 rgba(0,0,0,0.35)' }
    : G?.bg === 'caja' ? { display: 'inline-block', backgroundColor: 'rgba(8,8,10,0.66)', padding: '0.16em 0.45em', borderRadius: '0.22em' }
    : G?.bg === 'caja-acento' ? { display: 'inline-block', backgroundColor: hl, padding: '0.12em 0.42em', borderRadius: '0.14em', boxShadow: '0 8px 0 rgba(0,0,0,0.3)' }
    : G?.bg === 'blanca' ? { display: 'inline-block', backgroundColor: '#fff', padding: '0.12em 0.42em', borderRadius: '0.14em' }
    : G?.bg === 'negra' ? { display: 'inline-block', backgroundColor: '#000', padding: '0.12em 0.42em', borderRadius: '0.14em' }
    : G?.bg === 'pildora' ? { display: 'inline-block', backgroundColor: 'rgba(8,8,10,0.72)', padding: '0.2em 0.7em', borderRadius: 999 }
    : G?.bg === 'pildora-acento' ? { display: 'inline-block', backgroundColor: hl, padding: '0.2em 0.7em', borderRadius: 999 }
    : G?.bg === 'cristal' ? { display: 'inline-block', backgroundColor: 'rgba(255,255,255,0.16)', border: '2px solid rgba(255,255,255,0.35)', padding: '0.18em 0.55em', borderRadius: '0.3em', backdropFilter: 'blur(10px)' }
    : G?.bg === 'borde' ? { display: 'inline-block', border: `0.07em solid ${hl}`, padding: '0.16em 0.5em', borderRadius: '0.12em', backgroundColor: 'rgba(0,0,0,0.35)' }
    : s.plate ? { display: 'inline-block', backgroundColor: 'rgba(8,8,10,0.62)', padding: '0.16em 0.45em', borderRadius: '0.28em', backdropFilter: 'blur(6px)' }
    : undefined;
  const altTapes = [hl, '#FFFFFF', sec];

  /** Remarca la palabra que suena según la forma elegida. */
  const applyFx = (style: React.CSSProperties, f: CaptionEffectSpec, hit: number, soft: number, wordAbs: number) => {
    const tf: string[] = [];
    const c = f.color ? col(f.color, hl) : null;
    if (c) Object.assign(style, { color: c, backgroundImage: 'none' });
    if (f.gradient) Object.assign(style, { backgroundImage: `linear-gradient(100deg, ${hl}, ${sec})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextStroke: '0', textShadow: 'none' });
    if (f.bg) {
      const bg = col(f.bg, hl);
      Object.assign(style, { backgroundImage: 'none', backgroundColor: bg, color: f.color ? c : onColor(bg), WebkitTextStroke: '0', textShadow: 'none', borderRadius: f.round ? 999 : '0.18em', padding: f.round ? '0 0.34em' : '0 0.18em', margin: '0 0.02em' });
      if (f.scale === undefined) tf.push(`scale(${interpolate(hit, [0, 1], [0.9, 1])})`);
    }
    const k = f.bounce ? soft : hit;
    if (f.scale && f.scale !== 1) tf.push(`scale(${interpolate(k, [0, 1], [1, f.scale])})`);
    if (f.stretch) tf.push(`scaleX(${interpolate(k, [0, 1], [1, f.stretch])})`);
    if (f.lift) tf.push(`translateY(${interpolate(k, [0, 1], [0, -f.lift])}px)`);
    if (f.rotate) tf.push(`rotate(${interpolate(k, [0, 1], [0, f.rotate])}deg)`);
    if (f.skew) tf.push(`skewX(${interpolate(hit, [0, 1], [0, f.skew])}deg)`);
    if (f.shake) tf.push(`translate(${Math.sin(wordAbs * 2.6) * 3}px, ${Math.cos(wordAbs * 3.1) * 2}px)`);
    if (f.flip) tf.push(`perspective(600px) rotateX(${interpolate(hit, [0, 1], [-80, 0])}deg)`);
    if (f.focus) style.filter = `blur(${interpolate(hit, [0, 1], [8, 0])}px)`;
    const th = (n: number) => Math.max(2, Math.round(size / n));
    if (f.line === 'debajo') style.boxShadow = `0 ${th(7)}px 0 ${hl}`;
    else if (f.line === 'gruesa') style.boxShadow = `0 ${th(4)}px 0 ${hl}`;
    else if (f.line === 'fina') style.boxShadow = `0 ${th(16)}px 0 ${hl}`;
    else if (f.line === 'doble') style.borderBottom = `${th(6)}px double ${hl}`;
    else if (f.line === 'puntos') style.borderBottom = `${th(10)}px dotted ${hl}`;
    else if (f.line === 'arriba') style.boxShadow = `0 -${th(9)}px 0 ${hl}`;
    else if (f.line === 'ambas') style.boxShadow = `0 ${th(12)}px 0 ${hl}, 0 -${th(12)}px 0 ${hl}`;
    else if (f.line === 'marcador') { Object.assign(style, { backgroundImage: `linear-gradient(transparent 48%, ${hl} 48%, ${hl} 92%, transparent 92%)`, backgroundClip: 'border-box', WebkitBackgroundClip: 'border-box', padding: '0 0.12em', margin: '0 0.02em' }); style.color = onColor(hl); style.WebkitTextStroke = '0'; style.textShadow = 'none'; }
    else if (f.line === 'circulo') Object.assign(style, { outline: `${th(14)}px solid ${hl}`, outlineOffset: '0.04em', borderRadius: 999, padding: '0 0.2em' });
    else if (f.line === 'recuadro') Object.assign(style, { outline: `${th(14)}px solid ${hl}`, outlineOffset: '0.02em', borderRadius: '0.1em', padding: '0 0.14em' });
    if (f.glow) style.textShadow = `0 0 12px ${c ?? hl}, 0 0 34px ${hl}`;
    if (f.shadow) style.textShadow = `0.07em 0.07em 0 ${hl}, 0.13em 0.13em 0 #000`;
    if (f.outline) Object.assign(style, { WebkitTextStroke: `${Math.max(3, stroke)}px ${hl}`, paintOrder: 'stroke fill' });
    if (f.hollow) Object.assign(style, { color: 'transparent', backgroundImage: 'none', WebkitTextStroke: `${th(20)}px ${hl}`, textShadow: 'none' });
    if (f.italic) style.fontStyle = 'italic';
    if (f.heavy) style.fontWeight = 900;
    if (f.caps) style.textTransform = 'uppercase';
    if (tf.length) style.transform = `${style.transform ?? ''} ${tf.join(' ')}`.trim();
  };
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={box}>
        <span style={lineBg}>
          {chunk.words.map((w, i) => {
            const start = w.startFrame;
            const end = chunk.words[i + 1]?.startFrame ?? chunk.endFrame;
            const active = s.mode === 'word' && abs >= start && abs < end;
            const strong = isKeyword(w.text, key);
            const hit = active ? spring({ frame: abs - start, fps, config: { damping: 10, stiffness: 260 }, durationInFrames: 6 }) : 0;
            const style: React.CSSProperties = { display: 'inline-block', margin: '0 0.12em' };
            const soft = active ? spring({ frame: abs - start, fps, config: { damping: 5, stiffness: 200, mass: 0.7 } }) : 0;

            if (d === 'cinta') {
              // Cada palabra en su propia tira de color, torcida y alternando.
              const bg = tapes[i % tapes.length];
              Object.assign(style, { backgroundColor: bg, color: onColor(bg), padding: '0.02em 0.28em', margin: '0.06em 0.05em', borderRadius: '0.1em', boxShadow: '0 6px 0 rgba(0,0,0,0.35)', transform: `rotate(${i % 2 ? 2.5 : -2.5}deg) scale(${active ? interpolate(hit, [0, 1], [1, 1.16]) : 1})` });
            } else if (d === 'bloque') {
              if (active) Object.assign(style, { backgroundColor: onColor(hl), color: hl, borderRadius: '0.14em', padding: '0 0.16em', margin: '0 0.02em' });
              else if (strong) style.textDecoration = 'underline';
            } else if (d === 'impacto') {
              // Palabras enormes, inclinadas; la que suena crece y cambia de color.
              Object.assign(style, { transform: `rotate(${i % 2 ? 2 : -2}deg) scale(${active ? interpolate(hit, [0, 1], [1, 1.22]) : 1})`, color: active || strong ? hl : undefined });
            } else if (d === 'neon') {
              if (active) Object.assign(style, { color: '#fff', transform: `scale(${interpolate(hit, [0, 1], [1, 1.12])})` });
            } else if (d === 'elegante') {
              if (active || strong) Object.assign(style, { boxShadow: `0 ${Math.max(3, Math.round(size / 14))}px 0 ${hl}` });
            } else {
              // Diseños por datos: relleno, fondo por palabra y giro alterno; luego la forma de remarcar.
              if (fill) Object.assign(style, { backgroundImage: fill, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' });
              if (wordBg) {
                const bg = G!.bg === 'palabra' ? 'rgba(8,8,10,0.82)' : G!.bg === 'palabra-acento' ? hl : G!.bg === 'palabra-blanca' ? '#FFFFFF' : altTapes[i % altTapes.length];
                Object.assign(style, { backgroundColor: bg, color: G!.bg === 'palabra' ? col(G!.color, '#fff') : onColor(bg), padding: '0.02em 0.26em', margin: '0.06em 0.05em', borderRadius: '0.12em' });
              }
              if (G?.alt) style.transform = `rotate(${i % 2 ? G.alt : -G.alt}deg)`;
              if (strong && !fill && !wordBg && !bgText) { style.color = hl; style.fontSize = '1.14em'; }
              else if (strong) style.fontSize = '1.14em';
              if (active) applyFx(style, fx, hit, soft, abs);
              else if (fx.dim && s.mode === 'word') style.opacity = 0.4;
            }
            return <span key={i} style={style}>{w.text}</span>;
          })}
        </span>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Texto en pantalla de una escena. Once estilos, con la palabra clave remarcada,
 * tamaño, tipografía, posición libre y animación de entrada.
 */
const Overlay: React.FC<{ overlay: TimelineOverlay; font: string; t: Timeline }> = ({ overlay, font: baseFont, t }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const font = useFont(overlay.font ?? '') || baseFont;
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 200 }, durationInFrames: 10 });
  // La palabra clave entra un instante después, para que el ojo vaya a ella.
  const kw = spring({ frame: frame - 5, fps, config: { damping: 11, stiffness: 220 }, durationInFrames: 12 });
  const color = overlay.color ?? t.captions.highlightColor;
  const upper = t.captions.uppercase;
  const k = overlay.size;
  // Texto visible en este momento: entero, palabra por palabra o letra por letra.
  const shown = overlay.anim === 'palabra' ? overlay.text.split(/\s+/).filter(Boolean).slice(0, 1 + Math.floor(frame / 4)).join(' ')
    : overlay.anim === 'maquina' ? overlay.text.slice(0, 1 + Math.floor(frame * 1.4))
    : overlay.text;
  const words = shown.split(/\s+/).filter(Boolean);
  const isKey = (w: string) => isKeyword(w, overlay.keyword);
  const gap = (i: number) => (i < words.length - 1 ? ' ' : '');

  // Animación de entrada.
  const anim: React.CSSProperties =
    overlay.anim === 'pop' ? { opacity: Math.min(1, enter * 2), transform: `translate(-50%, -50%) scale(${interpolate(enter, [0, 1], [0.55, 1])})` }
    : overlay.anim === 'deslizar' ? { opacity: enter, transform: `translate(calc(-50% + ${interpolate(enter, [0, 1], [-90, 0])}px), -50%)` }
    : overlay.anim === 'fundido' ? { opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' }), transform: 'translate(-50%, -50%)' }
    : overlay.anim === 'barrido' ? { transform: 'translate(-50%, -50%)', clipPath: `inset(-20% ${interpolate(frame, [0, 12], [100, -5], { extrapolateRight: 'clamp' })}% -20% -5%)` }
    : overlay.anim === 'rebote' ? { opacity: Math.min(1, enter * 3), transform: `translate(-50%, calc(-50% + ${interpolate(spring({ frame, fps, config: { damping: 7, stiffness: 160 } }), [0, 1], [-260, 0])}px))` }
    : overlay.anim === 'zoom' ? { opacity: Math.min(1, enter * 2), transform: `translate(-50%, -50%) scale(${interpolate(enter, [0, 1], [2.6, 1])})` }
    : overlay.anim === 'girar' ? { opacity: enter, transform: `translate(-50%, -50%) rotate(${interpolate(enter, [0, 1], [-18, 0])}deg) scale(${interpolate(enter, [0, 1], [0.7, 1])})` }
    : overlay.anim === 'desenfoque' ? { opacity: interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' }), filter: `blur(${interpolate(frame, [0, 14], [26, 0], { extrapolateRight: 'clamp' })}px)`, transform: 'translate(-50%, -50%)' }
    : overlay.anim === 'caer' ? { opacity: Math.min(1, enter * 2), transform: `translate(-50%, calc(-50% + ${interpolate(enter, [0, 1], [-320, 0])}px))` }
    : overlay.anim === 'derecha' ? { opacity: enter, transform: `translate(calc(-50% + ${interpolate(enter, [0, 1], [420, 0])}px), -50%)` }
    : overlay.anim === 'voltear' ? { opacity: Math.min(1, enter * 2), transform: `translate(-50%, -50%) perspective(900px) rotateX(${interpolate(enter, [0, 1], [-88, 0])}deg)` }
    : overlay.anim === 'elastico' ? { opacity: Math.min(1, frame / 3), transform: `translate(-50%, -50%) scale(${spring({ frame, fps, config: { damping: 5, stiffness: 190, mass: 0.7 } })})` }
    : overlay.anim === 'latido' ? { opacity: Math.min(1, enter * 2), transform: `translate(-50%, -50%) scale(${interpolate(enter, [0, 1], [0.6, 1]) * (1 + 0.05 * Math.max(0, Math.sin((frame / fps) * Math.PI * 3)))})` }
    : overlay.anim === 'golpe' ? { opacity: Math.min(1, frame / 2), transform: `translate(calc(-50% + ${frame > 4 && frame < 12 ? Math.sin(frame * 2.4) * (12 - frame) * 1.6 : 0}px), -50%) scale(${interpolate(frame, [0, 5], [3.4, 1], { extrapolateRight: 'clamp' })})` }
    : overlay.anim === 'cortina' ? { transform: `translate(-50%, calc(-50% + ${interpolate(frame, [0, 12], [40, 0], { extrapolateRight: 'clamp' })}px))`, clipPath: `inset(${interpolate(frame, [0, 12], [105, -20], { extrapolateRight: 'clamp' })}% -5% -20% -5%)` }
    : overlay.anim === 'estirar' ? { opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' }), transform: 'translate(-50%, -50%)', letterSpacing: `${overlay.spacing + interpolate(frame, [0, 16], [0.6, 0], { extrapolateRight: 'clamp' })}em` }
    : overlay.anim === 'parpadeo' ? { opacity: frame < 12 ? (Math.floor(frame / 2) % 2 ? 1 : 0.15) : 1, transform: 'translate(-50%, -50%)' }
    // "palabra" y "maquina" revelan el texto poco a poco (ver `shown` más abajo).
    : overlay.anim === 'palabra' || overlay.anim === 'maquina' ? { transform: 'translate(-50%, -50%)' }
    : { opacity: enter, transform: `translate(-50%, calc(-50% + ${interpolate(enter, [0, 1], [34, 0])}px))` };

  const wrap: React.CSSProperties = {
    position: 'absolute', left: `${overlay.x * 100}%`, top: `${overlay.y * 100}%`, width: '86%', textAlign: 'center',
    fontFamily: font, fontWeight: 800, lineHeight: 1.1, textTransform: upper ? 'uppercase' : 'none', letterSpacing: `${overlay.spacing}em`, ...anim,
    transform: `${anim.transform ?? 'translate(-50%, -50%)'}${overlay.rotate ? ` rotate(${overlay.rotate}deg)` : ''}`,
  };
  const outline: React.CSSProperties = { color: '#fff', WebkitTextStroke: `${Math.round(9 * k)}px #000`, paintOrder: 'stroke fill', textShadow: '0 8px 22px rgba(0,0,0,0.5)' };

  if (overlay.style === 'banda') {
    return (
      <AbsoluteFill>
        <div style={{ position: 'absolute', top: `${overlay.y * 100}%`, left: 0, right: 0, padding: `${22 * k}px 60px`, backgroundColor: color, color: onColor(color), fontFamily: font, fontWeight: 800, fontSize: 56 * k, lineHeight: 1.1, textAlign: 'center', textTransform: upper ? 'uppercase' : 'none', transform: `translateY(-50%) scaleX(${interpolate(enter, [0, 1], [0, 1])})` }}>
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
          {rest ? <div style={{ fontSize: 50 * k }}>{rest}</div> : null}
          {key ? <div style={{ fontSize: Math.min(190, Math.max(96, 1150 / Math.max(4, key.length))) * k, color, lineHeight: 0.98, transform: `scale(${interpolate(kw, [0, 1], [0.6, 1])})` }}>{key}</div> : null}
        </div>
      </AbsoluteFill>
    );
  }

  if (overlay.style === 'caja' || overlay.style === 'etiqueta') {
    const tag = overlay.style === 'etiqueta';
    return (
      <AbsoluteFill>
        <div style={{ ...wrap, width: 'auto', maxWidth: '84%', display: 'flex', alignItems: 'center', gap: 16 * k, padding: tag ? `${14 * k}px ${30 * k}px` : `${18 * k}px ${30 * k}px`, borderRadius: tag ? 999 : 18, backgroundColor: tag ? 'rgba(10,10,12,0.78)' : color, color: tag ? '#fff' : onColor(color), fontSize: (tag ? 44 : 58) * k, fontWeight: tag ? 700 : 800 }}>
          {tag ? <span style={{ width: 20 * k, height: 20 * k, borderRadius: 999, backgroundColor: color, flex: 'none' }} /> : null}
          <span>
            {words.map((w, i) => <span key={i} style={isKey(w) ? (tag ? { color } : { fontSize: '1.12em', textDecoration: 'underline', textDecorationThickness: 6, textUnderlineOffset: 8 }) : undefined}>{w}{gap(i)}</span>)}
          </span>
        </div>
      </AbsoluteFill>
    );
  }

  if (overlay.style === 'cinta') {
    // Cada palabra en su tira de color, torcidas y entrando una tras otra.
    const tapes = [color, '#FFFFFF', t.brand.secondary];
    return (
      <AbsoluteFill>
        <div style={{ ...wrap, opacity: 1, fontSize: 70 * k, lineHeight: 1.5 }}>
          {words.map((w, i) => {
            const e = spring({ frame: frame - i * 3, fps, config: { damping: 12, stiffness: 220 }, durationInFrames: 10 });
            const bg = isKey(w) ? color : tapes[(i + 1) % tapes.length];
            return <span key={i} style={{ display: 'inline-block', backgroundColor: bg, color: onColor(bg), padding: '0.02em 0.3em', margin: '0.08em 0.06em', borderRadius: '0.1em', boxShadow: '0 8px 0 rgba(0,0,0,0.4)', fontSize: isKey(w) ? '1.2em' : undefined, transform: `rotate(${i % 2 ? 3 : -3}deg) scale(${e})` }}>{w}</span>;
          })}
        </div>
      </AbsoluteFill>
    );
  }

  if (overlay.style === 'sello') {
    // Sello de tinta: cae grande y se asienta torcido.
    const e = spring({ frame, fps, config: { damping: 9, stiffness: 240 }, durationInFrames: 10 });
    return (
      <AbsoluteFill>
        <div style={{ ...wrap, width: 'auto', maxWidth: '80%', opacity: Math.min(1, e * 1.5), transform: `translate(-50%, -50%) rotate(-8deg) scale(${interpolate(e, [0, 1], [2.2, 1])})`, padding: `${20 * k}px ${40 * k}px`, border: `${10 * k}px solid ${color}`, outline: `${4 * k}px solid ${color}`, outlineOffset: 8 * k, borderRadius: 18, color, fontSize: 74 * k, textTransform: 'uppercase', textShadow: '0 6px 16px rgba(0,0,0,0.6)', backgroundColor: 'rgba(0,0,0,0.25)' }}>
          {overlay.text}
        </div>
      </AbsoluteFill>
    );
  }

  if (overlay.style === 'glitch') {
    // Letras blancas con dos sombras de color que tiemblan.
    const j = (n: number) => Math.round(Math.sin(frame * 1.7 + n) * 7 * (frame < 14 || frame % 40 < 5 ? 1 : 0.25));
    return (
      <AbsoluteFill>
        <div style={{ ...wrap, fontSize: 82 * k, color: '#fff', textTransform: 'uppercase', textShadow: `${j(0) - 6}px ${j(1)}px 0 ${color}, ${6 - j(2)}px ${j(3)}px 0 ${t.brand.secondary}, 0 8px 20px rgba(0,0,0,0.7)` }}>
          {words.map((w, i) => <span key={i} style={isKey(w) ? { fontSize: '1.2em', display: 'inline-block', margin: '0 0.08em' } : undefined}>{w}{gap(i)}</span>)}
        </div>
      </AbsoluteFill>
    );
  }

  if (overlay.style === 'apilado') {
    // Una palabra por línea, cada una del ancho del bloque; la clave en color.
    return (
      <AbsoluteFill>
        <div style={{ ...wrap, width: '70%', opacity: 1, ...outline, lineHeight: 0.98, textTransform: 'uppercase' }}>
          {words.map((w, i) => {
            const e = spring({ frame: frame - i * 3, fps, config: { damping: 13, stiffness: 200 }, durationInFrames: 10 });
            return <div key={i} style={{ fontSize: Math.min(210, Math.max(54, 900 / Math.max(3, w.length))) * k, color: isKey(w) ? color : '#fff', opacity: e, transform: `translateX(${interpolate(e, [0, 1], [i % 2 ? 90 : -90, 0])}px)` }}>{w}</div>;
          })}
        </div>
      </AbsoluteFill>
    );
  }

  // Estilos de letra suelta: cada uno define el aspecto base y cómo se ve la palabra clave.
  const base: React.CSSProperties =
    overlay.style === 'neon' ? { color, textShadow: `0 0 18px ${color}, 0 0 46px ${color}, 0 4px 10px rgba(0,0,0,0.8)` }
    : overlay.style === 'contorno' ? { color: 'transparent', WebkitTextStroke: `${Math.round(4 * k)}px #fff`, textShadow: '0 6px 18px rgba(0,0,0,0.55)' }
    : overlay.style === 'degradado' ? { backgroundImage: `linear-gradient(100deg, ${color}, ${t.brand.secondary})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.65))' }
    : overlay.style === 'sombra' ? { color: '#fff', textShadow: `${5 * k}px ${5 * k}px 0 ${color}, ${10 * k}px ${10 * k}px 0 #000` }
    // Letras con volumen: varias capas de sombra hacen el canto.
    : overlay.style === 'tresd' ? { color: '#fff', textShadow: Array.from({ length: 9 }, (_, i) => `${(i + 1) * k}px ${(i + 1) * k}px 0 ${color}`).join(', ') + `, ${14 * k}px ${16 * k}px 18px rgba(0,0,0,0.6)` }
    : overlay.style === 'fuego' ? { backgroundImage: 'linear-gradient(180deg, #FFF3B0 10%, #FACC15 40%, #F97316 70%, #DC2626 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 0 16px rgba(249,115,22,0.75)) drop-shadow(0 6px 8px rgba(0,0,0,0.7))' }
    : overlay.style === 'cromado' ? { backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, #D4D8DD 38%, #6B7280 52%, #E5E7EB 66%, #FFFFFF 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 5px 0 rgba(0,0,0,0.85)) drop-shadow(0 10px 16px rgba(0,0,0,0.5))' }
    : overlay.style === 'burbuja' ? { color, WebkitTextStroke: `${Math.round(14 * k)}px #fff`, paintOrder: 'stroke fill', filter: `drop-shadow(0 ${8 * k}px 0 rgba(0,0,0,0.85))` }
    : overlay.style === 'retro' ? { color: '#FFF7E0', textShadow: `${4 * k}px ${4 * k}px 0 ${color}, ${8 * k}px ${8 * k}px 0 ${t.brand.secondary}, ${12 * k}px ${12 * k}px 0 #000` }
    : overlay.style === 'resplandor' ? { color: '#fff', textShadow: `0 0 14px rgba(255,255,255,0.95), 0 0 44px ${color}, 0 0 90px ${color}` }
    : outline;
  return (
    <AbsoluteFill>
      <div style={{ ...wrap, fontSize: 68 * k, ...base }}>
        {words.map((w, i) => {
          if (!isKey(w)) return <span key={i}>{w}{gap(i)}</span>;
          const inline: React.CSSProperties = { display: 'inline-block', margin: '0 0.1em' };
          if (overlay.style === 'marcador') {
            // Trazo de marcador que se pinta de izquierda a derecha detrás de la palabra.
            return (
              <span key={i} style={{ ...inline, position: 'relative', padding: '0 0.16em', margin: '0 0.06em', color: onColor(color), WebkitTextStroke: '0', textShadow: 'none' }}>
                <span style={{ position: 'absolute', inset: '6% 0', backgroundColor: color, borderRadius: 10, transformOrigin: 'left center', transform: `scaleX(${Math.min(1, Math.max(0, kw))}) rotate(-1.2deg)` }} />
                <span style={{ position: 'relative' }}>{w}</span>
              </span>
            );
          }
          if (overlay.style === 'subrayado') {
            return (
              <span key={i} style={{ ...inline, position: 'relative' }}>
                {w}
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: -10, height: 12 * k, borderRadius: 6, backgroundColor: color, transformOrigin: 'left center', transform: `scaleX(${Math.min(1, Math.max(0, kw))})` }} />
              </span>
            );
          }
          if (overlay.style === 'trazo') {
            // Un óvalo dibujado a mano rodea la palabra clave.
            const len = 640;
            return (
              <span key={i} style={{ ...inline, position: 'relative', padding: '0 0.2em' }}>
                {w}
                <svg viewBox="0 0 200 80" preserveAspectRatio="none" style={{ position: 'absolute', left: '-6%', top: '-18%', width: '112%', height: '136%', overflow: 'visible' }} aria-hidden="true">
                  <path d="M12 44 C8 14 60 4 104 5 C150 6 194 16 190 42 C186 70 130 77 92 76 C48 75 10 68 16 36" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" strokeDasharray={len} strokeDashoffset={len * (1 - Math.min(1, Math.max(0, kw)))} />
                </svg>
              </span>
            );
          }
          if (overlay.style === 'neon') return <span key={i} style={{ ...inline, color: '#fff', fontSize: '1.15em' }}>{w}</span>;
          if (overlay.style === 'contorno') return <span key={i} style={{ ...inline, color, WebkitTextStroke: '0', fontSize: '1.15em' }}>{w}</span>;
          if (overlay.style === 'degradado') return <span key={i} style={{ ...inline, fontSize: '1.25em', transform: `scale(${interpolate(kw, [0, 1], [0.8, 1])})` }}>{w}</span>;
          if (overlay.style === 'tresd' || overlay.style === 'retro') return <span key={i} style={{ ...inline, color, textShadow: Array.from({ length: 9 }, (_, n) => `${(n + 1) * k}px ${(n + 1) * k}px 0 #000`).join(', '), fontSize: '1.2em' }}>{w}</span>;
          if (overlay.style === 'fuego' || overlay.style === 'cromado') return <span key={i} style={{ ...inline, fontSize: '1.3em', transform: `scale(${interpolate(kw, [0, 1], [0.8, 1])})` }}>{w}</span>;
          if (overlay.style === 'burbuja') return <span key={i} style={{ ...inline, color: t.brand.secondary, fontSize: '1.2em', transform: `rotate(-3deg) scale(${interpolate(kw, [0, 1], [0.8, 1])})` }}>{w}</span>;
          if (overlay.style === 'resplandor') return <span key={i} style={{ ...inline, color, textShadow: `0 0 12px ${color}, 0 0 40px ${color}`, fontSize: '1.2em' }}>{w}</span>;
          if (overlay.style === 'sombra') return <span key={i} style={{ ...inline, color, textShadow: `${5 * k}px ${5 * k}px 0 #000`, fontSize: '1.18em' }}>{w}</span>;
          // resaltado: la palabra clave en color y más grande.
          return <span key={i} style={{ ...inline, color, fontSize: '1.22em', transform: `scale(${interpolate(kw, [0, 1], [0.8, 1])})` }}>{w}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};
