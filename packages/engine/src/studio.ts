import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, watch } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pipeline as pipe } from 'node:stream/promises';
import { APP_NAME, Project } from '@axioma/schema';
import { ffmpeg } from './exec.ts';
import * as ops from './ops.ts';
import { P, REPO_ROOT, WORKSPACE } from './paths.ts';
import { cutProject, prepareMedia, transcribeProject } from './pipeline.ts';
import { allPresets, savePreset } from './presets.ts';
import { AssistantError, askClaude, claudeBin, claudeReady, openClaudeLogin } from './assistant.ts';
import { applyRecommendedTransitions } from './transitions.ts';
import { SFX, ensureUsedSfx, sfxFile } from './sfx.ts';
import { ttsProviders } from './tts.ts';
import { analyzeReference, listReferences, presetFromReference, referencesDir } from './reference.ts';
import { applyBrief } from './brief.ts';
import { readKit, saveKit } from './kit.ts';
import { readVision } from './vision.ts';
import { pickFolder, systemFonts } from './fonts.ts';
import { autoEdit, planAutoEdit } from './auto.ts';
import { speechOf } from '@axioma/schema';
import { llmPublish, llmReady } from './llm.ts';
import { localEdit } from './localedit.ts';
import { createClipProject, projectClips } from './clips.ts';
import { matchSceneColors } from './colormatch.ts';
import { BUILTIN_LUTS, applyLut, removeLut } from './lut.ts';
import { addTeaser, removeTeaser } from './teaser.ts';
import { searchLibrary, useLibraryHit } from './library.ts';
import { DUB_LANGUAGES, dubProject } from './dub.ts';
import { montageToBeat } from './beats.ts';
import { setFollowSpeaker } from './speakers.ts';
import { matchToReference } from './colorref.ts';
import { createImages } from './images.ts';
import { buildCutout } from './matte.ts';
import { addBankSound, searchSounds } from './sounds.ts';
import { downloadBroll, searchBroll } from './pexels.ts';
import { keyStatus, setEnvValue } from './env.ts';
import { brandFor, renderProject, timelineExtras } from './render.ts';
import { buildMontage, createMontage, detectShots } from './montage.ts';
import { safeJoin, sendFile } from './server.ts';
import { createProject, readProject, readTranscript, writeProject } from './store.ts';

export const STUDIO_PORT = Number(process.env.SE_STUDIO_PORT ?? 4747);
const DIST = path.join(REPO_ROOT, 'packages', 'studio', 'dist');

interface Job {
  id: string;
  kind: 'crear' | 'render' | 'referencia' | 'ia' | 'audio';
  status: 'running' | 'done' | 'error';
  message: string;
  progress: number;
  result?: Record<string, unknown>;
}
const jobs = new Map<string, Job>();
/** Archivos subidos que esperan a convertirse en proyecto (ficha → carpeta temporal). */
const uploads = new Map<string, string>();

function startJob(kind: Job['kind'], fn: (job: Job) => Promise<Record<string, unknown>>): Job {
  const job: Job = { id: `j${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, kind, status: 'running', message: 'Empezando…', progress: 0 };
  jobs.set(job.id, job);
  fn(job).then(
    (result) => Object.assign(job, { status: 'done', progress: 1, result, message: 'Listo' }),
    (e) => Object.assign(job, { status: 'error', message: e instanceof Error ? e.message : String(e) }),
  );
  return job;
}

async function findDir(id: string | null): Promise<string> {
  const all = await ops.listProjects();
  const hit = id ? all.find((p) => p.project.id === id) : all[0];
  if (!hit) throw Object.assign(new Error(id ? `No existe el proyecto ${id}.` : 'No hay proyectos.'), { status: 404 });
  return hit.dir;
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const json = (res: http.ServerResponse, data: unknown, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};

async function thumb(dir: string, t: number, rel?: string | null): Promise<string> {
  // Sin `rel`, la miniatura sale del proxy; con `rel`, de un archivo del proyecto (b-roll).
  const src = rel ? safeJoin(dir, rel) : path.join(dir, P.proxy);
  if (!src || !existsSync(src)) throw Object.assign(new Error('No existe el archivo.'), { status: 404 });
  const tag = rel ? path.basename(rel).replace(/[^\w.-]+/g, '_') + '-' : '';
  const out = path.join(dir, 'proxies', 'thumbs', `${tag}${Math.round(t * 1000)}.jpg`);
  if (!existsSync(out)) {
    await mkdir(path.dirname(out), { recursive: true });
    await ffmpeg(['-ss', t.toFixed(3), '-i', src, '-frames:v', '1', '-vf', 'scale=270:-2', '-q:v', '5', out]);
  }
  return out;
}

// --- Acceso desde otros equipos de la red (por ejemplo, el portátil) ---
let networkKey: string | null = null;
const isLoopback = (a?: string) => !a || a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';

/** Clave de acceso para la red: se crea una vez y se guarda en workspace/clave-red.txt. */
export async function lanKey(): Promise<string> {
  const file = path.join(WORKSPACE, 'clave-red.txt');
  try { const k = (await readFile(file, 'utf8')).trim(); if (k.length >= 12) return k; } catch { /* se crea */ }
  const { randomBytes } = await import('node:crypto');
  const k = randomBytes(12).toString('base64url');
  await mkdir(WORKSPACE, { recursive: true });
  await writeFile(file, k + '\n', { mode: 0o600 });
  return k;
}

/** Direcciones de este equipo en la red local (para abrir la app desde el portátil). */
export function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces()).flat().filter((i): i is os.NetworkInterfaceInfo => Boolean(i && i.family === 'IPv4' && !i.internal)).map((i) => i.address);
}

/**
 * Los equipos de la red necesitan la clave: la primera vez llega en el enlace (?clave=) y
 * queda guardada en una cookie del navegador. Este mismo computador no la necesita.
 * Devuelve true si la petición ya se respondió (rechazo o redirección).
 */
function guardNetwork(req: http.IncomingMessage, res: http.ServerResponse, url: URL): boolean {
  if (!networkKey || isLoopback(req.socket.remoteAddress)) return false;
  const cookie = /(?:^|;\s*)axioma=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  if (cookie === networkKey) return false;
  if (url.searchParams.get('clave') === networkKey) {
    url.searchParams.delete('clave');
    res.writeHead(302, { 'Set-Cookie': `axioma=${networkKey}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`, Location: url.pathname + (url.search || '') }).end();
    return true;
  }
  res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP_NAME}</title><body style="font-family:system-ui;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px"><div style="max-width:420px"><h1>${APP_NAME}</h1><p>Para entrar desde este equipo, abre el enlace con la clave que muestra el computador donde corre la app (empieza con <code>http://</code> y termina en <code>?clave=…</code>).</p></div>`);
  return true;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (guardNetwork(req, res, url)) return;
  const p = url.pathname;
  const id = url.searchParams.get('id');
  const method = req.method ?? 'GET';

  // Solo esta misma página puede escribir (evita que otra web local haga cambios).
  if (method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, { error: 'Origen no permitido.' }, 403);
  }

  if (p === '/api/ping') return json(res, { app: APP_NAME });
  // Claves de los bancos gratuitos: se guardan en .env; aquí solo se dice si están puestas.
  if (p === '/api/claves' && method === 'GET') return json(res, await keyStatus());
  if (p === '/api/claves' && method === 'POST') {
    const b = await readBody(req);
    await setEnvValue(b.banco === 'pexels' ? 'PEXELS_API_KEY' : b.banco === 'freesound' ? 'FREESOUND_API_KEY' : '', String(b.clave ?? ''));
    return json(res, await keyStatus());
  }
  if (p === '/api/pexels' && method === 'GET') return json(res, { results: await searchBroll(String(url.searchParams.get('q') ?? '').slice(0, 80), 9) });
  if (p === '/api/sonidos' && method === 'GET') return json(res, { results: await searchSounds(String(url.searchParams.get('q') ?? '').slice(0, 80)) });
  if (p === '/api/elegir-carpeta' && method === 'POST') return json(res, { folder: await pickFolder() });
  if (p === '/api/publicar' && method === 'POST') {
    // Texto para publicar redactado por la IA local.
    const dir = await findDir(id);
    if (!(await llmReady())) return json(res, { error: 'La IA local no está instalada o no está abierta.' }, 400);
    const pr = await readProject(dir);
    const t = await readTranscript(dir);
    const speech = pr.scenes.map((s) => speechOf(s, t)).join(' ');
    const kit = await readKit(pr.client);
    const cta = /digo en el video/i.test(pr.brief.cta ?? '') ? undefined : pr.brief.cta;
    return json(res, await llmPublish(speech, { sector: kit?.sector, cta }));
  }
  if (p === '/api/imagenes' && method === 'GET') {
    // Juegos de imágenes ya creados (el más reciente primero).
    const dir = await findDir(id);
    const base = path.join(dir, P.renders, 'imagenes');
    const sets = existsSync(base) ? (await readdir(base)).filter((d) => !d.startsWith('.')).sort().reverse() : [];
    const out = [];
    for (const d of sets.slice(0, 12)) {
      const files = (await readdir(path.join(base, d))).filter((f) => f.endsWith('.png')).sort();
      out.push({ name: d, tipo: d.split('-').pop(), files: files.map((f) => `${P.renders}/imagenes/${d}/${f}`) });
    }
    return json(res, { sets: out });
  }
  if (p === '/api/plan' && method === 'GET') return json(res, { plan: await planAutoEdit(await findDir(id)) });
  if (p === '/api/clips' && method === 'GET') return json(res, { clips: await projectClips(await findDir(id)) });
  if (p === '/api/fonts' && method === 'GET') return json(res, { fonts: await systemFonts(url.searchParams.get('actualizar') === '1') });
  if (p === '/api/claude' && method === 'GET') return json(res, { conectado: await claudeReady(url.searchParams.get('revisar') === '1'), local: await llmReady() });
  if (p === '/api/claude' && method === 'POST') { await openClaudeLogin(); return json(res, { ok: true }); }

  if (p === '/api/projects' && method === 'GET') {
    const all = await ops.listProjects();
    return json(res, all.map(({ project: x }) => ({
      id: x.id, name: x.name, client: x.client ?? 'personal', approval: x.approval, scenes: x.scenes.length, updatedAt: x.updatedAt,
    })));
  }

  if (p === '/api/upload' && method === 'POST') {
    // Sube un archivo a una carpeta temporal; devuelve una ficha para usarlo después.
    const token = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
    const folder = path.join(os.tmpdir(), `axioma-up-${token}`);
    await mkdir(folder, { recursive: true });
    await pipe(req, createWriteStream(path.join(folder, path.basename(url.searchParams.get('filename') ?? 'video.mp4'))));
    uploads.set(token, folder);
    return json(res, { token });
  }

  if (p === '/api/montajes' && method === 'POST') {
    const b = await readBody(req);
    const folders: string[] = (b.tokens ?? []).map((t: string) => uploads.get(t)).filter(Boolean);
    if (!folders.length) return json(res, { error: 'Sube al menos un video.' }, 400);
    const job = startJob('crear', async (j) => {
      const log = (m: string) => { j.message = m.trim(); };
      try {
        const { dir, project } = await createMontage({ inputs: folders, name: b.name || undefined, client: b.client || undefined, presetId: b.preset || undefined });
        j.progress = 0.2;
        await prepareMedia(dir, log);
        j.progress = 0.8;
        j.message = 'Detectando tomas y armando el montaje…';
        await detectShots(dir);
        await buildMontage(dir, { duration: b.duration || undefined });
        if (b.auto) { j.message = 'Editando todo el video…'; return { id: project.id, summary: (await autoEdit(dir)).summary }; }
        return { id: project.id };
      } finally {
        for (const [t, f] of uploads) if (folders.includes(f)) { uploads.delete(t); await rm(f, { recursive: true, force: true }); }
      }
    });
    return json(res, job);
  }

  if (p === '/api/projects' && method === 'POST') {
    // Subida de un video: el cuerpo es el archivo.
    const filename = path.basename(url.searchParams.get('filename') ?? 'video.mp4');
    const tmpDir = path.join(os.tmpdir(), `axioma-upload-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, filename);
    await pipe(req, createWriteStream(tmp));
    const job = startJob('crear', async (j) => {
      const log = (m: string) => { j.message = m.trim(); };
      try {
        const { dir, project } = await createProject({
          input: tmp,
          name: url.searchParams.get('name') || undefined,
          client: url.searchParams.get('client') || undefined,
          presetId: url.searchParams.get('preset') || undefined,
        });
        j.progress = 0.1;
        await prepareMedia(dir, log);
        j.progress = 0.4;
        await transcribeProject(dir, log);
        j.progress = 0.9;
        await cutProject(dir);
        // Edición automática al subir: el video llega al editor ya editado.
        if (url.searchParams.get('auto') === '1') { j.message = 'Editando todo el video…'; return { id: project.id, summary: (await autoEdit(dir)).summary }; }
        return { id: project.id };
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
    return json(res, job);
  }

  if (p.startsWith('/api/jobs/')) {
    const job = jobs.get(p.slice('/api/jobs/'.length));
    return job ? json(res, job) : json(res, { error: 'No existe la tarea.' }, 404);
  }

  if (p === '/api/project' && method === 'GET') {
    const dir = await findDir(id);
    const project = await readProject(dir);
    const media = (rel: string) => `/media/${encodeURIComponent(project.id)}/${rel.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
    await ensureUsedSfx(dir, project).catch(() => {}); // la vista previa necesita los sonidos en el proyecto
    return json(res, { project, transcript: await readTranscript(dir), presets: await allPresets(project.client), brand: await brandFor(project, media, dir), extras: await timelineExtras(dir, project, media), assistant: Boolean(claudeBin()), kit: await readKit(project.client), vision: await readVision(dir), sfx: Object.entries(SFX).map(([sid, d]) => ({ id: sid, name: d.name, description: d.description })), voices: await ttsProviders() });
  }

  if (p === '/api/project' && method === 'PUT') {
    const dir = await findDir(id);
    const parsed = Project.safeParse(await readBody(req));
    if (!parsed.success) return json(res, { error: 'Proyecto inválido: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
    return json(res, { project: await writeProject(dir, parsed.data) });
  }

  if (p === '/api/op' && method === 'POST') {
    const dir = await findDir(id);
    const b = await readBody(req);
    if (b.op === 'preset') return json(res, { project: await ops.applyPreset(dir, b.presetId) });
    if (b.op === 'marca') {
      // Guarda el perfil de la marca y viste el proyecto con su estilo.
      const project = await readProject(dir);
      const kit = await saveKit(project.client, { name: b.name || undefined, sector: b.sector || undefined, personality: b.personality || undefined, primary: b.primary || undefined, secondary: b.secondary || undefined });
      const applied = await ops.applyBrandStyle(dir);
      return json(res, { kit, project: applied?.project ?? project, why: applied?.why ?? null });
    }
    if (b.op === 'lut') {
      // LUT incluido (o solo cambiar la fuerza). '' lo quita.
      if (!b.lut && !b.fuerza) return json(res, { project: await removeLut(dir) });
      const job = startJob('ia', async (j) => {
        await applyLut(dir, { builtin: b.lut || undefined, strength: Number(b.fuerza) || undefined }, (m) => { j.message = m; });
        return {};
      });
      return json(res, job);
    }
    if (b.op === 'quitar-lut') return json(res, { project: await removeLut(dir) });
    if (b.op === 'adelanto') { const r = await addTeaser(dir); return json(res, { project: r.project, teaser: r.teaser }); }
    if (b.op === 'buscar-material') {
      // Busca en todo el material del mismo cliente (lo que se ve y lo que se dice).
      const job = startJob('ia', async (j) => {
        const r = await searchLibrary({ query: String(b.q ?? ''), near: dir, onProgress: (m) => { j.message = m; } });
        return { hits: r.hits, english: r.english };
      });
      return json(res, job);
    }
    if (b.op === 'usar-material') {
      const job = startJob('ia', async (j) => {
        j.message = 'Cortando el momento de tu material…';
        await useLibraryHit(dir, String(b.sceneId ?? ''), { projectId: String(b.projectId ?? ''), file: String(b.file ?? ''), t: Number(b.t) || 0, duration: Number(b.duracion) || undefined }, { asBackdrop: Boolean(b.fondo) });
        return {};
      });
      return json(res, job);
    }
    if (b.op === 'quitar-adelanto') return json(res, { project: await removeTeaser(dir) });
    if (b.op === 'igualar-color') { const r = await matchSceneColors(dir); return json(res, { project: r.project, changed: r.changed }); }
    if (b.op === 'crear-imagenes') {
      // Carrusel, post o historia a partir del reel.
      const tipo = ['carrusel', 'post', 'historia'].includes(b.tipo) ? b.tipo : 'carrusel';
      const job = startJob('crear', async (j) => {
        j.message = 'Preparando las imágenes…';
        const r = await createImages(dir, tipo, (m) => { j.message = m; });
        return { files: r.files, ai: r.ai };
      });
      return json(res, job);
    }
    if (b.op === 'seguir-hablante') {
      const job = startJob('ia', async (j) => {
        const r = await setFollowSpeaker(dir, Boolean(b.on), (m) => { j.message = m; });
        return { people: r.report?.tracks.length ?? 0, turns: r.report?.turns.length ?? 0 };
      });
      return json(res, job);
    }
    if (b.op === 'ritmo') {
      // Montaje con los cortes en los golpes de la música.
      const r = await montageToBeat(dir, { density: ['auto', 'pulso', 'medio', 'compas'].includes(b.densidad) ? b.densidad : 'auto', duration: Number(b.duracion) || undefined });
      return json(res, { project: r.project, bpm: r.bpm, cuts: r.cuts, duration: r.duration, drop: r.drop });
    }
    if (b.op === 'doblar') {
      // Copia del reel con la voz en otro idioma (la original no se toca).
      const job = startJob('ia', async (j) => {
        const r = await dubProject(dir, String(b.idioma ?? 'en'), { provider: b.provider || undefined, onProgress: (m, pr) => { j.message = m; if (pr != null) j.progress = pr; } });
        return { id: r.id, lines: r.lines, tight: r.tight, idioma: DUB_LANGUAGES[String(b.idioma ?? 'en')].name };
      });
      return json(res, job);
    }
    if (b.op === 'crear-clip') {
      // Reel nuevo con un tramo del video largo, ya editado con IA.
      const job = startJob('crear', async (j) => {
        j.message = 'Creando el reel del clip…';
        const made = await createClipProject(dir, { start: Number(b.start), end: Number(b.end), title: String(b.title ?? '') }, Number(b.n) || 1);
        j.message = 'Editando el clip…';
        const { summary } = await autoEdit(made.dir);
        return { id: made.id, summary };
      });
      return json(res, job);
    }
    if (b.op === 'auto-editar') {
      // Edición completa sin preguntas: referencia del cliente + tendencia del nicho + lo que se ve en el video.
      const job = startJob('crear', async (j) => {
        j.message = 'Editando todo el video…';
        const { summary } = await autoEdit(dir, { referenceId: b.refId });
        return { summary };
      });
      return json(res, job);
    }
    if (b.op === 'aplicar-brief') {
      // Arma la edición según las respuestas del brief.
      const job = startJob('crear', async (j) => {
        j.message = 'Armando tu edición según el brief…';
        const { summary } = await applyBrief(dir);
        return { summary };
      });
      return json(res, job);
    }
    if (b.op === 'guardar-referencia') {
      // Un solo paso: el estilo detectado en la referencia se guarda como plantilla y se aplica.
      const project = await readProject(dir);
      const report = (await listReferences(project.client)).find((r) => r.id === b.refId);
      if (!report) return json(res, { error: 'No existe esa referencia.' }, 404);
      const base = presetFromReference(report, b.name);
      const preset = await savePreset(project.client, { ...base, captions: { ...base.captions, ...(b.captions ?? {}) }, style: { ...base.style, ...(b.style ?? {}) } });
      const applied = b.aplicar === false ? project : await ops.applyPreset(dir, preset.id);
      return json(res, { preset, project: applied, presets: await allPresets(project.client) });
    }
    if (b.op === 'guardar-estilo') {
      const project = await readProject(dir);
      const preset = await ops.saveCurrentStyle(dir, String(b.name ?? '').trim() || 'Mi estilo');
      return json(res, { preset, presets: await allPresets(project.client) });
    }
    if (b.op === 'guardar-preset') {
      const project = await readProject(dir);
      const preset = await savePreset(project.client, b.preset);
      const applied = b.aplicar ? await ops.applyPreset(dir, preset.id) : project;
      return json(res, { preset, project: applied, presets: await allPresets(project.client) });
    }
    if (b.op === 'corregir-audio') {
      const job = startJob('audio', async (j) => {
        j.message = 'Limpiando y nivelando la voz…';
        await ops.correctAudio(dir, { denoise: b.denoise, level: b.level, enhance: b.enhance });
        return {};
      });
      return json(res, job);
    }
    if (b.op === 'voz-en-off') {
      const job = startJob('audio', async (j) => {
        j.message = 'Generando la voz en off…';
        const p = await ops.setVoiceover(dir, String(b.text ?? ''), { provider: b.provider || undefined, voice: b.voice || undefined });
        if (p.kind === 'montaje') {
          j.message = 'Ajustando el montaje a la voz…';
          await buildMontage(dir, {});
        }
        return {};
      });
      return json(res, job);
    }
    if (b.op === 'quitar-voz') return json(res, { project: await ops.removeVoiceover(dir) });
    if (b.op === 'efecto') return json(res, { project: await ops.addSfx(dir, b.sceneId, b.id, { offset: b.offset, volume: b.volume }) });
    if (b.op === 'efectos-auto') return json(res, { project: await ops.setAutoSfx(dir, Boolean(b.on)) });
    if (b.op === 'quitar-musica') return json(res, { project: await ops.setMusic(dir, null) });
    if (b.op === 'recomendar-transiciones') {
      const { advice } = await applyRecommendedTransitions(dir);
      return json(res, { project: await readProject(dir), advice });
    }
    if (b.op === 'ia') {
      // Le pide el cambio a Claude desde la app. Si Claude no está disponible, queda como petición.
      const project = await readProject(dir);
      const text = String(b.text ?? '').slice(0, 2000).trim();
      if (!text) return json(res, { error: 'Escribe qué quieres pedir.' }, 400);
      const job = startJob('ia', async (j) => {
        j.message = 'Claude está trabajando…';
        try {
          const r = await askClaude(project.id, text, (m) => { j.message = m; });
          return { text: r.text, tools: r.tools };
        } catch (e) {
          // Sin Claude, lo hace la IA local (Ollama) si está instalada.
          if (e instanceof AssistantError && e.code !== 'fallo' && (await llmReady())) {
            j.message = 'La IA local está editando…';
            const r = await localEdit(dir, text, b.sceneId);
            return { text: r.applied.length ? `${r.text} (${r.applied.join('; ')}). Queda una versión guardada de antes.` : r.text, local: true };
          }
          if (e instanceof AssistantError && e.code !== 'fallo') {
            await ops.addRequest(dir, text, b.sceneId);
            return { text: e.message, saved: true, code: e.code };
          }
          throw e;
        }
      });
      return json(res, job);
    }
    if (b.op === 'peticion') return json(res, { project: await ops.addRequest(dir, String(b.text ?? '').slice(0, 2000), b.sceneId) });
    if (b.op === 'version') return json(res, { name: await ops.saveVersion(dir, b.label) });
    if (b.op === 'recortar-fondo') {
      // Recorta a la persona de todo el video (una sola vez por proyecto).
      const job = startJob('ia', async (j) => {
        j.message = 'Recortando a la persona…';
        await buildCutout(dir, (pr, msg) => { j.progress = pr; j.message = msg; });
        return {};
      });
      return json(res, job);
    }
    if (b.op === 'broll-pexels') {
      // Descarga un video de Pexels (se vuelve a buscar para no confiar en una dirección de fuera) y lo pone en la escena.
      const item = (await searchBroll(String(b.q ?? ''), 15)).find((v) => v.id === Number(b.pexelsId));
      if (!item) return json(res, { error: 'Ese video ya no aparece en la búsqueda. Busca de nuevo.' }, 400);
      const file = await downloadBroll(dir, item);
      const info = { license: 'Pexels (uso comercial gratuito)', source: 'Pexels', author: item.author, url: item.url };
      if (b.fondo) return json(res, { project: await ops.setBackdropFile(dir, String(b.sceneId ?? ''), file) });
      return json(res, { project: await ops.setBroll(dir, String(b.sceneId ?? ''), file, info) });
    }
    if (b.op === 'efecto-banco') {
      const { project } = await addBankSound(dir, String(b.sceneId ?? ''), Number(b.soundId), { offset: Number(b.offset) || 0, volume: Number(b.volume) || 0.6 });
      return json(res, { project });
    }
    if (b.op === 'broll-idea') {
      const job = startJob('ia', async (j) => {
        j.message = 'Creando la imagen…';
        await ops.setBrollFromIdea(dir, String(b.sceneId ?? ''), String(b.idea ?? ''), Boolean(b.fondo));
        return {};
      });
      return json(res, job);
    }
    if (b.op === 'render') {
      // La calidad y la carpeta se eligen en la ventana de exportar y quedan recordadas.
      if (b.calidad || typeof b.carpeta === 'string' || b.lufs) {
        const pr = await readProject(dir);
        if ([-14, -16].includes(Number(b.lufs))) pr.audio.targetLufs = Number(b.lufs);
        if (['maxima', 'alta', 'ligera'].includes(b.calidad)) pr.export.quality = b.calidad;
        if (typeof b.carpeta === 'string') pr.export.folder = b.carpeta.trim() || undefined;
        await writeProject(dir, pr);
      }
      const job = startJob('render', async (j) => {
        j.message = 'Renderizando…';
        const { out } = await renderProject(dir, { format: b.formato, onProgress: (x) => { j.progress = x; } });
        const inside = !path.relative(dir, out).startsWith('..');
        return { file: inside ? path.relative(dir, out).split(path.sep).join('/') : null, path: out };
      });
      return json(res, job);
    }
    return json(res, { error: `Operación desconocida: ${b.op}` }, 400);
  }

  if (p === '/api/music' && method === 'POST') {
    // Sube la música de fondo. La licencia es obligatoria.
    const dir = await findDir(id);
    const tmpDir = path.join(os.tmpdir(), `axioma-music-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, path.basename(url.searchParams.get('filename') ?? 'musica.mp3'));
    await pipe(req, createWriteStream(tmp));
    try {
      const withMusic = await ops.setMusic(dir, tmp, { license: url.searchParams.get('license') ?? '', source: 'subida en el studio' });
      // En un montaje, los cortes se vuelven a poner en los golpes de la canción nueva.
      if (withMusic.kind === 'montaje') {
        try { return json(res, { project: (await buildMontage(dir, {})).project, ritmo: true }); } catch { /* queda el montaje anterior */ }
      }
      return json(res, { project: withMusic });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  if (p === '/api/voz' && method === 'POST') {
    // Voz grabada con el micrófono en el studio: pasa a ser la voz en off.
    const dir = await findDir(id);
    const tmpDir = path.join(os.tmpdir(), `axioma-voz-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, 'grabacion.webm');
    await pipe(req, createWriteStream(tmp));
    const job = startJob('audio', async (j) => {
      j.message = 'Limpiando y subtitulando tu voz…';
      try {
        const p2 = await ops.setVoiceoverFile(dir, tmp);
        if (p2.kind === 'montaje') await buildMontage(dir, {});
        return {};
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
    return json(res, job);
  }

  if (p === '/api/luts' && method === 'GET') {
    return json(res, Object.entries(BUILTIN_LUTS).map(([id, l]) => ({ id, name: l.name, description: l.description })));
  }

  if (p === '/api/lut' && method === 'POST') {
    // Sube un LUT propio (.cube) y lo aplica a todo el video.
    const dir = await findDir(id);
    const tmpDir = path.join(os.tmpdir(), `axioma-lut-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const name = path.basename(url.searchParams.get('filename') ?? 'lut.cube');
    const tmp = path.join(tmpDir, 'lut.cube');
    await pipe(req, createWriteStream(tmp));
    const job = startJob('ia', async (j) => {
      try {
        await applyLut(dir, { file: tmp, name, strength: Number(url.searchParams.get('fuerza')) || 0.8 }, (m) => { j.message = m; });
        return {};
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
    return json(res, job);
  }

  if (p === '/api/color-referencia' && method === 'POST') {
    // Sube una imagen (o video) de referencia e iguala el color del reel a ella.
    const dir = await findDir(id);
    const tmpDir = path.join(os.tmpdir(), `axioma-ref-color-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const name = path.basename(url.searchParams.get('filename') ?? 'referencia.jpg');
    const tmp = path.join(tmpDir, name.replace(/[^\w.-]+/g, '_'));
    await pipe(req, createWriteStream(tmp));
    const job = startJob('ia', async (j) => {
      try {
        await matchToReference(dir, tmp, { name, strength: Number(url.searchParams.get('fuerza')) || 0.85, onProgress: (m) => { j.message = m; } });
        return {};
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
    return json(res, job);
  }

  if (p === '/api/broll' && method === 'POST') {
    // Sube un clip y lo pone como b-roll de una escena. La licencia es obligatoria.
    const dir = await findDir(id);
    const tmpDir = path.join(os.tmpdir(), `axioma-broll-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, path.basename(url.searchParams.get('filename') ?? 'broll.mp4'));
    await pipe(req, createWriteStream(tmp));
    try {
      if (url.searchParams.get('fondo') === '1') return json(res, { project: await ops.setBackdropFile(dir, url.searchParams.get('scene') ?? '', tmp) });
      return json(res, { project: await ops.setBroll(dir, url.searchParams.get('scene') ?? '', tmp, { license: url.searchParams.get('license') ?? '', source: 'subido en el studio' }) });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  if (p.startsWith('/sfx/')) {
    // Vista previa de un efecto incluido.
    const sid = path.basename(p).replace(/\.wav$/, '');
    if (!SFX[sid] || !sendFile(req, res, await sfxFile(sid))) res.writeHead(404).end();
    return;
  }

  if (p === '/api/references' && method === 'GET') {
    const project = await readProject(await findDir(id));
    return json(res, await listReferences(project.client));
  }

  if (p === '/api/references' && method === 'POST') {
    const project = await readProject(await findDir(id));
    const filename = path.basename(url.searchParams.get('filename') ?? 'referencia.mp4');
    const tmpDir = path.join(os.tmpdir(), `axioma-ref-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, filename);
    await pipe(req, createWriteStream(tmp));
    const job = startJob('referencia', async (j) => {
      j.message = 'Analizando ritmo, música y colores…';
      try {
        const { report } = await analyzeReference(tmp, { client: project.client });
        return { report };
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
    return json(res, job);
  }

  if (p.startsWith('/ref/')) {
    // /ref/<cliente>/<referencia>/frames/01.jpg
    const [, , client, ...rest] = p.split('/').map(decodeURIComponent);
    const file = safeJoin(referencesDir(client), rest.join(path.sep));
    if (!file || !sendFile(req, res, file)) res.writeHead(404).end();
    return;
  }

  if (p === '/api/events') {
    const dir = await findDir(id);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': ok\n\n');
    let timer: NodeJS.Timeout | null = null;
    const push = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          res.write(`data: ${JSON.stringify(JSON.parse(await readFile(path.join(dir, P.project), 'utf8')))}\n\n`);
        } catch {
          /* archivo a medio escribir: llegará otro evento */
        }
      }, 80);
    };
    // El guardado es atómico (temporal + renombrar): según el sistema, el aviso
    // llega con el nombre del temporal o sin nombre.
    const watcher = watch(dir, (_e, f) => { if (!f || String(f).startsWith(P.project)) push(); });
    const beat = setInterval(() => res.write(': latido\n\n'), 25_000);
    req.on('close', () => { watcher.close(); clearInterval(beat); });
    return;
  }

  if (p === '/api/thumb') {
    const dir = await findDir(id);
    if (!sendFile(req, res, await thumb(dir, Math.max(0, Number(url.searchParams.get('t') ?? 0)), url.searchParams.get('file')))) res.writeHead(404).end();
    return;
  }

  if (p.startsWith('/media/')) {
    const [, , pid, ...rest] = p.split('/');
    const file = safeJoin(await findDir(decodeURIComponent(pid)), rest.map(decodeURIComponent).join(path.sep));
    if (!file || !sendFile(req, res, file)) res.writeHead(404).end();
    return;
  }

  if (p.startsWith('/api/')) return json(res, { error: 'No existe.' }, 404);

  // Interfaz (SPA).
  const file = safeJoin(DIST, p === '/' ? 'index.html' : decodeURIComponent(p));
  if (file && sendFile(req, res, file)) return;
  if (!sendFile(req, res, path.join(DIST, 'index.html'))) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('El studio no está compilado. Corre: npm run build:studio');
  }
}

let running: Promise<string> | null = null;

/** Arranca el studio (o reutiliza el que ya corre) y devuelve su URL base. */
export function startStudio(opts: { network?: boolean } = {}): Promise<string> {
  running ??= new Promise<string>(async (resolve, reject) => {
    // En modo red se escucha en todas las interfaces y se exige la clave a los demás equipos.
    if (opts.network) networkKey = await lanKey();
    const base = `http://127.0.0.1:${STUDIO_PORT}`;
    const server = http.createServer((req, res) => {
      handle(req, res).catch((e) => {
        // Queda escrito qué falló, para poder diagnosticarlo después.
        const line = `${new Date().toISOString()} ${req.method} ${req.url} → ${e instanceof Error ? e.stack ?? e.message : e}\n`;
        mkdir(WORKSPACE, { recursive: true }).then(() => appendFile(path.join(WORKSPACE, 'studio-errores.log'), line)).catch(() => {});
        if (!res.headersSent) json(res, { error: e instanceof Error ? e.message : String(e) }, e?.status ?? 500);
        else res.end();
      });
    });
    server.on('error', async (e: NodeJS.ErrnoException) => {
      if (e.code !== 'EADDRINUSE') return reject(e);
      // Puede que ya haya un studio abierto por otro proceso: se reutiliza.
      try {
        const r = await fetch(`${base}/api/ping`);
        if ((await r.json()).app === APP_NAME) return resolve(base);
      } catch { /* no es nuestro */ }
      reject(new Error(`El puerto ${STUDIO_PORT} está ocupado por otro programa. Usa SE_STUDIO_PORT para cambiarlo.`));
    });
    server.listen(STUDIO_PORT, opts.network ? '0.0.0.0' : '127.0.0.1', () => resolve(base));
  });
  return running;
}

export function studioUrl(base: string, screen = 'storyboard', projectId?: string) {
  return `${base}/#/${screen}${projectId ? `?p=${encodeURIComponent(projectId)}` : ''}`;
}

/** Abre una URL en el navegador por defecto (Mac, Windows, Linux). */
export function openBrowser(url: string) {
  const [bin, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  spawn(bin, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}
