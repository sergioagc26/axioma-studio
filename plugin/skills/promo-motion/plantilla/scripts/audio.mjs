// Banda sonora base 100 % por código (sin muestras). CAMBIAR género, tempo e instrumentos en cada video.
// Sigue src/timeline.ts. Salida: public/audio/{music,sfx,mix}.wav (48 kHz estéreo, 16 bits).
// Uso: npx tsx scripts/audio.mjs
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const {BPM, CUES, FPS, TOTAL} = await import('../src/timeline.ts');
const SR = 48000;
const TAU = Math.PI * 2;
const SEC = TOTAL / FPS;
const N = Math.round(SEC * SR);
const BEAT = 60 / BPM;
const TARGET_LUFS = -15;
const CEILING = 10 ** (-2 / 20); // deja margen: el AAC sube el pico

let seed = 7;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 4294967296) * 2 - 1;
};
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const gen = (len, fn) => Float32Array.from({length: Math.ceil(len * SR)}, (_, i) => fn(i / SR));
const stem = () => new Float32Array(N);
const add = (buf, at, samples, gain = 1) => {
  const s0 = Math.round(at * SR);
  for (let i = 0; i < samples.length && s0 + i < N; i++) if (s0 + i >= 0) buf[s0 + i] += samples[i] * gain;
};
const decay = (t, d) => Math.min(1, t / 0.004) * Math.exp(-t / d);

// ---------- Instrumentos ----------
const sweep = (len, from, to, speed, d) => {
  let ph = 0;
  return gen(len, (t) => {
    ph += (TAU * (to + (from - to) * Math.exp(-t * speed))) / SR;
    return Math.sin(ph) * decay(t, d);
  });
};
const kick = () => sweep(0.4, 160, 48, 30, 0.12);
const hat = () => {
  let prev = 0;
  return gen(0.06, (t) => {
    const x = noise();
    const hp = x - prev;
    prev = x;
    return hp * 0.5 * decay(t, 0.012);
  });
};
const clap = () => {
  let low = 0;
  return gen(0.22, (t) => {
    const x = noise();
    low += 0.25 * (x - low);
    return (x - low) * decay(t, 0.05);
  });
};
const tone = (note, len, d, harm = 0.25) => {
  const f = midi(note);
  return gen(len, (t) => (Math.sin(TAU * f * t) + harm * Math.sin(TAU * f * 2 * t)) * decay(t, d) * Math.min(1, (len - t) / 0.02));
};
const whoosh = () => {
  let low = 0;
  return gen(0.45, (t) => {
    low += (0.02 + 0.3 * Math.sin((Math.PI * t) / 0.45) ** 2) * (noise() - low);
    return low * Math.sin((Math.PI * t) / 0.45) ** 2;
  });
};
const SFX = {
  whoosh: () => whoosh(),
  pop: () => sweep(0.18, 900, 420, 40, 0.04),
  ding: () => tone(84, 0.9, 0.25, 0.4),
  impact: () => sweep(0.7, 220, 40, 18, 0.22),
};

// ---------- Música: La menor, i-VI-III-VII ----------
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const music = stem();
for (let b = 0; b * BEAT < SEC; b++) {
  const t = b * BEAT;
  const chord = CHORDS[Math.floor(b / 4) % CHORDS.length];
  add(music, t, kick(), 0.75);
  if (b % 2 === 1) add(music, t, clap(), 0.35);
  add(music, t + BEAT / 2, hat(), 0.3);
  add(music, t + BEAT / 2, tone(chord[0] - 24, BEAT / 2, 0.18), 0.4);
  if (b % 4 === 0) for (const n of chord) add(music, t, tone(n, BEAT * 4, 1.4, 0.1), 0.09);
  for (let s = 0; s < 2; s++) add(music, t + (s * BEAT) / 2, tone(chord[(b + s) % 3] + 12, BEAT / 2, 0.09), 0.1);
}
const sfx = stem();
for (const c of CUES) add(sfx, c.f / FPS, SFX[c.k](), 0.7);

// fade final de la música
const fade = Math.round(0.8 * SR);
for (let i = 0; i < fade; i++) music[N - 1 - i] *= i / fade;

// ---------- Salida ----------
const out = join(root, 'public', 'audio');
mkdirSync(out, {recursive: true});
const wav = (name, x) => {
  const b = Buffer.alloc(44 + N * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + N * 4, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    const v = Math.round(Math.max(-1, Math.min(1, x[i])) * 32767);
    b.writeInt16LE(v, 44 + i * 4);
    b.writeInt16LE(v, 46 + i * 4);
  }
  writeFileSync(join(out, name), b);
};
const lufs = (name) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', join(out, name), '-af', 'ebur128', '-f', 'null', '-'], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error('ffmpeg no está disponible o falló: ' + (r.stderr ?? r.error));
  return Number([...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)[1]);
};
const mix = Float32Array.from(music, (v, i) => v + sfx[i]);
const peak = mix.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
wav('mix.wav', mix.map((v) => (v / peak) * 0.5));
let gain = (0.5 / peak) * 10 ** ((TARGET_LUFS - lufs('mix.wav')) / 20);
// limitador suave: recorta con tanh solo por encima del 70 % del techo
const knee = CEILING * 0.7;
const limit = (v) => {
  const a = Math.abs(v);
  return a <= knee ? v : Math.sign(v) * (knee + (CEILING - knee) * Math.tanh((a - knee) / (CEILING - knee)));
};
for (let pass = 0; pass < 3; pass++) {
  wav('mix.wav', mix.map((v) => limit(v * gain)));
  gain *= 10 ** ((TARGET_LUFS - lufs('mix.wav')) / 20);
}
wav('music.wav', music.map((v) => v * gain));
wav('sfx.wav', sfx.map((v) => v * gain));
console.log(`public/audio/mix.wav · ${SEC} s · ${lufs('mix.wav')} LUFS`);
