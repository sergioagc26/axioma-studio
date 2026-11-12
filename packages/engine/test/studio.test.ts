import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const fixture = path.join(repo, 'workspace', 'clientes', 'personal', 'proyectos', '2026-11-12-prueba-sintetica');
const hasFixture = existsSync(path.join(fixture, 'transcript.json'));
const ws = mkdtempSync(path.join(os.tmpdir(), 'snz-studio-'));
const dir = path.join(ws, 'clientes', 'personal', 'proyectos', 'prueba');
const port = 4800 + Math.floor(Math.random() * 150);
const base = `http://127.0.0.1:${port}`;
const id = '2026-11-12-prueba-sintetica';
let child: ChildProcess;

const get = async (p: string) => (await fetch(base + p)).json();

describe.skipIf(!hasFixture)('studio: API y sincronización', () => {
  beforeAll(async () => {
    cpSync(fixture, dir, { recursive: true, filter: (src) => !src.includes(`${path.sep}renders${path.sep}`) });
    child = spawn(process.execPath, [path.join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(repo, 'packages', 'engine', 'src', 'cli.ts'), 'studio', '--no-open'], {
      env: { ...process.env, SE_WORKSPACE: ws, SE_STUDIO_PORT: String(port) }, stdio: 'ignore',
    });
    for (let i = 0; i < 60; i++) {
      try { await get('/api/ping'); return; } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    throw new Error('El studio no arrancó');
  }, 30_000);

  afterAll(() => {
    child?.kill();
    rmSync(ws, { recursive: true, force: true });
  });

  it('lista y entrega el proyecto con transcripción y presets', async () => {
    expect((await get('/api/projects'))[0].id).toBe(id);
    const d = await get(`/api/project?id=${id}`);
    expect(d.transcript.words.length).toBeGreaterThan(10);
    expect(d.presets.map((p: { id: string }) => p.id)).toContain('rapido');
  });

  it('guarda cambios válidos y rechaza los inválidos', async () => {
    const { project } = await get(`/api/project?id=${id}`);
    project.scenes[0].onScreenText = 'Hola studio';
    const ok = await fetch(`${base}/api/project?id=${id}`, { method: 'PUT', body: JSON.stringify(project) });
    expect(ok.status).toBe(200);
    expect(JSON.parse(readFileSync(path.join(dir, 'project.json'), 'utf8')).scenes[0].onScreenText).toBe('Hola studio');
    const bad = await fetch(`${base}/api/project?id=${id}`, { method: 'PUT', body: JSON.stringify({ ...project, scenes: [{ id: 'x', ranges: [] }] }) });
    expect(bad.status).toBe(400);
  });

  it('rechaza escrituras desde otro origen y rutas fuera del proyecto', async () => {
    const r = await fetch(`${base}/api/op?id=${id}`, { method: 'POST', headers: { Origin: 'http://otra-web.test' }, body: '{}' });
    expect(r.status).toBe(403);
    expect((await fetch(`${base}/media/${id}/..%2F..%2F..%2F..%2Fpackage.json`)).status).toBe(404);
  });

  it('avisa en vivo cuando el proyecto cambia fuera del studio', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events?id=${id}`, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    const { project } = await get(`/api/project?id=${id}`);
    project.scenes[0].title = 'Cambio externo';
    // Otro cliente (p. ej. Claude por MCP) guarda el proyecto.
    await fetch(`${base}/api/project?id=${id}`, { method: 'PUT', body: JSON.stringify(project) });
    let text = '';
    const deadline = Date.now() + 5000;
    while (!text.includes('Cambio externo') && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    ctrl.abort();
    expect(text).toContain('Cambio externo');
  }, 10_000);

  it('guarda peticiones para Claude', async () => {
    const r = await fetch(`${base}/api/op?id=${id}`, { method: 'POST', body: JSON.stringify({ op: 'peticion', text: 'más corto', sceneId: 's01' }) });
    const { project } = await r.json();
    expect(project.requests.at(-1)).toMatchObject({ text: 'más corto', sceneId: 's01', status: 'pendiente' });
  });
});
