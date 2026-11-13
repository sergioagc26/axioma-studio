import React, { useEffect, useRef, useState } from 'react';
import { PERSONALITIES, SECTORS, VISION_TOPICS } from '@axioma/schema';
import type { Ctx } from '../App.tsx';
import { api, waitJob, type Job } from '../useProject.ts';
import { Icon } from '../Icon.tsx';
import type { IconName } from '../icons.ts';

interface Help { resumen: string; sugerido: Record<string, string>; preguntas: { id: string; pregunta: string; ejemplo: string }[]; ia: boolean; prompt: string }
interface Ref { id: string; name: string; client: string; duration: number; avgShot: number; frames: string[]; suggested: { ritmo: string } }
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
/** Un icono por respuesta: se entiende de un vistazo, sin leer. */
const ICON: Record<string, IconName> = {
  'Reel 9:16': 'instagram', 'Historia 9:16': 'story', 'TikTok 9:16': 'tiktok', 'YouTube Short 9:16': 'youtube', 'Anuncio 9:16': 'megaphone',
  'Mensajes por DM': 'message', Comentarios: 'speech', Guardados: 'bookmark', Compartidos: 'share', 'Ir al link': 'link', Seguidores: 'follow',
  'Gente que aún no me conoce': 'hand', 'Seguidores que ya me conocen': 'heart', 'Clientes listos para comprar': 'cart', 'Dueños de negocio y emprendedores': 'briefcase', 'Jóvenes de 18 a 25': 'users', 'Adultos y familias': 'family',
  'Rápido': 'bolt', 'Con ritmo': 'rhythm', Sobrio: 'calm', 'Enérgico': 'flame', 'Pausado y elegante': 'clapper', 'Que decida la app': 'sparkle',
  Directo: 'target', Cercano: 'heart', Educativo: 'book', Inspirador: 'rocket', Divertido: 'smile', Elegante: 'diamond',
  '10–15 s': 'timer', '15–20 s': 'timer', '20–30 s': 'timer', '30–45 s': 'timer', '45–60 s': 'timer', 'Lo que dure': 'infinity',
  'La que digo en el video': 'mic', 'Escríbeme «INFO» por DM': 'message', 'Comenta «QUIERO» y te lo envío': 'speech', 'Guárdalo para cuando lo necesites': 'bookmark', 'Entra al link de mi perfil': 'link', 'Sígueme para más como esto': 'follow', 'Envíaselo a quien lo necesita': 'share',
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
  const forGoal = CTA_FOR[project.brief.objetivo ?? ''];
  // La IA lee el video y propone las respuestas: el cliente solo confirma o cambia.
  const [help, setHelp] = useState<Help | null>(null);
  const [suggested, setSuggested] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    api<Help>(`/api/brief-ia?id=${encodeURIComponent(project.id)}`).then((h) => {
      if (!alive) return;
      setHelp(h);
      const fill = Object.entries(h.sugerido).filter(([k, v]) => v && !store.project!.brief[k]);
      if (fill.length) { store.update((p) => { for (const [k, v] of fill) p.brief[k] = v; }); setSuggested(fill.map(([k]) => k)); }
    }).catch(() => setHelp({ resumen: '', sugerido: {}, preguntas: [], ia: false, prompt: '' }));
    return () => { alive = false; };
  }, [project.id]);
  // Referencias del cliente: si ya hay un video que muestra cómo debe quedar, se elige aquí y la
  // edición copia su ritmo, subtítulos y textos. También se puede subir una nueva sin salir del brief.
  const [refs, setRefs] = useState<Ref[]>([]);
  const [refJob, setRefJob] = useState('');
  const refInput = useRef<HTMLInputElement>(null);
  const pid = encodeURIComponent(project.id);
  useEffect(() => { api<Ref[]>(`/api/references?id=${pid}`).then(setRefs).catch(() => {}); }, [project.id]);
  const uploadRef = async (file: File) => {
    setRefJob('Subiendo la referencia…');
    try {
      const started = await api<Job>(`/api/references?id=${pid}&filename=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
      const done = await waitJob(started, (j) => setRefJob(j.message));
      const report = done.result!.report as Ref;
      setRefs((l) => [report, ...l]);
      set('referencia', report.id);
    } catch (e: any) { ctx.toast(`No se pudo analizar la referencia: ${e.message}`); } finally { setRefJob(''); }
  };
  const set = (key: string, v: string) => { store.update((p) => { if (v) p.brief[key] = v; else delete p.brief[key]; }); setSuggested((x) => x.filter((k) => k !== key)); };
  const [prompt, setPrompt] = useState('');
  const loadPrompt = () => { setPrompt('Escribiendo…'); setTimeout(() => api<Help>(`/api/brief-ia?id=${encodeURIComponent(project.id)}`).then((h) => setPrompt(h.prompt)).catch(() => setPrompt('')), 900); };

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
      void done;
      ctx.go('listo', { s: null });
      // El video final se exporta solo; mientras tanto se puede ver en la pantalla de resultado.
      void ctx.exportNow();
    } catch (e: any) { ctx.toast(`No se pudo armar la edición: ${e.message}`); } finally { setBuilding(''); }
  };

  const optionsOf = (x: Q) => (x.key === 'cta' && forGoal ? [{ value: forGoal, title: forGoal, desc: '' }, ...x.options.filter((o) => o.value !== forGoal)] : x.options);
  const row = (x: Q) => {
    const value = project.brief[x.key] ?? '';
    const opts = optionsOf(x);
    const custom = Boolean(value) && !opts.some((o) => o.value === value);
    return (
      <section key={x.key} className="col" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <h2 style={{ fontSize: 17 }}>{x.title}</h2>
          {suggested.includes(x.key) && <span className="pill" title="Lo propuso la IA al oír tu video. Cámbialo si no es."><Icon name="sparkle" size={12} />sugerido</span>}
        </div>
        <div className="bchips">
          {opts.map((o) => (
            <button key={o.value} className={`bchip ${value === o.value ? 'on' : ''}`} aria-pressed={value === o.value} title={o.desc} onClick={() => set(x.key, o.value)}>
              {ICON[o.value] ? <Icon name={ICON[o.value]} /> : null}{o.title}
            </button>
          ))}
          <input
            key={`${x.key}-${custom ? value : ''}`}
            className={`bchip-input ${custom ? 'on' : ''}`}
            defaultValue={custom ? value : ''}
            placeholder="Otra…"
            aria-label={`${x.label}: otra respuesta`}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== value) set(x.key, v); else if (!v && custom) set(x.key, ''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
      </section>
    );
  };
  const MAIN = QUESTIONS.filter((x) => ['formato', 'objetivo', 'tono', 'duracion', 'cta'].includes(x.key));
  const MORE = QUESTIONS.filter((x) => ['publico', 'ritmo'].includes(x.key));

  return (
    <div className="cols" style={{ justifyContent: 'center' }}>
      <main className="card col" style={{ flex: '1 1 640px', maxWidth: 820, minWidth: 0, gap: 22, padding: 26, borderRadius: 20 }}>
        <header className="col" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 26, lineHeight: 1.15 }}>Cuéntame cómo lo quieres</h1>
          <span className="muted">{help === null ? 'Estoy viendo y oyendo tu video…' : help.resumen ? `Esto entendí: ${help.resumen}` : 'Toca una opción en cada fila. Con eso edito todo el video.'}</span>
        </header>

        <section className="col" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 17 }}>¿Quieres que se parezca a otro video?</h2>
            <span className="small muted">Copia su ritmo, letras y textos. Nunca su contenido.</span>
          </div>
          <div className="refs">
            <button className={`refcard ${!project.brief.referencia || project.brief.referencia === 'ninguna' ? 'on' : ''}`} aria-pressed={!project.brief.referencia || project.brief.referencia === 'ninguna'} onClick={() => set('referencia', 'ninguna')}>
              <span className="refthumb none" aria-hidden="true"><Icon name="close" size={22} /></span>
              <strong className="small">Sin referencia</strong>
            </button>
            {refs.map((r) => (
              <button key={r.id} className={`refcard ${project.brief.referencia === r.id ? 'on' : ''}`} aria-pressed={project.brief.referencia === r.id} onClick={() => set('referencia', r.id)} title={`${r.duration.toFixed(0)} s · un corte cada ${r.avgShot.toFixed(1)} s`}>
                <span className="refthumb" style={{ backgroundImage: `url(/ref/${encodeURIComponent(r.client)}/${encodeURIComponent(r.id)}/${r.frames[Math.min(2, r.frames.length - 1)]})` }} aria-hidden="true" />
                <strong className="small">{r.name}</strong>
              </button>
            ))}
            <button className="refcard add" disabled={Boolean(refJob)} onClick={() => refInput.current?.click()}>
              <span className="refthumb none" aria-hidden="true"><Icon name="upload" size={22} /></span>
              <strong className="small">{refJob || 'Subir video'}</strong>
            </button>
            <input ref={refInput} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRef(f); e.target.value = ''; }} />
          </div>
        </section>

        {MAIN.map(row)}

        {help?.preguntas.map((x) => (
          <label key={x.id} className="field" style={{ fontSize: 17, fontWeight: 700, gap: 8 }}>{x.pregunta}
            <input defaultValue={project.brief[`extra:${x.id}`] ?? ''} placeholder={`Ej.: ${x.ejemplo}`} style={{ fontWeight: 400 }}
              onBlur={(e) => set(`extra:${x.id}`, e.target.value.trim())} />
          </label>
        ))}
        <label className="field" style={{ fontSize: 17, fontWeight: 700, gap: 8 }}>¿Algo más que deba saber? <span className="small muted" style={{ fontWeight: 400 }}>(opcional)</span>
          <textarea rows={2} defaultValue={project.brief.notas ?? ''} placeholder="Ej.: que el precio salga grande · no cortes cuando muestro el plato" style={{ fontWeight: 400 }}
            onBlur={(e) => set('notas', e.target.value.trim())} />
        </label>

        <button className="btn primary" style={{ height: 54, fontSize: 18 }} disabled={Boolean(building)} onClick={build}>{building ? building : <><Icon name="sparkle" />{project.briefAppliedAt ? 'Volver a editar mi video' : 'Editar mi video'}</>}</button>
        <span className="small muted" style={{ textAlign: 'center' }}>La app corta, pone textos, subtítulos, música y efectos de sonido. Al terminar lo ves y lo exportas.</span>

        <details className="grp">
          <summary><Icon name="settings" /> Más opciones</summary>
          <div className="col" style={{ gap: 18 }}>{MORE.map(row)}</div>
        </details>
        <details className="grp" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) loadPrompt(); }}>
          <summary><Icon name="brief" /> Ver el prompt de edición</summary>
          <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', lineHeight: 1.5 }}>{prompt}</pre>
        </details>
        <details className="grp">
          <summary><Icon name="palette" /> {store.kit?.sector ? `Marca: ${store.kit.name} · ${SECTORS.find(([id]) => id === store.kit!.sector)?.[1]}` : 'Tu marca'}
            {store.kit?.sector && <button className="btn ghost small" style={{ float: 'right', marginTop: -4 }} disabled={!!manual} onClick={(e) => { e.preventDefault(); brandbook(); }} title="PDF de una página por tema: colores, letras, logo, cómo se ven sus reels y tono de voz">{manual || 'Manual de marca'}</button>}
          </summary>
          <div className="col">
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
      </main>
    </div>
  );
};
