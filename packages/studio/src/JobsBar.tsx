import React, { useEffect, useState } from 'react';
import { Icon } from './Icon.tsx';
import { AxiLive, axiForJob } from './AxiLive.tsx';
import { api, type Job } from './useProject.ts';

type Running = Job & { cancellable?: boolean };

const KIND: Record<string, string> = {
  nuevo: 'Preparando el video', crear: 'Editando', render: 'Exportando', referencia: 'Analizando la referencia', ia: 'IA', audio: 'Audio', publicar: 'Publicando', metricas: 'Resultados', actualizar: 'Actualizando la app', copia: 'Copia de seguridad',
};

/**
 * Trabajos en marcha (de este proyecto, o la creación de uno nuevo) con su avance y un botón para
 * cancelarlos. Si se cancela, el proyecto vuelve a como estaba antes de empezar.
 */
export const JobsBar: React.FC<{ projectId: string | null; toast: (m: string) => void }> = ({ projectId, toast }) => {
  const [list, setList] = useState<Running[]>([]);
  const [asking, setAsking] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const q = projectId ? `?id=${encodeURIComponent(projectId)}` : '?kind=crear';
    const load = () => api<Running[]>(`/api/jobs${q}`).then((l) => { if (live) setList(Array.isArray(l) ? l.filter((j) => j.status === 'running') : []); }).catch(() => {});
    void load();
    const t = window.setInterval(load, 2000);
    return () => { live = false; clearInterval(t); };
  }, [projectId]);

  const cancel = async (j: Running) => {
    setAsking(null);
    try {
      const r = await api<Running>(`/api/jobs/${j.id}/cancelar`, { method: 'POST' });
      // Llegó tarde: el trabajo ya había terminado (o fallado) por su cuenta.
      if (r.status === 'done') { setList((l) => l.filter((x) => x.id !== j.id)); return toast('Ya había terminado: no hubo nada que cancelar.'); }
      if (r.status === 'error') { setList((l) => l.filter((x) => x.id !== j.id)); return; }
      setList((l) => l.map((x) => (x.id === j.id ? { ...x, message: 'Cancelando…' } : x)));
      toast(j.kind === 'nuevo' ? 'Cancelado: el video a medias no queda en la lista.' : 'Cancelado: el proyecto queda como estaba antes.');
    } catch (e: any) { toast(e.message); }
  };

  if (!list.length) return null;
  return (
    <div className="jobsbar" role="region" aria-label="Trabajos en marcha">
      {list.map((j) => (
        <div key={j.id} className="jobsbar-item">
          {/* Axi hace lo que la app está haciendo (corta, exporta, escucha, piensa). */}
          <AxiLive state={axiForJob(j.kind, j.message)} size={44} progress={j.progress > 0 ? j.progress : undefined} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="small" style={{ fontWeight: 700 }}>{KIND[j.kind ?? ''] ?? 'Trabajando'}{j.progress > 0 && j.progress < 1 ? ` · ${Math.round(j.progress * 100)} %` : ''}</div>
            <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.message}</div>
          </div>
          {j.cancellable !== false && j.message !== 'Cancelando…' && (asking === j.id ? (
            <span className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
              <button className="btn small primary" onClick={() => cancel(j)}>Sí, cancelar</button>
              <button className="btn small" onClick={() => setAsking(null)}>No</button>
            </span>
          ) : (
            <button className="btn small rect" onClick={() => setAsking(j.id)} title="Para este trabajo; el proyecto queda como estaba"><Icon name="close" /> Cancelar</button>
          ))}
        </div>
      ))}
    </div>
  );
};
