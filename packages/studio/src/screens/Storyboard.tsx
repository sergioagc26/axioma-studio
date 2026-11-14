import { AxiLive } from '../AxiLive.tsx';
import React from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Scene } from '@axioma/schema';
import type { Ctx } from '../App.tsx';
import { ROLE_LABEL, SceneFrame, VISUAL_LABEL } from '../SceneFrame.tsx';
import { applyPunchZooms, sceneDuration } from '../useProject.ts';
import { Icon } from '../Icon.tsx';

/** Respuestas del brief que se resumen arriba, con su nombre legible. */
const BRIEF_LABEL: [string, string][] = [['formato', 'Formato'], ['objetivo', 'Objetivo'], ['publico', 'Público'], ['duracion', 'Duración'], ['tono', 'Tono'], ['ritmo', 'Ritmo'], ['cta', 'Cierre']];
const short = (v: string) => (v.length > 40 ? `${v.slice(0, 39).trimEnd()}…` : v);

const Card: React.FC<{ ctx: Ctx; scene: Scene; n: number }> = ({ ctx, scene, n }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const project = ctx.store.project!;
  return (
    <article
      ref={setNodeRef}
      className={`scene ${ctx.sceneId === scene.id ? 'sel' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 2 : 0 }}
    >
      <div className="row grab" style={{ justifyContent: 'space-between' }} {...attributes} {...listeners} aria-label={`Mover escena ${n}`}>
        <span className="small muted" style={{ fontWeight: 700 }}><Icon name="grip" /> {String(n).padStart(2, '0')}</span>
        <span className="small muted">{sceneDuration(scene).toFixed(1)} s{scene.punchZoom ? ' · zoom' : ''}</span>
      </div>
      <button style={{ border: 0, padding: 0, background: 'none' }} aria-label={`Abrir escena ${n} en el editor`} onClick={() => ctx.go('editor', { s: scene.id })}>
        <SceneFrame projectId={project.id} scene={scene} transcript={ctx.store.transcript} />
      </button>
      <span className={`chip ${scene.visual}`}>{VISUAL_LABEL[scene.visual]}</span>
      <h2 style={{ fontSize: 14, fontFamily: 'inherit', fontWeight: 600 }}>{scene.title || ROLE_LABEL[scene.role]}</h2>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <button className="btn rect" style={{ flex: 1, height: 44 }} onClick={() => ctx.go('variantes', { s: scene.id })}>Variantes</button>
        <button className="btn sq" style={{ height: 44, width: 44 }} aria-label={`Eliminar escena ${n}`} title="Eliminar"
          onClick={() => {
            if (project.scenes.length === 1 && !window.confirm('¿Eliminar la última escena? El video quedará vacío.')) return;
            ctx.store.update((p) => { p.scenes = p.scenes.filter((s) => s.id !== scene.id); applyPunchZooms(p.scenes, p.pacing.punchZoomEvery); });
            ctx.toast(`Escena ${n} eliminada. Deshacer la recupera.`);
          }}><Icon name="trash" /></button>
      </div>
    </article>
  );
};

const BAR: Record<Scene['visual'], [string, string]> = {
  original: ['var(--chip)', 'var(--text)'], broll: ['var(--cyan)', '#000'], texto: ['var(--pink)', 'var(--onPink)'], motion: ['var(--violet)', 'var(--onViolet)'],
};

export const Storyboard: React.FC<{ ctx: Ctx }> = ({ ctx }) => {
  const { store } = ctx;
  const project = store.project!;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const total = project.scenes.reduce((a, s) => a + sceneDuration(s), 0);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    store.update((p) => {
      const from = p.scenes.findIndex((s) => s.id === e.active.id);
      const to = p.scenes.findIndex((s) => s.id === e.over!.id);
      p.scenes = arrayMove(p.scenes, from, to);
      applyPunchZooms(p.scenes, p.pacing.punchZoomEvery);
    });
  };

  // Solo respuestas legibles: nunca el texto interno ni claves sueltas.
  const brief = BRIEF_LABEL.filter(([k]) => project.brief[k]?.trim()).slice(0, 4).map(([k, label]) => [label, short(project.brief[k].trim())] as const);
  return (
    <>
      <section className="row" style={{ padding: '14px 22px', borderBottom: '1px solid var(--line)' }}>
        <span className="small muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Brief</span>
        {brief.length ? brief.map(([k, v]) => <span key={k} className="pill line" title={v}><span className="muted">{k}:</span> <span style={{ color: 'var(--text)' }}>{v}</span></span>)
          : <span className="muted">Sin responder todavía.</span>}
        <button className={`btn rect spacer ${project.briefAppliedAt || !project.scenes.length ? '' : 'primary'}`} onClick={() => ctx.go('brief')}>{project.briefAppliedAt ? 'Editar respuestas' : 'Responder el brief y crear la edición'}</button>
      </section>
      <main className="page">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 style={{ fontSize: 26 }}>{project.scenes.length} escenas · {total.toFixed(1)} s</h1>
          <span className="muted">Arrastra las tarjetas para reordenar. La línea de tiempo se actualiza sola.</span>
        </div>
        {project.scenes.length === 0 && (
          <div className="col" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div className="axi-empty" style={{ alignItems: 'flex-start', padding: 0 }}><AxiLive state="dormido" size={56} /><p className="muted" style={{ margin: 0 }}>Todavía no hay edición. Cuéntale a Axi en el brief y él arma las escenas.</p></div>
            <button className="btn primary" onClick={() => ctx.go('brief')}>Ir al brief</button>
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={project.scenes.map((s) => s.id)} strategy={rectSortingStrategy}>
            <div className="grid">
              {project.scenes.map((s, i) => <Card key={s.id} ctx={ctx} scene={s} n={i + 1} />)}
            </div>
          </SortableContext>
        </DndContext>
      </main>
      <section className="tl" aria-label="Línea de tiempo">
        <span className="small muted">Línea de tiempo</span>
        <div className="bar">
          {project.scenes.map((s, i) => (
            <button key={s.id} title={`Escena ${i + 1} · ${s.title || ROLE_LABEL[s.role]}`} aria-label={`Escena ${i + 1} · ${s.title || ROLE_LABEL[s.role]}`} style={{ flex: Math.max(0.3, sceneDuration(s)), background: BAR[s.visual][0], color: BAR[s.visual][1] }} onClick={() => ctx.go('editor', { s: s.id })}>
              {project.scenes.length <= 24 ? s.title || ROLE_LABEL[s.role] : ''}
            </button>
          ))}
        </div>
      </section>
    </>
  );
};
