import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Ctx } from '../App.tsx';
import { api, waitJob, type Job } from '../useProject.ts';

interface Item { id: string; name: string; client: string; approval: string; scenes: number; updatedAt: string; kind?: string; duration?: number; thumbT?: number }

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
  const [preset, setPreset] = useState('rapido');
  const [kind, setKind] = useState<'hablado' | 'montaje'>('hablado');
  const [job, setJob] = useState<Job | null>(null);
  const [over, setOver] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const reload = () => api<Item[]>('/api/projects').then(setItems).catch((e) => ctx.toast(e.message));
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
    if (!window.confirm(`¿Mover «${it.name}» a la papelera?\n\nDeja de aparecer en la lista, pero no se borra: queda en workspace/papelera por si lo necesitas.`)) return;
    try {
      await api(`/api/op?id=${encodeURIComponent(it.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'papelera' }) });
      await reload();
      ctx.toast(`«${it.name}» está en la papelera.`);
    } catch (e: any) { ctx.toast(e.message); }
  };
  // Automático: el video se edita solo al subirlo y se abre directo en el editor.
  const [auto, setAuto] = useState(true);

  useEffect(() => { api<Item[]>('/api/projects').then(setItems).catch((e) => ctx.toast(e.message)); }, []);
  const clients = useMemo(() => [...new Set((items ?? []).map((i) => i.client))].sort(), [items]);
  const shown = useMemo(() => (items ?? []).filter((i) =>
    (!filter || i.client === filter) && (!q.trim() || `${i.name} ${i.client}`.toLowerCase().includes(q.trim().toLowerCase()))), [items, q, filter]);

  /** Montaje sin voz: se suben uno o varios videos y se arma con cortes rápidos. */
  const uploadMontage = async (files: File[]) => {
    const videos = files.filter((f) => /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name));
    if (!videos.length) return ctx.toast('Sube uno o varios videos (.mp4 o .mov).');
    try {
      const tokens: string[] = [];
      for (const [i, f] of videos.entries()) {
        setJob({ id: '', status: 'running', message: `Subiendo video ${i + 1} de ${videos.length}…`, progress: (i / videos.length) * 0.2 });
        tokens.push((await api<{ token: string }>(`/api/upload?filename=${encodeURIComponent(f.name)}`, { method: 'POST', body: f })).token);
      }
      const started = await api<Job>('/api/montajes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens, client: client.trim(), preset, auto }) });
      const done = await waitJob(started, setJob);
      if (done.result?.summary) ctx.toast((done.result.summary as string[]).join(' '));
      ctx.go(auto ? 'editor' : 'storyboard', { p: done.result?.id, s: null });
    } catch (e: any) {
      ctx.toast(`No se pudo crear: ${e.message}`);
    } finally {
      setJob(null);
    }
  };
  const take = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    if (kind === 'montaje') uploadMontage(files); else upload(files[0]);
  };

  const upload = async (file: File) => {
    if (!/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) return ctx.toast('Sube un video (.mp4 o .mov).');
    const qs = new URLSearchParams({ filename: file.name, preset });
    if (client.trim()) qs.set('client', client.trim());
    if (auto) qs.set('auto', '1');
    try {
      setJob({ id: '', status: 'running', message: 'Subiendo el video…', progress: 0 });
      const started = await api<Job>(`/api/projects?${qs}`, { method: 'POST', body: file });
      const done = await waitJob(started, setJob);
      if (done.result?.summary) ctx.toast((done.result.summary as string[]).join(' '));
      ctx.go(auto ? 'editor' : 'brief', { p: done.result?.id, s: null });
    } catch (e: any) {
      ctx.toast(`No se pudo crear: ${e.message}`);
    } finally {
      setJob(null);
    }
  };

  return (
    <main className="page projects" style={{ maxWidth: 1080, width: '100%', margin: '0 auto' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 28 }}>Nuevo reel</h1>
        <div className="row">
          <a className="btn rect" href="#/calendario">📅 Calendario</a>
        {items && items[0] && !job && (
          <a className="btn rect" href={`#/editor?p=${encodeURIComponent(items[0].id)}`} title={`Abrir «${items[0].name}»`}>Seguir con «{items[0].name.length > 28 ? items[0].name.slice(0, 27) + '…' : items[0].name}» →</a>
        )}
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
            <div className="progress" style={{ maxWidth: 420 }} role="progressbar" aria-valuenow={Math.round(job.progress * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
            <span className="muted small">Transcribir y limpiar el audio tarda de 1 a 5 minutos. Puedes dejar esta pestaña abierta.</span>
          </>
        ) : (
          <>
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', width: '100%', maxWidth: 420 }}>
              <button className={kind === 'hablado' ? 'on' : ''} aria-pressed={kind === 'hablado'} onClick={() => setKind('hablado')}>Hablando a cámara</button>
              <button className={kind === 'montaje' ? 'on' : ''} aria-pressed={kind === 'montaje'} onClick={() => setKind('montaje')}>Sin voz (montaje)</button>
            </div>
            <strong style={{ fontSize: 17 }}>{over ? 'Suelta el video aquí' : kind === 'hablado' ? 'Arrastra aquí tu video hablando a cámara' : 'Arrastra aquí uno o varios videos'}</strong>
            <span className="muted">{kind === 'hablado'
              ? 'La app lo transcribe, quita silencios y tomas repetidas, y arma el reel.'
              : 'Para gimnasio, comida o producto: la app detecta las tomas y arma cortes rápidos (al ritmo, si le pones música).'}</span>
            <div className="row" style={{ justifyContent: 'center' }}>
              <label className="field">Cliente
                <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="personal" list="clientes" />
                <datalist id="clientes">{clients.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <label className="field">Ritmo
                <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                  <option value="rapido">Rápido</option><option value="con-ritmo">Con ritmo</option><option value="sobrio">Sobrio</option>
                </select>
              </label>
            </div>
            <label className="row" style={{ justifyContent: 'center' }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              <span><strong>Automático:</strong> que la app lo edite todo sola al subirlo</span>
            </label>
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
        <div className="pgrid">{[0, 1, 2, 3].map((i) => <div key={i} className="pcard skeleton" aria-hidden="true" />)}</div>
      ) : items.length === 0 ? (
        <p className="muted">Todavía no hay proyectos. Sube tu primer video arriba: en unos minutos lo tienes editado.</p>
      ) : shown.length === 0 ? (
        <p className="muted">Nada coincide con «{q}». <button className="btn ghost" style={{ height: 30 }} onClick={() => { setQ(''); setFilter(''); }}>Ver todos</button></p>
      ) : (
        <div className="pgrid">
          {shown.map((it) => (
            <div key={it.id} className="pcard">
              <a className="pcard-link" href={`#/editor?p=${encodeURIComponent(it.id)}`} title={`Abrir «${it.name}» en el editor`}>
                <span className="pthumb">
                  <img src={`/api/thumb?id=${encodeURIComponent(it.id)}&t=${it.thumbT ?? 1}`} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                  {it.duration ? <span className="pdur">{Math.floor(it.duration / 60)}:{String(Math.round(it.duration % 60)).padStart(2, '0')}</span> : null}
                </span>
                <span className="col" style={{ gap: 4, minWidth: 0 }}>
                  <strong className="pname">{it.name}</strong>
                  <span className="small muted">{it.client} · {it.kind === 'montaje' ? 'montaje' : `${it.scenes} escenas`}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <span className={`pill ${it.approval === 'aprobado' ? '' : 'line'}`}>{STATUS[it.approval] ?? it.approval}</span>
                    <span className="small muted">{ago(it.updatedAt)}</span>
                  </span>
                </span>
              </a>
              <div className="pactions">
                <button className="btn sq" aria-label={`Más acciones para «${it.name}»`} aria-expanded={menu === it.id} onClick={() => setMenu(menu === it.id ? null : it.id)}>⋯</button>
                {menu === it.id && (
                  <div className="pmenu" role="menu">
                    <a role="menuitem" className="pmenu-link" href={`#/calendario?s=${encodeURIComponent(it.id)}`}>Programar publicación</a>
                    <button role="menuitem" onClick={() => duplicate(it)}>Duplicar</button>
                    <button role="menuitem" className="danger" onClick={() => trash(it)}>Mover a la papelera</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
};
