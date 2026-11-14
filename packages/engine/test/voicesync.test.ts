import { describe, expect, it } from 'vitest';
import { smoothTags, tagOfWord, voiceSegments } from '../src/voicesync.ts';
import { foregroundMask } from '../src/front.ts';
import { frontKey } from '@axioma/schema';

describe('sincronía de tomas con la voz', () => {
  it('reconoce el plato aunque venga en plural o con puntuación', () => {
    expect(tagOfWord('burro.')).toBe('burro');
    expect(tagOfWord('Burritos')).toBe('burro');
    expect(tagOfWord('nachos:')).toBe('nachos');
    expect(tagOfWord('totopos')).toBe('nachos');
    expect(tagOfWord('Aguas')).toBe('bebida');
    expect(tagOfWord('familia,')).toBe('personas');
  });

  it('no confunde palabras que empiezan igual', () => {
    expect(tagOfWord('aguacate')).toBeNull();
    expect(tagOfWord('tortilla')).toBeNull();
    expect(tagOfWord('de')).toBeNull();
  });

  it('cada mención abre una sección hasta la siguiente, solo con lo que hay en tomas', () => {
    const words = [
      { text: 'Primero,', start: 0 }, { text: 'el', start: 0.4 }, { text: 'burro.', start: 0.6 },
      { text: 'Otro', start: 2 }, { text: 'burro', start: 2.4 },
      { text: 'Ahora', start: 4 }, { text: 'los', start: 4.3 }, { text: 'nachos', start: 4.5 },
      { text: 'y', start: 6 }, { text: 'tacos', start: 6.2 },
    ];
    const segs = voiceSegments(words, new Set(['burro', 'nachos']));
    expect(segs.map((s) => [s.tag, s.start])).toEqual([['burro', 0.6], ['nachos', 4.5]]);
  });

  it('corrige las tomas de preparación por sus vecinas, sin efecto dominó ni tocar bebidas', () => {
    const shot = (id: string, tag: string) => ({ id, start: 0, end: 1, tag, tagAuto: true });
    const shots = [
      shot('t1', 'torta'), shot('t2', 'torta'), shot('t3', 'cocina'), shot('t4', 'torta'), shot('t5', 'torta'),
      shot('t6', 'nachos'), shot('t7', 'nachos'), shot('t8', 'bebida'), shot('t9', 'nachos'), shot('t10', 'nachos'),
    ];
    smoothTags(shots);
    expect(shots.map((s) => s.tag)).toEqual(['torta', 'torta', 'torta', 'torta', 'torta', 'nachos', 'nachos', 'bebida', 'nachos', 'nachos']);
  });

  it('respeta las etiquetas puestas por una persona', () => {
    const shots = [
      { id: 't1', start: 0, end: 1, tag: 'torta', tagAuto: true }, { id: 't2', start: 0, end: 1, tag: 'torta', tagAuto: true },
      { id: 't3', start: 0, end: 1, tag: 'cocina' },
      { id: 't4', start: 0, end: 1, tag: 'torta', tagAuto: true }, { id: 't5', start: 0, end: 1, tag: 'torta', tagAuto: true },
    ];
    smoothTags(shots);
    expect(shots[2].tag).toBe('cocina');
  });
});

describe('texto detrás de la comida', () => {
  it('marca lo que sobresale de su entorno y no una superficie lisa', () => {
    const w = 60, h = 60;
    const depth = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // Mesa que se acerca hacia abajo (gradiente) y un plato que sobresale en el centro.
      const plate = (x - 30) ** 2 + (y - 30) ** 2 < 36 ? 60 : 0;
      depth[y * w + x] = Math.min(255, 80 + y * 2 + plate);
    }
    const m = foregroundMask(depth, w, h);
    expect(m[30 * w + 30]).toBeGreaterThan(0.8);
    expect(m[5 * w + 5]).toBeLessThan(0.1);
    expect(m[55 * w + 5]).toBeLessThan(0.1);
  });

  it('la clave de los cortes cambia si cambia una toma', () => {
    const a = [{ fromFrame: 0, durationInFrames: 30, sourceStartFrame: 100 }, { fromFrame: 30, durationInFrames: 20, sourceStartFrame: 400 }];
    const b = [{ fromFrame: 0, durationInFrames: 30, sourceStartFrame: 100 }, { fromFrame: 30, durationInFrames: 20, sourceStartFrame: 401 }];
    expect(frontKey(a)).toBe(frontKey(a.map((c) => ({ ...c }))));
    expect(frontKey(a)).not.toBe(frontKey(b));
  });
});
