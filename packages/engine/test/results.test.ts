import { describe, expect, it } from 'vitest';
import { engagementOf, findInsights } from '../src/results.ts';

const reel = (design: string, views: number, extra: Record<string, string> = {}) => ({ features: { design, red: 'instagram', ...extra }, metrics: { views, likes: views * 0.05 } });

describe('aprender de los resultados', () => {
  it('calcula la interacción por vista', () => {
    expect(engagementOf({ views: 1000, likes: 40, comments: 5, shares: 3, saves: 2 })).toBeCloseTo(0.05);
    expect(engagementOf({ views: 0 })).toBe(0);
  });
  it('encuentra el diseño de subtítulos que mejor funciona', () => {
    const r = findInsights([reel('impacto', 9000), reel('impacto', 12000), reel('clasico', 3000), reel('clasico', 4000), reel('clasico', 3500)]);
    const f = r.findings.find((x) => x.feature === 'design')!;
    expect(f.best).toBe('impacto');
    expect(f.bestCount).toBe(2);
    expect(f.lift).toBeGreaterThan(2);
  });
  it('no saca conclusiones sin diferencia clara o con un solo reel por lado', () => {
    expect(findInsights([reel('impacto', 5000), reel('impacto', 5200), reel('clasico', 4900), reel('clasico', 5100)]).findings).toHaveLength(0);
    expect(findInsights([reel('impacto', 50000), reel('clasico', 3000), reel('clasico', 3100), reel('clasico', 2900)]).findings.filter((f) => f.feature === 'design')).toHaveLength(0);
  });
  it('la interacción también cuenta, no solo las vistas', () => {
    const low = (d: string, v: number) => ({ features: { design: d }, metrics: { views: v, likes: 0 } });
    const high = (d: string, v: number) => ({ features: { design: d }, metrics: { views: v, likes: v * 0.2, saves: v * 0.1 } });
    const r = findInsights([high('cinta', 5000), high('cinta', 5000), low('neon', 5000), low('neon', 5000)]);
    expect(r.findings[0]?.best).toBe('cinta');
  });
});
