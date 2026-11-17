import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const ws = mkdtempSync(path.join(os.tmpdir(), 'axioma-sin-audio-'));
vi.stubEnv('SE_WORKSPACE', ws);
const { videoHasSpeech } = await import('../src/inbox.ts');
const { loudnormSecondPass, normalizeMix, processVoice } = await import('../src/media.ts');

const make = (name: string, args: string[]) => {
  const out = path.join(ws, name);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args, out]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  return out;
};
const input = ['-f', 'lavfi', '-i', 'testsrc2=s=320x568:r=30:d=2'];
const video = [...input, '-pix_fmt', 'yuv420p'];

afterAll(() => rmSync(ws, { recursive: true, force: true }));

describe('clips sin audio (pantalla, stock, generados)', () => {
  it('un video sin pista de audio es «sin voz», no «no sé»', async () => {
    expect(await videoHasSpeech(make('mudo.mp4', video))).toBe(false);
  });

  it('la segunda pasada de loudnorm se salta si el audio es silencio total', () => {
    const silence = '{\n"input_i" : "-inf",\n"input_tp" : "-inf",\n"input_lra" : "0.00",\n"input_thresh" : "-inf",\n"target_offset" : "inf"\n}';
    expect(loudnormSecondPass(silence, 'I=-14:TP=-1.5:LRA=11')).toBeNull();
    const voice = '{\n"input_i" : "-23.10",\n"input_tp" : "-4.20",\n"input_lra" : "5.10",\n"input_thresh" : "-33.40",\n"target_offset" : "0.30"\n}';
    expect(loudnormSecondPass(voice, 'I=-14:TP=-1.5:LRA=11')).toContain('measured_I=-23.10');
  });

  it('limpiar la voz y nivelar la mezcla no fallan con silencio total', async () => {
    const mute = make('silencio.mp4', [...input, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac']);
    const voice = path.join(ws, 'voz.wav');
    await processVoice(mute, voice, { denoise: true, targetLufs: -14 });
    expect(existsSync(voice)).toBe(true);
    const mix = path.join(ws, 'mezcla.mp4');
    await normalizeMix(mute, mix, -14);
    expect(existsSync(mix)).toBe(true);
  });
});
