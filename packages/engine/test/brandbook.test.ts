import { describe, expect, it } from 'vitest';
import { brandbookHtml, contrast, hexToRgb, toCmyk, VOICE } from '../src/brandbook.ts';

const kit = { id: 'cafe', name: 'Café Luna', sector: 'restaurante', personality: 'cercana', colors: { primary: '#6B3E26', secondary: '#F2C14E', text: '#FFFFFF' }, fonts: { heading: 'Poppins', body: 'Inter' }, learned: {}, captions: {} } as any;

describe('manual de marca', () => {
  it('convierte colores a RGB y CMYK', () => {
    expect(hexToRgb('#FE2C55')).toEqual([254, 44, 85]);
    expect(toCmyk([0, 0, 0])).toEqual([0, 0, 0, 100]);
    expect(toCmyk([255, 255, 255])).toEqual([0, 0, 0, 0]);
    expect(toCmyk([255, 0, 0])).toEqual([0, 100, 100, 0]);
  });
  it('mide el contraste como WCAG', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5);
  });
  it('arma las 6 páginas con los datos del kit', () => {
    const html = brandbookHtml(kit, { frames: [], date: '12 de noviembre de 2026' });
    expect((html.match(/class="page/g) ?? []).length).toBe(6);
    for (const s of ['Café Luna', '#6B3E26', '#F2C14E', 'Poppins', 'Inter', 'No hacer', 'Así sí']) expect(html).toContain(s);
  });
  it('tiene tono de voz para cada personalidad', () => {
    for (const v of Object.values(VOICE)) { expect(v.yes.length).toBeGreaterThan(0); expect(v.no.length).toBeGreaterThan(0); }
  });
});
