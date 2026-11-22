import { describe, expect, it } from 'vitest';
import { Project, buildTimeline, getPreset } from '@axioma/schema';

const base = (sinAudio: boolean) => Project.parse({
  version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: { width: 1080, height: 1920, fps: 30 },
  source: { file: 'a.mp4', duration: 60, width: 1080, height: 1920, fps: 30 },
  pacing: getPreset('rapido').pacing, captions: getPreset('rapido').captions,
  scenes: [
    { id: 's1', role: 'gancho', ranges: [{ start: 0, end: 2.6 }] },
    { id: 's2', role: 'beneficio', ranges: [{ start: 2.6, end: 6 }], sinAudio },
  ],
});

describe('sonido original por escena', () => {
  it('por defecto todas las escenas conservan su sonido', () => {
    const t = buildTimeline(base(false), null, { video: 'v', asset: (r) => r });
    expect(t.clips.every((c) => !c.sinAudio)).toBe(true);
  });
  it('una escena marcada sin_audio llega silenciada al render y las demás no', () => {
    const t = buildTimeline(base(true), null, { video: 'v', asset: (r) => r });
    expect(t.clips[0].sinAudio).toBeUndefined();
    expect(t.clips[1].sinAudio).toBe(true);
  });
});
