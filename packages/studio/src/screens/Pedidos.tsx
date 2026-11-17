import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon.tsx';
import type { Ctx } from '../App.tsx';
import { api, uploadFile, waitJob, type Job } from '../useProject.ts';

interface Question { key: string; label: string; hint: string }
interface OrderView {
  name: string;
  loose: boolean;
  files: { videos: string[]; referencias: string[]; guion?: string; pedido?: string; logo?: string; musica?: string; otros: string[] };
  answers: Record<string, string>;
  state: { estado: 'pendiente' | 'editando' | 'listo' | 'error'; proyecto?: string; video?: string; at?: string; error?: string; resumen?: string[] };
  job?: Job;
}
interface Data { inbox: string; ready: string; questions: Question[]; orders: OrderView[] }

/** Para qué es cada archivo del pedido: decide con qué nombre se guarda (la app lo reconoce por el nombre). */
type Role = 'grabacion' | 'referencia' | 'guion' | 'pedido' | 'logo' | 'musica' | 'otro';
const ROLES: Record<Role, string> = { grabacion: 'Lo que grabé', referencia: 'Referencia (estilo)', guion: 'Guion', pedido: 'Lo que quiero', logo: 'Logo', musica: 'Música', otro: 'Otro' };
const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function guessRole(f: File): Role {
  const n = plain(f.name);
  if (/\.(mp4|mov|m4v|webm|mkv|avi)$/.test(n)) return /^(referencia|ref)[\s._-]/.test(n) ? 'referencia' : 'grabacion';
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(n)) return 'musica';
  if (/\.(png|jpe?g|webp|svg)$/.test(n)) return /^logo/.test(n) ? 'logo' : 'otro';
  if (/\.(txt|md)$/.test(n)) return /guion|script|libreto/.test(n) ? 'guion' : 'pedido';
  return 'otro';
}
function rolesFor(f: File): Role[] {
  const n = plain(f.name);
  if (/\.(mp4|mov|m4v|webm|mkv|avi)$/.test(n)) return ['grabacion', 'referencia'];
  if (/\.(png|jpe?g|webp|svg)$/.test(n)) return ['logo', 'otro'];
  if (/\.(txt|md)$/.test(n)) return ['pedido', 'guion'];
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(n)) return ['musica'];
  return ['otro'];
}
/** Nombre con el que se guarda: lleva la palabra que la app busca (referencia, guion, logo…). */
function storedName(f: File, role: Role): string {
  const n = plain(f.name);
  const ext = f.name.slice(f.name.lastIndexOf('.'));
  if (role === 'referencia' && !/^(referencia|ref)[\s._-]/.test(n)) return `referencia-${f.name}`;
  if (role === 'guion' && !/guion|script|libreto/.test(n)) return `guion${ext}`;
  if (role === 'pedido' && /guion|script|libreto/.test(n)) return `pedido${ext}`;
  if (role === 'logo' && !/^logo/.test(n)) return `logo${ext}`;
  if (role === 'grabacion' && /^(referencia|ref)[\s._-]/.test(n)) return `toma-${f.name}`;
  return f.name;
}
const mb = (b: number) => `${(b / 1048576).toFixed(b > 1048576 * 10 ? 0 : 1)} MB`;
const ESTADO: Record<OrderView['state']['estado'], string> = { pendiente: 'Por hacer', editando: 'Editando', listo: 'Listo', error: 'Con error' };

/**
 * «Para editar»: la forma más simple de usar la app. Se deja lo grabado (y, si se quiere, lo que
 * se pide, el guion, una referencia, el logo y la música), la app hace el video sola y lo deja en
 * «Listos». Es lo mismo que dejar los archivos en la carpeta y decirle a Claude «hazme el video».
 */
export const Pedidos: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [files, setFiles] = useState<{ file: File; role: Role }[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState(false);
  const [autoStart, setAutoStart] = useState(true);
  const [over, setOver] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const input = useRef<HTMLInputElement>(null);
  const watched = useRef(new Set<string>());

  const reload = async () => {
    try { const d = await api<Data>('/api/pedidos'); setData(d); setLoadError(null); return d; } catch (e: any) { setLoadError(e.message); return null; }
  };
  /** Sigue un trabajo hasta que termine (una sola vez por trabajo, aunque se recargue la lista). */
  const follow = (order: string, job: Job) => {
    if (watched.current.has(job.id)) return;
    watched.current.add(job.id);
    void waitJob(job, (j) => setJobs((m) => ({ ...m, [order]: j })))
      .then(() => { ctx.toast(`«${order}» está listo.`); })
      .catch((e) => { ctx.toast(`«${order}»: ${e.message}`); })
      .finally(() => { setJobs((m) => { const { [order]: _, ...rest } = m; return rest; }); void reload(); });
  };
  useEffect(() => {
    void reload().then((d) => d?.orders.forEach((o) => { if (o.job) follow(o.name, o.job); }));
  }, []);

  const take = (list: FileList | null) => {
    if (!list?.length) return;
    const add = [...list].map((file) => ({ file, role: guessRole(file) }));
    setFiles((cur) => [...cur, ...add.filter((a) => !cur.some((c) => c.file.name === a.file.name && c.file.size === a.file.size))]);
    if (!name.trim()) {
      const first = add.find((a) => a.role === 'grabacion')?.file.name;
      if (first) setName(first.replace(/\.[^.]+$/, '').slice(0, 40));
    }
  };

  const start = async (order: string) => {
    try { follow(order, await api<Job>('/api/pedidos/hacer', { method: 'POST', body: JSON.stringify({ pedido: order }) })); } catch (e: any) { ctx.toast(e.message); }
  };

  const send = async () => {
    const order = name.trim();
    if (!order) return ctx.toast('Ponle un nombre al video.');
    if (!files.some((f) => f.role === 'grabacion')) return ctx.toast('Sube al menos un video que hayas grabado.');
    try {
      for (const [i, { file, role }] of files.entries()) {
        const fname = storedName(file, role);
        await uploadFile(`/api/pedidos/subir?pedido=${encodeURIComponent(order)}&filename=${encodeURIComponent(fname)}`, file,
          (f) => setSending(`Subiendo ${i + 1} de ${files.length}: ${file.name} · ${Math.round(f * 100)} %`));
      }
      if (Object.values(answers).some((v) => v.trim())) {
        await api('/api/pedidos/pedido', { method: 'POST', body: JSON.stringify({ pedido: order, respuestas: answers }) });
      }
      setFiles([]); setAnswers({}); setName(''); setAsk(false);
      const d = await reload();
      const made = d?.orders.find((o) => o.name.toLowerCase() === order.toLowerCase().replace(/\s+/g, ' '))?.name ?? order;
      if (autoStart) await start(made); else ctx.toast(`Pedido «${made}» guardado.`);
    } catch (e: any) {
      ctx.toast(e.message);
    } finally {
      setSending(null);
    }
  };

  const orders = data?.orders ?? [];
  return (
    <div className="page col" style={{ gap: 18, maxWidth: 980, margin: '0 auto', width: '100%' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="col" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 28 }}>Para editar</h1>
          <span className="muted">Deja lo que grabaste, di qué quieres (si quieres) y la app hace el video sola. Lo terminado queda en <b>Listos</b>.</span>
        </div>
        <a className="btn rect" href="#/proyectos"><Icon name="back" />Proyectos</a>
      </div>

      <section className="col" style={{ gap: 12 }} aria-label="Pedido nuevo">
        <div
          className={`drop ${over ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
        >
          {sending ? (
            <><strong>{sending}</strong><span className="muted small">No cierres esta página mientras sube.</span></>
          ) : (
            <>
              <strong style={{ fontSize: 17 }}>{over ? 'Suéltalo aquí' : 'Arrastra aquí lo que grabaste'}</strong>
              <span className="muted">Uno o varios videos, tal cual salieron del celular o la cámara. Si quieres, también tu guion, un video de referencia, tu logo o tu música.</span>
              <button className="btn primary" onClick={() => input.current?.click()}><Icon name="upload" />Elegir archivos</button>
              <input ref={input} type="file" multiple hidden accept="video/*,audio/*,image/*,.txt,.md" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
            </>
          )}
        </div>

        {files.length > 0 && !sending && (
          <div className="col" style={{ gap: 10 }}>
            <label className="field" style={{ maxWidth: 420 }}>Nombre del video
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="promo-noviembre" aria-label="Nombre del video" />
            </label>
            <ul className="col" style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0 }} aria-label="Archivos del pedido">
              {files.map((f, i) => {
                const roles = rolesFor(f.file);
                return (
                  <li key={`${f.file.name}-${i}`} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Icon name={f.role === 'grabacion' || f.role === 'referencia' ? 'film' : f.role === 'musica' ? 'music' : f.role === 'logo' ? 'image' : 'text'} />
                    <span style={{ flex: '1 1 220px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.file.name}>{f.file.name} <span className="muted small">{mb(f.file.size)}</span></span>
                    {roles.length > 1
                      ? <select className="input" style={{ minHeight: 32, width: 190 }} value={f.role} aria-label={`Para qué es ${f.file.name}`} onChange={(e) => setFiles((cur) => cur.map((c, j) => (j === i ? { ...c, role: e.target.value as Role } : c)))}>
                          {roles.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
                        </select>
                      : <span className="pill">{ROLES[f.role]}</span>}
                    <button className="btn sq" aria-label={`Quitar ${f.file.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}><Icon name="close" /></button>
                  </li>
                );
              })}
            </ul>
            <button className="btn ghost" style={{ alignSelf: 'flex-start' }} aria-expanded={ask} onClick={() => setAsk(!ask)}>
              <Icon name="edit" />{ask ? 'Ocultar lo que quiero' : 'Decir qué quiero (opcional)'}
            </button>
            {ask && data && (
              <div className="col" style={{ gap: 8 }}>
                <span className="muted small">Llena solo lo que sepas: lo que dejes vacío lo decide la app.</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                  {data.questions.map((q) => (
                    <label key={q.key} className="field">{q.label}
                      <input className="input" value={answers[q.key] ?? ''} placeholder={q.hint} onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))} />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => void send()}><Icon name="sparkle" />{autoStart ? 'Subir y hacer el video' : 'Subir'}</button>
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />Hacer el video apenas termine de subir</label>
            </div>
          </div>
        )}
      </section>

      <section className="col" style={{ gap: 10 }} aria-label="Pedidos">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ fontSize: 20 }}>Pedidos {data ? <span className="muted small" style={{ fontWeight: 500 }}>({orders.length})</span> : null}</h2>
          <button className="btn rect" onClick={() => void reload()} title="Ver si hay pedidos nuevos en la carpeta"><Icon name="refresh" />Revisar la carpeta</button>
        </div>
        {loadError && <p className="muted" role="alert">No pude leer los pedidos ({loadError}).</p>}
        {data && !orders.length && (
          <p className="muted">Todavía no hay pedidos. Sube tus videos arriba, o déjalos en la carpeta <code>{data.inbox}</code> (una carpeta por video).</p>
        )}
        {orders.map((o) => {
          const job = jobs[o.name] ?? o.job;
          const busy = Boolean(job && job.status === 'running');
          const estado = busy ? 'editando' : o.state.estado;
          const f = o.files;
          const chips = [
            `${f.videos.length} video${f.videos.length === 1 ? '' : 's'}`,
            f.pedido && 'lo que quiero', f.guion && 'guion', f.referencias.length && 'referencia', f.logo && 'logo', f.musica && 'música',
          ].filter(Boolean) as string[];
          const asked = Object.entries(o.answers).filter(([, v]) => v).map(([k, v]) => `${data?.questions.find((q) => q.key === k || (k === 'notas' && q.key === 'notas'))?.label.replace(/[¿?]/g, '') ?? k}: ${v}`);
          return (
            <article key={o.name} className="card col" style={{ gap: 10, padding: 16, border: '1px solid var(--line)', borderRadius: 14 }} aria-busy={busy || undefined}>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ fontSize: 17 }}>{o.name}</strong>
                <span className="pill" style={estado === 'listo' ? { color: 'var(--pinkText)' } : estado === 'error' ? { color: 'var(--danger)' } : undefined}>
                  <Icon name={estado === 'listo' ? 'check' : estado === 'error' ? 'warning' : estado === 'editando' ? 'clock' : 'folder'} />{ESTADO[estado]}
                </span>
              </div>
              <div className="row chips" style={{ flexWrap: 'wrap' }}>{chips.map((c) => <span key={c} className="pill">{c}</span>)}</div>
              {asked.length > 0 && <span className="small muted">{asked.join(' · ')}</span>}

              {busy && job && (
                <div className="col" style={{ gap: 6 }}>
                  <span>{job.message}</span>
                  <div className="progress busy" role="progressbar" aria-label={`Avance de ${o.name}`}><div style={{ width: '100%' }} /></div>
                  <span className="muted small">Tarda de 3 a 15 minutos. Puedes ir a otra pantalla: te aviso cuando esté.</span>
                </div>
              )}
              {!busy && o.state.estado === 'error' && <span role="alert" style={{ color: 'var(--danger)' }}><Icon name="warning" />{o.state.error}</span>}
              {!busy && o.state.video && (
                <video src={`/api/pedidos/video?pedido=${encodeURIComponent(o.name)}&t=${encodeURIComponent(o.state.at ?? '')}`} controls preload="metadata" style={{ width: '100%', maxWidth: 320, maxHeight: 480, borderRadius: 10, background: '#000' }} aria-label={`Video listo de ${o.name}`} />
              )}
              {!busy && o.state.resumen && o.state.resumen.length > 0 && (
                <details><summary className="small">Lo que hizo la app</summary><ul className="small">{o.state.resumen.map((l, i) => <li key={i}>{l}</li>)}</ul></details>
              )}

              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {!busy && (
                  <button className={`btn ${o.state.video ? 'rect' : 'primary'}`} onClick={() => void start(o.name)} disabled={!f.videos.length}>
                    <Icon name={o.state.video ? 'refresh' : 'sparkle'} />{o.state.video ? 'Hacerlo de nuevo' : o.state.estado === 'error' ? 'Reintentar' : 'Hacer el video'}
                  </button>
                )}
                {!busy && o.state.video && <a className="btn rect" href={`/api/pedidos/video?pedido=${encodeURIComponent(o.name)}&descargar=1`}><Icon name="export" />Descargar</a>}
                {!busy && o.state.proyecto && <a className="btn rect" href={`#/editor?p=${encodeURIComponent(o.state.proyecto)}`}><Icon name="editor" />Ajustar en el editor</a>}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
};
