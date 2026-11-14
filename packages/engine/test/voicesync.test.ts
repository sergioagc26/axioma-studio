import { describe, expect, it } from 'vitest';
import { smoothTags, tagOfWord, voiceSegments } from '../src/voicesync.ts';
import { foregroundMask } from '../src/front.ts';
import { frontKey } from '@axioma/schema';

describe('sincronía de tomas con la voz', () => {
  it('reconoce el plato aunque venga en plural o con puntuación', () => {
    expect(tagOfWord('burro.')).toBe('burro');
    expect(tagOfWord('Burritos')).toBe('burro');
    expect(tagOfWord('nachos:')).toBe('nachos');
    expect(tagOfWord('totopos')).toBe('nachos');
    expect(tagOfWord('Aguas')).toBe('bebida');
    expect(tagOfWord('familia,')).toBe('personas');
  });

  it('no confunde palabras que empiezan igual', () => {
    expect(tagOfWord('aguacate')).toBeNull();
    expect(tagOfWord('tortilla')).toBeNull();
    expect(tagOfWord('de')).toBeNull();
  });

  it('cada mención abre una sección hasta la siguiente, solo con lo que hay en tomas', () => {
    const words = [
      { text: 'Primero,', start: 0 }, { text: 'el', start: 0.4 }, { text: 'burro.', start: 0.6 },
      { text: 'Otro', start: 2 }, { text: 'burro', start: 2.4 },
      { text: 'Ahora', start: 4 }, { text: 'los', start: 4.3 }, { text: 'nachos', start: 4.5 },
      { text: 'y', start: 6 }, { text: 'tacos', start: 6.2 },
    ];
    const segs = voiceSegments(words, new Set(['burro', 'nachos']));
    expect(segs.map((s) => [s.tag, s.start])).toEqual([['burro', 0.6], ['nachos', 4.5]]);
  });

  it('corrige las tomas de preparación por sus vecinas, sin efecto dominó ni tocar bebidas', () => {
    const shot = (id: string, tag: string) => ({ id, start: 0, end: 1, tag, tagAuto: true });
    const shots = [
      shot('t1', 'torta'), shot('t2', 'torta'), shot('t3', 'cocina'), shot('t4', 'torta'), shot('t5', 'torta'),
      shot('t6', 'nachos'), shot('t7', 'nachos'), shot('t8', 'bebida'), shot('t9', 'nachos'), shot('t10', 'nachos'),
    ];
    smoothTags(shots);
    expect(shots.map((s) => s.tag)).toEqual(['torta', 'torta', 'torta', 'torta', 'torta', 'nachos', 'nachos', 'bebida', 'nachos', 'nachos']);
  });

  it('respeta las etiquetas puestas por una persona', () => {
    const shots = [
      { id: 't1', start: 0, end: 1, tag: 'torta', tagAuto: true }, { id: 't2', start: 0, end: 1, tag: 'torta', tagAuto: true },
      { id: 't3', start: 0, end: 1, tag: 'cocina' },
      { id: 't4', start: 0, end: 1, tag: 'torta', tagAuto: true }, { id: 't5', start: 0, end: 1, tag: 'torta', tagAuto: true },
    ];
    smoothTags(shots);
    expect(shots[2].tag).toBe('cocina');
  });
});

describe('texto detrás de la comida', () => {
  it('marca lo que sobresale de su entorno y no una superficie lisa', () => {
    const w = 60, h = 60;
    const depth = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // Mesa que se acerca hacia abajo (gradiente) y un plato que sobresale en el centro.
      const plate = (x - 30) ** 2 + (y - 30) ** 2 < 36 ? 60 : 0;
      depth[y * w + x] = Math.min(255, 80 + y * 2 + plate);
    }
    const m = foregroundMask(depth, w, h);
    expect(m[30 * w + 30]).toBeGreaterThan(0.8);
    expect(m[5 * w + 5]).toBeLessThan(0.1);
    expect(m[55 * w + 5]).toBeLessThan(0.1);
  });

  it('la clave de los cortes cambia si cambia una toma', () => {
    const a = [{ fromFrame: 0, durationInFrames: 30, sourceStartFrame: 100 }, { fromFrame: 30, durationInFrames: 20, sourceStartFrame: 400 }];
    const b = [{ fromFrame: 0, durationInFrames: 30, sourceStartFrame: 100 }, { fromFrame: 30, durationInFrames: 20, sourceStartFrame: 401 }];
    expect(frontKey(a)).toBe(frontKey(a.map((c) => ({ ...c }))));
    expect(frontKey(a)).not.toBe(frontKey(b));
  });
});

describe('guion técnico', () => {
  it('encuentra en la voz dónde empieza cada fila', async () => {
    const { rowStarts } = await import('../src/script.ts');
    const say = 'Tienes hambre y no de cualquiera. Primero el burro con queso. Después los nachos para compartir. Toca y conoce la carta.';
    const words = say.split(' ').map((text, i) => ({ text, start: i * 0.4 }));
    const filas = [{ voz: 'Tienes hambre y no de cualquiera.' }, { voz: 'Primero el burro con queso.' }, { voz: 'Después los nachos para compartir.' }, { voz: 'Toca y conoce la carta.' }];
    expect(rowStarts(words, filas).map((t) => +t.toFixed(1))).toEqual([0, 2.4, 4.4, 6.4]);
  }, 30_000);

  it('avisa de cifras y promociones que no salen del brief', async () => {
    const { checkScript } = await import('../src/script.ts');
    const { Guion } = await import('@axioma/schema');
    const g = Guion.parse({ duracion: 20, filas: [{ seccion: 'gancho', voz: 'Hoy 2x1 en burros por solo 15000 pesos.' }, { seccion: 'llamada', voz: 'Ven a la Diagonal 16.' }] });
    const avisos = checkScript(g, { text: 'Burros y nachos. Diagonal 16 # 21-08' });
    expect(avisos.some((a) => a.includes('15000'))).toBe(true);
    expect(avisos.some((a) => a.includes('16,') || a.includes('16)'))).toBe(false);
    expect(avisos.some((a) => /promoci/.test(a))).toBe(true);
  });

  it('no confunde «jugosa» con una bebida', () => {
    expect(tagOfWord('jugosa')).toBeNull();
    expect(tagOfWord('jugos')).toBe('bebida');
  });
});

describe('etiquetas propias', () => {
  it('una etiqueta escrita a mano se reconoce en la voz por su palabra', async () => {
    const { withCustomTags, voiceSegments } = await import('../src/voicesync.ts');
    const tags = withCustomTags([{ tag: 'pizza' }, { tag: 'nachos' }]);
    const segs = voiceSegments([{ text: 'Las', start: 0 }, { text: 'pizzas', start: 0.5 }, { text: 'y', start: 1 }, { text: 'nachos.', start: 1.3 }], new Set(['pizza', 'nachos']), tags);
    expect(segs.map((s) => s.tag)).toEqual(['pizza', 'nachos']);
  });
});

describe('pedido sobre una referencia', () => {
  it('copia solo lo que se pide y respeta los «no»', async () => {
    const { copyFromWish } = await import('../src/refsource.ts');
    const a = copyFromWish('Me gusta cómo engancha al inicio y el ritmo de cortes; el color no me interesa.');
    expect(a).toMatchObject({ estructura: true, ritmo: true, color: false, subtitulos: false });
    const b = copyFromWish('Quiero todo el estilo, pero sin la música');
    expect(b).toMatchObject({ ritmo: true, subtitulos: true, color: true, musica: false });
    expect(copyFromWish('')).toMatchObject({ ritmo: true, color: true, estructura: true });
  });

  it('reconoce links de videos y de perfiles', async () => {
    const { linkKind } = await import('../src/refsource.ts');
    expect(linkKind('https://www.instagram.com/reel/ABC123/')).toMatchObject({ platform: 'instagram', profile: false });
    expect(linkKind('https://www.instagram.com/ilcartelsogamoso/')).toMatchObject({ platform: 'instagram', profile: true });
    expect(linkKind('https://www.tiktok.com/@marca')).toMatchObject({ platform: 'tiktok', profile: true });
    expect(linkKind('https://www.tiktok.com/@marca/video/123')).toMatchObject({ profile: false });
    expect(linkKind('hola')).toBeNull();
  });
});
