import React from 'react';
import type { Preset, Project } from '@axioma/schema';
import type { ProjectStore } from './useProject.ts';

/** Filtros de color de cada aspecto (los mismos que usa el video). */
const LOOKS: Record<string, string | undefined> = {
  normal: undefined,
  bn: 'grayscale(1) contrast(1.15)',
  calido: 'sepia(0.25) saturate(1.25) contrast(1.05)',
  frio: 'hue-rotate(-12deg) saturate(0.9) contrast(1.08) brightness(1.02)',
  contraste: 'contrast(1.3) saturate(1.2)',
  vivo: 'saturate(1.6) contrast(1.08)',
  cine: 'contrast(1.15) saturate(0.85) sepia(0.18) hue-rotate(-8deg) brightness(0.96)',
  vintage: 'sepia(0.45) contrast(0.92) saturate(0.8) brightness(1.05)',
  suave: 'contrast(0.88) brightness(1.08) saturate(0.9)',
  dramatico: 'contrast(1.4) brightness(0.85) saturate(0.9)',
  sepia: 'sepia(0.9) contrast(1.05)',
};

/**
 * Miniatura de un estilo: una foto fija de tu propio video con el color del estilo y su nombre
 * escrito con la letra, el color y la altura de sus subtítulos. Es una imagen (no un video),
 * así abrir el panel «Estilo» no carga una docena de videos a la vez y no puede trabarse.
 * El nombre sale siempre (también en montajes), así se distinguen aunque el color se parezca.
 */
export const PresetPreview: React.FC<{ project: Project; preset: Preset; store?: ProjectStore }> = React.memo(({ project, preset }) => {
  const first = project.scenes[0];
  const r = first?.ranges[0];
  const t = r ? r.start + (first.trimStart ?? 0) + Math.min(1.1, Math.max(0, (r.end - r.start) / 2)) : 0;
  const id = encodeURIComponent(project.id);
  const src = first?.visual === 'broll' && first.brollFile && /\.(mp4|mov|m4v|webm)$/i.test(first.brollFile)
    ? `/api/thumb?id=${id}&t=1&file=${encodeURIComponent(first.brollFile)}`
    : `/api/thumb?id=${id}&t=${t.toFixed(2)}`;
  const c = preset.captions;
  const look = preset.style?.look ?? first?.look ?? 'normal';
  const words = preset.name.split(/\s+/);
  return (
    <span style={{ position: 'relative', display: 'block', width: '100%', height: '100%', background: '#111' }}>
      <img src={src} alt="" loading="lazy" decoding="async" draggable={false}
        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: LOOKS[look] }} />
      <span style={{
        position: 'absolute', left: '6%', right: '6%', top: `${Math.round((c.y ?? 0.7) * 100)}%`, transform: 'translateY(-50%)',
        textAlign: 'center', lineHeight: 1.05, fontSize: 11, fontWeight: c.fontWeight ?? 800,
        fontFamily: `${preset.style?.textFont ?? c.fontFamily ?? 'Inter'}, system-ui, sans-serif`,
        textTransform: c.uppercase ? 'uppercase' : 'none', color: c.color ?? '#FFFFFF',
        textShadow: c.stroke === false ? 'none' : '0 0 2px #000, 0 1px 2px #000',
        ...(c.plate ? { background: 'rgba(0,0,0,.6)', borderRadius: 4, padding: '2px 3px' } : {}),
      }}>
        {words.map((w, i) => (
          <span key={i} style={i === words.length - 1 && words.length > 1 ? { color: c.highlightColor ?? '#FE2C55' } : undefined}>{w}{i < words.length - 1 ? ' ' : ''}</span>
        ))}
      </span>
    </span>
  );
}, (a, b) => photoKey(a.project) === photoKey(b.project) && JSON.stringify(a.preset) === JSON.stringify(b.preset));

/** Lo único del proyecto que cambia la miniatura: la foto de la primera escena. */
function photoKey(p: Project) {
  const s = p.scenes[0];
  return s ? `${p.id}|${s.look}|${s.visual}|${s.brollFile ?? ''}|${s.trimStart}|${s.ranges[0]?.start}|${s.ranges[0]?.end}` : p.id;
}
