import React from 'react';
import { Composition } from 'remotion';
import type { Timeline } from '@snz/schema';
import { CaptionStyle } from '@snz/schema';
import { Reel } from './Reel.tsx';

const empty: Timeline = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 90,
  videoSrc: '',
  musicVolume: 0.18,
  sourceWidth: 1080,
  sourceHeight: 1920,
  clips: [],
  words: [
    { text: 'Esto', startFrame: 0, endFrame: 15 },
    { text: 'te', startFrame: 15, endFrame: 25 },
    { text: 'ahorra', startFrame: 25, endFrame: 45 },
    { text: 'horas', startFrame: 45, endFrame: 80 },
  ],
  overlays: [],
  captions: CaptionStyle.parse({}),
};

export const Root: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    defaultProps={empty}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={90}
    calculateMetadata={({ props }) => ({
      width: props.width,
      height: props.height,
      fps: props.fps,
      durationInFrames: props.durationInFrames,
    })}
  />
);
