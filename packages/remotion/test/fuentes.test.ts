import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONT_FAMILIES } from '@axioma/schema';
import { FONT_SPECS } from '../src/fonts/spec.ts';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'fonts');
const manifest = readFileSync(path.join(dir, 'manifest.ts'), 'utf8');

describe('tipografías dentro de la app (exportar sin internet)', () => {
  it('cada letra que se puede elegir tiene sus archivos en la app', () => {
    const local = new Set(FONT_SPECS.map((s) => s.family));
    expect(FONT_FAMILIES.filter((f) => !local.has(f))).toEqual([]);
    for (const f of FONT_FAMILIES) expect(manifest).toContain(`${JSON.stringify(f)}: [`);
  });

  it('el índice apunta solo a archivos que existen', () => {
    const files = [...manifest.matchAll(/from '\.\/(files\/[^']+)'/g)].map((m) => m[1]);
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => !existsSync(path.join(dir, f)))).toEqual([]);
  });

  it('nada en la plantilla baja letras de Google al exportar', () => {
    const src = path.join(dir, '..');
    for (const f of readdirSync(src).filter((f) => /\.tsx?$/.test(f))) {
      expect(readFileSync(path.join(src, f), 'utf8'), f).not.toMatch(/@remotion\/google-fonts|fonts\.gstatic\.com/);
    }
  });
});
