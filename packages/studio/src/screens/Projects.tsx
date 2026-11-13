import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon.tsx';
import type { IconName } from '../icons.ts';
import type { Ctx } from '../App.tsx';
import { api, uploadFile, waitJob, type Job } from '../useProject.ts';
import { KeysPanel, useBankKey } from '../Bank.tsx';
import { CuentasPanel, useCuentas } from '../Cuentas.tsx';

/** `edited` = ya se aplicó el brief; `creating` = el servidor aún lo está preparando. */
interface Item { id: string; name: string; client: string; approval: string; scenes: number; updatedAt: string; kind?: string; duration?: number; thumbT?: number; edited?: boolean; creating?: boolean }

/**
 * ¿Se está creando? El servidor marca `creating` con cualquier tarea larga del proyecto (también al
 * editarlo o cambiar la canción); solo es «creando» si aún no tiene escenas.
 */
const making = (it: Item) => Boolean(it.creating && !it.scenes);

/** Lo que hay en la papelera (contrato 9: GET /api/papelera). */
interface Tirado { nombre: string; tipo: 'proyecto' | 'referencia' | 'estilo' | 'otro'; titulo: string; cliente?: string; fecha: string }
const TIPO: Record<Tirado['tipo'], [IconName, string]> = { proyecto: ['film', 'Video'], referencia: ['reference', 'Referencia'], estilo: ['palette', 'Estilo'], otro: ['folder', 'Archivo'] };

/** Papelera: lo que se quitó (videos, referencias, estilos) se puede recuperar o borrar para siempre. */
const PapeleraPanel: React.FC<{ onClose: () => void; onRestored: () => void; toast: (m: string) => void }> = ({ onClose, onRestored, toast }) => {
  const [list, setList] = useState<Tirado[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = () => api<Tirado[]>('/api/papelera').then((d) => { setList(Array.isArray(d) ? d : []); setError(''); }).catch((e) => setError(e.status === 404 ? 'La papelera todavía no está disponible en esta versión de la app.' : e.message));
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);
  const recuperar = async (t: Tirado) => {
    setBusy(t.nombre);
    try {
      setList(await api<Tirado[]>('/api/papelera/recuperar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: t.nombre }) }));
      onRestored();
      toast(`«${t.titulo}» volvió a su lugar.`);
    } catch (e: any) { toast(e.message); } finally { setBusy(''); }
  };
  const borrar = async (t?: Tirado) => {
    const n = list?.length ?? 0;
    if (!window.confirm(t ? `¿Borrar «${t.titulo}» para siempre?\n\nNo se puede deshacer.` : `¿Vaciar la papelera?\n\nSe borran para siempre ${n === 1 ? 'el elemento que hay' : `los ${n} elementos`}. No se puede deshacer.`)) return;
    setBusy(t?.nombre ?? '*');
    try {
      setList(await api<Tirado[]>(`/api/papelera${t ? `?nombre=${encodeURIComponent(t.nombre)}` : ''}`, { method: 'DELETE' }));
      toast(t ? `«${t.titulo}» borrado para siempre.` : 'Papelera vacía.');
    } catch (e: any) { toast(e.message); } finally { setBusy(''); }
  };
  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal card col" role="dialog" aria-modal="true" aria-label="Papelera" style={{ maxWidth: 560, gap: 14 }}>
        <h2 style={{ fontSize: 20 }}>Papelera</h2>
        <span className="small muted">Lo que quitas no se borra al momento: queda aquí. Recupéralo o bórralo para siempre para liberar espacio.</span>
        {error ? <span className="small" role="alert"><Icon name="warning" style={{ marginRight: 6 }} />{error}</span>
          : list === null ? <span className="small muted" role="status">Cargando…</span>
          : list.length === 0 ? <span className="muted">La papelera está vacía.</span>
          : (
            <div className="col" style={{ gap: 6, maxHeight: '50vh', overflowY: 'auto' }}>
              {list.map((t) => (
                <div key={t.nombre} className="row" style={{ flexWrap: 'nowrap', gap: 10, padding: 8, borderRadius: 10, border: '1px solid var(--line)' }}>
                  <Icon name={TIPO[t.tipo]?.[0] ?? 'folder'} size={20} />
                  <span className="col" style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <strong className="pname">{t.titulo}</strong>
                    <span className="small muted">{TIPO[t.tipo]?.[1] ?? 'Archivo'}{t.cliente ? ` · ${t.cliente}` : ''}{t.fecha ? ` · ${ago(t.fecha)}` : ''}</span>
                  </span>
                  <button className="btn rect small" disabled={Boolean(busy)} onClick={() => recuperar(t)}><Icon name="undo" />Recuperar</button>
                  <button className="btn sq" disabled={Boolean(busy)} aria-label={`Borrar «${t.titulo}» para siempre`} title="Borrar para siempre" onClick={() => borrar(t)}><Icon name="trash" /></button>
                </div>
              ))}
            </div>
          )}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {list && list.length > 0 ? <button className="btn ghost" style={{ color: 'var(--pinkText)' }} disabled={Boolean(busy)} onClick={() => borrar()}><Icon name="trash" />Vaciar la papelera</button> : <span />}
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
};

/** A dónde lleva abrir un proyecto: a su resultado si ya se editó; si no, al brief. */
const openHref = (it: Item) => `#/${it.edited ? 'listo' : 'brief'}?p=${encodeURIComponent(it.id)}`;
const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;

const STATUS: Record<string, string> = { borrador: 'Borrador', en_revision: 'En revisión', aprobado: 'Aprobado' };

/** «hace 5 min», «ayer», «12 nov». */
function ago(iso: string) {
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 172800) return 'ayer';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}

export const Projects: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const [items, setItems] = useState<Item[] | null>(null);
  const [client, setClient] = useState('');
  const [keysOpen, setKeysOpen] = useState(false);
  const [papeleraOpen, setPapeleraOpen] = useState(false);
  // Cuentas de Instagram para publicar: el botón avisa si alguna hay que conectarla otra vez.
  const [cuentasOpen, setCuentasOpen] = useState(false);
  const ig = useCuentas()?.instagram;
  const cuentasAviso = ig?.cuentas.some((c) => c.estado === 'reconectar') ? 'Hay una cuenta de Instagram que conectar otra vez' : ig?.aviso;
  // Copia de seguridad a iCloud: se hace sola una vez al día; aquí se ve cuándo fue y se puede forzar.
  const [backup, setBackup] = useState<{ last?: string; error?: string; running?: boolean; copied?: number; bytes?: number } | null>(null);
  const [backingUp, setBackingUp] = useState('');
  useEffect(() => { api<any>('/api/copia').then(setBackup).catch(() => {}); }, []);
  const backupNow = async () => {
    setBackingUp('Copiando…');
    try {
      const job = await api<Job>('/api/copia', { method: 'POST' });
      const done = await waitJob(job, (j) => setBackingUp(j.message));
      setBackup(done.result as any);
      ctx.toast(done.result?.copied ? `Copia lista: ${done.result.copied} archivos nuevos (${Math.round((done.result.bytes ?? 0) / 1e6)} MB).` : 'Copia al día: no había nada nuevo.');
    } catch (e: any) { ctx.toast(e.message); api<any>('/api/copia').then(setBackup).catch(() => {}); } finally { setBackingUp(''); }
  };
  // Actualizarse: al abrir se mira si hay versión nueva; con un clic se instala y la app se reinicia.
  const [upd, setUpd] = useState<{ behind: number; changes: string[]; error?: string; source: string | null } | null>(null);
  const [updating, setUpdating] = useState('');
  useEffect(() => { api<any>('/api/actualizar').then(setUpd).catch(() => {}); }, []);
  const update = async () => {
    setUpdating('Buscando…');
    try {
      const c = await api<any>('/api/actualizar');
      setUpd(c);
      if (c.error) return ctx.toast(c.error);
      if (!c.behind) return ctx.toast('Ya tienes la última versión.');
      if (!window.confirm(`Hay ${c.behind} novedad${c.behind === 1 ? '' : 'es'}:\n\n${c.changes.map((x: string) => `• ${x}`).join('\n')}\n\n¿Actualizar ahora? La app se reinicia sola (tu trabajo no se toca).`)) return;
      const job = await api<Job>('/api/actualizar', { method: 'POST' });
      let restarting = false;
      try {
        const done = await waitJob(job, (j) => setUpdating(j.message));
        restarting = Boolean(done.result?.restarting);
        ctx.toast(done.result?.message ?? 'Actualizada.');
        if (!restarting && done.result?.updated) ctx.toast('Actualizada. Cierra y vuelve a abrir la app para usar la versión nueva.');
      } catch (e: any) {
        // Si la app se reinició mientras se esperaba, la conexión se corta: es lo esperado.
        if (/fetch|network|Failed|conexión|reinició/i.test(e.message)) restarting = true; else throw e;
      }
      if (restarting) {
        setUpdating('Reiniciando…');
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          try { await api('/api/ping'); if (i > 2) { location.reload(); return; } } catch { /* todavía reiniciando */ }
        }
      }
    } catch (e: any) { ctx.toast(e.message); } finally { setUpdating(''); }
  };
  // Abrirla desde el portátil o el celular: en la misma Wi-Fi o, con Tailscale, desde cualquier lugar.
  const [access, setAccess] = useState<{ active: boolean; tailscale: boolean; links: { kind: 'wifi' | 'fuera'; url: string }[] } | null>(null);
  const openAccess = () => api<any>('/api/red').then(setAccess).catch((e) => ctx.toast(e.message));
  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); ctx.toast('Enlace copiado.'); } catch { ctx.toast(url); } };
  const [preset, setPreset] = useState('rapido');
  const [kind, setKind] = useState<'hablado' | 'montaje'>('hablado');
  // La subida en curso vive en App: no se pierde al cambiar de pantalla.
  const job = ctx.creating;
  const [over, setOver] = useState(false);
  const [loadError, setLoadError] = useState('');
  const ajustes = useRef<HTMLDetailsElement>(null);
  const closeAjustes = () => ajustes.current?.removeAttribute('open');
  const [freesound] = useBankKey('freesound');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const reload = () => api<Item[]>('/api/projects').then((d) => { setItems(d); setLoadError(''); }).catch((e) => setLoadError(e.message));
  const duplicate = async (it: Item) => {
    setMenu(null);
    try {
      const d = await api<{ id: string }>(`/api/op?id=${encodeURIComponent(it.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'duplicar' }) });
      await reload();
      ctx.toast(`Copia creada: «${it.name} (copia)».`);
      return d;
    } catch (e: any) { ctx.toast(e.message); }
  };
  const trash = async (it: Item) => {
    setMenu(null);
    if (!window.confirm(`¿Mover «${it.name}» a la papelera?\n\nDeja de aparecer en la lista, pero no se borra: queda guardado por si lo necesitas.`)) return;
    try {
      await api(`/api/op?id=${encodeURIComponent(it.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'papelera' }) });
      await reload();
      ctx.toast(`«${it.name}» está en la papelera. Para recuperarlo: Ajustes › Papelera.`);
    } catch (e: any) { ctx.toast(e.message); }
  };
  /** Cambia el nombre o el cliente del proyecto (lo guarda con el PUT del proyecto; el id y la carpeta no cambian). */
  const edit = async (it: Item, field: 'name' | 'client') => {
    setMenu(null);
    const now = field === 'name' ? it.name : it.client;
    const v = window.prompt(field === 'name' ? 'Nuevo nombre del video:' : 'Cliente de este video (vacío = personal):', now);
    if (v === null) return;
    const value = v.trim().slice(0, 80);
    if (field === 'name' && !value) return ctx.toast('El nombre no puede quedar vacío.');
    if (value === now || (field === 'client' && !value && now === 'personal')) return;
    try {
      const d = await api(`/api/project?id=${encodeURIComponent(it.id)}`);
      const pr = d.project;
      if (field === 'name') pr.name = value; else pr.client = value && value !== 'personal' ? value : undefined;
      await api(`/api/project?id=${encodeURIComponent(it.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pr) });
      await reload();
      ctx.toast(field === 'name' ? `Ahora se llama «${value}».` : `Ahora es de «${value || 'personal'}».`);
    } catch (e: any) { ctx.toast(e.message); }
  };

  useEffect(() => { void reload(); }, []);
  // Al empezar y al terminar una subida, la lista se pone al día (el nuevo sale como «Preparando…»).
  const wasCreating = useRef(Boolean(job));
  useEffect(() => {
    const now = Boolean(job && job.id);
    if (now !== wasCreating.current) { wasCreating.current = now; void reload(); }
  }, [job?.id]);
  // El menú «⋯» se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as HTMLElement).closest?.('.pactions')) setMenu(null);
    };
    addEventListener('pointerdown', close);
    addEventListener('keydown', close);
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', close); };
  }, [menu]);
  const clients = useMemo(() => [...new Set((items ?? []).map((i) => i.client))].sort(), [items]);
  // Si el cliente filtrado ya no tiene videos (p. ej. se mandó a la papelera el último), se quita el filtro.
  useEffect(() => { if (filter && items && !clients.includes(filter)) setFilter(''); }, [clients]);
  const shown = useMemo(() => (items ?? []).filter((i) =>
    (!filter || i.client === filter) && (!q.trim() || `${i.name} ${i.client}`.toLowerCase().includes(q.trim().toLowerCase()))), [items, q, filter]);
  const last = items?.find((i) => !making(i));
  // Escape cierra la ventana de «Otros equipos».
  useEffect(() => {
    if (!access) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAccess(null); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [access]);

  /** Montaje sin voz: se suben uno o varios videos y se arma con cortes rápidos. */
  const uploadMontage = (files: File[]) => {
    const videos = files.filter((f) => VIDEO.test(f.name));
    if (!videos.length) return ctx.toast('Sube uno o varios videos (.mp4 o .mov).');
    void ctx.startCreate(async (tick) => {
      const tokens: string[] = [];
      for (const [i, f] of videos.entries()) {
        const msg = `Subiendo video ${i + 1} de ${videos.length}…`;
        tick({ id: '', status: 'running', message: msg, progress: (i / videos.length) * 0.3 });
        const up = await uploadFile<{ token: string }>(`/api/upload?filename=${encodeURIComponent(f.name)}`, f,
          (x) => tick({ id: '', status: 'running', message: `${msg} ${Math.round(x * 100)} %`, progress: ((i + x) / videos.length) * 0.3 }));
        tokens.push(up.token);
      }
      tick({ id: '', status: 'running', message: 'Preparando el montaje…', progress: 0.3 });
      return api<Job>('/api/montajes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens, client: client.trim(), preset, auto: false }) });
    });
  };
  const upload = (file: File) => {
    if (!VIDEO.test(file.name)) return ctx.toast('Sube un video (.mp4 o .mov).');
    const qs = new URLSearchParams({ filename: file.name, preset });
    if (client.trim()) qs.set('client', client.trim());
    void ctx.startCreate(async (tick) => {
      tick({ id: '', status: 'running', message: 'Subiendo el video…', progress: 0 });
      const started = await uploadFile<Job>(`/api/projects?${qs}`, file,
        (x) => tick({ id: '', status: 'running', message: `Subiendo el video… ${Math.round(x * 100)} %`, progress: x * 0.3 }));
      tick({ id: '', status: 'running', message: 'Preparando el video…', progress: 0.3 });
      return started;
    });
  };
  const take = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    // Una sola subida a la vez: soltar otro archivo encima no lanza otra.
    if (job) return ctx.toast('Espera a que termine el video que se está subiendo.');
    if (kind === 'hablado' && files.length > 1) return ctx.toast(`Soltaste ${files.length} videos. Para un video hablando a cámara suelta uno solo; para juntar varios elige «Sin voz».`);
    if (kind === 'montaje') uploadMontage(files); else upload(files[0]);
  };
  // Un punto rosa en «Ajustes» cuando algo de adentro pide atención.
  const aviso = Boolean(upd?.behind || upd?.error || cuentasAviso || backup?.error || (backup && !backup.last) || freesound === false);

  return (
    <main className="page projects" style={{ maxWidth: 1080, width: '100%', margin: '0 auto' }}>
      {keysOpen && <KeysPanel onClose={() => setKeysOpen(false)} toast={ctx.toast} />}
      {papeleraOpen && <PapeleraPanel onClose={() => setPapeleraOpen(false)} onRestored={() => void reload()} toast={ctx.toast} />}
      {cuentasOpen && <CuentasPanel onClose={() => setCuentasOpen(false)} toast={ctx.toast} />}
      {access && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setAccess(null); }}>
          <div className="modal card col" role="dialog" aria-modal="true" aria-label="Abrir desde otros equipos" style={{ maxWidth: 480, gap: 14 }}>
            <h2 style={{ fontSize: 20 }}>Abrir desde otros equipos</h2>
            {!access.active ? <span className="muted">La app se abrió solo para este computador. Ciérrala y ábrela con «Abrir Axioma Studio» para compartirla en tu red.</span> : (
              <>
                <section className="col" style={{ gap: 6 }}>
                  <strong><Icon name="wifi" style={{ marginRight: 6 }} />En la misma Wi-Fi</strong>
                  {access.links.filter((l) => l.kind === 'wifi').map((l) => (
                    <div key={l.url} className="row" style={{ flexWrap: 'nowrap' }}><code className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</code><button className="btn rect" onClick={() => copy(l.url)}>Copiar</button></div>
                  ))}
                  {!access.links.some((l) => l.kind === 'wifi') && <span className="small muted">No hay una red Wi-Fi activa en este computador.</span>}
                </section>
                <section className="col" style={{ gap: 6 }}>
                  <strong><Icon name="globe" style={{ marginRight: 6 }} />Fuera de casa</strong>
                  {access.tailscale ? access.links.filter((l) => l.kind === 'fuera').map((l) => (
                    <div key={l.url} className="row" style={{ flexWrap: 'nowrap' }}><code className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</code><button className="btn rect" onClick={() => copy(l.url)}>Copiar</button></div>
                  )) : (
                    <ol className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                      <li>Instala <a href="https://tailscale.com/download" target="_blank" rel="noreferrer">Tailscale</a> (gratis) en este computador e inicia sesión.</li>
                      <li>Instálalo también en tu portátil o celular, con la misma cuenta.</li>
                      <li>Vuelve a abrir esta ventana: aquí aparece el enlace para usar la app desde cualquier lugar.</li>
                    </ol>
                  )}
                </section>
                <span className="small muted">El enlace lleva tu clave: compártelo solo con tus equipos.</span>
              </>
            )}
            <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => setAccess(null)}>Cerrar</button>
          </div>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 28 }}>Nuevo video</h1>
        <div className="row">
          {last && !job && (
            <a className="btn rect" href={openHref(last)} title={`Abrir «${last.name}»`}>Seguir con «{last.name.length > 28 ? last.name.slice(0, 27) + '…' : last.name}»<Icon name="next" /></a>
          )}
          <a className="btn rect" href="#/calendario"><Icon name="calendar" />Calendario</a>
          <details className="more ajustes" ref={ajustes}>
            <summary className="btn rect" aria-label={aviso ? 'Ajustes (hay avisos)' : 'Ajustes'}><Icon name="settings" />Ajustes{aviso && <span className="dot" aria-hidden="true" />}</summary>
            <div className="more-menu">
              <button className={upd?.behind || upd?.error ? 'warn' : ''} disabled={Boolean(updating)} onClick={() => { closeAjustes(); void update(); }}
                title={upd?.error ?? (upd?.behind ? `Novedades:\n${upd.changes.join('\n')}` : 'Revisa si hay una versión nueva de la app')}>
                <Icon name={upd?.error ? 'warning' : 'update'} />{updating || (upd?.error ? 'Actualizar (no se pudo revisar)' : upd?.behind ? `Actualizar (${upd.behind} novedad${upd.behind === 1 ? '' : 'es'})` : 'Actualizar la app')}
              </button>
              <button onClick={() => { closeAjustes(); void openAccess(); }} title="Abrir la app desde tu portátil o celular"><Icon name="devices" />Otros equipos</button>
              <button className={freesound === false ? 'warn' : ''} onClick={() => { closeAjustes(); setKeysOpen(true); }}
                title={freesound === false ? 'Falta la clave gratuita de Freesound: sin ella no hay música automática' : 'Pixabay, Pexels, Freesound y ElevenLabs'}>
                <Icon name="key" />{freesound === false ? 'Claves (falta la de la música)' : 'Claves'}
              </button>
              <button className={cuentasAviso ? 'warn' : ''} onClick={() => { closeAjustes(); setCuentasOpen(true); }} title={cuentasAviso ?? 'Instagram: conecta tus cuentas para publicar desde la app'}><Icon name="link" />Cuentas</button>
              <button onClick={() => { closeAjustes(); setPapeleraOpen(true); }} title="Recupera lo que quitaste o vacíala para liberar espacio"><Icon name="trash" />Papelera</button>
              <button className={backup?.error || (backup && !backup.last) ? 'warn' : ''} disabled={Boolean(backingUp || backup?.running)}
                onClick={() => { closeAjustes(); if (backup?.error) ctx.toast(`La última copia falló: ${backup.error}`); void backupNow(); }}
                title={backup?.error ? backup.error : 'Copia de seguridad en iCloud Drive: se hace sola una vez al día. Clic para hacerla ahora.'}>
                <Icon name={backup?.error ? 'warning' : 'cloud'} />{backingUp || (backup?.running ? 'Copiando…' : backup?.error ? 'Copia con error: reintentar' : backup?.last ? `Copia en iCloud: ${ago(backup.last)}` : 'Activar copia en iCloud')}
              </button>
            </div>
          </details>
        </div>
      </div>
      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      >
        {job ? (
          <>
            <strong>{job.message}</strong>
            <div className={`progress ${job.progress >= 0.3 && job.progress < 0.32 ? 'busy' : ''}`} style={{ maxWidth: 420 }} role="progressbar" aria-valuenow={Math.round(job.progress * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
            <span className="muted small">Al terminar podrás completar el brief. Puedes ir a otra pantalla: te aviso cuando esté.</span>
          </>
        ) : (
          <>
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', width: '100%', maxWidth: 420 }}>
              <button className={kind === 'hablado' ? 'on' : ''} aria-pressed={kind === 'hablado'} onClick={() => setKind('hablado')}><Icon name="mic" style={{ marginRight: 6 }} />Hablando a cámara</button>
              <button className={kind === 'montaje' ? 'on' : ''} aria-pressed={kind === 'montaje'} onClick={() => setKind('montaje')}><Icon name="clapper" style={{ marginRight: 6 }} />Sin voz</button>
            </div>
            <strong style={{ fontSize: 17 }}>{over ? 'Suelta el video aquí' : kind === 'hablado' ? 'Arrastra aquí tu video hablando a cámara' : 'Arrastra aquí uno o varios videos'}</strong>
            <span className="muted">{kind === 'hablado'
              ? 'La app prepara el video y detecta las partes habladas.'
              : 'Gimnasio, comida o producto: sube tus tomas y la app arma el montaje con música.'}</span>
            <div className="row" style={{ justifyContent: 'center' }}>
              <label className="field">Cliente
                <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="personal" list="clientes" />
                <datalist id="clientes">{clients.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
            </div>
            <button className="btn primary" onClick={() => input.current?.click()}>{kind === 'montaje' ? 'Elegir videos' : 'Elegir video'}</button>
            <input ref={input} type="file" accept="video/*" multiple={kind === 'montaje'} hidden onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
          </>
        )}
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
        <h2 style={{ fontSize: 20 }}>Proyectos {items ? <span className="muted small" style={{ fontWeight: 500 }}>({shown.length}{shown.length !== items.length ? ` de ${items.length}` : ''})</span> : null}</h2>
        {items && items.length > 3 && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input" style={{ minHeight: 36, width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o cliente" aria-label="Buscar proyectos" />
            <div className="row chips" role="group" aria-label="Filtrar por cliente">
              <button className={!filter ? 'on' : ''} aria-pressed={!filter} onClick={() => setFilter('')}>Todos</button>
              {clients.map((c) => <button key={c} className={filter === c ? 'on' : ''} aria-pressed={filter === c} onClick={() => setFilter(filter === c ? '' : c)}>{c}</button>)}
            </div>
          </div>
        )}
      </div>
      {items === null ? (
        loadError
          ? <p className="muted" role="alert">No pude cargar tus proyectos ({loadError}). <button className="btn rect" style={{ height: 32 }} onClick={() => void reload()}><Icon name="refresh" />Reintentar</button></p>
          : <div className="pgrid">{[0, 1, 2, 3].map((i) => <div key={i} className="pcard skeleton" aria-hidden="true" />)}</div>
      ) : items.length === 0 ? (
        <p className="muted">Todavía no hay proyectos. Sube tu primer video arriba: en unos minutos lo tienes editado.</p>
      ) : shown.length === 0 ? (
        <p className="muted">{q.trim() ? `Nada coincide con «${q}».` : 'No hay videos de este cliente.'} <button className="btn ghost" style={{ height: 30 }} onClick={() => { setQ(''); setFilter(''); }}>Ver todos</button></p>
      ) : (
        <div className="pgrid">
          {shown.map((it) => (
            <div key={it.id} className={`pcard ${menu === it.id ? 'menu-open' : ''} ${making(it) ? 'busy' : ''}`} aria-busy={making(it) || undefined}>
              <a className="pcard-link" href={making(it) ? undefined : openHref(it)} aria-disabled={making(it) || undefined} title={making(it) ? 'Todavía se está preparando' : `Abrir «${it.name}»`}>
                <span className="pthumb">
                  <img src={`/api/thumb?id=${encodeURIComponent(it.id)}&t=${it.thumbT ?? 1}`} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                  {it.duration ? <span className="pdur">{Math.floor(it.duration / 60)}:{String(Math.round(it.duration % 60)).padStart(2, '0')}</span> : null}
                </span>
                <span className="col" style={{ gap: 4, minWidth: 0 }}>
                  <strong className="pname">{it.name}</strong>
                  <span className="small muted">{it.client} · {it.kind === 'montaje' ? 'montaje' : `${it.scenes} escenas`}</span>
                  <span className="row" style={{ gap: 6 }}>
                    {making(it) ? <span className="pill line">Preparando…</span>
                      : it.creating ? <span className="pill line">Editándose…</span>
                      : !it.edited ? <span className="pill line">Falta el brief</span>
                      : <span className={`pill ${it.approval === 'aprobado' ? '' : 'line'}`}>{STATUS[it.approval] ?? it.approval}</span>}
                    <span className="small muted">{ago(it.updatedAt)}</span>
                  </span>
                </span>
              </a>
              {!making(it) && (
                <div className="pactions">
                  <button className="btn sq" aria-label={`Más acciones para «${it.name}»`} aria-expanded={menu === it.id} onClick={() => setMenu(menu === it.id ? null : it.id)}><Icon name="more" /></button>
                  {menu === it.id && (
                    <div className="pmenu" role="menu">
                      <a role="menuitem" className="pmenu-link" href={`#/calendario?s=${encodeURIComponent(it.id)}`}><Icon name="calendar" />Programar publicación</a>
                      <button role="menuitem" onClick={() => edit(it, 'name')}><Icon name="edit" />Cambiar nombre</button>
                      <button role="menuitem" onClick={() => edit(it, 'client')}><Icon name="users" />Cambiar cliente</button>
                      <a role="menuitem" className="pmenu-link" href={`#/editor?p=${encodeURIComponent(it.id)}`}><Icon name="editor" />Abrir en el editor</a>
                      <button role="menuitem" onClick={() => duplicate(it)}><Icon name="copy" />Duplicar</button>
                      <button role="menuitem" className="danger" onClick={() => trash(it)}><Icon name="trash" />Mover a la papelera</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
};
