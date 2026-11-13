import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.json': 'application/json', '.png': 'image/png', '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Envía un archivo con soporte de Range. Devuelve false si no existe. */
export function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string): boolean {
  let st;
  try {
    st = statSync(file);
    if (!st.isFile()) return false;
  } catch {
    return false;
  }
  const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  // La página (index.html) se revisa siempre: así una versión nueva de la app se ve sin forzar la recarga.
  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', ...(/\.html$/i.test(file) ? { 'Cache-Control': 'no-cache' } : {}) };
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    createReadStream(file).pipe(res);
  }
  return true;
}

/** Resuelve `rel` dentro de `base` o devuelve null si se sale de la carpeta. */
export function safeJoin(base: string, rel: string): string | null {
  const root = path.resolve(base);
  const file = path.resolve(root, '.' + path.sep + rel);
  return file === root || file.startsWith(root + path.sep) ? file : null;
}

/**
 * Servidor de archivos local (solo 127.0.0.1) con soporte de Range, para que
 * Remotion lea el video del proyecto sin copiarlo dentro del bundle.
 */
export async function serveFolder(root: string): Promise<{ url: (rel: string) => string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = safeJoin(root, rel);
    if (!file) return void res.writeHead(403).end();
    if (!sendFile(req, res, file)) res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: (rel) => `http://127.0.0.1:${port}/${rel.split(path.sep).map(encodeURIComponent).join('/')}`,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
