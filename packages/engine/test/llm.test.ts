import { describe, expect, it } from 'vitest';
import { contextFor, pickModel, pickVisionModel } from '../src/llm.ts';

describe('IA local', () => {
  it('elige el mejor modelo descargado que quepa en la memoria', () => {
    expect(pickModel(['gemma3:4b', 'qwen3:8b'], 16)).toBe('qwen3:8b');
    expect(pickModel(['qwen3:14b', 'qwen3:8b'], 16)).toBe('qwen3:8b');
    expect(pickModel(['qwen3:14b', 'qwen3:8b'], 32)).toBe('qwen3:14b');
    expect(pickModel(['llama3.1:8b-instruct-q4_K_M', 'nomic-embed-text:latest'], 16)).toBeUndefined();
    expect(pickModel([], 16)).toBeUndefined();
  });
  it('ajusta el contexto al tamaño del pedido', () => {
    expect(contextFor(1000)).toBe(8192);
    expect(contextFor(30_000)).toBe(16384);
    expect(contextFor(80_000)).toBe(32768);
    expect(contextFor(500_000)).toBe(32768);
  });
  it('elige el modelo que ve imágenes, sin confundirlo con el de texto', () => {
    expect(pickVisionModel(['qwen3:8b', 'qwen3-vl:8b'])).toBe('qwen3-vl:8b');
    expect(pickVisionModel(['qwen3:8b'])).toBeUndefined();
    expect(pickModel(['qwen3-vl:8b'], 16)).toBeUndefined();
  });
});
