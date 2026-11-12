import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Project, applyVariant, buildTimeline, getPreset, shortPhrases, suggestVariants } from '@snz/schema';

const ws = mkdtempSync(path.join(os.tmpdir(), 'snz-audio-'));
vi.stubEnv('SE_WORKSPACE', ws);
const { SFX, sfxFile } = await import('../src/sfx.ts');
const { mediaDuration } = await import('../src/media.ts');

afterAll(() => rmSync(ws, { recursive: true, force: true }));

const W = (text: string, start: number) => ({ text, start, end: start + 0.3 });
const words = 'La mayoría pierde horas cortando silencios, poniendo subtítulos a mano. Esto te ahorra horas.'.split(' ').map((w, i) => W(w, i * 0.4));
const transcript = { language: 'es', model: 'small', words };
const base = (extra = {}) => Project.parse({
  version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: { width: 1080, height: 1920, fps: 30 },
  source: { file: 'a.mp4', duration: 60, width: 1080, height: 1920, fps: 30 },
  pacing: getPreset('rapido').pacing, captions: getPreset('rapido').captions,
  scenes: [{ id: 's1', role: 'gancho', ranges: [{ start: 0, end: 2.6 }] }, { id: 's2', role: 'beneficio', ranges: [{ start: 2.6, end: 6 }], transition: { id: 'zoom' }, onScreenText: 'Ahorra horas' }],
  ...extra,
});

describe('variantes automáticas', () => {
  it('saca frases cortas de lo que se dijo, sin inventar', () => {
    const p = shortPhrases('La mayoría pierde horas cortando silencios, poniendo subtítulos a mano. Esto te ahorra horas.');
    expect(p).toContain('Esto te ahorra horas');
    expect(p.every((x) => x.split(' ').length <= 6)).toBe(true);
  });

  it('da siempre 3 variantes distintas, con textos sacados de la transcripción', () => {
    const project = base();
    for (const scene of project.scenes) {
      const v = suggestVariants(project, scene, transcript);
      expect(v).toHaveLength(3);
      expect(new Set(v.map((x) => x.label)).size).toBe(3);
      expect(v.map((x) => x.id)).toEqual(['a', 'b', 'c']);
      const said = words.map((w) => w.text).join(' ');
      for (const x of v) if (x.onScreenText && !x.onScreenText.startsWith('[')) expect(said).toContain(x.onScreenText);
    }
    // "Otras 3" cambia el set.
    const a = suggestVariants(project, project.scenes[1], transcript, 0).map((x) => x.label);
    const b = suggestVariants(project, project.scenes[1], transcript, 1).map((x) => x.label);
    expect(b).not.toEqual(a);
  });

  it('según el papel: cierre con la marca en el CTA, opciones de movimiento en un montaje', () => {
    const cta = base({ scenes: [{ id: 's1', ranges: [{ start: 0, end: 2 }] }, { id: 's2', role: 'cta', ranges: [{ start: 2.6, end: 6 }] }] });
    expect(suggestVariants(cta, cta.scenes[1], transcript)[0]).toMatchObject({ visual: 'motion', motionTemplate: 'logo' });
    const montaje = base({ kind: 'montaje' });
    const v = suggestVariants(montaje, montaje.scenes[1], null);
    expect(v).toHaveLength(3);
    expect(v.some((x) => x.transition || x.punchZoom)).toBe(true);
    expect(suggestVariants(montaje, montaje.scenes[0], null).every((x) => !x.transition)).toBe(true); // la primera no lleva transición
  });

  it('aplicar una variante cambia texto, zoom y transición', () => {
    const project = base();
    const s = project.scenes[1];
    applyVariant(s, { id: 'a', label: 'x', visual: 'original', onScreenText: '', punchZoom: true, transition: 'corte' });
    expect(s).toMatchObject({ chosenVariant: 'a', punchZoom: true, onScreenText: undefined, transition: undefined });
    applyVariant(s, { id: 'b', label: 'y', visual: 'texto', onScreenText: 'Hola', transition: 'golpe' });
    expect(s).toMatchObject({ visual: 'texto', onScreenText: 'Hola', transition: { id: 'golpe' } });
  });
});

describe('efectos de sonido', () => {
  it('los efectos de escena y los automáticos caen en su sitio', () => {
    const project = base({ audio: { sfxAuto: true } });
    project.scenes[1].sfx = [{ id: 'ding', offset: 1, volume: 0.5 }];
    const t = buildTimeline(project, null, { video: 'v', asset: (r) => `/m/${r}` });
    const at = (name: string) => t.sfx.filter((e) => e.src.endsWith(`${name}.wav`)).map((e) => e.fromFrame);
    expect(at('ding')).toEqual([78 + 30]);       // 1 s dentro de la escena 2
    expect(at('whoosh')).toEqual([78 - 2]);      // un poco antes de la transición
    expect(at('pop')).toEqual([78]);             // al entrar el texto
    // Sin el modo automático solo queda el efecto puesto a mano.
    project.audio.sfxAuto = false;
    expect(buildTimeline(project, null, { video: 'v', asset: (r) => r }).sfx).toHaveLength(1);
  });

  it('todos los efectos incluidos se generan y duran poco', async () => {
    for (const id of Object.keys(SFX)) {
      const f = await sfxFile(id);
      expect(existsSync(f)).toBe(true);
      const d = await mediaDuration(f);
      expect(d).toBeGreaterThan(0.02);
      expect(d).toBeLessThan(1.5);
    }
    await expect(sfxFile('no-existe')).rejects.toThrow('No existe el efecto');
  }, 60_000);
});
