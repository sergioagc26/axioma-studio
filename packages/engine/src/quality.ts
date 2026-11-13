import { existsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { applyLut, LUT_FILE } from './lut.ts';
import { makeMaster, makeProxy, probe } from './media.ts';
import { P } from './paths.ts';
import { readProject, writeProject } from './store.ts';

/** ¿Vale la pena mejorar la calidad? Solo en videos de menos de 1000 px por el lado corto. */
export const isLowRes = (s: { width: number; height: number }) => Math.min(s.width, s.height) < 1000;

/**
 * Rehace el master desde el video original con la cadena de calidad elegida (y la vista previa,
 * y el LUT si había). Los cortes, textos y todo lo demás no cambian.
 */
export async function setVideoQuality(dir: string, quality: 'normal' | 'nitido', onProgress?: (m: string) => void) {
  const project = await readProject(dir);
  const src = path.join(dir, project.source.file);
  if (!existsSync(src)) throw new Error('No encuentro el video original de este proyecto.');
  const info = await probe(src);
  onProgress?.('Rehaciendo el video con la nueva calidad…');
  const tmp = path.join(dir, 'media', 'master-nuevo.mp4');
  await makeMaster(src, tmp, project.format.fps, info, quality);
  await rename(tmp, path.join(dir, P.master));
  onProgress?.('Preparando la vista previa…');
  await rm(path.join(dir, P.proxy), { force: true });
  await makeProxy(path.join(dir, P.master), path.join(dir, P.proxy));
  const fresh = await readProject(dir);
  fresh.source.quality = quality;
  const saved = await writeProject(dir, fresh);
  // El LUT se graba sobre el master: se vuelve a aplicar con la misma fuerza.
  if (saved.finish.lut && existsSync(path.join(dir, LUT_FILE))) {
    onProgress?.('Volviendo a aplicar el color…');
    return applyLut(dir, { builtin: saved.finish.lut.builtin, strength: saved.finish.lut.strength }, onProgress);
  }
  return saved;
}
