import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from './exec.ts';
import { WORKSPACE } from './paths.ts';

const CACHE = path.join(WORKSPACE, 'fuentes-del-sistema.json');
const DAY = 24 * 60 * 60 * 1000;
let memo: Promise<string[]> | null = null;

/** Familias instaladas, leídas del sistema operativo. */
async function readSystemFonts(): Promise<string[]> {
  let names: string[] = [];
  if (process.platform === 'darwin') {
    const { stdout } = await run('system_profiler', ['SPFontsDataType', '-json']);
    const data = JSON.parse(stdout) as { SPFontsDataType?: { typefaces?: { family?: string }[] }[] };
    names = (data.SPFontsDataType ?? []).flatMap((f) => (f.typefaces ?? []).map((t) => t.family ?? ''));
  } else if (process.platform === 'win32') {
    const { stdout } = await run('powershell', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }']);
    names = stdout.split(/\r?\n/);
  } else {
    const { stdout } = await run('fc-list', [':', 'family']);
    names = stdout.split(/\r?\n/).map((l) => l.split(',')[0]);
  }
  // Las que empiezan por punto son internas del sistema y no se pueden elegir.
  return [...new Set(names.map((n) => n.trim()).filter((n) => n && !n.startsWith('.')))].sort((a, b) => a.localeCompare(b));
}

/**
 * Tipografías instaladas en este computador. Se pueden usar tal cual en la vista previa
 * y al exportar, porque ambos se dibujan en esta misma máquina. La lista se guarda un día.
 */
export function systemFonts(refresh = false): Promise<string[]> {
  if (memo && !refresh) return memo;
  memo = (async () => {
    if (!refresh) {
      try {
        const c = JSON.parse(await readFile(CACHE, 'utf8')) as { at: number; fonts: string[] };
        if (Date.now() - c.at < DAY && c.fonts.length) return c.fonts;
      } catch { /* sin caché */ }
    }
    try {
      const fonts = await readSystemFonts();
      await writeFile(CACHE, JSON.stringify({ at: Date.now(), fonts })).catch(() => {});
      return fonts;
    } catch {
      return [];
    }
  })();
  return memo;
}

/**
 * Abre la ventana del sistema para elegir una carpeta y devuelve su ruta
 * (o null si se cancela). Así no hay que escribir rutas a mano.
 */
export async function pickFolder(): Promise<string | null> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await run('osascript', ['-e', 'POSIX path of (choose folder with prompt "Elige dónde guardar el video")']);
      return stdout.trim() || null;
    }
    if (process.platform === 'win32') {
      const { stdout } = await run('powershell', ['-NoProfile', '-STA', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "Elige dónde guardar el video"; if ($d.ShowDialog() -eq "OK") { $d.SelectedPath }']);
      return stdout.trim() || null;
    }
    const { stdout } = await run('zenity', ['--file-selection', '--directory']);
    return stdout.trim() || null;
  } catch {
    return null; // cancelado o sin ventana disponible
  }
}
