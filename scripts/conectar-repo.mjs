// Conecta esta carpeta con el repositorio público para que la app pueda actualizarse sola.
// Una copia descargada como ZIP no trae git: aquí se enlaza sin tocar los archivos que ya están.
// No hace nada si la carpeta ya está conectada. Nunca falla el instalador: solo avisa.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/sergioagc26/axioma-studio.git';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8', windowsHide: true });

if (existsSync(path.join(root, '.git'))) { console.log('  Ya está conectada con el repositorio.'); process.exit(0); }
if (git('--version').status !== 0) { console.log('  Sin git no se puede conectar: la app funciona, pero no se actualizará sola.'); process.exit(0); }
const pasos = [['init', '-q', '-b', 'main'], ['remote', 'add', 'origin', REPO], ['fetch', '-q', '--depth', '1', 'origin', 'main'], ['reset', '-q', 'origin/main']];
for (const p of pasos) {
  const r = git(...p);
  if (r.status !== 0) {
    console.log(`  No se pudo conectar con GitHub (${p[0]}): la app funciona, pero no se actualizará sola. ${String(r.stderr).trim().split('\n').pop()}`);
    process.exit(0);
  }
}
console.log('  Conectada con el repositorio: se actualizará desde Ajustes.');
