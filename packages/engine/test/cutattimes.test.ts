import { describe, expect, it } from 'vitest';
import { Scene, sceneLength } from '@axioma/schema';
import { VOICE_LEAD, cutAtTimes } from '../src/voicesync.ts';

const scenes = (lens: number[]) => { let s = 0; return lens.map((l, i) => { const sc = Scene.parse({ id: `s${i}`, ranges: [{ start: s, end: s + l }] }); s += l; return sc; }); };
const bounds = (sc: Scene[]) => { let t = 0; return sc.map((x) => { const b = t; t += sceneLength(x); return +b.toFixed(3); }); };
const total = (sc: Scene[]) => +sc.reduce((a, x) => a + sceneLength(x), 0).toFixed(3);

describe('cortes donde empieza cada frase', () => {
  it('parte una escena larga justo antes de la frase', () => {
    const p = { scenes: scenes([2, 2, 2]) };
    cutAtTimes(p, [3.25]);
    expect(bounds(p.scenes)).toContain(+(3.25 - VOICE_LEAD).toFixed(3));
    expect(total(p.scenes)).toBe(6);
  });
  it('si el corte siguiente está muy cerca, lo adelanta en vez de partir', () => {
    const p = { scenes: scenes([2, 2]) };
    cutAtTimes(p, [2.05]); // objetivo 1.8: el corte de 2.0 se corre a 1.8
    expect(p.scenes).toHaveLength(2);
    expect(bounds(p.scenes)[1]).toBeCloseTo(1.8, 3);
    expect(total(p.scenes)).toBe(4);
  });
  it('si la escena recién empezó, corre el corte hasta la frase', () => {
    const p = { scenes: scenes([2, 2]) };
    cutAtTimes(p, [2.5]); // objetivo 2.25
    expect(p.scenes).toHaveLength(2);
    expect(bounds(p.scenes)[1]).toBeCloseTo(2.25, 3);
  });
  it('si ya hay un corte ahí, no toca nada', () => {
    const p = { scenes: scenes([2, 2]) };
    expect(cutAtTimes(p, [2.3])).toBe(0);
  });
});
