import { AxiLive } from '../AxiLive.tsx';
import React, { useEffect, useMemo, useState } from 'react';
import { applyVariant, motionGallery, suggestVariants, type Scene, type SceneVariant, VISION_TOPICS } from '@axioma/schema';
import type { Ctx, Screen } from '../App.tsx';
import { ROLE_LABEL, VISUAL_LABEL } from '../SceneFrame.tsx';
import { VariantPreview } from '../VariantPreview.tsx';
import { api, waitJob, type Job } from '../useProject.ts';
import { askAssistant } from '../useProject.ts';
import { BankKey, useBankKey } from '../Bank.tsx';
import { Icon } from '../Icon.tsx';

const CATEGORY: Record<string, string> = { motion: 'Gráfico animado', broll: 'Video de apoyo', color: 'Color', tipografia: 'Tipografía', camara: 'Cámara' };
const FILTERS = ['Todo', 'Texto', 'Color', 'Video de apoyo', 'Gráficos animados'];
/** Nombre que se muestra de una variante (sin jerga). */
const labelOf = (v: SceneVariant) => v.label.replace(/^Motion graphics/, 'Gráfico animado').replace(/^B-roll/, 'Video de apoyo');
/** Variantes con el marcador «[TU TEXTO]» (escenas sin voz ni texto): nunca se muestran ni se ponen. */
const hasPlaceholder = (v: SceneVariant) => JSON.stringify(v).includes('[TU TEXTO]');

// De dónde se llegó a Variantes, para que «Volver» lleve ahí (Resultado si se abrió directo).
const VOLVER: Partial<Record<Screen, string>> = { listo: 'Resultado', editor: 'Editor', storyboard: 'Storyboard', texto: 'Texto', audio: 'Audio', imagenes: 'Imágenes', brief: 'Brief', referencias: 'Referencias' };
let origen: Screen = 'listo';
if (typeof window !== 'undefined') {
  const screenOf = (u: string) => (u.split('#')[1] ?? '').replace(/^\/?/, '').split('?')[0] as Screen;
  window.addEventListener('hashchange', (e) => {
    const to = screenOf(e.newURL), from = screenOf(e.oldURL);
    if (to === 'variantes' && from !== 'variantes') origen = VOLVER[from] ? from : 'listo';
  });
}

export const Variantes: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const project = ctx.store.project!;
  const scene = project.scenes.find((s) => s.id === ctx.sceneId) ?? project.scenes[0];
  if (!scene) {
    return (
      <main className="page">
        <AxiLive state="dormido" size={64} />
        <h1 style={{ fontSize: 26 }}>Todavía no hay escenas</h1>
        <p className="muted">Responde el brief y la app arma la edición sola. Después vuelve aquí para probar variantes de cada escena.</p>
        <div className="row"><button className="btn primary" onClick={() => ctx.go('brief')}>Ir al brief</button></div>
      </main>
    );
  }
  return <VariantesDeEscena ctx={ctx} scene={scene} />;
};

const VariantesDeEscena: React.FC<{ ctx: Ctx; scene: Scene }> = ({ ctx, scene }) => {
  const { store } = ctx;
  const project = store.project!;
  // Aspecto de imagen que va con lo que la app vio en el video.
  const seenLook = VISION_TOPICS.find((t) => t.id === store.vision?.topic)?.look ?? null;
  const [filter, setFilter] = useState('Todo');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState('');
  const [round, setRound] = useState(0);
  useEffect(() => setRound(0), [scene.id]);

  // Al seleccionar una escena hay siempre variantes: las guardadas (de la IA o ya elegidas)
  // o, si no hay, unas sugeridas al instante según lo que se dice y el estilo.
  const suggested = useMemo(
    () => (!scene.variants.length ? suggestVariants(project, scene, store.transcript, round, seenLook).filter((v) => !hasPlaceholder(v)) : []),
    [project, scene, store.transcript, round],
  );
  // Todos los gráficos animados que se pueden armar solos con lo que se dice en esta escena.
  const gallery = useMemo(() => motionGallery(project, scene, store.transcript).filter((v) => !hasPlaceholder(v)), [project, scene, store.transcript]);
  const idx = project.scenes.indexOf(scene);
  const saved = scene.variants.length > 0;
  const shown: SceneVariant[] = saved ? scene.variants.filter((v) => !hasPlaceholder(v)) : suggested;

  // Espera de subidas y descargas (se muestra junto a donde se hizo clic).
  const [busy, setBusy] = useState('');
  const [busyAt, setBusyAt] = useState<'card' | 'broll' | 'mine' | 'stock' | ''>('');
  const work = async (at: typeof busyAt, label: string, fn: (progress: (m: string) => void) => Promise<void>) => {
    setBusy(label); setBusyAt(at);
    try { await fn((m) => setBusy(m || label)); } catch (e: any) { ctx.toast(e.message); } finally { setBusy(''); setBusyAt(''); }
  };

  const choose = (v: SceneVariant) => {
    store.update((p) => {
      const s = p.scenes[idx];
      if (!s.variants.length) s.variants = shown; // se guardan las sugeridas junto con la elegida
      applyVariant(s, v);
    });
    ctx.toast(`Puesta en la escena ${idx + 1}. Deshacer la quita.`);
  };
  /** Una variante de video de apoyo sin archivo todavía. */
  const needsClip = (v: SceneVariant) => v.visual === 'broll' && !/\.(mp4|mov|m4v|webm|jpe?g|png|webp)$/i.test(v.brollFile ?? '');

  const [idea, setIdea] = useState('');
  const [making, setMaking] = useState('');
  /** Crea una imagen desde la idea y la pone animada como video de apoyo de la escena. */
  const brollFromIdea = async () => {
    setMaking('Creando la imagen…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'broll-idea', sceneId: scene.id, idea }) });
      await waitJob(job, (j) => setMaking(j.message || 'Creando la imagen…'));
      const d = await api(`/api/project?id=${encodeURIComponent(project.id)}`);
      store.replace(d.project);
      ctx.toast('Imagen creada y puesta como video de apoyo, con la cámara acercándose. Cambia el movimiento en el editor si quieres.');
    } catch (e: any) { ctx.toast(`No se pudo crear la imagen: ${e.message}`); } finally { setMaking(''); }
  };
  /** Única forma de subir: una imagen o un video propio como video de apoyo (licencia: propia). */
  const uploadOwn = (file: File, at: 'card' | 'broll') => work(at, 'Subiendo tu archivo…', async () => {
    const d = await api(`/api/broll?id=${encodeURIComponent(project.id)}&scene=${scene.id}&filename=${encodeURIComponent(file.name)}&license=propia`, { method: 'POST', body: file });
    store.replace(d.project);
    ctx.toast('Video de apoyo puesto en la escena. Queda guardado para usarlo en otras.');
  });

  // Buscador de videos de stock (Pexels o Pixabay, el que tenga clave).
  const [pexelsKey, recheckPexels] = useBankKey('pexels');
  const [pixabayKey, recheckPixabay] = useBankKey('pixabay');
  const pexelsOk = pexelsKey == null || pixabayKey == null ? null : pexelsKey || pixabayKey;
  const bankName = pexelsKey ? 'Pexels' : 'Pixabay';
  const [pq, setPq] = useState('');
  const [pexels, setPexels] = useState<{ q: string; items: { id: number; image?: string; duration: number; author: string }[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const searchPexels = async () => {
    setSearching(true);
    try {
      const d = await api<{ results: any[] }>(`/api/pexels?q=${encodeURIComponent(pq.trim())}`);
      setPexels({ q: pq.trim(), items: d.results });
      if (!d.results.length) ctx.toast(`${bankName} no encontró videos con esas palabras. Prueba en inglés o con otras palabras.`);
    } catch (e: any) { ctx.toast(e.message); } finally { setSearching(false); }
  };
  const usePexels = (pexelsId: number) => work('stock', 'Descargando el video…', async () => {
    const d = await api(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'broll-pexels', sceneId: scene.id, q: pexels?.q, pexelsId }) });
    store.replace(d.project);
    ctx.toast(`Video de ${bankName} puesto como video de apoyo de la escena.`);
  });

  // Búsqueda en tu propio material (todos los videos del cliente): lo que se ve y lo que se dice.
  type Hit = { projectId: string; projectName: string; file: string; t: number; duration?: number; image: boolean; kind: 'se-ve' | 'se-dice'; text?: string };
  const [mq, setMq] = useState('');
  const [mine, setMine] = useState<{ q: string; hits: Hit[] } | null>(null);
  const [looking, setLooking] = useState('');
  const searchMine = async () => {
    setLooking('Buscando…');
    try {
      const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'buscar-material', q: mq.trim() }) });
      const done = await waitJob(job, (j) => setLooking(j.message || 'Buscando…'));
      const hits = (done.result?.hits ?? []) as Hit[];
      setMine({ q: mq.trim(), hits });
      if (!hits.length) ctx.toast('No encontré nada parecido en tu material. Prueba con otras palabras o busca en los videos de stock.');
    } catch (e: any) { ctx.toast(e.message); } finally { setLooking(''); }
  };
  const useMine = (h: Hit) => work('mine', 'Cortando el momento de tu material…', async (progress) => {
    const job = await api<Job>(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'usar-material', sceneId: scene.id, projectId: h.projectId, file: h.file, t: h.t, duracion: h.duration }) });
    await waitJob(job, (j) => progress(j.message || 'Cortando…'));
    const d = await api(`/api/project?id=${encodeURIComponent(project.id)}`);
    store.replace(d.project);
    ctx.toast(`Puesto como video de apoyo: ${h.projectName}${h.image ? '' : `, segundo ${Math.round(h.t)}`}.`);
  });
  const thumbOf = (h: Hit) => `/api/thumb?id=${encodeURIComponent(h.projectId)}&t=${h.image ? 0 : h.t.toFixed(2)}${h.file.startsWith('proxies/') ? '' : `&file=${encodeURIComponent(h.file)}`}`;

  const others = () => {
    if (saved) {
      if (!window.confirm(`Se reemplazan las ${scene.variants.length} variantes guardadas de esta escena por otras sugeridas. ¿Seguir?`)) return;
      store.update((p) => { p.scenes[idx].variants = []; p.scenes[idx].chosenVariant = undefined; });
      ctx.toast('Variantes guardadas reemplazadas. Deshacer las recupera.');
    }
    setRound((r) => r + 1);
  };

  /** Se lo pide a la IA aquí mismo; el resultado aparece solo en la pantalla. */
  const ask = async (msg: string) => {
    setSending(true);
    setStep('Enviando a la IA…');
    try {
      const r = await askAssistant(project.id, msg, scene.id, setStep);
      setText('');
      await store.reloadExtras();
      ctx.toast(r.saved || r.text.length <= 220 ? r.text : r.text.slice(0, 218) + '…');
    } catch (e: any) { ctx.toast(`La IA no pudo hacerlo: ${e.message}`); } finally { setSending(false); setStep(''); }
  };
  const askVariants = () => ask(`Genera 4 variantes distintas y creativas para la escena ${scene.id}${filter === 'Todo' ? '' : `, variando solo: ${filter.toLowerCase()}`}. No repitas estas: ${shown.map((v) => v.label).join(', ')}. Guárdalas con generar_variantes; no elijas ninguna.`);

  const locked = Boolean(busy) || Boolean(making);
  const busyPill = (at: typeof busyAt) => busy && busyAt === at ? <span className="pill" role="status">{busy}</span> : null;
  const uploadLabel = (at: 'card' | 'broll', label: string, primary: boolean) => (
    <label className={`btn rect ${primary ? 'primary' : ''}`} style={{ cursor: 'pointer', ...(locked ? { opacity: 0.5, pointerEvents: 'none' } : {}) }} aria-disabled={locked}>
      <Icon name="upload" /> {label}
      <input type="file" accept="video/*,image/*" hidden disabled={locked} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadOwn(f, at); e.target.value = ''; }} />
    </label>
  );
  const volverA = VOLVER[origen] ?? 'Resultado';

  return (
    <>
      <header className="top" style={{ borderTop: 0 }}>
        <button className="btn rect" onClick={() => ctx.go(origen, { s: origen === 'editor' || origen === 'storyboard' ? scene.id : undefined })}><Icon name="back" /> Volver a {volverA}</button>
        <div className="col" style={{ gap: 0 }}>
          <strong style={{ font: "700 18px 'Sora', sans-serif" }}>Variantes · Escena {idx + 1} · {scene.title || ROLE_LABEL[scene.role]}</strong>
          <span className="muted small">{saved ? 'Variantes guardadas de esta escena.' : 'Una de cada tipo: gráfico animado, video de apoyo, color, tipografía y cámara. La miniatura es el fotograma real.'} Elige una y la escena se reemplaza.</span>
        </div>
        <div className="row spacer">
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>Escena
            <select value={scene.id} onChange={(e) => ctx.go('variantes', { s: e.target.value })}>
              {project.scenes.map((s, i) => <option key={s.id} value={s.id}>{i + 1} · {s.title || ROLE_LABEL[s.role]}</option>)}
            </select>
          </label>
          <button className="btn" onClick={others}><Icon name="refresh" /> {saved ? 'Reemplazar por otras' : 'Otras'}</button>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Qué variar al pedir a la IA">
            {FILTERS.map((f) => <option key={f} value={f}>Variar: {f}</option>)}
          </select>
          <button className="btn" disabled={sending} onClick={askVariants}><Icon name="sparkle" /> {sending ? 'La IA está trabajando…' : 'Pedir variantes a la IA'}</button>
        </div>
      </header>

      <div className="cols" style={{ flex: 'none', overflow: 'visible' }}>
        <div className="col" style={{ flex: '1 1 200px', maxWidth: 230 }}>
          <span className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Actual</span>
          <VariantPreview project={project} sceneId={scene.id} variant={null} transcript={store.transcript} store={store} style={{ borderRadius: 14 }} />
          <span className="muted small">{VISUAL_LABEL[scene.visual]}{scene.onScreenText ? ` · "${scene.onScreenText}"` : ' · sin texto'}{scene.punchZoom ? ' · zoom' : ''}{scene.transition ? ` · entra con ${scene.transition.id}` : ''}</span>
        </div>

        <div className="vgrid">
          {shown.map((v) => {
            const on = scene.chosenVariant === v.id && saved;
            return (
              <article key={v.id + v.label} className={`card col vcard ${on ? 'on' : ''}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="small muted" style={{ fontWeight: 700 }}>{v.id.toUpperCase()}</span>
                  <span className={`chip ${v.visual}`} style={{ alignSelf: 'auto' }}>{CATEGORY[v.category ?? ''] ?? VISUAL_LABEL[v.visual]}</span>
                </div>
                {needsClip(v) ? (
                  <div className="frame card-motion" style={{ border: '2px dashed var(--line)', background: 'transparent' }}>
                    <span className="tpl-name" style={{ color: 'var(--muted)' }}>Falta el video de apoyo</span>
                  </div>
                ) : <VariantPreview project={project} sceneId={scene.id} variant={v} transcript={store.transcript} store={store} />}
                <h2 style={{ fontSize: 15, fontFamily: 'inherit', fontWeight: 600 }}>{labelOf(v)}</h2>
                <span className="muted small" style={{ minHeight: 34 }}>{v.notes ?? v.brollFile ?? v.motionTemplate ?? ''}</span>
                <div className="row small muted" style={{ minHeight: 18 }}>
                  {v.punchZoom ? <span className="pill line">zoom</span> : null}
                  {v.transition ? <span className="pill line">entra: {v.transition}</span> : null}
                </div>
                {needsClip(v) ? (
                  <>
                    {uploadLabel('card', 'Subir imagen o video', true)}
                    {busyPill('card')}
                  </>
                ) : <button className="btn rect primary" style={{ height: 44 }} onClick={() => choose(v)}>{on ? <><Icon name="check" /> Seleccionada</> : 'Elegir'}</button>}
              </article>
            );
          })}
        </div>
      </div>

      <section className="page" style={{ flex: 'none', paddingTop: 0, paddingBottom: 0 }}>
        <div className="card col" style={{ padding: 16, borderRadius: 16, gap: 10 }}>
          <h2 style={{ fontSize: 20 }}>Video de apoyo para esta escena</h2>
          <span className="muted small">Es una imagen o un video que se ve encima mientras sigue el audio. Escribe una idea y la app crea la imagen y la anima, o sube la tuya.</span>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: '1 1 320px' }} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Ej.: taza de café humeante sobre una mesa de madera"
              onKeyDown={(e) => { if (e.key === 'Enter' && idea.trim().length > 2 && !locked) brollFromIdea(); }} />
            <button className="btn rect" disabled={idea.trim().length < 3 || locked} onClick={brollFromIdea}><Icon name="wand" /> {making || 'Crear imagen y animarla'}</button>
            {uploadLabel('broll', 'Subir imagen o video', false)}
            {busyPill('broll')}
          </div>
          <span className="muted small">La imagen la crea un servicio gratuito en internet; solo se le envía el texto de la idea.</span>
          <strong className="small" style={{ marginTop: 6 }}>Busca en tu material</strong>
          <span className="muted small">Describe lo que quieres ver («gente en la calle», «manos en el portátil») o una frase que dijiste. Se busca en todos los videos de este cliente, aquí mismo en tu computador. La primera vez tarda más porque revisa todo.</span>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: '1 1 320px' }} value={mq} onChange={(e) => setMq(e.target.value)} placeholder="Ej.: hombres entrenando en la calle"
              onKeyDown={(e) => { if (e.key === 'Enter' && mq.trim().length > 1 && !looking) searchMine(); }} />
            <button className="btn rect" disabled={mq.trim().length < 2 || Boolean(looking)} onClick={searchMine}><Icon name="search" /> {looking || 'Buscar en mi material'}</button>
          </div>
          {busyPill('mine')}
          {mine && mine.hits.length > 0 && (
            <div className="vgrid" style={{ flex: 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {mine.hits.map((h) => (
                <button key={`${h.projectId}${h.file}${h.t}`} className="card col" style={{ padding: 6, gap: 4, textAlign: 'left', cursor: 'pointer' }} disabled={locked} onClick={() => useMine(h)} title="Usar este momento en la escena">
                  <img src={thumbOf(h)} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 8, background: 'var(--line)' }} />
                  <span className="small" style={{ fontWeight: 600 }}>{h.kind === 'se-dice' ? 'Lo dices' : 'Se ve'}{h.image ? '' : ` · ${Math.floor(h.t / 60)}:${String(Math.floor(h.t % 60)).padStart(2, '0')}`}</span>
                  <span className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.projectName}</span>
                  {h.text && <span className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>«{h.text}»</span>}
                </button>
              ))}
            </div>
          )}
          <strong className="small" style={{ marginTop: 6 }}>O busca un video de stock en {bankName} (gratis, uso comercial)</strong>
          {pexelsOk === false ? <BankKey banco="pixabay" name="Pixabay" link="https://pixabay.com/api/docs/#api_search_videos" onSaved={() => { recheckPixabay(); recheckPexels(); }} toast={ctx.toast} /> : (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <input className="input" style={{ flex: '1 1 320px' }} value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Ej.: oficina, café, gimnasio, ciudad de noche"
                onKeyDown={(e) => { if (e.key === 'Enter' && pq.trim().length > 1 && !searching) searchPexels(); }} />
              <button className="btn rect" disabled={pq.trim().length < 2 || searching} onClick={searchPexels}><Icon name="search" /> {searching ? 'Buscando…' : `Buscar en ${bankName}`}</button>
            </div>
          )}
          {busyPill('stock')}
          {pexels && pexels.items.length > 0 && (
            <div className="vgrid" style={{ flex: 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {pexels.items.map((v) => (
                <button key={v.id} className="card col" style={{ padding: 6, gap: 4, textAlign: 'left', cursor: 'pointer' }} disabled={locked} onClick={() => usePexels(v.id)} title="Usar este video en la escena">
                  {v.image && <img src={v.image} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '9 / 16', objectFit: 'cover', borderRadius: 8 }} />}
                  <span className="small muted">{v.duration} s · {v.author}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="page" style={{ flex: 'none', paddingTop: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ fontSize: 20 }}>Gráficos animados para esta escena</h2>
          <span className="muted small">{gallery.length ? `${gallery.length} hechos solos con lo que se dice aquí: cifras, frases y pasos. Elige uno.` : 'En esta escena nadie habla: escribe un texto para ella en el editor y aquí saldrán gráficos con ese texto.'}</span>
        </div>
        {gallery.length > 0 && (
          <div className="vgrid" style={{ flex: 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
            {gallery.map((v) => {
              const used = scene.motionTemplate != null && scene.motionTemplate === v.motionTemplate && JSON.stringify(scene.motionData ?? {}) === JSON.stringify(v.motionData ?? {});
              return (
                <article key={v.id} className={`card col vcard ${used ? 'on' : ''}`}>
                  <VariantPreview project={project} sceneId={scene.id} variant={v} transcript={store.transcript} store={store} />
                  <h3 style={{ fontSize: 14, fontFamily: 'inherit', fontWeight: 600 }}>{v.label.replace('Motion graphics · ', '')}</h3>
                  <span className="muted small" style={{ minHeight: 34 }}>{v.notes}</span>
                  <button className="btn rect" style={{ height: 40 }} onClick={() => {
                    store.update((p) => { applyVariant(p.scenes[idx], v); p.scenes[idx].chosenVariant = undefined; });
                    ctx.toast(`Gráfico puesto en la escena ${idx + 1}. Deshacer lo quita.`);
                  }}>{used ? <><Icon name="check" /> En la escena</> : 'Usar'}</button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="tl" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <label className="row" style={{ flex: '1 1 420px', flexWrap: 'nowrap' }}>
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}>Pídele un cambio a la IA</span>
          <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: más corto, que el texto diga otra cosa, video de apoyo de oficina"
            onKeyDown={(e) => { if (e.key === 'Enter' && text.trim() && !sending) ask(`En la escena ${scene.id}: ${text.trim()}`); }} />
        </label>
        <button className="btn cyan rect" disabled={!text.trim() || sending} onClick={() => ask(`En la escena ${scene.id}: ${text.trim()}`)}><Icon name="sparkle" /> Pedir a la IA</button>
        {step && <span className="pill" role="status">{step}</span>}
      </footer>
    </>
  );
};
