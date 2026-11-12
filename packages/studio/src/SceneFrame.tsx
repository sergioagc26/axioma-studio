import React from 'react';
import type { Scene, Transcript } from '@snz/schema';
import { sceneSpeech } from './useProject.ts';

export const VISUAL_LABEL: Record<Scene['visual'], string> = {
  original: 'Video original', broll: 'B-roll', motion: 'Motion graphics', texto: 'Texto',
};
export const ROLE_LABEL: Record<Scene['role'], string> = {
  gancho: 'Gancho', problema: 'Problema', beneficio: 'Beneficio', demostracion: 'Demostración', prueba: 'Prueba', cta: 'Llamado a la acción', otro: 'Otro',
};

const MOTION_LABEL: Record<string, string> = { barras: 'Gráfico de barras', contador: 'Contador', lista: 'Lista', logo: 'Logo de cierre' };

/** Miniatura 9:16 de una escena: lo que se verá (toma, b-roll o plantilla), su texto y lo que se dice. */
export const SceneFrame: React.FC<{
  projectId: string; scene: Scene; transcript: Transcript | null;
  /** Para previsualizar una variante sin aplicarla. */
  text?: string | null; color?: string; visual?: Scene['visual']; style?: React.CSSProperties;
}> = ({ projectId, scene, transcript, text, color, visual, style }) => {
  const kind = visual ?? scene.visual;
  const ost = text === undefined ? scene.onScreenText : text;
  const said = sceneSpeech(scene, transcript);
  const saidEl = said ? <div className="said">{said.length > 60 ? said.slice(0, 58) + '…' : said}</div> : null;
  const id = encodeURIComponent(projectId);

  if (kind === 'texto' && ost) {
    return <div className="frame card-motion texto" style={style}><span className="tpl-name">{ost}</span></div>;
  }
  if (kind === 'motion') {
    return (
      <div className="frame card-motion" style={style}>
        <span className="tpl-name">{ost ? <>{ost}<br /></> : null}<span style={{ opacity: 0.7, fontWeight: 500 }}>{MOTION_LABEL[scene.motionTemplate ?? ''] ?? 'Motion graphics'}</span></span>
        {saidEl}
      </div>
    );
  }
  const isFile = kind === 'broll' && scene.brollFile && /\.(mp4|mov|m4v|webm)$/i.test(scene.brollFile);
  const t = scene.ranges[0].start + Math.min(0.4, (scene.ranges[0].end - scene.ranges[0].start) / 2);
  const url = isFile ? `/api/thumb?id=${id}&t=1&file=${encodeURIComponent(scene.brollFile!)}` : `/api/thumb?id=${id}&t=${t.toFixed(2)}`;
  return (
    <div className="frame" style={{ backgroundImage: `url(${url})`, ...style }}>
      {ost ? <div className="ost" style={{ ['--c' as any]: color ?? scene.textColor ?? '#FE2C55' }}>{ost}</div> : null}
      {saidEl}
    </div>
  );
};
