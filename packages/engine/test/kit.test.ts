import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CaptionStyle, FORMATS, Project, buildTimeline, getPreset } from '@snz/schema';

const ws = mkdtempSync(path.join(os.tmpdir(), 'snz-kit-'));
vi.stubEnv('SE_WORKSPACE', ws);
const { kitCaptions, readKit, saveKit } = await import('../src/kit.ts');
const { savePreset, allPresets } = await import('../src/presets.ts');

afterAll(() => rmSync(ws, { recursive: true, force: true }));

describe('kit de marca y presets', () => {
  it('el color y la fuente del kit mandan sobre el preset', async () => {
    await saveKit('acme', { primary: '#FACC15', heading: 'Poppins' });
    const captions = CaptionStyle.parse({ ...getPreset('rapido').captions, ...kitCaptions(await readKit('acme')) });
    expect(captions.highlightColor).toBe('#FACC15');
    expect(captions.fontFamily).toBe('Poppins');
    expect(captions.wordsPerLine).toBe(getPreset('rapido').captions.wordsPerLine);
  });

  it('guarda presets del cliente sin pisar los base', async () => {
    const p = await savePreset('acme', { name: 'Acme rápido', base: 'rapido', captions: { fontFamily: 'Anton' }, palette: ['#000000'], reference: 'ref-1' });
    expect(p).toMatchObject({ id: 'acme-rapido', reference: 'ref-1' });
    expect(p.captions.fontWeight).toBe(400);
    const ids = (await allPresets('acme')).map((x) => x.id);
    expect(ids).toContain('acme-rapido');
    expect(ids).toContain('testimonio');
    expect((await allPresets('otro')).map((x) => x.id)).not.toContain('acme-rapido');
  });
});

describe('línea de tiempo', () => {
  const base = {
    version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: { width: 1080, height: 1920, fps: 30 },
    source: { file: 'a.mp4', duration: 20, width: 1080, height: 1920, fps: 30 },
    pacing: getPreset('rapido').pacing, captions: getPreset('rapido').captions,
  };
  const scene = (id: string, start: number, end: number, extra = {}) => ({ id, ranges: [{ start, end }], ...extra });
  const words = { language: 'es', model: 'small', words: [{ text: 'hola', start: 5.2, end: 5.6 }, { text: 'fuera', start: 9, end: 9.3 }] };

  it('coloca clips seguidos sin huecos y reubica las palabras', () => {
    const project = Project.parse({ ...base, scenes: [scene('s1', 5, 7), scene('s2', 1, 2.5, { onScreenText: 'Hola' })] });
    const t = buildTimeline(project, words, { video: 'v' });
    expect(t.clips.map((c) => [c.fromFrame, c.durationInFrames, c.sourceStartFrame])).toEqual([[0, 60, 150], [60, 45, 30]]);
    expect(t.durationInFrames).toBe(105);
    expect(t.words).toEqual([{ text: 'hola', startFrame: 6, endFrame: 18 }]);
    expect(t.overlays[0]).toMatchObject({ text: 'Hola', fromFrame: 60, durationInFrames: 45 });
  });

  it('b-roll, motion y formato de salida', () => {
    const project = Project.parse({ ...base, scenes: [
      scene('s1', 0, 2, { visual: 'broll', brollFile: 'media/broll/a.mp4' }),
      scene('s2', 2, 4, { visual: 'broll', brollFile: 'persona editando' }),
      scene('s3', 4, 6, { visual: 'motion', motionTemplate: 'barras', motionData: { items: [] }, onScreenText: 'Título' }),
    ] });
    const t = buildTimeline(project, null, { video: 'v', asset: (r) => `/m/${r}`, format: FORMATS['4:5'] });
    expect([t.width, t.height]).toEqual([1080, 1350]);
    expect(t.clips[0]).toMatchObject({ visual: 'broll', brollSrc: '/m/media/broll/a.mp4' });
    expect(t.clips[1]).toMatchObject({ visual: 'original', brollSrc: undefined }); // búsqueda pendiente: se ve la toma original
    expect(t.clips[2].motion).toMatchObject({ template: 'barras', text: 'Título' });
    expect(t.overlays).toHaveLength(0);
  });
});
