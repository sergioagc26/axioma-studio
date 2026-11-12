import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FORMATS, Project, buildTimeline, focusFor, getPreset } from '@axioma/schema';

const ws = mkdtempSync(path.join(os.tmpdir(), 'axioma-montaje-'));
vi.stubEnv('SE_WORKSPACE', ws);
const E = await import('../src/index.ts');
const { coverPosition } = await import('@axioma/remotion/src/Reel.tsx');

const clip = (name: string, color: string, audio: boolean) => {
  const out = path.join(ws, name);
  const a = audio ? ['-f', 'lavfi', '-i', 'sine=f=440:d=3'] : [];
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=3`, ...a, '-shortest', '-pix_fmt', 'yuv420p', out]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  return out;
};

afterAll(() => rmSync(ws, { recursive: true, force: true }));

describe('montaje sin voz', () => {
  let dir = '';
  beforeAll(async () => {
    // Tres clips horizontales, uno sin audio: se unen en un master vertical.
    const inputs = [clip('a.mp4', 'red', true), clip('b.mp4', 'green', false), clip('c.mp4', 'blue', true)];
    ({ dir } = await E.createMontage({ inputs, name: 'Prueba', client: 'test' }));
    await E.prepareMedia(dir, () => {});
  }, 120_000);

  it('une los videos en vertical y detecta una toma por clip', async () => {
    const p = await E.readProject(dir);
    expect(p.kind).toBe('montaje');
    expect([p.source.width, p.source.height]).toEqual([1080, 1920]);
    expect(p.source.duration).toBeCloseTo(9, 0);
    expect(p.audio.processedVoice).toBeUndefined();
    const shots = await E.detectShots(dir);
    expect(shots).toHaveLength(3);
    expect(shots.map((s) => s.file)).toEqual(['a.mp4', 'b.mp4', 'c.mp4']);
  });

  it('reparte cortes entre las tomas sin salirse de ellas', async () => {
    const shots = await E.detectShots(dir);
    const m = await E.buildMontage(dir, { duration: 4.8, clipLength: 0.8 });
    expect(m.project.scenes).toHaveLength(6);
    for (const s of m.project.scenes) {
      const r = s.ranges[0];
      expect(r.end - r.start).toBeCloseTo(0.8, 1);
      expect(shots.some((t) => r.start >= t.start - 0.01 && r.end <= t.end + 0.01)).toBe(true);
    }
    // Cada toma aporta dos cortes.
    expect(shots.map((t) => m.project.scenes.filter((s) => s.ranges[0].start >= t.start && s.ranges[0].end <= t.end + 0.01).length)).toEqual([2, 2, 2]);
  });

  it('respeta las tomas elegidas a mano y su orden', async () => {
    const m = await E.buildMontage(dir, { picks: [{ toma: 't03', duracion: 1 }, { toma: 't01', inicio: 0, duracion: 0.5 }] });
    expect(m.project.scenes.map((s) => s.title)).toEqual(['Toma 03', 'Toma 01']);
    expect(m.project.scenes[1].ranges[0]).toMatchObject({ start: 0, end: 0.5 });
    await expect(E.buildMontage(dir, { picks: [{ toma: 't99' }] })).rejects.toThrow('No existe la toma t99');
  });

  it.skipIf(process.platform !== 'darwin' && process.platform !== 'win32')('pone voz en off, la subtitula y ajusta el sonido original', async () => {
    const p = await E.setVoiceover(dir, 'Esto es una prueba de voz en off.', { provider: 'sistema' });
    expect(p.audio.voiceover?.duration).toBeGreaterThan(1);
    expect(p.audio.originalVolume).toBeLessThanOrEqual(0.25);
    await E.buildMontage(dir, {});
    const project = await E.readProject(dir);
    const extras = await E.timelineExtras(dir, project, (r) => `/m/${r}`);
    expect(extras.voiceover?.words.length).toBeGreaterThan(3);
    const t = buildTimeline(project, null, { video: 'v', ...extras });
    expect(t.voiceoverSrc).toContain('voz-en-off.wav');
    expect(t.words.length).toBeGreaterThan(3);
    // El montaje cubre toda la voz.
    expect(t.durationInFrames / t.fps).toBeGreaterThanOrEqual(p.audio.voiceover!.duration - 0.05);
  }, 120_000);
});

describe('encuadre que sigue la cara', () => {
  const faces = [{ t: 1, x: 0.2, y: 0.3 }, { t: 2, x: 0.3, y: 0.3 }, { t: 10, x: 0.8, y: 0.5 }];

  it('usa la media de la cara en cada tramo y el centro si no hay cara', () => {
    expect(focusFor(faces, 1, 2, { x: 0.5, y: 0.5 }).x).toBeCloseTo(0.25);
    expect(focusFor(faces, 5, 6, { x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('cada clip lleva su encuadre, y el manual manda si se desactiva el automático', () => {
    const base = {
      version: 1, id: 'p', name: 'p', createdAt: '', updatedAt: '', format: { width: 1080, height: 1920, fps: 30 },
      pacing: getPreset('rapido').pacing, captions: getPreset('rapido').captions,
      scenes: [{ id: 's1', ranges: [{ start: 1, end: 2 }] }, { id: 's2', ranges: [{ start: 9.8, end: 10.5 }] }],
    };
    const src = { file: 'a.mp4', duration: 20, width: 1920, height: 1080, fps: 30 };
    const auto = buildTimeline(Project.parse({ ...base, source: src }), null, { video: 'v', faces });
    expect(auto.clips.map((c) => +c.focusX.toFixed(2))).toEqual([0.25, 0.8]);
    const manual = buildTimeline(Project.parse({ ...base, source: { ...src, autoFocus: false, focusX: 0.1 } }), null, { video: 'v', faces });
    expect(manual.clips.map((c) => c.focusX)).toEqual([0.1, 0.1]);
  });

  it('centra la cara en el recorte y no se sale del video', () => {
    const horizontal = { ...FORMATS['9:16'], sourceWidth: 1920, sourceHeight: 1080 };
    expect(coverPosition(horizontal, 0.5, 0.5).x).toBeCloseTo(0.5);
    expect(coverPosition(horizontal, 0.3, 0.5).x).toBeLessThan(0.3); // la cara a la izquierda: el recorte se va a la izquierda
    expect(coverPosition(horizontal, 0.02, 0.5).x).toBe(0);
    expect(coverPosition(horizontal, 0.99, 0.5).x).toBe(1);
    // Vertical a cuadrado: el recorte es vertical y sube hacia la cara.
    const vertical = { ...FORMATS['1:1'], sourceWidth: 1080, sourceHeight: 1920 };
    expect(coverPosition(vertical, 0.5, 0.3)).toMatchObject({ x: 0.5 });
    expect(coverPosition(vertical, 0.5, 0.3).y).toBeLessThan(0.3);
  });
});
