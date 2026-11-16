import { describe, expect, it } from 'vitest';
import { Pacing, type Word } from '@axioma/schema';
import { cutByScript, findTakes, formatScriptCut, pickTake, scriptRows, scriptSentences } from '../src/scriptcut.ts';

const pacing = Pacing.parse({ maxPause: 0.3, pad: 0.05, punchZoomEvery: 0 });

/** Arma una transcripción: cada palabra dura 0,3 s; «|» deja una pausa de 1 s. */
function said(text: string): Word[] {
  const out: Word[] = [];
  let t = 0.5;
  for (const w of text.split(/\s+/)) {
    if (w === '|') { t += 1; continue; }
    out.push({ text: w, start: +t.toFixed(2), end: +(t + 0.3).toFixed(2), prob: 0.9 });
    t += 0.35;
  }
  return out;
}

const GUION = `Hoy te enseño tres trucos para editar más rápido.
Primero, usa atajos de teclado.
Segundo, corta los silencios. Tercero, ordena tus archivos.
Sígueme para más consejos.`;

// La grabación: un falso comienzo, comentarios fuera del guion, muletillas, la frase de los
// atajos grabada dos veces (la segunda mejor) y la última frase nunca se dijo.
const WORDS = said([
  'Hoy te enseño tres trucos para | eh | Hoy te enseño 3 trucos para editar más rápido. |',
  'Uy espera que se me olvidó prender la luz |',
  'Primero, usa atajos del teclado. | No no, otra vez. | Primero, usa atajos de teclado. |',
  'em | Segundo, corta los silencios. | Tercero, ordena tus archivos. |',
  'bueno creo que ya quedó listo',
].join(' '));
const DURATION = WORDS[WORDS.length - 1].end + 1;
const spoken = (from: number, to: number) => WORDS.filter((w) => w.start >= from - 0.01 && w.end <= to + 0.01).map((w) => w.text).join(' ');

describe('scriptRows y scriptSentences', () => {
  it('limpia viñetas, numeración y acotaciones', () => {
    expect(scriptRows('# Gancho\n- Hola a todos (sonríe)\n\n2) Mira esto [b-roll]\n   \n')).toEqual(['Gancho', 'Hola a todos', 'Mira esto']);
  });
  it('parte una fila en frases', () => {
    expect(scriptSentences('Segundo, corta los silencios. Tercero, ordena tus archivos.')).toEqual(['Segundo, corta los silencios.', 'Tercero, ordena tus archivos.']);
  });
});

describe('findTakes y pickTake', () => {
  it('encuentra cada vez que se dijo la frase y elige la última completa', () => {
    const T = 'primero usa atajos del teclado no no otra vez primero usa atajos de teclado'.split(' ');
    const takes = findTakes('primero usa atajos de teclado'.split(' '), T);
    expect(takes).toHaveLength(2);
    expect(takes[0].from).toBe(0);
    expect(takes[1].from).toBe(9);
    expect(pickTake(takes, 'ultima')).toBe(1);
    // La primera tiene un error («del teclado»): no está completa y «primera» salta a la buena.
    expect(takes[0].complete).toBe(false);
    expect(pickTake(takes, 'primera')).toBe(1);
    expect(pickTake(takes, 'mejor')).toBe(1);
  });
  it('un falso comienzo no cuenta como toma completa', () => {
    const T = 'hoy te ense hoy te enseño tres trucos'.split(' ');
    const takes = findTakes('hoy te enseño tres trucos'.split(' '), T);
    expect(pickTake(takes)).toBeGreaterThanOrEqual(0);
    const chosen = takes[pickTake(takes)];
    expect(chosen.from).toBe(3);
    expect(chosen.complete).toBe(true);
  });
});

describe('cutByScript', () => {
  const { scenes, report } = cutByScript(WORDS, scriptRows(GUION), pacing, DURATION);

  it('se queda solo con las frases del guion, en su orden', () => {
    const found = report.lines.filter((l) => l.found);
    expect(found.map((l) => l.text)).toEqual([
      'Hoy te enseño tres trucos para editar más rápido.',
      'Primero, usa atajos de teclado.',
      'Segundo, corta los silencios.',
      'Tercero, ordena tus archivos.',
    ]);
    // Orden del guion = orden de las escenas.
    const ids = found.map((l) => l.sceneId!);
    expect([...ids].sort()).toEqual(ids);
  });

  it('elige la última toma completa de cada frase repetida', () => {
    const hook = report.lines[0];
    expect(hook.takes).toBe(2); // el falso comienzo cuenta como toma, pero incompleta
    expect(hook.chosenTake).toBe(2);
    expect(spoken(hook.start!, hook.end!)).toBe('Hoy te enseño 3 trucos para editar más rápido.');
    const atajos = report.lines[1];
    expect(atajos.takes).toBe(2);
    expect(atajos.chosenTake).toBe(2);
    expect(spoken(atajos.start!, atajos.end!)).toBe('Primero, usa atajos de teclado.');
  });

  it('quita lo dicho fuera del guion, las muletillas y las tomas descartadas', () => {
    const audio = scenes.flatMap((s) => s.ranges).map((r) => spoken(r.start, r.end)).join(' ');
    for (const fuera of ['espera', 'luz', 'otra', 'bueno', 'eh', 'em', 'del']) expect(audio.split(/\s+/).map((w) => w.replace(/[.,]/g, ''))).not.toContain(fuera);
    expect(report.removedFillers).toBe(2);
    expect(report.removedOffScriptWords).toBeGreaterThanOrEqual(13);
    expect(report.removedRetakeWords).toBeGreaterThanOrEqual(5);
    expect(report.outputDuration).toBeLessThan(DURATION / 2);
  });

  it('avisa la frase del guion que no está en la grabación', () => {
    expect(report.missing).toEqual(['Sígueme para más consejos.']);
    expect(report.lines[report.lines.length - 1].found).toBe(false);
    expect(formatScriptCut(report)).toContain('NO SE ENCONTRÓ: «Sígueme para más consejos.»');
  });

  it('cada escena dice qué frase del guion lleva', () => {
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(scenes[0].scriptText).toBe('Hoy te enseño tres trucos para editar más rápido.');
    expect(scenes[0].role).toBe('gancho');
    expect(scenes.some((s) => s.scriptText === 'Segundo, corta los silencios. Tercero, ordena tus archivos.')).toBe(true);
  });

  it('respeta el orden del guion aunque se haya grabado en otro orden', () => {
    const w = said('Tercero, ordena tus archivos. | Segundo, corta los silencios.');
    const r = cutByScript(w, ['Segundo, corta los silencios.', 'Tercero, ordena tus archivos.'], pacing, 10);
    expect(r.scenes.map((s) => s.scriptText)).toEqual(['Segundo, corta los silencios.', 'Tercero, ordena tus archivos.']);
    expect(r.scenes[0].ranges[0].start).toBeGreaterThan(r.scenes[1].ranges[0].start);
  });

  it('dos filas dichas de corrido no repiten audio entre escenas', () => {
    const w = said('No sabe editar como un editor. Con la app corta las pausas en segundos.');
    const r = cutByScript(w, ['No sabe editar como un editor.', 'Con la app corta las pausas en segundos.'], Pacing.parse({ maxPause: 0.3, pad: 0.15, punchZoomEvery: 0 }), 10);
    expect(r.scenes).toHaveLength(2);
    expect(r.scenes[1].ranges[0].start).toBeGreaterThanOrEqual(r.scenes[0].ranges.at(-1)!.end);
  });

  it('con «primera» se queda con la primera toma completa', () => {
    const w = said('Primero, usa atajos de teclado. | Primero, usa atajos de teclado.');
    expect(cutByScript(w, ['Primero, usa atajos de teclado.'], pacing, 10, [], { take: 'primera' }).report.lines[0].chosenTake).toBe(1);
    expect(cutByScript(w, ['Primero, usa atajos de teclado.'], pacing, 10).report.lines[0].chosenTake).toBe(2);
    // La toma con un error («del teclado») no cuenta como completa: «primera» salta a la buena.
    expect(cutByScript(WORDS, scriptRows(GUION), pacing, DURATION, [], { take: 'primera' }).report.lines[1].chosenTake).toBe(2);
  });
});
