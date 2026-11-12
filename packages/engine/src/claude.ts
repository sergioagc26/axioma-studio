import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from './exec.ts';
import { REPO_ROOT } from './paths.ts';

/** Ruta absoluta de un programa del PATH, o null. */
async function which(bin: string): Promise<string | null> {
  try {
    const { stdout } = await run(process.platform === 'win32' ? 'where' : 'which', [bin]);
    return stdout.split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

/**
 * Conecta el plugin con este computador:
 * - plugin/.mcp.json con rutas absolutas a Node, FFmpeg y el servidor. Las apps
 *   de escritorio no heredan el PATH de la terminal, así que no basta con "node".
 * - .claude/settings.local.json que registra este repositorio como marketplace
 *   y activa el plugin cuando se abre Claude Code en esta carpeta.
 */
export async function installClaude() {
  const ffmpeg = await which('ffmpeg');
  const ffprobe = await which('ffprobe');
  if (!ffmpeg || !ffprobe) throw new Error('No encontré ffmpeg/ffprobe en el PATH. Corre el setup primero.');
  const dirs = [path.dirname(process.execPath), path.dirname(ffmpeg)];
  const systemDirs = process.platform === 'win32'
    ? [path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')]
    : ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const mcp = {
    mcpServers: {
      'axioma-studio': {
        command: process.execPath,
        args: [path.join(REPO_ROOT, 'packages', 'mcp', 'bin', 'server.mjs')],
        env: {
          SE_FFMPEG: ffmpeg,
          SE_FFPROBE: ffprobe,
          PATH: [...new Set([...dirs, ...systemDirs])].join(path.delimiter),
        },
      },
    },
  };
  const mcpFile = path.join(REPO_ROOT, 'plugin', '.mcp.json');
  await writeFile(mcpFile, JSON.stringify(mcp, null, 2));

  const settingsFile = path.join(REPO_ROOT, '.claude', 'settings.local.json');
  await mkdir(path.dirname(settingsFile), { recursive: true });
  const settings = existsSync(settingsFile) ? JSON.parse(await readFile(settingsFile, 'utf8')) : {};
  settings.extraKnownMarketplaces = {
    ...settings.extraKnownMarketplaces,
    'axioma-studio': { source: { source: 'directory', path: REPO_ROOT } },
  };
  settings.enabledPlugins = { ...settings.enabledPlugins, 'axioma-studio@axioma-studio': true };
  await writeFile(settingsFile, JSON.stringify(settings, null, 2));
  return { mcpFile, settingsFile };
}
