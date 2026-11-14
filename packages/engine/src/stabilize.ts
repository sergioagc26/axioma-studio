import { existsSync } from 'node:fs';
import { copyFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg } from './exec.ts';
import { LUT_FILE, applyLut } from './lut.ts';
import { makeProxy, probe } from './media.ts';
import { P } from './paths.ts';
import { readProject, writeProject } from './store.ts';

/** Copia del video sin estabilizar (para poder deshacer). */
const BACKUP = path.join('media', 'master-sin-estabilizar.mp4');

export const isStabilized = (dir: string) => existsSync(path.join(dir, BACKUP));

/**
 * Estabiliza las tomas movidas (cámara en mano): suaviza los saltos de la imagen y recorta un poco
 * los bordes para que no se vea el movimiento de la corrección. Se guarda el original para
 * deshacerlo. Rehace la vista previa y, si había un color (LUT), lo vuelve a aplicar.
 */
export async function stabilize(dir: string, opts: { fuerza?: 'suave' | 'media' | 'fuerte'; onProgress?: (m: string) => void } = {}): Promise<void> {
  const say = opts.onProgress ?? (() => {});
  const master = path.join(dir, P.master);
  if (!existsSync(master)) throw new Error('Este proyecto no tiene el video de edición.');
  const original = isStabilized(dir) ? path.join(dir, BACKUP) : master;
  const info = await probe(original);
  const r = opts.fuerza === 'fuerte' ? 48 : opts.fuerza === 'suave' ? 16 : 32;
  // Cuanto más fuerte, más se recorta (para esconder los bordes que mueve la corrección).
  const keep = opts.fuerza === 'fuerte' ? 0.88 : opts.fuerza === 'suave' ? 0.95 : 0.92;
  const W = info.width, H = info.height;
  const tmp = path.join(dir, 'media', 'master-estable.tmp.mp4');
  say('Estabilizando las tomas (puede tardar varios minutos)…');
  await ffmpeg(['-i', original, '-vf', `deshake=rx=${r}:ry=${r}:edge=clamp,crop=trunc(iw*${keep}/2)*2:trunc(ih*${keep}/2)*2,scale=${W}:${H}:flags=lanczos,format=yuv420p`,
    '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-c:a', 'copy', '-movflags', '+faststart', tmp]);
  if (!isStabilized(dir)) await rename(master, path.join(dir, BACKUP));
  await rename(tmp, master);
  await afterMasterChange(dir, say);
}

/** Vuelve al video sin estabilizar. */
export async function unstabilize(dir: string, onProgress: (m: string) => void = () => {}): Promise<void> {
  if (!isStabilized(dir)) return;
  await rm(path.join(dir, P.master), { force: true });
  await rename(path.join(dir, BACKUP), path.join(dir, P.master));
  await afterMasterChange(dir, onProgress);
}

async function afterMasterChange(dir: string, say: (m: string) => void) {
  say('Rehaciendo la vista previa…');
  const proxy = path.join(dir, P.proxy);
  await rm(proxy, { force: true });
  await makeProxy(path.join(dir, P.master), proxy);
  // La capa de «comida por delante» se hizo con la imagen anterior: se rehará al exportar.
  await rm(path.join(dir, 'proxies', 'frente.json'), { force: true });
  const project = await readProject(dir);
  if (project.finish.lut) {
    say('Volviendo a aplicar el color…');
    const lut = project.finish.lut;
    if (lut.builtin) await applyLut(dir, { builtin: lut.builtin, strength: lut.strength });
    else if (existsSync(path.join(dir, LUT_FILE))) {
      // LUT propio: se copia aparte (applyLut lo vuelve a copiar a su sitio).
      const tmp = path.join(dir, 'media', 'lut-reaplicar.cube');
      await copyFile(path.join(dir, LUT_FILE), tmp);
      try { await applyLut(dir, { file: tmp, name: lut.name, strength: lut.strength }); } finally { await rm(tmp, { force: true }); }
    }
  }
  project.source.stabilized = isStabilized(dir) || undefined;
  await writeProject(dir, project);
}

