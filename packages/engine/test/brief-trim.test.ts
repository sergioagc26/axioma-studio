import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Project, buildTimeline, effectiveRanges, getPreset, outputDuration, sceneLength } from '@snz/schema';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fixture = path.join(repo, 'workspace', 'clientes', 'personal', 'proyectos', '2026-11-12-prueba-sintetica');
const hasFixture = existsSync(path.join(fixture, 'transcript.json')) && existsSync(path.join(fixture, 'analysis.json'));
const ws = mkdtempSync(path.join(os.tmpdir(), 'snz-brief-'));
vi.stubEnv('SE_WORKSPACE', ws);
const E = await import('../src/index.ts');
const dir = path.join(ws, 'clientes', 'personal', 'proyectos', 'prueba');

afterAll(() => rmSync(ws, { recursive: true, force: true }));

describe('recorte de clips', () => {
  const scene = (trimStart = 0, trimEnd = 0) => ({ ranges: [{ start: 10, end: 12 }, { start: 20, end: 23 }], trimStart, trimEnd });

  it('quita segundos del inicio y del final sin perder el material', () => {
    expect(effectiveRanges(scene())).toEqual([{ start: 10, end: 12 }, { start: 20, end: 23 }]);
    expect(effectiveRanges(scene(0.5, 1))).toEqual([{ start: 10.5, end: 12 }, { start: 20, end: 22 }]);
    // Un recorte mayor que el primer tramo sigue en el segundo.
    expect(effectiveRanges(scene(2.5, 0))).toEqual([{ start: 20.5, end: 23 }]);
    expect(sceneLength(scene(2.5, 0))).toBeCloseTo(2.5);
  });

  it('siempre deja un mínimo de clip', () => {
    expect(sceneLength(scene(99, 99))).toBeCloseTo(0.3);
    expect(sceneLength(scene(0, 99))).toBeCloseTo(0.3);
  });

  it('la línea de tiempo y la duración usan el recorte', () => {
    const p = Project.parse({
      version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: { width: 1080, height: 1920, fps: 30 },
      source: { file: 'a.mp4', duration: 60, width: 1080, height: 1920, fps: 30 },
      pacing: getPreset('rapido').pacing, captions: getPreset('rapido').captions,
      scenes: [{ id: 's1', ranges: [{ start: 10, end: 14 }], trimStart: 1, trimEnd: 1 }, { id: 's2', ranges: [{ start: 20, end: 22 }] }],
    });
    expect(outputDuration(p)).toBeCloseTo(4);
    const t = buildTimeline(p, { language: 'es', model: 'x', words: [{ text: 'fuera', start: 10.2, end: 10.5 }, { text: 'dentro', start: 11.5, end: 11.9 }] }, { video: 'v' });
    expect(t.clips[0]).toMatchObject({ sourceStartFrame: 330, durationInFrames: 60 });
    expect(t.clips[1].fromFrame).toBe(60);
    expect(t.words.map((w) => w.text)).toEqual(['dentro']); // la palabra recortada no se subtitula
  });
});

describe.skipIf(!hasFixture)('edición según el brief', () => {
  beforeAll(() => {
    cpSync(fixture, dir, { recursive: true, filter: (src) => !src.includes(`${path.sep}renders${path.sep}`) && !src.includes(`${path.sep}versions${path.sep}`) });
  });

  it('arma la edición con ritmo, duración, tono, gancho y cierre', async () => {
    await E.setBrief(dir, { formato: 'Reel 9:16', ritmo: 'Con ritmo', tono: 'Educativo', duracion: '15–20 s', cta: 'Escríbeme REEL' });
    const { project, summary } = await E.applyBrief(dir);
    expect(project.presetId).toBe('con-ritmo');
    expect(outputDuration(project)).toBeLessThanOrEqual(20.01);
    expect(project.captions.effect).toBe('caja');
    expect(project.scenes[0]).toMatchObject({ role: 'gancho', textStyle: 'gigante' });
    expect(project.scenes[0].onScreenText).toBeTruthy();
    const last = project.scenes.at(-1)!;
    expect(last).toMatchObject({ role: 'cta', onScreenText: 'Escríbeme REEL', textStyle: 'banda' });
    expect(project.scenes.slice(1, -1).every((s) => s.textStyle === 'marcador')).toBe(true);
    expect(project.briefAppliedAt).toBeTruthy();
    expect(summary.join(' ')).toContain('Escríbeme REEL');
    expect((await E.listVersions(dir)).some((v) => v.includes('antes-del-brief'))).toBe(true);
  });

  it('un ritmo rápido y otro tono cambian el resultado', async () => {
    await E.setBrief(dir, { ritmo: 'Rápido', tono: 'Cercano', duracion: 'Lo que dure', cta: '' });
    const { project } = await E.applyBrief(dir);
    expect(project.presetId).toBe('rapido');
    expect(project.audio.sfxAuto).toBe(true);
    expect(project.scenes[1]).toMatchObject({ textStyle: 'subrayado', look: 'calido' });
    expect(project.scenes[0].camera).toBe('acercar');
  });

  it('recortar una escena desde las operaciones', async () => {
    const before = outputDuration(await E.readProject(dir));
    const p = await E.editScene(dir, 's01', { trimEnd: 1 });
    expect(outputDuration(p)).toBeCloseTo(before - 1, 1);
  });
});

describe('plantilla completa desde una referencia', () => {
  const report = (extra = {}) => ({
    id: 'ref', name: 'Ref', client: 'x', createdAt: '', duration: 20, cuts: [1, 2, 3], avgShot: 1.2, bpm: 120, palette: ['#FACC15'], frames: [],
    captions: { y: 0.5, color: '#000000', highlight: '#9BEF3A', box: true, rate: 2.6, wordsPerLine: 1 }, look: 'calido' as const, flashes: true,
    suggested: { maxPause: 0.2, punchZoomEvery: 2, highlightColor: '#FACC15', ritmo: 'rapido' as const }, ...extra,
  });

  it('lleva subtítulos, textos, imagen, transiciones y efectos', () => {
    const p = E.presetFromReference(report(), 'Mi estilo');
    expect(p.captions).toMatchObject({ y: 0.5, color: '#000000', stroke: false, highlightColor: '#9BEF3A', effect: 'caja', wordsPerLine: 1, mode: 'word', emphasis: true });
    expect(p.style).toEqual({ textStyle: 'caja', look: 'calido', transitions: true, flashes: true, sfxAuto: true });
    expect(p.pacing).toEqual({ maxPause: 0.2, punchZoomEvery: 2 });
  });

  it('sin subtítulos detectados usa el ritmo', () => {
    const p = E.presetFromReference(report({ captions: null, flashes: false, suggested: { maxPause: 0.6, punchZoomEvery: 0, highlightColor: '#FE2C55', ritmo: 'sobrio' as const } }));
    expect(p.captions).toMatchObject({ effect: 'color', uppercase: false, highlightColor: '#FE2C55' });
    expect(p.style.textStyle).toBe('subrayado');
  });

  it.skipIf(!hasFixture)('al aplicarla viste las escenas y pone destellos', async () => {
    const preset = await E.savePreset(undefined, E.presetFromReference(report(), 'Estilo de prueba'));
    const p = await E.applyPreset(dir, preset.id);
    expect(p.captions).toMatchObject({ color: '#000000', effect: 'caja' });
    expect(p.scenes.every((s) => s.look === 'calido' && s.textStyle === 'caja')).toBe(true);
    const used = p.scenes.filter((s) => s.transition).map((s) => s.transition!.id);
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((id) => id === 'destello')).toBe(true);
    expect(p.audio.sfxAuto).toBe(true);
  });
});
