import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
