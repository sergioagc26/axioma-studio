// Comprueba el MP4 final contra src/timeline.ts: resolución, fps, cuadros, audio, volumen y peso.
// Uso: npx tsx scripts/verificar.mjs Renders/promo.mp4
import {spawnSync} from 'node:child_process';

const file = process.argv[2] ?? 'Renders/promo.mp4';
const {FPS, HEIGHT, TOTAL, WIDTH} = await import('../src/timeline.ts');
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`${cmd} falló: ${r.stderr ?? r.error}`);
  return r;
};
const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).stdout);
const v = info.streams.find((s) => s.codec_type === 'video');
const a = info.streams.find((s) => s.codec_type === 'audio');
const meter = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr;
const last = (re) => Number([...meter.matchAll(re)].at(-1)?.[1]);
const lufs = a ? last(/I:\s+(-?[\d.]+) LUFS/g) : NaN;
const peak = a ? last(/Peak:\s+(-?[\d.]+) dBFS/g) : NaN;
const checks = [
  ['resolución', `${v.width}x${v.height}`, v.width === WIDTH && v.height === HEIGHT],
  ['fps', v.r_frame_rate, v.r_frame_rate === `${FPS}/1`],
  ['cuadros', v.nb_frames, Number(v.nb_frames) === TOTAL],
  ['duración', `${Number(info.format.duration).toFixed(2)} s`, Math.abs(info.format.duration - TOTAL / FPS) < 0.1],
  ['audio', a ? `${a.codec_name} ${a.sample_rate} Hz` : 'NO HAY', Boolean(a)],
  ['volumen', `${lufs} LUFS`, lufs >= -17 && lufs <= -13],
  ['pico', `${peak} dBFS`, peak <= -1],
  ['peso', `${(info.format.size / 1e6).toFixed(1)} MB`, true],
];
for (const [name, value, ok] of checks) console.log(`${ok ? 'OK  ' : 'MAL '} ${name}: ${value}`);
process.exit(checks.every((c) => c[2]) ? 0 : 1);
