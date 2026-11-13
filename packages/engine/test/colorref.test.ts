import { describe, expect, it } from 'vitest';
import { colorTransfer, labStats, labToRgb, rgbToLab } from '../src/colorref.ts';

/** Imagen de prueba: degradado alrededor de un color base. */
const image = (base: [number, number, number], spread = 40) => {
  const px = new Uint8Array(64 * 64 * 3);
  for (let i = 0; i < 64 * 64; i++) for (let k = 0; k < 3; k++) px[i * 3 + k] = Math.max(0, Math.min(255, base[k] + ((i * (k + 3)) % spread) - spread / 2));
  return px;
};

describe('igualar color a una referencia', () => {
  it('Lab ida y vuelta conserva el color', () => {
    for (const c of [[0.2, 0.5, 0.8], [0.9, 0.4, 0.1], [0.5, 0.5, 0.5]] as [number, number, number][]) {
      const back = labToRgb(rgbToLab(c));
      back.forEach((v, k) => expect(v).toBeCloseTo(c[k], 3));
    }
  });

  it('lleva el color medio del video hacia el de la referencia', () => {
    const src = labStats(image([110, 120, 140])); // frío
    const ref = labStats(image([170, 120, 80])); // cálido
    const fn = colorTransfer(src, ref);
    const out = fn([110 / 255, 120 / 255, 140 / 255]);
    expect(out[0]).toBeGreaterThan(110 / 255 + 0.05); // más rojo
    expect(out[2]).toBeLessThan(140 / 255 - 0.05); // menos azul
  });

  it('con la misma imagen no cambia nada', () => {
    const s = labStats(image([120, 100, 90]));
    const out = colorTransfer(s, s)([0.4, 0.5, 0.6]);
    expect(out[0]).toBeCloseTo(0.4, 3);
    expect(out[2]).toBeCloseTo(0.6, 3);
  });

  it('una referencia extrema no rompe la imagen (cambio con límite)', () => {
    const src = labStats(image([120, 120, 120]));
    const ref = labStats(image([255, 0, 255], 10));
    const out = colorTransfer(src, ref)([0.5, 0.5, 0.5]);
    expect(Math.abs(out[1] - 0.5)).toBeLessThan(0.45);
  });
});
