/**
 * Tutorial para Laura, todo con Axioma: voz (motor de voz de Axioma) + Axi de presentadora + subtítulos,
 * montado en Remotion. Las tomas del panel son GRABACIONES REALES: ponlas en
 * workspace/laura/public/laura/escena-2.mp4 … escena-7.mp4 (o .png).
 *
 *   npx tsx scripts/tutorial-laura.ts            # voz + video vertical y horizontal
 *   npx tsx scripts/tutorial-laura.ts --sin-voz  # solo el video (sin audio)
 *   opciones: --proveedor elevenlabs|fish|qwen|piper|sistema  --voz <nombre>
 */
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { synthesize, type TtsProvider } from '../packages/engine/src/tts.ts';
import { ffprobe } from '../packages/engine/src/exec.ts';
import { SCENES } from '../packages/remotion/src/TutorialLaura.tsx';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const root = path.resolve(import.meta.dirname, '..');
const pub = path.join(root, 'workspace', 'laura', 'public');
const outDir = path.join(root, 'workspace', 'laura');
await mkdir(path.join(pub, 'laura'), { recursive: true });

const voices: Record<number, string> = {};
const durations: number[] = [];
if (!process.argv.includes('--sin-voz')) {
  for (let i = 0; i < SCENES.length; i++) {
    const file = path.join(pub, 'laura', `voz-${i + 1}.wav`);
    const r = await synthesize(SCENES[i].narration, file, { provider: arg('--proveedor') as TtsProvider | undefined, voice: arg('--voz') });
    const d = Number((await ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file])).stdout.trim());
    voices[i + 1] = `laura/voz-${i + 1}.wav`;
    durations.push(d);
    console.log(`Escena ${i + 1}: ${d.toFixed(1)} s (${r.provider})${r.aviso ? ' · ' + r.aviso : ''}`);
  }
}
const screens: Record<number, string> = {};
const dir = path.join(pub, 'laura');
for (let i = 2; i <= 7; i++) {
  const f = readdirSync(dir).find((n) => new RegExp(`^escena-${i}\\.(mp4|mov|webm|png|jpg)$`).test(n));
  if (f) screens[i] = `laura/${f}`;
}
console.log(`Tomas reales encontradas: ${Object.keys(screens).join(', ') || 'ninguna (saldrán los recuadros «AQUÍ VA LA GRABACIÓN REAL»)'}`);

for (const [id, name] of [['TutorialLaura', 'vertical'], ['TutorialLauraHorizontal', 'horizontal']] as const) {
  const props = path.join(outDir, `props-${name}.json`);
  await writeFile(props, JSON.stringify({ vertical: name === 'vertical', voices, durations, screens }));
  const out = path.join(outDir, `tutorial-laura-${name}.mp4`);
  const r = spawnSync('npx', ['remotion', 'render', 'packages/remotion/src/index.ts', id, out, `--props=${props}`, `--public-dir=${pub}`], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`✓ ${out}`);
}
