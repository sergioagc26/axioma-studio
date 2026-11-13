import React, { useEffect, useMemo, useRef, useState } from 'react';
import { publishPack, publishText } from '@axioma/schema';
import { Icon } from '../Icon.tsx';
import type { Ctx } from '../App.tsx';
import { api, syncResults } from '../useProject.ts';
import { CuentasPanel, PublicarBox } from '../Cuentas.tsx';

type Network = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'linkedin';
interface Entry { id: string; projectId: string; date: string; time?: string; network: Network; status: 'planificado' | 'publicado'; note?: string; metrics?: Metrics; remote?: Remote }
interface Metrics { views: number; likes?: number; comments?: number; shares?: number; saves?: number; at?: string; source?: 'api' | 'manual' }
/** Lo que pasó al publicar desde la app (lo anota el servidor; aquí solo se lee). */
interface Remote { state: 'subiendo' | 'procesando' | 'publicado' | 'error'; id?: string; url?: string; error?: string }
interface Insights { client: string; reels: number; medianViews: number; engagement: number; findings: { label: string; text: string }[]; applied: string[]; note?: string }
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

/** Calendario de publicación: qué reel sale qué día y en qué red. Nada se publica solo: en Instagram se publica desde aquí, siempre con confirmación. */
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
  const [adding, setAdding] = useState(false);
  const add = async () => {
    if (adding) return;
    setAdding(true);
    try {
      if (await call('POST', form)) {
        ctx.toast(`Programado: ${byId.get(form.projectId)?.name ?? 'video'} · ${NET[form.network].label} · ${form.date}${form.time ? ` ${form.time}` : ''}.`);
        // Se muestra el mes donde quedó, para verlo en el calendario.
        const [y, m] = form.date.split('-').map(Number);
        if (y && m) setMonth(new Date(y, m - 1, 1));
      }
    } finally { setAdding(false); }
  };
  // El «+» de un día lleva al formulario con ese día ya puesto, y se nota.
  const formRef = useRef<HTMLElement>(null);
  const reelRef = useRef<HTMLSelectElement>(null);
  const [flash, setFlash] = useState(false);
  const pickDay = (key: string, d: Date) => {
    setForm((f) => ({ ...f, date: key }));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    reelRef.current?.focus({ preventScroll: true });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1400);
    ctx.toast(`Día ${d.getDate()} elegido: elige el video y pulsa «Programar».`);
  };
  const copyText = async (projectId: string) => {
    try {
      const d = await api<any>(`/api/project?id=${encodeURIComponent(projectId)}`);
      await navigator.clipboard.writeText(publishText(publishPack(d.project, d.transcript, d.kit?.sector)));
      ctx.toast('Texto para publicar copiado.');
    } catch { ctx.toast('No se pudo copiar el texto.'); }
  };
  const sel = (entries ?? []).find((e) => e.id === open) ?? null;
  const clients = useMemo(() => [...new Set(items.map((i) => i.client))].sort(), [items]);
  // Nombres repetidos dentro de un cliente: se distinguen con un número.
  const groups = useMemo(() => clients.map((c) => {
    const list = items.filter((i) => i.client === c);
    const seen = new Map<string, number>();
    return { client: c, list: list.map((i) => { const n = (seen.get(i.name) ?? 0) + 1; seen.set(i.name, n); return { ...i, label: list.filter((x) => x.name === i.name).length > 1 ? `${i.name} (${n})` : i.name }; }) };
  }), [clients, items]);
  const [client, setClient] = useState('');
  const [insights, setInsights] = useState<Insights | null>(null);
  const [nums, setNums] = useState<Record<string, string>>({});
  useEffect(() => { if (!client && clients.length) setClient(clients.includes('personal') ? 'personal' : clients[0]); }, [clients]);
  useEffect(() => {
    if (!client) return;
    // La consulta no trae lo aplicado (solo lo da el guardado): se conserva lo último que se vio de ese cliente.
    api<Insights>(`/api/resultados?cliente=${encodeURIComponent(client)}`)
      .then((i) => setInsights((prev) => ({ ...i, applied: i.applied.length ? i.applied : prev?.client === i.client ? prev.applied : [] })))
      .catch(() => setInsights(null));
  }, [client, entries]);
  useEffect(() => {
    const m = sel?.metrics;
    setNums(m ? Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'at' && k !== 'source').map(([k, v]) => [k, String(v ?? '')])) : {});
  }, [sel?.id, sel?.metrics?.at]);
  // Publicar en Instagram desde la publicación abierta, y traer sus cifras reales.
  const [publicar, setPublicar] = useState(false);
  const [cuentasOpen, setCuentasOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const reload = () => api<Entry[]>('/api/calendario').then(setEntries).catch((e) => ctx.toast(e.message));
  const fetchResults = async () => {
    if (!sel) return;
    setSyncing(true);
    try {
      const r = (await syncResults({ entrada: sel.id }, () => {})).result as { actualizadas: number; errores: string[] };
      await reload();
      ctx.toast(r.errores[0] ?? (r.actualizadas ? 'Cifras actualizadas.' : 'Instagram todavía no tiene cifras de este reel (pueden tardar hasta 48 h).'));
    } catch (e: any) { ctx.toast(e.message); } finally { setSyncing(false); }
  };
  const canPublish = Boolean(sel && sel.network === 'instagram' && byId.has(sel.projectId) && sel.remote?.state !== 'publicado');
  const saveResults = async () => {
    if (!sel || !(Number(nums.views) > 0)) return ctx.toast('Pon al menos las vistas.');
    if (!(await call('PUT', { metrics: nums }, sel.id))) return;
    const c = byId.get(sel.projectId)?.client;
    try {
      const i = await api<Insights>(`/api/resultados${c ? `?cliente=${encodeURIComponent(c)}` : ''}`, { method: 'POST' });
      if (c) setClient(c);
      setInsights(i);
      ctx.toast(i.applied.length ? `Resultados guardados. Aprendido: ${i.applied.join(' · ')}.` : 'Resultados guardados.');
    } catch { ctx.toast('Resultados guardados.'); }
  };
  const FIELDS: [keyof Metrics, string][] = [['views', 'Vistas'], ['likes', 'Me gusta'], ['comments', 'Comentarios'], ['shares', 'Compartidos'], ['saves', 'Guardados']];
  const pending = (entries ?? []).filter((e) => e.status === 'planificado' && e.date >= today).length;

  return (
    <main className="page" style={{ maxWidth: 1180, width: '100%', margin: '0 auto' }}>
      <a href="#/proyectos" className="small muted row" style={{ textDecoration: 'none', gap: 4, alignSelf: 'flex-start' }}><Icon name="back" size={13} />Proyectos</a>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 26 }}>Calendario de publicación</h1>
        <span className="small muted">{pending} por publicar · nada se publica solo: en Instagram publicas tú desde aquí</span>
      </div>

      <section ref={formRef} className="card row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', transition: 'box-shadow .3s', boxShadow: flash ? '0 0 0 3px var(--pink)' : undefined }} aria-label="Programar una publicación">
        <label className="field" style={{ flex: '2 1 240px' }}>Video
          <select ref={reelRef} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
            {groups.map((g) => (
              <optgroup key={g.client} label={g.client}>
                {g.list.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
              </optgroup>
            ))}
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
        <button className="btn primary" disabled={!form.projectId || adding} onClick={add}>{adding ? 'Programando…' : 'Programar'}</button>
      </section>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <button className="btn rect" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mes anterior"><Icon name="prev" /></button>
        <strong style={{ fontSize: 18 }}>{(() => { const m = month.toLocaleDateString('es', { month: 'long', year: 'numeric' }); return m.charAt(0).toUpperCase() + m.slice(1); })()}</strong>
        <button className="btn rect" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mes siguiente"><Icon name="next" /></button>
      </div>

      <div className="cal" role="grid" aria-label="Calendario del mes">
        {DAYS.map((d) => <div key={d} className="cal-head" role="columnheader">{d}</div>)}
        {cells.map((d) => {
          const key = iso(d);
          return (
            <div key={key} role="gridcell" className={`cal-day ${inMonth(d) ? '' : 'out'} ${key === today ? 'today' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small" style={{ fontWeight: 600 }}>{d.getDate()}</span>
                {inMonth(d) && <button className="cal-add" aria-label={`Programar el ${d.getDate()}`} title="Programar este día" onClick={() => pickDay(key, d)}><Icon name="plus" size={14} /></button>}
              </div>
              {dayEntries(key).map((e) => (
                <button key={e.id} className={`cal-chip ${e.status}`} style={{ borderLeftColor: NET[e.network].color }} onClick={() => setOpen(e.id)} title={`${NET[e.network].label}${e.time ? ` · ${e.time}` : ''} · ${byId.get(e.projectId)?.name ?? 'reel borrado'}`}>
                  <span aria-label={NET[e.network].label} style={{ display: 'inline-flex', color: NET[e.network].color }}><Icon name={e.network} size={13} /></span>
                  <span className="small pname">{e.time ? `${e.time} ` : ''}{byId.get(e.projectId)?.name ?? 'Reel borrado'}</span>
                  {e.status === 'publicado' ? <span aria-label="publicado"><Icon name="check" size={13} /></span>
                    : e.remote?.state === 'error' ? <span aria-label="no se pudo publicar"><Icon name="warning" size={13} /></span>
                    : e.remote && e.remote.state !== 'publicado' ? <span aria-label="publicándose"><Icon name="clock" size={13} /></span> : null}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <section className="card col" style={{ gap: 10 }} aria-label="Lo que funciona">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 18 }}><Icon name="chart" style={{ marginRight: 8 }} />Lo que funciona</h2>
          {clients.length > 1 && (
            <select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente">
              {clients.map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
        </div>
        <span className="small muted">Las cifras de lo que publicas en Instagram desde la app se traen solas. De lo demás, abre el reel aquí y pon sus vistas y su interacción. Con 4 o más videos de un cliente, la app compara qué le va mejor. Lo que aplica sola en sus próximos videos es el diseño de subtítulos y el estilo de los textos que mejor funcionaron; la hora y el día son solo una sugerencia para que programes.</span>
        {insights && (
          <>
            {insights.reels >= 4 && <span className="small">{insights.reels} reels con cifras · vistas típicas <strong>{insights.medianViews.toLocaleString('es')}</strong> · interacción <strong>{String(insights.engagement).replace('.', ',')} %</strong></span>}
            {insights.findings.map((f) => <span key={f.label} className="row" style={{ gap: 6, alignItems: 'baseline', flexWrap: 'nowrap' }}><Icon name="bulb" size={14} style={{ flex: 'none' }} />{f.text}</span>)}
            {insights.applied.some((a) => !a.startsWith('Publicar')) && <span className="small" style={{ color: 'var(--accent, #25F4EE)' }}>Se aplica solo en sus próximos videos: {insights.applied.filter((a) => !a.startsWith('Publicar')).join(' · ')}.</span>}
            {insights.applied.some((a) => a.startsWith('Publicar')) && <span className="small muted">Sugerencia para programar: {insights.applied.filter((a) => a.startsWith('Publicar')).join(' · ').toLowerCase()}.</span>}
            {insights.note && <span className="small muted">{insights.note}</span>}
          </>
        )}
      </section>

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
            {sel.remote?.state === 'publicado' && (
              <span><Icon name="check" style={{ marginRight: 6 }} />Publicado en Instagram desde la app{sel.remote.url?.startsWith('https://') ? <> · <a href={sel.remote.url} target="_blank" rel="noreferrer">Ver <Icon name="open" size={12} /></a></> : null}</span>
            )}
            {canPublish && (
              <div className="col" style={{ gap: 6 }}>
                {sel.remote?.state === 'error' && <span className="small" style={{ color: 'var(--pinkText)' }}><Icon name="warning" style={{ marginRight: 6 }} />No se publicó: {sel.remote.error ?? 'falló la subida'}</span>}
                {(sel.remote?.state === 'subiendo' || sel.remote?.state === 'procesando') && <span className="small muted"><Icon name="clock" style={{ marginRight: 6 }} />{sel.remote.state === 'subiendo' ? 'Subiendo a Instagram…' : 'Instagram está procesando el video…'}</span>}
                <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => setPublicar(true)}><Icon name="publish" />Publicar en Instagram</button>
              </div>
            )}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {byId.has(sel.projectId) && <a className="btn rect" href={`#/listo?p=${encodeURIComponent(sel.projectId)}`}>Ver el video</a>}
              {byId.has(sel.projectId) && <button className="btn rect" onClick={() => copyText(sel.projectId)}>Copiar texto para publicar</button>}
              <button className={`btn ${sel.status === 'publicado' || canPublish ? 'rect' : 'primary'}`} onClick={() => call('PUT', { status: sel.status === 'publicado' ? 'planificado' : 'publicado' }, sel.id)}>{sel.status === 'publicado' ? 'Marcar como pendiente' : 'Marcar como publicado'}</button>
            </div>
            <details className="grp" open={sel.status === 'publicado'}>
              <summary><Icon name="chart" style={{ marginRight: 6 }} />Resultados {sel.metrics ? `· ${sel.metrics.views.toLocaleString('es')} vistas` : ''}</summary>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {FIELDS.map(([k, label]) => (
                  <label key={k} className="field" style={{ flex: '1 1 110px' }}>{label}
                    <input type="number" min={0} inputMode="numeric" value={nums[k] ?? ''} onChange={(e) => setNums({ ...nums, [k]: e.target.value })} />
                  </label>
                ))}
              </div>
              <div className="row" style={{ margin: '8px 0 10px' }}>
                <button className="btn primary" onClick={saveResults}>Guardar resultados</button>
                {sel.network === 'instagram' && sel.remote?.id && <button className="btn rect" disabled={syncing} onClick={fetchResults} title="Trae de Instagram las cifras reales de este reel"><Icon name="refresh" />{syncing ? 'Trayendo…' : 'Traer cifras'}</button>}
                {sel.metrics?.source === 'api' && sel.metrics.at && <span className="small muted">Traídas de Instagram el {new Date(sel.metrics.at).toLocaleDateString('es', { day: 'numeric', month: 'long' })}.</span>}
              </div>
            </details>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn ghost" onClick={async () => {
                const extra = sel.metrics ? `\n\nTambién se borran sus resultados (${sel.metrics.views.toLocaleString('es')} vistas) y dejan de contar en «Lo que funciona».` : '';
                const ig = sel.remote?.id ? '\n\nEn Instagram no se borra nada.' : '';
                if (sel.metrics && !window.confirm(`¿Quitar esta publicación del calendario?${extra}${ig}\n\nNo se puede deshacer. El proyecto y el video no se tocan.`)) return;
                if (await call('DELETE', undefined, sel.id)) { setOpen(null); ctx.toast('Quitado del calendario.'); }
              }}><Icon name="trash" />Quitar del calendario</button>
              <button className="btn" onClick={() => setOpen(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
      {sel && publicar && <PublicarBox projectId={sel.projectId} red="instagram" entrada={sel.id} onClose={() => setPublicar(false)} onCuentas={() => setCuentasOpen(true)} onChange={reload} toast={ctx.toast} />}
      {cuentasOpen && <CuentasPanel onClose={() => setCuentasOpen(false)} toast={ctx.toast} />}
    </main>
  );
};
