import { describe, expect, it } from 'vitest';
import { Pacing } from '@axioma/schema';
import { autoCut, isRetake, snapWordsToSpeech, splitPhrases, subtractSilences, wordsToRanges } from '../src/cuts.ts';

const W = (text: string, start: number, end: number) => ({ text, start, end });
const pacing = Pacing.parse({ maxPause: 0.3, pad: 0.05, punchZoomEvery: 0 });

describe('wordsToRanges', () => {
  it('une palabras con pausas cortas y corta las largas', () => {
    const r = wordsToRanges([W('hola', 1, 1.4), W('a', 1.5, 1.7), W('todos', 3, 3.5)], pacing, 10);
    expect(r).toHaveLength(2);
    expect(r[0].start).toBeCloseTo(0.95);
    expect(r[0].end).toBeCloseTo(1.75);
    expect(r[1].start).toBeCloseTo(2.95);
  });
  it('no se sale de la duración', () => {
    const r = wordsToRanges([W('fin', 9.9, 10)], pacing, 10);
    expect(r[0].end).toBe(10);
  });
});

describe('retomas', () => {
  it('detecta cuando se vuelve a empezar la frase', () => {
    const a = [W('hoy', 0, 0.2), W('te', 0.2, 0.3), W('voy', 0.3, 0.5), W('a', 0.5, 0.6)];
    const b = [W('Hoy', 2, 2.2), W('te', 2.2, 2.3), W('voy', 2.3, 2.5), W('a', 2.5, 2.6), W('contar', 2.6, 3), W('algo.', 3, 3.3)];
    expect(isRetake(a, b)).toBe(true);
    expect(isRetake(b, [W('otra', 5, 5.3), W('cosa', 5.3, 5.6)])).toBe(false);
  });
  it('autoCut se queda con la última toma y quita muletillas', () => {
    const words = [
      W('hoy', 0, 0.2), W('te', 0.2, 0.3), W('voy', 0.3, 0.5),
      W('eh', 1.6, 1.8),
      W('hoy', 2.6, 2.8), W('te', 2.8, 2.9), W('voy', 2.9, 3.1), W('a', 3.1, 3.2), W('contar', 3.2, 3.6), W('algo.', 3.6, 4),
    ];
    const { scenes, report } = autoCut(words, pacing, 5);
    expect(report.removedFillers).toBe(1);
    expect(report.removedRetakeWords).toBe(3);
    expect(scenes[0].ranges[0].start).toBeCloseTo(2.55);
    expect(scenes[0].role).toBe('gancho');
  });
});

describe('muletillas inventadas por Whisper', () => {
  it('quita frases cortas con confianza muy baja', () => {
    const words = [
      { text: '¿Qué?', start: 3.5, end: 3.7, prob: 0.19 },
      { text: 'Hola', start: 4.8, end: 5, prob: 0.95 }, { text: 'a', start: 5, end: 5.1, prob: 0.9 },
      { text: 'todos.', start: 5.1, end: 5.5, prob: 0.97 },
    ];
    const { scenes, report } = autoCut(words, pacing, 6);
    expect(report.removedFillers).toBe(1);
    expect(scenes[0].ranges[0].start).toBeCloseTo(4.75);
  });
});

describe('silencios', () => {
  it('ajusta palabras estiradas sobre un silencio', () => {
    const [w] = snapWordsToSpeech([W('mano.', 13.6, 14.0)], [{ start: 13.9, end: 15.3 }]);
    expect(w.end).toBeCloseTo(13.9);
  });
  it('quita silencios largos dentro de un tramo y deja los cortos', () => {
    const r = subtractSilences([{ start: 0, end: 10 }], [{ start: 2, end: 2.2 }, { start: 5, end: 6.5 }], pacing);
    expect(r).toHaveLength(2);
    expect(r[0].end).toBeCloseTo(5.05);
    expect(r[1].start).toBeCloseTo(6.45);
  });
});

describe('splitPhrases', () => {
  it('corta en puntuación y en pausas largas', () => {
    const p = splitPhrases([W('uno.', 0, 0.3), W('dos', 0.4, 0.6), W('tres', 2, 2.3)]);
    expect(p.map((x) => x.length)).toEqual([1, 1, 1]);
  });
});
