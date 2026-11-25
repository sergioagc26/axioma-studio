import {Composition} from 'remotion';
import {Promo} from './Promo';
import {COMP_ID, FPS, HEIGHT, TOTAL, WIDTH} from './timeline';

export const RemotionRoot = () => (
  <Composition id={COMP_ID} component={Promo} durationInFrames={TOTAL} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{audio: true}} />
);
