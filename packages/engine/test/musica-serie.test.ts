import { describe, expect, it } from 'vitest';
import { Project, Scene, sceneLength } from '@axioma/schema';
import { moodOf, pickTrack, wantedMood, type MusicTrack } from '../src/musiclib.ts';
import { planParts } from '../src/series.ts';

const make = (extra: Record<string, unknown> = {}) => Project.parse({
  version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: {},
  source: { file: 'a.mp4', duration: 400, width: 1080, height: 1920, fps: 30 }, pacing: {}, captions: {},
  scenes: [Scene.parse({ id: 's1', ranges: [{ start: 0, end: 30 }] })], ...extra,
});
const track = (file: string, bpm: number | null, energy: number, duration = 120): MusicTrack => ({ file, name: file, license: 'propia', bpm, energy, duration, mood: moodOf(bpm, energy), addedAt: '' });

describe('biblioteca de música', () => {
  it('clasifica por tempo y energía', () => {
    expect(moodOf(128, 0.7)).toBe('energica');
    expect(moodOf(75, 0.6)).toBe('tranquila');
    expect(moodOf(100, 0.45)).toBe('media');
    expect(moodOf(null, 0.2)).toBe('tranquila');
  });

  it('un montaje pide música enérgica y la elige', () => {
    const p = make({ kind: 'montaje' });
    expect(wantedMood(p)).toBe('energica');
    const r = pickTrack(p, [track('calma.mp3', 72, 0.25), track('fiesta.mp3', 128, 0.75), track('media.mp3', 100, 0.45)]);
    expect(r?.track.file).toBe('fiesta.mp3');
    expect(r?.why).toMatch(/enérgica/);
  });

  it('un reel sobrio elige la tranquila', () => {
    const p = make({ pacing: { maxPause: 0.8 } });
    expect(pickTrack(p, [track('calma.mp3', 72, 0.25), track('fiesta.mp3', 128, 0.75)])?.track.file).toBe('calma.mp3');
  });

  it('sin canciones no elige nada', () => {
    expect(pickTrack(make(), [])).toBeNull();
  });
});

describe('serie en partes', () => {
  it('divide en partes parecidas sin cortar escenas', () => {
    const scenes = Array.from({ length: 12 }, (_, i) => Scene.parse({ id: `s${i}`, ranges: [{ start: i * 15, end: i * 15 + 15 }] })); // 180 s
    const parts = planParts(scenes, 60);
    expect(parts.length).toBe(3);
    expect(parts.flat().map((s) => s.id)).toEqual(scenes.map((s) => s.id));
    for (const part of parts) expect(part.reduce((a, s) => a + sceneLength(s), 0)).toBeLessThanOrEqual(75);
  });
});
