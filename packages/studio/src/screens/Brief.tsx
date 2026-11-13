import React, { useEffect, useRef, useState } from 'react';
import { PERSONALITIES, SECTORS, VISION_TOPICS } from '@axioma/schema';
import type { Ctx } from '../App.tsx';
import { api, waitJob, type Job } from '../useProject.ts';
import { Icon } from '../Icon.tsx';
import { ProgressBar } from './Referencias.tsx';
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
  // Lo que dice cada opción es lo que hace la edición con el brief (brief.ts, applyBrief).
  { key: 'formato', label: 'Formato', title: '¿Dónde lo vas a publicar?', help: 'Todos salen en vertical 9:16; según dónde, cambia el ritmo, la duración o el cierre.', placeholder: 'Ej.: pantalla de un evento', options: [
    { value: 'Reel 9:16', title: 'Reel de Instagram', desc: 'Vertical 9:16, para el feed de Reels.' },
    { value: 'Historia 9:16', title: 'Historia', desc: 'Sube los subtítulos para dejar libre la zona de respuesta.' },
    { value: 'TikTok 9:16', title: 'TikTok', desc: 'Si no eliges ritmo, corta rápido.' },
    { value: 'YouTube Short 9:16', title: 'YouTube Short', desc: 'Lo deja en 60 s como máximo.' },
    { value: 'Anuncio 9:16', title: 'Anuncio pagado', desc: 'Siempre lleva frase de cierre, aunque no elijas una.' }] },
  { key: 'objetivo', label: 'Objetivo', title: '¿Qué quieres que haga quien lo vea?', help: 'El cierre del reel se arma alrededor de esto.', placeholder: 'Ej.: que reserven una clase de prueba', options: [
    { value: 'Mensajes por DM', title: 'Escribirte por DM', desc: 'Que te escriban para pedir info.' },
    { value: 'Comentarios', title: 'Comentar', desc: 'Que respondan u opinen.' },
    { value: 'Guardados', title: 'Guardarlo', desc: 'Contenido útil para volver a ver.' },
    { value: 'Compartidos', title: 'Compartirlo', desc: 'Que lo envíen a alguien.' },
    { value: 'Ir al link', title: 'Ir al link', desc: 'Visitar tu página, comprar o reservar.' },
    { value: 'Seguidores', title: 'Seguirte', desc: 'Ganar seguidores nuevos.' }] },
  { key: 'publico', label: 'Público', title: '¿Para quién es?', help: 'Ayuda a la IA a escribir el gancho y el texto para publicar.', placeholder: 'Ej.: dueños de pymes locales', options: [
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

/** Ediciones en marcha por proyecto: siguen vivas al salir y volver al brief (el servidor también las da por /api/jobs). */
const editing = new Map<string, Job>();
/** Qué pantalla Brief sigue cada edición: solo esa navega o avisa al terminar. */
const owner = new Map<string, symbol>();
const ninguna = (v?: string) => !v || v === 'ninguna';
/** Botón pequeño (lápiz, papelera) sobre la miniatura de una referencia. */
const ICON_BTN: React.CSSProperties = { width: 24, height: 24, padding: 0, border: 0, borderRadius: 6, background: 'rgba(0,0,0,.6)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' };

export const Brief: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const pid = encodeURIComponent(project.id);
  const forGoal = CTA_FOR[project.brief.objetivo ?? ''];
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [building, setBuilding] = useState('');
  const buildingRef = useRef(false);
  const busy = Boolean(building);

  const set = (key: string, v: string) => { store.update((p) => { if (v) p.brief[key] = v; else delete p.brief[key]; }); setSuggested((x) => x.filter((k) => k !== key)); };

  // La IA lee el video y propone las respuestas: el cliente solo confirma o cambia.
  const [help, setHelp] = useState<Help | null>(null);
  const [suggested, setSuggested] = useState<string[]>([]);
  useEffect(() => {
    let on = true;
    api<Help>(`/api/brief-ia?id=${pid}`).then((h) => {
      if (!on) return;
      setHelp(h);
      if (buildingRef.current) return;
      const fill = Object.entries(h.sugerido).filter(([, v]) => v);
      if (!fill.some(([k]) => !store.project?.brief[k])) return;
      // Se mira el proyecto de este momento, no el de cuando se pidió: nunca se pisa lo que el usuario ya eligió.
      const llenados: string[] = [];
      store.update((p) => { for (const [k, v] of fill) if (!p.brief[k]) { p.brief[k] = v; llenados.push(k); } });
      if (llenados.length) setSuggested(llenados);
    }).catch(() => on && setHelp({ resumen: '', sugerido: {}, preguntas: [], ia: false, prompt: '' }));
    return () => { on = false; };
  }, [project.id]);

  // Referencias del cliente: si ya hay un video que muestra cómo debe quedar, se elige aquí y la
  // edición copia su ritmo, subtítulos y textos. También se puede subir una nueva sin salir del brief.
  const [refs, setRefs] = useState<Ref[]>([]);
  const [refsLoaded, setRefsLoaded] = useState(false);
  const [refJob, setRefJob] = useState<{ msg: string; progress: number } | null>(null);
  const refInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setRefsLoaded(false);
    api<Ref[]>(`/api/references?id=${pid}`).then(setRefs).catch(() => {}).finally(() => setRefsLoaded(true));
  }, [project.id]);
  // Una referencia elegida que ya no existe cuenta como «Sin referencia» (así la trata también la edición).
  const refSel = ninguna(project.brief.referencia) ? null : refs.find((r) => r.id === project.brief.referencia) ?? null;
  const noRef = !refSel && (refsLoaded || ninguna(project.brief.referencia));
  const uploadRef = async (file: File) => {
    const base = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
    const nombre = (window.prompt('¿Cómo llamamos a esta referencia?', base) ?? '').trim() || base;
    setRefJob({ msg: 'Subiendo la referencia…', progress: 0 });
    try {
      const started = await api<Job>(`/api/references?id=${pid}&filename=${encodeURIComponent(file.name)}&nombre=${encodeURIComponent(nombre)}`, { method: 'POST', body: file });
      const done = await waitJob(started, (j) => alive.current && setRefJob({ msg: j.message, progress: j.progress }));
      const report = done.result!.report as Ref;
      if (!alive.current) return;
      setRefs((l) => [report, ...l.filter((x) => x.id !== report.id)]);
      // Si mientras tanto empezó una edición, no se toca el brief: pisaría la edición en curso.
      if (!buildingRef.current) set('referencia', report.id);
    } catch (e: any) { ctx.toast(`No se pudo analizar la referencia: ${e.message}`); } finally { if (alive.current) setRefJob(null); }
  };
  const renameRef = async (r: Ref) => {
    const name = window.prompt('Nuevo nombre de la referencia', r.name)?.trim();
    if (!name || name === r.name) return;
    try {
      setRefs(await api<Ref[]>(`/api/references?id=${pid}&ref=${encodeURIComponent(r.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }));
    } catch (e: any) { ctx.toast(e.message); }
  };
  const removeRef = async (r: Ref) => {
    if (!window.confirm(`¿Quitar la referencia «${r.name}»?\n\nDeja de aparecer en todos los videos de este cliente y se quitan los estilos guardados con ella. No se puede deshacer desde la app.`)) return;
    try {
      setRefs(await api<Ref[]>(`/api/references?id=${pid}&ref=${encodeURIComponent(r.id)}`, { method: 'DELETE' }));
      if (store.project?.brief.referencia === r.id) set('referencia', 'ninguna');
      await store.reloadExtras().catch(() => {});
      ctx.toast(`«${r.name}» quitada.`);
    } catch (e: any) { ctx.toast(e.message); }
  };
  // «Ver lo que la app va a hacer»: el plan real de la edición (el mismo que sigue al editar).
  const [plan, setPlan] = useState<string[] | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const briefKey = JSON.stringify(project.brief);
  useEffect(() => {
    if (!planOpen) return;
    let on = true;
    setPlan(null);
    // Primero se guarda lo último elegido, para que el plan lo tenga en cuenta.
    store.flush().catch(() => {})
      .then(() => api<{ plan: string[] }>(`/api/plan?id=${pid}`))
      .then((d) => on && setPlan(d.plan))
      .catch(() => on && setPlan([]));
    return () => { on = false; };
  }, [planOpen, briefKey]);

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
  /** Guarda el perfil de la marca y viste el video con su estilo. */
  const saveBrand = async () => {
    try {
      const d = await api(`/api/op?id=${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'marca', ...brand, name: brand.name || project.client || 'Mi marca' }) });
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
    try { tab?.document.write('<p style="font:16px system-ui,sans-serif;padding:24px">Armando tu manual de marca…</p>'); } catch { /* pestaña sin acceso: no pasa nada */ }
    setManual('Armando el manual…');
    try {
      const job = await api<Job>(`/api/op?id=${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'manual-marca' }) });
      const done = await waitJob(job, (j) => setManual(j.message));
      const url = `${done.result?.pdf}&v=${Date.now()}`;
      if (tab) tab.location.href = url; else window.location.href = url;
      ctx.toast(done.result?.hasKit ? 'Manual de marca listo.' : 'Manual listo con colores de ejemplo: guarda tu marca para que salga con la tuya.');
    } catch (e: any) { tab?.close(); ctx.toast(e.message); } finally { setManual(''); }
  };

  /** Espera a que se guarde lo último que se escribió (el guardado sale con un pequeño retraso). */
  const flushSaves = async () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    await store.flush();
  };
  /** Sigue una edición hasta el final; al terminar lleva a Resultado y exporta solo. */
  const follow = async (job: Job) => {
    const me = Symbol('brief');
    owner.set(project.id, me);
    editing.set(project.id, job);
    try {
      await waitJob(job, (j) => { editing.set(project.id, j); if (alive.current) setBuilding(j.message || 'Editando tu video…'); });
    } finally { editing.delete(project.id); }
    if (owner.get(project.id) !== me) return;
    owner.delete(project.id);
    const d = await api(`/api/project?id=${pid}`);
    if (!alive.current) {
      // Se salió del brief: si el video sigue abierto, se muestra ya editado (si no, un guardado pisaría la edición).
      if (store.latest()?.id === project.id) { store.replace(d.project); await store.reloadExtras().catch(() => {}); }
      ctx.toast(`«${project.name}» ya está editado. Ábrelo para verlo y exportarlo.`);
      return;
    }
    store.replace(d.project);
    await store.reloadExtras();
    ctx.go('listo', { s: null });
    // El video final se exporta solo; mientras tanto se puede ver en la pantalla de resultado.
    void ctx.exportNow();
  };
  const run = async (start: () => Promise<Job>) => {
    buildingRef.current = true;
    try { await follow(await start()); } catch (e: any) { ctx.toast(`No se pudo editar el video: ${e.message}`); } finally {
      buildingRef.current = false;
      if (alive.current) setBuilding('');
    }
  };
  // Si ya hay una edición en marcha (se salió y se volvió, o se recargó), se retoma: nunca se lanzan dos.
  useEffect(() => {
    let on = true;
    const attach = (j: Job) => { if (!on || buildingRef.current) return; setBuilding(j.message || 'Editando tu video…'); void run(async () => j); };
    const local = editing.get(project.id);
    if (local?.status === 'running') attach(local);
    api<(Job & { kind?: string })[]>(`/api/jobs?id=${pid}`).then((l) => {
      const j = Array.isArray(l) ? l.find((x) => x.status === 'running' && x.kind === 'crear') : undefined;
      if (j) attach(j);
    }).catch(() => {});
    return () => { on = false; };
  }, [project.id]);
  /** Edita el video según el brief y lleva a Resultado. */
  const build = async () => {
    if (buildingRef.current || refJob) return;
    if (project.briefAppliedAt && !window.confirm('Se vuelve a editar el video desde cero con estas respuestas: los cortes, textos y subtítulos que cambiaste a mano se reemplazan.\n\nSi luego prefieres la versión anterior, pulsa Deshacer.')) return;
    buildingRef.current = true;
    setBuilding('Guardando tus respuestas…');
    if (refsLoaded && !refSel && !ninguna(project.brief.referencia)) set('referencia', 'ninguna');
    try { await flushSaves(); } catch (e: any) {
      buildingRef.current = false; setBuilding('');
      return ctx.toast(`No se pudo guardar tus respuestas: ${e.message}`);
    }
    await run(() => api<Job>(`/api/op?id=${pid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'aplicar-brief' }) }));
  };

  const optionsOf = (x: Q) => {
    let opts = x.key === 'cta' && forGoal ? [{ value: forGoal, title: forGoal, desc: '' }, ...x.options.filter((o) => o.value !== forGoal)] : x.options;
    // En un montaje nadie habla a cámara: no hay cierre dicho que usar.
    if (x.key === 'cta' && project.kind === 'montaje') opts = opts.filter((o) => o.value !== SPOKEN_CTA);
    return opts;
  };
  const row = (x: Q) => {
    // Con referencia, el ritmo es el de la referencia; el tono sigue eligiendo música y efectos.
    if (refSel && x.key === 'ritmo') {
      return (
        <section key={x.key} className="col" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 17 }}>{x.title}</h2>
          <span className="pill" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}><Icon name="reference" size={12} />Lo toma de la referencia «{refSel.name}»</span>
        </section>
      );
    }
    const value = project.brief[x.key] ?? '';
    const opts = optionsOf(x);
    const custom = Boolean(value) && !opts.some((o) => o.value === value);
    return (
      <section key={x.key} className="col" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <h2 style={{ fontSize: 17 }}>{x.title}</h2>
          {suggested.includes(x.key) && <span className="pill" title="Lo propuso la IA al oír tu video. Cámbialo si no es."><Icon name="sparkle" size={12} />sugerido</span>}
        </div>
        {x.key === 'tono' && refSel && <span className="small muted">Las letras, los textos y el ritmo los copia de «{refSel.name}»; el tono elige la música y los efectos.</span>}
        {x.key === 'tono' && !refSel && store.kit?.sector && <span className="small muted">El estilo de los textos y la imagen lo pone tu marca «{store.kit.name}»; el tono guía las palabras y la música.</span>}
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
            placeholder={x.key === 'duracion' ? 'Otra (ej.: 90 s)' : 'Otra…'}
            title={x.key === 'duracion' ? 'Escríbelo como quieras: «1 minuto», «90 s», «máximo 40 s»…' : undefined}
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
  const thumb = (r: Ref) => `url(/ref/${encodeURIComponent(r.client)}/${encodeURIComponent(r.id)}/${r.frames[Math.min(2, r.frames.length - 1)]})`;
  // Mientras edita, el formulario queda bloqueado: un cambio a mitad pisaría la edición.
  const lock: React.CSSProperties = { border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 };

  return (
    <div className="cols" style={{ justifyContent: 'center' }}>
      <main className="card col" style={{ flex: '1 1 640px', maxWidth: 820, minWidth: 0, gap: 22, padding: 26, borderRadius: 20 }}>
        <header className="col" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 26, lineHeight: 1.15 }}>Cuéntame cómo lo quieres</h1>
          <span className="muted">{help === null ? 'Estoy viendo y oyendo tu video…' : help.resumen ? `Esto entendí: ${help.resumen}` : 'Toca una opción en cada fila. Con eso edito todo el video.'}</span>
        </header>

        <fieldset disabled={busy} style={lock}>
          <section className="col" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 17 }}>¿Quieres que se parezca a otro video?</h2>
              <span className="small muted">Copia su ritmo, letras y textos. Nunca su contenido.</span>
              <button className="btn ghost small" style={{ marginLeft: 'auto' }} onClick={() => ctx.go('referencias', { s: null })}><Icon name="reference" />Referencias</button>
            </div>
            <div className="refs">
              <button className={`refcard ${noRef ? 'on' : ''}`} aria-pressed={noRef} onClick={() => set('referencia', 'ninguna')}>
                <span className="refthumb none" aria-hidden="true"><Icon name="close" size={22} /></span>
                <strong className="small">Sin referencia</strong>
              </button>
              {refs.map((r) => (
                <div key={r.id} style={{ position: 'relative', flex: 'none' }}>
                  <button className={`refcard ${refSel?.id === r.id ? 'on' : ''}`} aria-pressed={refSel?.id === r.id} aria-label={r.name} onClick={() => set('referencia', r.id)} title={`${r.name} · ${r.duration.toFixed(0)} s · un corte cada ${r.avgShot.toFixed(1)} s`}>
                    <span className="refthumb" style={{ backgroundImage: thumb(r) }} aria-hidden="true" />
                    <strong className="small">{r.name}</strong>
                  </button>
                  <span style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button type="button" style={ICON_BTN} aria-label={`Cambiar el nombre de ${r.name}`} title="Cambiar el nombre" onClick={() => renameRef(r)}><Icon name="edit" size={13} /></button>
                    <button type="button" style={ICON_BTN} aria-label={`Quitar ${r.name}`} title="Quitar esta referencia" onClick={() => removeRef(r)}><Icon name="trash" size={13} /></button>
                  </span>
                </div>
              ))}
              <button className="refcard add" disabled={Boolean(refJob)} onClick={() => refInput.current?.click()}>
                <span className="refthumb none" aria-hidden="true"><Icon name="upload" size={22} /></span>
                <strong className="small">{refJob ? 'Analizando…' : 'Subir video'}</strong>
              </button>
              <input ref={refInput} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRef(f); e.target.value = ''; }} />
            </div>
            {refJob && (
              <div className="col" role="status" style={{ gap: 4 }}>
                <span className="small muted">{refJob.msg}</span>
                <ProgressBar progress={refJob.progress} />
              </div>
            )}
          </section>

          {MAIN.map(row)}

          {help?.preguntas.map((x) => (
            <label key={x.id} className="field" style={{ fontSize: 17, fontWeight: 700, gap: 8 }}>{x.pregunta}
              <input defaultValue={project.brief[`extra:${x.id}`] ?? ''} placeholder={`Ej.: ${x.ejemplo}`} style={{ fontWeight: 400 }}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (project.brief[`extra:${x.id}`] ?? '')) set(`extra:${x.id}`, v); }} />
            </label>
          ))}
          <label className="field" style={{ fontSize: 17, fontWeight: 700, gap: 8 }}>¿Algo más que deba saber? <span className="small muted" style={{ fontWeight: 400 }}>(opcional)</span>
            <textarea rows={2} defaultValue={project.brief.notas ?? ''} placeholder="Ej.: que el precio salga grande · no cortes cuando muestro el plato" style={{ fontWeight: 400 }}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (project.brief.notas ?? '')) set('notas', v); }} />
          </label>
        </fieldset>

        <button className="btn primary" style={{ height: 54, fontSize: 18 }} disabled={busy || Boolean(refJob)} onClick={build}>
          {building || (refJob ? 'Esperando a que termine de analizarse la referencia…' : <><Icon name="sparkle" />{project.briefAppliedAt ? 'Volver a editar mi video' : 'Editar mi video'}</>)}
        </button>
        <span className="small muted" style={{ textAlign: 'center' }}>La app corta, pone textos{project.kind === 'montaje' ? '' : ', subtítulos'}, música y efectos de sonido. Al terminar lo ves y se exporta solo.</span>

        <details className="grp">
          <summary><Icon name="settings" /> Más opciones</summary>
          <fieldset disabled={busy} style={{ ...lock, gap: 18 }}>{MORE.map(row)}</fieldset>
        </details>
        <details className="grp" onToggle={(e) => setPlanOpen((e.target as HTMLDetailsElement).open)}>
          <summary><Icon name="brief" /> Ver lo que la app va a hacer</summary>
          <div className="col small" style={{ gap: 4, paddingBottom: 12, lineHeight: 1.5 }} aria-live="polite">
            {plan === null ? <span className="muted">Mirando tus respuestas…</span>
              : plan.length ? plan.map((l, i) => <span key={i} className="row" style={{ gap: 6, alignItems: 'baseline', flexWrap: 'nowrap' }}><Icon name="check" size={13} style={{ flex: 'none' }} />{l}</span>)
              : <span className="muted">No se pudo armar el plan ahora. Puedes editar igual.</span>}
          </div>
        </details>
        <details className="grp">
          <summary><Icon name="palette" /> {store.kit?.sector ? `Marca: ${store.kit.name} · ${SECTORS.find(([id]) => id === store.kit!.sector)?.[1]}` : 'Tu marca'}
            {store.kit?.sector && <button className="btn ghost small" style={{ float: 'right', marginTop: -4 }} disabled={!!manual} onClick={(e) => { e.preventDefault(); brandbook(); }} title="PDF de una página por tema: colores, letras, logo, cómo se ven sus videos y tono de voz">{manual || 'Manual de marca'}</button>}
          </summary>
          <div className="col">
            <span className="small muted">
              La marca se guarda para todos los videos de «{project.client || 'personal'}», no solo para este.
              {!project.client ? ' Estos videos no tienen cliente: si la marca es de un cliente, crea el video dentro de ese cliente.' : ''}
            </span>
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
              <button className="btn primary" disabled={!brand.sector || busy} onClick={saveBrand}>Guardar marca</button>
            </div>
          </div>
        </details>
      </main>
    </div>
  );
};
