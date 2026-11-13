import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publishPack, publishText, type Project } from '@axioma/schema';
import { ensureEntry, listEntries, localNow, setRemote, updateEntry, type Remote } from './calendar.ts';
import { envValue, removeEnvValue } from './env.ts';
import { igAddPage, igAuthUrl, igConnectWithCode, igConnectWithToken, igMetrics, igPublish, igQuota, type IgConnected, type IgStage } from './instagram.ts';
import { readKit } from './kit.ts';
import { probe } from './media.ts';
import { listProjects } from './ops.ts';
import { P, WORKSPACE, slugify } from './paths.ts';
import { learnFromResults } from './results.ts';
import { readProject, readTranscript, writeJsonAtomic } from './store.ts';

/**
 * Publicar en redes desde la app: cuentas conectadas, elegir y revisar el video, publicarlo y
 * traer sus cifras. Hoy solo Instagram (instagram.ts); TikTok llegará después.
 * Los permisos (tokens) viven solo en el .env: aquí y en workspace/cuentas.json nunca hay ninguno,
 * y ninguna función de este módulo los devuelve. Publicar es público y no se deshace: nada se
 * publica solo, siempre lo pide una persona.
 * (social.ts e instagram.ts se importan entre sí; solo se usan dentro de funciones.)
 */
export type Red = 'instagram' | 'tiktok';

/** Una cuenta conectada. `envKey` es el NOMBRE de la clave del .env donde está su permiso, no el permiso. */
export interface Account {
  id: string; red: Red; usuario: string; nombre?: string; igUserId?: string; pageId?: string; envKey: string;
  /** Qué permiso funcionó la última vez: el de la página o el de la persona. */
  tokenKind?: 'pagina' | 'usuario';
  connectedAt: string;
  /** Algo que conviene saber (p. ej. falta permiso para publicar en esa página). */
  aviso?: string;
  /** Con error, la cuenta hay que conectarla otra vez. */
  error?: string;
}
interface AccountsFile { cuentas: Account[]; porCliente: Record<string, Partial<Record<Red, string>>>; /** Cuándo caduca el permiso de Facebook (unos 60 días). */ userTokenExpiresAt?: string }

const FILE = path.join(WORKSPACE, 'cuentas.json');
const PORT = Number(process.env.SE_STUDIO_PORT ?? 4747);
const DAY = 86_400_000;
const NO_ACCOUNT = 'Conecta la cuenta en Proyectos → 🔗 Cuentas.';
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// --- Errores de las redes ---
/** 'reconectar': el permiso ya no vale · 'espera': inténtalo más tarde · 'otro': lo demás. */
export type FailKind = 'reconectar' | 'espera' | 'otro';
export type SocialError = Error & { kind: FailKind; code?: number; waitMin?: number };

export function fail(message: string, kind: FailKind = 'otro', extra: { code?: number; waitMin?: number } = {}): SocialError {
  return Object.assign(new Error(message), { kind, ...extra });
}
export function failKind(e: unknown): FailKind {
  const k = (e as { kind?: unknown } | null)?.kind;
  return k === 'reconectar' || k === 'espera' ? k : 'otro';
}

/** Quita permisos y claves de un texto antes de mostrarlo o escribirlo en un registro. */
export function redact(text: string): string {
  return text
    .replace(/\b(access_token|client_secret|fb_exchange_token|input_token|code|token|clave)=[^&\s"'<>]+/gi, '$1=…')
    .replace(/("(?:access_token|client_secret|token)"\s*:\s*")[^"]+/gi, '$1…')
    .replace(/\b(Bearer|OAuth)\s+[\w.|~+/=-]{8,}/g, '$1 …')
    .replace(/\bEAA[A-Za-z0-9]{20,}/g, '…');
}

/** Espera entre consultas a la red (en las pruebas no se espera). */
export function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, process.env.VITEST ? 1 : ms));
}

function onlyInstagram(red: unknown): asserts red is 'instagram' {
  if (red !== 'instagram') throw new Error('Por ahora solo se puede publicar en Instagram.');
}

// --- Cuentas (workspace/cuentas.json, sin permisos) ---
/** `strict`: si el archivo existe pero no se puede leer, falla (para no guardar encima una lista vacía). */
export async function readAccounts(strict = false): Promise<AccountsFile> {
  try {
    const j = JSON.parse(await readFile(FILE, 'utf8')) as Partial<AccountsFile>;
    return { ...j, cuentas: j.cuentas ?? [], porCliente: j.porCliente ?? {} };
  } catch (e) {
    if (strict && (e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('No se pudo leer workspace/cuentas.json. No se cambió nada.');
    return { cuentas: [], porCliente: {} };
  }
}

export async function writeAccounts(f: AccountsFile): Promise<void> {
  await mkdir(WORKSPACE, { recursive: true });
  // Atómico: quien lo lea a la vez nunca ve el archivo vacío ni a medias.
  await writeJsonAtomic(FILE, f);
}

// Los cambios van en fila: publicar y traer cifras a la vez no se pisan.
let line: Promise<unknown> = Promise.resolve();
function editAccounts(fn: (f: AccountsFile) => void): Promise<void> {
  const next = line.then(async () => { const f = await readAccounts(true); fn(f); await writeAccounts(f); });
  line = next.catch(() => {});
  return next;
}

/** Tras usar una cuenta: recuerda qué permiso funcionó y quita (o pone) su error. */
async function settle(a: Account, kindBefore: Account['tokenKind'], error?: string) {
  if (a.tokenKind === kindBefore && a.error === error) return;
  await editAccounts((f) => {
    const x = f.cuentas.find((c) => c.id === a.id);
    if (x) { x.tokenKind = a.tokenKind; x.error = error; }
  });
  a.error = error;
}

export interface RedStatus {
  /** ¿Están puestos el App ID y el App Secret? */
  app: boolean;
  /** ¿Está puesto el Configuration ID (Facebook Login for Business)? */
  config: boolean;
  /** Dirección de retorno que se registra en el panel de Meta. */
  retorno: string;
  /** Cuándo caduca el permiso de Facebook y, si falta poco, el aviso. */
  caduca?: string; aviso?: string;
  cuentas: { id: string; usuario: string; nombre?: string; estado: 'ok' | 'reconectar'; error?: string; aviso?: string }[];
}

const publicAccount = (a: Account, hasToken = true): RedStatus['cuentas'][number] => ({ id: a.id, usuario: a.usuario, nombre: a.nombre, estado: a.error || !hasToken ? 'reconectar' : 'ok', error: a.error, aviso: a.aviso });

/** Qué hay conectado, para la pantalla «Cuentas». Solo nombres y estados: ningún permiso. */
export async function socialStatus(): Promise<{ instagram: RedStatus }> {
  const f = await readAccounts();
  const user = Boolean(await envValue('META_USER_TOKEN'));
  const cuentas: RedStatus['cuentas'] = [];
  for (const a of f.cuentas.filter((x) => x.red === 'instagram')) cuentas.push(publicAccount(a, user || Boolean(await envValue(a.envKey))));
  const left = f.userTokenExpiresAt ? Date.parse(f.userTokenExpiresAt) - Date.now() : null;
  const day = f.userTokenExpiresAt ? new Date(f.userTokenExpiresAt).toLocaleDateString('es', { day: 'numeric', month: 'long' }) : '';
  return {
    instagram: {
      app: Boolean((await envValue('META_APP_ID')) && (await envValue('META_APP_SECRET'))),
      config: Boolean(await envValue('META_CONFIG_ID')),
      retorno: callbackUrl('instagram'),
      caduca: f.userTokenExpiresAt,
      aviso: left == null || !cuentas.length ? undefined
        : left <= 0 ? `El permiso de Facebook caducó el ${day}. Conecta otra vez.`
        : left < 7 * DAY ? `El permiso de Facebook caduca el ${day}. Conecta otra vez antes de ese día.` : undefined,
      cuentas,
    },
  };
}

// --- Conectar ---
/** Dirección a la que vuelve Facebook tras dar permiso. Es «localhost» a propósito: Meta lo admite en modo Desarrollo. */
export function callbackUrl(red: Red): string {
  onlyInstagram(red);
  return `http://localhost:${PORT}/api/redes/instagram/callback`;
}

// Cada intento de conexión lleva una marca al azar que vale 10 minutos y una sola vez.
const STATE_MS = 10 * 60_000;
const states = new Map<string, { red: Red; at: number }>();

export function newState(red: Red): string {
  const now = Date.now();
  for (const [k, v] of states) if (now - v.at > STATE_MS || states.size >= 20) states.delete(k);
  const state = randomBytes(24).toString('base64url');
  states.set(state, { red, at: now });
  return state;
}

/** Comprueba la marca y la gasta. Devuelve la red, o null si no vale (desconocida, usada o vieja). */
export function takeState(state: string | null): Red | null {
  const hit = state ? states.get(state) : undefined;
  if (state) states.delete(state);
  return hit && Date.now() - hit.at <= STATE_MS ? hit.red : null;
}

/** Dirección de Facebook donde el usuario da permiso. */
export async function connectUrl(red: Red): Promise<string> {
  onlyInstagram(red);
  return igAuthUrl(newState(red), callbackUrl(red));
}

export interface Connected { conectadas: string[]; avisos: string[] }

/** Guarda en cuentas.json las cuentas encontradas (sus permisos ya quedaron en el .env). */
async function keepAccounts(found: IgConnected): Promise<Connected> {
  if (!found.cuentas.length) {
    throw new Error(`${found.paginas ? `Encontré ${found.paginas} página${found.paginas === 1 ? '' : 's'} de Facebook, pero ninguna tiene` : 'No encontré'} cuentas de Instagram profesionales vinculadas a tus páginas de Facebook. Si la página es de un cliente, añádela con su ID de página.`);
  }
  await editAccounts((f) => {
    for (const c of found.cuentas) {
      const id = `ig-${c.igUserId}`;
      const old = f.cuentas.find((x) => x.id === id);
      f.cuentas = [...f.cuentas.filter((x) => x.id !== id), { id, red: 'instagram', usuario: c.usuario, nombre: c.nombre, igUserId: c.igUserId, pageId: c.pageId, envKey: c.envKey, tokenKind: old?.tokenKind, connectedAt: new Date().toISOString(), aviso: c.aviso }];
    }
    if (found.expiresAt !== undefined) f.userTokenExpiresAt = found.expiresAt ?? undefined;
  });
  return { conectadas: found.cuentas.map((c) => `@${c.usuario}`), avisos: found.cuentas.flatMap((c) => (c.aviso ? [c.aviso] : [])) };
}

/** Termina la conexión cuando Facebook vuelve con el código. La marca `state` se comprueba antes que nada. */
export async function finishConnect(red: Red, query: URLSearchParams): Promise<Connected> {
  onlyInstagram(red);
  if (takeState(query.get('state')) !== red) throw new Error('Este enlace de conexión ya no vale. Vuelve a pulsar Conectar.');
  const code = query.get('code');
  if (!code) throw new Error(query.get('error') ? 'No se dio permiso en Facebook. Vuelve a pulsar Conectar y acepta los permisos.' : 'Facebook no devolvió el código de conexión. Vuelve a pulsar Conectar.');
  return keepAccounts(await igConnectWithCode(code, callbackUrl(red)));
}

/** Conecta con un token pegado (el del Graph API Explorer). El token no vuelve a salir de aquí. */
export async function connectWithToken(red: Red, token: string): Promise<Connected> {
  onlyInstagram(red);
  const clean = String(token ?? '').replace(/[\s"']/g, '');
  if (clean.length < 30) throw new Error('El token parece incompleto.');
  return keepAccounts(await igConnectWithToken(clean));
}

/** Añade la cuenta de Instagram de una página por su ID (cuando la página de un cliente no sale en la lista). */
export async function connectPage(red: Red, pageId: string): Promise<Connected> {
  onlyInstagram(red);
  return keepAccounts(await igAddPage(String(pageId ?? '').trim()));
}

/** Desconecta una cuenta: borra su permiso del .env y la quita de la lista. */
export async function disconnectAccount(id: string): Promise<void> {
  const f = await readAccounts();
  const a = f.cuentas.find((x) => x.id === id);
  if (!a) throw new Error('Esa cuenta ya no está conectada.');
  await removeEnvValue(a.envKey);
  const last = !f.cuentas.some((x) => x.id !== id && x.red === a.red);
  // Sin más cuentas de Instagram, tampoco se guarda el permiso de Facebook.
  if (last && a.red === 'instagram') await removeEnvValue('META_USER_TOKEN');
  await editAccounts((g) => {
    g.cuentas = g.cuentas.filter((x) => x.id !== id);
    for (const c of Object.values(g.porCliente)) for (const r of Object.keys(c) as Red[]) if (c[r] === id) delete c[r];
    if (last && a.red === 'instagram') g.userTokenExpiresAt = undefined;
  });
}

/** La cuenta donde publicar: la elegida, la que se usó la última vez con ese cliente, o la única que hay. */
export async function accountFor(client: string | undefined, red: Red, accountId?: string): Promise<Account> {
  const f = await readAccounts();
  const all = f.cuentas.filter((a) => a.red === red);
  if (!all.length) throw new Error(NO_ACCOUNT);
  if (accountId) {
    const hit = all.find((a) => a.id === accountId);
    if (!hit) throw new Error('Esa cuenta ya no está conectada. Abre 🔗 Cuentas.');
    return hit;
  }
  const remembered = all.find((a) => a.id === f.porCliente[slugify(client ?? 'personal')]?.[red]);
  if (remembered) return remembered;
  if (all.length > 1) throw new Error('Elige a qué cuenta publicar.');
  return all[0];
}

// --- El video y su texto ---
/**
 * Entre los archivos de una carpeta, el último video vertical exportado de un reel. Los nombres
 * son <id>-<fecha>[-4x5|-1x1|-16x9][-gancho-x].mp4: se descartan los otros formatos y los
 * intermedios; las variantes de gancho son verticales y valen. Sin ninguno, null.
 */
export function pickVertical(names: string[], projectId: string): string | null {
  const hits = names.flatMap((n) => {
    if (!n.startsWith(`${projectId}-`) || n.includes('.sin-nivelar')) return [];
    const m = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})(.*)\.mp4$/i.exec(n.slice(projectId.length + 1));
    return m && !/-(4x5|1x1|16x9)(-|$)/.test(m[2]) ? [{ n, stamp: m[1], extra: m[2] }] : [];
  });
  // El más reciente; con la misma fecha, el que no es variante.
  hits.sort((a, b) => b.stamp.localeCompare(a.stamp) || a.extra.length - b.extra.length);
  return hits[0]?.n ?? null;
}

export interface VideoInfo { file: string; size: number; duration: number; fps: number; width: number; height: number }

/** El último MP4 vertical exportado del reel (en su carpeta `renders` o en la que eligió el usuario). */
export async function latestVertical(dir: string, project: Project): Promise<VideoInfo> {
  const custom = project.export.folder?.trim();
  const folders = [path.join(dir, P.renders), custom ? path.resolve(custom.replace(/^~(?=$|\/)/, os.homedir())) : ''].filter((f) => f && existsSync(f));
  const found = new Map<string, string>();
  for (const folder of folders) for (const n of await readdir(folder)) found.set(n, path.join(folder, n));
  const name = pickVertical([...found.keys()], project.id);
  if (!name) throw new Error('Exporta primero el video en vertical (9:16).');
  const file = found.get(name)!;
  const info = await probe(file);
  if (info.width >= info.height) throw new Error('El último video exportado no es vertical. Expórtalo en 9:16.');
  return { file, size: (await stat(file)).size, duration: info.duration, fps: info.fps, width: info.width, height: info.height };
}

/**
 * Lo que Instagram exige a un Reel: de 3 s a 15 min, hasta 300 MB, de 23 a 60 imágenes por
 * segundo, 1920 px de ancho como mucho y hasta 25 Mbps. Devuelve los problemas (vacío = vale).
 */
export function checkVideo(v: Pick<VideoInfo, 'size' | 'duration' | 'fps' | 'width'>): string[] {
  const out: string[] = [];
  if (v.duration < 3) out.push('El video dura menos de 3 segundos: Instagram no lo acepta como Reel.');
  if (v.duration > 15 * 60) out.push('El video dura más de 15 minutos: Instagram no lo acepta como Reel.');
  if (v.size > 300 * 1024 * 1024) out.push(`El video pesa ${Math.round(v.size / 1024 / 1024)} MB y el máximo de Instagram es 300 MB. Expórtalo con calidad «alta» o «ligera».`);
  if (v.fps < 23 || v.fps > 60) out.push(`El video va a ${Math.round(v.fps)} imágenes por segundo e Instagram pide entre 23 y 60.`);
  if (v.width > 1920) out.push('El video es demasiado ancho para Instagram (máximo 1920 px).');
  if (v.duration >= 3 && (v.size * 8) / v.duration > 25_000_000) out.push('El video pesa demasiado para lo que dura (más de 25 Mbps). Expórtalo con calidad «alta» o «ligera».');
  return out;
}

/**
 * Ajusta el texto a los límites de Instagram: 2200 caracteres, 30 hashtags y 20 menciones.
 * Corta en un espacio para no dejar una palabra ni un hashtag a medias.
 */
export function fitCaption(text: string): { texto: string; avisos: string[] } {
  const avisos: string[] = [];
  let tags = 0, ats = 0;
  let t = String(text ?? '').replace(/\r\n?/g, '\n').trim()
    .replace(/#[\p{L}\p{N}_]+/gu, (m) => (++tags > 30 ? '' : m))
    .replace(/(^|[^\w@])@(?=[\w.]+)/g, (m, pre: string) => (++ats > 20 ? pre : m));
  if (tags > 30) { avisos.push('Instagram admite 30 hashtags: se quitaron los que sobraban.'); t = t.replace(/[ \t]{2,}/g, ' ').trim(); }
  if (ats > 20) avisos.push('Instagram admite 20 menciones: a las que sobraban se les quitó la @.');
  if (t.length > 2200) {
    let cut = t.slice(0, 2200);
    const space = /\S/.test(t[2200]) ? cut.search(/\s\S*$/) : -1;
    // Sin ningún espacio se corta tal cual, cuidando de no partir un emoji.
    cut = space > 0 ? cut.slice(0, space) : cut.replace(/[\uD800-\uDBFF]$/, '');
    t = cut.trimEnd();
    avisos.push('El texto pasaba de 2200 caracteres y se recortó.');
  }
  return { texto: t, avisos };
}

async function defaultCaption(dir: string, project: Project): Promise<string> {
  return publishText(publishPack(project, await readTranscript(dir), (await readKit(project.client))?.sector));
}

const isDone = (r?: Remote) => Boolean(r?.id || r?.state === 'publicado');

/** Lo que se enseña antes de publicar: el video, la cuenta, el texto y si hay algo que lo impida. */
export async function prePublish(dir: string, red: Red, accountId?: string) {
  onlyInstagram(red);
  const project = await readProject(dir);
  const problemas: string[] = [], avisos: string[] = [];
  let video: VideoInfo | null = null;
  try { video = await latestVertical(dir, project); problemas.push(...checkVideo(video)); } catch (e) { problemas.push(msg(e)); }
  let cuenta: Account | null = null;
  try { cuenta = await accountFor(project.client, red, accountId); } catch (e) { problemas.push(msg(e)); }
  const caption = fitCaption(await defaultCaption(dir, project));
  avisos.push(...caption.avisos);
  let cupo: { usadas: number; total?: number } | undefined;
  if (cuenta) {
    if (cuenta.aviso) avisos.push(cuenta.aviso);
    const kind = cuenta.tokenKind;
    try {
      cupo = (await igQuota(cuenta)) ?? undefined;
      if (cupo?.total && cupo.usadas >= cupo.total) problemas.push(`Esta cuenta ya llegó al máximo de publicaciones de hoy (${cupo.usadas} de ${cupo.total}).`);
      await settle(cuenta, kind);
    } catch (e) {
      // Sin internet no se bloquea la vista previa; si el permiso ya no vale, sí.
      if (failKind(e) === 'reconectar') { await settle(cuenta, kind, msg(e)); problemas.push(msg(e)); }
    }
  }
  const done = (await listEntries()).filter((e) => e.projectId === project.id && e.network === red && isDone(e.remote)).pop();
  if (done) avisos.push('Este video ya se publicó en Instagram desde la app. Si sigues, saldrá otra vez.');
  return {
    red, archivo: video ? path.basename(video.file) : null, peso: video?.size ?? 0, duracion: video?.duration ?? 0, texto: caption.texto,
    cuenta: cuenta?.id ?? null, cuentas: (await readAccounts()).cuentas.filter((a) => a.red === red).map((a) => publicAccount(a)),
    cupo, avisos, problemas, publicado: done ? { url: done.remote?.url, fecha: done.date } : undefined, listo: problemas.length === 0,
  };
}

// --- Publicar ---
export interface PublishOpts { red: Red; cuenta?: string; texto?: string; entrada?: string; /** Publicarlo aunque ya se haya publicado antes. */ repetir?: boolean; /** Portada: milisegundo del video. */ portadaMs?: number }
export type PublishResult = { url?: string; entrada: string; estado: 'publicado'; cuenta: string; aviso?: string };

const STAGES: Record<IgStage, string> = {
  preparando: 'Preparando la subida…', subiendo: 'Subiendo el video a Instagram…',
  procesando: 'Instagram está procesando el video…', publicando: 'Publicando…',
};
/** Una subida anterior en esta cuenta que no consta como publicada (sea cual sea su edad: hay que preguntar cómo quedó). */
const pending = (r: Remote | undefined, account: string) => Boolean(r?.containerId && r.containerAt && r.account === account && !isDone(r));
/** …y de menos de 24 h: solo esa se puede reutilizar. */
const fresh = (r: Remote | undefined, account: string) => pending(r, account) && Date.now() - Date.parse(r!.containerAt!) < DAY;

// --- Una publicación a la vez por reel y cuenta, también entre procesos (el studio y el MCP) ---
const LOCK_MS = 3 * 3_600_000;
const lockFile = (key: string) => path.join(WORKSPACE, `publicando-${createHash('sha256').update(key).digest('hex').slice(0, 16)}.lock`);
const alive = (pid: unknown) => {
  if (!Number.isInteger(pid) || (pid as number) <= 0) return false;
  try { process.kill(pid as number, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
};

/** Crea el candado en disco. false si otro (este proceso u otro) ya está publicando lo mismo. */
async function takeLock(file: string): Promise<boolean> {
  await mkdir(WORKSPACE, { recursive: true });
  for (let i = 0; i < 2; i++) {
    try { await writeFile(file, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' }); return true; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    let old: { pid?: number; at?: number } | null = null;
    try { old = JSON.parse(await readFile(file, 'utf8')); } catch { /* recién creado o dañado */ }
    const age = Date.now() - (old?.at ?? (await stat(file).catch(() => null))?.mtimeMs ?? 0);
    // Se quita solo si su proceso ya no existe o es muy viejo; uno recién creado y aún vacío se respeta.
    if (old ? alive(old.pid) && age < LOCK_MS : age < 60_000) return false;
    await rm(file, { force: true });
  }
  return false;
}

/**
 * Publica el último video vertical del reel como Reel de Instagram y lo anota en el calendario.
 * Es público y no se puede deshacer: solo se llama cuando una persona lo confirma.
 * Si un intento anterior se quedó a medias, lo retoma en vez de subir y publicar otra vez.
 */
export async function publishReel(dir: string, o: PublishOpts, onProgress?: (message: string, progress: number) => void): Promise<PublishResult> {
  onlyInstagram(o.red);
  const project = await readProject(dir);
  const account = await accountFor(project.client, o.red, o.cuenta);
  const lock = lockFile(`${project.id}|${o.red}|${account.id}`);
  if (!(await takeLock(lock))) throw new Error('Ya se está publicando este video.');
  try {
    const video = await latestVertical(dir, project);
    const problems = checkVideo(video);
    if (problems.length) throw new Error(problems[0]);
    const fitted = fitCaption(o.texto?.trim() ? o.texto : await defaultCaption(dir, project));
    const caption = fitted.texto;
    // La portada tiene que caer dentro del video (Instagram rechaza una posterior al final).
    const portadaMs = o.portadaMs == null || !Number.isFinite(o.portadaMs) ? undefined : Math.min(Math.max(0, Math.round(o.portadaMs)), Math.max(0, Math.floor(video.duration * 1000) - 1));
    const mine = (await listEntries()).filter((e) => e.projectId === project.id && e.network === o.red);
    if (!o.repetir && mine.some((e) => isDone(e.remote))) throw new Error('Este video ya se publicó en Instagram. Para publicarlo otra vez, confírmalo.');
    // Un intento a medias manda sobre todo lo demás: se retoma en su misma entrada.
    const wanted = mine.find((e) => e.id === o.entrada);
    const entry = mine.find((e) => fresh(e.remote, account.id)) ?? mine.find((e) => pending(e.remote, account.id))
      ?? await ensureEntry(project.id, o.red, wanted && isDone(wanted.remote) ? undefined : o.entrada);
    const prev = pending(entry.remote, account.id) ? entry.remote! : undefined;
    const recent = fresh(entry.remote, account.id);
    let tries = recent ? prev?.tries ?? 0 : 0;
    if (tries >= 5) throw new Error('Este video ya se intentó subir varias veces hoy. Espera a mañana o revisa el archivo.');
    const firma = createHash('sha256').update([path.basename(video.file), video.size, caption, portadaMs ?? ''].join('\n')).digest('hex').slice(0, 16);
    // Sin subida previa en ESTA cuenta, se borra el rastro de otra (si no, se retomaría la subida de otra cuenta).
    const clean: Partial<Remote> = prev ? {} : { containerId: undefined, containerAt: undefined, firma: undefined, tries: undefined };
    await setRemote(entry.id, { ...clean, account: account.id, state: 'subiendo', sentAt: new Date().toISOString(), duration: video.duration, error: undefined });
    const kind = account.tokenKind;
    try {
      const r = await igPublish(account, {
        file: video.file, caption, portadaMs,
        // Una subida de más de 24 h solo se consulta (por si ya salió); no se reutiliza.
        previo: prev ? { id: prev.containerId!, at: prev.containerAt!, igual: recent && prev.firma === firma } : undefined,
        onContainer: async (id) => { await setRemote(entry.id, { containerId: id, containerAt: new Date().toISOString(), firma, tries: ++tries }); },
        onStage: async (stage, progress) => {
          onProgress?.(STAGES[stage], progress);
          if (stage === 'procesando') await setRemote(entry.id, { state: 'procesando' });
        },
      });
      await setRemote(entry.id, { state: 'publicado', id: r.id, url: r.url, error: undefined });
      await updateEntry(entry.id, { status: 'publicado', ...localNow() });
      await settle(account, kind);
      await editAccounts((f) => { (f.porCliente[slugify(project.client ?? 'personal')] ??= {})[o.red] = account.id; });
      return { url: r.url, entrada: entry.id, estado: 'publicado', cuenta: account.usuario, aviso: [r.aviso, ...fitted.avisos].filter(Boolean).join(' ') || undefined };
    } catch (e) {
      await setRemote(entry.id, { state: 'error', error: msg(e) }).catch(() => {});
      await settle(account, kind, failKind(e) === 'reconectar' ? msg(e) : account.error).catch(() => {});
      throw e;
    }
  } finally {
    await rm(lock, { force: true }).catch(() => {});
  }
}

// --- Cifras ---
export type SyncResult = { actualizadas: number; pendientes: number; errores: string[] };
const SYNC_MS = 6 * 3_600_000;

async function doSync(o: { entrada?: string; cliente?: string; force?: boolean }): Promise<SyncResult> {
  const f = await readAccounts();
  const projects = new Map((await listProjects()).map((x) => [x.project.id, x.project]));
  const now = Date.now();
  const todo = (await listEntries()).filter((e) => {
    const r = e.remote;
    if (e.network !== 'instagram' || !r?.id) return false;
    // Pedida a mano, se trae aunque tenga más de 90 días; las automáticas, solo las recientes.
    if (o.entrada) return e.id === o.entrada;
    if (now - Date.parse(r.sentAt) > 90 * DAY) return false;
    if (o.cliente && slugify(projects.get(e.projectId)?.client ?? 'personal') !== slugify(o.cliente)) return false;
    return Boolean(o.force) || !r.syncedAt || now - Date.parse(r.syncedAt) > SYNC_MS;
  });
  const out: SyncResult = { actualizadas: 0, pendientes: 0, errores: [] };
  if (o.entrada && !todo.length) out.errores.push('Esa publicación no se hizo desde la app: sus cifras se ponen a mano.');
  const skip = new Set<string>(), changed = new Set<string | undefined>();
  for (const e of todo) {
    const name = projects.get(e.projectId)?.name ?? e.projectId;
    const account = f.cuentas.find((a) => a.id === e.remote!.account);
    if (!account) { out.errores.push(`«${name}»: su cuenta ya no está conectada.`); continue; }
    if (skip.has(account.id)) continue;
    const kind = account.tokenKind;
    try {
      const m = await igMetrics(account, e.remote!.id!);
      // Sin vistas todavía no se escribe nada: guardar un 0 borraría las cifras que hubiera.
      if (m?.views) {
        await updateEntry(e.id, { metrics: { views: m.views, likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, source: 'api' } });
        out.actualizadas++;
        changed.add(projects.get(e.projectId)?.client);
      } else out.pendientes++;
      await setRemote(e.id, { syncedAt: new Date().toISOString() });
      await settle(account, kind);
    } catch (err) {
      out.errores.push(`«${name}»: ${msg(err)}`);
      if (failKind(err) === 'reconectar') { skip.add(account.id); await settle(account, kind, msg(err)).catch(() => {}); }
      if (failKind(err) === 'espera') break;
    }
  }
  // Con cifras nuevas, la app vuelve a mirar qué le funciona a cada cliente.
  for (const c of changed) await learnFromResults(c, true).catch(() => {});
  return out;
}

// Una sincronización a la vez.
let syncLine: Promise<unknown> = Promise.resolve();

/**
 * Trae de Instagram las cifras reales de lo publicado desde la app (últimos 90 días) y las
 * guarda en el calendario. Sin `force` solo mira lo que lleva más de 6 h sin revisar.
 */
export function syncMetrics(o: { entrada?: string; cliente?: string; force?: boolean } = {}): Promise<SyncResult> {
  const next = syncLine.then(() => doSync(o));
  syncLine = next.catch(() => {});
  return next;
}

/** Trae las cifras solas: al minuto de abrir la app y luego cada 6 horas, mientras esté abierta. */
export function startMetricsTimer() {
  const tick = () => { syncMetrics().catch(() => {}); };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, SYNC_MS).unref?.();
}
