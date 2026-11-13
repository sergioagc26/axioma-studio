import React, { useEffect, useState } from 'react';
import type { Ctx } from '../App.tsx';
import { api, waitJob, type Job } from '../useProject.ts';

type Tipo = 'carrusel' | 'post' | 'historia';
interface ImageSet { name: string; tipo: string; files: string[] }

const TIPOS: [Tipo, string, string][] = [
  ['carrusel', 'Carrusel', 'Portada con el gancho, 3 a 5 ideas clave y un cierre. Formato 4:5.'],
  ['post', 'Post estático', 'Una imagen con el gancho sobre un fotograma del video. Formato 4:5.'],
  ['historia', 'Historia estática', 'El gancho y un botón de llamado a la acción, sin tapar la barra de respuesta. Formato 9:16.'],
];

/** Creador de imágenes: carrusel, post o historia a partir del reel, con los colores de la marca. */
export const Imagenes: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const project = ctx.store.project!;
  const [sets, setSets] = useState<ImageSet[]>([]);
  const [busy, setBusy] = useState('');
  const media = (rel: string) => `/media/${encodeURIComponent(project.id)}/${rel.split('/').map(encodeURIComponent).join('/')}`;
  const load = () => api<{ sets: ImageSet[] }>(`/api/imagenes?id=${encodeURIComponent(project.id)}`).then((d) => setSets(d.sets)).catch(() => {});
  useEffect(() => { load(); }, [project.id]);

  const create = async (tipo: Tipo) => {
    setBusy('Preparando las imágenes…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'crear-imagenes', tipo }) });
      const done = await waitJob(job, (j) => setBusy(j.message || 'Creando…'));
      await load();
      ctx.toast(`${done.result?.files?.length ?? 0} imagen${done.result?.files?.length === 1 ? '' : 'es'} lista${done.result?.files?.length === 1 ? '' : 's'}${done.result?.ai ? ', con textos escritos por la IA local' : ''}.`);
    } catch (e: any) { ctx.toast(`No se pudieron crear: ${e.message}`); } finally { setBusy(''); }
  };

  return (
    <main className="page" style={{ maxWidth: 1100, width: '100%', margin: '0 auto' }}>
      <h1 style={{ fontSize: 26 }}>Imágenes para redes</h1>
      <p className="muted" style={{ marginTop: 0 }}>Hechas con tu reel: los fondos son fotogramas del video, los textos salen de lo que dices y los colores son los de tu marca.</p>
      <div className="opts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {TIPOS.map(([id, name, desc]) => (
          <button key={id} className="opt" disabled={Boolean(busy)} onClick={() => create(id)}>
            <strong style={{ fontSize: 16 }}>{name}</strong>
            <span className="muted small">{desc}</span>
            <span className="btn primary" style={{ height: 34, marginTop: 6, alignSelf: 'flex-start' }} aria-hidden="true">{busy ? busy : `Crear ${name.toLowerCase()}`}</span>
          </button>
        ))}
      </div>
      {sets.length === 0 && !busy && <p className="muted small" style={{ marginTop: 18 }}>Todavía no has creado imágenes para este reel. Elige un tipo arriba: tarda unos segundos y las descargas una por una o todas juntas.</p>}
      {sets.map((set) => (
        <section key={set.name} className="col" style={{ marginTop: 22, gap: 8 }}>
          <strong>{set.tipo === 'carrusel' ? 'Carrusel' : set.tipo === 'post' ? 'Post' : 'Historia'} · {set.name.slice(0, 16).replace('T', ' ')}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${set.tipo === 'historia' ? 150 : 180}px, 1fr))`, gap: 10 }}>
            {set.files.map((f) => (
              <a key={f} href={media(f)} download={f.split('/').pop()} title="Descargar" style={{ display: 'block', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }}>
                <img src={media(f)} alt="" loading="lazy" style={{ width: '100%', display: 'block' }} />
              </a>
            ))}
          </div>
          <span className="small muted">Toca una imagen para descargarla. También están en la carpeta del proyecto: {set.files[0]?.split('/').slice(0, -1).join('/')}</span>
        </section>
      ))}
    </main>
  );
};
