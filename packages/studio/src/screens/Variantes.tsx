import React, { useState } from 'react';
import type { Scene, SceneVariant } from '@snz/schema';
import type { Ctx } from '../App.tsx';
import { ROLE_LABEL, SceneFrame, VISUAL_LABEL } from '../SceneFrame.tsx';
import { askAssistant } from '../useProject.ts';

const FILTERS = ['Todo', 'Texto', 'Color', 'Toma / b-roll', 'Motion graphics'];

/** Aplica una variante a la escena (mismo criterio que el engine). */
function choose(scene: Scene, v: SceneVariant | null) {
  if (!v) { scene.chosenVariant = undefined; return; }
  scene.chosenVariant = v.id;
  scene.visual = v.visual;
  if (v.onScreenText !== undefined) scene.onScreenText = v.onScreenText || undefined;
  if (v.textColor) scene.textColor = v.textColor;
  if (v.brollFile) scene.brollFile = v.brollFile;
  if (v.motionTemplate) scene.motionTemplate = v.motionTemplate;
}

export const Variantes: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const scene = project.scenes.find((s) => s.id === ctx.sceneId) ?? project.scenes[0];
  const [filter, setFilter] = useState('Todo');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState('');
  if (!scene) return <div className="page"><p className="muted">No hay escenas.</p></div>;
  const idx = project.scenes.indexOf(scene);
  const pending = project.requests.filter((r) => r.status === 'pendiente' && r.sceneId === scene.id);

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
  const askVariants = () => ask(`Genera 4 variantes distintas para la escena ${scene.id}${filter === 'Todo' ? '' : `, variando solo: ${filter.toLowerCase()}`}${scene.variants.length ? ', sin repetir las que ya tiene' : ''}. Guárdalas con generar_variantes; no elijas ninguna.`);

  return (
    <>
      <header className="top" style={{ borderTop: 0 }}>
        <button className="btn rect" onClick={() => ctx.go('editor', { s: scene.id })}>‹ Volver al editor</button>
        <div className="col" style={{ gap: 0 }}>
          <strong style={{ font: "700 18px 'Space Grotesk', sans-serif" }}>Variantes · Escena {idx + 1} · {scene.title || ROLE_LABEL[scene.role]}</strong>
          <span className="muted small">Mismo mensaje, distintas formas de contarlo. Elige una y la escena se reemplaza.</span>
        </div>
        <div className="row spacer">
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>Escena
            <select value={scene.id} onChange={(e) => ctx.go('variantes', { s: e.target.value })}>
              {project.scenes.map((s, i) => <option key={s.id} value={s.id}>{i + 1} · {s.title || ROLE_LABEL[s.role]}</option>)}
            </select>
          </label>
          <button className="btn primary" disabled={sending} onClick={askVariants}>{sending ? 'Claude trabajando…' : scene.variants.length ? 'Pedir otras 4 a Claude' : 'Pedir variantes a Claude'}</button>
        </div>
      </header>

      <section className="row" style={{ padding: '12px 22px', borderBottom: '1px solid var(--line)' }}>
        <span className="small muted">Variar solo:</span>
        {FILTERS.map((f) => (
          <button key={f} className="btn" style={{ height: 36, fontWeight: 500, ...(filter === f ? { borderColor: 'var(--pink)', background: 'var(--pinkSoft)' } : {}) }} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </section>

      <div className="cols">
        <div className="col" style={{ flex: '1 1 200px', maxWidth: 230 }}>
          <span className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Actual</span>
          <SceneFrame projectId={project.id} scene={scene} transcript={store.transcript} style={{ borderRadius: 14 }} />
          <span className="muted small">{VISUAL_LABEL[scene.visual]}{scene.onScreenText ? ` · "${scene.onScreenText}"` : ' · sin texto'}</span>
          {scene.chosenVariant && <button className="btn rect" onClick={() => store.update((p) => choose(p.scenes[idx], null))}>Quitar marca de variante</button>}
        </div>

        <div className="vgrid">
          {scene.variants.length === 0 && (
            <div className="card col" style={{ gridColumn: '1 / -1', padding: 22 }}>
              <strong>Esta escena todavía no tiene variantes.</strong>
              <span className="muted">Pulsa «Pedir variantes a Claude». Las genera aquí mismo y aparecen en unos segundos.</span>
            </div>
          )}
          {scene.variants.map((v) => {
            const on = scene.chosenVariant === v.id;
            return (
              <article key={v.id} className={`card col vcard ${on ? 'on' : ''}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="small muted" style={{ fontWeight: 700 }}>{v.id.toUpperCase()}</span>
                  <span className={`chip ${v.visual}`} style={{ alignSelf: 'auto' }}>{VISUAL_LABEL[v.visual]}</span>
                </div>
                <SceneFrame projectId={project.id} scene={scene} transcript={store.transcript} text={v.onScreenText ?? null} color={v.textColor} visual={v.visual} />
                <h2 style={{ fontSize: 15, fontFamily: 'inherit', fontWeight: 600 }}>{v.label}</h2>
                <span className="muted small" style={{ minHeight: 34 }}>{v.notes ?? v.brollFile ?? v.motionTemplate ?? ''}</span>
                <button className={`btn rect ${on ? 'primary' : ''}`} style={{ height: 44 }} onClick={() => store.update((p) => choose(p.scenes[idx], v))}>{on ? 'Seleccionada' : 'Elegir'}</button>
              </article>
            );
          })}
        </div>
      </div>

      <footer className="tl" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <label className="row" style={{ flex: '1 1 420px', flexWrap: 'nowrap' }}>
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}>Pídele un cambio a la IA</span>
          <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: más corto, que el texto diga otra cosa, b-roll de oficina"
            onKeyDown={(e) => { if (e.key === 'Enter' && text.trim() && !sending) ask(`En la escena ${scene.id}: ${text.trim()}`); }} />
        </label>
        <button className="btn cyan rect" disabled={!text.trim() || sending} onClick={() => ask(`En la escena ${scene.id}: ${text.trim()}`)}>Pedir a Claude</button>
        {step && <span className="pill" role="status">{step}</span>}
        {pending.length > 0 && !step && <span className="pill line">{pending.length} petición(es) guardadas sin atender</span>}
      </footer>
    </>
  );
};
