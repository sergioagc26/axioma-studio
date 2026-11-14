import { describe, expect, it } from 'vitest';
import { planFor, type Machine } from '../src/machine.ts';

const base: Machine = { os: 'macOS', osVersion: '15', arch: 'arm64', cpu: 'Apple M2', cores: 8, ramGb: 16, unifiedMemory: true, gpus: [{ name: 'Apple M2', vendor: 'apple' }], accel: 'metal', diskFreeGb: 300 };

describe('configuración según el computador', () => {
  it('un Mac de 16 GB usa IA mediana, voz IA y 4K', () => {
    const p = planFor(base);
    expect(p).toMatchObject({ ok: true, llm: 'qwen3:8b', vision: 'qwen3-vl:8b', voz: 'qwen', uhd: true });
  });
  it('un PC con NVIDIA de 12 GB usa la IA grande en la tarjeta', () => {
    const p = planFor({ ...base, os: 'Windows', cpu: 'Ryzen 7', cores: 16, ramGb: 32, unifiedMemory: false, gpus: [{ name: 'RTX 3060', vendor: 'nvidia', vramGb: 12 }], accel: 'cuda' });
    expect(p).toMatchObject({ nivel: 'muy alto', llm: 'qwen3:14b', whisper: 'medium', voz: 'qwen' });
  });
  it('un portátil de 8 GB sin aceleración usa lo liviano y lo dice', () => {
    const p = planFor({ ...base, os: 'Windows', cpu: 'Intel i5', cores: 4, ramGb: 8, unifiedMemory: false, gpus: [{ name: 'Intel UHD', vendor: 'intel' }], accel: 'cpu' });
    expect(p).toMatchObject({ ok: true, nivel: 'basico', llm: 'qwen3:4b', voz: 'sistema', uhd: false });
    expect(p.limites.some((l) => /aceleraci/.test(l))).toBe(true);
  });
  it('un equipo de 4 GB no llega al mínimo', () => {
    const p = planFor({ ...base, cores: 2, ramGb: 4, unifiedMemory: false, gpus: [], accel: 'cpu', diskFreeGb: 10 });
    expect(p.ok).toBe(false);
    expect(p.nivel).toBe('insuficiente');
    expect(p.limites.length).toBeGreaterThanOrEqual(3);
  });
});
