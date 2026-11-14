import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Configuración en una carpeta temporal (nunca la del usuario).
const dir = mkdtempSync(path.join(os.tmpdir(), 'axioma-ajustes-'));
process.env.SE_WORKSPACE = dir;

describe('configuración de la app', () => {
  it('guarda solo valores válidos y un campo vacío vuelve a «que decida la app»', async () => {
    const { saveSettings, settings } = await import('../src/settings.ts');
    await saveSettings({ forma: 'horizontal', exportar: { calidad: 'maxima', lufs: -16 }, voz: { proveedor: 'qwen', voz: 'mexicano' } });
    expect(settings()).toMatchObject({ forma: 'horizontal', exportar: { calidad: 'maxima', lufs: -16 }, voz: { proveedor: 'qwen', voz: 'mexicano' } });
    await saveSettings({ forma: 'diagonal' as never, exportar: { calidad: 'super' as never } });
    expect(settings().forma).toBeUndefined();
    expect(settings().exportar?.calidad).toBeUndefined();
    expect(JSON.parse(readFileSync(path.join(dir, 'ajustes.json'), 'utf8')).voz.voz).toBe('mexicano');
  });

  it('no deja elegir un modelo que no cabe en la memoria', async () => {
    const { saveSettings } = await import('../src/settings.ts');
    await expect(saveSettings({ llm: 'qwen3.8:27b' }, (m) => !/27b/.test(m))).rejects.toThrow(/demasiado grande/);
  });
});
