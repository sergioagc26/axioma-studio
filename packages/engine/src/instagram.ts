import { readFile } from 'node:fs/promises';
import { envValue, setEnvValue } from './env.ts';
import { fail, failKind, pause, redact, type Account, type SocialError } from './social.ts';

/**
 * Instagram por la «Instagram API with Facebook Login»: de las variantes que puede usar una app
 * instalada en un computador, es la que deja subir el MP4 desde el disco (sin dirección pública).
 * Cada cuenta de Instagram debe ser profesional y estar vinculada a una página de Facebook.
 * Los permisos van siempre en la cabecera Authorization, nunca en la dirección, y se guardan solo
 * en el .env: ninguna función exportada devuelve un permiso.
 * Por cuenta se guardan dos: el de su página y el de la persona (META_USER_TOKEN). La
 * documentación de Meta no deja claro cuál pide cada llamada, así que se prueba uno y, si Meta
 * lo rechaza, el otro; la cuenta recuerda cuál funcionó.
 */
const GRAPH = 'https://graph.facebook.com';
const DIALOG = 'https://www.facebook.com';
const VERSION = 'v26.0';
/** Publicar, leer cifras y ver las páginas; los tres últimos hacen falta si la página es de un cliente (portafolio de negocio). */
export const IG_SCOPES = ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'business_management', 'ads_management', 'ads_read'];
const PAGE_FIELDS = 'id,name,access_token,tasks,instagram_business_account{id,username}';

/** Versión de la Graph API: la del .env (META_API_VERSION) o la vigente. */
async function apiVersion(): Promise<string> {
  const v = await envValue('META_API_VERSION');
  return v && /^v\d{1,3}\.\d{1,2}$/.test(v) ? v : VERSION;
}

async function metaApp(): Promise<{ id: string; secret: string }> {
  const id = await envValue('META_APP_ID'), secret = await envValue('META_APP_SECRET');
  if (!id || !secret) throw new Error('Pon primero los datos de tu app de Meta.');
  return { id, secret };
}

// --- Errores ---
/** Códigos de «demasiadas peticiones» o fallo pasajero: se espera y se reintenta. */
const WAIT_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80002]);
/** Errores propios de Instagram (subcódigo 2207xxx) en los que Meta sí pide reintentar. */
const RETRY_SUBCODES = new Set([2207001, 2207008]);

/** Minutos que Meta pide esperar, si lo dice en la cabecera X-Business-Use-Case-Usage. */
function waitMinutes(usage?: string | null): number | undefined {
  try {
    const all = Object.values(JSON.parse(usage ?? '') as Record<string, { estimated_time_to_regain_access?: number }[]>).flat();
    return Math.max(0, ...all.map((u) => Number(u.estimated_time_to_regain_access) || 0)) || undefined;
  } catch { return undefined; }
}

/**
 * Traduce un error de Meta a español y lo clasifica: 'reconectar' (el permiso caducó, se retiró o
 * ya no hay acceso a la página), 'espera' (límite de peticiones o fallo pasajero) u 'otro'.
 * El mensaje nunca lleva permisos ni direcciones: `secrets` son los valores enviados, por si Meta los repite.
 */
export function igError(status: number, body: unknown, usage?: string | null, secrets: (string | undefined)[] = []): SocialError {
  const e = ((body as { error?: Record<string, unknown> } | null)?.error ?? {}) as Record<string, unknown>;
  const code = Number(e.code) || undefined, sub = Number(e.error_subcode) || undefined;
  const access = code === 10 || (code !== undefined && code >= 200 && code <= 299) || sub === 492;
  if (access || code === 190 || code === 102 || status === 401) {
    return fail(access ? 'Ya no tienes acceso a la página de Facebook de esta cuenta, o falta un permiso. Abre «Cuentas» y conéctala otra vez.' : 'Instagram pidió volver a conectar la cuenta. Abre «Cuentas».', 'reconectar', { code });
  }
  // Con subcódigo 2207xxx, Instagram dice qué pasó (cuenta restringida, portada fuera del video…):
  // aunque el código sea de «espera», no se arregla esperando, así que se enseña su mensaje.
  const igOwn = sub !== undefined && sub >= 2207000 && sub <= 2207999 && !RETRY_SUBCODES.has(sub) && e.is_transient !== true;
  if (!igOwn && ((code !== undefined && WAIT_CODES.has(code)) || e.is_transient === true || status === 429 || status >= 500)) {
    const waitMin = waitMinutes(usage);
    return fail(`Instagram pide esperar antes de seguir${waitMin ? ` (unos ${waitMin} min)` : ''}. Inténtalo más tarde.`, 'espera', { code, waitMin });
  }
  let detail = redact(String(e.error_user_msg || e.message || ''));
  for (const s of secrets) if (s && s.length >= 6) detail = detail.split(s).join('…');
  return fail(detail ? `Instagram respondió: ${detail.slice(0, 200)}` : `Instagram respondió con el error ${status}.`, 'otro', { code });
}

// --- Llamadas ---
type Params = Record<string, string | number | undefined>;

/** Una llamada a la Graph API. El permiso va en la cabecera; en POST los datos van en el cuerpo, no en la dirección. */
async function graph<T = any>(token: string | null, method: 'GET' | 'POST', route: string, params: Params = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v === undefined || v === '' ? [] : [[k, String(v)]])));
  const url = `${GRAPH}/${await apiVersion()}/${route}${method === 'GET' && qs.size ? `?${qs}` : ''}`;
  let r: Response;
  try {
    r = await fetch(url, {
      method, signal: AbortSignal.timeout(60_000),
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: method === 'POST' ? qs.toString() : undefined,
    });
  } catch { throw fail('No se pudo hablar con Instagram. Revisa tu conexión a internet.', 'espera'); }
  const body = await r.json().catch(() => null);
  if (!r.ok || body?.error) throw igError(r.status, body, r.headers.get('x-business-use-case-usage'), [token ?? undefined, ...['client_secret', 'code', 'fb_exchange_token'].map((k) => (params[k] === undefined ? undefined : String(params[k])))]);
  return body as T;
}

/** Los permisos de una cuenta, primero el que funcionó la última vez (por defecto, el de su página). */
async function tokensOf(a: Account): Promise<{ kind: 'pagina' | 'usuario'; token: string }[]> {
  const page = await envValue(a.envKey), user = await envValue('META_USER_TOKEN');
  const list = [...(page ? [{ kind: 'pagina' as const, token: page }] : []), ...(user && user !== page ? [{ kind: 'usuario' as const, token: user }] : [])];
  if (!list.length) throw fail('Esta cuenta no tiene su permiso guardado. Abre «Cuentas» y conéctala otra vez.', 'reconectar');
  return a.tokenKind === 'usuario' ? list.reverse() : list;
}

/**
 * Hace algo con el permiso de la cuenta y, si Meta lo rechaza, lo repite con el otro. Cuando el
 * segundo funciona, queda anotado en `a.tokenKind` (quien llama lo guarda en cuentas.json).
 */
async function withToken<T>(a: Account, fn: (token: string) => Promise<T>): Promise<T> {
  const [first, second] = await tokensOf(a);
  try { return await fn(first.token); } catch (e) {
    if (failKind(e) !== 'reconectar' || !second) throw e;
    const r = await fn(second.token);
    a.tokenKind = second.kind;
    return r;
  }
}

// --- Conectar ---
/** Dirección del diálogo de Facebook. Con Configuration ID (Facebook Login for Business) se usa ese; si no, la lista de permisos. */
export async function igAuthUrl(state: string, redirect: string): Promise<string> {
  const { id } = await metaApp();
  const config = await envValue('META_CONFIG_ID');
  const q = new URLSearchParams({ client_id: id, redirect_uri: redirect, state, response_type: 'code', ...(config ? { config_id: config } : { scope: IG_SCOPES.join(',') }) });
  return `${DIALOG}/${await apiVersion()}/dialog/oauth?${q}`;
}

interface Page { id: string; name?: string; access_token?: string; tasks?: string[]; instagram_business_account?: { id?: string; username?: string } }
export interface IgFound { igUserId: string; usuario: string; nombre?: string; pageId: string; envKey: string; aviso?: string }
/** `expiresAt`: cuándo caduca el permiso de Facebook (null = Meta no lo dijo; sin el campo = no cambió). */
/** Una página de Facebook donde se puede publicar (su permiso queda en el .env, en `envKey`). */
export interface FbFound { pageId: string; nombre: string; envKey: string; aviso?: string }
export interface IgConnected { cuentas: IgFound[]; paginas: number; expiresAt?: string | null; facebook?: FbFound[] }

/** Guarda en el .env el permiso de cada página con Instagram y devuelve las cuentas, ya sin permisos. */
async function keepPages(pages: Page[]): Promise<IgFound[]> {
  const out: IgFound[] = [];
  for (const p of pages) {
    const ig = p.instagram_business_account;
    if (!ig?.id || !/^\d{4,40}$/.test(ig.id)) continue;
    const envKey = `IG_TOKEN_${ig.id}`;
    if (p.access_token) await setEnvValue(envKey, p.access_token);
    const can = !p.tasks || p.tasks.includes('MANAGE') || p.tasks.includes('CREATE_CONTENT');
    out.push({ igUserId: ig.id, usuario: ig.username ?? ig.id, nombre: p.name, pageId: p.id, envKey, aviso: can ? undefined : `En la página «${p.name ?? p.id}» no tienes permiso para publicar. Pide acceso completo a esa página.` });
  }
  return out;
}

/** Guarda el permiso de cada página de Facebook (para publicar Reels en la página) y la devuelve sin permisos. */
async function keepFbPages(pages: Page[]): Promise<FbFound[]> {
  const out: FbFound[] = [];
  for (const p of pages) {
    if (!p.access_token || !/^\d{4,40}$/.test(p.id)) continue;
    const envKey = `FB_TOKEN_${p.id}`;
    await setEnvValue(envKey, p.access_token);
    const can = !p.tasks || p.tasks.includes('MANAGE') || p.tasks.includes('CREATE_CONTENT');
    out.push({ pageId: p.id, nombre: p.name ?? p.id, envKey, aviso: can ? undefined : `En la página «${p.name ?? p.id}» no tienes permiso para publicar. Pide acceso completo a esa página.` });
  }
  return out;
}

/**
 * Conecta con un token de usuario (el pegado desde el Graph API Explorer o el recién canjeado):
 * lo cambia por uno de larga duración (unos 60 días), lo guarda y busca las cuentas de Instagram
 * de sus páginas de Facebook.
 */
export async function igConnectWithToken(shortToken: string): Promise<IgConnected> {
  const { id, secret } = await metaApp();
  const long = await graph(null, 'POST', 'oauth/access_token', { grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: shortToken })
    .catch((e) => { throw failKind(e) === 'reconectar' ? fail('Facebook no aceptó ese token. Genera uno nuevo y vuelve a intentarlo.') : e; });
  const token = String(long.access_token ?? '');
  if (!token) throw fail('Facebook no devolvió el permiso. Inténtalo otra vez.');
  await setEnvValue('META_USER_TOKEN', token);
  // Todas las páginas, hoja por hoja (con el cursor: la dirección «next» de Meta no se usa).
  const pages: Page[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await graph(token, 'GET', 'me/accounts', { fields: PAGE_FIELDS, limit: 100, after });
    pages.push(...((r.data as Page[] | undefined) ?? []));
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  const secs = Number(long.expires_in);
  return { cuentas: await keepPages(pages), facebook: await keepFbPages(pages), paginas: pages.length, expiresAt: secs > 0 ? new Date(Date.now() + secs * 1000).toISOString() : null };
}

/** Termina el inicio de sesión con Facebook: canjea el código y conecta las cuentas. */
export async function igConnectWithCode(code: string, redirect: string): Promise<IgConnected> {
  const { id, secret } = await metaApp();
  const r = await graph(null, 'POST', 'oauth/access_token', { client_id: id, client_secret: secret, redirect_uri: redirect, code });
  if (!r.access_token) throw fail('Facebook no devolvió el permiso. Vuelve a pulsar Conectar.');
  return igConnectWithToken(String(r.access_token));
}

/** Añade la cuenta de Instagram de una página por su ID, con el permiso de Facebook ya guardado. */
export async function igAddPage(pageId: string): Promise<IgConnected> {
  if (!/^\d{5,30}$/.test(pageId)) throw new Error('El ID de la página son solo números.');
  const user = await envValue('META_USER_TOKEN');
  if (!user) throw new Error('Conecta primero con Facebook o pega un token.');
  const page = await graph<Page>(user, 'GET', pageId, { fields: PAGE_FIELDS });
  // La página sirve para publicar en Facebook aunque no tenga Instagram vinculado.
  return { cuentas: await keepPages([page]), facebook: await keepFbPages([page]), paginas: 1 };
}

// --- Publicar ---
/** Cuántas publicaciones lleva la cuenta en las últimas 24 h y cuál es su tope (lo dice Instagram; no es fijo). */
export async function igQuota(a: Account): Promise<{ usadas: number; total?: number } | null> {
  const r = await withToken(a, (t) => graph(t, 'GET', `${a.igUserId}/content_publishing_limit`, { fields: 'quota_usage,config' }));
  const d = r.data?.[0];
  return d ? { usadas: Number(d.quota_usage) || 0, total: Number(d.config?.quota_total) || undefined } : null;
}

interface Container { status_code?: string; status?: string; video_status?: { uploading_phase?: { status?: string; bytes_transferred?: number } } }
// `video_status` solo aparece en la guía de subida; si Instagram dice que no conoce ese campo, se deja de pedir.
let askVideoStatus = true;

async function containerWith(token: string, id: string): Promise<Container> {
  if (askVideoStatus) {
    try { return await graph<Container>(token, 'GET', id, { fields: 'status_code,status,video_status' }); } catch (e) {
      // Cualquier otro error (p. ej. una subida que ya no existe) no apaga el campo para las demás.
      if (failKind(e) !== 'otro' || !/video_status/i.test((e as Error).message)) throw e;
      askVideoStatus = false;
    }
  }
  return graph<Container>(token, 'GET', id, { fields: 'status_code,status' });
}
const container = (a: Account, id: string) => withToken(a, (t) => containerWith(t, id));

/** Envía el video (desde el byte `offset`) a la dirección de subida que dio Instagram. */
async function upload(uri: string, token: string, buf: Buffer, offset: number): Promise<void> {
  const u = new URL(uri);
  // El permiso solo se envía a Facebook, diga lo que diga la respuesta.
  if (u.protocol !== 'https:' || !/(^|\.)facebook\.com$/.test(u.hostname)) throw fail('Instagram devolvió una dirección de subida que no es suya. No se envió nada.');
  let r: Response;
  try {
    r = await fetch(uri, {
      method: 'POST', signal: AbortSignal.timeout(30 * 60_000),
      headers: { Authorization: `OAuth ${token}`, offset: String(offset), file_size: String(buf.length), 'Content-Type': 'application/octet-stream' },
      body: buf.subarray(offset) as Uint8Array<ArrayBuffer>,
    });
  } catch { throw fail('Se cortó la subida del video. Revisa tu conexión a internet.', 'espera'); }
  const text = await r.text().catch(() => '');
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* no es JSON */ }
  if (r.ok && body?.success !== false && !body?.error) return;
  if (r.status === 401 || r.status === 403 || /unauthori[sz]ed|access token|oauth/i.test(text)) throw fail('Instagram no aceptó el permiso de esta cuenta para subir el video. Abre «Cuentas» y conéctala otra vez.', 'reconectar');
  if (body?.error) throw igError(r.status, body, null, [token]);
  const why = redact(String(body?.debug_info?.message ?? '')).split(token).join('…').slice(0, 200);
  // Meta dice en `debug_info.retriable` si vale la pena reintentar: entonces se sigue desde lo que llegó.
  throw fail(`Instagram no aceptó la subida${why ? `: ${why}` : ` (error ${r.status})`}.`, r.status >= 500 || body?.debug_info?.retriable === true ? 'espera' : 'otro');
}

/** Sube el video; si se corta, pregunta cuánto llegó y sigue desde ahí (dos reintentos). */
async function send(token: string, id: string, uri: string, buf: Buffer): Promise<void> {
  let offset = 0;
  for (let n = 0; ; n++) {
    try { return await upload(uri, token, buf, offset); } catch (e) {
      if (failKind(e) !== 'espera' || n >= 2) throw e;
      await pause(3000 * (n + 1));
      const up = (await containerWith(token, id).catch(() => null))?.video_status?.uploading_phase;
      const sent = Number(up?.bytes_transferred);
      if (up?.status === 'complete' || sent >= buf.length) return;
      // Si Instagram no dice cuánto llegó, se empieza de nuevo.
      offset = sent > 0 ? sent : 0;
    }
  }
}

/** Espera a que Instagram termine de procesar el video. Consulta cada vez más despacio (10, 20, 30 y luego 60 s; tope 10 min). */
async function waitReady(a: Account, id: string): Promise<'FINISHED' | 'PUBLISHED'> {
  const end = Date.now() + 10 * 60_000;
  const waits = [10, 20, 30, 60];
  for (let i = 0; ; i++) {
    await pause(1000 * waits[Math.min(i, waits.length - 1)]);
    let st: Container | null = null;
    try { st = await container(a, id); } catch (e) {
      // Con el límite de peticiones se espera lo que pide Meta, si cabe en el tiempo que queda.
      const wait = ((e as SocialError).waitMin ?? 1) * 60_000;
      if (failKind(e) !== 'espera' || Date.now() + wait > end) throw e;
      await pause(wait);
    }
    const code = st?.status_code;
    if (code === 'FINISHED' || code === 'PUBLISHED') return code;
    if (code === 'EXPIRED') throw fail('La subida caducó (pasaron más de 24 horas). Vuelve a publicar.');
    if (code === 'ERROR') throw fail(`Instagram no aceptó el video: ${redact(st?.status ?? 'no dijo por qué').slice(0, 200)}`);
    if (Date.now() >= end) throw fail('Instagram sigue procesando el video. Vuelve a pulsar Publicar en unos minutos: no se subirá otra vez.', 'espera');
  }
}

/** Busca el Reel que salió de una subida ya publicada: el único Reel de la cuenta posterior a `since`. */
async function findPublished(a: Account, since: number): Promise<{ id?: string; url?: string; aviso?: string }> {
  const r = await withToken(a, (t) => graph(t, 'GET', `${a.igUserId}/media`, { fields: 'id,permalink,timestamp,media_product_type', limit: 10 })).catch(() => null);
  const hits = ((r?.data ?? []) as { id: string; permalink?: string; timestamp?: string; media_product_type?: string }[])
    .filter((m) => m.media_product_type === 'REELS' && Date.parse(String(m.timestamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) >= since - 60_000);
  return hits.length === 1 ? { id: hits[0].id, url: hits[0].permalink }
    : { aviso: 'Instagram ya había publicado este video, pero no pude encontrar su enlace. Las cifras de este reel se ponen a mano.' };
}

export type IgStage = 'preparando' | 'subiendo' | 'procesando' | 'publicando';
export interface IgPublishOpts {
  file: string; caption: string;
  /** Portada: milisegundo del video. */
  portadaMs?: number;
  /** Subida de un intento anterior (menos de 24 h). `igual`: mismo video y mismo texto. */
  previo?: { id: string; at: string; igual: boolean };
  onStage?: (stage: IgStage, progress: number) => void | Promise<void>;
  /** Se llama en cuanto existe la subida, para poder retomarla si algo se corta. */
  onContainer?: (id: string) => void | Promise<void>;
}

/**
 * Publica un Reel: crea la subida, envía el MP4, espera a que Instagram lo procese y lo publica.
 * Reintento seguro: si la subida anterior ya se publicó, no se publica otra vez (se busca su
 * enlace); si ya estaba lista, solo se publica; en otro caso se sube de nuevo.
 * Sin `id` en la respuesta, el Reel está publicado pero no se pudo saber cuál es.
 */
export async function igPublish(a: Account, o: IgPublishOpts): Promise<{ id?: string; url?: string; aviso?: string }> {
  if (!a.igUserId) throw fail('Esta cuenta no es de Instagram.');
  let id: string | undefined, at = o.previo?.at ?? '', ready = false;
  if (o.previo) {
    // Si no se puede saber cómo quedó la subida anterior, no se sigue: podría publicarse dos veces.
    const st = await container(a, o.previo.id).catch((e) => { if (failKind(e) !== 'otro') throw e; return null; });
    if (st?.status_code === 'PUBLISHED') return findPublished(a, Date.parse(at));
    if (o.previo.igual && st?.status_code === 'FINISHED') { id = o.previo.id; ready = true; }
    else if (o.previo.igual && st?.status_code === 'IN_PROGRESS' && st.video_status?.uploading_phase?.status === 'complete') id = o.previo.id;
  }
  if (!id) {
    await o.onStage?.('preparando', 0.05);
    const buf = await readFile(o.file);
    // La subida se crea y se envía con el mismo permiso; si Meta lo rechaza, todo se repite con el otro.
    id = await withToken(a, async (token) => {
      const c = await graph(token, 'POST', `${a.igUserId}/media`, { media_type: 'REELS', upload_type: 'resumable', caption: o.caption, thumb_offset: o.portadaMs == null ? undefined : Math.max(0, Math.round(o.portadaMs)) });
      if (!c?.id || !c?.uri) throw fail('Instagram no dio una dirección para subir el video.');
      at = new Date().toISOString();
      await o.onContainer?.(String(c.id));
      await o.onStage?.('subiendo', 0.15);
      await send(token, String(c.id), String(c.uri), buf);
      return String(c.id);
    });
  }
  if (!ready) {
    await o.onStage?.('procesando', 0.7);
    if ((await waitReady(a, id)) === 'PUBLISHED') return findPublished(a, Date.parse(at));
  }
  await o.onStage?.('publicando', 0.9);
  let pub: { id?: string; config_issue?: unknown };
  try {
    pub = await withToken(a, (t) => graph(t, 'POST', `${a.igUserId}/media_publish`, { creation_id: id }));
    if (!pub?.id) throw fail('Instagram no confirmó la publicación.');
  } catch (e) {
    // Puede que sí se publicara y solo fallara la respuesta: se comprueba antes de dar el error.
    // Instagram puede tardar unos segundos en marcarlo, así que se mira hasta tres veces.
    for (let n = 0; n < 3; n++) {
      if (n) await pause(5000 * n);
      if ((await container(a, id).catch(() => null))?.status_code === 'PUBLISHED') return findPublished(a, Date.parse(at));
      // Si Meta rechazó la petición con un error claro (no un corte), no hace falta esperar más.
      if (failKind(e) === 'otro') break;
    }
    throw e;
  }
  const issue = pub.config_issue ? JSON.stringify(pub.config_issue) : '';
  const aviso = !issue ? undefined : issue.includes('CAPTION_NOT_ATTACHED') ? 'Se publicó, pero sin el texto. Pégalo a mano en Instagram.' : `Se publicó, pero Instagram avisó de un problema (${redact(issue).replace(/["[\]{}]/g, '').slice(0, 80)}).`;
  const url = (await withToken(a, (t) => graph(t, 'GET', pub.id!, { fields: 'permalink' })).catch(() => null))?.permalink as string | undefined;
  return { id: pub.id, url, aviso };
}

// --- Cifras ---
export interface IgMetrics { views?: number; likes?: number; comments?: number; shares?: number; saves?: number }
const METRIC: Record<string, keyof IgMetrics> = { views: 'views', likes: 'likes', comments: 'comments', shares: 'shares', saved: 'saves' };

async function insights(a: Account, mediaId: string, metric: string): Promise<IgMetrics> {
  const r = await withToken(a, (t) => graph(t, 'GET', `${mediaId}/insights`, { metric }));
  const out: IgMetrics = {};
  for (const d of (r.data ?? []) as { name: string; values?: { value?: number }[]; total_value?: { value?: number } }[]) {
    const v = Number(d.values?.[0]?.value ?? d.total_value?.value);
    if (METRIC[d.name] && Number.isFinite(v)) out[METRIC[d.name]] = v;
  }
  return out;
}

/**
 * Cifras reales de un Reel. 'views' está marcada por Meta como «en desarrollo»: si la rechaza se
 * pide el resto, y las vistas que falten se leen del propio Reel. Sin datos todavía (pueden
 * tardar hasta 48 h) devuelve null: nunca se inventa un 0.
 */
export async function igMetrics(a: Account, mediaId: string): Promise<IgMetrics | null> {
  const soft = (e: unknown) => { if (failKind(e) !== 'otro') throw e; return null; };
  let m: IgMetrics = (await insights(a, mediaId, 'views,likes,comments,shares,saved').catch(soft)) ?? (await insights(a, mediaId, 'likes,comments,shares,saved').catch(soft)) ?? {};
  if (m.views == null) {
    const n = await withToken(a, (t) => graph(t, 'GET', mediaId, { fields: 'like_count,comments_count,total_views_count,shares_count,saved_count' })).catch(soft);
    const num = (x: unknown) => (x == null || !Number.isFinite(Number(x)) ? undefined : Number(x));
    if (n) m = { views: num(n.total_views_count), likes: m.likes ?? num(n.like_count), comments: m.comments ?? num(n.comments_count), shares: m.shares ?? num(n.shares_count), saves: m.saves ?? num(n.saved_count) };
  }
  return Object.values(m).some((v) => v != null) ? m : null;
}

// --- Publicar en una página de Facebook (Reel de Facebook) ---
export type FbStage = IgStage;

/**
 * Publica un Reel en una página de Facebook con el flujo oficial de tres pasos: se pide la subida
 * (start), se envía el MP4 a la dirección de Facebook y se publica (finish). Luego se espera a que
 * Facebook lo procese para devolver el enlace. Usa el permiso de la página (pages_manage_posts).
 */
export async function fbPublish(a: Account, o: { file: string; caption: string; onStage?: (stage: FbStage, progress: number) => void | Promise<void> }): Promise<{ id?: string; url?: string; aviso?: string }> {
  if (!a.pageId) throw fail('Esta cuenta no es una página de Facebook.');
  await o.onStage?.('preparando', 0.05);
  const buf = await readFile(o.file);
  const id = await withToken(a, async (token) => {
    const start = await graph(token, 'POST', `${a.pageId}/video_reels`, { upload_phase: 'start' });
    if (!start?.video_id || !start?.upload_url) throw fail('Facebook no dio una dirección para subir el video.');
    await o.onStage?.('subiendo', 0.15);
    await upload(String(start.upload_url), token, buf, 0);
    await o.onStage?.('publicando', 0.7);
    const fin = await graph(token, 'POST', `${a.pageId}/video_reels`, { upload_phase: 'finish', video_id: String(start.video_id), video_state: 'PUBLISHED', description: o.caption });
    if (fin?.success === false) throw fail('Facebook no confirmó la publicación.');
    return String(start.video_id);
  });
  // Facebook procesa el video unos minutos; se pide el enlace sin bloquear si tarda.
  await o.onStage?.('procesando', 0.85);
  let url: string | undefined, aviso: string | undefined;
  for (let i = 0; i < 12; i++) {
    const st = await withToken(a, (t) => graph(t, 'GET', id, { fields: 'status,permalink_url' })).catch(() => null);
    const phase = st?.status?.video_status;
    if (st?.permalink_url) url = st.permalink_url.startsWith('http') ? st.permalink_url : `https://www.facebook.com${st.permalink_url}`;
    if (phase === 'error') { aviso = 'Facebook recibió el video pero dio un error al procesarlo. Revísalo en la página.'; break; }
    if (phase === 'ready' || phase === 'published') break;
    await pause(10_000);
  }
  return { id, url, aviso };
}
