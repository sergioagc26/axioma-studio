import React, { useEffect, useState } from 'react';
import { Icon } from './Icon.tsx';
import { api, waitJob, type Job } from './useProject.ts';

type Avatar = { id: string; name: string; description?: string };
type Ref = { id: string; name: string };

/**
 * Reel de creador con un solo pedido: el guion (o la idea), la duración, el avatar y la palabra a
 * comentar. La app hace voz, avatar, escenas, palabras gigantes, objetos, exporta y revisa.
 */
export const ReelCreador: React.FC<{ onClose: () => void; toast: (m: string) => void; clients: string[] }> = ({ onClose, toast, clients }) => {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [guion, setGuion] = useState('');
  const [idea, setIdea] = useState('');
  const [duracion, setDuracion] = useState(60);
  const [avatar, setAvatar] = useState('');
  const [cliente, setCliente] = useState(clients[0] ?? '');
  const [referencia, setReferencia] = useState('');
  const [cta, setCta] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<{ projectId: string; warnings: string[] } | null>(null);
  useEffect(() => { api<Avatar[]>('/api/avatares').then((l) => { setAvatars(l); setAvatar((a) => a || l[0]?.id || ''); }).catch(() => {}); }, []);
  useEffect(() => { if (cliente) api<Ref[]>(`/api/references?client=${encodeURIComponent(cliente)}`).then((l) => setRefs(Array.isArray(l) ? l : [])).catch(() => setRefs([])); }, [cliente]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !job) onClose(); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [job, onClose]);
  const words = guion.trim().split(/\s+/).filter(Boolean).length;
  const target = Math.round(duracion * 2.6);
  const go = async () => {
    try {
      const j = await api<Job>('/api/reel-creador', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guion, idea, duracion, avatar, cliente, referencia, cta }) });
      const done = await waitJob(j, setJob);
      setResult(done.result as never);
      toast('Tu reel está listo.');
    } catch (e: any) { toast(e.message); setJob(null); }
  };
  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget && !job) onClose(); }}>
      <div className="modal card col" role="dialog" aria-modal="true" aria-label="Reel con avatar" style={{ maxWidth: 620, gap: 12 }}>
        <h2 style={{ fontSize: 20 }}>Reel con avatar, de un solo pedido</h2>
        {result ? (
          <>
            <span>Listo. {result.warnings.length ? 'La revisión automática encontró esto:' : 'La revisión automática no encontró problemas.'}</span>
            {result.warnings.length ? <ul className="small">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>Cerrar</button>
              <a className="btn primary rect" href={`#/listo?p=${encodeURIComponent(result.projectId)}`}>Abrir el reel<Icon name="next" /></a>
            </div>
          </>
        ) : job ? (
          <>
            <span>{job.message}</span>
            <div style={{ height: 8, borderRadius: 8, background: 'var(--line, #333)' }}><div style={{ width: `${Math.round((job.progress ?? 0) * 100)}%`, height: '100%', borderRadius: 8, background: 'var(--accent, #C6F432)' }} /></div>
            <span className="small muted">Con un avatar nuevo tarda cerca de 1,5 minutos por segundo de video (si el guion ya se usó, es mucho más rápido). Puedes cerrar esta ventana: sigue trabajando y el reel aparece en tus proyectos.</span>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Seguir en segundo plano</button></div>
          </>
        ) : (
          <>
            <label className="col small">Guion (lo que dice el avatar)
              <textarea className="input" rows={7} value={guion} onChange={(e) => setGuion(e.target.value)} placeholder="Todo este video lo editó Axioma Studio con Claude…" />
              <span className="muted">{words} palabras · para {duracion} s van unas {target}{words && Math.abs(words - target) > target * 0.15 ? (words > target ? ' (sobran palabras)' : ' (faltan palabras)') : ''}</span>
            </label>
            {!guion.trim() ? <label className="col small">O la idea (la IA escribe el guion)<input className="input" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Cómo editar reels con Axioma Studio y Claude" /></label> : null}
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <label className="col small">Duración
                <select className="input" value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>{[15, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} s</option>)}</select>
              </label>
              <label className="col small">Avatar
                <select className="input" value={avatar} onChange={(e) => setAvatar(e.target.value)}>{avatars.length ? avatars.map((a) => <option key={a.id} value={a.id}>{a.name}</option>) : <option value="">(no hay avatares guardados)</option>}</select>
              </label>
              <label className="col small">Cliente
                <select className="input" value={cliente} onChange={(e) => setCliente(e.target.value)}>{clients.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </label>
              <label className="col small">Referencia
                <select className="input" value={referencia} onChange={(e) => setReferencia(e.target.value)}><option value="">Ninguna</option>{refs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              </label>
              <label className="col small">Palabra a comentar<input className="input" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="editor" style={{ width: 120 }} /></label>
            </div>
            {avatar ? <img src={`/api/avatares/cara?id=${encodeURIComponent(avatar)}`} alt="" style={{ width: 72, height: 128, objectFit: 'cover', borderRadius: 10 }} /> : null}
            <span className="small muted">El avatar es una persona creada con IA: al publicar, marca el video como «hecho con IA».</span>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>Cancelar</button>
              <button className="btn primary rect" disabled={!avatar || (!guion.trim() && !idea.trim())} onClick={go}><Icon name="sparkle" />Hacer el reel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
