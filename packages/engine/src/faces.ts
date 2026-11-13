import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { FacePoint } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { P } from './paths.ts';

const require = createRequire(import.meta.url);
const W = 180;
const FPS = 2;

export interface FaceBox { x: number; y: number; w: number; h: number; score: number }
const detectors = new Map<string, Promise<(rgb: Uint8Array, w: number, h: number) => Promise<FaceBox[]>>>();

/** Carga el detector una vez (TensorFlow en WebAssembly: funciona igual en Mac y Windows). */
/** `inputSize` mayor y `threshold` menor encuentran caras más pequeñas u oscuras (más lento). */
export function getDetector(inputSize = 320, threshold = 0.4) {
  const key = `${inputSize}:${threshold}`;
  if (!detectors.has(key)) detectors.set(key, (async () => {
    const tf = require('@tensorflow/tfjs');
    const wasm = require('@tensorflow/tfjs-backend-wasm');
    const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
    wasm.setWasmPaths(path.join(path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json')), 'dist') + path.sep);
    await tf.setBackend('wasm');
    await tf.ready();
    await faceapi.nets.tinyFaceDetector.loadFromDisk(path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model'));
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: threshold });
    // Todas las caras del fotograma, en proporción (0–1) del cuadro.
    return async (rgb: Uint8Array, w: number, h: number) => {
      const t = tf.tensor3d(rgb, [h, w, 3]);
      try {
        const found: { score: number; box: { x: number; y: number; width: number; height: number } }[] = await faceapi.detectAllFaces(t, options);
        return found.map((f) => ({ x: f.box.x / w, y: f.box.y / h, w: f.box.width / w, h: f.box.height / h, score: f.score }));
      } finally {
        t.dispose();
      }
    };
  })());
  return detectors.get(key)!;
}

/**
 * Busca la cara en el master (2 fotogramas por segundo) y guarda su posición
 * para que el recorte la siga. Los saltos aislados se suavizan con una mediana.
 */
export async function analyzeFaces(dir: string, sourceWidth: number, sourceHeight: number): Promise<FacePoint[]> {
  const out = path.join(dir, P.faces);
  if (existsSync(out)) return JSON.parse(await readFile(out, 'utf8'));
  const h = Math.max(2, Math.round((W * sourceHeight) / sourceWidth / 2) * 2);
  const raw = path.join(dir, 'proxies', 'caras.raw');
  await ffmpeg(['-i', path.join(dir, P.proxy), '-an', '-vf', `fps=${FPS},scale=${W}:${h}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', raw]);
  const buf = await readFile(raw);
  await rm(raw, { force: true });
  const size = W * h * 3;
  const detect = await getDetector();
  const pts: FacePoint[] = [];
  for (let i = 0; (i + 1) * size <= buf.length; i++) {
    const b = (await detect(new Uint8Array(buf.buffer, buf.byteOffset + i * size, size), W, h)).sort((a, c) => c.w * c.h - a.w * a.h)[0]; // la cara más grande
    if (b) pts.push({ t: i / FPS, x: b.x + b.w / 2, y: b.y + b.h / 2 });
  }
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const smooth = pts.map((p, i) => {
    const near = pts.slice(Math.max(0, i - 2), i + 3).filter((q) => Math.abs(q.t - p.t) <= 1.5);
    return { t: p.t, x: +med(near.map((q) => q.x)).toFixed(3), y: +med(near.map((q) => q.y)).toFixed(3) };
  });
  await writeFile(out, JSON.stringify(smooth));
  return smooth;
}

export async function readFaces(dir: string): Promise<FacePoint[]> {
  const f = path.join(dir, P.faces);
  return existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : [];
}
