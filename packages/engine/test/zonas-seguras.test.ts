import { describe, expect, it } from 'vitest';
import { Project, auditZones, buildTimeline, getPreset, PLATFORMS, safeZone, clampY } from '@axioma/schema';

const proj = (platform?: string, y = 0.93) => Project.parse({
  version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: { width: 1080, height: 1920, fps: 30 },
  source: { file: 'a.mp4', duration: 60, width: 1080, height: 1920, fps: 30 },
  pacing: getPreset('rapido').pacing, captions: { ...getPreset('rapido').captions, y },
  platform,
  scenes: [{ id: 's1', role: 'gancho', ranges: [{ start: 0, end: 3 }], onScreenText: 'HOLA', textY: 0.05 }],
});

describe('zonas seguras por red social', () => {
  it('por defecto es Instagram Reels y mueve los subtítulos de abajo al área libre', () => {
    const t = buildTimeline(proj(), null, { video: 'v', asset: (r) => r });
    const z = PLATFORMS.instagram_reels;
    expect(t.captions.y).toBeLessThanOrEqual(1 - z.bottom);
    expect(t.overlays[0].y).toBeGreaterThanOrEqual(z.top);
  });
  it('cada red tiene su propia franja inferior', () => {
    expect(PLATFORMS.tiktok.bottom).toBeGreaterThan(PLATFORMS.instagram_stories.bottom);
    const a = buildTimeline(proj('tiktok'), null, { video: 'v', asset: (r) => r });
    const b = buildTimeline(proj('instagram_stories'), null, { video: 'v', asset: (r) => r });
    expect(a.captions.y).toBeLessThan(b.captions.y);
  });
  it('un subtítulo ya bien puesto no se mueve', () => {
    const t = buildTimeline(proj('instagram_reels', 0.5), null, { video: 'v', asset: (r) => r });
    expect(t.captions.y).toBe(0.5);
  });
  it('clampY respeta los límites y auditZones cuenta lo que se mueve', () => {
    const z = safeZone('tiktok');
    expect(clampY(z, 1, 0.07)).toBeCloseTo(1 - z.bottom - 0.07);
    expect(clampY(z, 0, 0.07)).toBeCloseTo(z.top + 0.07);
    expect(auditZones(proj('tiktok')).length).toBe(2);
  });
});
