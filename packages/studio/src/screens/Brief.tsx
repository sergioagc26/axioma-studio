import React, { useState } from 'react';
import type { Ctx } from '../App.tsx';
import { api, sceneDuration } from '../useProject.ts';
import { ROLE_LABEL } from '../SceneFrame.tsx';

interface Q { key: string; label: string; title: string; help: string; options: { value: string; title: string; desc: string; preset?: string }[] }

const QUESTIONS: Q[] = [
  { key: 'formato', label: 'Formato', title: '¿Reel o historia?', help: 'Define las zonas seguras y la duración recomendada.', options: [
    { value: 'Reel 9:16', title: 'Reel', desc: 'Vertical, para el feed de Reels.' },
    { value: 'Historia 9:16', title: 'Historia', desc: 'Vertical, hasta 60 s por historia.' }] },
  { key: 'objetivo', label: 'Objetivo', title: '¿Qué quieres que haga quien lo vea?', help: 'El cierre del reel se arma alrededor de esto.', options: [
    { value: 'Mensajes por DM', title: 'Escribir por DM', desc: 'Que te escriban.' },
    { value: 'Comentarios', title: 'Comentar', desc: 'Que respondan o opinen.' },
    { value: 'Guardados', title: 'Guardar', desc: 'Contenido útil para volver a ver.' },
    { value: 'Ir al link', title: 'Ir al link', desc: 'Visitar tu página o perfil.' }] },
  { key: 'publico', label: 'Público', title: '¿Para quién es?', help: 'Una frase corta basta.', options: [] },
  { key: 'ritmo', label: 'Ritmo', title: '¿Qué ritmo quieres para este reel?', help: 'Con esto la IA decide cada cuánto cortar y cómo entran los textos. Puedes cambiarlo después.', options: [
    { value: 'Rápido', title: 'Rápido', desc: 'Sin pausas, zoom de golpe frecuente.', preset: 'rapido' },
    { value: 'Con ritmo', title: 'Con ritmo', desc: 'Pausas cortas que respiran.', preset: 'con-ritmo' },
    { value: 'Sobrio', title: 'Sobrio', desc: 'Ritmo natural, sin zooms.', preset: 'sobrio' }] },
  { key: 'tono', label: 'Tono', title: '¿Qué tono?', help: 'Guía los textos en pantalla.', options: [
    { value: 'Directo', title: 'Directo', desc: 'Al grano.' }, { value: 'Cercano', title: 'Cercano', desc: 'Como a un amigo.' },
    { value: 'Educativo', title: 'Educativo', desc: 'Explica paso a paso.' }, { value: 'Inspirador', title: 'Inspirador', desc: 'Motiva a actuar.' }] },
  { key: 'duracion', label: 'Duración', title: '¿Duración objetivo?', help: 'La IA recorta lo redundante para acercarse.', options: [
    { value: '15–20 s', title: '15–20 s', desc: 'Muy corto.' }, { value: '20–30 s', title: '20–30 s', desc: 'Lo más común.' },
    { value: '30–60 s', title: '30–60 s', desc: 'Para explicar más.' }, { value: 'Lo que dure', title: 'Lo que dure', desc: 'Sin recortar ideas.' }] },
  { key: 'cta', label: 'Llamado a la acción', title: '¿Con qué frase cierras?', help: 'Si ya lo dices en el video, puedes dejarlo vacío.', options: [] },
];

export const Brief: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const firstEmpty = QUESTIONS.findIndex((q) => !project.brief[q.key]);
  const [i, setI] = useState(firstEmpty === -1 ? 0 : firstEmpty);
  const q = QUESTIONS[i];
  const value = project.brief[q.key] ?? '';
  const answered = QUESTIONS.filter((x) => project.brief[x.key]).length;

  const answer = async (v: string, preset?: string) => {
    store.update((p) => { if (v) p.brief[q.key] = v; else delete p.brief[q.key]; });
    if (preset && preset !== project.presetId) {
      // El ritmo cambia el preset (pausas, zooms y subtítulos) sin rehacer el storyboard.
      window.setTimeout(async () => {
        try {
          const d = await api(`/api/op?id=${encodeURIComponent(project.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'preset', presetId: preset }) });
          store.replace(d.project);
        } catch (e: any) { ctx.toast(e.message); }
      }, 400);
    }
  };

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
        <span className="small" style={{ fontWeight: 700, color: 'var(--pinkText)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Pregunta {i + 1}</span>
        <h1 style={{ fontSize: 30, lineHeight: 1.15 }}>{q.title}</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>{q.help}</p>
        {q.options.length > 0 && (
          <div className="opts">
            {q.options.map((o) => (
              <button key={o.value} className={`opt ${value === o.value ? 'on' : ''}`} aria-pressed={value === o.value} onClick={() => answer(o.value, o.preset)}>
                <strong style={{ fontSize: 16 }}>{o.title}</strong>
                <span className="muted small">{o.desc}</span>
              </button>
            ))}
          </div>
        )}
        <label className="field">{q.options.length ? 'O descríbelo con tus palabras' : 'Tu respuesta'}
          <input
            key={q.key}
            defaultValue={q.options.some((o) => o.value === value) ? '' : value}
            placeholder={q.key === 'publico' ? 'Ej.: dueños de pymes locales' : q.key === 'cta' ? 'Ej.: Escríbeme "REEL" y te cuento' : ''}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== value) answer(v); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </label>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Atrás</button>
          {i < QUESTIONS.length - 1
            ? <button className="btn primary" onClick={() => setI(i + 1)}>Siguiente pregunta</button>
            : <button className="btn primary" onClick={() => ctx.go('storyboard')}>Ver storyboard</button>}
        </div>
      </main>

      <aside className="col" style={{ flex: '1 1 260px', maxWidth: 320, padding: 18, borderRadius: 16, background: 'var(--cyanSoft)' }}>
        <h2 style={{ fontSize: 17 }}>Así va quedando</h2>
        <span className="muted small">Primer corte automático. Pídele a Claude que lo afine con tu brief.</span>
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
