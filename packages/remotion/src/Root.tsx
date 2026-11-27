import React from 'react';
import { Composition } from 'remotion';
import type { Timeline } from '@axioma/schema';
import { CaptionStyle, safeZone } from '@axioma/schema';
import { Reel } from './Reel.tsx';
import { Slide, type SlideProps } from './Slide.tsx';
import { TutorialLaura, TUTORIAL_FPS, TUTORIAL_FRAMES } from './TutorialLaura.tsx';
import { AxiClip, AxiEstados, AxiIntro, type AxiClipProps } from './AxiScenes.tsx';

const empty: Timeline = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 90,
  videoSrc: '',
  musicVolume: 0.18,
  sourceWidth: 1080,
  sourceHeight: 1920,
  originalVolume: 1,
  sfx: [],
  finish: { progressBar: false, grain: false, vignette: false, keywordZoom: false, halation: false, letterbox: false }, emphasis: [],
  brand: { primary: '#FE2C55', secondary: '#25F4EE', text: '#FFFFFF' },
  clips: [],
  words: [
    { text: 'Esto', startFrame: 0, endFrame: 15 },
    { text: 'te', startFrame: 15, endFrame: 25 },
    { text: 'ahorra', startFrame: 25, endFrame: 45 },
    { text: 'horas', startFrame: 45, endFrame: 80 },
  ],
  overlays: [],
  captions: CaptionStyle.parse({}),
  safe: safeZone('instagram_reels'),
};

const slide: SlideProps = { width: 1080, height: 1350, kind: 'portada', title: 'Tres errores que casi me quiebran', body: 'Lo que aprendí al empezar de cero', brand: { primary: '#FE2C55', secondary: '#25F4EE', name: 'Mi marca' }, font: 'Anton', carousel: true, index: 0, total: 5 };

export const Root: React.FC = () => (
  <>
  <Composition
    id="Imagen"
    component={Slide}
    defaultProps={slide}
    width={1080}
    height={1350}
    fps={30}
    durationInFrames={1}
    calculateMetadata={({ props }) => ({ width: props.width, height: props.height })}
  />
  <Composition
    id="Reel"
    component={Reel}
    defaultProps={empty}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={90}
    calculateMetadata={({ props }) => ({
      width: props.canvas?.width ?? props.width,
      height: props.canvas?.height ?? props.height,
      fps: props.fps,
      durationInFrames: props.durationInFrames,
    })}
  />
  {/* Axi, el personaje de la marca: un estado suelto, la entrada de la app y la hoja de estados. */}
  <Composition id="Axi" component={AxiClip} defaultProps={{ state: 'despierto', background: 'transparente' } as AxiClipProps} width={512} height={512} fps={30} durationInFrames={120} />
  <Composition id="AxiIntro" component={AxiIntro} width={1920} height={1080} fps={30} durationInFrames={75} />
  <Composition id="AxiEstados" component={AxiEstados} width={1920} height={1080} fps={30} durationInFrames={240} />
  {/* Tutorial para Laura (La Bodega): las tomas del panel son grabaciones reales en public/laura/. */}
  <Composition id="TutorialLaura" component={TutorialLaura} defaultProps={{ vertical: true }} width={1080} height={1920} fps={TUTORIAL_FPS} durationInFrames={TUTORIAL_FRAMES} />
  <Composition id="TutorialLauraHorizontal" component={TutorialLaura} defaultProps={{ vertical: false }} width={1920} height={1080} fps={TUTORIAL_FPS} durationInFrames={TUTORIAL_FRAMES} />
</>
);
