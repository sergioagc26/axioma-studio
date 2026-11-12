import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from './paths.ts';

const require = createRequire(import.meta.url);

/** Ruta del programa de Claude Code (el oficial, instalado con npm). */
export function claudeBin(): string | null {
  if (process.env.SE_CLAUDE_BIN) return process.env.SE_CLAUDE_BIN;
  try {
    const pkg = require.resolve('@anthropic-ai/claude-code/package.json');
    const bin = (require(pkg).bin ?? {}).claude ?? 'cli.js';
    const file = path.join(path.dirname(pkg), bin);
    return existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

const RULES = [
  'Eres el editor dentro de la app Axioma Studio. Trabajas SOLO con las herramientas del servidor MCP "axioma-studio" sobre el proyecto indicado.',
  'Reglas: no inventes cifras, testimonios ni datos (usa [DATO] si falta algo); no cambies lo que dijo la persona; textos en pantalla de máximo 6 palabras; nunca marques el proyecto como aprobado; no renderices salvo que se pida.',
  'Haz el cambio directamente con las herramientas y termina con UNA o DOS frases en español, sin tecnicismos, diciendo qué cambiaste.',
].join('\n');

export interface AssistantResult { text: string; tools: string[] }

/** Error que la interfaz sabe explicar (falta iniciar sesión, falta el programa…). */
export class AssistantError extends Error {
  constructor(public code: 'login' | 'no-instalado' | 'fallo', message: string) { super(message); }
}

const LOGIN_HELP = 'Claude no tiene la sesión iniciada en este computador. Hazlo una sola vez: abre una terminal en la carpeta del programa, corre "npx claude", escribe /login y entra con tu cuenta. Mientras tanto, la petición queda guardada para atenderla desde el chat de Claude.';

/**
 * Le pide algo a Claude desde la app, sin pasar por el chat. Usa Claude Code en
 * modo no interactivo con tu suscripción (no la API de pago), limitado a las
 * herramientas de este programa. Los cambios llegan al proyecto y la interfaz
 * los ve en vivo.
 */
export function askClaude(projectId: string, request: string, onStep: (msg: string) => void = () => {}): Promise<AssistantResult> {
  const bin = claudeBin();
  const mcp = path.join(REPO_ROOT, 'plugin', '.mcp.json');
  if (!bin) return Promise.reject(new AssistantError('no-instalado', 'Falta el programa de Claude. Corre: npm install'));
  if (!existsSync(mcp)) return Promise.reject(new AssistantError('no-instalado', 'Falta conectar el plugin. Corre: npm run se -- instalar-claude'));

  const prompt = `Proyecto: ${projectId}\n\nPetición: ${request}`;
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json', '--verbose',
    '--mcp-config', mcp, '--strict-mcp-config',
    '--allowedTools', 'mcp__axioma-studio',
    '--append-system-prompt', RULES,
    '--max-turns', '20',
  ];
  // Sin las variables de una sesión de Claude que esté abierta, y sin clave de API: debe usar la suscripción.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(CLAUDECODE|CLAUDE_CODE_|ANTHROPIC_API_KEY$)/.test(k)) delete env[k];
  const isScript = /\.(c|m)?js$/.test(bin);

  return new Promise((resolve, reject) => {
    const child = spawn(isScript ? process.execPath : bin, isScript ? [bin, ...args] : args, { cwd: REPO_ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const tools: string[] = [];
    let buf = '';
    let final: { is_error?: boolean; result?: string } | null = null;
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new AssistantError('fallo', 'Claude tardó más de 5 minutos y se canceló.')); }, 5 * 60_000);

    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === 'assistant') {
            for (const c of ev.message?.content ?? []) {
              if (c.type === 'tool_use') {
                const name = String(c.name).replace(/^mcp__axioma-studio__/, '');
                tools.push(name);
                onStep(`Claude: ${name.replace(/_/g, ' ')}…`);
              }
            }
          } else if (ev.type === 'result') final = ev;
        } catch {
          /* línea que no es JSON: se ignora */
        }
      }
    });
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => { clearTimeout(timer); reject(new AssistantError('fallo', `No se pudo abrir Claude: ${e.message}`)); });
    child.on('close', () => {
      clearTimeout(timer);
      const text = final?.result ?? '';
      if (/not logged in|\/login|invalid api key|authentication/i.test(text + stderr)) return reject(new AssistantError('login', LOGIN_HELP));
      if (!final || final.is_error) return reject(new AssistantError('fallo', text || stderr.slice(-300) || 'Claude no respondió.'));
      resolve({ text, tools });
    });
  });
}

let cached: { at: number; ok: boolean } | null = null;

/** ¿Claude tiene sesión iniciada en este computador? Se comprueba como mucho una vez por minuto. */
export async function claudeReady(force = false): Promise<boolean> {
  if (!force && cached && Date.now() - cached.at < 60_000) return cached.ok;
  const bin = claudeBin();
  if (!bin) return false;
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(CLAUDECODE|CLAUDE_CODE_|ANTHROPIC_API_KEY$)/.test(k)) delete env[k];
  const isScript = /\.(c|m)?js$/.test(bin);
  const ok = await new Promise<boolean>((resolve) => {
    const args = ['-p', 'Responde solo: ok', '--output-format', 'json', '--max-turns', '1'];
    const child = spawn(isScript ? process.execPath : bin, isScript ? [bin, ...args] : args, { cwd: REPO_ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); resolve(false); }, 45_000);
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', () => { clearTimeout(timer); resolve(!/not logged in|\/login/i.test(out) && /"is_error":\s*false/.test(out)); });
  });
  cached = { at: Date.now(), ok };
  return ok;
}

/**
 * Abre una terminal con Claude ya arrancado en la carpeta del programa, para
 * que el usuario solo tenga que escribir /login. No inicia sesión por él.
 */
export async function openClaudeLogin(): Promise<void> {
  const bin = claudeBin();
  if (!bin) throw new AssistantError('no-instalado', 'Falta el programa de Claude. Corre: npm install');
  cached = null;
  const cmd = /\.(c|m)?js$/.test(bin) ? `"${process.execPath}" "${bin}"` : `"${bin}"`;
  if (process.platform === 'darwin') {
    const file = path.join(os.tmpdir(), 'conectar-claude.command');
    await writeFile(file, `#!/bin/bash\ncd "${REPO_ROOT}"\nclear\necho "Escribe /login y pulsa Enter para conectar Claude. Luego cierra esta ventana."\necho\n${cmd}\n`, { mode: 0o755 });
    spawn('open', [file], { stdio: 'ignore', detached: true }).unref();
  } else if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', 'Conectar Claude', 'cmd', '/k', `cd /d "${REPO_ROOT}" && echo Escribe /login y pulsa Enter && ${cmd}`], { stdio: 'ignore', detached: true, windowsHide: false }).unref();
  } else {
    throw new AssistantError('fallo', `Abre una terminal en ${REPO_ROOT} y corre: npx claude  (luego escribe /login)`);
  }
}
