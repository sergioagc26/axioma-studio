import { describe, expect, it } from 'vitest';
import { Project, Scene, cutInterval, effectiveRanges, keptMask, restoreInterval, wordsSpan, type Transcript } from '@axioma/schema';

const words = (text: string, start: number) => text.split(' ').map((w, i) => ({ text: w, start: start + i * 0.5, end: start + i * 0.5 + 0.4 }));
const t = { language: 'es', model: 'x', words: [...words('uno dos tres cuatro', 0), ...words('cinco seis siete ocho', 3)] } as Transcript;
const make = () => Project.parse({
  version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: {},
  source: { file: 'a.mp4', duration: 10, width: 1080, height: 1920, fps: 30 }, pacing: {}, captions: {},
  scenes: [Scene.parse({ id: 's01', ranges: [{ start: 0, end: 2 }] }), Scene.parse({ id: 's02', ranges: [{ start: 3, end: 5 }] })],
});

describe('editar por texto', () => {
  it('quitar palabras del medio parte la escena en dos', () => {
    const s = wordsSpan(t, 1, 2); // «dos tres»
    const p = cutInterval(make(), s.start, s.end);
    expect(p.scenes[0].ranges.length).toBe(2);
    expect(keptMask(p, t).slice(0, 4)).toEqual([true, false, false, true]);
  });

  it('recuperar devuelve las palabras a su escena', () => {
    const s = wordsSpan(t, 1, 2);
    const cut = cutInterval(make(), s.start, s.end);
    const back = restoreInterval(cut, s.start, s.end);
    expect(keptMask(back, t).slice(0, 4)).toEqual([true, true, true, true]);
    expect(back.scenes[0].ranges.length).toBe(1);
  });

  it('una escena que se queda sin nada desaparece', () => {
    const s = wordsSpan(t, 4, 7);
    const p = cutInterval(make(), 2.9, 5.1);
    expect(p.scenes.map((x) => x.id)).toEqual(['s01']);
    expect(s.start).toBeLessThan(3);
  });

  it('respeta los recortes de inicio y final de la escena', () => {
    const p0 = make();
    p0.scenes[1].trimStart = 0.5; // la escena 2 empieza en 3,5
    const p = cutInterval(p0, 4, 4.4);
    expect(effectiveRanges(p.scenes[1], 10)).toEqual([{ start: 3.5, end: 4 }, { start: 4.4, end: 5 }]);
  });

  it('recuperar algo que estaba fuera de todas las escenas lo agrega a la anterior en el tiempo', () => {
    const p = restoreInterval(make(), 2.2, 2.8);
    expect(p.scenes[0].ranges).toEqual([{ start: 0, end: 2 }, { start: 2.2, end: 2.8 }]);
  });
});
