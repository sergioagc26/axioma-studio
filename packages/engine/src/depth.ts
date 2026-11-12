import { existsSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './paths.ts';

const MODELS = path.resolve(process.env.SE_MODELS_DIR ?? path.join(REPO_ROOT, '.modelos'));
let estimator: Promise<(file: string) => Promise<{ depth: { save: (out: string) => Promise<unknown> } }>> | null = null;

/** Modelo local de profundidad (Depth Anything V2 Small, Apache-2.0). La primera vez descarga ~26 MB a .modelos/. */
function getEstimator() {
  estimator ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = MODELS;
    return (await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'q8' })) as never;
  })();
  return estimator;
}

/** Ruta del mapa de profundidad de una imagen del proyecto (junto a ella). */
export const depthPath = (rel: string) => rel.replace(/\.(jpe?g|png|webp)$/i, '.depth.png');

/**
 * Calcula (una vez) el mapa de profundidad de una imagen del proyecto: blanco = cerca,
 * negro = lejos. Sirve para la cámara 3D: lo cercano se mueve más que el fondo.
 * Devuelve la ruta relativa del mapa, o undefined si la imagen no sirve.
 */
export async function ensureDepth(dir: string, rel?: string): Promise<string | undefined> {
  if (!rel || !/\.(jpe?g|png|webp)$/i.test(rel) || /\.depth\.png$/i.test(rel)) return undefined;
  const out = depthPath(rel);
  if (existsSync(path.join(dir, out))) return out;
  try {
    const est = await getEstimator();
    const r = await est(path.join(dir, rel));
    await r.depth.save(path.join(dir, out));
    return out;
  } catch {
    return undefined; // sin profundidad la imagen se anima igual, con zoom plano
  }
}

/** Calcula la profundidad de todas las imágenes que usa el proyecto. */
export async function ensureProjectDepth(dir: string, project: { scenes: { brollFile?: string; backdropFile?: string }[] }) {
  for (const s of project.scenes) {
    await ensureDepth(dir, s.brollFile);
    await ensureDepth(dir, s.backdropFile);
  }
}
