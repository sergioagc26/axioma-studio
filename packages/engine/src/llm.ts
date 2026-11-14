/**
 * Modelo de lenguaje local con Ollama (gratis, sin internet una vez descargado).
 * Es la única IA que usa la app: editar por chat, redactar ganchos y el texto para publicar.
 * El modelo, la memoria y los núcleos se ajustan a este PC (hardwareProfile) para no llevarlo al límite.
 */
import { machineSnapshot } from './machine.ts';
import { settings } from './settings.ts';
import { currentSignal } from './cancel.ts';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';

const HOST = process.env.OLLAMA_HOST ? (/^https?:/.test(process.env.OLLAMA_HOST) ? process.env.OLLAMA_HOST : `http://${process.env.OLLAMA_HOST}`).replace(/\/$/, '') : 'http://127.0.0.1:11434';
/** Modelos que sirven, del mejor al más liviano. Se usa el primero que esté descargado. */
export const MODEL_CHOICES = ['qwen3:14b', 'qwen3:8b', 'qwen2.5:7b', 'llama3.1:8b', 'gemma3:4b', 'qwen3:4b'];
/** Modelos que ven imágenes (fotogramas), del mejor al más liviano. */
export const VISION_CHOICES = ['qwen3-vl:8b', 'qwen2.5vl:7b', 'qwen3-vl:4b', 'gemma3:4b'];

/** Tamaño del modelo en miles de millones de parámetros, leído del nombre (qwen3:8b → 8). */
export function modelSizeB(name: string): number {
  const m = /[:\-](\d+(?:\.\d+)?)b\b/i.exec(name);
  return m ? Number(m[1]) : 0;
}

export interface HwProfile {
  ramGb: number; cores: number;
  /** Modelo de texto más grande (en miles de millones) que cabe dejando memoria para el resto. */
  maxB: number; visionMaxB: number;
  /** Contexto máximo, núcleos para la IA y cuánto queda cargado el modelo entre pedidos. */
  maxCtx: number; threads: number; keepAlive: string;
  recommended: string; recommendedVision: string;
}

/**
 * Lo que este PC aguanta sin quedarse sin memoria ni congelarse: con poca RAM, modelos más
 * chicos, menos contexto y que se descarguen antes; y siempre quedan núcleos libres para la
 * interfaz y el render.
 */
export function hardwareProfile(ramGb = totalRamGb(), cores = os.cpus().length || 4): HwProfile {
  // Con una tarjeta NVIDIA la IA cabe en su memoria (además de la RAM).
  const vram = machineSnapshot()?.gpus.filter((g) => g.vendor === 'nvidia').reduce((a, g) => Math.max(a, g.vramGb ?? 0), 0) ?? 0;
  const maxB = Math.max(ramGb > 20 ? 14 : ramGb > 10 ? 8 : 4, vram >= 12 ? 14 : vram >= 8 ? 8 : 0);
  const visionMaxB = ramGb > 12 ? 8 : 4;
  return {
    ramGb: Math.round(ramGb), cores, maxB, visionMaxB,
    maxCtx: ramGb > 20 ? 32768 : ramGb > 10 ? 16384 : 8192,
    threads: Math.max(2, Math.min(cores - 2, Math.floor(cores * 0.75))),
    keepAlive: process.env.AXIOMA_LLM_KEEP_ALIVE || (ramGb > 20 ? '30m' : ramGb > 10 ? '10m' : '3m'),
    recommended: maxB >= 14 ? 'qwen3:14b' : maxB >= 8 ? 'qwen3:8b' : 'qwen3:4b',
    recommendedVision: visionMaxB >= 8 ? 'qwen3-vl:8b' : 'qwen3-vl:4b',
  };
}

let hw: HwProfile | null = null;
const profile = () => (hw ??= hardwareProfile());

export const LOCAL_MODEL = process.env.AXIOMA_LLM || profile().recommended;

export interface LlmStatus { running: boolean; version?: string; model?: string; vision?: string; installed: string[]; loaded: boolean; error?: string }

async function getJson<T>(p: string, ms = 2500): Promise<T | null> {
  try {
    const r = await fetch(`${HOST}${p}`, { signal: AbortSignal.timeout(ms) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

const matches = (name: string, want: string) => name === want || name === `${want}:latest` || (!want.includes(':') && name.startsWith(`${want}:`));

/** El modelo a usar: el que pida AXIOMA_LLM o el mejor descargado que quepa en la memoria. */
export function pickModel(installed: string[], ramGb?: number): string | undefined {
  // La preferencia de Configuración es de ESTE computador: no aplica al calcular para otra memoria.
  const here = ramGb === undefined;
  ramGb ??= totalRamGb();
  if (process.env.AXIOMA_LLM) return installed.find((n) => matches(n, process.env.AXIOMA_LLM!));
  // El elegido en Configuración (si sigue instalado).
  const chosen = here ? settings().llm : undefined;
  if (chosen) { const hit = installed.find((n) => matches(n, chosen)); if (hit) return hit; }
  // Solo los que caben dejando memoria para el render (16 GB → hasta 8B; 8 GB → hasta 4B).
  const { maxB } = hardwareProfile(ramGb);
  const choices = MODEL_CHOICES.filter((m) => modelSizeB(m) <= maxB);
  for (const c of choices) { const hit = installed.find((n) => matches(n, c)); if (hit) return hit; }
  return undefined;
}

function totalRamGb() { return Number(process.env.AXIOMA_RAM_GB) || os.totalmem() / 1024 ** 3; }

let starting: Promise<boolean> | null = null;

/** Si Ollama está instalado pero cerrado, lo abre y espera a que responda (hasta ~20 s). */
export function ensureOllama(): Promise<boolean> {
  starting ??= (async () => {
    if (await getJson('/api/version')) return true;
    if (!/127\.0\.0\.1|localhost/.test(HOST)) return false;
    try {
      if (process.platform === 'darwin' && existsSync('/opt/homebrew/bin/brew')) spawn('/opt/homebrew/bin/brew', ['services', 'start', 'ollama'], { stdio: 'ignore', detached: true }).unref();
      else if (process.platform === 'darwin' && existsSync('/Applications/Ollama.app')) spawn('open', ['-a', 'Ollama'], { stdio: 'ignore', detached: true }).unref();
      else spawn('ollama', ['serve'], { stdio: 'ignore', detached: true, windowsHide: true }).on('error', () => {}).unref();
    } catch { return false; }
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await getJson('/api/version', 1000)) return true;
    }
    return false;
  })().finally(() => { setTimeout(() => { starting = null; }, 5000); });
  return starting;
}

/** Estado completo de la IA local: si corre, versión, modelos y si el modelo ya está cargado. */
export async function llmStatus(): Promise<LlmStatus> {
  const v = await getJson<{ version: string }>('/api/version');
  if (!v) return { running: false, installed: [], loaded: false, error: 'Ollama no está abierto.' };
  const tags = await getJson<{ models?: { name: string }[] }>('/api/tags');
  const installed = (tags?.models ?? []).map((m) => m.name);
  const model = pickModel(installed);
  const ps = await getJson<{ models?: { name: string }[] }>('/api/ps');
  const loaded = Boolean(model && ps?.models?.some((m) => m.name === model));
  return { running: true, version: v.version, model, vision: pickVisionModel(installed), installed, loaded, error: model ? undefined : `No hay un modelo descargado. Descarga uno con: ollama pull ${LOCAL_MODEL}` };
}

/** El modelo que ve imágenes: AXIOMA_VISION o el mejor descargado. */
export function pickVisionModel(installed: string[], ramGb?: number): string | undefined {
  const here = ramGb === undefined;
  const { visionMaxB } = hardwareProfile(ramGb ?? totalRamGb());
  const fixed = process.env.AXIOMA_VISION ?? (here ? settings().vision : undefined);
  const want = fixed ? [fixed] : VISION_CHOICES.filter((m) => modelSizeB(m) <= visionMaxB);
  for (const c of want) { const hit = installed.find((n) => matches(n, c)); if (hit) return hit; }
  return undefined;
}

let cachedModel: { name: string; at: number } | null = null;
/** Al cambiar el modelo en Configuración, se deja de usar el recordado. */
export function forgetModel() { cachedModel = null; }
async function activeModel(): Promise<string | undefined> {
  if (cachedModel && Date.now() - cachedModel.at < 60_000) return cachedModel.name;
  const tags = await getJson<{ models?: { name: string }[] }>('/api/tags');
  const name = pickModel((tags?.models ?? []).map((m) => m.name));
  if (name) cachedModel = { name, at: Date.now() };
  return name;
}

/** ¿Está la IA local lista? Si Ollama está cerrado, lo intenta abrir. */
export async function llmReady(): Promise<boolean> {
  if (!(await getJson('/api/version', 1500)) && !(await ensureOllama())) return false;
  return Boolean(await activeModel());
}

/** Carga el modelo en memoria para que el primer pedido no espere (se llama al abrir el studio). */
export async function llmWarmUp(): Promise<boolean> {
  if (!(await llmReady())) return false;
  const model = await activeModel();
  try {
    const r = await fetch(`${HOST}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model, keep_alive: profile().keepAlive, options: { num_thread: profile().threads } }) });
    return r.ok;
  } catch { return false; }
}

// Un pedido a la vez: con 16 GB, dos pedidos en paralelo se estorban y van más lentos que en fila.
let queue: Promise<unknown> = Promise.resolve();
function inLine<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

/** Contexto justo para el pedido: más rápido y con menos memoria en los cortos; hasta 32k en los largos. */
export function contextFor(chars: number, max = 32768): number {
  const tokens = Math.ceil(chars / 3) + 2048;
  for (const n of [8192, 16384, 32768]) if (tokens <= n) return Math.min(n, max);
  return max;
}

/**
 * Pide al modelo una respuesta en JSON que cumpla `schema` (salida estructurada de Ollama).
 * Temperatura baja: se busca precisión, no creatividad desbordada. Si falla una vez, reintenta.
 * `think: true` deja que el modelo razone antes de responder (más lento, mejor en pedidos difíciles).
 */
/** La espera de la IA también se corta si se cancela el trabajo que la pidió. */
const withJob = (s: AbortSignal) => { const j = currentSignal(); return j ? AbortSignal.any([s, j]) : s; };

export async function llmJson<T>(system: string, user: string, schema: object, opts: { temperature?: number; timeoutMs?: number; think?: boolean } = {}): Promise<T> {
  if (!(await llmReady())) throw new Error('La IA local no está disponible. Revisa que Ollama esté instalado y con un modelo descargado (ollama pull ${LOCAL_MODEL}).');
  const model = await activeModel();
  const once = async (): Promise<T> => {
    let r: Response;
    try {
      r = await fetch(`${HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: withJob(AbortSignal.timeout(opts.timeoutMs ?? 180_000)),
        body: JSON.stringify({
          model, stream: false, think: Boolean(opts.think), format: schema, keep_alive: profile().keepAlive,
          options: { temperature: opts.temperature ?? 0.3, num_ctx: contextFor(system.length + user.length, profile().maxCtx), num_thread: profile().threads },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
    } catch {
      throw new Error('La IA local no respondió a tiempo. Revisa que Ollama esté abierto (brew services start ollama).');
    }
    if (!r.ok) throw new Error(`La IA local respondió ${r.status}. ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as { message?: { content?: string } };
    const text = (d.message?.content ?? '').replace(/^```(json)?|```$/g, '').trim();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('La IA local devolvió una respuesta que no se pudo leer. Inténtalo de nuevo.');
    }
  };
  return inLine(async () => {
    try { return await once(); } catch (e) {
      // Un segundo intento: si Ollama se reinició o la respuesta salió cortada, casi siempre funciona.
      await ensureOllama();
      try { return await once(); } catch { throw e; }
    }
  });
}

/**
 * Texto para publicar redactado por la IA local: título, descripción y hashtags en español,
 * a partir de lo que se dice en el reel. No inventa datos.
 */
export async function llmPublish(speech: string, extra: { sector?: string | null; cta?: string; publico?: string }): Promise<{ title: string; description: string; hashtags: string[] }> {
  const r = await llmJson<{ titulo: string; descripcion: string; hashtags: string[] }>(
    'Eres community manager. Escribe en español el texto para publicar un reel de Instagram/TikTok a partir de lo que dice la persona: un título de máximo 8 palabras que enganche, una descripción de 2 a 3 frases cortas que resuma el valor y termine con un llamado a la acción, y de 5 a 8 hashtags relevantes sin tildes. No inventes cifras, nombres ni promesas que no estén en el texto. Responde solo JSON.',
    `Sector de la marca: ${extra.sector ?? 'no indicado'}.${extra.publico ? ` Público: ${extra.publico}.` : ''}${extra.cta ? ` Llamado a la acción preferido: «${extra.cta}».` : ''}\n\nLo que se dice en el reel: «${speech.slice(0, 2500)}»`,
    { type: 'object', properties: { titulo: { type: 'string' }, descripcion: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } } }, required: ['titulo', 'descripcion', 'hashtags'] },
    { temperature: 0.6, timeoutMs: 120_000 },
  );
  const tags = r.hashtags.map((h) => `#${h.replace(/^#+/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9ñÑ_]/g, '')}`).filter((h) => h.length > 2).slice(0, 9);
  return { title: r.titulo.trim(), description: r.descripcion.trim(), hashtags: tags };
}

/**
 * Gancho para la pantalla (3 a 7 palabras) a partir de lo que se dice al inicio. No copia la
 * frase: la condensa. Si sale largo, se pide una segunda versión más corta.
 */
export async function llmHook(said: string, audience?: string): Promise<string | null> {
  const schema = { type: 'object', properties: { gancho: { type: 'string' } }, required: ['gancho'] };
  const system = `Eres guionista de reels en español. A partir de lo que dice la persona al inicio, escribe el texto de gancho que aparece en pantalla en el primer segundo.
Reglas: de 3 a 7 palabras; NO copies la frase tal cual, condénsala en una idea que despierte curiosidad; fiel al mensaje; no inventes cifras ni datos; sin emojis, sin comillas, sin punto final.
Ejemplos:
«Hoy te voy a contar los tres errores que cometí al abrir mi restaurante» → 3 errores que casi me quiebran
«Si quieres ganar músculo tienes que dejar de hacer esto en el gimnasio» → Deja de hacer esto en el gym
«Mucha gente piensa que vender más es la solución pero no» → Vender más no es la solución
Responde solo JSON {"gancho": "..."}.`;
  const clean = (x: string) => x.replace(/["«»“”.]/g, '').replace(/\s+/g, ' ').trim();
  const who = audience ? `\nPúblico: ${audience} (escribe para esa persona).` : '';
  let r = await llmJson<{ gancho: string }>(system, `Lo que dice: «${said.slice(0, 400)}»${who}`, schema, { temperature: 0.7, timeoutMs: 60_000 });
  let hook = clean(r.gancho);
  if (hook.split(' ').length > 7) {
    r = await llmJson<{ gancho: string }>(system, `Lo que dice: «${said.slice(0, 400)}»${who}\nTu propuesta «${hook}» es muy larga: dame una de máximo 6 palabras.`, schema, { temperature: 0.7, timeoutMs: 60_000 });
    hook = clean(r.gancho);
  }
  const n = hook.split(' ').length;
  return n >= 2 && n <= 8 ? hook : null;
}

/** ¿Hay un modelo que vea imágenes? Devuelve su nombre. */
export async function visionReady(): Promise<string | undefined> {
  if (!(await getJson('/api/version', 1500)) && !(await ensureOllama())) return undefined;
  const tags = await getJson<{ models?: { name: string }[] }>('/api/tags');
  return pickVisionModel((tags?.models ?? []).map((m) => m.name));
}

/**
 * Como llmJson, pero el modelo además MIRA imágenes (rutas a .jpg/.png). Se descarga de la
 * memoria a los 2 minutos: con 16 GB no conviene tenerlo cargado junto al de texto.
 */
export async function visionJson<T>(system: string, user: string, images: string[], schema: object, opts: { temperature?: number; timeoutMs?: number } = {}): Promise<T> {
  const model = await visionReady();
  if (!model) throw new Error('No hay un modelo de visión descargado (ollama pull ${profile().recommendedVision}).');
  const b64 = await Promise.all(images.map(async (f) => (await readFile(f)).toString('base64')));
  return inLine(async () => {
    const r = await fetch(`${HOST}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: withJob(AbortSignal.timeout(opts.timeoutMs ?? 240_000)),
      body: JSON.stringify({
        model, stream: false, think: false, format: schema, keep_alive: '2m',
        options: { temperature: opts.temperature ?? 0.2, num_ctx: Math.min(16384, profile().maxCtx), num_thread: profile().threads },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user, images: b64 }],
      }),
    });
    if (!r.ok) throw new Error(`La IA de visión respondió ${r.status}. ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as { message?: { content?: string } };
    return JSON.parse((d.message?.content ?? '').replace(/^```(json)?|```$/g, '').trim()) as T;
  });
}

/**
 * Saca de la memoria los modelos de IA que estén cargados. Se llama antes de exportar: el render
 * necesita esa memoria (un modelo ocupa de 5 a 7 GB) y, con 16 GB, competir por ella lo deja colgado.
 */
export async function llmUnload(): Promise<void> {
  const ps = await getJson<{ models?: { name: string }[] }>('/api/ps', 1500);
  await Promise.all((ps?.models ?? []).map((m) => fetch(`${HOST}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000), body: JSON.stringify({ model: m.name, keep_alive: 0 }),
  }).catch(() => {})));
}

/**
 * Descarga un modelo de IA en Ollama, avisando el avance (0–1). Se usa al optimizar la app para
 * el computador: un equipo potente baja modelos más grandes; uno modesto, más livianos.
 */
export async function pullModel(name: string, onProgress: (p: number, msg: string) => void = () => {}): Promise<void> {
  if (!(await ensureOllama())) throw new Error('Ollama no está abierto ni instalado. Descárgalo gratis en ollama.com y vuelve a intentar.');
  const r = await fetch(`${HOST}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name, stream: true }) });
  if (!r.ok || !r.body) throw new Error(`Ollama no pudo descargar ${name} (${r.status}).`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      const m = JSON.parse(line) as { status?: string; total?: number; completed?: number; error?: string };
      if (m.error) throw new Error(`No se pudo descargar ${name}: ${m.error}`);
      const p = m.total ? (m.completed ?? 0) / m.total : 0;
      onProgress(p, m.total ? `Descargando ${name}: ${Math.round(p * 100)} % de ${(m.total / 1e9).toFixed(1)} GB` : `${name}: ${m.status ?? 'preparando'}…`);
    }
  }
  cachedModel = null;
}
