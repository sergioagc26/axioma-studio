import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VisionReport } from '@snz/schema';
import { VISION_TOPICS } from '@snz/schema';
import { ffmpeg } from './exec.ts';
import { P, REPO_ROOT } from './paths.ts';

const MODELS = path.resolve(process.env.SE_MODELS_DIR ?? path.join(REPO_ROOT, '.modelos'));
let classifier: Promise<(file: string, labels: string[]) => Promise<{ label: string; score: number }[]>> | null = null;

/** Modelo de visión CLIP, local. La primera vez descarga ~160 MB a .modelos/. */
function getClassifier() {
  classifier ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = MODELS;
    return (await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', { dtype: 'q8' })) as never;
  })();
  return classifier;
}

/**
 * Mira el video: clasifica varios fotogramas repartidos y dice de qué trata lo
 * que se VE (gente entrenando, comida, alguien hablando a cámara, una pantalla…).
 * Todo corre en este computador; el video no sale de aquí.
 */
export async function analyzeVision(dir: string, duration: number, log: (m: string) => void = () => {}): Promise<VisionReport> {
  const out = path.join(dir, P.vision);
  if (existsSync(out)) return JSON.parse(await readFile(out, 'utf8'));
  if (!existsSync(MODELS)) log('  descargando el modelo de visión (solo la primera vez, ~160 MB)…');
  const classify = await getClassifier();
  const tmp = path.join(dir, 'proxies', 'vision');
  await mkdir(tmp, { recursive: true });
  const labels = VISION_TOPICS.map((t) => t.prompt);
  const totals = new Map<string, number>();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const file = path.join(tmp, `${i}.jpg`);
    await ffmpeg(['-ss', (((i + 0.5) / n) * duration).toFixed(2), '-i', path.join(dir, P.proxy), '-frames:v', '1', '-vf', 'scale=-2:448', '-q:v', '4', file]);
    for (const r of await classify(file, labels)) totals.set(r.label, (totals.get(r.label) ?? 0) + r.score / n);
  }
  await rm(tmp, { recursive: true, force: true });
  const scores = VISION_TOPICS.map((t) => ({ id: t.id, label: t.label, score: +(totals.get(t.prompt) ?? 0).toFixed(3) })).sort((a, b) => b.score - a.score);
  const report: VisionReport = { topic: scores[0].score >= 0.3 ? scores[0].id : null, scores };
  await writeFile(out, JSON.stringify(report, null, 2));
  return report;
}

export async function readVision(dir: string): Promise<VisionReport | null> {
  const f = path.join(dir, P.vision);
  return existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : null;
}
