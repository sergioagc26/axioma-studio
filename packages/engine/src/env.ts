import { existsSync } from 'node:fs';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './paths.ts';

/** El archivo .env de la raíz. SE_ENV_FILE lo cambia (las pruebas usan uno temporal). */
const envFile = () => process.env.SE_ENV_FILE ?? path.join(REPO_ROOT, '.env');

/** Lee una clave de las variables de entorno o del archivo .env de la raíz. */
export async function envValue(name: string): Promise<string | undefined> {
  if (process.env[name]) return process.env[name];
  const file = envFile();
  if (!existsSync(file)) return undefined;
  const m = (await readFile(file, 'utf8')).match(new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
}

/** Claves que la app deja guardar desde su pantalla. Las META_* son los datos de la app de Meta (Instagram). */
export const KEY_NAMES = ['PEXELS_API_KEY', 'PIXABAY_API_KEY', 'FREESOUND_API_KEY', 'ELEVENLABS_API_KEY', 'HEYGEN_API_KEY', 'META_APP_ID', 'META_APP_SECRET', 'META_USER_TOKEN', 'META_CONFIG_ID', 'META_API_VERSION'] as const;
/** Claves por cuenta conectada: el token de cada cuenta de Instagram (IG_TOKEN_<id de la cuenta>). */
export const ACCOUNT_KEY = /^IG_TOKEN_[A-Z0-9]{4,40}$/;

const allowed = (name: string) => (KEY_NAMES as readonly string[]).includes(name) || ACCOUNT_KEY.test(name);

/** Solo el dueño puede leer el .env (`mode` de writeFile solo vale al crearlo). En Windows o discos sin permisos no hace nada. */
async function onlyOwner(file: string) {
  await chmod(file, 0o600).catch(() => {});
}

// Las escrituras van en fila: dos guardados seguidos no se pisan.
let queue: Promise<unknown> = Promise.resolve();
function inLine<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

/** Guarda una clave en el archivo .env de la raíz (que no se sube a git). Nunca se devuelve su valor. */
export async function setEnvValue(name: string, value: string): Promise<void> {
  if (!allowed(name)) throw new Error('Esa clave no se puede guardar desde aquí.');
  const clean = value.trim().replace(/[\r\n"']/g, '');
  if (name === 'META_API_VERSION' ? !/^v\d{1,3}\.\d{1,2}$/.test(clean) : clean.length < 8) throw new Error('La clave parece incompleta.');
  await inLine(async () => {
    const file = envFile();
    const text = existsSync(file) ? await readFile(file, 'utf8') : '';
    const line = `${name}=${clean}`;
    const re = new RegExp(`^${name}\\s*=.*$`, 'm');
    // Con función: un «$» dentro de la clave no se interpreta como parte del reemplazo.
    await writeFile(file, re.test(text) ? text.replace(re, () => line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`, { mode: 0o600 });
    await onlyOwner(file);
    delete process.env[name];
  });
}

/** Borra una clave del archivo .env (al desconectar una cuenta). Las demás líneas no se tocan. */
export async function removeEnvValue(name: string): Promise<void> {
  if (!allowed(name)) throw new Error('Esa clave no se puede borrar desde aquí.');
  await inLine(async () => {
    const file = envFile();
    if (existsSync(file)) {
      await writeFile(file, (await readFile(file, 'utf8')).replace(new RegExp(`^${name}\\s*=.*(\\r?\\n|$)`, 'm'), ''));
      await onlyOwner(file);
    }
    delete process.env[name];
  });
}

/** Qué claves están puestas (solo sí o no). */
export async function keyStatus(): Promise<Record<string, boolean>> {
  return {
    pexels: Boolean(await envValue('PEXELS_API_KEY')), pixabay: Boolean(await envValue('PIXABAY_API_KEY')), freesound: Boolean(await envValue('FREESOUND_API_KEY')), elevenlabs: Boolean(await envValue('ELEVENLABS_API_KEY')), heygen: Boolean(await envValue('HEYGEN_API_KEY')),
    meta: Boolean((await envValue('META_APP_ID')) && (await envValue('META_APP_SECRET'))),
  };
}
