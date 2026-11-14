import { describe, expect, it } from 'vitest';
import { QUALITY_STEP, cleanShare, cleanStart, judge } from '../src/shotquality.ts';

describe('partes limpias de una toma', () => {
  it('marca el barrido y el desenfoque, no lo normal', () => {
    const sharp = [100, 100, 20, 100, 100, 100];
    const motion = [3, 40, 4, 3, 2, 3];
    expect(judge(sharp, motion)).toEqual([true, false, false, true, true, true]);
  });
  it('arranca después del barrido del inicio', () => {
    const q = { start: 10, end: 12, ok: [true, false, false, false, true, true, true, true] };
    expect(cleanStart(q, 10, 0.75, 12)).toBeCloseTo(10 + 4 * QUALITY_STEP, 5);
    expect(cleanShare(q, 11, 12)).toBe(1);
  });
  it('si no hay tramo limpio, deja el punto de partida', () => {
    const q = { start: 0, end: 1, ok: [false, false, false, false] };
    expect(cleanStart(q, 0, 0.5, 1)).toBe(0);
  });
});
