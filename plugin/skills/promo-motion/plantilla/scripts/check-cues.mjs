// Verifica que cada efecto suene en su cuadro: energía justo después del cue contra justo antes (stem de efectos).
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const {CUES, FPS} = await import('../src/timeline.ts');
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');
const b = readFileSync(join(dir, 'sfx.wav'));
const SR = 48000;
const n = (b.length - 44) / 4;
const rms = (a, c) => {
  let s = 0;
  let k = 0;
  for (let i = Math.max(0, a); i < Math.min(n, c); i++, k++) s += (b.readInt16LE(44 + i * 4) / 32768) ** 2;
  return Math.sqrt(s / Math.max(1, k));
};
let weak = 0;
for (const c of CUES) {
  const i = Math.round((c.f / FPS) * SR);
  const rise = 20 * Math.log10((rms(i, i + 0.08 * SR) + 1e-9) / (rms(i - 0.04 * SR, i) + 1e-9));
  if (rise < 4 && c.k !== 'whoosh') {
    weak++;
    console.log(`cue ${c.k} cuadro ${c.f}: salto ${rise.toFixed(1)} dB (débil)`);
  }
}
console.log(`${CUES.length} cues revisados · ${weak} débiles`);
process.exit(weak ? 1 : 0);
