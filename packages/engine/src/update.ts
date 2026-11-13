import { spawn } from 'node:child_process';
import { run } from './exec.ts';
import { REPO_ROOT } from './paths.ts';

/**
 * Actualizarse sola: la app se baja la última versión de su repositorio (git), instala lo que
 * haga falta, recompila la interfaz y se reinicia. Nunca pisa cambios hechos a mano: si los hay,
 * no actualiza y lo dice.
 */
export interface UpdateCheck { source: string | null; behind: number; changes: string[]; dirty: boolean; current: string; error?: string }

const git = (args: string[], _timeout?: number) => run('git', ['-C', REPO_ROOT, ...args]);

/** npm en Mac y Windows (en Windows npm es un .cmd y necesita la consola). */
function npmRun(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = process.platform === 'win32';
    const child = spawn(win ? 'npm.cmd' : 'npm', args, { cwd: REPO_ROOT, shell: win, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(e));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`npm ${args[0]} falló: ${err.slice(-500)}`))));
  });
}

export async function checkUpdate(): Promise<UpdateCheck> {
  const current = (await git(['log', '-1', '--format=%h · %cd', '--date=format:%d/%m/%Y']).catch(() => ({ stdout: '' }))).stdout.trim();
  const remote = (await git(['remote']).catch(() => ({ stdout: '' }))).stdout.split('\n').map((x) => x.trim()).filter(Boolean);
  const name = remote.includes('origin') ? 'origin' : remote[0];
  const dirty = Boolean((await git(['status', '--porcelain', '--untracked-files=no']).catch(() => ({ stdout: '' }))).stdout.trim());
  if (!name) return { source: null, behind: 0, changes: [], dirty, current, error: 'Esta copia de la app no está conectada a un repositorio, así que no tiene de dónde bajar versiones nuevas.' };
  const url = (await git(['remote', 'get-url', name])).stdout.trim().replace(/\/\/[^@/]+@/, '//');
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  try { await git(['fetch', '--quiet', name, branch], 90_000); } catch {
    return { source: url, behind: 0, changes: [], dirty, current, error: 'No se pudo revisar si hay versión nueva (¿hay internet?).' };
  }
  const log = (await git(['log', '--format=%s', `HEAD..${name}/${branch}`])).stdout.split('\n').map((x) => x.trim()).filter(Boolean);
  return { source: url, behind: log.length, changes: log.slice(0, 12), dirty, current };
}

/** Aplica la versión nueva. Devuelve qué hizo; `restart` indica que hay que reiniciar el studio. */
export async function applyUpdate(onProgress: (m: string) => void = () => {}): Promise<{ updated: boolean; message: string; restart: boolean }> {
  const c = await checkUpdate();
  if (c.error) throw new Error(c.error);
  if (!c.behind) return { updated: false, message: 'Ya tienes la última versión.', restart: false };
  if (c.dirty) throw new Error('Hay cambios hechos a mano en el código de la app: no se actualiza para no pisarlos.');
  const before = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  onProgress(`Bajando ${c.behind} cambio${c.behind === 1 ? '' : 's'}…`);
  await git(['pull', '--ff-only', '--quiet'], 180_000);
  const changed = (await git(['diff', '--name-only', before, 'HEAD'])).stdout.split('\n');
  if (changed.some((f) => /(^|\/)package(-lock)?\.json$/.test(f))) {
    onProgress('Instalando lo nuevo…');
    await npmRun(['install', '--no-audit', '--no-fund']);
  }
  if (changed.some((f) => f.startsWith('packages/studio/') || f.startsWith('packages/schema/'))) {
    onProgress('Preparando la interfaz…');
    await npmRun(['run', 'build:studio']);
  }
  return { updated: true, message: `Actualizada: ${c.behind} cambio${c.behind === 1 ? '' : 's'} nuevo${c.behind === 1 ? '' : 's'}.`, restart: true };
}

/** Reinicia el studio con los mismos argumentos (el proceso nuevo espera a que este suelte el puerto). */
export function restartStudio() {
  const [node, ...rest] = process.argv;
  // Al reiniciar no se abre otra pestaña: la que está abierta se recarga sola.
  const args = rest.includes('--no-open') ? rest : [...rest, '--no-open'];
  const execArgv = process.execArgv;
  setTimeout(() => {
    const child = spawn(node, [...execArgv, ...args], { cwd: process.cwd(), detached: true, stdio: 'ignore', env: { ...process.env, AXIOMA_RESTART_WAIT: '1' } });
    child.unref();
    process.exit(0);
  }, 800);
}
