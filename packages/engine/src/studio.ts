import { stabilize, unstabilize } from './stabilize.ts';
import { saveSettings, settings } from './settings.ts';
import { synthesize } from './tts.ts';
import { doctor } from './doctor.ts';
import { forgetModel, hardwareProfile, llmJson, modelSizeB, pullModel } from './llm.ts';
import { REQUISITOS, detectMachine, planFor } from './machine.ts';
import { AI_VOICES } from '@axioma/schema';
import { cancelScope, isCancelled, newCancelScope, runCancellable, type CancelScope } from './cancel.ts';
import { dictate, downloadReference, igSession, linkKind, profileVideos, removeIgCookies, saveIgCookies, setIgSession, type IgSessionMode } from './refsource.ts';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, watch, readdirSync } from 'node:fs';
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
import { hasSpeech } from './transcribe.ts';
import { allPresets, deletePreset, renamePreset, savePreset } from './presets.ts';
import { claudeBin, openClaudeLogin } from './assistant.ts';
import { applyRecommendedTransitions } from './transitions.ts';
import { SFX, ensureUsedSfx, sfxFile } from './sfx.ts';
import { ttsProviders } from './tts.ts';
import { createCreatorReel, listAvatars } from './creator.ts';
import { voiceCatalog } from './tts.ts';
import { analyzeReference, deleteReference, listReferences, presetFromReference, referencesDir, renameReference, updateReferenceWish, type ReferenceReport } from './reference.ts';
import { applyBrief } from './brief.ts';
import { readKit, saveKit } from './kit.ts';
import { readVision } from './vision.ts';
import { pickFolder, systemFonts } from './fonts.ts';
import { autoEdit, editEverything, planAutoEdit } from './auto.ts';
import { outputDuration, speechOf } from '@axioma/schema';
import { llmPublish, llmReady, llmStatus, llmWarmUp } from './llm.ts';
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
import { setSlowMotion } from './slowmo.ts';
import { setVideoQuality } from './quality.ts';
import { setCaptionLanguage } from './subtitles.ts';
import { renderHookVariants } from './hooks.ts';
import { duplicateProject, trashProject } from './manage.ts';
import { saveClientLogo } from './kit.ts';
import { addReviewComment, approveReview, ensureReviewToken, findByToken, publicReview, resetReviewToken, reviewVideo } from './review.ts';
import { reviewPageHtml } from './review-page.ts';
import { MUSIC_DIR, addTrack, keepEdits, listTracks, rebeatMontage, removeTrack, renameTrack, useLibraryTrack, autoMusic, stockMusic } from './musiclib.ts';
import { splitIntoParts } from './series.ts';
import { addEntry, listEntries, removeEntry, updateEntry } from './calendar.ts';
import { brandbookFile, createBrandbook } from './brandbook.ts';
import { backupStatus, runBackup, scheduleBackups } from './backup.ts';
import { learnFromResults } from './results.ts';
import { connectPage, connectUrl, connectWithToken, disconnectAccount, finishConnect, prePublish, publishReel, redact, socialStatus, startMetricsTimer, syncMetrics } from './social.ts';
import { buildPrompt, suggestBrief } from './briefai.ts';
import { applyUpdate, applyUpdateFromZip, checkUpdate, restartStudio } from './update.ts';
import { createImages } from './images.ts';
import { buildCutout } from './matte.ts';
import { addBankSound, searchSounds } from './sounds.ts';
import { downloadBroll, searchBroll } from './pexels.ts';
import { envValue, keyStatus, removeEnvValue, setEnvValue } from './env.ts';
import { applyScript, readScript, resyncToVoice, saveScript, writeScript } from './script.ts';
import { cutProjectToScript } from './scriptcut.ts';
import { TAG_NAMES, setShotTag, tagShots } from './voicesync.ts';
import { Guion, PROJECT_SHAPES, guionMarkdown, type ProjectShape } from '@axioma/schema';
import { brandFor, lastExport, recordExport, renderProject, timelineExtras } from './render.ts';
import { buildMontage, createMontage, detectShots, asMontage } from './montage.ts';
import { safeJoin, sendFile } from './server.ts';
import { ORDER_QUESTIONS, READY_DIR, ensureInbox, findOrder, listOrders, makeOrder, orderFolder, parseOrder, saveOrderText } from './inbox.ts';
import { createProject, readProject, readTranscript, writeProject } from './store.ts';
import { emptyTrash, listTrash, restoreTrash } from './trash.ts';

export const STUDIO_PORT = Number(process.env.SE_STUDIO_PORT ?? 4747);
const DIST = path.join(REPO_ROOT, 'packages', 'studio', 'dist');

interface Job {
  id: string;
  /** 'nuevo' = se está creando un proyecto; 'crear' = edición completa (aplicar-brief, auto-editar). */
  kind: 'nuevo' | 'crear' | 'render' | 'referencia' | 'ia' | 'audio' | 'publicar' | 'metricas' | 'actualizar' | 'copia';
  status: 'running' | 'done' | 'error';
  message: string;
  progress: number;
  result?: Record<string, unknown>;
  /** Proyecto al que pertenece (para retomar el avance tras recargar). */
  projectId?: string;
  /** Se canceló a pedido del usuario (status queda en 'error' con el mensaje «Cancelado.»). */
  cancelled?: boolean;
  /** Se puede cancelar (las publicaciones y actualizaciones no: a medias podrían dejar algo roto). */
  cancellable?: boolean;
}
const jobs = new Map<string, Job>();
// Pedido → trabajo que lo está haciendo (para no lanzar dos veces el mismo y mostrar su avance).
const orderJobs = new Map<string, string>();
/** Cómo parar cada trabajo en marcha. */
const scopes = new Map<string, CancelScope>();
/** Trabajos que no se cancelan a mitad: publicar en redes, actualizar la app y copias de seguridad. */
const NOT_CANCELLABLE: Job['kind'][] = ['publicar', 'actualizar', 'copia', 'metricas'];
/** Archivos subidos que esperan a convertirse en proyecto (ficha → carpeta temporal). */
const uploads = new Map<string, string>();

const startOpJob = (kind: Job['kind'], fn: (job: Job) => Promise<Record<string, unknown>>, projectId?: string) => startJob(kind, fn, projectId);
function startJob(kind: Job['kind'], fn: (job: Job) => Promise<Record<string, unknown>>, projectId?: string): Job {
  const job: Job = { id: `j${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, kind, status: 'running', message: 'Empezando…', progress: 0, cancellable: !NOT_CANCELLABLE.includes(kind), ...(projectId ? { projectId } : {}) };
  jobs.set(job.id, job);
  const scope = newCancelScope();
  scopes.set(job.id, scope);
  // Las tareas terminadas se olvidan a la hora, para no acumularlas.
  const forget = () => { scopes.delete(job.id); setTimeout(() => jobs.delete(job.id), 3_600_000).unref(); };
  // Foto del proyecto al empezar: si se cancela, queda como estaba (nada a medias).
  const snapshot = projectId && kind !== 'nuevo' ? findDir(projectId).then(async (d) => ({ dir: d, json: await readFile(path.join(d, P.project), 'utf8') })).catch(() => null) : Promise.resolve(null);
  runCancellable(scope, async () => { await snapshot; return fn(job); }).then(
    (result) => { Object.assign(job, { status: 'done', progress: 1, result, message: 'Listo' }); forget(); },
    async (e) => {
      if (scope.controller.signal.aborted || isCancelled(e)) {
        const snap = await snapshot;
        if (snap) await writeFile(path.join(snap.dir, P.project), snap.json).catch(() => {});
        Object.assign(job, { status: 'error', cancelled: true, message: 'Cancelado.' });
      } else Object.assign(job, { status: 'error', message: e instanceof Error ? e.message : String(e) });
      forget();
    },
  );
  return job;
}

/** Tarea en marcha de ese tipo para ese proyecto (para no lanzar dos iguales a la vez). */
const runningJob = (projectId: string, kind: Job['kind'], tag?: string) => [...jobs.values()].find((j) => j.status === 'running' && j.projectId === projectId && j.kind === kind && (!tag || (j as Job & { tag?: string }).tag === tag));

/** Carpeta de cada proyecto ya encontrada: evita leer todos los proyectos en cada miniatura. */
const dirCache = new Map<string, string>();
async function findDir(id: string | null): Promise<string> {
  const known = id ? dirCache.get(id) : undefined;
  if (known && existsSync(path.join(known, P.project))) return known;
  const all = await ops.listProjects();
  for (const p of all) dirCache.set(p.project.id, p.dir);
  const hit = id ? all.find((p) => p.project.id === id) : all[0];
  if (!hit) throw Object.assign(new Error(id ? `No existe el proyecto ${id}.` : 'No hay proyectos.'), { status: 404 });
  return hit.dir;
}

/** Direcciones con las que se puede abrir la app: localhost o una IP (nunca un nombre de otra web). */
const HOST_OK = /^(localhost|127\.0\.0\.1|\[::1\]|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])(:\d{1,5})?$/i;

const CACHE_DAY = { 'Cache-Control': 'max-age=86400' };

/** Qué variable del .env guarda la clave de cada banco. */
const KEY_ENV: Record<string, string> = { pexels: 'PEXELS_API_KEY', pixabay: 'PIXABAY_API_KEY', freesound: 'FREESOUND_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY', fish: 'FISH_API_KEY', heygen: 'HEYGEN_API_KEY', meta_app_id: 'META_APP_ID', meta_app_secret: 'META_APP_SECRET', meta_config_id: 'META_CONFIG_ID', meta_api_version: 'META_API_VERSION' };

/** Archivo exportado relativo al proyecto (para /media/<id>/<file>), o null si quedó fuera. */
const relOut = (dir: string, out: string) => { const r = path.relative(dir, out); return r.startsWith('..') || path.isAbsolute(r) ? null : r.split(path.sep).join('/'); };

/** La comprobación de versión nueva va por internet: se recuerda 15 minutos. */
let updateCache: { at: number; data: unknown } | null = null;

/** Lo que dice el brief del cliente, en una línea (para adaptar ideas de una referencia a su marca). */
const briefContext = (p: Project) => [p.brief.notas, p.brief.publico && `Público: ${p.brief.publico}`, p.brief.objetivo && `Objetivo: ${p.brief.objetivo}`, p.brief.tono && `Tono: ${p.brief.tono}`].filter(Boolean).join(' · ').slice(0, 800) || undefined;

/** Última muestra de voz generada en Configuración. */
let sampleFile: string | null = null;

/** Forma del proyecto pedida al crearlo (si no es válida, vertical). */
const shapeParam = (v: unknown): ProjectShape | undefined => (typeof v === 'string' && v in PROJECT_SHAPES ? (v as ProjectShape) : undefined);

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
/** Las cuentas de las redes y los datos de la app de Meta solo se tocan desde este mismo computador. */
function soloLocal(req: http.IncomingMessage) {
  if (!isLoopback(req.socket.remoteAddress)) throw Object.assign(new Error('Las cuentas se conectan desde el computador donde está instalada la app.'), { status: 403 });
}
const escHtml = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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

/** ¿Es una dirección de Tailscale? (red privada entre tus equipos, funciona fuera de casa). */
export const isTailscale = (ip: string) => { const [a, b] = ip.split('.').map(Number); return a === 100 && b >= 64 && b <= 127; };

/** Enlaces para abrir la app desde otros equipos: en la misma Wi-Fi y, con Tailscale, desde cualquier lugar. */
export async function accessLinks(): Promise<{ active: boolean; tailscale: boolean; links: { kind: 'wifi' | 'fuera'; url: string }[] }> {
  if (!networkKey) return { active: false, tailscale: false, links: [] };
  const ips = lanAddresses();
  return {
    active: true, tailscale: ips.some(isTailscale),
    links: ips.map((ip) => ({ kind: isTailscale(ip) ? 'fuera' as const : 'wifi' as const, url: `http://${ip}:${STUDIO_PORT}/?clave=${networkKey}` })),
  };
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

/**
 * Enlace de revisión del cliente: /r/<clave> (página) y /api/r/<clave>/… (datos, video, comentar,
 * aprobar). No pide la clave de la red: la clave del enlace solo da acceso a ese reel.
 */
async function handleReview(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const m = url.pathname.match(/^\/(r|api\/r)\/([\w-]{12,40})(?:\/(video|comentario|aprobar))?$/);
  if (!m) return false;
  const [, kind, token, action] = m;
  const method = req.method ?? 'GET';
  const hit = await findByToken(token);
  if (!hit) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Este enlace de revisión ya no funciona.'); return true; }
  if (kind === 'r' && !action && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }).end(reviewPageHtml(token));
    return true;
  }
  if (method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) { json(res, { error: 'Origen no permitido.' }, 403); return true; }
  }
  const video = await reviewVideo(hit.dir, hit.project);
  if (!action && method === 'GET') { json(res, publicReview(hit.project, video.exported)); return true; }
  if (action === 'video' && method === 'GET') { if (!video.file || !sendFile(req, res, video.file)) res.writeHead(404).end(); return true; }
  if (action === 'comentario' && method === 'POST') {
    const b = await readBody(req);
    const project = await addReviewComment(hit.dir, { name: String(b.name ?? ''), text: String(b.text ?? ''), time: Number(b.time) });
    json(res, publicReview(project, video.exported));
    return true;
  }
  if (action === 'aprobar' && method === 'POST') {
    const b = await readBody(req);
    json(res, publicReview(await approveReview(hit.dir, String(b.name ?? '')), video.exported));
    return true;
  }
  res.writeHead(405).end();
  return true;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (await handleReview(req, res, url)) return;
  // Solo se atiende si la dirección pedida es «localhost» o una IP: una web con otro nombre que
  // apunte a este equipo (DNS rebinding) pasaría el control de origen y podría leer o cambiar todo.
  // Los enlaces de revisión (/r/…) van antes: llevan su propia clave.
  if (!HOST_OK.test(req.headers.host ?? '')) return json(res, { error: 'Abre la app con «localhost» o con la IP de este computador.' }, 403);
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
    // Los datos de la app de Meta (para publicar en Instagram) solo se cambian desde este computador.
    if (String(b.banco).startsWith('meta_')) soloLocal(req);
    await setEnvValue(KEY_ENV[String(b.banco)] ?? '', String(b.clave ?? ''));
    return json(res, await keyStatus());
  }
  if (p === '/api/claves' && method === 'DELETE') {
    // Quitar una clave: solo desde este computador.
    if (!isLoopback(req.socket.remoteAddress)) return json(res, { error: 'Las claves se quitan desde el computador donde está instalada la app.' }, 403);
    const name = KEY_ENV[String(url.searchParams.get('banco'))];
    if (!name || name.startsWith('META_')) return json(res, { error: 'No conozco esa clave.' }, 400);
    await removeEnvValue(name);
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
    return json(res, await llmPublish(speech, { sector: kit?.sector, cta, publico: pr.brief.publico }));
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
  // Ya no se comprueba Claude: esa comprobación gastaba créditos. Todo va con la IA local.
  // Configuración de la app: IA, voz por defecto, exportación y forma por defecto, y estado del sistema.
  if (p === '/api/ajustes' && method === 'GET') {
    // Qué modelos caben en la memoria de este computador (uno que no cabe lo deja colgado).
    const { maxB } = hardwareProfile();
    const ia = await llmStatus();
    const caben = Object.fromEntries(ia.installed.map((m) => [m, modelSizeB(m) <= maxB + 6]));
    return json(res, { ajustes: settings(), ia, caben, voces: await ttsProviders(), vocesIA: AI_VOICES.map((v) => ({ id: v.id, name: v.name })) });
  }
  if (p === '/api/ajustes' && method === 'PUT') {
    const saved = await saveSettings(await readBody(req), (m) => modelSizeB(m) <= hardwareProfile().maxB + 6);
    forgetModel();
    return json(res, { ajustes: saved, ia: await llmStatus() });
  }
  if (p === '/api/sistema' && method === 'GET') return json(res, await doctor());
  // El computador: qué es, qué le cabe y los requisitos de la app.
  if (p === '/api/equipo' && method === 'GET') {
    const m = await detectMachine(url.searchParams.get('actualizar') === '1');
    const ia = await llmStatus();
    return json(res, { equipo: m, plan: planFor(m, ia.installed), requisitos: REQUISITOS, instalados: ia.installed, ajustes: settings() });
  }
  // Optimizar la app para este computador: modelos, transcripción, voz y exportación.
  if (p === '/api/equipo/optimizar' && method === 'POST') {
    const m = await detectMachine(true);
    const ia = await llmStatus();
    const plan = planFor(m, ia.installed);
    const has = (x: string | null) => Boolean(x && ia.installed.some((n) => n === x || n === `${x}:latest`));
    const voces = await ttsProviders();
    const saved = await saveSettings({
      // El modelo solo se fija si ya está descargado; si no, queda «que elija la app» hasta bajarlo.
      llm: has(plan.llm) ? plan.llm : '', vision: has(plan.vision) ? plan.vision! : '',
      whisper: plan.whisper, renderProcesos: plan.renderProcesos,
      voz: { proveedor: plan.voz === 'qwen' && voces.includes('qwen') ? 'qwen' : undefined, voz: settings().voz?.voz },
      optimizado: { at: new Date().toISOString(), equipo: `${m.cpu} · ${m.ramGb} GB` },
    });
    forgetModel();
    const faltan = [plan.llm, plan.vision].filter((x): x is string => Boolean(x) && !has(x));
    return json(res, { ajustes: saved, plan, faltan });
  }
  if (p === '/api/equipo/descargar' && method === 'POST') {
    const modelo = String((await readBody(req)).modelo ?? '');
    if (!/^[a-z0-9._-]+:[a-z0-9._-]+$/i.test(modelo)) return json(res, { error: 'Nombre de modelo no válido.' }, 400);
    const job = startJob('ia', async (j) => {
      j.message = `Preparando la descarga de ${modelo}…`;
      await pullModel(modelo, (pr, msg) => { j.progress = pr; j.message = msg; });
      // Recién descargado y es el que le toca a este equipo: queda elegido.
      const plan = planFor(await detectMachine(), (await llmStatus()).installed);
      if (modelo === plan.llm) await saveSettings({ llm: modelo });
      if (modelo === plan.vision) await saveSettings({ vision: modelo });
      forgetModel();
      return { modelo };
    });
    return json(res, job);
  }
  if (p === '/api/ajustes/probar-ia' && method === 'POST') {
    const t0 = Date.now();
    try {
      const r = await llmJson<{ frase: string }>('Responde en español, solo JSON.', 'Escribe una frase corta y alegre para un editor de videos llamado Axi.', { type: 'object', properties: { frase: { type: 'string' } }, required: ['frase'] }, { timeoutMs: 120_000 });
      return json(res, { ok: true, text: `Funciona (${((Date.now() - t0) / 1000).toFixed(0)} s): «${r.frase}»` });
    } catch (e) { return json(res, { ok: false, text: (e as Error).message }); }
  }
  if (p === '/api/ajustes/probar-voz' && method === 'POST') {
    // Muestra corta de una voz: se genera en una carpeta temporal y se sirve una vez.
    const body = await readBody(req);
    const out = path.join(os.tmpdir(), `axioma-muestra-${Date.now()}.wav`);
    try {
      const used = await synthesize(String(body.texto || 'Hola, soy Axi. Dale play a tu idea.'), out, { provider: body.proveedor || undefined, voice: body.voz || undefined });
      sampleFile = out;
      return json(res, { ok: true, url: `/api/ajustes/muestra.wav?v=${Date.now()}`, text: `Voz: ${used.provider}${used.voice ? ` (${used.voice})` : ''}.${used.aviso ? ` ${used.aviso}` : ''}` });
    } catch (e) { return json(res, { ok: false, text: (e as Error).message }); }
  }
  if (p === '/api/ajustes/muestra.wav' && method === 'GET') {
    if (!sampleFile || !sendFile(req, res, sampleFile)) res.writeHead(404).end();
    return;
  }
  if (p === '/api/claude' && method === 'GET') return json(res, { conectado: false, local: await llmReady(), ia: await llmStatus() });
  if (p === '/api/claude' && method === 'POST') { await openClaudeLogin(); return json(res, { ok: true }); }

  if (p === '/api/projects' && method === 'GET') {
    const all = await ops.listProjects();
    const making = new Set([...jobs.values()].filter((j) => j.kind === 'nuevo' && j.status === 'running' && j.projectId).map((j) => j.projectId));
    // «Editado»: se aplicó el brief, o el proyecto ya tiene brief y escenas armadas, o ya se exportó
    // (los que arma Claude con las herramientas no pasan por la pantalla del brief).
    const exported = (d: string) => { try { return readdirSync(path.join(d, 'renders')).some((f) => f.endsWith('.mp4')); } catch { return false; } };
    return json(res, all.map(({ project: x, dir: d }) => ({
      id: x.id, name: x.name, client: x.client ?? 'personal', approval: x.approval, scenes: x.scenes.length, updatedAt: x.updatedAt,
      kind: x.kind, duration: +outputDuration(x).toFixed(1),
      edited: Boolean(x.briefAppliedAt) || (Object.keys(x.brief ?? {}).length >= 3 && x.scenes.length > 0) || exported(d), creating: making.has(x.id),
      // Miniatura: un fotograma del medio de la primera escena.
      thumbT: (() => { const r = x.scenes[0]?.ranges[0]; return r ? +((r.start + r.end) / 2).toFixed(2) : 1; })(),
    })));
  }

  // Pedidos («Para editar» → «Listos»): dejar el material y que la app haga el video sola.
  if (p === '/api/pedidos' && method === 'GET') {
    const { inbox, ready } = await ensureInbox();
    const orders = await listOrders();
    const b = (f?: string) => (f ? path.relative(orderPathOf(f), f) : undefined);
    const orderPathOf = (f: string) => orders.find((o) => f.startsWith(o.path + path.sep))?.path ?? path.dirname(f);
    return json(res, {
      inbox, ready, questions: ORDER_QUESTIONS,
      orders: await Promise.all(orders.map(async (o) => {
        const parsed = o.files.pedido ? parseOrder(await readFile(o.files.pedido, 'utf8').catch(() => '')) : null;
        const run = orderJobs.get(o.name);
        const job = run ? jobs.get(run) : undefined;
        return {
          name: o.name, loose: o.path === o.files.videos[0],
          files: { videos: o.files.videos.map((f) => b(f)!), referencias: o.files.referencias.map((f) => b(f)!), guion: b(o.files.guion), pedido: b(o.files.pedido), logo: b(o.files.logo), musica: b(o.files.musica), otros: o.files.otros.map((f) => b(f)!) },
          answers: parsed ? { ...parsed.brief, ...parsed.brandText, ...(parsed.client ? { cliente: parsed.client } : {}) } : {},
          state: o.state.video && !existsSync(o.state.video) ? { ...o.state, video: undefined } : o.state,
          job: job?.status === 'running' ? job : undefined,
        };
      })),
    });
  }
  if (p === '/api/pedidos/subir' && method === 'POST') {
    // Un archivo del pedido, directo a su carpeta (se crea si no existe). Nombre de archivo sin rutas.
    const dir = await orderFolder(url.searchParams.get('pedido') ?? '');
    const name = path.basename(url.searchParams.get('filename') ?? '').replace(/^\.+/, '');
    if (!name) return json(res, { error: 'Falta el nombre del archivo.' }, 400);
    await pipe(req, createWriteStream(path.join(dir, name)));
    return json(res, { ok: true, file: name });
  }
  if (p === '/api/pedidos/pedido' && method === 'POST') {
    const body = await readBody(req);
    await saveOrderText(body.pedido ?? '', body.respuestas ?? {});
    return json(res, { ok: true });
  }
  if (p === '/api/pedidos/hacer' && method === 'POST') {
    const body = await readBody(req);
    const order = await findOrder(body.pedido);
    const prev = orderJobs.get(order.name);
    const running = prev ? jobs.get(prev) : undefined;
    if (running?.status === 'running') return json(res, running);
    const job = startJob('crear', async (j) => {
      const r = await makeOrder(order.name, { onProgress: (m) => { j.message = m.trim(); } });
      j.projectId = (await readProject(r.dir)).id;
      dirCache.set(j.projectId, r.dir);
      return { video: r.out, proyecto: j.projectId, resumen: r.summary, apoyo: r.broll.map((f) => path.basename(f)) };
    });
    orderJobs.set(order.name, job.id);
    return json(res, job);
  }
  if (p === '/api/pedidos/video' && method === 'GET') {
    // El video terminado (solo si está dentro de «Listos»).
    const order = await findOrder(url.searchParams.get('pedido') ?? '');
    const file = order.state.video && safeJoin(READY_DIR, path.relative(READY_DIR, order.state.video));
    if (!file || !sendFile(req, res, file, url.searchParams.get('descargar') ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}` } : {})) return json(res, { error: 'Este pedido aún no tiene video.' }, 404);
    return;
  }

  if (p === '/api/upload' && method === 'POST') {
    // Sube un archivo a una carpeta temporal; devuelve una ficha para usarlo después.
    const token = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
    const folder = path.join(os.tmpdir(), `axioma-up-${token}`);
    await mkdir(folder, { recursive: true });
    await pipe(req, createWriteStream(path.join(folder, path.basename(url.searchParams.get('filename') ?? 'video.mp4'))));
    uploads.set(token, folder);
    // Si nunca se usa (montaje cancelado), se borra a las 2 horas.
    setTimeout(() => { if (uploads.get(token) === folder) { uploads.delete(token); void rm(folder, { recursive: true, force: true }); } }, 2 * 3_600_000).unref();
    return json(res, { token });
  }

  if (p === '/api/montajes' && method === 'POST') {
    const b = await readBody(req);
    const folders: string[] = (b.tokens ?? []).map((t: string) => uploads.get(t)).filter(Boolean);
    if (!folders.length) return json(res, { error: 'Sube al menos un video.' }, 400);
    const job = startJob('nuevo', async (j) => {
      const log = (m: string) => { j.message = m.trim(); };
      // Si falla antes de quedar armado, el proyecto a medias va a la papelera (no queda en la lista).
      let made: string | undefined;
      let ready = false;
      try {
        const { dir, project } = await createMontage({ inputs: folders, name: b.name || undefined, client: b.client || undefined, presetId: b.preset || undefined, shape: shapeParam(b.forma), uhd: b.uhd === true ? true : undefined });
        made = dir; j.projectId = project.id; dirCache.set(project.id, dir);
        j.progress = 0.2;
        await prepareMedia(dir, log);
        j.progress = 0.8;
        j.message = 'Detectando tomas y armando el montaje…';
        await detectShots(dir);
        await buildMontage(dir, { duration: b.duration || undefined });
        ready = true;
        if (b.auto) { j.message = 'Editando todo el video…'; return { id: project.id, summary: (await editEverything(dir, { onProgress: (m) => { j.message = m; } })).summary }; }
        return { id: project.id };
      } catch (e) {
        if (made && !ready) await trashProject(made).catch(() => {});
        throw e;
      } finally {
        for (const [t, f] of uploads) if (folders.includes(f)) { uploads.delete(t); await rm(f, { recursive: true, force: true }); }
      }
    });
    return json(res, job);
  }

  // Reel de creador con un solo pedido: avatares guardados y el trabajo completo (guion → video revisado).
  if (p === '/api/voces' && method === 'GET') return json(res, await voiceCatalog());
  if (p === '/api/avatares' && method === 'GET') return json(res, (await listAvatars()).map((a) => ({ id: a.id, name: a.name, description: a.description, voice: a.voice })));
  if (p === '/api/avatares/cara' && method === 'GET') {
    const a = (await listAvatars()).find((x) => x.id === url.searchParams.get('id'));
    const mini = a ? path.join(a.dir, 'cara-mini.jpg') : '';
    if (!a || !sendFile(req, res, existsSync(mini) ? mini : path.join(a.dir, 'cara.png'))) res.writeHead(404).end();
    return;
  }
  if (p === '/api/reel-creador' && method === 'POST') {
    const b = await readBody(req);
    if (!String(b.guion ?? '').trim() && !String(b.idea ?? '').trim()) return json(res, { error: 'Escribe el guion o la idea del video.' }, 400);
    return json(res, startCreatorJob(b));
  }
  if (p === '/api/projects' && method === 'POST') {
    // Subida de un video: el cuerpo es el archivo.
    const filename = path.basename(url.searchParams.get('filename') ?? 'video.mp4');
    const tmpDir = path.join(os.tmpdir(), `axioma-upload-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, filename);
    await pipe(req, createWriteStream(tmp));
    const job = startJob('nuevo', async (j) => {
      const log = (m: string) => { j.message = m.trim(); };
      // Si falla antes de quedar cortado, el proyecto a medias va a la papelera (no queda en la lista).
      let made: string | undefined;
      let ready = false;
      try {
        const { dir, project, info } = await createProject({
          input: tmp,
          name: url.searchParams.get('name') || undefined,
          client: url.searchParams.get('client') || undefined,
          presetId: url.searchParams.get('preset') || undefined,
          shape: shapeParam(url.searchParams.get('forma')),
          uhd: url.searchParams.get('uhd') === '1',
        });
        made = dir; j.projectId = project.id; dirCache.set(project.id, dir);
        if (!info.hasAudio) {
          asMontage(project);
          await writeProject(dir, project);
        }
        j.progress = 0.1;
        await prepareMedia(dir, log);
        j.progress = 0.4;
        const transcript = info.hasAudio ? await transcribeProject(dir, log) : null;
        j.progress = 0.9;
        if (hasSpeech(transcript)) {
          await cutProject(dir);
        } else {
          j.message = 'Sin palabras reconocidas. Preparando el montaje visual…';
          const montage = await buildMontage(dir);
          await writeProject(dir, asMontage(montage.project));
        }
        ready = true;
        // Edición automática al subir: el video llega al editor ya editado.
        if (url.searchParams.get('auto') === '1') { j.message = 'Editando todo el video…'; return { id: project.id, summary: (await editEverything(dir, { onProgress: (m) => { j.message = m; } })).summary }; }
        return { id: project.id };
      } catch (e) {
        if (made && !ready) await trashProject(made).catch(() => {});
        throw e;
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
    return json(res, job);
  }

  // Tareas en marcha: las de un proyecto (?id=) o las de un tipo (?kind=crear), para retomar el avance.
  if (p === '/api/jobs' && method === 'GET') {
    // ?kind=crear es otro nombre de ?kind=nuevo: solo las tareas que están creando un proyecto.
    const kind = url.searchParams.get('kind') === 'crear' ? 'nuevo' : url.searchParams.get('kind');
    return json(res, [...jobs.values()].filter((j) => j.status === 'running' && (!id || j.projectId === id) && (!kind || j.kind === kind)));
  }

  // La última exportación del proyecto y si quedó vieja (el proyecto cambió después).
  if (p === '/api/ultimo-export' && method === 'GET') return json(res, await lastExport(await findDir(id)));

  // Estilos propios del cliente: renombrar y borrar (los de la app no se tocan).
  if (p === '/api/presets' && (method === 'PUT' || method === 'DELETE')) {
    const project = await readProject(await findDir(id));
    const preset = url.searchParams.get('preset') ?? '';
    if (method === 'DELETE') return json(res, await deletePreset(project.client, preset));
    return json(res, await renamePreset(project.client, preset, String((await readBody(req)).name ?? '')));
  }

  // Cancelar un trabajo en marcha: se cierran sus procesos y el proyecto vuelve a como estaba.
  if (p.startsWith('/api/jobs/') && p.endsWith('/cancelar') && method === 'POST') {
    const jid = p.slice('/api/jobs/'.length, -'/cancelar'.length);
    const job = jobs.get(jid);
    if (!job) return json(res, { error: 'No existe la tarea.' }, 404);
    if (job.status !== 'running') return json(res, job);
    if (!job.cancellable) return json(res, { error: 'Esta tarea no se puede cancelar a mitad (podría dejar algo roto). Espera a que termine.' }, 409);
    job.message = 'Cancelando…';
    const scope = scopes.get(jid);
    if (scope) cancelScope(scope);
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
    // Cada tarea queda ligada al proyecto, para retomar su avance tras recargar.
    const pid = (await readProject(dir)).id;
    const startJob = (kind: Job['kind'], fn: (job: Job) => Promise<Record<string, unknown>>) => startOpJob(kind, fn, pid);
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
      const tipo = ['carrusel', 'post', 'historia', 'portada'].includes(b.tipo) ? b.tipo : 'carrusel';
      const job = startJob('ia', async (j) => {
        j.message = 'Preparando las imágenes…';
        const r = await createImages(dir, tipo, (m) => { j.message = m; }, { titulo: typeof b.titulo === 'string' ? b.titulo.slice(0, 120) : undefined, segundo: Number.isFinite(Number(b.segundo)) && b.segundo !== '' && b.segundo != null ? Math.max(0, Number(b.segundo)) : undefined });
        return { files: r.files, ai: r.ai };
      });
      return json(res, job);
    }
    if (b.op === 'revision' || b.op === 'revision-nueva') {
      // Enlace para el cliente: funciona en la misma red cuando la app está abierta en modo red.
      const token = b.op === 'revision-nueva' ? await resetReviewToken(dir) : await ensureReviewToken(dir);
      const port = new URL(`http://${req.headers.host ?? 'localhost'}`).port || String(STUDIO_PORT);
      return json(res, { token, exported: (await reviewVideo(dir, await readProject(dir))).exported, network: Boolean(networkKey), links: lanAddresses().map((ip) => `http://${ip}:${port}/r/${token}`), local: `http://localhost:${port}/r/${token}` });
    }
    if (b.op === 'resolver-peticion') return json(res, { project: await ops.resolveRequest(dir, String(b.requestId ?? ''), b.status === 'descartada' ? 'descartada' : 'hecha') });
    if (b.op === 'manual-marca') {
      // Manual de marca del cliente en PDF (colores, letras, logo, video y tono), desde su kit.
      const project = await readProject(dir);
      const job = startJob('ia', async (j) => {
        j.message = 'Armando el manual de marca…';
        const r = await createBrandbook(project.client);
        return { pdf: `/api/manual-marca?id=${encodeURIComponent(project.id)}`, hasKit: r.hasKit };
      });
      return json(res, job);
    }
    if (b.op === 'serie') return json(res, await splitIntoParts(dir, [60, 90, 180].includes(Number(b.max)) ? Number(b.max) : 60));
    if (b.op === 'musica-biblioteca') {
      const r = await useLibraryTrack(dir, b.file || undefined);
      return json(res, { project: r.project, track: r.track, why: r.why, rebuilt: r.rebuilt });
    }
    if (b.op === 'duplicar') return json(res, { id: (await duplicateProject(dir)).id });
    if (b.op === 'papelera') { await trashProject(dir); return json(res, { ok: true }); }
    if (b.op === 'idioma-subtitulos') {
      const job = startJob('ia', async (j) => {
        await setCaptionLanguage(dir, b.idioma || null, (m) => { j.message = m; });
        return {};
      });
      return json(res, job);
    }
    if (b.op === 'calidad') {
      const job = startJob('ia', async (j) => {
        await setVideoQuality(dir, b.calidad === 'nitido' ? 'nitido' : 'normal', (m) => { j.message = m; });
        return {};
      });
      return json(res, job);
    }
    if (b.op === 'camara-lenta') {
      const job = startJob('ia', async (j) => {
        await setSlowMotion(dir, String(b.sceneId ?? ''), Number(b.speed) || 1, (m, pr) => { j.message = m; if (pr != null) j.progress = pr; });
        return {};
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
      // Sin duración pedida se mantiene la actual (con voz en off, la de la voz).
      // Se conservan gancho, cierre, textos, color y transiciones (y queda una versión de antes).
      const cur = await readProject(dir);
      if (cur.kind === 'montaje' && cur.scenes.length) await ops.saveVersion(dir, 'antes-de-cortar-al-ritmo').catch(() => {});
      const r = await montageToBeat(dir, { density: ['auto', 'pulso', 'medio', 'compas'].includes(b.densidad) ? b.densidad : 'auto', duration: Number(b.duracion) || (cur.audio.voiceover || !cur.scenes.length ? undefined : outputDuration(cur)) });
      const project = cur.kind === 'montaje' && cur.scenes.length ? await writeProject(dir, keepEdits(cur, r.project)) : r.project;
      return json(res, { project, bpm: r.bpm, cuts: r.cuts, duration: r.duration, drop: r.drop });
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
      const job = startJob('nuevo', async (j) => {
        j.message = 'Creando el reel del clip…';
        const made = await createClipProject(dir, { start: Number(b.start), end: Number(b.end), title: String(b.title ?? '') }, Number(b.n) || 1);
        // Desde aquí la tarea es del reel nuevo (sale «creando» en su tarjeta).
        j.projectId = made.id; dirCache.set(made.id, made.dir);
        j.message = 'Editando el clip…';
        const { summary } = await editEverything(made.dir, { onProgress: (m) => { j.message = m; } });
        return { id: made.id, summary };
      });
      return json(res, job);
    }
    if (b.op === 'auto-editar') {
      // Edición completa sin preguntas: referencia del cliente + tendencia del nicho + lo que se ve en el video.
      // Una sola edición completa a la vez por proyecto: si ya hay una en marcha, se devuelve esa.
      const busy = runningJob(pid, 'crear', 'editar');
      if (busy) return json(res, busy);
      const job = startJob('crear', async (j) => {
        j.message = 'Editando todo el video…';
        const { summary } = await editEverything(dir, { referenceId: b.refId, onProgress: (m) => { j.message = m; } });
        return { summary };
      });
      Object.assign(job, { tag: 'editar' });
      return json(res, job);
    }
    if (b.op === 'otra-musica') {
      // Cambia la canción por otra del mismo ánimo (de la biblioteca o del banco gratuito).
      const job = startJob('audio', async (j) => {
        j.message = 'Buscando otra canción…';
        // Se cambia en un solo guardado (sin pasar por «sin música»); el montaje se recorta al ritmo
        // de la canción nueva conservando duración, cierre, textos y transiciones.
        const pr = await readProject(dir);
        const text = await autoMusic(dir, pr.audio.music, { replace: true }).catch(() => null);
        if (!text) return { text: 'No encontré otra canción. Revisa el internet o pon la clave de Freesound en Proyectos › Ajustes › Claves.' };
        return { text: pr.kind === 'montaje' ? `${text} Rehíce los cortes al ritmo de la canción (con la misma duración, textos y cierre).` : text, rebuilt: pr.kind === 'montaje' };
      });
      return json(res, job);
    }
    if (b.op === 'aplicar-brief') {
      // Una sola edición completa a la vez por proyecto: si ya hay una en marcha, se devuelve esa.
      const busy = runningJob(pid, 'crear', 'editar');
      if (busy) return json(res, busy);
    }
    if (b.op === 'aplicar-brief') {
      // Arma la edición según las respuestas del brief.
      const job = startJob('crear', async (j) => {
        j.message = 'Armando tu edición según el brief…';
        const { summary } = await editEverything(dir, { onProgress: (m) => { j.message = m; } });
        return { summary };
      });
      Object.assign(job, { tag: 'editar' });
      return json(res, job);
    }
    if (b.op === 'guardar-referencia') {
      // Un solo paso: el estilo detectado en la referencia se guarda como plantilla y se aplica.
      const project = await readProject(dir);
      const report = (await listReferences(project.client)).find((r) => r.id === b.refId);
      if (!report) return json(res, { error: 'No existe esa referencia.' }, 404);
      const base = presetFromReference(report, b.name);
      // Lo que el cliente no pidió copiar se queda como lo tiene este video.
      const cp = report.copy;
      const captions = cp && !cp.subtitulos ? { ...project.captions } : base.captions;
      const pacing = cp && !cp.ritmo ? { ...project.pacing } : base.pacing;
      const preset = await savePreset(project.client, { ...base, pacing, captions: { ...captions, ...(b.captions ?? {}) }, style: { ...base.style, ...(b.style ?? {}) } });
      // Queda elegida en el brief: es la única referencia que manda al editar.
      project.brief.referencia = report.id;
      const saved = await writeProject(dir, project);
      const applied = b.aplicar === false ? saved : await ops.applyPreset(dir, preset.id);
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
    if (b.op === 'tomas-ia') {
      // Mira de nuevo las tomas con el modelo de visión (las corregidas a mano no se tocan).
      const job = startJob('ia', async (j) => {
        j.message = 'Mirando qué se ve en cada toma…';
        const shots = await tagShots(dir, { force: true });
        return { tomas: shots.length, etiquetadas: shots.filter((s) => s.tag).length };
      });
      return json(res, job);
    }
    if (b.op === 'sincronizar') {
      // Vuelve a poner en pantalla lo que la voz nombra, con las etiquetas actuales de las tomas.
      const job = startJob('crear', async (j) => {
        j.message = 'Sincronizando la imagen con la voz…';
        await ops.saveVersion(dir, 'antes-de-sincronizar').catch(() => {});
        await tagShots(dir);
        const r = await resyncToVoice(dir);
        return { secciones: r.length, detalle: r.map((x) => `«${x.word.replace(/[^\p{L}\p{N}]/gu, '')}» → ${x.tag}`) };
      });
      return json(res, job);
    }
    if (b.op === 'guion-escribir') {
      // El guionista: guion literario y técnico a partir del brief, la marca y lo que hay grabado.
      const job = startJob('ia', async (j) => {
        j.message = 'Escribiendo el guion…';
        return { guion: await writeScript(dir, { idea: b.idea || undefined, estructura: b.estructura || undefined, duracion: Number(b.duracion) || undefined, tono: b.tono || undefined, voz: b.voz || undefined }) };
      });
      return json(res, job);
    }
    if (b.op === 'guion-cortar') {
      // Video hablado: se queda con lo que dice el guion (mejor toma de cada frase, en su orden).
      const busy = runningJob(pid, 'crear', 'editar');
      if (busy) return json(res, busy);
      const job = startJob('crear', async (j) => {
        j.message = 'Buscando cada frase del guion en la grabación…';
        await ops.saveVersion(dir, 'antes-del-corte-con-guion').catch(() => {});
        const take = ['ultima', 'mejor', 'primera'].includes(b.take) ? b.take : 'ultima';
        return { corte: await cutProjectToScript(dir, { text: typeof b.text === 'string' ? b.text : undefined, take }) };
      });
      Object.assign(job, { tag: 'editar' });
      return json(res, job);
    }
    if (b.op === 'guion-aplicar') {
      // Del guion técnico al video: voz, cortes al ritmo e imagen sincronizada fila por fila.
      const busy = runningJob(pid, 'crear', 'editar');
      if (busy) return json(res, busy);
      const job = startJob('crear', async (j) => {
        j.message = 'Creando el video con tu guion…';
        await ops.saveVersion(dir, 'antes-del-guion').catch(() => {});
        return applyScript(dir, { provider: b.provider || undefined, voice: b.voice || undefined, onProgress: (m) => { j.message = m; } });
      });
      Object.assign(job, { tag: 'editar' });
      return json(res, job);
    }
    if (b.op === 'voz-en-off') {
      const job = startJob('audio', async (j) => {
        j.message = 'Generando la voz en off…';
        const before = await readProject(dir);
        const p = await ops.setVoiceover(dir, String(b.text ?? ''), { provider: b.provider || undefined, voice: b.voice || undefined });
        if (p.kind === 'montaje') {
          j.message = 'Ajustando el montaje a la voz…';
          await rebeatMontage(dir, before);
        }
        return {};
      });
      return json(res, job);
    }
    if (b.op === 'muestra-voz') {
      // Muestra de 5 s de una voz del brief, para oírla antes de generar la voz en off entera.
      // Se guarda en el proyecto: la segunda vez sale al instante.
      const id = String(b.voice ?? '');
      if (!AI_VOICES.some((v) => v.id === id)) return json(res, { error: `No existe la voz «${id}».` }, 400);
      const rel = `media/muestras/${id}.wav`;
      const out = path.join(dir, rel);
      if (existsSync(out)) return json(res, { file: rel });
      if (!(await ttsProviders()).includes('qwen')) return json(res, { error: 'La voz IA local no está instalada: instálala en Configuración para oír las muestras.' }, 400);
      const job = startJob('audio', async (j) => {
        j.message = 'Generando una muestra de 5 s. La primera vez la voz IA local puede tardar varios minutos; después sale al instante…';
        await synthesize('Así sonaría la voz de tu video: clara, con buen ritmo y lista para tu marca.', out, { provider: 'qwen', voice: id });
        return { file: rel };
      });
      return json(res, job);
    }
    if (b.op === 'quitar-voz') return json(res, { project: await ops.removeVoiceover(dir) });
    if (b.op === 'estabilizar' || b.op === 'quitar-estabilizado') {
      // Estabilizar tomas movidas (o volver al original). Tarda: va como trabajo con su avance.
      const job = startJob('crear', async (j) => {
        if (b.op === 'quitar-estabilizado') await unstabilize(dir, (m) => { j.message = m; });
        else await stabilize(dir, { fuerza: ['suave', 'media', 'fuerte'].includes(b.fuerza) ? b.fuerza : 'media', onProgress: (m) => { j.message = m; } });
        return { stabilized: b.op === 'estabilizar' };
      });
      return json(res, job);
    }
    if (b.op === 'montaje-a-la-voz') {
      // El montaje se vuelve a cortar para durar lo que la voz (desde su inicio hasta que termina).
      const job = startJob('crear', async (j) => {
        j.message = 'Ajustando el montaje a la voz…';
        const pr = await readProject(dir);
        const vo = pr.audio.voiceover;
        if (pr.kind !== 'montaje' || !vo) throw new Error('Solo los montajes con voz en off se ajustan a la voz.');
        const r = await rebeatMontage(dir, pr, { duration: (vo.offset ?? 0) + vo.duration + 0.5 });
        return { rebuilt: r.rebuilt };
      });
      return json(res, job);
    }
    if (b.op === 'efecto') return json(res, { project: await ops.addSfx(dir, b.sceneId, b.id, { offset: b.offset, volume: b.volume }) });
    // Elegido a mano: queda recordado (audio.sfxOff) y la edición automática lo respeta.
    if (b.op === 'efectos-auto') return json(res, { project: await ops.setAutoSfx(dir, Boolean(b.on), { manual: true }) });
    if (b.op === 'quitar-musica') return json(res, { project: await ops.setMusic(dir, null) });
    if (b.op === 'recomendar-transiciones') {
      const { advice } = await applyRecommendedTransitions(dir);
      return json(res, { project: await readProject(dir), advice });
    }
    if (b.op === 'ia') {
      // Todo en local: el cambio lo hace la IA de este computador (Ollama). No se usa Claude ni créditos.
      const text = String(b.text ?? '').slice(0, 2000).trim();
      if (!text) return json(res, { error: 'Escribe qué quieres pedir.' }, 400);
      const job = startJob('ia', async (j) => {
        if (!(await llmReady())) {
          await ops.addRequest(dir, text, b.sceneId);
          return { text: 'La IA local no está encendida (Ollama). Guardé tu pedido para hacerlo luego.', saved: true, code: 'local' };
        }
        j.message = 'La IA local está editando…';
        const r = await localEdit(dir, text, b.sceneId);
        return { text: r.applied.length ? `${r.text} (${r.applied.join('; ')}). Queda una versión guardada de antes.` : r.text, local: true };
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
      // Descarga un video del banco de stock (se vuelve a buscar para no confiar en una dirección de fuera) y lo pone en la escena.
      const item = (await searchBroll(String(b.q ?? ''), 15)).find((v) => v.id === Number(b.pexelsId));
      if (!item) return json(res, { error: 'Ese video ya no aparece en la búsqueda. Busca de nuevo.' }, 400);
      const file = await downloadBroll(dir, item);
      const info = { license: item.license, source: item.source, author: item.author, url: item.url };
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
      // Solo se guarda si algo cambió (si no, cada exportación dejaba un paso de deshacer vacío).
      if (b.calidad || typeof b.carpeta === 'string' || b.lufs || typeof b.uhd === 'boolean') {
        const pr = await readProject(dir);
        const was = JSON.stringify([pr.audio.targetLufs, pr.export.quality, pr.export.folder, pr.export.uhd]);
        if (typeof b.uhd === 'boolean') pr.export.uhd = b.uhd;
        if ([-14, -16].includes(Number(b.lufs))) pr.audio.targetLufs = Number(b.lufs);
        if (['maxima', 'alta', 'ligera'].includes(b.calidad)) pr.export.quality = b.calidad;
        if (typeof b.carpeta === 'string') pr.export.folder = b.carpeta.trim() || undefined;
        if (JSON.stringify([pr.audio.targetLufs, pr.export.quality, pr.export.folder, pr.export.uhd]) !== was) await writeProject(dir, pr);
      }
      // Qué versión del proyecto se exporta: si cambia después, el resultado queda «viejo».
      const version = (await readProject(dir)).updatedAt;
      const track = async <T,>(run: () => Promise<T & { first?: string }>): Promise<T & { at: string }> => {
        try {
          const r = await run();
          const rec = await recordExport(dir, { out: r.first, projectUpdatedAt: version });
          return { ...r, at: rec.at };
        } catch (e) {
          // Cancelar no es un fallo: no se anota como error de la exportación.
          if (!isCancelled(e)) await recordExport(dir, { error: e instanceof Error ? e.message : String(e) }).catch(() => {});
          throw e;
        }
      };
      if (b.formato === 'todos') {
        // Los tres formatos seguidos: vertical, post 4:5 y cuadrado.
        const job = startJob('render', (j) => track(async () => {
          const files: string[] = [];
          for (const [i, f] of (['9:16', '4:5', '1:1'] as const).entries()) {
            const { out } = await renderProject(dir, { format: f, onProgress: (x) => { j.progress = (i + x) / 3; j.message = `Exportando ${f} (${i + 1}/3)…`; } });
            files.push(out);
          }
          return { files: files.map((f, i) => ({ id: ['9:16', '4:5', '1:1'][i], label: path.basename(f), file: relOut(dir, f) })), path: path.dirname(files[0]), first: files[0] };
        }));
        return json(res, job);
      }
      if (b.ganchos) {
        // Tres versiones con distinto gancho, para probar cuál retiene más.
        const job = startJob('render', (j) => track(async () => {
          const files = await renderHookVariants(dir, { format: b.formato, onProgress: (m, pr) => { j.message = m; j.progress = pr; } });
          return { files: files.map((x) => ({ ...x, file: relOut(dir, x.path) })), path: path.dirname(files[0]?.path ?? dir), first: files[0]?.path };
        }));
        return json(res, job);
      }
      const job = startJob('render', (j) => track(async () => {
        j.message = 'Exportando…';
        const { out } = await renderProject(dir, { format: b.formato, onProgress: (x) => { j.progress = x; } });
        return { file: relOut(dir, out), path: out, first: out };
      }));
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
      const before = await readProject(dir);
      const withMusic = await ops.setMusic(dir, tmp, { license: url.searchParams.get('license') ?? '', source: 'subida en el studio' });
      // En un montaje, los cortes se vuelven a poner en los golpes de la canción nueva,
      // conservando duración, cierre, textos y transiciones.
      if (withMusic.kind === 'montaje' && withMusic.scenes.length) {
        const r = await rebeatMontage(dir, before);
        return json(res, { project: r.project, ritmo: r.rebuilt, rebuilt: r.rebuilt });
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
        const before = await readProject(dir);
        // ?texto= : el guion que dice la voz, para que los subtítulos salgan bien escritos.
        const p2 = await ops.setVoiceoverFile(dir, tmp, { text: url.searchParams.get('texto') ?? undefined, provider: url.searchParams.get('origen') ?? undefined });
        if (p2.kind === 'montaje') await rebeatMontage(dir, before);
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

  if (p === '/api/calendario') {
    // Plan de publicación (workspace/calendario.json).
    const entry = url.searchParams.get('entry') ?? '';
    if (method === 'GET') return json(res, await listEntries());
    if (method === 'POST') return json(res, await addEntry(await readBody(req)));
    if (method === 'PUT') return json(res, await updateEntry(entry, await readBody(req)));
    if (method === 'DELETE') return json(res, await removeEntry(entry));
  }
  // Publicar en redes (hoy Instagram). Nunca se devuelve un permiso: solo nombres y estados.
  // (La comprobación de la dirección pedida contra DNS rebinding se hace al principio de handle().)
  if (p === '/api/redes' && method === 'GET') return json(res, await socialStatus());
  if (p === '/api/redes/conectar' && method === 'POST') {
    soloLocal(req);
    return json(res, { url: await connectUrl((await readBody(req)).red) });
  }
  if (p === '/api/redes/instagram/callback' && method === 'GET') {
    // Aquí vuelve Facebook tras dar permiso. Se responde una página sencilla para cerrar la pestaña.
    soloLocal(req);
    let ok = true, title = 'Cuenta conectada', body = '';
    try {
      const r = await finishConnect('instagram', url.searchParams);
      body = `${r.conectadas.join(', ')}. Ya puedes cerrar esta pestaña.${r.avisos.length ? ` ${r.avisos.join(' ')}` : ''}`;
    } catch (e) { ok = false; title = 'No se pudo conectar'; body = e instanceof Error ? e.message : String(e); }
    res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
      .end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP_NAME}</title><body style="font-family:system-ui;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px"><div style="max-width:420px"><h1>${title}</h1><p>${escHtml(body)}</p></div>`);
    return;
  }
  if (p === '/api/redes/token' && method === 'POST') {
    soloLocal(req);
    const b = await readBody(req);
    return json(res, { ...(await connectWithToken(b.red, String(b.token ?? ''))), estado: await socialStatus() });
  }
  if (p === '/api/redes/pagina' && method === 'POST') {
    // Cuando la página de un cliente no sale sola: se añade por su ID.
    soloLocal(req);
    const b = await readBody(req);
    return json(res, { ...(await connectPage(b.red, String(b.pagina ?? ''))), estado: await socialStatus() });
  }
  if (p === '/api/redes/desconectar' && method === 'POST') {
    soloLocal(req);
    await disconnectAccount(String((await readBody(req)).cuenta ?? ''));
    return json(res, await socialStatus());
  }
  if (p === '/api/redes/previo' && method === 'GET' && id) {
    return json(res, await prePublish(await findDir(id), (url.searchParams.get('red') === 'facebook' ? 'facebook' : 'instagram'), url.searchParams.get('cuenta') || undefined));
  }
  if (p === '/api/redes/publicar' && method === 'POST' && id) {
    const dir = await findDir(id);
    const b = await readBody(req);
    // Publicar es público y no se deshace: sin la confirmación de la persona no se hace nada.
    if (b.confirmado !== true) return json(res, { error: 'Confirma antes de publicar: es público y no se puede deshacer.' }, 400);
    const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
    // Si ya hay una publicación en marcha de este video (p. ej. tras recargar la página), se sigue esa.
    const running = runningJob(id, 'publicar');
    if (running) return json(res, running);
    // Con projectId, la pantalla puede retomar el avance tras recargar (GET /api/jobs?id=…).
    const job = startJob('publicar', async (j) => ({ ...(await publishReel(dir, { red: b.red, cuenta: str(b.cuenta), texto: str(b.texto), entrada: str(b.entrada), repetir: b.repetir === true, portadaMs: Number.isFinite(b.portadaMs) ? Number(b.portadaMs) : undefined }, (m, pr) => { j.message = m; j.progress = pr; })) }), id);
    return json(res, job);
  }
  if (p === '/api/redes/metricas' && method === 'POST') {
    const b = await readBody(req);
    const job = startJob('metricas', async (j) => {
      j.message = 'Trayendo las cifras de Instagram…';
      return { ...(await syncMetrics({ entrada: typeof b.entrada === 'string' ? b.entrada : undefined, cliente: typeof b.cliente === 'string' ? b.cliente : undefined, force: true })) };
    });
    return json(res, job);
  }
  // Brief inteligente: lo que la IA propone para este video y el prompt de edición que resulta.
  if (p === '/api/brief-ia' && method === 'GET' && id) {
    const dir = await findDir(id);
    return json(res, { ...(await suggestBrief(dir, url.searchParams.get('otra') === '1')), prompt: await buildPrompt(dir) });
  }
  // Enlaces para abrir la app desde el portátil o el celular (misma Wi-Fi o Tailscale).
  // Lo que hizo la última edición automática (para la pantalla Resultado).
  if (p === '/api/tomas' && method === 'GET') {
    // Tomas del montaje con su etiqueta (qué se ve), para elegirlas en el guion técnico.
    const d = await findDir(id);
    return json(res, (await readProject(d)).kind === 'montaje' ? (await detectShots(d).catch(() => [])).map((s) => ({ ...s, nombre: s.tag ? TAG_NAMES[s.tag] ?? s.tag : undefined })) : []);
  }
  if (p === '/api/tomas/etiquetas' && method === 'GET') {
    return json(res, Object.entries(TAG_NAMES).map(([value, label]) => ({ value, label })));
  }
  if (p === '/api/tomas' && method === 'PUT') {
    // Corrección a mano de lo que se ve en una toma.
    const body = await readBody(req);
    return json(res, await setShotTag(await findDir(id), String(body.toma ?? ''), body.etiqueta ?? null));
  }
  if (p === '/api/guion' && method === 'GET') return json(res, await readScript(await findDir(id)));
  if (p === '/api/guion' && method === 'PUT') {
    // Guion editado a mano en la pantalla Guion.
    const body = await readBody(req);
    return json(res, await saveScript(await findDir(id), Guion.parse({ ...body, origen: body.origen ?? 'manual' })));
  }
  if (p === '/api/guion.md' && method === 'GET') {
    const g = await readScript(await findDir(id));
    if (!g) return json(res, { error: 'Este proyecto no tiene guion.' }, 404);
    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="guion-${id}.md"` });
    return void res.end(guionMarkdown(g));
  }
  if (p === '/api/resumen-edicion' && method === 'GET') {
    const f = path.join(await findDir(id), 'resumen-edicion.json');
    return json(res, existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : null);
  }
  if (p === '/api/red' && method === 'GET') return json(res, await accessLinks());
  // Aprender de los resultados: qué le funciona a cada cliente. POST además lo deja por defecto.
  if (p === '/api/resultados' && (method === 'GET' || method === 'POST')) {
    return json(res, await learnFromResults(url.searchParams.get('cliente') || undefined, method === 'POST'));
  }
  // Actualizarse: revisar si hay versión nueva y aplicarla (se reinicia sola si se abrió como app).
  if (p === '/api/actualizar' && method === 'GET') {
    if (!updateCache || Date.now() - updateCache.at > 15 * 60_000) updateCache = { at: Date.now(), data: await checkUpdate() };
    return json(res, updateCache.data);
  }
  if (p === '/api/actualizar' && method === 'POST') {
    const job = startJob('actualizar', async (j) => {
      j.message = 'Buscando la versión nueva…';
      const r = await applyUpdate((m) => { j.message = m; });
      const canRestart = r.restart && process.argv.includes('studio');
      if (canRestart) restartStudio();
      return { ...r, restarting: canRestart };
    });
    return json(res, job);
  }
  // Actualizar sin GitHub: se sube el .zip de la versión nueva (solo desde este computador).
  if (p === '/api/actualizar-archivo' && method === 'POST') {
    if (!isLoopback(req.socket.remoteAddress)) return json(res, { error: 'La app se actualiza desde el computador donde está instalada.' }, 403);
    const tmpDir = path.join(os.tmpdir(), `axioma-zip-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const zip = path.join(tmpDir, 'actualizacion.zip');
    await pipe(req, createWriteStream(zip));
    const job = startJob('actualizar', async (j) => {
      try {
        const r = await applyUpdateFromZip(zip, (m) => { j.message = m; });
        const canRestart = r.restart && process.argv.includes('studio');
        if (canRestart) restartStudio();
        return { ...r, restarting: canRestart };
      } finally { await rm(tmpDir, { recursive: true, force: true }).catch(() => {}); }
    });
    return json(res, job);
  }
  // Copia de seguridad: estado, y hacerla ahora (corre en segundo plano).
  if (p === '/api/copia' && method === 'GET') return json(res, await backupStatus());
  if (p === '/api/copia' && method === 'POST') {
    const job = startJob('copia', async (j) => {
      j.message = 'Haciendo la copia de seguridad…';
      const s = await runBackup((m) => { j.message = m; });
      if (s.error) throw new Error(s.error);
      return { ...s };
    });
    return json(res, job);
  }
  // Biblioteca de música y si la música automática puede bajar canciones (hay clave de Freesound).
  if (p === '/api/musica' && method === 'GET') return json(res, { tracks: await listTracks(), auto: Boolean(await envValue('FREESOUND_API_KEY')) });
  if (p === '/api/musica' && method === 'PUT') return json(res, await renameTrack(url.searchParams.get('f') ?? '', String((await readBody(req)).name ?? '')));
  if (p === '/api/musica/archivo' && method === 'GET') {
    const f = safeJoin(MUSIC_DIR, path.basename(url.searchParams.get('f') ?? ''));
    if (!f || !sendFile(req, res, f)) res.writeHead(404).end();
    return;
  }
  if (p === '/api/musica' && method === 'POST') {
    // Agrega una canción a la biblioteca (con su licencia) y la analiza.
    const tmpDir = path.join(os.tmpdir(), `axioma-cancion-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, path.basename(url.searchParams.get('filename') ?? 'cancion.mp3').replace(/[^\w.-]+/g, '_'));
    await pipe(req, createWriteStream(tmp));
    try {
      const track = await addTrack(tmp, { license: url.searchParams.get('license') ?? '', name: (url.searchParams.get('filename') ?? '').replace(/\.[a-z0-9]+$/i, '') });
      return json(res, { track, tracks: await listTracks() });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }
  if (p === '/api/musica' && method === 'DELETE') return json(res, await removeTrack(url.searchParams.get('f') ?? ''));

  if (p === '/api/manual-marca' && method === 'GET') {
    const project = await readProject(await findDir(id));
    const f = brandbookFile(project.client);
    if (!existsSync(f)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Disposition', `inline; filename="manual-de-marca-${(project.client ?? 'marca').replace(/[^\w-]+/g, '-')}.pdf"`);
    if (!sendFile(req, res, f)) res.writeHead(404).end();
    return;
  }
  if (p === '/api/logo' && method === 'POST') {
    // Logo de la marca del cliente: sirve para todos sus reels (marca de agua, cierre, imágenes).
    const dir = await findDir(id);
    const project = await readProject(dir);
    const tmpDir = path.join(os.tmpdir(), `axioma-logo-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, path.basename(url.searchParams.get('filename') ?? 'logo.png').replace(/[^\w.-]+/g, '_'));
    await pipe(req, createWriteStream(tmp));
    try {
      const kit = await saveClientLogo(project.client, tmp);
      return json(res, { kit, brand: await brandFor(project, (rel) => `/media/${encodeURIComponent(project.id)}/${rel.split(path.sep).map(encodeURIComponent).join('/')}`, dir) });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
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
    // Sin proyecto, las de un cliente (para el reel de un solo pedido).
    if (!id && url.searchParams.get('client')) return json(res, await listReferences(String(url.searchParams.get('client'))));
    const project = await readProject(await findDir(id));
    return json(res, await listReferences(project.client));
  }

  // Renombrar o quitar una referencia (va a la papelera, no se borra).
  if (p === '/api/references' && (method === 'PUT' || method === 'DELETE')) {
    const project = await readProject(await findDir(id));
    const ref = url.searchParams.get('ref') ?? '';
    if (method === 'DELETE') return json(res, await deleteReference(project.client, ref));
    await renameReference(project.client, ref, String((await readBody(req)).name ?? ''));
    return json(res, await listReferences(project.client));
  }

  // Sesión de Instagram para leer perfiles (apagada por defecto). Nunca se devuelven las cookies.
  if (p === '/api/instagram-sesion' && method === 'GET') return json(res, await igSession());
  if (p === '/api/instagram-sesion' && method === 'PUT') return json(res, await setIgSession(String((await readBody(req)).modo ?? 'apagado') as IgSessionMode));
  if (p === '/api/instagram-sesion/archivo' && method === 'POST') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 2_000_000) return json(res, { error: 'Ese archivo es demasiado grande para ser un archivo de cookies.' }, 413); chunks.push(c as Buffer); }
    return json(res, await saveIgCookies(Buffer.concat(chunks).toString('utf8')));
  }
  if (p === '/api/instagram-sesion/archivo' && method === 'DELETE') return json(res, await removeIgCookies());
  if (p === '/api/instagram-sesion/probar' && method === 'POST') {
    // Prueba la sesión leyendo el último video de un perfil.
    const u = String((await readBody(req)).url ?? '').trim();
    try {
      const links = await profileVideos(u, 1);
      return json(res, { ok: true, text: `Funciona: pude ver los videos del perfil (el último es ${links[0]}).` });
    } catch (e) { return json(res, { ok: false, text: (e as Error).message }); }
  }
  // Lo que el cliente quiere de una referencia (y qué se copia), sin volver a analizarla.
  if (p === '/api/references/pedido' && method === 'PUT') {
    const project = await readProject(await findDir(id));
    const body = await readBody(req);
    return json(res, await updateReferenceWish(project.client, url.searchParams.get('ref') ?? '', { wish: typeof body.wish === 'string' ? body.wish : undefined, copy: body.copy }));
  }
  // Dictado: audio grabado en el navegador → texto (Whisper, local).
  if (p === '/api/dictado' && method === 'POST') {
    const tmpDir = path.join(os.tmpdir(), `axioma-dictado-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const tmp = path.join(tmpDir, 'dictado.webm');
    try {
      await pipe(req, createWriteStream(tmp));
      return json(res, { text: await dictate(tmp) });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }
  // Referencia desde un link (reel, TikTok, Short) o desde un perfil (sus últimos videos).
  if (p === '/api/references/link' && method === 'POST') {
    const project = await readProject(await findDir(id));
    const body = await readBody(req);
    const kind = linkKind(String(body.url ?? ''));
    if (!kind) return json(res, { error: 'Pega un link completo, que empiece por https://' }, 400);
    const wish = typeof body.wish === 'string' ? body.wish : undefined;
    const job = startJob('referencia', async (j) => {
      const links = kind.profile ? (j.message = 'Buscando los últimos videos del perfil…', await profileVideos(kind.url, Math.min(8, Number(body.cuantos) || 5))) : [kind.url];
      const reports: ReferenceReport[] = [];
      const failed: string[] = [];
      for (const [i, link] of links.entries()) {
        const tmp = path.join(os.tmpdir(), `axioma-ref-${Date.now()}-${i}`);
        const part = (m: string, pr = 0) => { j.message = links.length > 1 ? `Video ${i + 1} de ${links.length}: ${m}` : m; j.progress = (i + pr) / links.length; };
        try {
          part('Bajando el video del link…', 0.02);
          const { file, source } = await downloadReference(link, tmp);
          const base = String(body.nombre ?? '').trim().slice(0, 60) || (source.author ? `${source.author}${links.length > 1 ? ` ${i + 1}` : ''}` : `Referencia ${kind.platform}`);
          const { report } = await analyzeReference(file, { client: project.client, name: base, source, wish, context: briefContext(project), onStep: (m, pr) => part(m, 0.05 + pr * 0.95) });
          reports.push(report);
        } catch (e) {
          if (links.length === 1) throw e;
          failed.push(`video ${i + 1}: ${(e as Error).message}`);
        } finally {
          await rm(tmp, { recursive: true, force: true });
        }
      }
      if (!reports.length) throw new Error(`No pude analizar ningún video del perfil. ${failed[0] ?? ''}`);
      return { report: reports[0], reports, failed };
    }, project.id);
    return json(res, job);
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
        const { report } = await analyzeReference(tmp, { client: project.client, name: url.searchParams.get('nombre')?.trim().slice(0, 60) || undefined, wish: url.searchParams.get('pedido') ?? undefined, context: briefContext(project), onStep: (m, pr) => { j.message = m; j.progress = pr; } });
        return { report };
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }, project.id);
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

  // Las miniaturas no cambian para el mismo momento: el navegador las guarda un día.
  if (p === '/api/thumb') {
    const dir = await findDir(id);
    if (!sendFile(req, res, await thumb(dir, Math.max(0, Number(url.searchParams.get('t') ?? 0)), url.searchParams.get('file')), CACHE_DAY)) res.writeHead(404).end();
    return;
  }

  // Miniatura JPG (360 px de ancho) de una imagen creada en «Imágenes» (las PNG pesan mucho).
  if (p === '/api/imagenes/miniatura' && method === 'GET') {
    const dir = await findDir(id);
    const rel = url.searchParams.get('f') ?? '';
    const src = safeJoin(path.join(dir, P.renders, 'imagenes'), rel.replace(new RegExp(`^${P.renders}/imagenes/`), ''));
    if (!src || !/\.(png|jpe?g|webp)$/i.test(src) || !existsSync(src)) { res.writeHead(404).end(); return; }
    const out = path.join(dir, 'proxies', 'thumbs', 'imagenes', path.relative(path.join(dir, P.renders, 'imagenes'), src).replace(/[\\/]/g, '__').replace(/\.\w+$/, '.jpg'));
    if (!existsSync(out)) {
      await mkdir(path.dirname(out), { recursive: true });
      await ffmpeg(['-i', src, '-vf', 'scale=360:-2', '-q:v', '4', out]);
    }
    if (!sendFile(req, res, out, CACHE_DAY)) res.writeHead(404).end();
    return;
  }

  // Papelera: ver lo que se quitó, recuperarlo o borrarlo para siempre (esto último solo desde este computador).
  if (p === '/api/papelera' && method === 'GET') return json(res, await listTrash());
  if (p === '/api/papelera/recuperar' && method === 'POST') return json(res, await restoreTrash(String((await readBody(req)).nombre ?? '')));
  if (p === '/api/papelera' && method === 'DELETE') {
    if (!isLoopback(req.socket.remoteAddress)) return json(res, { error: 'La papelera solo se vacía desde el computador donde está instalada la app.' }, 403);
    return json(res, await emptyTrash(url.searchParams.get('nombre') || undefined));
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
/**
 * Reel de un solo pedido como trabajo del estudio. El pedido queda anotado en
 * workspace/.trabajos/ hasta terminar: si el estudio se cierra a mitad, al volver a abrirse lo
 * retoma (la voz, el avatar y la nitidez ya hechos quedan en la caché del avatar y no se repiten).
 */
const PENDING_DIR = path.join(WORKSPACE, '.trabajos');
function startCreatorJob(b: Record<string, any>, pendingFile?: string): Job {
  const file = pendingFile ?? path.join(PENDING_DIR, `reel-${Date.now()}.json`);
  void mkdir(PENDING_DIR, { recursive: true }).then(() => writeFile(file, JSON.stringify(b))).catch(() => {});
  return startJob('nuevo', async (j) => {
    try {
      const r = await createCreatorReel({
        script: String(b.guion ?? '').trim() || undefined, idea: String(b.idea ?? '').trim() || undefined,
        reference: b.referencia ? String(b.referencia) : undefined, duration: Math.max(10, Math.min(180, Number(b.duracion) || 60)),
        avatar: b.avatar ? String(b.avatar) : undefined, client: b.cliente ? String(b.cliente) : undefined,
        name: b.nombre ? String(b.nombre) : undefined, cta: b.cta ? String(b.cta) : undefined,
        provider: b.proveedor ? (String(b.proveedor) as never) : undefined, voice: b.voz ? String(b.voz) : undefined,
        preview: b.borrador === true,
        onProgress: (m, pr) => { j.message = m; j.progress = pr; },
      });
      const project = await readProject(r.dir);
      return { projectId: project.id, file: relOut(r.dir, r.file), warnings: r.warnings, script: r.script };
    } finally {
      // Si se canceló a mano tampoco se retoma.
      await rm(file, { force: true }).catch(() => {});
    }
  });
}

/** Al abrir el estudio: retoma los reels que quedaron a medias (el estudio se cerró o el disco se desconectó). */
export async function resumeCreatorJobs(): Promise<number> {
  if (!existsSync(PENDING_DIR)) return 0;
  const files = (await readdir(PENDING_DIR)).filter((f) => f.startsWith('reel-') && f.endsWith('.json'));
  for (const f of files) {
    const b = JSON.parse(await readFile(path.join(PENDING_DIR, f), 'utf8').catch(() => '{}'));
    if (b.guion || b.idea) startCreatorJob(b, path.join(PENDING_DIR, f));
  }
  return files.length;
}

export function startStudio(opts: { network?: boolean } = {}): Promise<string> {
  running ??= new Promise<string>(async (resolve, reject) => {
    // En modo red se escucha en todas las interfaces y se exige la clave a los demás equipos.
    if (opts.network) networkKey = await lanKey();
    const base = `http://127.0.0.1:${STUDIO_PORT}`;
    const server = http.createServer((req, res) => {
      handle(req, res).catch((e) => {
        // Queda escrito qué falló, para poder diagnosticarlo después.
        // Sin permisos ni claves: la dirección puede traer el código de conexión de una red.
        const line = redact(`${new Date().toISOString()} ${req.method} ${req.url} → ${e instanceof Error ? e.stack ?? e.message : e}\n`);
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
    // Tras actualizarse, el proceso nuevo espera a que el anterior suelte el puerto.
    const wait = process.env.AXIOMA_RESTART_WAIT ? 2500 : 0;
    delete process.env.AXIOMA_RESTART_WAIT;
    setTimeout(() => server.listen(STUDIO_PORT, opts.network ? '0.0.0.0' : '127.0.0.1', () => { scheduleBackups(); void detectMachine().catch(() => {}); void resumeCreatorJobs().catch(() => {}); llmWarmUp().catch(() => {}); if (!process.env.VITEST) { void stockMusic(); startMetricsTimer(); } resolve(base); }), wait);
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
