import { describe, expect, it } from 'vitest';
import { Project, Scene, buildTimeline, outputDuration } from '@axioma/schema';
import { slowFilter } from '../src/slowmo.ts';

const make = (speed: number, slowFiles?: Scene['slowFiles']) => Project.parse({
  version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '',
  format: { fps: 30 }, source: { file: 'a.mp4', duration: 20, width: 1080, height: 1920, fps: 30 },
  pacing: {}, captions: {},
  scenes: [Scene.parse({ id: 's01', ranges: [{ start: 0, end: 2 }] }), Scene.parse({ id: 's02', ranges: [{ start: 5, end: 6 }], speed, slowFiles })],
});

describe('cámara lenta suave', () => {
  it('una escena a la mitad dura el doble en la salida', () => {
    const p = make(0.5);
    expect(outputDuration(p)).toBeCloseTo(4);
    const tl = buildTimeline(p, null, { video: 'v.mp4', asset: (r) => `/m/${r}` });
    expect(tl.durationInFrames).toBe(120);
    const slow = tl.clips.find((c) => c.sceneId === 's02')!;
    expect(slow.durationInFrames).toBe(60);
    expect(slow.speed).toBe(0.5);
    expect(slow.slowSrc).toBeUndefined(); // sin archivo aún: se reproduce más lento
  });

  it('usa el video interpolado cuando existe para ese tramo', () => {
    const tl = buildTimeline(make(0.5, [{ start: 5, end: 6, speed: 0.5, file: 'media/lento/x.mp4' }]), null, { video: 'v.mp4', asset: (r) => `/m/${r}` });
    expect(tl.clips.find((c) => c.sceneId === 's02')!.slowSrc).toBe('/m/media/lento/x.mp4');
  });

  it('ignora un archivo hecho para otra velocidad', () => {
    const tl = buildTimeline(make(0.25, [{ start: 5, end: 6, speed: 0.5, file: 'media/lento/x.mp4' }]), null, { video: 'v.mp4', asset: (r) => `/m/${r}` });
    const c = tl.clips.find((x) => x.sceneId === 's02')!;
    expect(c.slowSrc).toBeUndefined();
    expect(c.durationInFrames).toBe(120);
  });

  it('el filtro crea fotogramas intermedios y estira el tiempo', () => {
    const f = slowFilter(30, 0.5, 2160);
    expect(f).toMatch(/minterpolate=fps=60/);
    expect(f).toMatch(/setpts=PTS\/0.5/);
    expect(f).toMatch(/^scale=1080/);
  });
});
