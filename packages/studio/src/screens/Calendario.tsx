import React, { useEffect, useMemo, useState } from 'react';
import { publishPack, publishText } from '@axioma/schema';
import type { Ctx } from '../App.tsx';
import { api } from '../useProject.ts';

type Network = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'linkedin';
interface Entry { id: string; projectId: string; date: string; time?: string; network: Network; status: 'planificado' | 'publicado'; note?: string }
interface Item { id: string; name: string; client: string; thumbT?: number }

const NET: Record<Network, { label: string; short: string; color: string }> = {
  instagram: { label: 'Instagram', short: 'IG', color: '#E1306C' },
  tiktok: { label: 'TikTok', short: 'TT', color: '#25F4EE' },
  youtube: { label: 'YouTube', short: 'YT', color: '#FF3B30' },
  facebook: { label: 'Facebook', short: 'FB', color: '#1877F2' },
  linkedin: { label: 'LinkedIn', short: 'IN', color: '#0A66C2' },
};
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Calendario de publicación: qué reel sale qué día y en qué red (un plan: la app no publica sola). */
export const Calendario: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [open, setOpen] = useState<string | null>(null);
  const today = iso(new Date());
  const [form, setForm] = useState({ projectId: ctx.sceneId ?? '', date: today, time: '19:00', network: 'instagram' as Network });

  useEffect(() => {
    api<Entry[]>('/api/calendario').then(setEntries).catch((e) => ctx.toast(e.message));
    api<Item[]>('/api/projects').then((l) => { setItems(l); setForm((f) => ({ ...f, projectId: f.projectId || l[0]?.id || '' })); }).catch(() => {});
  }, []);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Celdas del mes, empezando el lunes.
  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);
  const inMonth = (d: Date) => d.getMonth() === month.getMonth();
  const dayEntries = (d: string) => (entries ?? []).filter((e) => e.date === d);

  const call = async (method: string, body?: unknown, entry?: string) => {
    try {
      const r = await api<Entry[]>(`/api/calendario${entry ? `?entry=${encodeURIComponent(entry)}` : ''}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      setEntries(r);
      return true;
    } catch (e: any) { ctx.toast(e.message); return false; }
  };
  const add = async () => {
    if (await call('POST', form)) ctx.toast(`Programado: ${byId.get(form.projectId)?.name ?? 'reel'} · ${NET[form.network].label} · ${form.date}${form.time ? ` ${form.time}` : ''}.`);
  };
  const copyText = async (projectId: string) => {
    try {
      const d = await api<any>(`/api/project?id=${encodeURIComponent(projectId)}`);
      await navigator.clipboard.writeText(publishText(publishPack(d.project, d.transcript, d.kit?.sector)));
      ctx.toast('Texto para publicar copiado.');
    } catch { ctx.toast('No se pudo copiar el texto.'); }
  };
  const sel = (entries ?? []).find((e) => e.id === open) ?? null;
  const pending = (entries ?? []).filter((e) => e.status === 'planificado' && e.date >= today).length;

  return (
    <main className="page" style={{ maxWidth: 1180, width: '100%', margin: '0 auto' }}>
      <a href="#/proyectos" className="small muted" style={{ textDecoration: 'none' }}>‹ Proyectos</a>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 26 }}>Calendario de publicación</h1>
        <span className="small muted">{pending} por publicar · es un plan: la app no publica sola en las redes</span>
      </div>

      <section className="card row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }} aria-label="Programar una publicación">
        <label className="field" style={{ flex: '2 1 240px' }}>Reel
          <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.client}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 140px' }}>Día
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="field" style={{ flex: '0 1 110px' }}>Hora
          <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        </label>
        <label className="field" style={{ flex: '1 1 140px' }}>Red
          <select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value as Network })}>
            {(Object.keys(NET) as Network[]).map((n) => <option key={n} value={n}>{NET[n].label}</option>)}
          </select>
        </label>
        <button className="btn primary" disabled={!form.projectId} onClick={add}>Programar</button>
      </section>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <button className="btn rect" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mes anterior">‹</button>
        <strong style={{ fontSize: 18 }}>{(() => { const m = month.toLocaleDateString('es', { month: 'long', year: 'numeric' }); return m.charAt(0).toUpperCase() + m.slice(1); })()}</strong>
        <button className="btn rect" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mes siguiente">›</button>
      </div>

      <div className="cal" role="grid" aria-label="Calendario del mes">
        {DAYS.map((d) => <div key={d} className="cal-head" role="columnheader">{d}</div>)}
        {cells.map((d) => {
          const key = iso(d);
          return (
            <div key={key} role="gridcell" className={`cal-day ${inMonth(d) ? '' : 'out'} ${key === today ? 'today' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small" style={{ fontWeight: 600 }}>{d.getDate()}</span>
                {inMonth(d) && <button className="cal-add" aria-label={`Programar el ${d.getDate()}`} onClick={() => setForm({ ...form, date: key })}>+</button>}
              </div>
              {dayEntries(key).map((e) => (
                <button key={e.id} className={`cal-chip ${e.status}`} style={{ borderLeftColor: NET[e.network].color }} onClick={() => setOpen(e.id)} title={`${NET[e.network].label}${e.time ? ` · ${e.time}` : ''} · ${byId.get(e.projectId)?.name ?? 'reel borrado'}`}>
                  <span className="small" style={{ fontWeight: 700 }}>{NET[e.network].short}</span>
                  <span className="small pname">{e.time ? `${e.time} ` : ''}{byId.get(e.projectId)?.name ?? 'Reel borrado'}</span>
                  {e.status === 'publicado' ? <span aria-label="publicado">✓</span> : null}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {sel && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="modal card col" role="dialog" aria-modal="true" aria-label="Publicación programada" style={{ maxWidth: 440, gap: 12 }}>
            <h2 style={{ fontSize: 20 }}>{byId.get(sel.projectId)?.name ?? 'Reel borrado'}</h2>
            <span className="small muted">{byId.get(sel.projectId)?.client}</span>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 1 }}>Día<input type="date" value={sel.date} onChange={(e) => call('PUT', { date: e.target.value }, sel.id)} /></label>
              <label className="field" style={{ flex: 1 }}>Hora<input type="time" value={sel.time ?? ''} onChange={(e) => call('PUT', { time: e.target.value }, sel.id)} /></label>
            </div>
            <label className="field">Red
              <select value={sel.network} onChange={(e) => call('PUT', { network: e.target.value }, sel.id)}>
                {(Object.keys(NET) as Network[]).map((n) => <option key={n} value={n}>{NET[n].label}</option>)}
              </select>
            </label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {byId.has(sel.projectId) && <a className="btn rect" href={`#/editor?p=${encodeURIComponent(sel.projectId)}`}>Abrir en el editor</a>}
              {byId.has(sel.projectId) && <button className="btn rect" onClick={() => copyText(sel.projectId)}>Copiar texto para publicar</button>}
              <button className={`btn ${sel.status === 'publicado' ? 'rect' : 'primary'}`} onClick={() => call('PUT', { status: sel.status === 'publicado' ? 'planificado' : 'publicado' }, sel.id)}>{sel.status === 'publicado' ? 'Marcar como pendiente' : 'Marcar como publicado'}</button>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost" onClick={async () => { if (await call('DELETE', undefined, sel.id)) { setOpen(null); ctx.toast('Quitado del calendario.'); } }}>Quitar del calendario</button>
              <button className="btn" onClick={() => setOpen(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
