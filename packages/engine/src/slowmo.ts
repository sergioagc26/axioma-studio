import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { effectiveRanges } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import { P } from './paths.ts';
import { readProject, writeProject } from './store.ts';

/**
 * Cámara lenta suave: en vez de repetir fotogramas (se ve a saltos), se crean los intermedios
 * siguiendo el movimiento de cada zona de la imagen (interpolación por compensación de
 * movimiento de FFmpeg). Todo en este computador; tarda unos segundos por cada segundo de video.
 */

export const SPEEDS = [1, 0.5, 0.33, 0.25] as const;
const DIR = path.join('media', 'lento');

/** Filtro de FFmpeg que crea los fotogramas intermedios y estira el tiempo. */
export function slowFilter(fps: number, speed: number, width: number) {
  const target = Math.round((fps / speed) * 1000) / 1000;
  // Se interpola a un tamaño de trabajo (máx. 1080 de ancho) para no tardar de más.
  const scale = width > 1080 ? 'scale=1080:-2,' : '';
  return `${scale}minterpolate=fps=${target}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=PTS/${speed},fps=${fps}`;
}

/** Pone una escena en cámara lenta (1 = normal) y prepara sus tramos interpolados. */
export async function setSlowMotion(dir: string, sceneId: string, speed: number, onProgress?: (msg: string, p?: number) => void) {
  const project = await readProject(dir);
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`No existe la escena ${sceneId}.`);
  const sp = Math.min(1, Math.max(0.2, speed));
  // Los archivos de antes NO se borran: así «Deshacer» vuelve a una cámara lenta que se sigue viendo
  // (cada archivo lleva en el nombre su tramo y su velocidad, y se reutiliza si ya existe).
  const old = scene.slowFiles ?? [];
  if (sp >= 1) {
    scene.speed = 1;
    scene.slowFiles = undefined;
    return writeProject(dir, project);
  }
  const fps = project.format.fps;
  const ranges = effectiveRanges(scene, project.source.duration).filter((r) => r.end - r.start > 0.05);
  const total = ranges.reduce((a, r) => a + r.end - r.start, 0);
  await mkdir(path.join(dir, DIR), { recursive: true });
  const files: NonNullable<typeof scene.slowFiles> = [];
  let done = 0;
  for (const r of ranges) {
    const reuse = old.find((f) => Math.abs(f.start - r.start) < 0.02 && Math.abs(f.end - r.end) < 0.02 && Math.abs(f.speed - sp) < 0.001 && existsSync(path.join(dir, f.file)));
    if (reuse) { files.push(reuse); done += r.end - r.start; continue; }
    const rel = path.join(DIR, `${scene.id}-${Math.round(r.start * 1000)}-${Math.round(sp * 100)}.mp4`).split(path.sep).join('/');
    if (existsSync(path.join(dir, rel))) { files.push({ start: r.start, end: r.end, speed: sp, file: rel }); done += r.end - r.start; continue; }
    onProgress?.(`Creando los fotogramas intermedios… ${Math.round((done / total) * 100)} %`, done / total);
    // -ss y -t antes de -i: limitan lo que se LEE (en la salida dura el doble o más).
    await ffmpeg([
      '-ss', r.start.toFixed(3), '-t', (r.end - r.start).toFixed(3), '-i', path.join(dir, P.master),
      '-an', '-vf', slowFilter(fps, sp, project.source.width),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(dir, rel),
    ]);
    files.push({ start: r.start, end: r.end, speed: sp, file: rel });
    done += r.end - r.start;
  }
  const fresh = await readProject(dir);
  const sc = fresh.scenes.find((s) => s.id === sceneId)!;
  sc.speed = sp;
  sc.slowFiles = files;
  return writeProject(dir, fresh);
}
