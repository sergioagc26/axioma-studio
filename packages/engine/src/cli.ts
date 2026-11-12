import path from 'node:path';
import { Command } from 'commander';
import { APP_NAME, BUILTIN_PRESETS } from '@snz/schema';
import { installClaude } from './claude.ts';
import { doctor } from './doctor.ts';
import { REPO_ROOT } from './paths.ts';
import { measureLufs, probe } from './media.ts';
import { cutProject, editVideo, prepareMedia, transcribeProject } from './pipeline.ts';
import { renderProject } from './render.ts';
import { openBrowser, startStudio, studioUrl } from './studio.ts';
import { ensureWhisper } from './transcribe.ts';

const program = new Command();
program.name('se').description(`${APP_NAME} · editor de reels con IA`);

program
  .command('doctor')
  .description('Revisa que todo lo necesario esté instalado')
  .action(async () => {
    const { ok, checks } = await doctor();
    for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}${c.ok || !c.fix ? '' : `\n    → ${c.fix}`}`);
    process.exitCode = ok ? 0 : 1;
  });

program
  .command('setup')
  .description('Instala whisper.cpp y descarga el modelo')
  .action(async () => {
    await ensureWhisper();
    console.log('whisper.cpp listo.');
  });

program
  .command('instalar-claude')
  .description('Conecta el plugin (skills + servidor MCP) con Claude en este computador')
  .action(async () => {
    const { mcpFile, settingsFile } = await installClaude();
    console.log(`✓ ${mcpFile}\n✓ ${settingsFile}`);
    console.log('\nAbre Claude Code (o el Code tab de Claude) en esta carpeta y acepta el plugin "snz-studio".');
    console.log(`Para usarlo desde cualquier carpeta: /plugin marketplace add "${REPO_ROOT}" y luego /plugin install snz-studio@snz-studio`);
  });

program
  .command('studio')
  .argument('[proyecto]', 'id del proyecto a abrir')
  .option('--no-open', 'no abrir el navegador')
  .description('Abre la interfaz (storyboard, editor, variantes)')
  .action(async (id, o) => {
    const url = studioUrl(await startStudio(), id ? 'storyboard' : 'proyectos', id);
    console.log(`Studio: ${url}\nCtrl+C para cerrarlo.`);
    if (o.open) openBrowser(url);
  });

program
  .command('edit')
  .argument('<video>', 'video hablando a cámara')
  .option('-n, --name <nombre>', 'nombre del proyecto')
  .option('-c, --client <cliente>', 'cliente (carpeta)')
  .option('-p, --preset <id>', `preset: ${BUILTIN_PRESETS.map((p) => p.id).join(', ')}`, 'rapido')
  .option('--no-render', 'preparar y cortar sin renderizar')
  .description('Flujo completo: transcribe, corta, subtitula y renderiza')
  .action(async (video, o) => {
    await editVideo(video, { name: o.name, client: o.client, preset: o.preset, render: o.render });
  });

program
  .command('prepare')
  .argument('<carpeta>', 'carpeta del proyecto')
  .action(async (dir) => { await prepareMedia(path.resolve(dir)); });

program
  .command('transcribe')
  .argument('<carpeta>', 'carpeta del proyecto')
  .action(async (dir) => { const t = await transcribeProject(path.resolve(dir)); console.log(`${t.words.length} palabras`); });

program
  .command('cut')
  .argument('<carpeta>', 'carpeta del proyecto')
  .option('-p, --preset <id>', 'cambiar de preset antes de cortar')
  .action(async (dir, o) => { console.log(await cutProject(path.resolve(dir), o.preset)); });

program
  .command('render')
  .argument('<carpeta>', 'carpeta del proyecto')
  .option('-o, --out <archivo>', 'archivo de salida')
  .action(async (dir, o) => {
    const { out } = await renderProject(path.resolve(dir), { out: o.out, onProgress: (p) => process.stdout.write(`\r  render ${Math.round(p * 100)}%`) });
    console.log(`\nListo: ${out}`);
  });

program
  .command('check')
  .argument('<archivo>', 'MP4 renderizado')
  .description('Muestra formato y sonoridad de un render')
  .action(async (file) => {
    const info = await probe(file);
    console.log(`${info.width}×${info.height} · ${info.fps.toFixed(2)} fps · ${info.duration.toFixed(2)} s · ${(await measureLufs(file)).toFixed(1)} LUFS`);
  });

program.parseAsync().catch((e) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
