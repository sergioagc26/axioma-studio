// Contrato de tiempos: lo leen las escenas (Remotion) y el audio (scripts/audio.mjs).
// Los scripts lo importan con tsx: mantenlo sin imports de React ni de Remotion.
export const COMP_ID = 'Promo';
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
export const BPM = 120;
export const BEAT = (FPS * 60) / BPM; // 15 cuadros
export const BAR = BEAT * 4; // 60 cuadros = 2 s
export const TOTAL = BAR * 5; // 10 s

export const SCENES = {
  gancho: {from: 0, dur: BAR},
  estrella: {from: BAR, dur: BAR * 2},
  lista: {from: BAR * 3, dur: BAR},
  cierre: {from: BAR * 4, dur: BAR},
};

export type CueKind = 'whoosh' | 'pop' | 'ding' | 'impact';
export const CUES: {f: number; k: CueKind}[] = [
  {f: 0, k: 'impact'},
  {f: SCENES.estrella.from, k: 'whoosh'},
  {f: SCENES.estrella.from + BEAT * 2, k: 'ding'}, // precio
  {f: SCENES.lista.from, k: 'whoosh'},
  {f: SCENES.lista.from + BEAT, k: 'pop'},
  {f: SCENES.lista.from + BEAT * 2, k: 'pop'},
  {f: SCENES.cierre.from, k: 'impact'},
];
