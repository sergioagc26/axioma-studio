import { describe, expect, it } from 'vitest';
import { fishError, looksLikeImitation } from '../src/tts.ts';

describe('Fish Audio', () => {
  it('descarta voces que imitan a famosos o personajes', () => {
    expect(looksLikeImitation({ title: 'Goku (Mario Castañeda)', tags: ['male', 'Mario Castañeda', 'character-voice'] })).toBe(true);
    expect(looksLikeImitation({ title: 'Narrador', tags: ['male', 'anime'] })).toBe(true);
    expect(looksLikeImitation({ title: 'voz de locutor k', tags: ['male', 'deep', 'serious', 'Spanish'] })).toBe(false);
    expect(looksLikeImitation({ title: 'Esqueleto voz', tags: ['male', 'Spanish', 'Latin American'] })).toBe(false);
  });
  it('explica los errores en palabras sencillas', () => {
    expect(fishError(Object.assign(new Error(''), { status: 401 }))).toMatch(/clave/);
    expect(fishError(Object.assign(new Error(''), { status: 402 }))).toMatch(/saldo/);
    expect(fishError(new Error('fetch failed'))).toMatch(/conexión/);
  });
});
