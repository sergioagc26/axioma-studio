import React, { useEffect, useRef, useState } from 'react';
import type { Ctx } from '../App.tsx';
import { api, waitJob, type Job } from '../useProject.ts';

interface Item { id: string; name: string; client: string; approval: string; scenes: number; updatedAt: string }

export const Projects: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const [items, setItems] = useState<Item[] | null>(null);
  const [client, setClient] = useState('');
  const [preset, setPreset] = useState('rapido');
  const [kind, setKind] = useState<'hablado' | 'montaje'>('hablado');
  const [job, setJob] = useState<Job | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { api<Item[]>('/api/projects').then(setItems).catch((e) => ctx.toast(e.message)); }, []);

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
      const started = await api<Job>('/api/montajes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens, client: client.trim(), preset }) });
      const done = await waitJob(started, setJob);
      ctx.go('storyboard', { p: done.result?.id, s: null });
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
    const q = new URLSearchParams({ filename: file.name, preset });
    if (client.trim()) q.set('client', client.trim());
    try {
      setJob({ id: '', status: 'running', message: 'Subiendo el video…', progress: 0 });
      const started = await api<Job>(`/api/projects?${q}`, { method: 'POST', body: file });
      const done = await waitJob(started, setJob);
      ctx.go('brief', { p: done.result?.id, s: null });
    } catch (e: any) {
      ctx.toast(`No se pudo crear: ${e.message}`);
    } finally {
      setJob(null);
    }
  };

  return (
    <main className="page" style={{ maxWidth: 860, width: '100%', margin: '0 auto' }}>
      <h1 style={{ fontSize: 28 }}>Nuevo reel</h1>
      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      >
        {job ? (
          <>
            <strong>{job.message}</strong>
            <div className="progress" style={{ maxWidth: 420 }}><div style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
            <span className="muted small">Transcribir y limpiar el audio tarda de 1 a 5 minutos.</span>
          </>
        ) : (
          <>
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', width: '100%', maxWidth: 420 }}>
              <button className={kind === 'hablado' ? 'on' : ''} aria-pressed={kind === 'hablado'} onClick={() => setKind('hablado')}>Hablando a cámara</button>
              <button className={kind === 'montaje' ? 'on' : ''} aria-pressed={kind === 'montaje'} onClick={() => setKind('montaje')}>Sin voz (montaje)</button>
            </div>
            <strong style={{ fontSize: 16 }}>{kind === 'hablado' ? 'Arrastra aquí tu video hablando a cámara' : 'Arrastra aquí uno o varios videos'}</strong>
            <span className="muted">{kind === 'hablado'
              ? 'La app lo transcribe, quita silencios y tomas repetidas, y arma un primer corte.'
              : 'Para gimnasio, comida o producto: la app detecta las tomas y arma cortes rápidos. Luego puedes ponerle música y voz en off.'}</span>
            <div className="row" style={{ justifyContent: 'center' }}>
              <label className="field">Cliente
                <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="personal" />
              </label>
              <label className="field">Ritmo
                <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                  <option value="rapido">Rápido</option><option value="con-ritmo">Con ritmo</option><option value="sobrio">Sobrio</option>
                </select>
              </label>
            </div>
            <button className="btn primary" onClick={() => input.current?.click()}>{kind === 'montaje' ? 'Elegir videos' : 'Elegir video'}</button>
            <input ref={input} type="file" accept="video/*" multiple={kind === 'montaje'} hidden onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
          </>
        )}
      </div>

      <h2 style={{ fontSize: 20, marginTop: 8 }}>Proyectos</h2>
      <div className="col list">
        {items === null ? <span className="muted">Cargando…</span>
          : items.length === 0 ? <span className="muted">Todavía no hay proyectos.</span>
          : items.map((it) => (
            <a key={it.id} href={`#/storyboard?p=${encodeURIComponent(it.id)}`}>
              <span><strong>{it.name}</strong> <span className="muted">· {it.client}</span></span>
              <span className="row">
                <span className="pill line">{it.scenes} escenas</span>
                <span className="pill">{it.approval.replace('_', ' ')}</span>
                <span className="muted small">{new Date(it.updatedAt).toLocaleDateString('es')}</span>
              </span>
            </a>
          ))}
      </div>
    </main>
  );
};
