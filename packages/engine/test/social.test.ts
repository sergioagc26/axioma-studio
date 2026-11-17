import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Project } from '@axioma/schema';

// Todo ocurre en una carpeta temporal: ni el workspace ni el .env reales se tocan, y no hay
// ninguna llamada real a Meta (fetch está simulado; lo que no sea Meta simulado, falla).
const ws = mkdtempSync(path.join(os.tmpdir(), 'axioma-social-'));
const envFile = path.join(ws, 'env-de-prueba');
const port = 4960 + Math.floor(Math.random() * 30);
process.env.SE_WORKSPACE = ws;
process.env.SE_ENV_FILE = envFile;
process.env.SE_STUDIO_PORT = String(port);
for (const k of Object.keys(process.env)) if (/^(META_|IG_TOKEN_)/.test(k)) delete process.env[k];

// El video de prueba no es un MP4 de verdad: se simula lo que diría ffprobe.
vi.mock('../src/media.ts', async (original) => ({
  ...(await original<typeof import('../src/media.ts')>()),
  probe: async () => ({ duration: 12, width: 1080, height: 1920, fps: 30, rotation: 0, hasAudio: true, hdr: false }),
}));

const S = await import('../src/social.ts');
const IG = await import('../src/instagram.ts');
const C = await import('../src/calendar.ts');
const Env = await import('../src/env.ts');

const APP_ID = '1234567890123456';
const APP_SECRET = 'secreto-de-la-app-0123456789abcdef';
const SHORT = `EAAcorto${'x'.repeat(40)}`;
const LONG = `EAAlargo${'y'.repeat(60)}`;
const PAGE1 = `EAApaginaUno${'p'.repeat(50)}`;
const PAGE2 = `EAApaginaDos${'q'.repeat(50)}`;
const CODE = 'AQDcodigo-de-un-solo-uso-123456789';
const SECRETS = [APP_SECRET, SHORT, LONG, PAGE1, PAGE2, CODE];
const IG1 = '17841400000000001';
const IG2 = '17841400000000002';
const PERMALINK = 'https://www.instagram.com/reel/AbCdEf/';
const PAGES = [
  { id: '111000111', name: 'Mi negocio', access_token: PAGE1, tasks: ['MANAGE', 'CREATE_CONTENT'], instagram_business_account: { id: IG1, username: 'minegocio' } },
  { id: '222000222', name: 'Página sin Instagram', access_token: `EAAotra${'z'.repeat(40)}`, tasks: ['MANAGE'] },
  { id: '333000333', name: 'Cliente', access_token: PAGE2, tasks: ['ANALYZE'], instagram_business_account: { id: IG2, username: 'cliente' } },
];

/** Nada de lo que la app devuelve o guarda fuera del .env puede llevar un permiso o el secreto. */
const sinSecretos = (x: unknown) => {
  const t = typeof x === 'string' ? x : JSON.stringify(x);
  for (const s of SECRETS) expect(t).not.toContain(s);
};

// --- Meta simulado ---
interface Call { url: string; method: string; headers: Record<string, string>; body: unknown; key: string; form: URLSearchParams; query: URLSearchParams }
type Hook = (c: Call) => unknown;
const fake = {
  on: [] as [RegExp, Hook][],
  rejected: new Set<string>(),
  status: ['IN_PROGRESS', 'FINISHED'],
  videoStatus: undefined as unknown,
  containers: 0,
  insights: [] as { name: string; values: { value: number }[] }[],
  node: {} as Record<string, number>,
  media: [] as Record<string, string>[],
};
let calls: Call[] = [];
const count = (re: RegExp) => calls.filter((c) => re.test(c.key)).length;
const metaError = (code: number, status = 400, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message: 'Error validating access token: Session has expired.', type: 'OAuthException', code, fbtrace_id: 'A1', ...extra } }), { status, headers });

async function meta(c: Call): Promise<unknown> {
  for (const [re, fn] of fake.on) if (re.test(c.key)) { const r = await fn(c); if (r !== undefined) return r; }
  if ([...fake.rejected].some((t) => (c.headers.Authorization ?? '').includes(t))) return metaError(190, 401);
  const k = c.key;
  if (k === 'POST oauth/access_token') return c.form.get('grant_type') === 'fb_exchange_token' ? { access_token: LONG, token_type: 'bearer', expires_in: 5_184_000 } : { access_token: SHORT, token_type: 'bearer' };
  if (k === 'GET me/accounts') {
    return c.query.get('after') ? { data: [PAGES[1], PAGES[2]] }
      : { data: [PAGES[0]], paging: { cursors: { after: 'c1' }, next: `https://graph.facebook.com/v26.0/me/accounts?after=c1&access_token=${LONG}` } };
  }
  if (k === `GET ${PAGES[2].id}`) return PAGES[2];
  if (k === `GET ${IG1}/content_publishing_limit`) return { data: [{ quota_usage: 2, config: { quota_total: 50, quota_duration: 86400 } }] };
  if (k === `POST ${IG1}/media`) { const id = `C${++fake.containers}`; return { id, uri: `https://rupload.facebook.com/ig-api-upload/v26.0/${id}` }; }
  if (k === 'POST rupload') return { success: true };
  if (/^GET C\d+$/.test(k)) return { id: k.slice(4), status_code: fake.status.length > 1 ? fake.status.shift() : fake.status[0], video_status: fake.videoStatus };
  if (k === `POST ${IG1}/media_publish`) return { id: 'M1' };
  if (k === 'GET M1') return c.query.get('fields') === 'permalink' ? { permalink: PERMALINK } : fake.node;
  if (k === 'GET M1/insights') return { data: fake.insights };
  if (k === `GET ${IG1}/media`) return { data: fake.media };
  return new Response(JSON.stringify({ error: { message: `Ruta no simulada: ${k}`, type: 'GraphMethodException', code: 100 } }), { status: 400 });
}

const realFetch = globalThis.fetch;
const base = `http://127.0.0.1:${port}`;
vi.stubGlobal('fetch', async (input: unknown, init: RequestInit = {}) => {
  const url = String(input);
  if (url.startsWith(base)) return realFetch(url, init); // el studio de esta misma prueba
  if (!/^https:\/\/(graph|rupload)\.facebook\.com\//.test(url)) throw new TypeError('fetch failed (en las pruebas no hay red)');
  const u = new URL(url);
  const method = init.method ?? 'GET';
  const c: Call = {
    url, method, headers: { ...(init.headers as Record<string, string>) }, body: init.body,
    key: `${method} ${u.hostname === 'rupload.facebook.com' ? 'rupload' : u.pathname.replace(/^\/v\d+\.\d+\//, '')}`,
    form: new URLSearchParams(typeof init.body === 'string' ? init.body : ''), query: u.searchParams,
  };
  calls.push(c);
  const out = await meta(c);
  return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

// --- Un reel de prueba con su video exportado ---
const PID = 'reel-demo';
const pdir = path.join(ws, 'clientes', 'personal', 'proyectos', PID);
const VIDEO = `${PID}-2026-11-13T10-00-00.mp4`;
function makeProject() {
  mkdirSync(path.join(pdir, 'renders'), { recursive: true });
  writeFileSync(path.join(pdir, 'project.json'), JSON.stringify(Project.parse({
    version: 1, id: PID, name: 'Reel demo', createdAt: '', updatedAt: '', format: {},
    source: { file: 'a.mp4', duration: 12, width: 1080, height: 1920, fps: 30 }, pacing: {}, captions: {}, scenes: [],
  })));
  writeFileSync(path.join(pdir, 'renders', VIDEO), Buffer.alloc(5000, 7));
}
const entries = () => C.listEntries();
const envText = () => (existsSync(envFile) ? readFileSync(envFile, 'utf8') : '');
const conectar = () => S.connectWithToken('instagram', SHORT);
const publicar = (extra: Partial<Parameters<typeof S.publishReel>[1]> = {}) => S.publishReel(pdir, { red: 'instagram', cuenta: `ig-${IG1}`, texto: 'Hola #reels', ...extra });

beforeEach(async () => {
  for (const f of ['cuentas.json', 'calendario.json', 'env-de-prueba']) rmSync(path.join(ws, f), { force: true });
  calls = [];
  Object.assign(fake, { on: [], rejected: new Set(), status: ['IN_PROGRESS', 'FINISHED'], videoStatus: undefined, containers: 0, insights: [], node: {}, media: [] });
  makeProject();
  await Env.setEnvValue('META_APP_ID', APP_ID);
  await Env.setEnvValue('META_APP_SECRET', APP_SECRET);
});

afterEach(() => {
  // Ni los permisos ni el secreto de la app viajan en la dirección: solo en cabeceras o en el cuerpo.
  for (const c of calls) sinSecretos(c.url);
  // Y lo que queda en el workspace tampoco los lleva.
  for (const f of ['cuentas.json', 'calendario.json']) if (existsSync(path.join(ws, f))) sinSecretos(readFileSync(path.join(ws, f), 'utf8'));
});

afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(ws, { recursive: true, force: true });
});

describe('claves en el .env', () => {
  it('guarda en el archivo de prueba, acepta las claves por cuenta y rechaza las demás', async () => {
    await Env.setEnvValue('IG_TOKEN_123456', 'un-permiso-de-prueba');
    expect(envText()).toContain('IG_TOKEN_123456=un-permiso-de-prueba');
    expect(await Env.envValue('IG_TOKEN_123456')).toBe('un-permiso-de-prueba');
    await expect(Env.setEnvValue('PATH', 'x'.repeat(20))).rejects.toThrow('no se puede guardar');
    await expect(Env.setEnvValue('IG_TOKEN_', 'x'.repeat(20))).rejects.toThrow('no se puede guardar');
    await expect(Env.setEnvValue('META_API_VERSION', 'latest/../x')).rejects.toThrow('incompleta');
    await Env.setEnvValue('META_API_VERSION', 'v28.0');
    expect(await Env.envValue('META_API_VERSION')).toBe('v28.0');
  });

  it('borra solo su línea y no pisa escrituras simultáneas', async () => {
    await Promise.all(['AAAA1', 'BBBB2', 'CCCC3', 'DDDD4'].map((n) => Env.setEnvValue(`IG_TOKEN_${n}`, `valor-de-${n}-con-$&-raro`)));
    await Env.setEnvValue('IG_TOKEN_AAAA1', 'valor-de-AAAA1-con-$&-raro'); // reemplazar la línea tampoco la estropea
    expect(envText().match(/IG_TOKEN_AAAA1=/g)).toHaveLength(1);
    for (const n of ['AAAA1', 'BBBB2', 'CCCC3', 'DDDD4']) expect(envText()).toContain(`IG_TOKEN_${n}=valor-de-${n}-con-$&-raro`);
    await Env.removeEnvValue('IG_TOKEN_BBBB2');
    expect(envText()).not.toContain('BBBB2');
    expect(envText()).toContain('IG_TOKEN_AAAA1=');
    expect(envText()).toContain(`META_APP_ID=${APP_ID}`);
    await expect(Env.removeEnvValue('HOME')).rejects.toThrow('no se puede borrar');
    expect((await Env.keyStatus()).meta).toBe(true);
  });
});

describe('texto, video y calendario', () => {
  it('recorta el texto a los límites de Instagram sin partir palabras ni hashtags', () => {
    const largo = `${'palabra '.repeat(280)}#hashtagfinal`;
    const r = S.fitCaption(largo);
    expect(r.texto.length).toBeLessThanOrEqual(2200);
    expect(r.texto.endsWith('palabra')).toBe(true);
    expect(r.avisos.join(' ')).toContain('2200');
    const borde = S.fitCaption(`${'a'.repeat(2190)} #hashtagmuylargo`);
    expect(borde.texto).toBe('a'.repeat(2190));
    expect(S.fitCaption('😀'.repeat(1200)).texto.length).toBe(2200);
    expect(S.fitCaption('Hola\r\n\r\n#uno  ').texto).toBe('Hola\n\n#uno');
  });

  it('deja como máximo 30 hashtags y 20 menciones', () => {
    const r = S.fitCaption(`Texto ${Array.from({ length: 35 }, (_, i) => `#tag${i}`).join(' ')} ${Array.from({ length: 23 }, (_, i) => `@user${i}`).join(' ')} correo@ejemplo.com`);
    expect(r.texto.match(/#\w+/g)).toHaveLength(30);
    expect(r.texto.match(/(^|\s)@\w+/g)).toHaveLength(20);
    expect(r.texto).toContain('#tag29');
    expect(r.texto).not.toContain('#tag30');
    expect(r.texto).toContain('user22');
    expect(r.texto).toContain('correo@ejemplo.com');
    expect(r.avisos).toHaveLength(2);
    expect(S.fitCaption('Corto #uno @dos').avisos).toEqual([]);
  });

  it('elige el último video vertical exportado del reel', () => {
    const names = [
      'reel-2026-11-10T09-00-00.mp4', 'reel-2026-11-12T09-00-00.mp4', 'reel-2026-11-13T09-00-00-4x5.mp4', 'reel-2026-11-13T10-00-00-1x1.mp4',
      'reel-2026-11-13T11-00-00-16x9.mp4', 'reel-2026-11-13T12-00-00.sin-nivelar.mp4', 'reel-2026-11-12T09-00-00.txt', 'reel-2-2026-11-14T09-00-00.mp4', 'otro-2026-11-15T09-00-00.mp4',
    ];
    expect(S.pickVertical(names, 'reel')).toBe('reel-2026-11-12T09-00-00.mp4');
    expect(S.pickVertical([...names, 'reel-2026-11-12T20-00-00-gancho-b.mp4'], 'reel')).toBe('reel-2026-11-12T20-00-00-gancho-b.mp4');
    expect(S.pickVertical([...names, 'reel-2026-11-12T20-00-00-4x5-gancho-b.mp4'], 'reel')).toBe('reel-2026-11-12T09-00-00.mp4');
    expect(S.pickVertical(['reel-2026-11-13T09-00-00-4x5.mp4', 'nada.mp4'], 'reel')).toBeNull();
  });

  it('valida el video con lo que pide Instagram', () => {
    const ok = { size: 20 * 1024 * 1024, duration: 30, fps: 30, width: 1080 };
    expect(S.checkVideo(ok)).toEqual([]);
    expect(S.checkVideo({ ...ok, duration: 2 })[0]).toContain('menos de 3 segundos');
    expect(S.checkVideo({ ...ok, duration: 16 * 60 })[0]).toContain('15 minutos');
    expect(S.checkVideo({ ...ok, duration: 600, size: 301 * 1024 * 1024 })[0]).toContain('300 MB');
    expect(S.checkVideo({ ...ok, fps: 20 })[0]).toContain('entre 23 y 60');
    expect(S.checkVideo({ ...ok, width: 2160 })[0]).toContain('1920');
    expect(S.checkVideo({ ...ok, duration: 5, size: 30 * 1024 * 1024 })[0]).toContain('25 Mbps');
  });

  it('anota la publicación en el calendario sin perder lo que había', async () => {
    const e = await C.ensureEntry(PID, 'instagram');
    expect(e.status).toBe('planificado');
    expect((await C.ensureEntry(PID, 'instagram')).id).toBe(e.id); // reutiliza la planificada
    await C.setRemote(e.id, { account: 'ig-1', state: 'subiendo', containerId: 'C9' });
    await C.setRemote(e.id, { state: 'publicado', id: 'M9' });
    const saved = (await entries()).find((x) => x.id === e.id)!;
    expect(saved.remote).toMatchObject({ account: 'ig-1', state: 'publicado', containerId: 'C9', id: 'M9' });
    // El navegador (PUT /api/calendario) no puede inventar el id ni el enlace.
    await C.updateEntry(e.id, { note: 'hola', remote: { id: 'FALSO' } } as never);
    expect((await entries())[0].remote?.id).toBe('M9');
    expect((await C.ensureEntry(PID, 'instagram')).id).not.toBe(e.id); // la publicada ya no se reutiliza
    await expect(C.ensureEntry('otro-reel', 'instagram', e.id)).rejects.toThrow('otro reel');
  });

  it('las marcas de conexión valen una sola vez', () => {
    const s = S.newState('instagram');
    expect(S.takeState('inventada')).toBeNull();
    expect(S.takeState(s)).toBe('instagram');
    expect(S.takeState(s)).toBeNull();
    expect(S.takeState(null)).toBeNull();
  });
});

describe('errores de Meta', () => {
  it('distingue reconectar, esperar y lo demás, siempre en español y sin permisos', () => {
    for (const code of [190, 102, 10, 200, 299]) expect(IG.igError(400, { error: { code } }).kind).toBe('reconectar');
    expect(IG.igError(400, { error: { code: 100, error_subcode: 492 } }).message).toContain('Ya no tienes acceso');
    expect(IG.igError(400, { error: { code: 190 } }).message).toContain('volver a conectar');
    for (const code of [4, 17, 32, 613, 80002]) expect(IG.igError(400, { error: { code } }).kind).toBe('espera');
    expect(IG.igError(503, null).kind).toBe('espera');
    const wait = IG.igError(400, { error: { code: 80002 } }, JSON.stringify({ [IG1]: [{ type: 'instagram', estimated_time_to_regain_access: 12 }] }));
    expect(wait.waitMin).toBe(12);
    expect(wait.message).toContain('12 min');
    const otro = IG.igError(400, { error: { code: 100, message: `Malformed access token ${PAGE1} en https://graph.facebook.com/x?access_token=${LONG}&code=${CODE}` } }, null, [PAGE1]);
    expect(otro.kind).toBe('otro');
    expect(otro.message).toContain('Instagram respondió');
    sinSecretos(otro.message);
  });

  it('quita permisos y claves de lo que se escribe en el registro', () => {
    const t = S.redact(`GET /api/redes/instagram/callback?code=${CODE}&state=abc → Authorization: Bearer ${LONG} OAuth ${PAGE1} client_secret=${APP_SECRET} {"access_token":"${SHORT}"} /?clave=clave-de-la-red`);
    sinSecretos(t);
    expect(t).not.toContain('clave-de-la-red');
    expect(t).toContain('state=abc');
  });
});

describe('conectar Instagram', () => {
  it('canjea el token, recorre todas las páginas y guarda las cuentas sin permisos', async () => {
    const r = await conectar();
    expect(r.conectadas).toEqual(['@minegocio (Instagram)', '@cliente (Instagram)', 'Mi negocio (página de Facebook)', 'Página sin Instagram (página de Facebook)', 'Cliente (página de Facebook)']);
    expect(r.avisos.join(' ')).toContain('«Cliente» no tienes permiso para publicar');
    sinSecretos(r);
    // Canje a larga duración con el secreto en el cuerpo, y las páginas con el cursor (no con la dirección «next»).
    expect(calls.map((c) => c.key)).toEqual(['POST oauth/access_token', 'GET me/accounts', 'GET me/accounts']);
    expect(calls[0].form.get('fb_exchange_token')).toBe(SHORT);
    expect(calls[0].form.get('client_secret')).toBe(APP_SECRET);
    expect(calls[1].headers.Authorization).toBe(`Bearer ${LONG}`);
    expect(calls[1].query.get('fields')).toContain('tasks');
    expect(calls[2].query.get('after')).toBe('c1');
    // Los permisos, solo en el .env: el de usuario y uno por cuenta.
    expect(envText()).toContain(`META_USER_TOKEN=${LONG}`);
    expect(envText()).toContain(`IG_TOKEN_${IG1}=${PAGE1}`);
    expect(envText()).toContain(`IG_TOKEN_${IG2}=${PAGE2}`);
    const file = JSON.parse(readFileSync(path.join(ws, 'cuentas.json'), 'utf8'));
    expect(file.cuentas.map((a: { id: string }) => a.id)).toEqual([`ig-${IG1}`, `ig-${IG2}`, 'fb-111000111', 'fb-222000222', 'fb-333000333']);
    // Las páginas de Facebook también quedan, cada una con su permiso en el .env.
    expect(envText()).toContain(`FB_TOKEN_111000111=${PAGE1}`);
    expect(Date.parse(file.userTokenExpiresAt)).toBeGreaterThan(Date.now() + 50 * 86_400_000);
    const st = await S.socialStatus();
    sinSecretos(st);
    expect(st.instagram).toMatchObject({ app: true, config: false, retorno: `http://localhost:${port}/api/redes/instagram/callback` });
    expect(st.instagram.cuentas.map((a) => [a.usuario, a.estado])).toEqual([['minegocio', 'ok'], ['cliente', 'ok']]);
    sinSecretos(await S.readAccounts());
    sinSecretos(await S.accountFor(undefined, 'instagram', `ig-${IG1}`));
  });

  it('con el botón: usa el Configuration ID si lo hay, y si no la lista de permisos', async () => {
    const u = new URL(await S.connectUrl('instagram'));
    expect(u.origin + u.pathname).toBe('https://www.facebook.com/v26.0/dialog/oauth');
    expect(u.searchParams.get('client_id')).toBe(APP_ID);
    expect(u.searchParams.get('redirect_uri')).toBe(`http://localhost:${port}/api/redes/instagram/callback`);
    expect(u.searchParams.get('scope')).toContain('instagram_content_publish');
    expect(u.searchParams.get('scope')).toContain('business_management');
    sinSecretos(u.href);
    await Env.setEnvValue('META_CONFIG_ID', '998877665544332');
    const u2 = new URL(await S.connectUrl('instagram'));
    expect(u2.searchParams.get('config_id')).toBe('998877665544332');
    expect(u2.searchParams.has('scope')).toBe(false);

    // Vuelta de Facebook: la marca se comprueba primero y se gasta.
    await expect(S.finishConnect('instagram', new URLSearchParams({ code: CODE, state: 'inventada' }))).rejects.toThrow('ya no vale');
    expect(calls).toHaveLength(0);
    const state = u2.searchParams.get('state')!;
    const r = await S.finishConnect('instagram', new URLSearchParams({ code: CODE, state }));
    expect(r.conectadas).toContain('@minegocio (Instagram)');
    expect(calls[0].form.get('code')).toBe(CODE);
    expect(calls[0].form.get('redirect_uri')).toBe(`http://localhost:${port}/api/redes/instagram/callback`);
    expect(calls[1].form.get('grant_type')).toBe('fb_exchange_token');
    await expect(S.finishConnect('instagram', new URLSearchParams({ code: CODE, state }))).rejects.toThrow('ya no vale');
    await expect(S.finishConnect('instagram', new URLSearchParams({ error: 'access_denied', state: S.newState('instagram') }))).rejects.toThrow('No se dio permiso');
  });

  it('pide los datos de la app, avisa si no hay cuentas y añade una página por su ID', async () => {
    await Env.removeEnvValue('META_APP_SECRET');
    await expect(conectar()).rejects.toThrow('Pon primero los datos de tu app de Meta.');
    await Env.setEnvValue('META_APP_SECRET', APP_SECRET);
    await expect(S.connectWithToken('instagram', 'corto')).rejects.toThrow('incompleto');
    await expect(S.connectWithToken('tiktok', SHORT)).rejects.toThrow('solo se puede publicar en Instagram');
    fake.on.push([/^GET me\/accounts$/, () => ({ data: [PAGES[1]] })]);
    // Sin Instagram vinculado se conecta igual la página de Facebook, y se avisa.
    const solo = await conectar();
    expect(solo.conectadas).toEqual(['Página sin Instagram (página de Facebook)']);
    expect(solo.avisos.join(' ')).toContain('ninguna tiene cuentas de Instagram profesionales');
    // El permiso de Facebook quedó guardado, así que se puede añadir la página del cliente por su ID.
    const r = await S.connectPage('instagram', PAGES[2].id);
    expect(r.conectadas).toEqual(['@cliente (Instagram)', 'Cliente (página de Facebook)']);
    expect(envText()).toContain(`IG_TOKEN_${IG2}=${PAGE2}`);
    await expect(S.connectPage('instagram', 'no-es-un-id')).rejects.toThrow('solo números');
  });

  it('al desconectar borra el permiso del .env y la cuenta de la lista', async () => {
    await conectar();
    await S.disconnectAccount(`ig-${IG2}`);
    expect(envText()).not.toContain(`IG_TOKEN_${IG2}`);
    expect(envText()).toContain(`IG_TOKEN_${IG1}=`);
    expect(envText()).toContain('META_USER_TOKEN=');
    await S.disconnectAccount(`ig-${IG1}`);
    expect(envText()).not.toContain('IG_TOKEN_');
    // Mientras quede una página de Facebook conectada, el permiso de Facebook se conserva.
    expect(envText()).toContain('META_USER_TOKEN');
    for (const c of (await S.socialStatus()).facebook.cuentas) await S.disconnectAccount(c.id);
    expect(envText()).not.toContain('FB_TOKEN_');
    expect(envText()).not.toContain('META_USER_TOKEN');
    expect(envText()).toContain(`META_APP_ID=${APP_ID}`);
    expect((await S.socialStatus()).instagram.cuentas).toEqual([]);
    await expect(publicar()).rejects.toThrow('Conecta la cuenta en Proyectos → «Cuentas».');
  });
});

describe('publicar un Reel', () => {
  beforeEach(async () => { await conectar(); calls = []; });

  it('crea la subida, envía el video, espera, publica y guarda id y enlace en el calendario', async () => {
    const stages: string[] = [];
    const r = await S.publishReel(pdir, { red: 'instagram', cuenta: `ig-${IG1}`, texto: 'Mi texto #reels', portadaMs: 1500 }, (m) => stages.push(m));
    expect(r).toMatchObject({ url: PERMALINK, estado: 'publicado', cuenta: 'minegocio' });
    sinSecretos(r);
    expect(calls.map((c) => c.key)).toEqual([`POST ${IG1}/media`, 'POST rupload', 'GET C1', 'GET C1', `POST ${IG1}/media_publish`, 'GET M1']);
    const [media, upload, , , publish] = calls;
    // Paso 1: los datos van en el cuerpo, como formulario, y el permiso en la cabecera.
    expect(media.url).toBe(`https://graph.facebook.com/v26.0/${IG1}/media`);
    expect(Object.fromEntries(media.form)).toEqual({ media_type: 'REELS', upload_type: 'resumable', caption: 'Mi texto #reels', thumb_offset: '1500' });
    expect(media.headers.Authorization).toBe(`Bearer ${PAGE1}`);
    // Paso 2: a la dirección que dio Instagram, con las tres cabeceras y el archivo entero.
    expect(upload.url).toBe('https://rupload.facebook.com/ig-api-upload/v26.0/C1');
    expect(upload.headers).toMatchObject({ Authorization: `OAuth ${PAGE1}`, offset: '0', file_size: '5000' });
    expect((upload.body as Uint8Array).byteLength).toBe(5000);
    expect(publish.form.get('creation_id')).toBe('C1');
    expect(stages).toEqual(['Preparando la subida…', 'Subiendo el video a Instagram…', 'Instagram está procesando el video…', 'Publicando…']);
    // La entrada del calendario queda publicada, con el id y el enlace del Reel.
    const [e] = await entries();
    expect(e).toMatchObject({ id: r.entrada, projectId: PID, network: 'instagram', status: 'publicado' });
    expect(e.remote).toMatchObject({ account: `ig-${IG1}`, state: 'publicado', id: 'M1', url: PERMALINK, containerId: 'C1', duration: 12 });
    expect(e.remote?.error).toBeUndefined();
    // Y la cuenta queda recordada para ese cliente.
    expect((await S.readAccounts()).porCliente.personal?.instagram).toBe(`ig-${IG1}`);
    expect((await S.accountFor(undefined, 'instagram')).id).toBe(`ig-${IG1}`);
  });

  it('no publica dos veces el mismo video sin pedirlo, ni dos a la vez', async () => {
    const [a, b] = await Promise.allSettled([publicar(), publicar()]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(((a.status === 'rejected' ? a : b) as PromiseRejectedResult).reason.message).toBe('Ya se está publicando este video.');
    await expect(publicar()).rejects.toThrow('ya se publicó en Instagram');
    expect(count(/media_publish$/)).toBe(1);
    // Pidiéndolo, sale otra vez y en una entrada nueva.
    const again = await publicar({ repetir: true });
    expect(count(/media_publish$/)).toBe(2);
    expect((await entries()).map((e) => e.remote?.state)).toEqual(['publicado', 'publicado']);
    expect(new Set((await entries()).map((e) => e.id)).size).toBe(2);
    expect(again.estado).toBe('publicado');
  });

  it('reintento: si la subida ya estaba lista, solo publica (no sube otra vez)', async () => {
    let down = true;
    fake.on.push([/media_publish$/, () => (down ? metaError(2, 500, { is_transient: true }) : undefined)]);
    await expect(publicar()).rejects.toThrow('Instagram pide esperar');
    const [e] = await entries();
    expect(e.status).toBe('planificado');
    expect(e.remote).toMatchObject({ state: 'error', containerId: 'C1', tries: 1 });
    expect(e.remote?.id).toBeUndefined();

    down = false;
    calls = [];
    fake.status = ['FINISHED'];
    const r = await publicar();
    expect(calls.map((c) => c.key)).toEqual(['GET C1', `POST ${IG1}/media_publish`, 'GET M1']);
    expect(r.url).toBe(PERMALINK);
    expect(await entries()).toHaveLength(1);
    expect((await entries())[0].remote).toMatchObject({ state: 'publicado', id: 'M1', containerId: 'C1', tries: 1 });
  });

  it('reintento: si Instagram ya lo había publicado, no publica otra vez y recupera su enlace', async () => {
    // La respuesta de publicar se pierde, pero Instagram sí publicó.
    fake.on.push([/media_publish$/, () => { fake.status = ['PUBLISHED']; throw new TypeError('fetch failed'); }]);
    fake.media = [
      { id: 'M0', permalink: 'https://www.instagram.com/reel/viejo/', timestamp: '2020-01-01T10:00:00+0000', media_product_type: 'REELS' },
      { id: 'M1', permalink: PERMALINK, timestamp: new Date(Date.now() + 5000).toISOString().replace('.000Z', '+0000').replace(/\.\d+Z$/, '+0000'), media_product_type: 'REELS' },
      { id: 'F1', permalink: 'https://www.instagram.com/p/foto/', timestamp: new Date().toISOString(), media_product_type: 'FEED' },
    ];
    const r = await publicar();
    expect(r.url).toBe(PERMALINK);
    expect(count(/media_publish$/)).toBe(1);
    expect((await entries())[0].remote).toMatchObject({ state: 'publicado', id: 'M1', url: PERMALINK });

    // Y si el corte fue total (el intento quedó en error), el siguiente intento tampoco duplica.
    await C.setRemote(r.entrada, { state: 'error', id: undefined, url: undefined });
    await C.updateEntry(r.entrada, { status: 'planificado' });
    calls = [];
    const again = await publicar({ texto: 'Otro texto distinto' });
    expect(calls.map((c) => c.key)).toEqual(['GET C1', `GET ${IG1}/media`]);
    expect(again).toMatchObject({ url: PERMALINK, entrada: r.entrada });
    expect(await entries()).toHaveLength(1);
  });

  it('reintento: con otro video u otro texto sube de nuevo, y si no se sabe cómo quedó la subida, no sigue', async () => {
    fake.on.push([/media_publish$/, () => metaError(100, 400, { message: 'No se pudo' })]);
    await expect(publicar()).rejects.toThrow('Instagram respondió: No se pudo');
    fake.on = [[/^GET C1$/, () => metaError(4, 400)]];
    calls = [];
    await expect(publicar()).rejects.toThrow('Instagram pide esperar');
    expect(calls.map((c) => c.key)).toEqual(['GET C1']); // sin saber si se publicó, no se crea otra subida
    fake.on = [];
    fake.status = ['FINISHED'];
    calls = [];
    await publicar({ texto: 'Texto cambiado' });
    expect(calls.map((c) => c.key)).toEqual(['GET C1', `POST ${IG1}/media`, 'POST rupload', 'GET C2', `POST ${IG1}/media_publish`, 'GET M1']);
    expect((await entries())[0].remote).toMatchObject({ state: 'publicado', containerId: 'C2', tries: 2 });
  });

  it('si la subida se corta, sigue desde donde llegó', async () => {
    let first = true;
    fake.on.push([/^POST rupload$/, () => { if (first) { first = false; throw new TypeError('fetch failed'); } return undefined; }]);
    fake.videoStatus = { uploading_phase: { status: 'in_progress', bytes_transferred: 2000 } };
    await publicar();
    const uploads = calls.filter((c) => c.key === 'POST rupload');
    expect(uploads.map((c) => [c.headers.offset, c.headers.file_size, (c.body as Uint8Array).byteLength])).toEqual([['0', '5000', 5000], ['2000', '5000', 3000]]);
    expect(count(new RegExp(`^POST ${IG1}/media$`))).toBe(1);
  });

  it('si rupload dice que el fallo se puede reintentar, sigue desde donde llegó', async () => {
    let first = true;
    fake.on.push([/^POST rupload$/, () => {
      if (!first) return undefined;
      first = false;
      return new Response(JSON.stringify({ debug_info: { retriable: true, type: 'ProcessingFailedError', message: 'Se cortó' } }), { status: 400 });
    }]);
    fake.videoStatus = { uploading_phase: { status: 'in_progress', bytes_transferred: 1500 } };
    await publicar();
    expect(calls.filter((c) => c.key === 'POST rupload').map((c) => c.headers.offset)).toEqual(['0', '1500']);
    expect(count(new RegExp(`^POST ${IG1}/media$`))).toBe(1);
    expect(count(/media_publish$/)).toBe(1);
  });

  it('si la respuesta de publicar se pierde y Instagram tarda en marcarlo, no da error ni deja republicar', async () => {
    fake.media = [{ id: 'M1', permalink: PERMALINK, timestamp: new Date(Date.now() + 5000).toISOString().replace(/\.\d+Z$/, '+0000'), media_product_type: 'REELS' }];
    // Tras el corte, la primera consulta aún dice FINISHED y la segunda ya PUBLISHED.
    fake.on.push([/media_publish$/, () => { fake.status = ['FINISHED', 'PUBLISHED']; throw new TypeError('fetch failed'); }]);
    const r = await publicar();
    expect(r.url).toBe(PERMALINK);
    expect(count(/media_publish$/)).toBe(1);
    expect((await entries())[0].remote).toMatchObject({ state: 'publicado', id: 'M1' });
  });

  it('los mensajes de error no llevan emojis ni símbolos sueltos', async () => {
    fake.rejected = new Set([PAGE1, LONG]);
    const e = await publicar().then(() => null, (x) => x);
    expect(e.message).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('permiso caducado: la cuenta pasa a «reconectar» y la entrada queda en error', async () => {
    fake.rejected = new Set([PAGE1, LONG]);
    const e = await publicar().then(() => null, (x) => x);
    expect(S.failKind(e)).toBe('reconectar');
    expect(e.message).toBe('Instagram pidió volver a conectar la cuenta. Abre «Cuentas».');
    sinSecretos(e.message);
    // Probó con el permiso de la página y luego con el de usuario, y no llegó a subir nada.
    expect(calls.map((c) => [c.key, c.headers.Authorization])).toEqual([[`POST ${IG1}/media`, `Bearer ${PAGE1}`], [`POST ${IG1}/media`, `Bearer ${LONG}`]]);
    const st = (await S.socialStatus()).instagram.cuentas;
    expect(st.find((a) => a.id === `ig-${IG1}`)).toMatchObject({ estado: 'reconectar', error: e.message });
    expect(st.find((a) => a.id === `ig-${IG2}`)?.estado).toBe('ok');
    expect((await entries())[0]).toMatchObject({ status: 'planificado', remote: { state: 'error', error: e.message } });
    // Al conectar otra vez, la cuenta vuelve a estar bien.
    fake.rejected = new Set();
    await conectar();
    expect((await S.socialStatus()).instagram.cuentas.every((a) => a.estado === 'ok')).toBe(true);
  });

  it('si Meta rechaza el permiso de la página, repite con el de usuario y lo recuerda', async () => {
    fake.rejected = new Set([PAGE1]);
    const r = await publicar();
    expect(r.url).toBe(PERMALINK);
    expect(calls.filter((c) => c.key === 'POST rupload').map((c) => c.headers.Authorization)).toEqual([`OAuth ${LONG}`]);
    expect((await S.readAccounts()).cuentas.find((a) => a.id === `ig-${IG1}`)?.tokenKind).toBe('usuario');
    // La siguiente llamada ya empieza por el que funcionó.
    calls = [];
    expect(await IG.igQuota(await S.accountFor(undefined, 'instagram', `ig-${IG1}`))).toEqual({ usadas: 2, total: 50 });
    expect(calls.map((c) => c.headers.Authorization)).toEqual([`Bearer ${LONG}`]);
  });

  it('avisa si se publicó sin el texto y si Instagram rechaza el video', async () => {
    fake.on.push([/media_publish$/, () => ({ id: 'M1', config_issue: ['CAPTION_NOT_ATTACHED'] })]);
    expect((await publicar()).aviso).toContain('sin el texto');
    fake.on = [];
    fake.status = ['ERROR'];
    fake.on.push([/^GET C\d+$/, () => ({ status_code: 'ERROR', status: 'Error: formato de video no admitido' })]);
    await expect(publicar({ repetir: true })).rejects.toThrow('Instagram no aceptó el video: Error: formato de video no admitido');
  });

  it('no envía el permiso a una dirección de subida que no sea de Facebook', async () => {
    fake.on.push([new RegExp(`^POST ${IG1}/media$`), () => ({ id: 'C1', uri: 'https://rupload.facebook.com.ejemplo.test/ig-api-upload/C1' })]);
    await expect(publicar()).rejects.toThrow('dirección de subida que no es suya');
    expect(calls.map((c) => c.key)).toEqual([`POST ${IG1}/media`]);
  });

  it('antes de publicar enseña el video, la cuenta, el texto, el cupo y los avisos', async () => {
    const pre = await S.prePublish(pdir, 'instagram', `ig-${IG1}`);
    expect(pre).toMatchObject({ archivo: VIDEO, peso: 5000, duracion: 12, cuenta: `ig-${IG1}`, cupo: { usadas: 2, total: 50 }, problemas: [], listo: true });
    expect(pre.texto).toContain('#reels');
    expect(pre.cuentas.map((a) => a.usuario)).toEqual(['minegocio', 'cliente']);
    sinSecretos(pre);
    // Con dos cuentas y ninguna elegida hay que elegir; sin video exportado, lo dice.
    rmSync(path.join(pdir, 'renders', VIDEO));
    const sin = await S.prePublish(pdir, 'instagram');
    expect(sin.listo).toBe(false);
    expect(sin.problemas).toEqual(['Exporta primero el video en vertical (9:16).', 'Elige a qué cuenta publicar.']);
  });
});

describe('traer las cifras', () => {
  const metric = (name: string, value: number) => ({ name, values: [{ value }] });
  let entry = '';
  beforeEach(async () => {
    await conectar();
    entry = (await C.ensureEntry(PID, 'instagram')).id;
    await C.setRemote(entry, { account: `ig-${IG1}`, state: 'publicado', id: 'M1', url: PERMALINK });
    await C.updateEntry(entry, { status: 'publicado' });
    calls = [];
  });
  const saved = async () => (await entries()).find((e) => e.id === entry)!;

  it('sin vistas todavía no escribe nada (ni borra lo que hubiera)', async () => {
    // Conjunto vacío: Instagram aún no tiene datos.
    expect(await S.syncMetrics({ force: true })).toEqual({ actualizadas: 0, pendientes: 1, errores: [] });
    expect((await saved()).metrics).toBeUndefined();
    expect((await saved()).remote?.syncedAt).toBeTruthy();
    // Con 0 vistas tampoco, y las cifras puestas a mano siguen ahí.
    await C.updateEntry(entry, { metrics: { views: 80, saves: 9 } });
    fake.insights = [metric('views', 0), metric('likes', 3)];
    expect(await S.syncMetrics({ entrada: entry })).toEqual({ actualizadas: 0, pendientes: 1, errores: [] });
    expect((await saved()).metrics).toMatchObject({ views: 80, saves: 9, source: 'manual' });
  });

  it('con vistas guarda las cifras como traídas de la red, sin borrar lo que la red no da', async () => {
    await C.updateEntry(entry, { metrics: { views: 80, saves: 9 } });
    fake.insights = [metric('views', 1500), metric('likes', 120), metric('comments', 7), metric('shares', 4), metric('reach', 999)];
    expect(await S.syncMetrics({ force: true })).toEqual({ actualizadas: 1, pendientes: 0, errores: [] });
    expect((await saved()).metrics).toMatchObject({ views: 1500, likes: 120, comments: 7, shares: 4, saves: 9, source: 'api' });
    expect((await saved()).status).toBe('publicado');
    expect(calls[0].key).toBe('GET M1/insights');
    expect(calls[0].query.get('metric')).toBe('views,likes,comments,shares,saved');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${PAGE1}`);
    // Recién revisada, no se vuelve a pedir hasta dentro de 6 horas (salvo que se fuerce).
    calls = [];
    expect(await S.syncMetrics()).toEqual({ actualizadas: 0, pendientes: 0, errores: [] });
    expect(calls).toHaveLength(0);
    fake.insights = [metric('views', 1800), metric('saved', 30)];
    await S.syncMetrics({ cliente: 'personal', force: true });
    expect((await saved()).metrics).toMatchObject({ views: 1800, likes: 120, saves: 30 });
  });

  it('si Instagram rechaza «views», pide el resto y lee las vistas del propio Reel', async () => {
    fake.on.push([/^GET M1\/insights$/, (c) => (c.query.get('metric')!.includes('views') ? metaError(100, 400, { message: '(#100) metric[0] must be one of the following values' }) : { data: [metric('likes', 50), metric('saved', 5)] })]);
    fake.node = { like_count: 48, comments_count: 3, total_views_count: 900, shares_count: 2, saved_count: 4 };
    const m = await IG.igMetrics(await S.accountFor(undefined, 'instagram', `ig-${IG1}`), 'M1');
    expect(m).toEqual({ views: 900, likes: 50, comments: 3, shares: 2, saves: 5 });
    expect(calls.map((c) => c.key)).toEqual(['GET M1/insights', 'GET M1/insights', 'GET M1']);
    fake.on = [];
    fake.node = {};
    expect(await IG.igMetrics(await S.accountFor(undefined, 'instagram', `ig-${IG1}`), 'M1')).toBeNull();
  });

  it('con el permiso caducado marca la cuenta y lo dice en español', async () => {
    fake.rejected = new Set([PAGE1, LONG]);
    const r = await S.syncMetrics({ force: true });
    expect(r.actualizadas).toBe(0);
    expect(r.errores).toEqual(['«Reel demo»: Instagram pidió volver a conectar la cuenta. Abre «Cuentas».']);
    expect((await S.socialStatus()).instagram.cuentas[0].estado).toBe('reconectar');
    expect((await S.syncMetrics({ entrada: 'no-existe' })).errores[0]).toContain('no se hizo desde la app');
  });
});

describe('rutas del studio', () => {
  const get = (p: string) => realFetch(base + p);
  const post = (p: string, body: unknown) => realFetch(base + p, { method: 'POST', body: JSON.stringify(body) });
  const job = async (r: Response) => {
    let j = await r.json();
    for (let i = 0; i < 200 && j.status === 'running'; i++) { await new Promise((ok) => setTimeout(ok, 25)); j = await (await get(`/api/jobs/${j.id}`)).json(); }
    return j;
  };

  beforeAll(async () => {
    const { startStudio } = await import('../src/studio.ts');
    expect(await startStudio()).toBe(base);
  }, 120_000);

  it('conectar, publicar y traer cifras por HTTP sin que ninguna respuesta lleve un permiso', async () => {
    const seen: string[] = [];
    const text = async (r: Response) => { const t = await r.clone().text(); seen.push(t); return t; };

    // Datos de la app y token pegado.
    const keys = await post('/api/claves', { banco: 'meta_config_id', clave: '998877665544332' });
    expect(JSON.parse(await text(keys))).toMatchObject({ meta: true });
    expect((await (await get('/api/redes')).json()).instagram).toMatchObject({ app: true, config: true, cuentas: [] });
    const paste = await post('/api/redes/token', { red: 'instagram', token: SHORT });
    expect(paste.status).toBe(200);
    expect(JSON.parse(await text(paste))).toMatchObject({ conectadas: ['@minegocio (Instagram)', '@cliente (Instagram)', 'Mi negocio (página de Facebook)', 'Página sin Instagram (página de Facebook)', 'Cliente (página de Facebook)'], estado: { instagram: { app: true } } });

    // Botón «Conectar»: dirección de Facebook y vuelta con marca de un solo uso.
    const { url } = JSON.parse(await text(await post('/api/redes/conectar', { red: 'instagram' })));
    const state = new URL(url).searchParams.get('state')!;
    expect(new URL(url).searchParams.get('config_id')).toBe('998877665544332');
    const bad = await get(`/api/redes/instagram/callback?code=${CODE}&state=otra`);
    expect(bad.status).toBe(400);
    expect(await text(bad)).toContain('ya no vale');
    const ok = await get(`/api/redes/instagram/callback?code=${CODE}&state=${state}`);
    expect(ok.status).toBe(200);
    expect(await text(ok)).toContain('Cuenta conectada');
    expect((await get(`/api/redes/instagram/callback?code=${CODE}&state=${state}`)).status).toBe(400);

    const redes = JSON.parse(await text(await get('/api/redes')));
    expect(redes.instagram.cuentas.map((a: { usuario: string }) => a.usuario)).toEqual(['minegocio', 'cliente']);
    await text(await get('/api/claves'));

    // Vista previa y publicar: sin confirmación no se publica.
    const pre = JSON.parse(await text(await get(`/api/redes/previo?id=${PID}&red=instagram&cuenta=ig-${IG1}`)));
    expect(pre).toMatchObject({ archivo: VIDEO, listo: true });
    const body = { red: 'instagram', cuenta: `ig-${IG1}`, texto: 'Desde la interfaz' };
    const no = await post(`/api/redes/publicar?id=${PID}`, body);
    expect(no.status).toBe(400);
    expect(count(/\/media$/)).toBe(0);
    const pub = await job(await post(`/api/redes/publicar?id=${PID}`, { ...body, confirmado: true }));
    seen.push(JSON.stringify(pub));
    expect(pub).toMatchObject({ kind: 'publicar', status: 'done', result: { url: PERMALINK, estado: 'publicado', cuenta: 'minegocio' } });
    const cal = JSON.parse(await text(await get('/api/calendario')));
    expect(cal[0].remote).toMatchObject({ id: 'M1', url: PERMALINK });
    // El navegador no puede cambiar lo que quedó anotado de la red.
    await realFetch(`${base}/api/calendario?entry=${cal[0].id}`, { method: 'PUT', body: JSON.stringify({ remote: { id: 'FALSO' }, note: 'nota' }) });
    expect((await entries())[0].remote?.id).toBe('M1');

    fake.insights = [{ name: 'views', values: [{ value: 321 }] }];
    const met = await job(await post('/api/redes/metricas', { entrada: cal[0].id }));
    seen.push(JSON.stringify(met));
    expect(met).toMatchObject({ kind: 'metricas', status: 'done', result: { actualizadas: 1, pendientes: 0, errores: [] } });
    expect((await entries())[0].metrics).toMatchObject({ views: 321, source: 'api' });

    // Un error de Meta llega en español y sin permisos.
    fake.rejected = new Set([PAGE1, LONG]);
    const fallo = await job(await post(`/api/redes/publicar?id=${PID}`, { ...body, confirmado: true, repetir: true }));
    seen.push(JSON.stringify(fallo));
    expect(fallo).toMatchObject({ status: 'error', message: 'Instagram pidió volver a conectar la cuenta. Abre «Cuentas».' });
    expect(JSON.parse(await text(await get('/api/redes'))).instagram.cuentas[0].estado).toBe('reconectar');

    const off = await post('/api/redes/desconectar', { cuenta: `ig-${IG2}` });
    expect(JSON.parse(await text(off)).instagram.cuentas.map((a: { usuario: string }) => a.usuario)).toEqual(['minegocio']);
    expect(envText()).not.toContain(`IG_TOKEN_${IG2}`);

    expect(seen.length).toBeGreaterThan(10);
    for (const t of seen) sinSecretos(t);
  }, 30_000);

  it('rechaza las rutas de cuentas pedidas con otro nombre de equipo (DNS rebinding)', async () => {
    const http = await import('node:http');
    const raw = (p: string, host: string, method = 'GET', body = '') => new Promise<number>((ok, ko) => {
      const rq = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: host, 'Content-Type': 'application/json' } }, (rs) => { rs.resume(); ok(rs.statusCode ?? 0); });
      rq.on('error', ko); rq.end(body);
    });
    expect(await raw('/api/redes', `ataque.example:${port}`)).toBe(403);
    expect(await raw(`/api/redes/publicar?id=${PID}`, `ataque.example:${port}`, 'POST', JSON.stringify({ red: 'instagram', confirmado: true }))).toBe(403);
    expect(await raw('/api/redes', `localhost:${port}`)).toBe(200);
    expect(await raw('/api/redes', `127.0.0.1:${port}`)).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it('la publicación en marcha lleva el proyecto y no se lanza dos veces', async () => {
    await conectar();
    calls = [];
    let release!: () => void;
    const gate = new Promise<void>((ok) => { release = ok; });
    fake.on.push([/media_publish$/, async () => { await gate; return undefined; }]);
    const body = { red: 'instagram', cuenta: `ig-${IG1}`, texto: 'Hola', confirmado: true };
    const a = await (await post(`/api/redes/publicar?id=${PID}`, body)).json();
    const b = await (await post(`/api/redes/publicar?id=${PID}`, body)).json();
    expect(a).toMatchObject({ kind: 'publicar', projectId: PID });
    expect(b.id).toBe(a.id);
    const list = await (await get(`/api/jobs?id=${PID}&kind=publicar`)).json();
    expect(list.map((j: { id: string }) => j.id)).toEqual([a.id]);
    release();
    let j = a;
    for (let i = 0; i < 200 && j.status === 'running'; i++) { await new Promise((ok) => setTimeout(ok, 25)); j = await (await get(`/api/jobs/${a.id}`)).json(); }
    expect(j).toMatchObject({ status: 'done', result: { url: PERMALINK } });
    expect(count(/media_publish$/)).toBe(1);
  });

  it('rechaza escrituras desde otro origen y redes que aún no existen', async () => {
    const r = await realFetch(`${base}/api/redes/token`, { method: 'POST', headers: { Origin: 'http://otra-web.test' }, body: JSON.stringify({ red: 'instagram', token: SHORT }) });
    expect(r.status).toBe(403);
    expect(calls).toHaveLength(0);
    const tk = await post('/api/redes/conectar', { red: 'tiktok' });
    expect(tk.status).toBe(500);
    expect((await tk.json()).error).toContain('solo se puede publicar en Instagram');
  });
});

describe('publicar en una página de Facebook', () => {
  it('pide la subida, envía el video a Facebook, publica con el texto y guarda el enlace', async () => {
    await conectar();
    const page = '111000111';
    fake.on.push([new RegExp(`^POST ${page}/video_reels$`), (c) => (c.form.get('upload_phase') === 'start'
      ? { video_id: 'V1', upload_url: 'https://rupload.facebook.com/video-upload/v26.0/V1' }
      : { success: true })]);
    fake.on.push([/^GET V1$/, () => ({ id: 'V1', status: { video_status: 'ready' }, permalink_url: '/reel/V1' })]);
    const r = await S.publishReel(pdir, { red: 'facebook', cuenta: `fb-${page}`, texto: 'Disciplina #gym' });
    expect(r.url).toBe('https://www.facebook.com/reel/V1');
    expect(r.cuenta).toBe('Mi negocio');
    const keys = calls.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining([`POST ${page}/video_reels`, 'POST rupload', 'GET V1']));
    const fin = calls.find((c) => c.key === `POST ${page}/video_reels` && c.form.get('upload_phase') === 'finish')!;
    expect(fin.form.get('video_state')).toBe('PUBLISHED');
    expect(fin.form.get('description')).toBe('Disciplina #gym');
    // El video se sube con el permiso de la página, en la cabecera.
    expect(calls.find((c) => c.key === 'POST rupload')!.headers.Authorization).toBe(`OAuth ${PAGE1}`);
    const e = (await entries()).find((x) => x.network === 'facebook')!;
    expect(e.remote).toMatchObject({ state: 'publicado', id: 'V1' });
    // No se publica otra vez sin pedirlo.
    await expect(S.publishReel(pdir, { red: 'facebook', cuenta: `fb-${page}` })).rejects.toThrow('ya se publicó en Facebook');
  });
});
