import { describe, expect, it } from 'vitest';
import { endOnProduct } from '../src/brief.ts';
import { withoutTags } from '../src/montage.ts';

const shots = [
  { id: 't01', start: 0, end: 4, tag: 'cocina' },
  { id: 't02', start: 4, end: 9, tag: 'hamburguesa' },
  { id: 't03', start: 9, end: 12, tag: 'personas' },
  { id: 't04', start: 12, end: 18, tag: 'hamburguesa' },
  { id: 't05', start: 18, end: 22, tag: 'cocina' },
];
const scene = (start: number, end: number) => ({ ranges: [{ start, end }] });

describe('cierre con el producto', () => {
  it('cambia la última toma por el final de la última toma de comida', () => {
    const scenes = [scene(0, 2), scene(5, 7), scene(19, 21)];
    expect(endOnProduct(scenes, shots)).toEqual({ tag: 'hamburguesa', changed: true });
    expect(scenes[2].ranges[0]).toEqual({ start: 16, end: 18 });
  });
  it('no repite la toma de la escena anterior si hay otra', () => {
    const scenes = [scene(0, 2), scene(13, 15), scene(19, 21)];
    endOnProduct(scenes, shots);
    expect(scenes[2].ranges[0]).toEqual({ start: 7, end: 9 });
  });
  it('si ya termina con el producto no toca nada', () => {
    const scenes = [scene(0, 2), scene(14, 16)];
    expect(endOnProduct(scenes, shots)).toEqual({ tag: 'hamburguesa', changed: false });
    expect(scenes[1].ranges[0]).toEqual({ start: 14, end: 16 });
  });
  it('sin tomas de comida devuelve null', () => {
    expect(endOnProduct([scene(0, 2), scene(2, 3)], [{ start: 0, end: 4, tag: 'cocina' }])).toBeNull();
  });
});

describe('tomas prohibidas', () => {
  it('quita las etiquetadas; si son todas, las deja', () => {
    expect(withoutTags(shots, ['personas']).map((s) => s.id)).toEqual(['t01', 't02', 't04', 't05']);
    expect(withoutTags([{ tag: 'personas' }], ['personas'])).toHaveLength(1);
    expect(withoutTags(shots)).toBe(shots);
  });
});
