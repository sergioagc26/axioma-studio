import { describe, expect, it } from 'vitest';
import { Project, Scene, type Transcript } from '@axioma/schema';
import { BUILTIN_LUTS, checkCube, cubeText } from '../src/lut.ts';
import { bestTeaser } from '../src/teaser.ts';

describe('LUTs', () => {
  it('los incluidos generan un .cube válido y completo', () => {
    for (const [id, l] of Object.entries(BUILTIN_LUTS)) {
      const text = cubeText(l.fn, 9, id);
      expect(checkCube(text)).toBe(9);
      // Todos los valores quedan entre 0 y 1.
      const nums = text.split('\n').filter((x) => /^[\d.]+ [\d.]+ [\d.]+$/.test(x)).flatMap((x) => x.split(' ').map(Number));
      expect(nums.length).toBe(9 ** 3 * 3);
      expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...nums)).toBeLessThanOrEqual(1);
    }
  });

  it('rechaza archivos que no son LUT 3D', () => {
    expect(() => checkCube('hola')).toThrow(/LUT_3D_SIZE/);
    expect(() => checkCube('LUT_3D_SIZE 4\n0 0 0\n1 1 1\n')).toThrow(/incompleto/);
  });
});

describe('adelanto (frase más fuerte al inicio)', () => {
  const words = (text: string, start: number) => text.split(' ').map((w, i) => ({ text: w, start: start + i * 0.3, end: start + i * 0.3 + 0.25 }));
  const t: Transcript = {
    language: 'es',
    words: [
      ...words('Hola a todos, bienvenidos al canal de hoy.', 0),
      ...words('Entonces les quería contar algo de mi historia.', 4),
      ...words('Nadie te dice el error que te cuesta dinero.', 9),
      ...words('Y bueno, eso es todo por hoy amigos.', 14),
    ],
  } as Transcript;
  const scene = (id: string, start: number, end: number) => Scene.parse({ id, ranges: [{ start, end }] });
  const project = Project.parse({
    version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '',
    format: {}, source: { file: 'a.mp4', duration: 20, width: 1080, height: 1920, fps: 30 },
    pacing: {}, captions: {},
    scenes: [scene('s01', 0, 3.5), scene('s02', 4, 8.5), scene('s03', 9, 13.5), scene('s04', 14, 18)],
  });

  it('elige la frase con más gancho fuera de la primera escena', () => {
    const idea = bestTeaser(project, t);
    expect(idea?.text).toMatch(/^Nadie te dice/);
    expect(idea?.sceneIndex).toBe(2);
  });

  it('no propone nada si solo hay una escena', () => {
    expect(bestTeaser({ ...project, scenes: [scene('s01', 0, 18)] }, t)).toBeNull();
  });
});
