import React, { useEffect, useMemo, useState } from 'react';
import type { Ctx } from '../App.tsx';
import { Icon } from '../Icon.tsx';
import { api, waitJob, type Job } from '../useProject.ts';

type Shot = { id: string; start: number; end: number; file?: string; tag?: string; tagAuto?: boolean; nombre?: string };

/**
 * Tomas: qué se ve en cada toma del montaje. La app lo adivina con su modelo de visión; aquí se
 * corrige a mano (o se escribe una etiqueta propia) y se vuelve a sincronizar la imagen con la voz.
 */
export const Tomas: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const pid = encodeURIComponent(project.id);
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [names, setNames] = useState<{ value: string; label: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('');
  const [custom, setCustom] = useState<Record<string, string>>({});

  const load = () => api<Shot[]>(`/api/tomas?id=${pid}`).then(setShots).catch((e) => { setShots([]); ctx.toast(e.message); });
  useEffect(() => {
    void load();
    api<{ value: string; label: string }[]>(`/api/tomas/etiquetas?id=${pid}`).then(setNames).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  // Etiquetas propias que ya usa el proyecto (además de las de la lista).
  const options = useMemo(() => {
    const known = new Set(names.map((n) => n.value));
    const own = [...new Set((shots ?? []).map((s) => s.tag).filter((t): t is string => Boolean(t) && !known.has(t!)))];
    return [...names, ...own.map((t) => ({ value: t, label: t }))];
  }, [names, shots]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shots ?? []) m.set(s.tag ?? '', (m.get(s.tag ?? '') ?? 0) + 1);
    return m;
  }, [shots]);

  const op = (body: object) => api<Job>(`/api/op?id=${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const setTag = async (s: Shot, tag: string | null) => {
    try {
      const list = await api<Shot[]>(`/api/tomas?id=${pid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toma: s.id, etiqueta: tag }) });
      setShots(list.map((x) => ({ ...x, nombre: options.find((o) => o.value === x.tag)?.label ?? x.tag })));
    } catch (e: any) { ctx.toast(e.message); }
  };
  const run = async (body: object, label: string, done: (j: Job) => string) => {
    setBusy(label);
    try {
      const j = await waitJob(await op(body), (x) => setBusy(x.message));
      await load();
      if ((body as { op: string }).op === 'sincronizar') { const d = await api(`/api/project?id=${pid}`); store.replace(d.project); }
      ctx.toast(done(j));
    } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); }
  };

  if (project.kind !== 'montaje') {
    return <div className="card" style={{ maxWidth: 620, margin: '24px auto' }}>Las tomas son para montajes (videos de varias tomas sin alguien hablando a cámara). Este video es hablado: se edita por lo que se dice.</div>;
  }
  const shown = (shots ?? []).filter((s) => !filter || (filter === '__sin' ? !s.tag : s.tag === filter));
  const hasVoice = Boolean(project.audio.voiceover);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '18px 16px 60px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0 }}>Tomas</h2>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          Qué se ve en cada toma. La app lo adivina sola; si se equivocó, corrígelo aquí. {hasVoice ? 'Con eso, cuando la voz nombra algo, sale la toma correcta.' : 'Pon una voz en off (en Audio o con un Guion) para que la imagen siga lo que dice.'}
        </p>
      </div>

      <div className="row" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg)', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
        <button className="btn primary" disabled={!hasVoice || Boolean(busy)} title={hasVoice ? 'Pone en pantalla lo que la voz nombra, con estas etiquetas' : 'Primero pon una voz en off'}
          onClick={() => run({ op: 'sincronizar' }, 'Sincronizando…', (j) => j.result?.secciones ? `Sincronizado: ${(j.result.detalle as string[]).join(', ')}.` : 'La voz no nombra nada de lo que hay en las tomas.')}>
          <Icon name="refresh" /> Sincronizar imagen con la voz
        </button>
        <button className="btn rect" disabled={Boolean(busy)} title="Vuelve a mirar las tomas con la IA (las que corregiste no se tocan)"
          onClick={() => run({ op: 'tomas-ia' }, 'Mirando las tomas…', (j) => `Listo: ${j.result?.etiquetadas ?? 0} de ${j.result?.tomas ?? 0} tomas con etiqueta.`)}>
          <Icon name="eye" /> Volver a mirarlas con la IA
        </button>
        <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Mostrar solo">
          <option value="">Todas ({shots?.length ?? 0})</option>
          {options.filter((o) => counts.get(o.value)).map((o) => <option key={o.value} value={o.value}>{o.label} ({counts.get(o.value)})</option>)}
          {counts.get('') ? <option value="__sin">Sin etiqueta ({counts.get('')})</option> : null}
        </select>
        {busy && <span className="small muted" role="status">{busy}</span>}
      </div>

      {shots === null ? <span className="muted">Cargando las tomas…</span> : !shots.length ? <span className="muted">No hay tomas detectadas en este proyecto.</span> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {shown.map((s) => {
            const mid = (s.start + s.end) / 2;
            const listed = options.some((o) => o.value === s.tag);
            return (
              <div key={s.id} className="card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="frame" style={{ backgroundImage: `url(/api/thumb?id=${pid}&t=${mid.toFixed(2)})`, borderRadius: 8 }} role="img" aria-label={`Toma ${s.id.slice(1)}`} />
                <div className="row small" style={{ justifyContent: 'space-between' }}>
                  <strong>Toma {s.id.slice(1)}</strong>
                  <span className="muted">{(s.end - s.start).toFixed(1)} s</span>
                </div>
                <select value={listed ? s.tag : s.tag ? '__propia' : ''} onChange={(e) => { const v = e.target.value; if (v === '__nueva') setCustom({ ...custom, [s.id]: '' }); else void setTag(s, v || null); }} aria-label={`Qué se ve en la toma ${s.id.slice(1)}`}>
                  <option value="">Sin etiqueta</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {!listed && s.tag ? <option value="__propia">{s.tag}</option> : null}
                  <option value="__nueva">Escribir otra…</option>
                </select>
                {custom[s.id] !== undefined && (
                  <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); const v = custom[s.id].trim(); if (v) void setTag(s, v); const { [s.id]: _, ...rest } = custom; setCustom(rest); }}>
                    <input className="input" autoFocus style={{ minWidth: 0, flex: 1, minHeight: 32 }} placeholder="Ej.: pizza, fachada" value={custom[s.id]} onChange={(e) => setCustom({ ...custom, [s.id]: e.target.value })} />
                    <button className="btn small" type="submit" aria-label="Guardar etiqueta"><Icon name="check" /></button>
                  </form>
                )}
                <span className="small muted">{s.tag ? (s.tagAuto ? 'La puso la IA' : 'Corregida a mano') : s.tagAuto ? 'La IA no supo qué es' : 'Sin mirar'}</span>
              </div>
            );
          })}
        </div>
      )}
      <span className="small muted">Una etiqueta propia («pizza», «fachada») se reconoce en la voz por esa misma palabra.</span>
    </div>
  );
};
