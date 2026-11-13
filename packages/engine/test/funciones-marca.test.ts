import { describe, expect, it } from 'vitest';
import { Project, Scene, chapters, publishText, type Transcript } from '@axioma/schema';
import { frameScore } from '../src/frames.ts';

describe('capítulos', () => {
  const sc = (id: string, start: number, end: number, role: Scene['role'], text: string) => Scene.parse({ id, ranges: [{ start, end }], role, onScreenText: text });
  const make = (scenes: Scene[]) => Project.parse({
    version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: {},
    source: { file: 'a.mp4', duration: 400, width: 1080, height: 1920, fps: 30 }, pacing: {}, captions: {}, scenes,
  });

  it('marca capítulos en videos largos, desde 0:00 y donde cambia la idea', () => {
    const p = make([sc('s1', 0, 20, 'gancho', 'El error que nadie ve'), sc('s2', 20, 60, 'problema', 'Por qué pierdes dinero'), sc('s3', 60, 110, 'beneficio', 'La solución en tres pasos'), sc('s4', 110, 130, 'cta', 'Sígueme para más')]);
    const ch = chapters(p, null as Transcript | null);
    expect(ch[0]).toBe('0:00 El error que nadie ve');
    expect(ch).toContain('0:20 Por qué pierdes dinero');
    expect(ch).toContain('1:00 La solución en tres pasos');
    expect(publishText({ title: 't', description: 'd', hashtags: ['#a'], chapters: ch })).toMatch(/Capítulos:\n0:00 El error/);
  });

  it('un reel corto no lleva capítulos', () => {
    expect(chapters(make([sc('s1', 0, 20, 'gancho', 'Hola'), sc('s2', 20, 40, 'cta', 'Chao')]), null)).toEqual([]);
  });
});

describe('mejor fotograma', () => {
  it('una imagen nítida puntúa más que una borrosa', () => {
    const w = 32, h = 32;
    const sharp = new Uint8Array(w * h).map((_, i) => ((i % w) + Math.floor(i / w)) % 2 ? 230 : 20); // tablero
    const blur = new Uint8Array(w * h).fill(125);
    expect(frameScore(sharp, w, h).sharp).toBeGreaterThan(frameScore(blur, w, h).sharp);
    expect(frameScore(blur, w, h).light).toBeCloseTo(125, 0);
  });
});
