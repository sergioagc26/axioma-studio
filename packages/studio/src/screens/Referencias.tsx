import React, { useEffect, useRef, useState } from 'react';
import { FONT_FAMILIES } from '@axioma/schema';
import type { Ctx } from '../App.tsx';
import { api, waitJob, type Job } from '../useProject.ts';

interface Report {
  captions: { y: number; color: string; highlight: string | null; box: boolean; rate: number; wordsPerLine: number } | null;
  look: string; flashes: boolean;
  id: string; name: string; client: string; duration: number; cuts: number[]; avgShot: number; bpm: number | null;
  palette: string[]; frames: string[];
  typography?: { fontFamily: string; uppercase: boolean; style: string } | null;
  suggested: { maxPause: number; punchZoomEvery: number; highlightColor: string; ritmo: string };
}

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
  const [form, setForm] = useState({
    name: '', ritmo: true, color: true, fuente: true, font: 'Montserrat', mode: 'word', uppercase: true, words: 3, useKit: false,
  });

  useEffect(() => {
    api<Report[]>(`/api/references?id=${pid}`).then((l) => { setList(l); setCur((c) => c ?? l[0] ?? null); }).catch((e) => ctx.toast(e.message));
  }, [project.id]);
  useEffect(() => { if (cur) setForm((f) => ({ ...f, name: `Estilo ${cur.name}`, ...(cur.typography ? { font: cur.typography.fontFamily, uppercase: cur.typography.uppercase } : {}) })); }, [cur?.id]);

  const upload = async (file: File) => {
    try {
      setJob({ id: '', status: 'running', message: 'Subiendo la referencia…', progress: 0 });
      const started = await api<Job>(`/api/references?id=${pid}&filename=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
      const done = await waitJob(started, setJob);
      const report = done.result!.report as Report;
      setList((l) => [report, ...l]);
      setCur(report);
    } catch (e: any) { ctx.toast(`No se pudo analizar: ${e.message}`); } finally { setJob(null); }
  };

  const rename = async (r: Report, name: string) => {
    try {
      const l = await api<Report[]>(`/api/references?id=${pid}&ref=${encodeURIComponent(r.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      setList(l);
      setCur((c) => (c ? l.find((x) => x.id === c.id) ?? null : c));
    } catch (e: any) { ctx.toast(e.message); }
  };
  const remove = async (r: Report) => {
    if (!window.confirm(`¿Quitar la referencia «${r.name}»?\n\nDeja de aparecer aquí y en el brief. Queda en la papelera por si la necesitas, y los estilos que guardaste con ella siguen funcionando.`)) return;
    try {
      const l = await api<Report[]>(`/api/references?id=${pid}&ref=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      setList(l);
      setCur((c) => (c?.id === r.id ? l[0] ?? null : c));
      ctx.toast(`«${r.name}» quitada.`);
    } catch (e: any) { ctx.toast(e.message); }
  };

  /** Un solo paso: guarda todo el estilo detectado como plantilla y lo aplica al reel. */
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
      if (aplicar) store.replace(d.project);
      ctx.toast(aplicar ? `Estilo «${d.preset.name}» guardado y aplicado: subtítulos, textos, ritmo, transiciones y efectos.` : `Estilo «${d.preset.name}» guardado.`);
      if (aplicar) ctx.go('editor', { s: null });
    } catch (e: any) { ctx.toast(e.message); }
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
          <div className="col"><strong>{job.message}</strong><div className="progress"><div style={{ width: '60%' }} /></div></div>
        ) : (
          <button className="btn rect" style={{ borderStyle: 'dashed', height: 44 }} onClick={() => input.current?.click()}>{cur ? 'Analizar otra referencia' : 'Subir video de referencia'}</button>
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
                <input className="refrow-name" defaultValue={r.name} key={`${r.id}-${r.name}`} aria-label="Nombre de la referencia" title="Toca para cambiarle el nombre"
                  onFocus={() => setCur(r)}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.name) rename(r, v); else e.target.value = r.name; }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                <button className="btn ghost small" onClick={() => remove(r)} aria-label={`Quitar ${r.name}`} title="Quitar esta referencia">Quitar</button>
              </div>
            ))}
          </div>
        )}
        <span className="muted small">La app toma el estilo, nunca el contenido. También sirve con tus propios reels que mejor funcionaron.</span>
      </section>

      <section className="col" style={{ flex: '999 1 520px', minWidth: 0, gap: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ fontSize: 22 }}>Reporte de estilo</h2>
          {cur && <span className="pill">{cur.name} · {cur.duration.toFixed(1)} s</span>}
        </div>
        {!cur ? (
          <div className="col" style={{ gap: 12 }}>
            <p className="muted" style={{ margin: 0 }}>Sube un reel que te guste (tuyo o de otra cuenta) y en 10–30 segundos la app saca su estilo para aplicarlo a tus videos:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {([['Ritmo de cortes', 'Cada cuánto cambia de plano: rápido, con ritmo o sobrio.'], ['Música', 'El tempo aproximado (BPM) para cortar al ritmo.'], ['Colores', 'La paleta dominante y el color de resaltado.'], ['Subtítulos', 'Posición, colores, caja y cuántas palabras a la vez.']] as const).map(([t, d]) => (
                <article key={t} className="card col" style={{ gap: 4 }}><strong>{t}</strong><span className="small muted">{d}</span></article>
              ))}
            </div>
            <span className="small muted">Solo se guarda el estilo: el video de referencia no se conserva.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
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
                  <div key={c} className="col" style={{ alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: c, border: '1px solid var(--line)' }} />
                    <span className="small muted">{c}</span>
                  </div>
                ))}
              </div>
              <span className="small muted">Resaltado sugerido: {cur.suggested.highlightColor}</span>
            </article>
            <article className="card col">
              <h3 style={{ fontSize: 15 }}>Música</h3>
              <span style={{ font: "700 26px 'Space Grotesk', sans-serif" }}>{cur.bpm ? `~${cur.bpm} BPM` : 'Sin pulso claro'}</span>
              <span className="small muted">Tempo aproximado. Con voz hablada sin música no se detecta.</span>
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
              <span style={{ font: "700 20px 'Space Grotesk', sans-serif" }}>{({ normal: 'Color normal', bn: 'Blanco y negro', calido: 'Tonos cálidos', frio: 'Tonos fríos', contraste: 'Alto contraste' } as Record<string, string>)[cur.look] ?? cur.look}</span>
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
          <button className="btn primary" style={{ height: 46 }} onClick={() => save(true)}>Guardar estilo y aplicarlo a este reel</button>
          <button className="btn" onClick={() => save(false)}>Solo guardar</button>
        </aside>
      )}
    </div>
  );
};
