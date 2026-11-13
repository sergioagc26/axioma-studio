import { describe, expect, it } from 'vitest';
import { analyzeBeats, assignShots, beatCuts } from '../src/beats.ts';

/** Pista de prueba: golpes a `bpm`, el primero en `offset`, acento cada 4, más fuerte desde `loudFrom`. */
function track(bpm: number, seconds: number, offset: number, loudFrom: number, rate = 8000) {
  const out = new Float32Array(seconds * rate);
  let seed = 1;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let k = 0, t = offset; t < seconds; k++, t = offset + (k * 60) / bpm) {
    const amp = (k % 4 === 0 ? 1 : 0.45) * (t >= loudFrom ? 1 : 0.35);
    const a = Math.round(t * rate);
    for (let j = 0; j < rate * 0.12 && a + j < out.length; j++) out[a + j] += amp * noise() * Math.exp(-j / (rate * 0.02));
  }
  for (let i = 0; i < out.length; i++) out[i] += 0.01 * noise();
  return out;
}

describe('montaje al ritmo', () => {
  const map = analyzeBeats(track(120, 24, 0.23, 12))!;

  it('encuentra el tempo y dónde caen los golpes', () => {
    expect(map.bpm).toBeGreaterThanOrEqual(119);
    expect(map.bpm).toBeLessThanOrEqual(121);
    expect(Math.abs(map.beats[0] - 0.23)).toBeLessThan(0.03);
    for (const [i, b] of map.beats.slice(0, 40).entries()) expect(Math.abs(b - (0.23 + i * 0.5))).toBeLessThan(0.03);
  });

  it('reconoce el primer golpe del compás', () => {
    expect(map.downbeat).toBe(0);
  });

  it('en automático corta más seguido donde la música es más fuerte', () => {
    const cuts = beatCuts(map, 24, 'auto');
    const soft = cuts.filter((c) => c < 11.5).length;
    const loud = cuts.filter((c) => c > 12.5).length;
    expect(loud).toBeGreaterThan(soft);
    // Todos los cortes caen en un golpe.
    for (const c of cuts) expect(map.beats.some((b) => Math.abs(b - c) < 0.005)).toBe(true);
  });

  it('por compás corta cada 4 golpes, en el primero', () => {
    const cuts = beatCuts(map, 12, 'compas');
    expect(cuts.length).toBeGreaterThan(3);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i] - cuts[i - 1]).toBeCloseTo(2, 1);
  });

  it('no hay música con pulso en el silencio', () => {
    expect(analyzeBeats(new Float32Array(8000 * 6))).toBeNull();
  });

  it('reparte los planos sin cambiar su duración ni repetir imagen', () => {
    const shots = [{ id: 't1', start: 0, end: 3 }, { id: 't2', start: 3, end: 3.6 }, { id: 't3', start: 3.6, end: 10 }] as any;
    const lengths = [1, 1, 0.5, 1, 2, 1];
    const out = assignShots(shots, lengths);
    expect(out.map((o) => o.length)).toEqual(lengths);
    for (const o of out) { expect(o.start).toBeGreaterThanOrEqual(o.shot.start); expect(o.start + o.length).toBeLessThanOrEqual(o.shot.end + 1e-9); }
    const sorted = [...out].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].start + sorted[i - 1].length - 1e-9);
  });
});
