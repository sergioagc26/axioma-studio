import React, { useEffect, useMemo, useState } from 'react';
import { applyVariant, motionGallery, suggestVariants, type SceneVariant } from '@snz/schema';
import type { Ctx } from '../App.tsx';
import { ROLE_LABEL, VISUAL_LABEL } from '../SceneFrame.tsx';
import { VariantPreview } from '../VariantPreview.tsx';
import { api } from '../useProject.ts';
import { askAssistant } from '../useProject.ts';

const CATEGORY: Record<string, string> = { motion: 'Motion graphics', broll: 'B-roll', color: 'Color', tipografia: 'Tipografía' };
const FILTERS = ['Todo', 'Texto', 'Color', 'Toma / b-roll', 'Motion graphics'];

export const Variantes: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const scene = project.scenes.find((s) => s.id === ctx.sceneId) ?? project.scenes[0];
  const [filter, setFilter] = useState('Todo');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState('');
  const [round, setRound] = useState(0);
  useEffect(() => setRound(0), [scene?.id]);

  // Al seleccionar un clip hay siempre 3 variantes: las guardadas (de Claude o ya elegidas)
  // o, si no hay, 3 sugeridas al instante según lo que se dice y el estilo.
  const suggested = useMemo(
    () => (scene && !scene.variants.length ? suggestVariants(project, scene, store.transcript, round) : []),
    [project, scene, store.transcript, round],
  );
  // Todos los motion graphics que se pueden armar solos con lo que se dice en este clip.
  const gallery = useMemo(() => (scene ? motionGallery(project, scene, store.transcript) : []), [project, scene, store.transcript]);
  if (!scene) return <div className="page"><p className="muted">No hay escenas.</p></div>;
  const idx = project.scenes.indexOf(scene);
  const saved = scene.variants.length > 0;
  const shown: SceneVariant[] = saved ? scene.variants : suggested;

  const choose = (v: SceneVariant) => store.update((p) => {
    const s = p.scenes[idx];
    if (!s.variants.length) s.variants = shown; // se guardan las sugeridas junto con la elegida
    applyVariant(s, v);
  });
  const [license, setLicense] = useState('');
  /** Una variante de b-roll sin archivo todavía. */
  const needsClip = (v: SceneVariant) => v.visual === 'broll' && !/\.(mp4|mov|m4v|webm)$/i.test(v.brollFile ?? '');
  /** Sube un clip y lo pone como b-roll de la escena. */
  const uploadBroll = async (file: File) => {
    if (!license.trim()) return ctx.toast('Escribe primero la licencia del clip (por ejemplo: propia, Pexels).');
    try {
      const d = await api(`/api/broll?id=${encodeURIComponent(project.id)}&scene=${scene.id}&filename=${encodeURIComponent(file.name)}&license=${encodeURIComponent(license.trim())}`, { method: 'POST', body: file });
      store.replace(d.project);
      ctx.toast('B-roll puesto en la escena. Queda guardado para usarlo en otras.');
    } catch (e: any) { ctx.toast(e.message); }
  };

  const others = () => {
    if (saved) store.update((p) => { p.scenes[idx].variants = []; p.scenes[idx].chosenVariant = undefined; });
    setRound((r) => r + 1);
  };

  /** Se lo pide a Claude aquí mismo; el resultado aparece solo en la pantalla. */
  const ask = async (msg: string) => {
    setSending(true);
    setStep('Enviando a Claude…');
    try {
      const r = await askAssistant(project.id, msg, scene.id, setStep);
      setText('');
      await store.reloadExtras();
      ctx.toast(r.saved || r.text.length <= 220 ? r.text : r.text.slice(0, 218) + '…');
    } catch (e: any) { ctx.toast(`Claude no pudo hacerlo: ${e.message}`); } finally { setSending(false); setStep(''); }
  };
  const askVariants = () => ask(`Genera 4 variantes distintas y creativas para la escena ${scene.id}${filter === 'Todo' ? '' : `, variando solo: ${filter.toLowerCase()}`}. No repitas estas: ${shown.map((v) => v.label).join(', ')}. Guárdalas con generar_variantes; no elijas ninguna.`);

  return (
    <>
      <header className="top" style={{ borderTop: 0 }}>
        <button className="btn rect" onClick={() => ctx.go('editor', { s: scene.id })}>‹ Volver al editor</button>
        <div className="col" style={{ gap: 0 }}>
          <strong style={{ font: "700 18px 'Space Grotesk', sans-serif" }}>Variantes · Escena {idx + 1} · {scene.title || ROLE_LABEL[scene.role]}</strong>
          <span className="muted small">{saved ? 'Variantes guardadas de esta escena.' : 'Una de cada tipo: motion graphics, b-roll, color y tipografía. La miniatura es el fotograma real.'} Elige una y la escena se reemplaza.</span>
        </div>
        <div className="row spacer">
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>Escena
            <select value={scene.id} onChange={(e) => ctx.go('variantes', { s: e.target.value })}>
              {project.scenes.map((s, i) => <option key={s.id} value={s.id}>{i + 1} · {s.title || ROLE_LABEL[s.role]}</option>)}
            </select>
          </label>
          <button className="btn" onClick={others}>Otras 4</button>
          <button className="btn primary" disabled={sending} onClick={askVariants}>{sending ? 'Claude trabajando…' : 'Pedir variantes a Claude'}</button>
        </div>
      </header>

      <section className="row" style={{ padding: '12px 22px', borderBottom: '1px solid var(--line)' }}>
        <span className="small muted">Al pedir a Claude, variar solo:</span>
        {FILTERS.map((f) => (
          <button key={f} className="btn" style={{ height: 36, fontWeight: 500, ...(filter === f ? { borderColor: 'var(--pink)', background: 'var(--pinkSoft)' } : {}) }} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </section>

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
                    <span className="tpl-name" style={{ color: 'var(--muted)' }}>Falta el clip de b-roll</span>
                  </div>
                ) : <VariantPreview project={project} sceneId={scene.id} variant={v} transcript={store.transcript} store={store} />}
                <h2 style={{ fontSize: 15, fontFamily: 'inherit', fontWeight: 600 }}>{v.label}</h2>
                <span className="muted small" style={{ minHeight: 34 }}>{v.notes ?? v.brollFile ?? v.motionTemplate ?? ''}</span>
                <div className="row small muted" style={{ minHeight: 18 }}>
                  {v.punchZoom ? <span className="pill line">zoom</span> : null}
                  {v.transition ? <span className="pill line">entra: {v.transition}</span> : null}
                </div>
                {needsClip(v) ? (
                  <>
                    <input className="input" placeholder="Licencia del clip (propia, Pexels…)" value={license} onChange={(e) => setLicense(e.target.value)} />
                    <label className="btn rect primary" style={{ height: 44, cursor: 'pointer' }}>Subir b-roll
                      <input type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBroll(f); e.target.value = ''; }} />
                    </label>
                  </>
                ) : <button className={`btn rect ${on ? 'primary' : ''}`} style={{ height: 44 }} onClick={() => choose(v)}>{on ? 'Seleccionada' : 'Elegir'}</button>}
              </article>
            );
          })}
        </div>
      </div>

      <section className="page" style={{ flex: 'none', paddingTop: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ fontSize: 20 }}>Motion graphics para este clip</h2>
          <span className="muted small">{gallery.length} hechos solos con lo que dices aquí: tus cifras, tus frases, tus pasos. Elige uno.</span>
        </div>
        <div className="vgrid" style={{ flex: 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          {gallery.map((v) => (
            <article key={v.id} className="card col vcard">
              <VariantPreview project={project} sceneId={scene.id} variant={v} transcript={store.transcript} store={store} />
              <h3 style={{ fontSize: 14, fontFamily: 'inherit', fontWeight: 600 }}>{v.label.replace('Motion graphics · ', '')}</h3>
              <span className="muted small" style={{ minHeight: 34 }}>{v.notes}</span>
              <button className="btn rect" style={{ height: 40 }} onClick={() => store.update((p) => { applyVariant(p.scenes[idx], v); p.scenes[idx].chosenVariant = undefined; })}>Usar</button>
            </article>
          ))}
        </div>
      </section>

      <footer className="tl" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <label className="row" style={{ flex: '1 1 420px', flexWrap: 'nowrap' }}>
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}>Pídele un cambio a Claude</span>
          <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: más corto, que el texto diga otra cosa, b-roll de oficina"
            onKeyDown={(e) => { if (e.key === 'Enter' && text.trim() && !sending) ask(`En la escena ${scene.id}: ${text.trim()}`); }} />
        </label>
        <button className="btn cyan rect" disabled={!text.trim() || sending} onClick={() => ask(`En la escena ${scene.id}: ${text.trim()}`)}>Pedir a Claude</button>
        {step && <span className="pill" role="status">{step}</span>}
      </footer>
    </>
  );
};
