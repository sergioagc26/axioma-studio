import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, watch } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pipeline as pipe } from 'node:stream/promises';
import { APP_NAME, Project } from '@snz/schema';
import { ffmpeg } from './exec.ts';
import * as ops from './ops.ts';
import { P, REPO_ROOT } from './paths.ts';
import { cutProject, prepareMedia, transcribeProject } from './pipeline.ts';
import { allPresets, savePreset } from './presets.ts';
import { analyzeReference, listReferences, referencesDir } from './reference.ts';
import { brandFor, renderProject } from './render.ts';
import { safeJoin, sendFile } from './server.ts';
import { createProject, readProject, readTranscript, writeProject } from './store.ts';

export const STUDIO_PORT = Number(process.env.SE_STUDIO_PORT ?? 4747);
const DIST = path.join(REPO_ROOT, 'packages', 'studio', 'dist');

interface Job {
  id: string;
  kind: 'crear' | 'render' | 'referencia';
  status: 'running' | 'done' | 'error';
  message: string;
  progress: number;
  result?: Record<string, unknown>;
}
const jobs = new Map<string, Job>();

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

async function thumb(dir: string, t: number): Promise<string> {
  const out = path.join(dir, 'proxies', 'thumbs', `${Math.round(t * 1000)}.jpg`);
  if (!existsSync(out)) {
    await mkdir(path.dirname(out), { recursive: true });
    await ffmpeg(['-ss', t.toFixed(3), '-i', path.join(dir, P.proxy), '-frames:v', '1', '-vf', 'scale=270:-2', '-q:v', '5', out]);
  }
  return out;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const p = url.pathname;
  const id = url.searchParams.get('id');
  const method = req.method ?? 'GET';

  // Solo esta misma página puede escribir (evita que otra web local haga cambios).
  if (method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, { error: 'Origen no permitido.' }, 403);
  }

  if (p === '/api/ping') return json(res, { app: APP_NAME });

  if (p === '/api/projects' && method === 'GET') {
    const all = await ops.listProjects();
    return json(res, all.map(({ project: x }) => ({
      id: x.id, name: x.name, client: x.client ?? 'personal', approval: x.approval, scenes: x.scenes.length, updatedAt: x.updatedAt,
    })));
  }

  if (p === '/api/projects' && method === 'POST') {
    // Subida de un video: el cuerpo es el archivo.
    const filename = path.basename(url.searchParams.get('filename') ?? 'video.mp4');
    const tmpDir = path.join(os.tmpdir(), `snz-upload-${Date.now()}`);
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
    return json(res, { project, transcript: await readTranscript(dir), presets: await allPresets(project.client), brand: await brandFor(project, media, dir) });
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
    if (b.op === 'guardar-preset') {
      const project = await readProject(dir);
      const preset = await savePreset(project.client, b.preset);
      const applied = b.aplicar ? await ops.applyPreset(dir, preset.id) : project;
      return json(res, { preset, project: applied, presets: await allPresets(project.client) });
    }
    if (b.op === 'peticion') return json(res, { project: await ops.addRequest(dir, String(b.text ?? '').slice(0, 2000), b.sceneId) });
    if (b.op === 'version') return json(res, { name: await ops.saveVersion(dir, b.label) });
    if (b.op === 'render') {
      const job = startJob('render', async (j) => {
        j.message = 'Renderizando…';
        const { out } = await renderProject(dir, { format: b.formato, onProgress: (x) => { j.progress = x; } });
        return { file: path.relative(dir, out).split(path.sep).join('/') };
      });
      return json(res, job);
    }
    return json(res, { error: `Operación desconocida: ${b.op}` }, 400);
  }

  if (p === '/api/references' && method === 'GET') {
    const project = await readProject(await findDir(id));
    return json(res, await listReferences(project.client));
  }

  if (p === '/api/references' && method === 'POST') {
    const project = await readProject(await findDir(id));
    const filename = path.basename(url.searchParams.get('filename') ?? 'referencia.mp4');
    const tmpDir = path.join(os.tmpdir(), `snz-ref-${Date.now()}`);
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
    if (!sendFile(req, res, await thumb(dir, Math.max(0, Number(url.searchParams.get('t') ?? 0))))) res.writeHead(404).end();
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
export function startStudio(): Promise<string> {
  running ??= new Promise<string>((resolve, reject) => {
    const base = `http://127.0.0.1:${STUDIO_PORT}`;
    const server = http.createServer((req, res) => {
      handle(req, res).catch((e) => {
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
    server.listen(STUDIO_PORT, '127.0.0.1', () => resolve(base));
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
