import { describe, expect, it } from 'vitest';
import { FORMATS, Project, Scene, buildTimeline, reelScore } from '@axioma/schema';

const make = (scenes: Scene[], extra: Record<string, unknown> = {}) => Project.parse({
  version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: { fps: 30 },
  source: { file: 'a.mp4', duration: 100, width: 1080, height: 1920, fps: 30 }, pacing: {}, captions: {}, scenes, ...extra,
});

describe('horizontal 16:9', () => {
  it('el reel vertical va entero y centrado en un lienzo 1920×1080', () => {
    const tl = buildTimeline(make([Scene.parse({ id: 's1', ranges: [{ start: 0, end: 2 }] })]), null, { video: 'v.mp4', format: FORMATS['16:9'] });
    expect(tl.canvas).toEqual({ width: 1920, height: 1080 });
    expect([tl.width, tl.height]).toEqual([1080, 1920]);
  });
  it('los formatos verticales no usan lienzo', () => {
    expect(buildTimeline(make([Scene.parse({ id: 's1', ranges: [{ start: 0, end: 2 }] })]), null, { video: 'v.mp4', format: FORMATS['4:5'] }).canvas).toBeUndefined();
  });
});

describe('pantalla dividida', () => {
  it('la distribución llega al render solo si la escena tiene b-roll', () => {
    const p = make([
      Scene.parse({ id: 's1', ranges: [{ start: 0, end: 2 }], visual: 'broll', brollFile: 'media/broll/x.mp4', brollLayout: 'arriba' }),
      Scene.parse({ id: 's2', ranges: [{ start: 2, end: 4 }], brollLayout: 'recuadro' }),
    ]);
    const tl = buildTimeline(p, null, { video: 'v.mp4', asset: (r) => `/m/${r}` });
    expect(tl.clips[0].brollLayout).toBe('arriba');
    expect(tl.clips[1].brollLayout).toBeUndefined();
  });
});

describe('puntaje del reel', () => {
  it('un reel plano saca poco y dice qué mejorar', () => {
    const r = reelScore(make([Scene.parse({ id: 's1', ranges: [{ start: 0, end: 80 }] })]), null);
    expect(r.score).toBeLessThan(50);
    expect(r.parts.find((x) => x.id === 'gancho')?.tip).toMatch(/gancho/);
    expect(r.parts.find((x) => x.id === 'duracion')?.tip).toMatch(/15 y 45/);
  });

  it('un reel bien armado saca más', () => {
    const sc = (id: string, a: number, b: number, extra: Record<string, unknown> = {}) => Scene.parse({ id, ranges: [{ start: a, end: b }], ...extra });
    const r = reelScore(make([
      sc('s1', 0, 3, { onScreenText: 'El error que nadie ve', role: 'gancho', punchZoom: true }),
      sc('s2', 3, 6, { camera: 'acercar' }), sc('s3', 6, 9, { onScreenText: 'Paso 1' }), sc('s4', 9, 12, { visual: 'texto', onScreenText: 'Dato' }),
      sc('s5', 12, 15), sc('s6', 15, 18, { punchZoom: true }), sc('s7', 18, 21, { onScreenText: 'Paso 2' }),
      sc('s8', 21, 24, { role: 'cta', onScreenText: 'Sígueme para más' }),
    ], { audio: { music: 'media/musica/a.mp3', enhance: true } }), null);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.grade).toBe('excelente');
  });
});
