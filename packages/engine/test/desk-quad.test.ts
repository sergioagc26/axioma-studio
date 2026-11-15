import { describe, expect, it } from 'vitest';
import { quadMatrix } from '../../remotion/src/Desk.tsx';

/** Aplica la matrix3d (columna mayor, como CSS) a un punto 2D. */
function apply(m: number[], x: number, y: number) {
  const X = m[0] * x + m[4] * y + m[12], Y = m[1] * x + m[5] * y + m[13], W = m[3] * x + m[7] * y + m[15];
  return [X / W, Y / W];
}

describe('toma de escritorio con foto: la grabación calza en la pantalla', () => {
  it('lleva las 4 esquinas del video a las 4 esquinas de la pantalla', () => {
    const quad = [120, 300, 980, 260, 1010, 820, 90, 790];
    const m = quadMatrix(1600, 900, quad).replace(/^matrix3d\(|\)$/g, '').split(',').map(Number);
    const got = [apply(m, 0, 0), apply(m, 1600, 0), apply(m, 1600, 900), apply(m, 0, 900)].flat();
    got.forEach((v, i) => expect(v).toBeCloseTo(quad[i], 3));
  });
});
