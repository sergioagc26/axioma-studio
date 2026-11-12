import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ffmpeg } from './exec.ts';
import { makeProxy } from './media.ts';
import { P } from './paths.ts';
import { readProject, writeProject } from './store.ts';

type RGB = [number, number, number];
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const luma = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const sat = (c: RGB, s: number): RGB => { const l = luma(c); return c.map((v) => clamp(l + (v - l) * s)) as RGB; };
const contrast = (c: RGB, k: number): RGB => c.map((v) => clamp(0.5 + (v - 0.5) * k)) as RGB;

/** LUTs incluidos: looks de color de cine hechos aquí mismo (sin descargar nada). */
export const BUILTIN_LUTS: Record<string, { name: string; description: string; fn: (c: RGB) => RGB }> = {
  'teal-orange': {
    name: 'Teal & Orange',
    description: 'El look de las películas de acción: sombras verde azulado y piel cálida.',
    fn: (c) => {
      const l = luma(c);
      const t: RGB = [c[0] - 0.09 * (1 - l) + 0.1 * l, c[1] + 0.03 * (1 - l) + 0.025 * l, c[2] + 0.1 * (1 - l) - 0.09 * l];
      return sat(contrast(t.map(clamp) as RGB, 1.08), 1.12);
    },
  },
  calido: {
    name: 'Película cálida',
    description: 'Tonos dorados y negros suaves, como película de 35 mm.',
    fn: (c) => {
      const t: RGB = [c[0] * 0.96 + 0.045, c[1] * 0.94 + 0.03, c[2] * 0.86 + 0.035];
      return sat(contrast(t.map(clamp) as RGB, 0.96), 0.95);
    },
  },
  moderno: {
    name: 'Moderno apagado',
    description: 'Colores bajos y sombras frías: el look limpio de las marcas de moda.',
    fn: (c) => {
      const l = luma(c);
      const t: RGB = [c[0] + 0.01 * l, c[1] + 0.01, c[2] + 0.04 * (1 - l)];
      return contrast(sat(t.map(clamp) as RGB, 0.72), 1.04).map((v) => clamp(v * 0.94 + 0.04)) as RGB;
    },
  },
  noche: {
    name: 'Noche azul',
    description: 'Frío y contrastado, para videos nocturnos o de tecnología.',
    fn: (c) => {
      const t: RGB = [c[0] * 0.9, c[1] * 0.97 + 0.01, c[2] * 1.06 + 0.04];
      return sat(contrast(t.map(clamp) as RGB, 1.15), 0.9);
    },
  },
  vivo: {
    name: 'Vivo para redes',
    description: 'Más color y contraste sin que la piel se vea naranja.',
    fn: (c) => {
      const l = luma(c);
      const s = 1.3 - 0.25 * Math.abs(c[0] - c[1] - 0.1); // protege la piel
      return sat(contrast(c, 1.1), s).map((v) => clamp(v + 0.02 * (l - 0.5))) as RGB;
    },
  },
  'bn-cine': {
    name: 'Blanco y negro de cine',
    description: 'Blanco y negro con contraste profundo.',
    fn: (c) => { const l = clamp(0.5 + (luma(c) - 0.5) * 1.25); return [l, l, l]; },
  },
};

/** Escribe un LUT 3D en formato .cube (rojo varía más rápido, como dicta el estándar). */
export function cubeText(fn: (c: RGB) => RGB, size = 25, title = 'Axioma Studio') {
  const lines = [`TITLE "${title}"`, `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const o = fn([r / (size - 1), g / (size - 1), b / (size - 1)]);
    lines.push(o.map((v) => clamp(v).toFixed(6)).join(' '));
  }
  return lines.join('\n') + '\n';
}

/** Comprueba que un archivo es un LUT 3D .cube válido. Devuelve su tamaño. */
export function checkCube(text: string): number {
  const size = Number(text.match(/^\s*LUT_3D_SIZE\s+(\d+)/m)?.[1]);
  if (!size || size < 2 || size > 128) throw new Error('El archivo no es un LUT 3D (.cube). Falta LUT_3D_SIZE.');
  const rows = text.split(/\r?\n/).filter((l) => /^\s*-?[\d.]+(e-?\d+)?\s+-?[\d.]+(e-?\d+)?\s+-?[\d.]+(e-?\d+)?\s*$/i.test(l)).length;
  if (rows < size ** 3) throw new Error(`El LUT está incompleto: tiene ${rows} colores y debería tener ${size ** 3}.`);
  return size;
}

export const LUT_FILE = path.join('media', 'lut.cube');
export const MASTER_LUT = path.join('media', 'master-lut.mp4');
export const PROXY_LUT = path.join('proxies', 'proxy-lut.mp4');

/** Video que se usa en el render: el corregido con el LUT si lo hay. */
export function gradedMaster(dir: string, project: { finish: { lut?: unknown } }) {
  return project.finish.lut && existsSync(path.join(dir, MASTER_LUT)) ? MASTER_LUT : P.master;
}

/**
 * Aplica un LUT a todo el video (como en Resolve o Premiere): se graba una copia del master con
 * el color corregido, mezclada con el original según la fuerza. Los textos, subtítulos y gráficos
 * no se tiñen porque van encima. Acepta un LUT incluido o un .cube propio.
 */
export async function applyLut(dir: string, opts: { builtin?: string; file?: string; name?: string; strength?: number }, onProgress?: (msg: string) => void) {
  const project = await readProject(dir);
  const strength = Math.max(0.1, Math.min(1, opts.strength ?? 0.8));
  let name: string;
  await mkdir(path.join(dir, 'media'), { recursive: true });
  if (opts.file) {
    const text = await readFile(opts.file, 'utf8');
    checkCube(text);
    await copyFile(opts.file, path.join(dir, LUT_FILE));
    name = (opts.name ?? path.basename(opts.file)).replace(/\.cube$/i, '');
  } else if (opts.builtin && opts.builtin === project.finish.lut?.builtin && existsSync(path.join(dir, LUT_FILE))) {
    name = BUILTIN_LUTS[opts.builtin].name; // misma LUT, solo cambia la fuerza
  } else if (opts.builtin && BUILTIN_LUTS[opts.builtin]) {
    const b = BUILTIN_LUTS[opts.builtin];
    await writeFile(path.join(dir, LUT_FILE), cubeText(b.fn, 25, b.name));
    name = b.name;
  } else if (project.finish.lut && existsSync(path.join(dir, LUT_FILE))) {
    name = project.finish.lut.name; // cambiar solo la fuerza del LUT propio
  } else throw new Error('Elige un LUT incluido o sube un archivo .cube.');

  // FFmpeg no se lleva bien con espacios en la ruta del LUT: se usa una copia temporal.
  const tmp = path.join(os.tmpdir(), `axioma-lut-${Date.now()}.cube`);
  await copyFile(path.join(dir, LUT_FILE), tmp);
  try {
    onProgress?.('Aplicando el color a todo el video…');
    const vf = strength >= 0.99
      ? `lut3d=file=${tmp}:interp=tetrahedral,format=yuv420p`
      : `split[a][b];[b]lut3d=file=${tmp}:interp=tetrahedral[l];[a][l]blend=all_mode=normal:all_opacity=${strength.toFixed(2)},format=yuv420p`;
    const out = path.join(dir, MASTER_LUT);
    await ffmpeg(['-i', path.join(dir, P.master), '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-g', String(Math.round(project.format.fps)), '-c:a', 'copy', '-movflags', '+faststart', out]);
    onProgress?.('Preparando la vista previa…');
    await makeProxy(out, path.join(dir, PROXY_LUT));
  } finally {
    await rm(tmp, { force: true });
  }
  const fresh = await readProject(dir);
  fresh.finish.lut = { name, strength, builtin: opts.file ? undefined : (opts.builtin ?? fresh.finish.lut?.builtin) };
  return writeProject(dir, fresh);
}

/** Quita el LUT: el reel vuelve al color original. */
export async function removeLut(dir: string) {
  const project = await readProject(dir);
  project.finish.lut = undefined;
  for (const f of [MASTER_LUT, PROXY_LUT]) await rm(path.join(dir, f), { force: true });
  return writeProject(dir, project);
}
