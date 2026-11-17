import { describe, expect, it } from 'vitest';
import { isTalking } from '../src/transcribe.ts';
import { goodHook } from '../src/auto.ts';
import { parseOrder, textTopic, wantsTexts } from '../src/inbox.ts';

const t = (text: string) => ({ language: 'es', duration: 10, words: text.split(' ').map((w, i) => ({ text: w, start: i * 0.4, end: i * 0.4 + 0.3 })) }) as never;

describe('Para editar con videos del gym', () => {
  it('el entrenador contando repeticiones no es alguien hablando a cámara', () => {
    expect(isTalking(t('5 duro 6 duro 7 va 3 más 3 más de una 10 normales va 1 va 1 2 3'))).toBe(false);
    expect(isTalking(t('vamos dale uno dos tres eso es aguanta otra más vamos'))).toBe(false);
  });
  it('un mensaje a cámara sí cuenta como hablado', () => {
    expect(isTalking(t('hoy les voy a contar cómo organizo mi semana de entrenamiento para no perder la constancia aunque tenga trabajo'))).toBe(true);
  });
  it('descarta ganchos de puro conteo o repetidos', () => {
    expect(goodHook('5 duro 6 duro')).toBe(false);
    expect(goodHook('duro duro duro')).toBe(false);
    expect(goodHook('La disciplina gana siempre')).toBe(true);
  });
  it('saca duración, formato y textos de un pedido escrito con palabras normales', () => {
    const { brief } = parseOrder('Un reel de unos 30 segundos para Instagram con estos videos del gym. Que tenga música con energía y textos motivadores sobre la disciplina.');
    expect(brief.duracion).toBe('30 segundos');
    expect(brief.formato).toBe('Reel');
    expect(wantsTexts(brief.notas!)).toBe(true);
    expect(textTopic(brief.notas!)).toBe('la disciplina');
  });
  it('no inventa duración si el pedido no la dice', () => {
    expect(parseOrder('Hazlo con mucha energía').brief.duracion).toBeUndefined();
  });
});
