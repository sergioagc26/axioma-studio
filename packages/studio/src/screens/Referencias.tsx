import React, { useEffect, useRef, useState } from 'react';
import { FONT_FAMILIES } from '@snz/schema';
import type { Ctx } from '../App.tsx';
import { api, waitJob, type Job } from '../useProject.ts';

interface Report {
  id: string; name: string; client: string; duration: number; cuts: number[]; avgShot: number; bpm: number | null;
  palette: string[]; frames: string[];
  suggested: { maxPause: number; punchZoomEvery: number; highlightColor: string; ritmo: string };
}

const RITMO: Record<string, string> = { rapido: 'Rápido', 'con-ritmo': 'Con ritmo', sobrio: 'Sobrio' };

export const Referencias: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const pid = encodeURIComponent(project.id);
  const [list, setList] = useState<Report[]>([]);
  const [cur, setCur] = useState<Report | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: '', ritmo: true, color: true, fuente: true, font: 'Montserrat', mode: 'word', uppercase: true, words: 3, useKit: false,
  });

  useEffect(() => {
    api<Report[]>(`/api/references?id=${pid}`).then((l) => { setList(l); setCur((c) => c ?? l[0] ?? null); }).catch((e) => ctx.toast(e.message));
  }, [project.id]);
  useEffect(() => { if (cur) setForm((f) => ({ ...f, name: `Estilo ${cur.name}` })); }, [cur?.id]);

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

  const save = async (aplicar: boolean) => {
    if (!cur) return;
    const preset = {
      name: form.name.trim() || `Estilo ${cur.name}`,
      description: `Desde la referencia "${cur.name}": plano medio ${cur.avgShot.toFixed(1)} s.`,
      base: cur.suggested.ritmo,
      pacing: form.ritmo ? { maxPause: cur.suggested.maxPause, punchZoomEvery: cur.suggested.punchZoomEvery } : {},
      captions: {
        mode: form.mode, uppercase: form.uppercase, wordsPerLine: form.words,
        ...(form.fuente ? { fontFamily: form.font } : {}),
        ...(form.color && !form.useKit ? { highlightColor: cur.suggested.highlightColor } : {}),
      },
      palette: cur.palette, reference: cur.id,
    };
    try {
      const d = await api(`/api/op?id=${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'guardar-preset', preset, aplicar }) });
      store.setPresets(d.presets);
      if (aplicar) store.replace(d.project);
      ctx.toast(aplicar ? `Plantilla "${d.preset.name}" guardada y aplicada.` : `Plantilla "${d.preset.name}" guardada.`);
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
          : <div className="frame" style={{ borderRadius: 14, display: 'grid', placeItems: 'center' }}><span className="muted small">Sin referencia</span></div>}
        {job ? (
          <div className="col"><strong>{job.message}</strong><div className="progress"><div style={{ width: '60%' }} /></div></div>
        ) : (
          <button className="btn rect" style={{ borderStyle: 'dashed', height: 44 }} onClick={() => input.current?.click()}>{cur ? 'Analizar otra referencia' : 'Subir video de referencia'}</button>
        )}
        <input ref={input} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        {list.length > 1 && (
          <label className="field">Referencias analizadas
            <select value={cur?.id} onChange={(e) => setCur(list.find((r) => r.id === e.target.value) ?? null)}>
              {list.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        )}
        <span className="muted small">La app toma el estilo, nunca el contenido. También sirve con tus propios reels que mejor funcionaron.</span>
      </section>

      <section className="col" style={{ flex: '999 1 520px', minWidth: 0, gap: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ fontSize: 22 }}>Reporte de estilo</h2>
          {cur && <span className="pill">{cur.name} · {cur.duration.toFixed(1)} s</span>}
        </div>
        {!cur ? <p className="muted">Sube un video que te guste. En 10–30 segundos tendrás su ritmo de cortes, tempo y colores.</p> : (
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
              <h3 style={{ fontSize: 15 }}>Subtítulos y tipografía</h3>
              <span className="small muted">Elige a la derecha lo que ves en los fotogramas, o pídele a Claude: «mira la referencia {cur.id} y dime qué subtítulos usa».</span>
              <div style={{ padding: 12, borderRadius: 10, background: '#18181B', textAlign: 'center', fontFamily: `'${form.font}', sans-serif`, fontWeight: 800, fontSize: 18, color: '#fff', textTransform: form.uppercase ? 'uppercase' : 'none' }}>
                Así se ve <span style={{ color: form.useKit ? project.captions.highlightColor : cur.suggested.highlightColor }}>el estilo</span>
              </div>
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
          <h2 style={{ fontSize: 18 }}>Guardar como plantilla</h2>
          <label className="field">Nombre
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <fieldset className="col" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="small muted" style={{ marginBottom: 6 }}>Qué aplicar</legend>
            <label className="row"><input type="checkbox" checked={form.ritmo} onChange={(e) => setForm({ ...form, ritmo: e.target.checked })} /> Ritmo de cortes</label>
            <label className="row"><input type="checkbox" checked={form.color} onChange={(e) => setForm({ ...form, color: e.target.checked })} /> Color de resaltado</label>
            <label className="row"><input type="checkbox" checked={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.checked })} /> Tipografía</label>
          </fieldset>
          <label className="field">Tipografía más parecida
            <select value={form.font} onChange={(e) => setForm({ ...form, font: e.target.value })}>
              {FONT_FAMILIES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="field">Subtítulos
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="word">Palabra a palabra</option><option value="phrase">Frase completa</option>
            </select>
          </label>
          <label className="field">Palabras por línea
            <input type="number" min={1} max={8} value={form.words} onChange={(e) => setForm({ ...form, words: Math.min(8, Math.max(1, Number(e.target.value) || 3)) })} />
          </label>
          <label className="row"><input type="checkbox" checked={form.uppercase} onChange={(e) => setForm({ ...form, uppercase: e.target.checked })} /> Mayúsculas</label>
          <label className="row" style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--cyanSoft)', flexWrap: 'nowrap' }}>
            <input type="checkbox" checked={form.useKit} onChange={(e) => setForm({ ...form, useKit: e.target.checked })} />
            <span className="small">Mantener los colores actuales en vez de los de la referencia</span>
          </label>
          <button className="btn primary" style={{ height: 46 }} onClick={() => save(true)}>Guardar y aplicar a este reel</button>
          <button className="btn" onClick={() => save(false)}>Solo guardar</button>
        </aside>
      )}
    </div>
  );
};
