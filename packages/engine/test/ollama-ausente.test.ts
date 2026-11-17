import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// Sin Ollama instalado (como en una máquina en la nube): un puerto donde no responde nadie y un PATH
// donde no está el programa. En un Mac con la app de Ollama la prueba no aplica (la abriría).
vi.stubEnv('OLLAMA_HOST', '127.0.0.1:9');
vi.stubEnv('PATH', '/sin-ollama');
const { ensureOllama } = await import('../src/llm.ts');
const hasApp = process.platform === 'darwin' && existsSync('/Applications/Ollama.app');

describe('IA local ausente', () => {
  it.skipIf(hasApp)('si Ollama no está instalado responde que no al instante (antes esperaba 20 s)', async () => {
    const t = Date.now();
    expect(await ensureOllama()).toBe(false);
    expect(Date.now() - t).toBeLessThan(3000);
  });

  it('AXIOMA_SIN_IA_LOCAL=1 la desactiva sin intentar abrirla', async () => {
    vi.stubEnv('AXIOMA_SIN_IA_LOCAL', '1');
    const t = Date.now();
    expect(await ensureOllama()).toBe(false);
    expect(Date.now() - t).toBeLessThan(100);
    vi.unstubAllEnvs();
  });
});
