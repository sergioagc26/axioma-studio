import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const ws = mkdtempSync(path.join(os.tmpdir(), 'axioma-enlaces-'));
vi.stubEnv('SE_WORKSPACE', ws);
const E = await import('../src/index.ts');

describe('directUrl', () => {
  it('Google Drive: de «compartir» a descarga directa', () => {
    const want = 'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOp&export=download&confirm=t';
    expect(E.directUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')).toEqual({ kind: 'drive', url: want });
    expect(E.directUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp').url).toBe(want);
    expect(() => E.directUrl('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp')).toThrow('carpeta de Google Drive');
  });
  it('Dropbox: fuerza la descarga (dl=1) y conserva la clave del enlace', () => {
    const r = E.directUrl('https://www.dropbox.com/scl/fi/abc/toma.mov?rlkey=xyz&dl=0');
    expect(r.kind).toBe('dropbox');
    expect(new URL(r.url).searchParams.get('dl')).toBe('1');
    expect(new URL(r.url).searchParams.get('rlkey')).toBe('xyz');
  });
  it('dice qué hacer con lo que no se puede bajar solo', () => {
    expect(() => E.directUrl('https://we.tl/t-abc')).toThrow('WeTransfer');
    expect(() => E.directUrl('hola')).toThrow('no parece un enlace');
    expect(() => E.directUrl('ftp://x.com/a.mp4')).toThrow('https://');
    expect(E.directUrl('https://cdn.ejemplo.com/v/clip.mp4').kind).toBe('directo');
  });
});

describe('fetchToOrder', () => {
  let base = '';
  let server: http.Server;
  const src = path.join(ws, 'fuente');
  const hasZip = spawnSync('zip', ['-v']).status === 0;
  beforeAll(async () => {
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, 'toma1.mp4'), 'video-1');
    writeFileSync(path.join(src, 'guion.txt'), 'Hola.');
    if (hasZip) execFileSync('zip', ['-q', '-j', path.join(src, 'carpeta.zip'), path.join(src, 'toma1.mp4'), path.join(src, 'guion.txt')]);
    server = http.createServer((req, res) => {
      const u = new URL(req.url!, 'http://x');
      if (u.pathname === '/archivo') { res.writeHead(200, { 'Content-Disposition': 'attachment; filename="Mi toma.mov"' }); return void res.end('video-mov'); }
      if (u.pathname === '/carpeta' && hasZip) { res.writeHead(200, { 'Content-Disposition': 'attachment; filename="Pedido.zip"' }); return void res.end(readFileSync(path.join(src, 'carpeta.zip'))); }
      if (u.pathname === '/pagina') { res.writeHead(200, { 'Content-Type': 'text/html' }); return void res.end('<!DOCTYPE html><html><body>Inicia sesión</body></html>'); }
      if (u.pathname === '/privado') return void res.writeHead(403).end();
      if (u.pathname === '/limitado') return void res.writeHead(429, { 'Retry-After': '600' }).end();
      if (u.pathname === '/redirige') { res.writeHead(302, { Location: '/archivo' }); return void res.end(); }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server?.close(); rmSync(ws, { recursive: true, force: true }); });

  it('baja un archivo (siguiendo redirecciones) con el nombre que da el servidor', async () => {
    const r = await E.fetchToOrder(`${base}/redirige`, 'promo enero');
    expect(r.files).toEqual(['Mi toma.mov']);
    expect(r.classified.videos.map((f) => path.basename(f))).toEqual(['Mi toma.mov']);
    expect(readFileSync(path.join(ws, 'Para editar', 'promo enero', 'Mi toma.mov'), 'utf8')).toBe('video-mov');
    // Otra vez el mismo nombre: no pisa el anterior.
    expect((await E.fetchToOrder(`${base}/archivo`, 'promo enero')).files).toEqual(['Mi toma (2).mov']);
    expect((await E.listOrders()).find((o) => o.name === 'promo enero')?.files.videos).toHaveLength(2);
  });

  it.runIf(hasZip)('una carpeta (zip) se descomprime y cada archivo se reconoce', async () => {
    const r = await E.fetchToOrder(`${base}/carpeta`, 'carpeta dropbox');
    expect(r.files.sort()).toEqual(['guion.txt', 'toma1.mp4']);
    expect(path.basename(r.classified.guion!)).toBe('guion.txt');
    expect(existsSync(path.join(ws, 'Para editar', 'carpeta dropbox', 'Pedido.zip'))).toBe(false);
  });

  it('avisa claro si el enlace no es público, abre una página o no existe', async () => {
    await expect(E.fetchToOrder(`${base}/privado`, 'x')).rejects.toThrow('no es público');
    await expect(E.fetchToOrder(`${base}/pagina`, 'x')).rejects.toThrow('abre una página');
    await expect(E.fetchToOrder(`${base}/nada`, 'x')).rejects.toThrow('no existe');
    // Un 429 con «Retry-After: 600» (Wikimedia en la nube) no deja la descarga colgada 10 min.
    const t0 = Date.now();
    await expect(E.fetchToOrder(`${base}/limitado`, 'x')).rejects.toThrow('limitando las descargas');
    expect(Date.now() - t0).toBeLessThan(15_000);
    // Nada quedó a medio bajar.
    expect(existsSync(path.join(ws, 'Para editar', 'x')) ? (await import('node:fs')).readdirSync(path.join(ws, 'Para editar', 'x')) : []).toEqual([]);
  });
});
