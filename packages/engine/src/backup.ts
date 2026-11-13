import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WORKSPACE } from './paths.ts';

/**
 * Copia de seguridad del trabajo (workspace) a iCloud Drive, o a la carpeta de AXIOMA_BACKUP_DIR.
 * Copia solo lo nuevo o cambiado y nunca borra nada del destino: si el disco de trabajo falla o
 * queda vacío, la copia sigue intacta. Lo que la app vuelve a crear sola (vistas previas, tramos en
 * cámara lenta, archivos temporales) no se copia, ni las claves ni la clave de red.
 */
const ICLOUD = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
const STATUS = path.join(WORKSPACE, 'copia-de-seguridad.json');
const EVERY_MS = 24 * 3600_000;

export interface BackupStatus { last?: string; dest?: string; files?: number; copied?: number; bytes?: number; seconds?: number; error?: string; running?: boolean }

export function backupDir(): string | null {
  if (process.env.AXIOMA_BACKUP_DIR) return path.resolve(process.env.AXIOMA_BACKUP_DIR);
  return existsSync(ICLOUD) ? path.join(ICLOUD, 'Axioma Studio · copia de seguridad') : null;
}

/** Lo que no se copia: se vuelve a crear solo, es temporal o es secreto. */
export function skipInBackup(rel: string): boolean {
  const parts = rel.split(/[\\/]/);
  const name = parts[parts.length - 1];
  if (parts.includes('proxies') || parts.includes('lento') || parts.includes('node_modules')) return true;
  if (name === '.DS_Store' || name.endsWith('.sin-nivelar.mp4') || name.endsWith('.tmp') || name.endsWith('.part')) return true;
  if (parts.length === 1 && ['clave-red.txt', 'studio-errores.log', 'instalacion.log', 'copia-de-seguridad.json'].includes(name)) return true;
  return false;
}

export async function backupStatus(): Promise<BackupStatus> {
  try { return { ...JSON.parse(await readFile(STATUS, 'utf8')), running: Boolean(current) }; } catch { return { running: Boolean(current) }; }
}

let current: Promise<BackupStatus> | null = null;

/** Hace la copia ahora (si ya hay una en curso, espera a esa). */
export function runBackup(onProgress?: (m: string) => void): Promise<BackupStatus> {
  current ??= doBackup(onProgress).finally(() => { current = null; });
  return current;
}

async function doBackup(onProgress?: (m: string) => void): Promise<BackupStatus> {
  const t0 = Date.now();
  const dest = backupDir();
  const save = async (s: BackupStatus) => { await writeFile(STATUS, JSON.stringify(s, null, 2)).catch(() => {}); return s; };
  if (!dest) return save({ ...(await backupStatus()), running: false, error: 'No encontré iCloud Drive en este computador. Indica otra carpeta con AXIOMA_BACKUP_DIR.' });
  // Si el disco de trabajo no está o está vacío, no se toca nada.
  if (!existsSync(path.join(WORKSPACE, 'clientes'))) return save({ ...(await backupStatus()), running: false, error: 'No encontré la carpeta de trabajo (¿el disco está conectado?). No se copió nada.' });
  let files = 0, copied = 0, bytes = 0;
  const walk = async (rel: string): Promise<void> => {
    const entries = await readdir(path.join(WORKSPACE, rel), { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (skipInBackup(r)) continue;
      if (e.isDirectory()) { await walk(r); continue; }
      if (!e.isFile()) continue;
      files++;
      const src = path.join(WORKSPACE, r);
      const out = path.join(dest, r);
      const a = await stat(src);
      const b = await stat(out).catch(() => null);
      // Igual tamaño y misma fecha: ya está copiado.
      if (b && b.size === a.size && Math.abs(b.mtimeMs - a.mtimeMs) < 2000) continue;
      await mkdir(path.dirname(out), { recursive: true });
      await copyFile(src, out);
      await utimes(out, a.atime, a.mtime);
      copied++; bytes += a.size;
      if (copied % 20 === 0) onProgress?.(`Copiando… ${copied} archivos (${Math.round(bytes / 1e6)} MB)`);
    }
  };
  try {
    await mkdir(dest, { recursive: true });
    await walk('');
    return save({ last: new Date().toISOString(), dest, files, copied, bytes, seconds: Math.round((Date.now() - t0) / 1000), running: false });
  } catch (e: any) {
    return save({ ...(await backupStatus()), dest, running: false, error: `La copia se interrumpió: ${e.message}` });
  }
}

/**
 * Mientras la app está abierta, hace la copia una vez al día (y al abrirla si toca). Solo empieza
 * después de que el usuario haga la primera a mano: subir los videos a la nube lo decide él.
 */
export function scheduleBackups() {
  const tick = async () => {
    const s = await backupStatus();
    if (s.last && Date.now() - Date.parse(s.last) > EVERY_MS) await runBackup().catch(() => {});
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 3600_000).unref?.();
}
