// Identidad sonora «bodega house»: 120 BPM, bombo a negras, bajo funk, y el «bip» del escáner en cada paso.
// Todo sintetizado aquí; no se descarga nada. Salida: public/pista.wav (40 s, 44,1 kHz, estéreo).
import { writeFileSync } from 'node:fs';
const SR = 44100, DUR = 40, N = SR * DUR, BEAT = 0.5;
const L = new Float32Array(N), R = new Float32Array(N);
const add = (t, len, fn, vol = 1, pan = 0) => { const s = Math.round(t * SR), n = Math.round(len * SR); for (let i = 0; i < n && s + i < N; i++) { if (s + i < 0) continue; const v = fn(i / SR, i / n) * vol; L[s + i] += v * (1 - Math.max(0, pan)); R[s + i] += v * (1 + Math.min(0, pan)); } };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const kick = (t) => add(t, 0.32, (x) => Math.sin(2 * Math.PI * (48 * x + 9 * (1 - Math.exp(-x * 38)))) * Math.exp(-x * 9), 0.9);
const hat = (t, v = 0.12) => { let p = 0; add(t, 0.05, (x) => { const n = rnd(); const h = n - p; p = n; return h * Math.exp(-x * 90); }, v, 0.3); };
const clap = (t) => { let lp = 0; add(t, 0.18, (x) => { lp += 0.5 * (rnd() - lp); const e = Math.exp(-x * 28) + 0.6 * Math.exp(-Math.abs(x - 0.012) * 400) + 0.5 * Math.exp(-Math.abs(x - 0.024) * 400); return lp * e; }, 0.34, -0.2); };
const bass = (t, f, len = 0.22) => { let lp = 0; add(t, len, (x, k) => { const ph = (x * f) % 1; const saw = 2 * ph - 1; const cut = 0.05 + 0.25 * Math.exp(-x * 14); lp += cut * (saw - lp); return (lp + 0.4 * Math.sin(2 * Math.PI * f * x)) * Math.min(1, x * 300) * (1 - k) ** 0.6; }, 0.38); };
const stab = (t, fs) => fs.forEach((f, j) => add(t, 0.28, (x) => (Math.sin(2 * Math.PI * f * x) + 0.3 * Math.sin(4 * Math.PI * f * x)) * Math.exp(-x * 11) * Math.min(1, x * 200), 0.09, j % 2 ? 0.4 : -0.4));
const beep = (t, v = 0.3) => { add(t, 0.07, (x) => Math.sign(Math.sin(2 * Math.PI * 1960 * x)) * 0.5 * Math.min(1, x * 800) * Math.min(1, (0.07 - x) * 400), v * 0.5); add(t + 0.085, 0.11, (x) => Math.sign(Math.sin(2 * Math.PI * 2640 * x)) * 0.5 * Math.min(1, x * 800) * Math.min(1, (0.11 - x) * 300), v * 0.5); };
const whoosh = (t, len = 0.45) => { let lp = 0; add(t - len, len, (x, k) => { lp += (0.02 + 0.5 * k * k) * (rnd() - lp); return lp * k * k; }, 0.5, 0); };
const stamp = (t) => { add(t, 0.25, (x) => Math.sin(2 * Math.PI * (70 * x + 6 * (1 - Math.exp(-x * 50)))) * Math.exp(-x * 16), 0.8); let lp = 0; add(t, 0.09, (x) => { lp += 0.35 * (rnd() - lp); return lp * Math.exp(-x * 45); }, 0.5); };
const click = (t) => add(t, 0.02, (x) => Math.sin(2 * Math.PI * 3200 * x) * Math.exp(-x * 300), 0.25, 0.2);
const buzz = (t) => add(t, 0.3, (x) => Math.sign(Math.sin(2 * Math.PI * 110 * x)) * 0.3 * Math.exp(-x * 5) * (Math.sin(2 * Math.PI * 28 * x) > 0 ? 1 : 0.3), 0.3);

// Notas (La menor): A1 C2 D2 E2 G2
const A = 55, C = 65.41, D = 73.42, E = 82.41, G = 98;
const riff = [[0, A], [0.75, A * 2], [1.5, C], [2.25, A], [2.75, E], [3.5, G]]; // en tiempos, por compás
const scenes = [0, 4, 8, 12, 16, 20, 26, 30, 34, 36]; // segundos donde entra cada escena
for (let b = 0; b < 80; b++) {
  const t = b * BEAT, bar = Math.floor(b / 4);
  const intro = t < 4, outro = t >= 36, brk = t >= 26 && t < 30; // en «solo fotos reales» baja la batería
  if (!brk || b % 4 === 0) if (!outro || b % 2 === 0) kick(t);
  if (!intro && !brk && !outro) { hat(t + BEAT / 2); if (b % 2 === 1) clap(t); hat(t + BEAT * 0.75, 0.05); }
  if (intro) hat(t + BEAT / 2, 0.07);
  if (b % 4 === 0 && !outro) for (const [o, f] of riff) if (!intro || o < 2) bass(t + o * BEAT, bar % 4 === 3 ? f * (o > 2 ? 1.122 : 1) : f);
  if (b % 8 === 4 && !intro && !outro) stab(t + BEAT / 2, [220, 261.6, 329.6]);
}
for (const s of scenes.slice(1)) { whoosh(s); stamp(s); }
// Bips del escáner: uno por cada paso/elemento que aparece (alineados a tiempos)
[0.5, 4.5, 6, 6.5, 7, 8.5, 9.5, 12.5, 13, 16.5, 20.5, 21.5, 22.5, 23.5, 30.5, 34.5].forEach((t) => beep(t));
[7.5, 14, 24.5, 25, 37].forEach((t) => { click(t); stamp(t + 0.02); }); // botones que se presionan
[18, 18.25, 18.5, 18.75, 19, 19.25, 19.5, 19.75].forEach((t, i) => add(t, 0.05, (x) => Math.sin(2 * Math.PI * (700 + i * 90) * x) * Math.exp(-x * 60), 0.2)); // contador 1→10
stamp(26); stamp(26.5); buzz(32); // sello «solo fotos reales» y aviso de error
stab(36, [220, 277.2, 329.6, 440]); stab(36.02, [110, 164.8]); // golpe final (La mayor: resuelve)
beep(38, 0.25);
// Mezcla: limitador suave, fundido de entrada y de salida
const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { const t = i / SR; const g = Math.min(1, t / 0.02) * Math.min(1, Math.max(0, (DUR - t) / 2.5)); for (const [ch, o] of [[L, 0], [R, 2]]) out.writeInt16LE(Math.round(Math.tanh(ch[i] * 0.85) * g * 30000), 44 + i * 4 + o); }
writeFileSync(new URL('../public/pista.wav', import.meta.url), out);
console.log('pista.wav lista');
