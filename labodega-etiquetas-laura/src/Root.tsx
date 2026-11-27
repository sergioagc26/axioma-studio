import React from 'react';
import { Composition } from 'remotion';
import { Promo, TOTAL } from './Promo.tsx';
export const Root: React.FC = () => <Composition id="LaBodegaEtiquetas" component={Promo} width={1080} height={1920} fps={30} durationInFrames={TOTAL} />;
