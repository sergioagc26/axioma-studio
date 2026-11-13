import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { effectiveRanges } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { applyLut, cubeText } from './lut.ts';
import { probe } from './media.ts';
import { P } from './paths.ts';
import { readProject } from './store.ts';

/**
 * Igualar el color a una imagen de referencia (como "Match" de Resolve o "Color Match" de
 * Premiere): se miden los colores del reel y los de la imagen en el espacio Lab (luz, verde-rojo,
 * azul-amarillo) y se crea un LUT que lleva unos hacia los otros. Se aplica como cualquier LUT,
 * con su fuerza ajustable; los textos no cambian.
 */

type RGB = [number, number, number];
export interface LabStats { mean: RGB; std: RGB }

const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fi = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
const WHITE = [0.95047, 1, 1.08883];

export function rgbToLab([r, g, b]: RGB): RGB {
  const [R, G, B] = [toLin(r), toLin(g), toLin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / WHITE[0];
  const y = (0.2126 * R + 0.7152 * G + 0.0722 * B) / WHITE[1];
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / WHITE[2];
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function labToRgb([L, a, bb]: RGB): RGB {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - bb / 200;
  const x = fi(fx) * WHITE[0], y = fi(fy) * WHITE[1], z = fi(fz) * WHITE[2];
  const R = 3.2406 * x - 1.5372 * y - 0.4986 * z;
  const G = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  const B = 0.0557 * x - 0.204 * y + 1.057 * z;
  return [R, G, B].map((v) => Math.max(0, Math.min(1, toSrgb(Math.max(0, v))))) as RGB;
}

/** Media y desviación de los colores (en Lab) de píxeles RGB de 8 bits. Ignora el negro y el blanco puros. */
export function labStats(rgb: Uint8Array): LabStats {
  const sum: RGB = [0, 0, 0], sq: RGB = [0, 0, 0];
  let n = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const lum = rgb[i] + rgb[i + 1] + rgb[i + 2];
    if (lum < 12 || lum > 750) continue;
    const lab = rgbToLab([rgb[i] / 255, rgb[i + 1] / 255, rgb[i + 2] / 255]);
    for (let k = 0; k < 3; k++) { sum[k] += lab[k]; sq[k] += lab[k] ** 2; }
    n++;
  }
  if (!n) throw new Error('La imagen está vacía o es toda negra o blanca.');
  const mean = sum.map((s) => s / n) as RGB;
  const std = sq.map((s, k) => Math.sqrt(Math.max(0, s / n - mean[k] ** 2))) as RGB;
  return { mean, std };
}

/**
 * La transformación de color: cada canal Lab se recentra y se escala hacia la referencia.
 * Con límites, para que una referencia extrema (una foto en blanco y negro, un neón) no rompa la piel.
 */
export function colorTransfer(src: LabStats, ref: LabStats): (c: RGB) => RGB {
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  // Luz: se respeta más el contraste propio (la referencia puede ser una foto muy distinta).
  const scale = [clamp(ref.std[0] / Math.max(1, src.std[0]), 0.75, 1.35), clamp(ref.std[1] / Math.max(0.5, src.std[1]), 0.4, 1.8), clamp(ref.std[2] / Math.max(0.5, src.std[2]), 0.4, 1.8)];
  const shift = [clamp(ref.mean[0] - src.mean[0], -18, 18), clamp(ref.mean[1] - src.mean[1], -25, 25), clamp(ref.mean[2] - src.mean[2], -25, 25)];
  return (c) => {
    const lab = rgbToLab(c);
    const out = lab.map((v, k) => src.mean[k] + (v - src.mean[k]) * scale[k] + shift[k]) as RGB;
    out[0] = clamp(out[0], 0, 100);
    return labToRgb(out);
  };
}

const W = 96;

/** Píxeles de varios fotogramas del reel (lo que quedó en el corte, solo escenas con el video propio). */
async function reelPixels(dir: string, tmp: string): Promise<Uint8Array> {
  const project = await readProject(dir);
  const times = project.scenes.filter((s) => s.visual === 'original').flatMap((s) => effectiveRanges(s, project.source.duration).map((r) => (r.start + r.end) / 2));
  const picks = times.length ? times.filter((_, i) => i % Math.max(1, Math.floor(times.length / 10)) === 0).slice(0, 10) : [project.source.duration / 2];
  const parts: Buffer[] = [];
  for (const [i, t] of picks.entries()) {
    const out = path.join(tmp, `r${i}.raw`);
    await ffmpeg(['-ss', t.toFixed(2), '-i', path.join(dir, P.master), '-frames:v', '1', '-vf', `scale=${W}:-2`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', out]);
    parts.push(await readFile(out));
  }
  return new Uint8Array(Buffer.concat(parts));
}

/** Píxeles de la referencia: una imagen, o el fotograma del medio si es un video. */
async function refPixels(file: string, tmp: string): Promise<Uint8Array> {
  const out = path.join(tmp, 'ref.raw');
  const isVideo = /\.(mp4|mov|m4v|webm|mkv)$/i.test(file);
  const at = isVideo ? ['-ss', ((await probe(file)).duration / 2).toFixed(2)] : [];
  await ffmpeg([...at, '-i', file, '-frames:v', '1', '-vf', `scale=${W * 2}:-2`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', out]);
  return new Uint8Array(await readFile(out));
}

/** Iguala el color del reel a una imagen (o video) de referencia. */
export async function matchToReference(dir: string, refFile: string, opts: { name?: string; strength?: number; onProgress?: (m: string) => void } = {}) {
  const tmp = path.join(os.tmpdir(), `axioma-colorref-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  try {
    opts.onProgress?.('Midiendo los colores…');
    const src = labStats(await reelPixels(dir, tmp));
    const ref = labStats(await refPixels(refFile, tmp));
    const name = `Como «${(opts.name ?? path.basename(refFile)).replace(/\.[a-z0-9]+$/i, '').slice(0, 40)}»`;
    const cube = path.join(tmp, 'referencia.cube');
    await writeFile(cube, cubeText(colorTransfer(src, ref), 33, name));
    const project = await applyLut(dir, { file: cube, name, strength: opts.strength ?? 0.85 }, opts.onProgress);
    return { project, src, ref };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
