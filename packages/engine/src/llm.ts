/**
 * Modelo de lenguaje local con Ollama (gratis, sin internet una vez descargado).
 * Se usa cuando Claude no está conectado: editar por chat, redactar ganchos y el texto para publicar.
 */
const HOST = process.env.OLLAMA_HOST?.replace(/\/$/, '') || 'http://127.0.0.1:11434';
export const LOCAL_MODEL = process.env.AXIOMA_LLM || 'qwen3:8b';

/** ¿Está Ollama corriendo y con el modelo descargado? */
export async function llmReady(): Promise<boolean> {
  try {
    const r = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return false;
    const d = (await r.json()) as { models?: { name: string }[] };
    return Boolean(d.models?.some((m) => m.name === LOCAL_MODEL || m.name.startsWith(`${LOCAL_MODEL}:`)));
  } catch {
    return false;
  }
}

/**
 * Pide al modelo una respuesta en JSON que cumpla `schema` (salida estructurada de Ollama).
 * Temperatura baja: se busca precisión, no creatividad desbordada.
 */
export async function llmJson<T>(system: string, user: string, schema: object, opts: { temperature?: number; timeoutMs?: number } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
      body: JSON.stringify({
        model: LOCAL_MODEL, stream: false, think: false, format: schema,
        options: { temperature: opts.temperature ?? 0.3, num_ctx: 8192 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
  } catch {
    throw new Error('La IA local no respondió. Revisa que Ollama esté abierto (brew services start ollama).');
  }
  if (!r.ok) throw new Error(`La IA local respondió ${r.status}. ${(await r.text()).slice(0, 200)}`);
  const d = (await r.json()) as { message?: { content?: string } };
  const text = (d.message?.content ?? '').replace(/^```(json)?|```$/g, '').trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('La IA local devolvió una respuesta que no se pudo leer. Inténtalo de nuevo.');
  }
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
