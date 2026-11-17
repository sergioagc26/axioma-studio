import { existsSync } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { run } from './exec.ts';
import { classifyFiles, orderFolder, type OrderFiles } from './inbox.ts';

/**
 * Traer el material desde un enlace: lo que necesita quien usa la app sin instalar nada (en la
 * nube no puede arrastrar archivos). Sirve con enlaces públicos de Google Drive (un archivo), de
 * Dropbox (archivo o carpeta) y con cualquier enlace directo a un archivo. Se baja con curl, que
 * respeta el proxy de la máquina (en la nube la salida a internet pasa por ahí).
 */

export interface LinkTarget {
  url: string;
  kind: 'drive' | 'dropbox' | 'directo';
}

/** Convierte el enlace que la persona copió en uno que baja el archivo. Error claro si no se puede. */
export function directUrl(link: string): LinkTarget {
  let u: URL;
  try { u = new URL(link.trim()); } catch { throw new Error('Eso no parece un enlace. Copia el enlace completo (empieza con https://).'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('El enlace tiene que empezar con https://.');
  const host = u.hostname.replace(/^www\./, '');

  if (/(^|\.)google\.com$/.test(host) && (host.startsWith('drive') || host.startsWith('docs'))) {
    if (/\/folders?\//.test(u.pathname) || u.pathname.includes('/drive/folders')) {
      throw new Error('Es una carpeta de Google Drive: comparte cada video por separado (clic derecho › Compartir › «Cualquier persona con el enlace») o súbelos a Dropbox, que sí baja carpetas enteras.');
    }
    const id = u.pathname.match(/\/(?:file\/)?d\/([\w-]{10,})/)?.[1] ?? u.searchParams.get('id');
    if (!id) throw new Error('No reconozco ese enlace de Google Drive. Usa «Compartir › Copiar enlace» sobre el video.');
    return { kind: 'drive', url: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` };
  }
  if (host === 'drive.usercontent.google.com') return { kind: 'drive', url: u.toString() };

  if (/(^|\.)dropbox(usercontent)?\.com$/.test(host)) {
    // dl=1 baja el archivo (o la carpeta entera en .zip) en vez de mostrar la página.
    u.searchParams.set('dl', '1');
    return { kind: 'dropbox', url: u.toString() };
  }

  if (/(^|\.)(wetransfer\.com|we\.tl)$/.test(host)) {
    throw new Error('Los enlaces de WeTransfer no se pueden bajar solos: sube el video a Google Drive o Dropbox y comparte ese enlace.');
  }
  if (/(^|\.)(icloud\.com)$/.test(host)) {
    throw new Error('Los enlaces de iCloud no se pueden bajar solos: sube el video a Google Drive o Dropbox y comparte ese enlace.');
  }
  return { kind: 'directo', url: u.toString() };
}

async function looksLikeHtml(file: string): Promise<boolean> {
  const fh = await open(file, 'r');
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(512), 0, 512, 0);
    return /^\s*(<!doctype html|<html|<head|<\?xml)/i.test(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally { await fh.close(); }
}

async function isZip(file: string): Promise<boolean> {
  const fh = await open(file, 'r');
  try {
    const { buffer } = await fh.read(Buffer.alloc(4), 0, 4, 0);
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  } finally { await fh.close(); }
}

/** Mueve un archivo a la carpeta sin pisar otro con el mismo nombre (toma 2, toma 3…). */
async function moveInto(file: string, dir: string): Promise<string> {
  const ext = path.extname(file), base = path.basename(file, ext);
  let dest = path.join(dir, `${base}${ext}`);
  for (let i = 2; existsSync(dest); i++) dest = path.join(dir, `${base} (${i})${ext}`);
  await rename(file, dest);
  return dest;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === '__MACOSX') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(f))); else out.push(f);
  }
  return out;
}

export interface FetchResult {
  pedido: string;
  folder: string;
  /** Archivos que quedaron en la carpeta del pedido (nombres). */
  files: string[];
  /** Cómo los reconoce el pedido (videos, guion, logo…). */
  classified: OrderFiles;
  bytes: number;
}

/**
 * Baja lo que hay en un enlace a la carpeta de un pedido de «Para editar» (la crea si no existe).
 * Una carpeta de Dropbox llega como .zip y se descomprime. Si el enlace no es público, lo dice.
 */
export async function fetchToOrder(link: string, pedido: string, opts: { onProgress?: (m: string) => void } = {}): Promise<FetchResult> {
  const target = directUrl(link);
  const folder = await orderFolder(pedido);
  const tmp = path.join(folder, `.bajando-${Date.now().toString(36)}`);
  await mkdir(tmp, { recursive: true });
  try {
    opts.onProgress?.(target.kind === 'directo' ? 'Bajando el archivo…' : `Bajando desde ${target.kind === 'drive' ? 'Google Drive' : 'Dropbox'}…`);
    // -J -O: el nombre del archivo lo da el servidor (Drive y Dropbox lo mandan); --fail: un 404 es error.
    await run(process.env.SE_CURL ?? 'curl', ['-L', '--fail', '-sS', '-J', '-O', '--retry', '2', '--connect-timeout', '20', '-A', 'Mozilla/5.0 (AxiomaStudio)', target.url], { cwd: tmp })
      .catch((e: Error) => {
        const code = e.message.match(/error: (\d{3})/)?.[1] ?? e.message.match(/returned error: (\d{3})/)?.[1];
        throw new Error(code === '404' ? 'El enlace no existe o ya venció.' : code === '403' || code === '401'
          ? 'El enlace no es público: compártelo como «Cualquier persona con el enlace» y vuelve a intentar.'
          : `No pude bajar el enlace: ${e.message.split('\n').find((l) => l.includes('curl:')) ?? e.message.split('\n')[0]}`);
      });
    let got = await walk(tmp);
    if (!got.length) throw new Error('El enlace no trajo ningún archivo.');
    if (got.length === 1 && await looksLikeHtml(got[0])) {
      throw new Error('El enlace abre una página, no un archivo: revisa que sea público («Cualquier persona con el enlace») y que sea el enlace del video, no de una carpeta.');
    }
    // Carpeta de Dropbox (o un .zip): se descomprime.
    const zips = [];
    for (const f of got) if (await isZip(f)) zips.push(f);
    for (const z of zips) {
      opts.onProgress?.('Descomprimiendo…');
      const into = path.join(tmp, path.basename(z, path.extname(z)) || 'carpeta');
      await mkdir(into, { recursive: true });
      await run(process.env.SE_UNZIP ?? 'unzip', ['-q', '-o', z, '-d', into]).catch(() => { throw new Error('Llegó un .zip que no pude abrir: sube los videos sueltos.'); });
      await rm(z, { force: true });
    }
    got = await walk(tmp);
    // Sin extensión (algunos servidores no mandan el nombre): se asume video.
    const placed: string[] = [];
    let bytes = 0;
    for (const f of got) {
      const named = path.extname(f) ? f : `${f}.mp4`;
      if (named !== f) await rename(f, named);
      bytes += (await stat(named)).size;
      placed.push(path.basename(await moveInto(named, folder)));
    }
    const all = (await readdir(folder)).filter((n) => !n.startsWith('.')).map((n) => path.join(folder, n));
    return { pedido: path.basename(folder), folder, files: placed, classified: classifyFiles(all), bytes };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
