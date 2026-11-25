// Renderiza cuadros sueltos (1 bundle, N imágenes) y arma una hoja de contacto JPG liviana.
// Uso: npx tsx scripts/stills.mjs "0,30,59" avance/gancho.jpg [escala=0.35] [columnas=3]
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [framesArg, out, scaleArg = '0.35', colsArg = '3'] = process.argv.slice(2);
if (!framesArg || !out) {
  console.error('Uso: npx tsx scripts/stills.mjs "0,30,59" avance/gancho.jpg [escala] [columnas]');
  process.exit(1);
}
const {COMP_ID} = await import('../src/timeline.ts');
const frames = framesArg.split(',').map((x) => Number(x.trim()));
const cols = Number(colsArg);
const tmp = mkdtempSync(join(tmpdir(), 'stills-'));
const inputProps = {audio: false};
const serveUrl = await bundle({entryPoint: join(root, 'src', 'index.ts')});
const composition = await selectComposition({serveUrl, id: COMP_ID, inputProps});
const files = [];
for (const [i, frame] of frames.entries()) {
  const output = join(tmp, `${String(i).padStart(3, '0')}.jpg`);
  await renderStill({composition, serveUrl, frame, output, imageFormat: 'jpeg', jpegQuality: 88, scale: Number(scaleArg), inputProps});
  files.push(output);
}
const outPath = resolve(root, out);
mkdirSync(dirname(outPath), {recursive: true});
if (files.length === 1) {
  copyFileSync(files[0], outPath);
} else {
  const w = Math.min(cols, files.length);
  const rows = Math.ceil(files.length / w);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(tmp, '%03d.jpg'), '-vf', `tile=${w}x${rows}:padding=8:color=gray`, '-frames:v', '1', '-q:v', '5', outPath]);
}
rmSync(tmp, {recursive: true, force: true});
console.log(`OK -> ${outPath} (cuadros ${frames.join(', ')})`);
