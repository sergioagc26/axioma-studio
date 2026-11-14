import React, { useEffect, useRef, useState } from 'react';
import { FONT_FAMILIES } from '@axioma/schema';
import type { Ctx } from '../App.tsx';
import { api, waitJob, type Job } from '../useProject.ts';
import { Icon } from '../Icon.tsx';
import { Dictar } from '../Dictar.tsx';
import { IgSesion } from '../IgSesion.tsx';

/** Barra de avance: real si el servidor da el avance; si no, se mueve sin prometer un porcentaje. */
export const ProgressBar: React.FC<{ progress?: number }> = ({ progress }) => {
  const real = typeof progress === 'number' && progress > 0;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={real ? Math.round(progress! * 100) : undefined}>
      {real ? <div style={{ width: `${Math.max(4, Math.min(100, Math.round(progress! * 100)))}%` }} />
        : <div style={{ width: '100%', background: 'linear-gradient(90deg, var(--panel2) 0%, var(--pink) 50%, var(--panel2) 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite linear' }} />}
    </div>
  );
};

interface Report {
  captions: { y: number; color: string; highlight: string | null; box: boolean; rate: number; wordsPerLine: number } | null;
  look: string; flashes: boolean;
  id: string; name: string; client: string; duration: number; cuts: number[]; avgShot: number; bpm: number | null;
  palette: string[]; frames: string[];
  typography?: { fontFamily: string; uppercase: boolean; style: string } | null;
  suggested: { maxPause: number; punchZoomEvery: number; highlightColor: string; ritmo: string };
  source?: { url: string; platform: string; author?: string; caption?: string; views?: number; likes?: number; comments?: number; date?: string };
  wish?: string;
  copy?: Copy;
  transcript?: string;
  visual?: string;
  understanding?: { tema: string; formato: string; gancho: string; estructura: { segundo: number; parte: string; que: string }[]; porQueFunciona: string[]; sugerencias: string[]; paraTuVideo: string[] };
}
type Copy = { ritmo: boolean; subtitulos: boolean; color: boolean; musica: boolean; transiciones: boolean; estructura: boolean };
const COPY_LABEL: [keyof Copy, string][] = [['ritmo', 'Ritmo de cortes'], ['subtitulos', 'Subtítulos y letra'], ['color', 'Color'], ['musica', 'Tipo de música'], ['transiciones', 'Transiciones y efectos'], ['estructura', 'Estructura (para el guion)']];
const fmt = (n?: number) => (n == null ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} mil` : String(n));
const isProfile = (u: string) => /instagram\.com\/(?!reel|reels|p\/|tv\/|stories)[^/?#]+\/?(\?|$)|tiktok\.com\/@[^/?#]+\/?(\?|$)|youtube\.com\/@[^/?#]+(\/(shorts|videos))?\/?(\?|$)/i.test(u.trim());

const RITMO: Record<string, string> = { rapido: 'Rápido', 'con-ritmo': 'Con ritmo', sobrio: 'Sobrio' };

export const Referencias: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const pid = encodeURIComponent(project.id);
  const [list, setList] = useState<Report[]>([]);
  const [cur, setCur] = useState<Report | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState({ font: false, uppercase: false });
  // Nueva referencia: link (o archivo) y lo que el cliente quiere de ella, escrito o dictado.
  const [link, setLink] = useState('');
  const [wish, setWish] = useState('');
  const [cuantos, setCuantos] = useState(5);
  const [form, setForm] = useState({
    name: '', ritmo: true, color: true, fuente: true, font: 'Montserrat', mode: 'word', uppercase: true, words: 3, useKit: false,
  });

  useEffect(() => {
    api<Report[]>(`/api/references?id=${pid}`).then((l) => { setList(l); setCur((c) => c ?? l[0] ?? null); }).catch((e) => ctx.toast(e.message));
  }, [project.id]);
  // Al cambiar de referencia, los ajustes vuelven a los de esa referencia (no se arrastran de la anterior).
  useEffect(() => {
    if (!cur) return;
    setTouched({ font: false, uppercase: false });
    setForm((f) => ({ ...f, name: `Estilo ${cur.name}`, font: cur.typography?.fontFamily ?? 'Montserrat', uppercase: cur.typography?.uppercase ?? true }));
  }, [cur?.id]);
  // Si se le cambia el nombre, el del estilo lo sigue.
  useEffect(() => { if (cur) setForm((f) => ({ ...f, name: `Estilo ${cur.name}` })); }, [cur?.name]);
  // Tras guardar y aplicar, se ofrece editar el video con este estilo.
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState('');
  useEffect(() => { setReady(false); }, [cur?.id]);

  const upload = async (file: File) => {
    // Se le pone nombre al subirla (si no, quedaría con el nombre del archivo).
    const base = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
    const nombre = (window.prompt('¿Cómo llamamos a esta referencia?', base) ?? '').trim() || base;
    try {
      setJob({ id: '', status: 'running', message: 'Subiendo la referencia…', progress: 0 });
      const started = await api<Job>(`/api/references?id=${pid}&filename=${encodeURIComponent(file.name)}&nombre=${encodeURIComponent(nombre)}&pedido=${encodeURIComponent(wish.trim())}`, { method: 'POST', body: file });
      const done = await waitJob(started, setJob);
      const report = done.result!.report as Report;
      setList((l) => [report, ...l]);
      setCur(report);
      setWish('');
    } catch (e: any) { ctx.toast(`No se pudo analizar: ${e.message}`); } finally { setJob(null); }
  };
  /** Referencia desde un link (o los últimos videos de un perfil): la app los baja y los analiza. */
  const fromLink = async () => {
    const url = link.trim();
    if (!/^https?:\/\//i.test(url)) return ctx.toast('Pega un link completo, que empiece por https://');
    try {
      setJob({ id: '', status: 'running', message: 'Empezando…', progress: 0 });
      const started = await api<Job>(`/api/references/link?id=${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, wish: wish.trim(), cuantos }) });
      const done = await waitJob(started, setJob);
      const reports = (done.result!.reports ?? [done.result!.report]) as Report[];
      setList((l) => [...reports, ...l.filter((x) => !reports.some((r) => r.id === x.id))]);
      setCur(reports[0]);
      setLink(''); setWish('');
      const failed = (done.result!.failed ?? []) as string[];
      ctx.toast(reports.length > 1 ? `Analicé ${reports.length} videos del perfil.${failed.length ? ` ${failed.length} no se pudieron bajar.` : ''}` : 'Referencia analizada.');
    } catch (e: any) { ctx.toast(e.message); } finally { setJob(null); }
  };
  /** Cambia lo que se quiere de la referencia ya analizada (y qué se copia). */
  const saveWish = async (patch: { wish?: string; copy?: Partial<Copy> }) => {
    if (!cur) return;
    try {
      const r = await api<Report>(`/api/references/pedido?id=${pid}&ref=${encodeURIComponent(cur.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      setCur(r); setList((l) => l.map((x) => (x.id === r.id ? r : x)));
    } catch (e: any) { ctx.toast(e.message); }
  };

  const rename = async (r: Report, name: string) => {
    try {
      const l = await api<Report[]>(`/api/references?id=${pid}&ref=${encodeURIComponent(r.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      setList(l);
      setCur((c) => (c ? l.find((x) => x.id === c.id) ?? null : c));
    } catch (e: any) { ctx.toast(e.message); }
  };
  const remove = async (r: Report) => {
    if (!window.confirm(`¿Quitar la referencia «${r.name}»?\n\nDeja de aparecer aquí y en el brief de todos los videos de este cliente, y se quitan los estilos guardados con ella. No se puede deshacer desde la app.`)) return;
    try {
      const l = await api<Report[]>(`/api/references?id=${pid}&ref=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      setList(l);
      setCur((c) => (c?.id === r.id ? l[0] ?? null : c));
      // El servidor ya la quitó del brief; aquí se refleja para que un guardado no la vuelva a poner.
      if (store.project?.brief.referencia === r.id) store.update((p) => { p.brief.referencia = 'ninguna'; });
      await store.reloadExtras().catch(() => {});
      ctx.toast(`«${r.name}» quitada.`);
    } catch (e: any) { ctx.toast(e.message); }
  };

  /** Un solo paso: guarda todo el estilo detectado y lo aplica al video (queda elegida en el brief). */
  const save = async (aplicar: boolean) => {
    if (!cur) return;
    try {
      const d = await api(`/api/op?id=${pid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'guardar-referencia', refId: cur.id, name: form.name, aplicar,
          // Solo se envía lo que el usuario cambió a mano en «Ajustar».
          captions: { ...(touched.font ? { fontFamily: form.font } : {}), ...(touched.uppercase ? { uppercase: form.uppercase } : {}), ...(form.useKit ? { highlightColor: project.captions.highlightColor } : {}) },
        }),
      });
      store.setPresets(d.presets);
      if (aplicar) {
        store.replace(d.project);
        // El servidor la deja elegida en el brief; si no llegara así, se elige aquí.
        if (d.project?.brief?.referencia !== cur.id) store.update((p) => { p.brief.referencia = cur.id; });
      }
      ctx.toast(aplicar ? `Estilo «${d.preset.name}» guardado y elegido para este video.` : `Estilo «${d.preset.name}» guardado.`);
      if (aplicar) setReady(true);
    } catch (e: any) { ctx.toast(e.message); }
  };
  /** Edita el video con la referencia elegida y lleva a Resultado, donde se exporta solo. */
  const editNow = async () => {
    if (editing) return;
    if (project.briefAppliedAt && !window.confirm('Se vuelve a editar el video desde cero con este estilo: los cortes, textos y subtítulos que cambiaste a mano se reemplazan.\n\nSi luego prefieres la versión anterior, pulsa Deshacer.')) return;
    setEditing('Empezando…');
    try {
      // Antes de editar, se espera a que se guarde lo último (el guardado sale con un pequeño retraso).
      (document.activeElement as HTMLElement | null)?.blur?.();
      await store.flush();
      const running = await api<(Job & { kind?: string })[]>(`/api/jobs?id=${pid}`).catch(() => []);
      const act = Array.isArray(running) ? running.find((j) => j.status === 'running' && j.kind === 'crear') : undefined;
      const job = act ?? await api<Job>(`/api/op?id=${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'aplicar-brief' }) });
      await waitJob(job, (j) => setEditing(j.message || 'Editando tu video…'));
      const d = await api(`/api/project?id=${pid}`);
      store.replace(d.project);
      await store.reloadExtras();
      ctx.go('listo', { s: null });
      void ctx.exportNow();
    } catch (e: any) { ctx.toast(`No se pudo editar el video: ${e.message}`); } finally { setEditing(''); }
  };

  // Duración de cada plano, para dibujar el ritmo.
  const shots = cur ? [...cur.cuts, cur.duration].map((t, i, a) => t - (i ? a[i - 1] : 0)).slice(0, 40) : [];
  const maxShot = Math.max(0.1, ...shots);
  const frameUrl = (f: string) => `/ref/${encodeURIComponent(cur!.client)}/${encodeURIComponent(cur!.id)}/${f}`;

  return (
    <div className="cols">
      <section className="col" style={{ flex: '1 1 230px', maxWidth: 270, gap: 12 }}>
        <h1 style={{ fontSize: 22 }}>Referencia</h1>
        {cur ? <div className="frame" style={{ borderRadius: 14, backgroundImage: `url(${frameUrl(cur.frames[Math.floor(cur.frames.length / 2)])})` }} />
          : (
            <button className={`frame drop-ref ${dragOver ? 'over' : ''}`} style={{ borderRadius: 14, display: 'grid', placeItems: 'center', border: '2px dashed var(--line)', background: 'transparent', cursor: 'pointer' }}
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}>
              <span className="col" style={{ alignItems: 'center', gap: 6, padding: 12 }}>
                <strong>{dragOver ? 'Suelta el video' : 'Arrastra aquí un reel'}</strong>
                <span className="muted small">o haz clic para elegirlo</span>
              </span>
            </button>
          )}
        {job ? (
          <div className="col" role="status"><strong>{job.message}</strong><ProgressBar progress={job.progress} /></div>
        ) : (
          <div className="col" style={{ gap: 8 }}>
            <label className="field">¿Qué quieres de esta referencia? (opcional)
              <textarea rows={3} value={wish} onChange={(e) => setWish(e.target.value)} placeholder="Ej.: me gusta cómo engancha al inicio y los subtítulos; el color no." />
            </label>
            <Dictar toast={ctx.toast} onText={(t) => setWish((w) => (w.trim() ? `${w.trim()} ${t}` : t))} />
            <label className="field">Link de un reel, TikTok o Short
              <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void fromLink(); }} placeholder="https://www.instagram.com/reel/…" inputMode="url" />
            </label>
            {isProfile(link) && (
              <label className="field">Es un perfil: ¿cuántos de sus últimos videos analizo?
                <select value={cuantos} onChange={(e) => setCuantos(Number(e.target.value))}>{[3, 5, 8].map((n) => <option key={n} value={n}>{n} videos</option>)}</select>
                <span className="small muted">Instagram suele pedir iniciar sesión para ver perfiles; si no deja, pega el link de cada reel.</span>
              </label>
            )}
            {/instagram\.com/i.test(link) && <IgSesion toast={ctx.toast} profileHint={isProfile(link) ? link.trim() : undefined} />}
            <button className="btn primary" disabled={!link.trim()} onClick={fromLink}><Icon name="link" /> {isProfile(link) ? 'Analizar el perfil' : 'Analizar el link'}</button>
            <button className="btn rect" style={{ borderStyle: 'dashed', height: 40 }} onClick={() => input.current?.click()}><Icon name="upload" />{cur ? 'O sube otro video' : 'O sube el video'}</button>
          </div>
        )}
        <input ref={input} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        {list.length > 0 && (
          <div className="col" style={{ gap: 6 }}>
            <span className="small muted" style={{ fontWeight: 600 }}>Tus referencias ({list.length})</span>
            {list.map((r) => (
              <div key={r.id} className={`refrow ${cur?.id === r.id ? 'on' : ''}`}>
                <button className="refrow-pick" onClick={() => setCur(r)} aria-label={`Ver ${r.name}`}>
                  <span className="refrow-thumb" style={{ backgroundImage: `url(${`/ref/${encodeURIComponent(r.client)}/${encodeURIComponent(r.id)}/${r.frames[Math.min(2, r.frames.length - 1)]}`})` }} aria-hidden="true" />
                </button>
                <Icon name="edit" size={14} style={{ flex: 'none', opacity: 0.6 }} />
                <input className="refrow-name" defaultValue={r.name} key={`${r.id}-${r.name}`} aria-label="Nombre de la referencia" title="Toca para cambiarle el nombre"
                  onFocus={() => setCur(r)}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.name) rename(r, v); else e.target.value = r.name; }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                <button className="btn ghost small" onClick={() => remove(r)} aria-label={`Quitar ${r.name}`} title="Quitar esta referencia"><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        )}
        <span className="muted small">La app toma el estilo y entiende de qué trata; nunca copia el contenido. El video se baja solo para analizarlo y no se guarda. También sirve con tus propios reels que mejor funcionaron.</span>
      </section>

      <section className="col" style={{ flex: '999 1 520px', minWidth: 0, gap: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ fontSize: 22 }}>Reporte de estilo</h2>
          {cur && <span className="pill">{cur.name} · {cur.duration.toFixed(1)} s</span>}
        </div>
        {!cur ? (
          <div className="col" style={{ gap: 12 }}>
            <p className="muted" style={{ margin: 0 }}>Sube un video que te guste (tuyo o de otra cuenta) y la app saca su estilo para aplicarlo a tus videos. Suele tardar menos de un minuto; los videos largos o en 4K tardan más:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {([['Ritmo de cortes', 'Cada cuánto cambia de plano: rápido, con ritmo o sobrio.'], ['Música', 'Qué tan rápida es, para cortar al ritmo.'], ['Colores', 'La paleta dominante y el color de resaltado.'], ['Subtítulos', 'Posición, colores, caja y cuántas palabras a la vez.']] as const).map(([t, d]) => (
                <article key={t} className="card col" style={{ gap: 4 }}><strong>{t}</strong><span className="small muted">{d}</span></article>
              ))}
            </div>
            <span className="small muted">Solo se guarda el estilo: el video de referencia no se conserva.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {cur.source && (
              <article className="card col" style={{ gridColumn: '1 / -1', gap: 6 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: 15 }}>La publicación</h3>
                  <a className="small" href={cur.source.url} target="_blank" rel="noreferrer noopener">Abrir en {cur.source.platform}</a>
                </div>
                <span className="small muted">{[cur.source.author, cur.source.date, cur.source.views != null && `${fmt(cur.source.views)} vistas`, cur.source.likes != null && `${fmt(cur.source.likes)} me gusta`, cur.source.comments != null && `${fmt(cur.source.comments)} comentarios`].filter(Boolean).join(' · ')}</span>
                {cur.source.caption && <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 96, overflow: 'auto' }}>{cur.source.caption}</p>}
              </article>
            )}
            {cur.understanding ? (
              <>
                <article className="card col" style={{ gridColumn: '1 / -1', gap: 8 }}>
                  <h3 style={{ fontSize: 15 }}>De qué trata</h3>
                  <p style={{ margin: 0 }}><strong>{cur.understanding.tema}</strong> <span className="muted">· {cur.understanding.formato}</span></p>
                  <p className="small" style={{ margin: 0 }}><strong>Gancho:</strong> {cur.understanding.gancho}</p>
                  {cur.understanding.estructura.length > 0 && (
                    <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
                      {cur.understanding.estructura.map((x, i) => <li key={i}><strong>{x.parte}</strong> <span className="muted">({Math.round(x.segundo)} s)</span>: {x.que}</li>)}
                    </ol>
                  )}
                </article>
                <article className="card col" style={{ gap: 6 }}>
                  <h3 style={{ fontSize: 15 }}>Por qué funciona</h3>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{cur.understanding.porQueFunciona.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </article>
                <article className="card col" style={{ gap: 6 }}>
                  <h3 style={{ fontSize: 15 }}>Sugerencias de optimización</h3>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{cur.understanding.sugerencias.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </article>
                <article className="card col" style={{ gridColumn: '1 / -1', gap: 6, borderColor: 'var(--cyan)' }}>
                  <h3 style={{ fontSize: 15 }}>Ideas para tu video</h3>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{cur.understanding.paraTuVideo.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <span className="small muted">Con esta referencia elegida, la pantalla Guion sigue su forma (no su contenido).</span>
                </article>
              </>
            ) : (
              <article className="card col" style={{ gridColumn: '1 / -1' }}>
                <span className="small muted">{cur.transcript || cur.visual ? '' : 'Esta referencia se analizó antes de que la app entendiera el contenido: vuelve a subirla (o pega su link) para ver de qué trata y las sugerencias. '}{!cur.understanding && (cur.transcript || cur.visual) ? 'La IA local no estaba disponible para entender el video; enciende Ollama y vuelve a analizarla.' : ''}</span>
              </article>
            )}
            <article className="card col">
              <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ fontSize: 15 }}>Ritmo de cortes</h3><span className="small muted">corte cada ~{cur.avgShot.toFixed(1)} s</span></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64 }} role="img" aria-label={`${cur.cuts.length} cortes; duración de cada plano`}>
                {shots.map((d, i) => <div key={i} style={{ flex: 1, height: `${Math.max(8, (d / maxShot) * 100)}%`, borderRadius: 3, background: 'var(--cyan)' }} />)}
              </div>
              <span className="small muted">{cur.cuts.length} cortes · se sugiere ritmo <strong style={{ color: 'var(--text)' }}>{RITMO[cur.suggested.ritmo]}</strong></span>
            </article>
            <article className="card col">
              <h3 style={{ fontSize: 15 }}>Color</h3>
              <div className="row">
                {cur.palette.map((c) => (
                  <div key={c} title={c} style={{ width: 44, height: 44, borderRadius: 10, background: c, border: '1px solid var(--line)' }} />
                ))}
              </div>
              <span className="small muted row" style={{ gap: 6 }}>Color para resaltar palabras: <span title={cur.suggested.highlightColor} style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 5, background: cur.suggested.highlightColor, border: '1px solid var(--line)' }} /></span>
            </article>
            <article className="card col">
              <h3 style={{ fontSize: 15 }}>Música</h3>
              <span style={{ font: "700 26px 'Sora', sans-serif" }}>{!cur.bpm ? 'Sin pulso claro' : cur.bpm >= 120 ? 'Música rápida' : cur.bpm >= 95 ? 'Música media' : 'Música lenta'}</span>
              <span className="small muted">{cur.bpm ? <span className="help">Unos {cur.bpm} golpes por minuto. </span> : 'Con voz hablada sin música no se detecta.'}</span>
            </article>
            <article className="card col">
              <h3 style={{ fontSize: 15 }}>Subtítulos detectados</h3>
              {cur.captions ? (
                <>
                  <div style={{ padding: 12, borderRadius: 10, background: cur.captions.color === '#000000' ? '#EDEDED' : '#18181B', textAlign: 'center', fontFamily: `'${form.font}', sans-serif`, fontWeight: 800, fontSize: 18, color: cur.captions.color, textTransform: form.uppercase ? 'uppercase' : 'none' }}>
                    Así se ve <span style={cur.captions.box ? { background: cur.captions.highlight ?? cur.suggested.highlightColor, color: '#000', borderRadius: 4, padding: '0 4px' } : { color: cur.captions.highlight ?? cur.captions.color }}>el estilo</span>
                  </div>
                  <span className="small muted help">
                    A {Math.round(cur.captions.y * 100)} % de alto · letras {cur.captions.color}
                    {cur.captions.highlight ? ` · resalta en ${cur.captions.highlight}${cur.captions.box ? ' con caja' : ''}` : ' · sin color de resaltado'}
                    {' '}· unas {cur.captions.wordsPerLine} palabra{cur.captions.wordsPerLine > 1 ? 's' : ''} a la vez
                  </span>
                  {cur.typography && <span className="small muted">La IA local vio la letra: <strong style={{ color: 'var(--text)' }}>{cur.typography.fontFamily}</strong>{cur.typography.uppercase ? ' en mayúsculas' : ''} · {cur.typography.style}</span>}
                </>
              ) : <span className="muted">No se encontraron subtítulos en la imagen. Se usarán los del ritmo detectado.</span>}
            </article>
            <article className="card col">
              <h3 style={{ fontSize: 15 }}>Imagen y cortes</h3>
              <span style={{ font: "700 20px 'Sora', sans-serif" }}>{({ normal: 'Color normal', bn: 'Blanco y negro', calido: 'Tonos cálidos', frio: 'Tonos fríos', contraste: 'Alto contraste' } as Record<string, string>)[cur.look] ?? cur.look}</span>
              <span className="small muted help">{cur.flashes ? 'Usa destellos en los cortes: las transiciones serán destellos.' : 'Sin destellos: se pondrán las transiciones que van con el ritmo.'}</span>
            </article>
            <article className="card col" style={{ gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: 15 }}>Fotogramas</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
                {cur.frames.map((f) => <div key={f} className="frame" style={{ backgroundImage: `url(${frameUrl(f)})` }} />)}
              </div>
            </article>
          </div>
        )}
      </section>

      {cur && (
        <aside className="card col" style={{ flex: '1 1 270px', maxWidth: 320, gap: 12, borderRadius: 16 }}>
          <h2 style={{ fontSize: 18 }}>Lo que quieres de ella</h2>
          <textarea className="input" rows={3} key={cur.id} defaultValue={cur.wish ?? ''} placeholder="Escribe o dicta qué te gusta de esta referencia" aria-label="Lo que quieres de esta referencia"
            onBlur={(e) => { if (e.target.value.trim() !== (cur.wish ?? '')) void saveWish({ wish: e.target.value }); }} />
          <Dictar toast={ctx.toast} onText={(t) => void saveWish({ wish: `${cur.wish ? `${cur.wish} ` : ''}${t}` })} />
          <span className="small muted">Se copia:</span>
          <div className="col" style={{ gap: 4 }}>
            {COPY_LABEL.map(([k, label]) => (
              <label key={k} className="row small"><input type="checkbox" checked={cur.copy?.[k] ?? true} onChange={(e) => void saveWish({ copy: { [k]: e.target.checked } })} /> {label}</label>
            ))}
          </div>
          <h2 style={{ fontSize: 18 }}>Guardar este estilo</h2>
          <label className="field">Nombre
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <span className="small muted help">Se guarda todo lo detectado: ritmo de cortes, subtítulos (posición, colores, forma de resaltar), estilo de los textos, imagen, transiciones y efectos de sonido.</span>
          <details className="grp">
            <summary>Ajustar antes de guardar</summary>
            <div className="col">
              <label className="field">Tipografía
                <select value={form.font} onChange={(e) => { setForm({ ...form, font: e.target.value }); setTouched({ ...touched, font: true }); }}>
                  {FONT_FAMILIES.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
              <label className="row"><input type="checkbox" checked={form.uppercase} onChange={(e) => { setForm({ ...form, uppercase: e.target.checked }); setTouched({ ...touched, uppercase: true }); }} /> Mayúsculas</label>
              <label className="row"><input type="checkbox" checked={form.useKit} onChange={(e) => setForm({ ...form, useKit: e.target.checked })} /> Mantener mi color de resaltado actual</label>
              <span className="small muted help">{cur.typography ? 'La tipografía y las mayúsculas las eligió la IA local mirando los fotogramas.' : 'Sin la IA de visión, la tipografía y las mayúsculas se eligen según el ritmo.'} Cámbialas aquí si no coinciden.</span>
            </div>
          </details>
          {ready ? (
            <button className="btn primary" style={{ height: 46 }} disabled={Boolean(editing)} onClick={editNow}>{editing || <><Icon name="sparkle" />Editar mi video con este estilo</>}</button>
          ) : (
            <button className="btn primary" style={{ height: 46 }} onClick={() => save(true)}>Guardar estilo y usarlo en este video</button>
          )}
          <button className="btn" onClick={() => save(false)}>Solo guardar</button>
        </aside>
      )}
    </div>
  );
};
