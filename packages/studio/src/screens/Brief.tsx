import React, { useEffect, useState } from 'react';
import { PERSONALITIES, SECTORS, VISION_TOPICS } from '@axioma/schema';
import type { Ctx } from '../App.tsx';
import { api, sceneDuration, waitJob, type Job } from '../useProject.ts';
import { ROLE_LABEL } from '../SceneFrame.tsx';

interface Opt { value: string; title: string; desc: string }
interface Q { key: string; label: string; title: string; help: string; placeholder: string; options: Opt[] }

/** Frase de cierre que va con cada objetivo: sale primero en la última pregunta. */
const CTA_FOR: Record<string, string> = {
  'Mensajes por DM': 'Escríbeme «INFO» por DM',
  Comentarios: 'Comenta «QUIERO» y te lo envío',
  Guardados: 'Guárdalo para cuando lo necesites',
  'Ir al link': 'Entra al link de mi perfil',
  Seguidores: 'Sígueme para más como esto',
  Compartidos: 'Envíaselo a quien lo necesita',
};
export const SPOKEN_CTA = 'La que digo en el video';

// Todas las preguntas se responden tocando una opción; escribir es solo para una respuesta distinta.
const QUESTIONS: Q[] = [
  { key: 'formato', label: 'Formato', title: '¿Dónde lo vas a publicar?', help: 'Define las zonas seguras y cómo se acomodan los textos.', placeholder: 'Ej.: pantalla de un evento', options: [
    { value: 'Reel 9:16', title: 'Reel de Instagram', desc: 'Vertical, para el feed de Reels.' },
    { value: 'Historia 9:16', title: 'Historia', desc: 'Deja libre la zona de respuesta.' },
    { value: 'TikTok 9:16', title: 'TikTok', desc: 'Vertical, ritmo de TikTok.' },
    { value: 'YouTube Short 9:16', title: 'YouTube Short', desc: 'Vertical, hasta 60 s.' },
    { value: 'Anuncio 9:16', title: 'Anuncio pagado', desc: 'Para pautar: mensaje claro y cierre fuerte.' }] },
  { key: 'objetivo', label: 'Objetivo', title: '¿Qué quieres que haga quien lo vea?', help: 'El cierre del reel se arma alrededor de esto.', placeholder: 'Ej.: que reserven una clase de prueba', options: [
    { value: 'Mensajes por DM', title: 'Escribirte por DM', desc: 'Que te escriban para pedir info.' },
    { value: 'Comentarios', title: 'Comentar', desc: 'Que respondan u opinen.' },
    { value: 'Guardados', title: 'Guardarlo', desc: 'Contenido útil para volver a ver.' },
    { value: 'Compartidos', title: 'Compartirlo', desc: 'Que lo envíen a alguien.' },
    { value: 'Ir al link', title: 'Ir al link', desc: 'Visitar tu página, comprar o reservar.' },
    { value: 'Seguidores', title: 'Seguirte', desc: 'Ganar seguidores nuevos.' }] },
  { key: 'publico', label: 'Público', title: '¿Para quién es?', help: 'Elige a quién le hablas en este video.', placeholder: 'Ej.: dueños de pymes locales', options: [
    { value: 'Gente que aún no me conoce', title: 'Gente nueva', desc: 'Aún no te conoce: hay que presentarse rápido.' },
    { value: 'Seguidores que ya me conocen', title: 'Mis seguidores', desc: 'Ya te siguen: puedes ir directo al tema.' },
    { value: 'Clientes listos para comprar', title: 'Listos para comprar', desc: 'Solo les falta un empujón.' },
    { value: 'Dueños de negocio y emprendedores', title: 'Dueños de negocio', desc: 'Emprendedores y pymes.' },
    { value: 'Jóvenes de 18 a 25', title: 'Jóvenes', desc: 'De 18 a 25 años.' },
    { value: 'Adultos y familias', title: 'Adultos y familias', desc: 'De 30 años en adelante.' }] },
  { key: 'ritmo', label: 'Ritmo', title: '¿Qué ritmo quieres?', help: 'Decide cada cuánto se corta y cómo entran los textos. Puedes cambiarlo después.', placeholder: 'Ej.: rápido al inicio y más calmado al final', options: [
    { value: 'Rápido', title: 'Rápido', desc: 'Sin pausas, zoom de golpe frecuente.' },
    { value: 'Con ritmo', title: 'Con ritmo', desc: 'Pausas cortas que respiran.' },
    { value: 'Sobrio', title: 'Sobrio', desc: 'Ritmo natural, sin zooms.' },
    { value: 'Enérgico', title: 'Enérgico', desc: 'Cortes fuertes, efectos y movimiento.' },
    { value: 'Pausado y elegante', title: 'Pausado y elegante', desc: 'Planos largos y transiciones suaves.' },
    { value: 'Que decida la app', title: 'Que decida la app', desc: 'Según lo que ve y oye en tu video.' }] },
  { key: 'tono', label: 'Tono', title: '¿Qué tono?', help: 'Guía los textos, los subtítulos y la imagen.', placeholder: 'Ej.: serio pero con humor', options: [
    { value: 'Directo', title: 'Directo', desc: 'Al grano.' },
    { value: 'Cercano', title: 'Cercano', desc: 'Como a un amigo.' },
    { value: 'Educativo', title: 'Educativo', desc: 'Explica paso a paso.' },
    { value: 'Inspirador', title: 'Inspirador', desc: 'Motiva a actuar.' },
    { value: 'Divertido', title: 'Divertido', desc: 'Colores fuertes y humor.' },
    { value: 'Elegante', title: 'Elegante', desc: 'Limpio, con aire de cine.' }] },
  { key: 'duracion', label: 'Duración', title: '¿Cuánto debe durar?', help: 'La app recorta lo redundante para acercarse.', placeholder: 'Ej.: máximo 40 s', options: [
    { value: '10–15 s', title: '10–15 s', desc: 'Un solo mensaje.' },
    { value: '15–20 s', title: '15–20 s', desc: 'Muy corto.' },
    { value: '20–30 s', title: '20–30 s', desc: 'Lo más común.' },
    { value: '30–45 s', title: '30–45 s', desc: 'Para explicar un poco más.' },
    { value: '45–60 s', title: '45–60 s', desc: 'Tema completo.' },
    { value: 'Lo que dure', title: 'Lo que dure', desc: 'Sin recortar ideas.' }] },
  { key: 'cta', label: 'Llamado a la acción', title: '¿Con qué frase cierras?', help: 'Aparece en pantalla en la última escena.', placeholder: 'Ej.: Escríbeme «REEL» y te cuento', options: [
    { value: SPOKEN_CTA, title: SPOKEN_CTA, desc: 'No se añade texto: se usa tu cierre.' },
    ...Object.values(CTA_FOR).map((v) => ({ value: v, title: v, desc: '' }))] },
];

export const Brief: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const firstEmpty = QUESTIONS.findIndex((q) => !project.brief[q.key]);
  const [i, setI] = useState(firstEmpty === -1 ? 0 : firstEmpty);
  const base = QUESTIONS[i];
  const forGoal = CTA_FOR[project.brief.objetivo ?? ''];
  const q: Q = base.key === 'cta' && forGoal
    ? { ...base, options: [{ value: forGoal, title: forGoal, desc: 'Va con tu objetivo.' }, ...base.options.filter((o) => o.value !== forGoal)] }
    : base;
  const value = project.brief[q.key] ?? '';
  const answered = QUESTIONS.filter((x) => project.brief[x.key]).length;

  const [brand, setBrand] = useState({ name: '', sector: '', personality: '', primary: '#FE2C55', secondary: '#25F4EE' });
  useEffect(() => {
    const k = store.kit;
    if (k) setBrand({ name: k.name, sector: k.sector ?? '', personality: k.personality ?? '', primary: k.colors.primary, secondary: k.colors.secondary });
  }, [store.kit]);
  // Si la marca aún no tiene sector, se propone el que corresponde a lo que se ve en el video.
  const seenSector = VISION_TOPICS.find((t) => t.id === store.vision?.topic)?.sector ?? null;
  useEffect(() => {
    if (seenSector && !store.kit?.sector) setBrand((b) => (b.sector ? b : { ...b, sector: seenSector }));
  }, [seenSector, store.kit]);
  /** Guarda el perfil de la marca y viste el reel con su estilo. */
  const saveBrand = async () => {
    try {
      const d = await api(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'marca', ...brand, name: brand.name || project.client || 'Mi marca' }) });
      store.setKit(d.kit);
      store.replace(d.project);
      await store.reloadExtras();
      ctx.toast(d.why ? `Marca guardada. Su estilo: ${d.why}.` : 'Marca guardada.');
    } catch (e: any) { ctx.toast(e.message); }
  };

  const [manual, setManual] = useState('');
  /** Crea el manual de marca del cliente (PDF) y lo abre en otra pestaña. */
  const brandbook = async () => {
    const tab = window.open('', '_blank');
    setManual('Armando el manual…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'manual-marca' }) });
      const done = await waitJob(job, (j) => setManual(j.message));
      const url = `${done.result?.pdf}&v=${Date.now()}`;
      if (tab) tab.location.href = url; else window.location.href = url;
      ctx.toast(done.result?.hasKit ? 'Manual de marca listo.' : 'Manual listo con colores de ejemplo: guarda tu marca para que salga con la tuya.');
    } catch (e: any) { tab?.close(); ctx.toast(e.message); } finally { setManual(''); }
  };

  const [building, setBuilding] = useState('');
  /** Arma la edición según el brief y lleva al editor. */
  const build = async () => {
    setBuilding('Armando tu edición…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'aplicar-brief' }) });
      const done = await waitJob(job, (j) => setBuilding(j.message));
      const d = await api(`/api/project?id=${encodeURIComponent(project.id)}`);
      store.replace(d.project);
      await store.reloadExtras();
      ctx.toast(`Edición lista. ${(done.result?.summary as string[]).join(' ')}`);
      ctx.go('editor', { s: null });
    } catch (e: any) { ctx.toast(`No se pudo armar la edición: ${e.message}`); } finally { setBuilding(''); }
  };

  /** Guarda la respuesta. Al tocar una opción se pasa sola a la siguiente pregunta. */
  const answer = (v: string, next = false) => {
    store.update((p) => { if (v) p.brief[q.key] = v; else delete p.brief[q.key]; });
    if (next && i < QUESTIONS.length - 1) setI(i + 1);
  };
  const custom = Boolean(value) && !q.options.some((o) => o.value === value);

  return (
    <div className="cols">
      <nav className="col steps" aria-label="Pasos del brief" style={{ flex: '1 1 220px', maxWidth: 250, gap: 4 }}>
        <span className="small muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Brief · {answered} de {QUESTIONS.length}</span>
        {QUESTIONS.map((x, n) => {
          const done = Boolean(project.brief[x.key]);
          return (
            <button key={x.key} className={n === i ? 'on' : ''} onClick={() => setI(n)}>
              <span className={`dot ${n === i ? 'cur' : done ? 'done' : ''}`}>{done && n !== i ? '✓' : n + 1}</span>
              <span className="col" style={{ gap: 0, minWidth: 0 }}>
                <span style={{ fontWeight: n === i ? 700 : 500 }}>{x.label}</span>
                <span className="small muted">{project.brief[x.key] ?? (n === i ? 'Respondiendo' : 'Pendiente')}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <main className="card col" style={{ flex: '999 1 480px', minWidth: 0, gap: 18, padding: 26, borderRadius: 20 }}>
        <details className="grp" open={!store.kit?.sector}>
          <summary>{store.kit?.sector ? `Marca: ${store.kit.name} · ${SECTORS.find(([id]) => id === store.kit!.sector)?.[1]}` : 'Primero, tu marca'}
            {store.kit?.sector && <button className="btn ghost small" style={{ float: 'right', marginTop: -4 }} disabled={!!manual} onClick={(e) => { e.preventDefault(); brandbook(); }} title="PDF de una página por tema: colores, letras, logo, cómo se ven sus reels y tono de voz">{manual || '📘 Manual de marca'}</button>}
          </summary>
          <div className="col">
            <span className="small muted">Cada marca se ve distinta: un gimnasio no lleva los mismos subtítulos que una hamburguesería. Esto se pregunta una sola vez por cliente y decide subtítulos, títulos, letra, imagen y efectos.</span>
            {store.vision && (
              <span className="pill" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}>
                La app vio el video: {store.vision.scores.slice(0, 2).map((x) => `${x.label} (${Math.round(x.score * 100)} %)`).join(' y ')}.
                {seenSector && !store.kit?.sector ? ` Te propongo: ${SECTORS.find(([id]) => id === seenSector)?.[1]}.` : ''}
              </span>
            )}
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: '1 1 150px' }}>Nombre de la marca
                <input value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} placeholder={project.client ?? 'Mi marca'} />
              </label>
              <label className="field" style={{ flex: '1 1 170px' }}>¿A qué se dedica?
                <select value={brand.sector} onChange={(e) => setBrand({ ...brand, sector: e.target.value })}>
                  <option value="">Elige…</option>
                  {SECTORS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label className="field" style={{ flex: '1 1 140px' }}>¿Cómo habla?
                <select value={brand.personality} onChange={(e) => setBrand({ ...brand, personality: e.target.value })}>
                  <option value="">Elige…</option>
                  {PERSONALITIES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label className="field">Color principal
                <input type="color" value={brand.primary} onChange={(e) => setBrand({ ...brand, primary: e.target.value })} style={{ width: 64, padding: 2 }} />
              </label>
              <label className="field">Secundario
                <input type="color" value={brand.secondary} onChange={(e) => setBrand({ ...brand, secondary: e.target.value })} style={{ width: 64, padding: 2 }} />
              </label>
              <button className="btn primary" disabled={!brand.sector} onClick={saveBrand}>Guardar marca</button>
            </div>
          </div>
        </details>
        <span className="small" style={{ fontWeight: 700, color: 'var(--pinkText)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Pregunta {i + 1}</span>
        <h1 style={{ fontSize: 30, lineHeight: 1.15 }}>{q.title}</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>{q.help}</p>
        <div className="opts">
          {q.options.map((o) => (
            <button key={o.value} className={`opt ${value === o.value ? 'on' : ''}`} aria-pressed={value === o.value} onClick={() => answer(o.value, true)}>
              <strong style={{ fontSize: 16 }}>{o.title}</strong>
              {o.desc && <span className="muted small">{o.desc}</span>}
            </button>
          ))}
        </div>
        <label className="field">Otra respuesta (opcional)
          <input
            key={q.key}
            defaultValue={custom ? value : ''}
            placeholder={q.placeholder}
            style={custom ? { borderColor: 'var(--pink)' } : undefined}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== value) answer(v); else if (!v && custom) answer(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </label>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Atrás</button>
          {i < QUESTIONS.length - 1
            ? <button className="btn primary" onClick={() => setI(i + 1)}>Siguiente pregunta</button>
            : <button className="btn primary" disabled={Boolean(building)} onClick={build}>{building || (project.briefAppliedAt ? 'Volver a crear la edición' : 'Crear mi edición')}</button>}
        </div>
        {answered >= 3 && i < QUESTIONS.length - 1 && (
          <button className="btn cyan" style={{ alignSelf: 'flex-end' }} disabled={Boolean(building)} onClick={build}>{building || 'Crear mi edición con lo que llevo'}</button>
        )}
        <span className="small muted">
          {project.briefAppliedAt
            ? 'Tu edición ya se armó con este brief. Si cambias respuestas y la vuelves a crear, se reemplazan los cambios que hayas hecho a mano (queda una versión guardada).'
            : 'Al terminar, la app arma la edición con tus respuestas: ritmo, duración, estilo de textos, gancho, cierre y transiciones. Después cambias lo que quieras.'}
        </span>
      </main>

      <aside className="col" style={{ flex: '1 1 260px', maxWidth: 320, padding: 18, borderRadius: 16, background: 'var(--cyanSoft)' }}>
        <h2 style={{ fontSize: 17 }}>Así va quedando</h2>
        <span className="muted small">{project.briefAppliedAt ? 'Edición armada con tu brief.' : 'Primer corte automático. Responde el brief y pulsa «Crear mi edición».'}</span>
        {project.scenes.map((s, n) => (
          <div key={s.id} className="row" style={{ padding: '9px 12px', borderRadius: 10, background: 'var(--panel)', flexWrap: 'nowrap' }}>
            <span className="small muted" style={{ fontWeight: 700 }}>{String(n + 1).padStart(2, '0')}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{s.title || ROLE_LABEL[s.role]}</span>
            <span className="small muted">{sceneDuration(s).toFixed(1)} s</span>
          </div>
        ))}
        <span className="small muted">Preset: <strong style={{ color: 'var(--text)' }}>{store.presets.find((p) => p.id === project.presetId)?.name ?? project.presetId}</strong></span>
      </aside>
    </div>
  );
};
