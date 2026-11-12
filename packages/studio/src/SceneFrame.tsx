import React from 'react';
import type { Scene, Transcript } from '@snz/schema';
import { sceneSpeech } from './useProject.ts';

export const VISUAL_LABEL: Record<Scene['visual'], string> = {
  original: 'Video original', broll: 'B-roll', motion: 'Motion graphics', texto: 'Texto',
};
export const ROLE_LABEL: Record<Scene['role'], string> = {
  gancho: 'Gancho', problema: 'Problema', beneficio: 'Beneficio', demostracion: 'Demostración', prueba: 'Prueba', cta: 'Llamado a la acción', otro: 'Otro',
};

/** Miniatura 9:16 de una escena con su texto en pantalla y lo que se dice. */
export const SceneFrame: React.FC<{
  projectId: string; scene: Scene; transcript: Transcript | null;
  text?: string | null; color?: string; style?: React.CSSProperties;
}> = ({ projectId, scene, transcript, text, color, style }) => {
  const t = scene.ranges[0].start + Math.min(0.4, (scene.ranges[0].end - scene.ranges[0].start) / 2);
  const ost = text === undefined ? scene.onScreenText : text;
  const said = sceneSpeech(scene, transcript);
  return (
    <div className="frame" style={{ backgroundImage: `url(/api/thumb?id=${encodeURIComponent(projectId)}&t=${t.toFixed(2)})`, ...style }}>
      {ost ? <div className="ost" style={{ ['--c' as any]: color ?? scene.textColor ?? '#FE2C55' }}>{ost}</div> : null}
      {said ? <div className="said">{said.length > 60 ? said.slice(0, 58) + '…' : said}</div> : null}
    </div>
  );
};
