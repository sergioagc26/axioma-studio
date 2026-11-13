/**
 * Modelo de lenguaje local con Ollama (gratis, sin internet una vez descargado).
 * Se usa cuando Claude no está conectado: editar por chat, redactar ganchos y el texto para publicar.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';

const HOST = process.env.OLLAMA_HOST ? (/^https?:/.test(process.env.OLLAMA_HOST) ? process.env.OLLAMA_HOST : `http://${process.env.OLLAMA_HOST}`).replace(/\/$/, '') : 'http://127.0.0.1:11434';
/** Modelos que sirven, del mejor al más liviano. Se usa el primero que esté descargado. */
export const MODEL_CHOICES = ['qwen3:14b', 'qwen3:8b', 'qwen2.5:7b', 'llama3.1:8b', 'gemma3:4b', 'qwen3:4b'];
/** Modelos que ven imágenes (fotogramas), del mejor al más liviano. */
export const VISION_CHOICES = ['qwen3-vl:8b', 'qwen2.5vl:7b', 'qwen3-vl:4b', 'gemma3:4b'];
export const LOCAL_MODEL = process.env.AXIOMA_LLM || 'qwen3:8b';
/** Tiempo que el modelo queda cargado en memoria entre pedidos (respuestas inmediatas mientras trabajas). */
const KEEP_ALIVE = process.env.AXIOMA_LLM_KEEP_ALIVE || '30m';

export interface LlmStatus { running: boolean; version?: string; model?: string; vision?: string; installed: string[]; loaded: boolean; error?: string }

async function getJson<T>(p: string, ms = 2500): Promise<T | null> {
  try {
    const r = await fetch(`${HOST}${p}`, { signal: AbortSignal.timeout(ms) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

const matches = (name: string, want: string) => name === want || name === `${want}:latest` || (!want.includes(':') && name.startsWith(`${want}:`));

/** El modelo a usar: el que pida AXIOMA_LLM o el mejor descargado que quepa en la memoria. */
export function pickModel(installed: string[], ramGb = totalRamGb()): string | undefined {
  if (process.env.AXIOMA_LLM) return installed.find((n) => matches(n, process.env.AXIOMA_LLM!));
  // Con 16 GB o menos, uno de 14B deja poca memoria para el render: se prefiere el de 8B.
  const choices = ramGb > 20 ? MODEL_CHOICES : MODEL_CHOICES.filter((m) => !m.includes('14b'));
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
export function pickVisionModel(installed: string[]): string | undefined {
  const want = process.env.AXIOMA_VISION ? [process.env.AXIOMA_VISION] : VISION_CHOICES;
  for (const c of want) { const hit = installed.find((n) => matches(n, c)); if (hit) return hit; }
  return undefined;
}

let cachedModel: { name: string; at: number } | null = null;
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
    const r = await fetch(`${HOST}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model, keep_alive: KEEP_ALIVE }) });
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
export function contextFor(chars: number): number {
  const tokens = Math.ceil(chars / 3) + 2048;
  for (const n of [8192, 16384, 32768]) if (tokens <= n) return n;
  return 32768;
}

/**
 * Pide al modelo una respuesta en JSON que cumpla `schema` (salida estructurada de Ollama).
 * Temperatura baja: se busca precisión, no creatividad desbordada. Si falla una vez, reintenta.
 * `think: true` deja que el modelo razone antes de responder (más lento, mejor en pedidos difíciles).
 */
export async function llmJson<T>(system: string, user: string, schema: object, opts: { temperature?: number; timeoutMs?: number; think?: boolean } = {}): Promise<T> {
  if (!(await llmReady())) throw new Error('La IA local no está disponible. Revisa que Ollama esté instalado y con un modelo descargado (ollama pull qwen3:8b).');
  const model = await activeModel();
  const once = async (): Promise<T> => {
    let r: Response;
    try {
      r = await fetch(`${HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
        body: JSON.stringify({
          model, stream: false, think: Boolean(opts.think), format: schema, keep_alive: KEEP_ALIVE,
          options: { temperature: opts.temperature ?? 0.3, num_ctx: contextFor(system.length + user.length) },
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
export async function llmPublish(speech: string, extra: { sector?: string | null; cta?: string }): Promise<{ title: string; description: string; hashtags: string[] }> {
  const r = await llmJson<{ titulo: string; descripcion: string; hashtags: string[] }>(
    'Eres community manager. Escribe en español el texto para publicar un reel de Instagram/TikTok a partir de lo que dice la persona: un título de máximo 8 palabras que enganche, una descripción de 2 a 3 frases cortas que resuma el valor y termine con un llamado a la acción, y de 5 a 8 hashtags relevantes sin tildes. No inventes cifras, nombres ni promesas que no estén en el texto. Responde solo JSON.',
    `Sector de la marca: ${extra.sector ?? 'no indicado'}.${extra.cta ? ` Llamado a la acción preferido: «${extra.cta}».` : ''}\n\nLo que se dice en el reel: «${speech.slice(0, 2500)}»`,
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
export async function llmHook(said: string): Promise<string | null> {
  const schema = { type: 'object', properties: { gancho: { type: 'string' } }, required: ['gancho'] };
  const system = `Eres guionista de reels en español. A partir de lo que dice la persona al inicio, escribe el texto de gancho que aparece en pantalla en el primer segundo.
Reglas: de 3 a 7 palabras; NO copies la frase tal cual, condénsala en una idea que despierte curiosidad; fiel al mensaje; no inventes cifras ni datos; sin emojis, sin comillas, sin punto final.
Ejemplos:
«Hoy te voy a contar los tres errores que cometí al abrir mi restaurante» → 3 errores que casi me quiebran
«Si quieres ganar músculo tienes que dejar de hacer esto en el gimnasio» → Deja de hacer esto en el gym
«Mucha gente piensa que vender más es la solución pero no» → Vender más no es la solución
Responde solo JSON {"gancho": "..."}.`;
  const clean = (x: string) => x.replace(/["«»“”.]/g, '').replace(/\s+/g, ' ').trim();
  let r = await llmJson<{ gancho: string }>(system, `Lo que dice: «${said.slice(0, 400)}»`, schema, { temperature: 0.7, timeoutMs: 60_000 });
  let hook = clean(r.gancho);
  if (hook.split(' ').length > 7) {
    r = await llmJson<{ gancho: string }>(system, `Lo que dice: «${said.slice(0, 400)}»\nTu propuesta «${hook}» es muy larga: dame una de máximo 6 palabras.`, schema, { temperature: 0.7, timeoutMs: 60_000 });
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
  if (!model) throw new Error('No hay un modelo de visión descargado (ollama pull qwen3-vl:8b).');
  const b64 = await Promise.all(images.map(async (f) => (await readFile(f)).toString('base64')));
  return inLine(async () => {
    const r = await fetch(`${HOST}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(opts.timeoutMs ?? 240_000),
      body: JSON.stringify({
        model, stream: false, think: false, format: schema, keep_alive: '2m',
        options: { temperature: opts.temperature ?? 0.2, num_ctx: 16384 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user, images: b64 }],
      }),
    });
    if (!r.ok) throw new Error(`La IA de visión respondió ${r.status}. ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as { message?: { content?: string } };
    return JSON.parse((d.message?.content ?? '').replace(/^```(json)?|```$/g, '').trim()) as T;
  });
}
