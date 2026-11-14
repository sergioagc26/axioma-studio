import { ttsProviders } from './tts.ts';
import { claudeBin } from './assistant.ts';
import { existsSync, readFileSync, statfsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getModelPath } from '@remotion/install-whisper-cpp/dist/download-whisper-model.js';
import { getWhisperExecutablePath } from '@remotion/install-whisper-cpp/dist/install-whisper-cpp.js';
import { run } from './exec.ts';
import { REPO_ROOT, WHISPER_DIR, WHISPER_MODELS, WHISPER_VERSION, WORKSPACE } from './paths.ts';
import { DEFAULT_MODEL } from './transcribe.ts';
import { ensureOllama, LOCAL_MODEL, llmStatus } from './llm.ts';

interface Check { name: string; ok: boolean; detail: string; fix?: string }

async function version(bin: string): Promise<string | null> {
  try {
    const { stdout } = await run(bin, ['-version']);
    return stdout.split('\n')[0];
  } catch {
    return null;
  }
}

export async function doctor(): Promise<{ ok: boolean; checks: Check[] }> {
  const checks: Check[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ name: 'Node.js', ok: major >= 20, detail: process.versions.node, fix: 'Instala Node 20 o superior (nodejs.org).' });

  for (const bin of ['ffmpeg', 'ffprobe']) {
    const v = await version(process.env[`SE_${bin.toUpperCase()}`] ?? bin);
    checks.push({
      name: bin, ok: Boolean(v), detail: v ?? 'no encontrado',
      fix: process.platform === 'win32' ? 'winget install Gyan.FFmpeg' : 'brew install ffmpeg',
    });
  }

  const exe = getWhisperExecutablePath(WHISPER_DIR, WHISPER_VERSION);
  checks.push({ name: 'whisper.cpp', ok: existsSync(exe), detail: existsSync(exe) ? exe : 'no instalado', fix: 'npm run setup' });
  const model = getModelPath(WHISPER_MODELS, DEFAULT_MODEL);
  checks.push({ name: `Modelo Whisper (${DEFAULT_MODEL})`, ok: existsSync(model), detail: existsSync(model) ? 'ok' : 'no descargado', fix: 'npm run setup' });

  const ramGb = os.totalmem() / 1024 ** 3;
  checks.push({ name: 'Memoria RAM', ok: ramGb >= 7.5, detail: `${ramGb.toFixed(0)} GB`, fix: 'Se recomiendan 8 GB o más.' });

  const target = existsSync(WORKSPACE) ? WORKSPACE : path.dirname(WORKSPACE);
  const fs = statfsSync(target);
  const freeGb = (fs.bavail * fs.bsize) / 1024 ** 3;
  checks.push({ name: 'Espacio libre', ok: freeGb >= 10, detail: `${freeGb.toFixed(0)} GB en ${target}`, fix: 'Libera al menos 10 GB.' });

  const dist = path.join(REPO_ROOT, 'packages', 'studio', 'dist', 'index.html');
  checks.push({ name: 'Studio compilado', ok: existsSync(dist), detail: existsSync(dist) ? 'ok' : 'falta', fix: 'npm run build:studio' });
  const mcp = path.join(REPO_ROOT, 'plugin', '.mcp.json');
  checks.push({ name: 'Plugin de Claude conectado', ok: existsSync(mcp), detail: existsSync(mcp) ? 'ok' : 'falta', fix: 'npm run se -- instalar-claude' });

  // Opcionales: no bloquean.
  const envText = existsSync(path.join(REPO_ROOT, '.env')) ? readFileSync(path.join(REPO_ROOT, '.env'), 'utf8') : '';
  const stock = ['PEXELS_API_KEY', 'PIXABAY_API_KEY'].filter((k) => Boolean(process.env[k]) || new RegExp(`^${k}\\s*=\\s*\\S`, 'm').test(envText));
  checks.push({ name: 'Clave de videos de stock (opcional: Pexels o Pixabay)', ok: true, detail: stock.length ? `ok (${stock.map((k) => k.split('_')[0].toLowerCase()).join(', ')})` : 'sin clave: usa b-roll de archivos locales' });

  await ensureOllama();
  const ia = await llmStatus();
  checks.push({
    name: 'IA local (opcional: Ollama)', ok: true,
    detail: !ia.running ? 'no está abierta: sin Claude, la edición por chat no funciona' : ia.model ? `ok (${ia.model}${ia.loaded ? ', cargada en memoria' : ''}${ia.vision ? ` · ve imágenes con ${ia.vision}` : ''}, Ollama ${ia.version})` : `abierta pero sin modelo: ollama pull ${LOCAL_MODEL}`,
  });

  // Lo que usan las funciones nuevas (opcionales: sin ellas esa función avisa y la app sigue).
  let ytdlp: string | null = null;
  try { ytdlp = (await run(process.env.SE_YTDLP ?? 'yt-dlp', ['--version'])).stdout.trim(); } catch { /* no está */ }
  checks.push({ name: 'Bajar referencias desde un link (opcional: yt-dlp)', ok: true, detail: ytdlp ? `ok (${ytdlp})` : 'no instalado: solo se pueden subir archivos', fix: process.platform === 'win32' ? 'winget install yt-dlp' : 'brew install yt-dlp' });
  const voices = await ttsProviders();
  checks.push({ name: 'Voz IA natural (opcional: Qwen local o ElevenLabs)', ok: true, detail: voices.includes('qwen') ? 'ok (voz IA local)' : voices.includes('elevenlabs') ? 'ok (ElevenLabs)' : 'solo la voz del computador (más robótica)' });
  checks.push({ name: 'IA que mira las tomas (opcional)', ok: true, detail: ia.vision ? `ok (${ia.vision})` : 'sin modelo de visión: la sincronía usa el modelo CLIP (menos preciso)', fix: 'ollama pull qwen3-vl:8b' });
  checks.push({ name: 'Claude (opcional: escribe los mejores guiones)', ok: true, detail: claudeBin() ? 'instalado (conéctalo con tu cuenta para usarlo)' : 'no instalado: los guiones los escribe la IA local' });

  return { ok: checks.every((c) => c.ok), checks };
}
