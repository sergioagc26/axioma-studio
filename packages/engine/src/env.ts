import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './paths.ts';

/** Lee una clave de las variables de entorno o del archivo .env de la raíz. */
export async function envValue(name: string): Promise<string | undefined> {
  if (process.env[name]) return process.env[name];
  const file = path.join(REPO_ROOT, '.env');
  if (!existsSync(file)) return undefined;
  const m = (await readFile(file, 'utf8')).match(new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

/** Claves que la app deja guardar desde su pantalla. */
export const KEY_NAMES = ['PEXELS_API_KEY', 'FREESOUND_API_KEY'] as const;

/** Guarda una clave en el archivo .env de la raíz (que no se sube a git). Nunca se devuelve su valor. */
export async function setEnvValue(name: string, value: string): Promise<void> {
  if (!(KEY_NAMES as readonly string[]).includes(name)) throw new Error('Esa clave no se puede guardar desde aquí.');
  const clean = value.trim().replace(/[\r\n"']/g, '');
  if (clean.length < 8) throw new Error('La clave parece incompleta.');
  const file = path.join(REPO_ROOT, '.env');
  const text = existsSync(file) ? await readFile(file, 'utf8') : '';
  const line = `${name}=${clean}`;
  const re = new RegExp(`^${name}\\s*=.*$`, 'm');
  await writeFile(file, re.test(text) ? text.replace(re, line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`);
  delete process.env[name];
}

/** Qué claves están puestas (solo sí o no). */
export async function keyStatus(): Promise<Record<string, boolean>> {
  return { pexels: Boolean(await envValue('PEXELS_API_KEY')), freesound: Boolean(await envValue('FREESOUND_API_KEY')) };
}
