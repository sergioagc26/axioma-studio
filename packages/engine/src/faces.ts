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

let detector: Promise<(rgb: Uint8Array, h: number) => Promise<{ x: number; y: number } | null>> | null = null;

/** Carga el detector una vez (TensorFlow en WebAssembly: funciona igual en Mac y Windows). */
function getDetector() {
  detector ??= (async () => {
    const tf = require('@tensorflow/tfjs');
    const wasm = require('@tensorflow/tfjs-backend-wasm');
    const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
    wasm.setWasmPaths(path.join(path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json')), 'dist') + path.sep);
    await tf.setBackend('wasm');
    await tf.ready();
    await faceapi.nets.tinyFaceDetector.loadFromDisk(path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model'));
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
    return async (rgb: Uint8Array, h: number) => {
      const t = tf.tensor3d(rgb, [h, W, 3]);
      try {
        const found: { box: { x: number; y: number; width: number; height: number; area: number } }[] = await faceapi.detectAllFaces(t, options);
        const b = found.sort((a, c) => c.box.area - a.box.area)[0]?.box; // la cara más grande
        return b ? { x: (b.x + b.width / 2) / W, y: (b.y + b.height / 2) / h } : null;
      } finally {
        t.dispose();
      }
    };
  })();
  return detector;
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
    const hit = await detect(new Uint8Array(buf.buffer, buf.byteOffset + i * size, size), h);
    if (hit) pts.push({ t: i / FPS, x: hit.x, y: hit.y });
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
