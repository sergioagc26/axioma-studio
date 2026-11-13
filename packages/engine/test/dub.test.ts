import { describe, expect, it } from 'vitest';
import { Project, Scene, type Transcript } from '@axioma/schema';
import { MAX_TEMPO, outputSentences, placeLines, spreadWords } from '../src/dub.ts';

describe('doblaje', () => {
  it('cada frase entra en su espacio acelerando poco', () => {
    const p = placeLines([{ start: 0, nextStart: 3, duration: 3.3 }, { start: 3, nextStart: 6, duration: 2 }], 6);
    expect(p[0].at).toBe(0);
    expect(p[0].tempo).toBeGreaterThan(1);
    expect(p[0].tempo).toBeLessThanOrEqual(MAX_TEMPO);
    expect(p[1]).toEqual({ at: 3, tempo: 1 });
  });

  it('si una frase no cabe, la siguiente espera', () => {
    const p = placeLines([{ start: 0, nextStart: 1, duration: 4 }, { start: 1, nextStart: 10, duration: 1 }], 10);
    expect(p[0].tempo).toBe(MAX_TEMPO);
    expect(p[1].at).toBeGreaterThan(2.9);
  });

  it('reparte las palabras en la duración de la frase', () => {
    const w = spreadWords('Hello my friends', 2, 1.5);
    expect(w).toHaveLength(3);
    expect(w[0].start).toBe(2);
    expect(w[2].end).toBeLessThanOrEqual(3.5);
  });

  it('las frases salen en tiempo del reel ya cortado', () => {
    const words = (text: string, start: number) => text.split(' ').map((x, i) => ({ text: x, start: start + i * 0.3, end: start + i * 0.3 + 0.25 }));
    const t = { language: 'es', words: [...words('Esto se corta.', 0), ...words('Esto queda en el reel.', 5)] } as Transcript;
    const project = Project.parse({
      version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '',
      format: {}, source: { file: 'a.mp4', duration: 10, width: 1080, height: 1920, fps: 30 },
      pacing: {}, captions: {},
      scenes: [Scene.parse({ id: 's01', ranges: [{ start: 5, end: 7 }] })],
    });
    const lines = outputSentences(project, t);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('Esto queda en el reel.');
    expect(lines[0].start).toBeLessThan(0.1);
  });
});
