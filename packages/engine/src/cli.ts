import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { autoVideo } from './auto.ts';
import path from 'node:path';
import { Command } from 'commander';
import { APP_NAME, BUILTIN_PRESETS } from '@axioma/schema';
import { installClaude } from './claude.ts';
import { doctor } from './doctor.ts';
import { REPO_ROOT } from './paths.ts';
import { measureLufs, probe } from './media.ts';
import { setVoiceover } from './ops.ts';
import { cutProject, editMontage, editVideo, prepareMedia, transcribeProject } from './pipeline.ts';
import { renderProject } from './render.ts';
import { isTailscale, lanAddresses, lanKey, openBrowser, startStudio, studioUrl } from './studio.ts';
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
    console.log('\nAbre Claude Code (o el Code tab de Claude) en esta carpeta y acepta el plugin "axioma-studio".');
    console.log(`Para usarlo desde cualquier carpeta: /plugin marketplace add "${REPO_ROOT}" y luego /plugin install axioma-studio@axioma-studio`);
  });

program
  .command('studio')
  .argument('[proyecto]', 'id del proyecto a abrir')
  .option('--no-open', 'no abrir el navegador')
  .option('--red', 'permitir abrirla desde otros equipos de tu red (con clave)')
  .description('Abre la interfaz (storyboard, editor, variantes)')
  .action(async (id, o) => {
    const network = Boolean(o.red) || process.env.AXIOMA_RED === '1';
    const url = studioUrl(await startStudio({ network }), id ? 'storyboard' : 'proyectos', id);
    console.log(`Studio: ${url}`);
    if (network) {
      const key = await lanKey();
      const port = new URL(url).port;
      const ips = lanAddresses();
      const link = (ip: string) => `  http://${ip}:${port}/?clave=${key}`;
      const home = ips.filter((ip) => !isTailscale(ip));
      const away = ips.filter(isTailscale);
      if (!ips.length) console.log('\nNo encontré una red local activa en este computador.');
      if (home.length) console.log(`\nDesde tu portátil o celular (misma red Wi-Fi), abre en el navegador:\n${home.map(link).join('\n')}`);
      console.log(away.length
        ? `\nDesde fuera de casa (con Tailscale abierto en ese equipo):\n${away.map(link).join('\n')}`
        : '\nPara usarla fuera de casa: instala Tailscale (gratis) en este computador y en tu portátil o celular, con la misma cuenta. Al volver a abrir la app aparece aquí el enlace.');
      if (ips.length) console.log('La clave queda guardada en ese navegador. Si el Mac pregunta si permites conexiones entrantes para «node», pulsa Permitir.');
    }
    console.log('\nCtrl+C para cerrarlo.');
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
  .command('montaje')
  .argument('<videos...>', 'uno o varios videos, o una carpeta')
  .option('-n, --name <nombre>', 'nombre del proyecto')
  .option('-c, --client <cliente>', 'cliente (carpeta)')
  .option('-p, --preset <id>', 'preset (define el largo de los cortes)', 'rapido')
  .option('-d, --duracion <segundos>', 'duración del montaje', (v) => Number(v))
  .option('-m, --musica <archivo>', 'música de fondo (los cortes van al compás)')
  .option('--licencia <texto>', 'licencia de la música')
  .option('--voz <texto>', 'texto de la voz en off')
  .option('--no-render', 'preparar y armar sin renderizar')
  .description('Montaje de cortes rápidos para videos sin voz (gimnasio, comida, producto)')
  .action(async (videos, o) => {
    await editMontage(videos, { name: o.name, client: o.client, preset: o.preset, duration: o.duracion, music: o.musica, musicLicense: o.licencia, voiceover: o.voz, render: o.render });
  });

program
  .command('voz')
  .argument('<carpeta>', 'carpeta del proyecto')
  .argument('<texto>', 'texto que dirá la voz en off')
  .option('--proveedor <p>', 'elevenlabs, piper o sistema')
  .option('--voz <nombre>', 'voz a usar')
  .description('Pone voz en off a un proyecto (y la subtitula)')
  .action(async (dir, texto, o) => {
    const p = await setVoiceover(path.resolve(dir), texto, { provider: o.proveedor, voice: o.voz });
    console.log(`Voz en off: ${p.audio.voiceover?.provider} · ${p.audio.voiceover?.duration.toFixed(1)} s`);
  });

program
  .command('auto')
  .argument('<ruta>', 'un video o una carpeta con videos')
  .option('-c, --client <cliente>', 'cliente (su marca y sus referencias guían la edición)')
  .option('-s, --salida <carpeta>', 'carpeta donde dejar los videos terminados')
  .option('-v, --vigilar', 'quedarse mirando la carpeta y editar cada video nuevo que llegue')
  .description('Modo automático: edita solo cada video (corte, gancho, textos, gráficos, sonidos) y lo exporta')
  .action(async (ruta, o) => {
    const target = path.resolve(ruta);
    const isDir = (await stat(target)).isDirectory();
    const folder = isDir ? target : path.dirname(target);
    const salida = path.resolve(o.salida ?? path.join(folder, 'editados'));
    const logFile = path.join(folder, '.editados.json');
    const done: Record<string, string> = await readFile(logFile, 'utf8').then((x) => JSON.parse(x)).catch(() => ({}));
    const pending = async () => (isDir ? (await readdir(target)).filter((f) => /\.(mp4|mov|m4v)$/i.test(f) && !f.startsWith('.')).sort().map((f) => path.join(target, f)) : [target])
      .filter((f) => isDir ? !done[path.basename(f)] : true);
    const one = async (file: string) => {
      console.log(`\n▶ ${path.basename(file)}`);
      try {
        // Si el archivo todavía se está copiando, se espera a que deje de crecer.
        let size = -1;
        for (;;) { const now = (await stat(file)).size; if (now === size) break; size = now; await new Promise((r) => setTimeout(r, 2000)); }
        const r = await autoVideo(file, { client: o.client, outFolder: salida });
        done[path.basename(file)] = r.out ?? r.dir;
      } catch (e) {
        done[path.basename(file)] = `ERROR: ${e instanceof Error ? e.message : e}`;
        console.log(`✗ ${done[path.basename(file)]}`);
      }
      if (isDir) await writeFile(logFile, JSON.stringify(done, null, 2));
    };
    for (const f of await pending()) await one(f);
    if (!o.vigilar || !isDir) { console.log(`\nTerminado. Videos en: ${salida}`); return; }
    console.log(`\nVigilando ${target}. Deja ahí un video y se edita solo. Ctrl+C para salir.`);
    for (;;) {
      await new Promise((r) => setTimeout(r, 8000));
      for (const f of await pending()) await one(f);
    }
  });

program
  .command('lote')
  .argument('<carpeta>', 'carpeta con varios videos')
  .option('-c, --client <cliente>', 'cliente (carpeta)')
  .option('-p, --preset <id>', 'preset', 'rapido')
  .option('--no-render', 'solo preparar y cortar')
  .description('Edita todos los videos de una carpeta, uno tras otro')
  .action(async (folder, o) => {
    const dir = path.resolve(folder);
    const files = (await readdir(dir)).filter((f) => /\.(mp4|mov|m4v)$/i.test(f)).sort();
    if (!files.length) throw new Error(`No hay videos (.mp4, .mov) en ${dir}`);
    const results: string[] = [];
    for (const [i, f] of files.entries()) {
      console.log(`\n[${i + 1}/${files.length}] ${f}`);
      try {
        const r = await editVideo(path.join(dir, f), { client: o.client, preset: o.preset, render: o.render });
        results.push(`✓ ${f} → ${r.out ?? r.dir}`);
      } catch (e) {
        results.push(`✗ ${f}: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`\nResumen del lote:\n${results.join('\n')}`);
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
  .option('-f, --formato <formato>', '9:16, 4:5, 1:1 o 16:9', '9:16')
  .action(async (dir, o) => {
    const { out } = await renderProject(path.resolve(dir), { out: o.out, format: o.formato, onProgress: (p) => process.stdout.write(`\r  render ${Math.round(p * 100)}%`) });
    console.log(`\nListo: ${out}`);
  });

program
  .command('copia')
  .description('Copia de seguridad del trabajo a iCloud Drive (o a AXIOMA_BACKUP_DIR)')
  .action(async () => {
    const { runBackup } = await import('./backup.ts');
    const s = await runBackup((m) => console.log(m));
    if (s.error) throw new Error(s.error);
    console.log(`Copia lista en ${s.dest}: ${s.copied} archivos nuevos o cambiados de ${s.files} (${Math.round((s.bytes ?? 0) / 1e6)} MB) en ${s.seconds} s.`);
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
