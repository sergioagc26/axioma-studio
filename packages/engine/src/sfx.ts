import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg } from './exec.ts';
import { REPO_ROOT } from './paths.ts';

/**
 * Efectos de sonido incluidos. Se sintetizan con FFmpeg (no son grabaciones de
 * nadie), así que no tienen problema de licencia.
 */
export const SFX: Record<string, { name: string; description: string; filter: string }> = {
  whoosh: { name: 'Barrido', description: 'Soplo rápido para transiciones.', filter: "anoisesrc=d=0.45:c=pink:a=0.8,highpass=f=500,lowpass=f=7000,afade=t=in:d=0.2:curve=qsin,afade=t=out:st=0.2:d=0.25" },
  pop: { name: 'Pop', description: 'Golpecito corto para cuando entra un texto.', filter: "aevalsrc='0.8*sin(2*PI*(900-3500*t)*t)*exp(-28*t)':d=0.14" },
  clic: { name: 'Clic', description: 'Clic seco para cortes o botones.', filter: "aevalsrc='0.9*(random(0)*2-1)*exp(-350*t)':d=0.04,highpass=f=1500" },
  ding: { name: 'Campanita', description: 'Tono brillante para un dato o un logro.', filter: "aevalsrc='0.45*(sin(2*PI*1320*t)+0.5*sin(2*PI*2640*t))*exp(-5*t)':d=1" },
  impacto: { name: 'Impacto', description: 'Golpe grave para un momento fuerte o un destello.', filter: "aevalsrc='0.9*sin(2*PI*(95-55*t)*t)*exp(-6*t)+0.25*(random(0)*2-1)*exp(-45*t)':d=0.8" },
  subida: { name: 'Subida', description: 'Tono que sube para crear expectativa antes de un cambio.', filter: "aevalsrc='0.35*sin(2*PI*(220+900*t*t)*t)*min(1\\,t/0.25)':d=1.1,afade=t=out:st=0.95:d=0.15" },
};

const cacheDir = path.join(REPO_ROOT, '.sfx');

/** Genera (una sola vez) el archivo de un efecto incluido y devuelve su ruta. */
export async function sfxFile(id: string): Promise<string> {
  const def = SFX[id];
  if (!def) throw new Error(`No existe el efecto "${id}". Disponibles: ${Object.keys(SFX).join(', ')}.`);
  const out = path.join(cacheDir, `${id}.wav`);
  if (!existsSync(out)) {
    await mkdir(cacheDir, { recursive: true });
    await ffmpeg(['-f', 'lavfi', '-i', def.filter, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out]);
  }
  return out;
}

/** Deja en el proyecto (media/sfx) los efectos indicados, para que el render los encuentre. */
export async function ensureProjectSfx(dir: string, ids: string[]) {
  await mkdir(path.join(dir, 'media', 'sfx'), { recursive: true });
  for (const id of new Set(ids)) {
    const dest = path.join(dir, 'media', 'sfx', `${id}.wav`);
    if (!existsSync(dest)) await copyFile(await sfxFile(id), dest);
  }
}

export function formatSfx(): string {
  return Object.entries(SFX).map(([id, d]) => `${id} · ${d.name}: ${d.description}`).join('\n');
}
