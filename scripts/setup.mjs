// Lanza el setup correcto según el sistema operativo.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const r = process.platform === 'win32'
  ? spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'setup.ps1')], { stdio: 'inherit' })
  : spawnSync('bash', [path.join(dir, 'setup.sh')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
