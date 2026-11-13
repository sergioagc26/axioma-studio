import React, { useEffect, useRef, useState } from 'react';
import { api, publishTo, waitJob, type Job, type Red } from './useProject.ts';
import { Icon } from './Icon.tsx';

export interface Cuenta { id: string; usuario: string; nombre?: string; estado: 'ok' | 'reconectar'; error?: string; aviso?: string }
interface RedStatus { app: boolean; config: boolean; retorno: string; caduca?: string; aviso?: string; cuentas: Cuenta[] }
export type Redes = { instagram: RedStatus };

const NOMBRE: Record<Red, string> = { instagram: 'Instagram', tiktok: 'TikTok' };
/** Las cuentas solo se conectan desde el computador donde está instalada la app. */
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
/** Solo se enlaza a direcciones https (el enlace del reel viene de Instagram). */
const safe = (url?: string) => (url && /^https:\/\//.test(url) ? url : undefined);
const WARN = <Icon name="warning" style={{ marginRight: 6 }} />;

// Qué cuentas hay conectadas: lo comparten todas las pantallas y se refresca al abrir cada una. Nunca trae permisos.
let memo: Redes | null = null;
const subs = new Set<(r: Redes | null) => void>();
const share = (r: Redes) => { memo = r; subs.forEach((f) => f(r)); return r; };
const loadRedes = () => api<Redes>('/api/redes').then(share);

/** Las cuentas conectadas (null mientras se comprueba o si no se pudo leer). */
export function useCuentas(): Redes | null {
  const [redes, setRedes] = useState(memo);
  useEffect(() => {
    subs.add(setRedes);
    loadRedes().catch(() => {});
    return () => { subs.delete(setRedes); };
  }, []);
  return redes;
}

const PERMISOS = 'instagram_basic, instagram_content_publish, instagram_manage_insights, pages_show_list, pages_read_engagement, business_management, ads_management, ads_read';
const APP_FIELDS: [keyof AppData, string, string][] = [['meta_app_id', 'App ID', 'text'], ['meta_app_secret', 'App Secret', 'password'], ['meta_config_id', 'Configuration ID', 'text']];
interface AppData { meta_app_id: string; meta_app_secret: string; meta_config_id: string }
const NO_APP: AppData = { meta_app_id: '', meta_app_secret: '', meta_config_id: '' };

/** Cuentas de las redes: datos de la app de Meta, conectar con Facebook y lista de cuentas conectadas. */
export const CuentasPanel: React.FC<{ onClose: () => void; toast: (m: string) => void }> = ({ onClose, toast }) => {
  const st = useCuentas()?.instagram;
  const [error, setError] = useState('');
  const [nota, setNota] = useState('');
  const [app, setApp] = useState(NO_APP);
  const [editApp, setEditApp] = useState(false);
  const [token, setToken] = useState('');
  const [pagina, setPagina] = useState('');
  const [busy, setBusy] = useState('');
  // Enlace de Facebook cuando el navegador no dejó abrir la pestaña sola.
  const [link, setLink] = useState('');
  const [waiting, setWaiting] = useState(false);
  const round = useRef(0);
  useEffect(() => {
    loadRedes().catch((e) => setError(e.message));
    return () => { round.current = -1; };
  }, []);
  const say = (m: string) => { setNota(m); toast(m); };

  const filled = Object.values(app).map((v) => v.trim()).filter(Boolean);
  const appOk = filled.length > 0 && filled.every((v) => v.length >= 8) && Boolean(st?.app || (app.meta_app_id.trim() && app.meta_app_secret.trim()));
  const saveApp = async () => {
    setBusy('app');
    try {
      for (const [banco, clave] of Object.entries(app)) if (clave.trim()) await api('/api/claves', post({ banco, clave: clave.trim() }));
      setApp(NO_APP); setEditApp(false);
      await loadRedes();
      say('Datos de la app guardados en este computador.');
    } catch (e: any) { say(e.message); } finally { setBusy(''); }
  };

  const connect = async () => {
    // La pestaña se abre ya, dentro del clic, para que el navegador no la bloquee.
    const tab = window.open('', '_blank');
    const mine = ++round.current;
    const before = JSON.stringify(st);
    setBusy('conectar'); setLink('');
    try {
      const { url } = await api<{ url: string }>('/api/redes/conectar', post({ red: 'instagram' }));
      if (!url.startsWith('https://www.facebook.com/')) throw new Error('La dirección de Facebook no es la esperada.');
      if (tab) { tab.opener = null; tab.location.href = url; } else setLink(url);
    } catch (e: any) { tab?.close(); setBusy(''); return say(e.message); }
    setBusy(''); setWaiting(true);
    setNota('Da permiso en la pestaña de Facebook. Aquí se actualiza solo.');
    // Se vuelve a mirar cada 3 s (hasta 2 min) mientras la persona da permiso en Facebook.
    for (let i = 0; i < 40 && round.current === mine; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const now = await loadRedes().catch(() => null);
      if (round.current !== mine) return;
      if (now && JSON.stringify(now.instagram) !== before) { setLink(''); say(`Conectado: ${now.instagram.cuentas.map((c) => `@${c.usuario}`).join(', ') || 'sin cuentas'}.`); break; }
    }
    if (round.current !== mine) return;
    setWaiting(false);
    setNota((n) => (n.startsWith('Da permiso') ? 'No llegó ninguna cuenta nueva. Si Facebook mostró un error, prueba «Pegar token».' : n));
  };

  /** Pegar un token o añadir una página por su ID: las dos rutas responden igual. */
  const add = async (path: 'token' | 'pagina', body: Record<string, string>) => {
    setBusy(path);
    try {
      const r = await api<{ conectadas: string[]; avisos: string[]; estado: Redes }>(`/api/redes/${path}`, post({ red: 'instagram', ...body }));
      share(r.estado); setToken(''); setPagina('');
      say([`Conectado: ${r.conectadas.join(', ')}.`, ...r.avisos].join(' '));
    } catch (e: any) { say(e.message); } finally { setBusy(''); }
  };

  const disconnect = async (c: Cuenta) => {
    if (!window.confirm(`¿Desconectar @${c.usuario}?\n\nLo que ya publicaste no se toca. Para publicar otra vez en esa cuenta habrá que conectarla de nuevo.`)) return;
    try { share(await api<Redes>('/api/redes/desconectar', post({ cuenta: c.id }))); say(`@${c.usuario} desconectada.`); } catch (e: any) { say(e.message); }
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast('Dirección copiada.'); } catch { toast(text); } };

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal card col" role="dialog" aria-modal="true" aria-label="Cuentas" style={{ maxWidth: 520, gap: 14 }}>
        <h2 style={{ fontSize: 20 }}><Icon name="link" style={{ marginRight: 8 }} />Cuentas</h2>
        <span className="small muted">Para publicar tus videos desde la app. Los permisos se guardan solo en este computador y no se vuelven a mostrar.</span>
        {!LOCAL && <span className="small" style={{ padding: 12, borderRadius: 12, background: 'var(--cyanSoft)' }}><Icon name="devices" style={{ marginRight: 6 }} />Las cuentas se conectan desde el computador donde está instalada la app (ábrela allí en «localhost»). Aquí solo puedes ver cuáles hay.</span>}
        {error && <span className="small" style={{ color: 'var(--pinkText)' }}>{WARN}No se pudieron leer las cuentas ({error}). Si acabas de actualizar la app, ciérrala y ábrela otra vez.</span>}

        <section className="col" style={{ gap: 10, padding: 12, borderRadius: 12, border: '1px solid var(--line)' }} aria-label="Instagram">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <strong><Icon name="instagram" style={{ marginRight: 6 }} />Instagram</strong>
            {!st ? <span className="small muted">{error ? '' : '…'}</span> : st.cuentas.length ? <span className="pill"><Icon name="check" style={{ marginRight: 4 }} />{st.cuentas.length === 1 ? '1 cuenta' : `${st.cuentas.length} cuentas`}</span> : <span className="pill line">Sin conectar</span>}
          </div>
          {st?.aviso && <span className="small" style={{ color: 'var(--pinkText)' }}>{WARN}{st.aviso}</span>}

          {st?.cuentas.map((c) => (
            <div key={c.id} className="col" style={{ gap: 2 }}>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong>{c.estado === 'ok' ? <Icon name="check" style={{ marginRight: 6 }} /> : WARN}@{c.usuario}</strong>{c.nombre ? <span className="small muted"> · {c.nombre}</span> : null}
                </span>
                {LOCAL && <button className="btn ghost small" style={{ height: 30, flex: 'none' }} onClick={() => disconnect(c)}>Desconectar</button>}
              </div>
              {c.estado === 'reconectar' && <span className="small" style={{ color: 'var(--pinkText)' }}>Hay que conectarla otra vez{c.error ? `: ${c.error}` : '.'}</span>}
              {c.aviso && <span className="small muted">{c.aviso}</span>}
            </div>
          ))}

          {LOCAL && st && (
            <>
              {st.app && !editApp ? (
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <span className="small"><Icon name="check" style={{ marginRight: 6 }} />Datos de tu app de Meta puestos{st.config ? '' : ' (sin Configuration ID)'}</span>
                  <button className="btn rect small" style={{ height: 30 }} onClick={() => setEditApp(true)}>Cambiar</button>
                </div>
              ) : (
                <div className="col" style={{ gap: 8 }}>
                  <strong className="small">1 · Datos de tu app de Meta</strong>
                  <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                    {APP_FIELDS.map(([k, label, type]) => (
                      <label key={k} className="field" style={{ flex: '1 1 130px' }}>{label}
                        <input type={type} autoComplete="off" spellCheck={false} value={app[k]} onChange={(e) => setApp({ ...app, [k]: e.target.value })} placeholder={st.app ? 'Sin cambios' : ''} />
                      </label>
                    ))}
                  </div>
                  <div className="row">
                    <button className="btn primary rect" disabled={!appOk || busy === 'app'} onClick={saveApp}>{busy === 'app' ? 'Guardando…' : 'Guardar'}</button>
                    {st.app && <button className="btn" onClick={() => { setEditApp(false); setApp(NO_APP); }}>Cancelar</button>}
                  </div>
                </div>
              )}

              <div className="row">
                <button className="btn primary" disabled={!st.app || busy === 'conectar'} title={st.app ? 'Se abre Facebook en otra pestaña' : 'Pon primero los datos de tu app de Meta'} onClick={connect}>
                  <Icon name="link" />{busy === 'conectar' ? 'Abriendo Facebook…' : st.cuentas.length ? 'Conectar otra vez con Facebook' : 'Conectar con Facebook'}
                </button>
                {link && <a className="btn rect" href={link} target="_blank" rel="noreferrer"><Icon name="open" />Abrir Facebook</a>}
                {waiting && <span className="pill" role="status">Esperando a Facebook…</span>}
              </div>

              <details className="grp">
                <summary><span><Icon name="key" style={{ marginRight: 6 }} />Pegar token</span></summary>
                <div className="col">
                  <span className="small muted">Si el botón falla: pega un «User Token» del Graph API Explorer de tu app.</span>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input className="input" type="password" autoComplete="off" style={{ flex: 1, minWidth: 0 }} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pega aquí el token" aria-label="Token de Facebook" />
                    <button className="btn primary rect" disabled={!st.app || token.trim().length < 30 || busy === 'token'} onClick={() => add('token', { token })}>{busy === 'token' ? 'Conectando…' : 'Guardar'}</button>
                  </div>
                  <span className="small muted">¿No sale la cuenta de un cliente? Añádela con el ID de su página de Facebook.</span>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input className="input" inputMode="numeric" autoComplete="off" style={{ flex: 1, minWidth: 0 }} value={pagina} onChange={(e) => setPagina(e.target.value)} placeholder="ID de la página" aria-label="ID de la página de Facebook" />
                    <button className="btn rect" disabled={!/^\d{5,}$/.test(pagina.trim()) || busy === 'pagina'} onClick={() => add('pagina', { pagina: pagina.trim() })}>{busy === 'pagina' ? 'Buscando…' : 'Añadir'}</button>
                  </div>
                </div>
              </details>

              <details className="grp">
                <summary><span><Icon name="help" style={{ marginRight: 6 }} />Pasos (una sola vez)</span></summary>
                <div className="col">
                  <ol className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                    <li>Tu Instagram debe ser profesional (Empresa o Creador) y estar unido a una página de Facebook que tú administres.</li>
                    <li>En <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com</a> crea una app (caso «Otro», tipo «Negocios») y déjala en modo Desarrollo. Añádele «Instagram» (con inicio de sesión de Facebook) y «Facebook Login for Business».</li>
                    <li>En Configuración → Básica copia el App ID y el App Secret y pégalos arriba.</li>
                    <li>En Facebook Login for Business → Configurations crea una con «User access token» y estos permisos, y pega arriba su Configuration ID: <code>{PERMISOS}</code>.</li>
                    <li>En Facebook Login for Business → Settings añade esta dirección de retorno. Si no te deja guardarla, sigue igual: en modo Desarrollo «localhost» suele estar permitido.</li>
                    <li>Pulsa «Conectar con Facebook», acepta los permisos y marca todas las páginas y cuentas que quieras usar.</li>
                    <li>Si Facebook dice «URL bloqueada», usa «Pegar token»: en <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer">Graph API Explorer</a> elige tu app, «User Token» y los mismos permisos.</li>
                    <li>Antes de usarlo con clientes, publica un reel corto y míralo desde otra cuenta para confirmar que se ve en público.</li>
                  </ol>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <code className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.retorno}</code>
                    <button className="btn rect" onClick={() => copy(st.retorno)}>Copiar</button>
                  </div>
                </div>
              </details>
            </>
          )}
        </section>

        <span className="small muted">TikTok: próximamente (exige aprobación de TikTok)</span>
        {nota && <span className="small" role="status">{nota}</span>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cerrar</button></div>
      </div>
    </div>
  );
};

interface Previo {
  archivo: string | null; peso: number; duracion: number; texto: string; cuenta: string | null; cuentas: Cuenta[];
  cupo?: { usadas: number; total?: number }; avisos: string[]; problemas: string[]; publicado?: { url?: string; fecha: string }; listo: boolean;
}
interface Hecho { url?: string; cuenta?: string; aviso?: string }
const MAX_TEXTO = 2200;
const firma = (cuentas?: Cuenta[]) => cuentas?.map((c) => `${c.id}:${c.estado}`).join(',');

/**
 * Publicar un reel en una red: se revisa la cuenta, el video y el texto, y solo se publica cuando
 * la persona marca la casilla y pulsa el botón. Es público y no se puede deshacer.
 */
export const PublicarBox: React.FC<{
  projectId: string; red: Red; /** Publicación del calendario donde anotarlo. */ entrada?: string;
  onClose: () => void; /** Abrir el panel de cuentas (no hay cuenta o hay que reconectar). */ onCuentas: () => void;
  /** Algo cambió en el calendario (se publicó o falló). */ onChange?: () => void; toast: (m: string) => void;
}> = ({ projectId, red, entrada, onClose, onCuentas, onChange, toast }) => {
  const [previo, setPrevio] = useState<Previo | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [done, setDone] = useState<Hecho | null>(null);
  const [error, setError] = useState('');
  const redes = useCuentas();
  const name = NOMBRE[red];

  const load = async (cuenta?: string | null) => {
    try {
      const p = await api<Previo>(`/api/redes/previo?id=${encodeURIComponent(projectId)}&red=${red}${cuenta ? `&cuenta=${encodeURIComponent(cuenta)}` : ''}`);
      setPrevio(p);
      setTexto((t) => t ?? p.texto);
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { void load(); }, [projectId]);
  // Si ya se está publicando este video (por ejemplo, tras recargar la página), se sigue su avance
  // en vez de dejar pulsar Publicar otra vez.
  useEffect(() => {
    let alive = true;
    api<Job[]>(`/api/jobs?id=${encodeURIComponent(projectId)}&kind=publicar`).then(async (list) => {
      const running = list.find((j) => j.kind === 'publicar' && j.status === 'running');
      if (!running || !alive) return;
      try {
        const j = await waitJob(running, (x) => { if (alive) setJob(x); });
        if (alive) { setDone((j.result ?? {}) as Hecho); toast(`Publicado en ${name}.`); }
      } catch (e: any) { if (alive) { setError(e.message); void load(); } }
      finally { if (alive) { setJob(null); onChange?.(); } }
    }).catch(() => {});
    return () => { alive = false; };
  }, [projectId]);
  // Si cambian las cuentas mientras está abierto (por ejemplo, tras conectar una), se revisa otra vez.
  const now = firma(redes?.instagram.cuentas);
  useEffect(() => { if (previo && now !== undefined && now !== firma(previo.cuentas)) void load(previo.cuenta); }, [now]);

  // La confirmación vale para una cuenta concreta: si cambia la cuenta (o resulta que ya se publicó), se pide otra vez.
  useEffect(() => { setOk(false); }, [previo?.cuenta, Boolean(previo?.publicado)]);

  const text = texto ?? '';
  const ready = Boolean(previo?.listo && previo.cuenta && text.trim() && ok && !job);
  const publicar = async () => {
    if (!ready || !previo?.cuenta) return;
    setError('');
    setJob({ id: '', status: 'running', message: 'Preparando la subida…', progress: 0 });
    try {
      const j = await publishTo(projectId, { red, confirmado: true, cuenta: previo.cuenta, texto: text, entrada, repetir: previo.publicado ? true : undefined }, setJob);
      setDone((j.result ?? {}) as Hecho);
      toast(`Publicado en ${name}.`);
    } catch (e: any) {
      // Tras un fallo se revisa todo otra vez: puede que la cuenta pida conectarse de nuevo.
      setError(e.message); setOk(false);
      void load(previo.cuenta);
      loadRedes().catch(() => {});
    } finally { setJob(null); onChange?.(); }
  };
  const acc = previo?.cuentas.find((c) => c.id === previo.cuenta);

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget && !job) onClose(); }}>
      <div className="modal card col" role="dialog" aria-modal="true" aria-label={`Publicar en ${name}`} style={{ maxWidth: 480, gap: 12 }}>
        <h2 style={{ fontSize: 20 }}><Icon name="publish" style={{ marginRight: 8 }} />Publicar en {name}</h2>
        {done ? (
          <div className="col" style={{ gap: 8, padding: 12, borderRadius: 12, background: 'var(--cyanSoft)' }} role="status">
            <strong><Icon name="check" style={{ marginRight: 6 }} />Publicado{done.cuenta ? ` en @${done.cuenta}` : ''}</strong>
            {done.aviso && <span className="small">{WARN}{done.aviso}</span>}
            {safe(done.url)
              ? <a className="btn primary" style={{ alignSelf: 'flex-start' }} href={safe(done.url)} target="_blank" rel="noreferrer"><Icon name="open" />Ver</a>
              : <span className="small muted">{name} no devolvió el enlace: búscalo en el perfil.</span>}
          </div>
        ) : !previo ? (
          <span className="muted">{error || 'Revisando el video y la cuenta…'}</span>
        ) : !previo.cuentas.length ? (
          <>
            <span className="muted">Todavía no hay ninguna cuenta de {name} conectada.</span>
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={onCuentas}><Icon name="link" />Conectar cuenta</button>
          </>
        ) : (
          <>
            {previo.cuentas.length > 1 ? (
              <label className="field">Cuenta
                <select value={previo.cuenta ?? ''} disabled={Boolean(job)} onChange={(e) => { setOk(false); setError(''); void load(e.target.value); }}>
                  {!previo.cuenta && <option value="">Elige una cuenta…</option>}
                  {previo.cuentas.map((c) => <option key={c.id} value={c.id}>@{c.usuario}{c.nombre ? ` · ${c.nombre}` : ''}</option>)}
                </select>
              </label>
            ) : <span><span className="small muted">Cuenta </span><strong>@{acc?.usuario ?? previo.cuentas[0].usuario}</strong></span>}
            {previo.archivo && <span className="small muted" style={{ wordBreak: 'break-all' }}><Icon name="film" style={{ marginRight: 6 }} />{previo.archivo} · {(previo.peso / 1e6).toFixed(1).replace('.', ',')} MB · {Math.round(previo.duracion)} s</span>}
            <label className="field">
              <span className="row" style={{ justifyContent: 'space-between' }}><span>Texto</span><span>{text.length} / {MAX_TEXTO}</span></span>
              <textarea rows={7} maxLength={MAX_TEXTO} disabled={Boolean(job)} value={text} onChange={(e) => setTexto(e.target.value)} />
            </label>
            {!text.trim() && <span className="small" style={{ color: 'var(--pinkText)' }}>{WARN}Escribe el texto del reel.</span>}
            {previo.cupo?.total ? <span className="small muted">Hoy: {previo.cupo.usadas} de {previo.cupo.total} publicaciones en esta cuenta.</span> : null}
            {previo.avisos.map((a) => <span key={a} className="small">{WARN}{a}</span>)}
            {previo.problemas.map((p) => <span key={p} className="small" style={{ color: 'var(--pinkText)' }}>{WARN}{p}</span>)}
            {acc?.estado === 'reconectar' && <button className="btn rect" style={{ alignSelf: 'flex-start' }} onClick={onCuentas}><Icon name="link" />Abrir Cuentas</button>}
            {safe(previo.publicado?.url) && <a className="small" href={safe(previo.publicado?.url)} target="_blank" rel="noreferrer">Ver lo ya publicado <Icon name="open" size={12} /></a>}
            {error && <span className="small" style={{ color: 'var(--pinkText)' }} role="alert">{WARN}{error}</span>}
            {job ? (
              <div className="col" style={{ gap: 6 }} role="status">
                <strong>{job.message || 'Publicando…'}</strong>
                <div className="progress"><div style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
                <span className="small muted">Puede tardar unos minutos. No cierres la app.</span>
              </div>
            ) : (
              <label className="row small">
                <input type="checkbox" checked={ok} disabled={!previo.listo} onChange={(e) => setOk(e.target.checked)} />
                <span>Entiendo que se publica en público{previo.publicado ? ' otra vez' : ''}</span>
              </label>
            )}
          </>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" disabled={Boolean(job)} onClick={onClose}>{done ? 'Cerrar' : 'Cancelar'}</button>
          {!done && previo && previo.cuentas.length > 0 && <button className="btn primary" disabled={!ready} onClick={publicar}><Icon name="publish" />Publicar</button>}
        </div>
      </div>
    </div>
  );
};
