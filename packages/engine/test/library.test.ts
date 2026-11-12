import { describe, expect, it } from 'vitest';
import type { Transcript } from '@axioma/schema';
import { clientFolder, dot, frameStep, unit, spokenHits } from '../src/library.ts';

describe('búsqueda en mi material', () => {
  const words = (text: string, start: number) => text.split(' ').map((w, i) => ({ text: w, start: start + i * 0.3, end: start + i * 0.3 + 0.25 }));
  const t = { language: 'es', words: [...words('Hoy les hablo del precio de mis cursos.', 0), ...words('Y la inversión vale la pena.', 10)] } as Transcript;

  it('encuentra lo que se dice sin importar tildes ni mayúsculas', () => {
    const hits = spokenHits(t, 'Inversion');
    expect(hits).toHaveLength(1);
    expect(hits[0].start).toBeGreaterThanOrEqual(9);
    expect(hits[0].text).toMatch(/inversión/);
  });

  it('pide todas las palabras cerca', () => {
    expect(spokenHits(t, 'precio cursos')).toHaveLength(1);
    expect(spokenHits(t, 'precio pena')).toHaveLength(0);
  });

  it('mira 1 fotograma por segundo en videos cortos y menos en los largos', () => {
    expect(frameStep(40)).toBe(1);
    expect(frameStep(600)).toBe(4);
  });

  it('compara vectores normalizados', () => {
    const a = unit(Float32Array.from([3, 4]));
    expect(dot(a, a)).toBeCloseTo(1);
  });

  it('agrupa por la carpeta del cliente', () => {
    expect(clientFolder('/w/clientes/personal/proyectos/2026-reel')).toBe('personal');
  });
});
