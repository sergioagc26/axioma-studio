import { describe, expect, it } from 'vitest';
import { chunkWords, pickClip, planScenes, scriptPhrases } from '../src/creator.ts';

const lib = [
  { file: 'editor.mp4', tags: ['subtitul', 'corta', 'animaciones'] },
  { file: 'exportar.mp4', tags: ['exporta', 'reels'] },
];

describe('reel de creador desde un guion', () => {
  it('parte el guion en frases (y las largas en la coma)', () => {
    const p = scriptPhrases('Hola a todos. ¿Quieres los subtítulos más grandes? Se lo dices. Con la app le pasas tu video en bruto, y la app corta las pausas, subtitula, crea animaciones y arma todo en una línea de tiempo.');
    expect(p[0]).toBe('Hola a todos.');
    expect(p[1]).toBe('¿Quieres los subtítulos más grandes?');
    expect(p.length).toBeGreaterThanOrEqual(4);
  });

  it('agrupa las palabras gigantes: las cortas van con la siguiente', () => {
    const w = ['Y', 'así', 'lo', 'puedes', 'hacer', 'tú.'].map((text, i) => ({ text, start: i }));
    expect(chunkWords(w).map((c) => c.text)).toEqual(['Y así', 'lo puedes', 'hacer', 'tú']);
  });

  it('elige lo que se ve según lo que se dice', () => {
    const plan = planScenes(['Todo este video lo editó la app.', 'Pero Claude tiene un problema.', 'La app corta las pausas y subtitula.', 'Le pegas el link de un reel.', 'Y le pides cambios hablando.', 'Comenta editor.'], lib);
    expect(plan.map((p) => p.kind)).toEqual(['avatar', 'pantalla-pc', 'flotante', 'chat', 'pedido', 'cierre']);
    expect(plan[2].clip?.file).toBe('editor.mp4');
  });

  it('nunca deja cuatro escenas seguidas sin la persona', () => {
    const plan = planScenes(['Hola.', 'Pero hay un problema.', 'La app corta y subtitula.', 'Exporta para reels.', 'Le pegas el link.', 'Chao.'], lib);
    for (let i = 3; i < plan.length; i++) expect([plan[i - 3], plan[i - 2], plan[i - 1], plan[i]].some((s) => ['avatar', 'pedido', 'cierre'].includes(s.kind))).toBe(true);
  });

  it('busca la grabación con más etiquetas en común', () => {
    expect(pickClip('Exporta listo para Reels', lib)?.file).toBe('exportar.mp4');
    expect(pickClip('Nada que ver', lib)).toBeUndefined();
  });
});
