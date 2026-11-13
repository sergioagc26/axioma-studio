import React from 'react';
import { ICONS, type IconName } from './icons.ts';

/**
 * Icono de la línea de Axioma Studio. Toma el color del texto donde va y el tamaño de `size`
 * (por defecto, el de la letra). Es decorativo: el nombre accesible lo pone el botón o el texto.
 */
export const Icon: React.FC<{ name: IconName; size?: number | string; style?: React.CSSProperties; className?: string }> = ({ name, size = '1.15em', style, className }) => (
  <svg
    className={`ico ${className ?? ''}`}
    viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" style={style}
    dangerouslySetInnerHTML={{ __html: ICONS[name] }}
  />
);
