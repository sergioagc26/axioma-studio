import { describe, expect, it } from 'vitest';
import { splitBySpeaker } from '@axioma/schema';
import { buildTracks, speakerTurns } from '../src/speakers.ts';

const box = (cx: number) => ({ x: cx - 0.08, y: 0.3, w: 0.16, h: 0.28, score: 0.9 });

describe('reencuadre al hablante', () => {
  it('agrupa las caras en personas por su lugar', () => {
    const frames = Array.from({ length: 20 }, (_, i) => (i % 5 === 0 ? [box(0.25)] : [box(0.25 + (i % 2) * 0.01), box(0.75)]));
    const { tracks, boxes } = buildTracks(frames);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].x).toBeCloseTo(0.25, 1);
    expect(tracks[1].x).toBeCloseTo(0.75, 1);
    expect(boxes[1].filter(Boolean)).toHaveLength(16);
  });

  it('ignora a la gente de paso', () => {
    const frames = Array.from({ length: 20 }, (_, i) => (i === 3 ? [box(0.3), box(0.9)] : [box(0.3)]));
    expect(buildTracks(frames).tracks).toHaveLength(1);
  });

  it('cambia de persona cuando la otra empieza a hablar, sin marear', () => {
    const fps = 6;
    const n = fps * 12;
    // 0–6 s habla la 0; 6–12 s la 1. Un "tic" de 0,3 s de la 1 a los 2 s no debe cambiar nada.
    const a0 = Array.from({ length: n }, (_, i) => (i < 6 * fps ? 3 : 0.2));
    const a1 = Array.from({ length: n }, (_, i) => (i >= 6 * fps || (i >= 12 && i < 14) ? 3 : 0.2));
    const tracks = [{ id: 0, x: 0.25, y: 0.4, w: 0.2, h: 0.3, share: 1 }, { id: 1, x: 0.75, y: 0.4, w: 0.2, h: 0.3, share: 1 }];
    const turns = speakerTurns([a0, a1], fps, () => true, tracks, 12);
    expect(turns.map((t) => t.track)).toEqual([0, 1]);
    expect(Math.abs(turns[1].start - 6)).toBeLessThanOrEqual(0.5);
    expect(turns[0].start).toBe(0);
    expect(turns[1].end).toBe(12);
  });

  it('con una sola persona no hay turnos', () => {
    expect(speakerTurns([[1, 2, 3]], 6, () => true, [{ id: 0, x: 0.5, y: 0.4, w: 0.2, h: 0.3, share: 1 }], 1)).toEqual([]);
  });

  it('parte un tramo donde cambia quien habla y une pedazos muy cortos', () => {
    const turns = [{ start: 0, end: 5, track: 0, x: 0.2, y: 0.4 }, { start: 5, end: 5.3, track: 1, x: 0.8, y: 0.4 }, { start: 5.3, end: 9, track: 0, x: 0.2, y: 0.4 }, { start: 9, end: 20, track: 1, x: 0.8, y: 0.4 }];
    const parts = splitBySpeaker({ start: 3, end: 12 }, turns);
    expect(parts.map((p) => [p.start, p.end, p.turn?.track])).toEqual([[3, 9, 0], [9, 12, 1]]);
  });
});
