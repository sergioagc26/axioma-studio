/**
 * Diseños de subtítulos y formas de remarcar la palabra que suena, descritos como datos.
 * El render los interpreta: añadir uno nuevo es añadir una línea aquí.
 * Colores: 'texto' (el del subtítulo), 'acento' (el de resalte), 'secundario' (el de la marca), 'blanco', 'negro'.
 */
export type CapColor = 'texto' | 'acento' | 'secundario' | 'blanco' | 'negro';

export interface CaptionDesignSpec {
  id: string; name: string; group: string;
  /** Diseños con dibujo propio en el render (no usan estos campos). */
  legacy?: boolean;
  font?: string; weight?: number; upper?: boolean; italic?: boolean;
  /** Multiplicador del tamaño. */
  size?: number;
  color?: CapColor;
  stroke?: 'negro' | 'blanco' | 'acento' | 'ninguno';
  strokeMult?: number;
  shadow?: 'suave' | 'dura' | 'dura-acento' | 'doble' | 'neon' | 'halo' | 'volumen' | 'larga' | 'ninguna';
  /** Relleno especial de las letras. */
  fill?: 'degradado' | 'fuego' | 'cromado' | 'oro' | 'hueco' | 'hielo';
  /** Fondo: de toda la línea o de cada palabra. */
  bg?: 'caja' | 'caja-acento' | 'blanca' | 'negra' | 'pildora' | 'pildora-acento' | 'cristal' | 'borde' | 'palabra' | 'palabra-acento' | 'palabra-blanca' | 'alterna';
  /** Giro de la línea (grados), inclinación, giro alterno por palabra, separación extra entre letras (em). */
  tilt?: number; skew?: number; alt?: number; spacing?: number;
}

const d = (id: string, name: string, group: string, x: Omit<CaptionDesignSpec, 'id' | 'name' | 'group'> = {}): CaptionDesignSpec => ({ id, name, group, ...x });

export const CAPTION_DESIGNS: CaptionDesignSpec[] = [
  // Básicos
  d('clasico', 'Clásico', 'Básicos'),
  d('limpio', 'Limpio sin borde', 'Básicos', { stroke: 'ninguno', shadow: 'suave', font: 'Inter', weight: 700 }),
  d('fino', 'Fino', 'Básicos', { stroke: 'ninguno', shadow: 'suave', font: 'DM Sans', weight: 600, size: 0.88, upper: false }),
  d('grueso', 'Grueso', 'Básicos', { font: 'Archivo Black', strokeMult: 1.3, upper: true }),
  d('borde-blanco', 'Borde blanco', 'Básicos', { color: 'negro', stroke: 'blanco', shadow: 'suave' }),
  d('borde-color', 'Borde de color', 'Básicos', { stroke: 'acento', shadow: 'suave' }),
  d('minusculas', 'Minúsculas suaves', 'Básicos', { upper: false, font: 'Nunito', weight: 800, stroke: 'ninguno', shadow: 'suave' }),
  d('placa', 'Placa oscura', 'Básicos', { bg: 'caja', stroke: 'ninguno', shadow: 'ninguna', font: 'Inter', weight: 700, size: 0.9 }),
  // Impacto
  d('impacto', 'Impacto', 'Impacto', { legacy: true }),
  d('titular', 'Titular', 'Impacto', { font: 'Anton', weight: 400, upper: true, size: 1.25, strokeMult: 0.8 }),
  d('condensado', 'Condensado alto', 'Impacto', { font: 'Bebas Neue', weight: 400, upper: true, size: 1.35, spacing: 0.03 }),
  d('golpe', 'Golpe inclinado', 'Impacto', { font: 'Archivo Black', upper: true, size: 1.15, skew: -8, shadow: 'dura' }),
  d('deportivo', 'Deportivo', 'Impacto', { font: 'Teko', weight: 700, upper: true, size: 1.4, italic: true, shadow: 'dura-acento', stroke: 'ninguno' }),
  d('cartel', 'Cartel', 'Impacto', { font: 'League Spartan', weight: 900, upper: true, size: 1.1, shadow: 'dura-acento', stroke: 'negro' }),
  d('gritado', 'Gritado', 'Impacto', { font: 'Anton', weight: 400, upper: true, size: 1.45, alt: 3, strokeMult: 1.2 }),
  d('volumen', 'Volumen 3D', 'Impacto', { font: 'Archivo Black', upper: true, size: 1.1, stroke: 'ninguno', shadow: 'volumen' }),
  d('sombra-larga', 'Sombra larga', 'Impacto', { font: 'Montserrat', weight: 900, upper: true, stroke: 'ninguno', shadow: 'larga' }),
  // Cajas y tiras
  d('bloque', 'Bloque', 'Cajas y tiras', { legacy: true }),
  d('cinta', 'Tiras de color', 'Cajas y tiras', { legacy: true }),
  d('caja-color', 'Caja de color', 'Cajas y tiras', { bg: 'caja-acento', font: 'Montserrat', weight: 800, upper: true, size: 0.92 }),
  d('caja-blanca', 'Caja blanca', 'Cajas y tiras', { bg: 'blanca', font: 'Inter', weight: 800, size: 0.9 }),
  d('caja-negra', 'Caja negra', 'Cajas y tiras', { bg: 'negra', font: 'Inter', weight: 800, size: 0.9 }),
  d('pildora', 'Píldora', 'Cajas y tiras', { bg: 'pildora', font: 'DM Sans', weight: 700, size: 0.86, upper: false }),
  d('pildora-color', 'Píldora de color', 'Cajas y tiras', { bg: 'pildora-acento', font: 'Poppins', weight: 800, size: 0.86 }),
  d('cristal', 'Cristal', 'Cajas y tiras', { bg: 'cristal', font: 'Sora', weight: 700, size: 0.88, upper: false }),
  d('marco', 'Marco', 'Cajas y tiras', { bg: 'borde', font: 'Space Grotesk', weight: 700, size: 0.88, upper: true, spacing: 0.04 }),
  d('palabras-caja', 'Palabras en caja', 'Cajas y tiras', { bg: 'palabra', font: 'Montserrat', weight: 800, size: 0.9, upper: true }),
  d('palabras-color', 'Palabras de color', 'Cajas y tiras', { bg: 'palabra-acento', font: 'Poppins', weight: 800, size: 0.9, upper: true }),
  d('palabras-blancas', 'Palabras blancas', 'Cajas y tiras', { bg: 'palabra-blanca', font: 'Archivo Black', size: 0.86, upper: true }),
  d('etiquetas', 'Etiquetas alternas', 'Cajas y tiras', { bg: 'alterna', font: 'Kanit', weight: 700, size: 0.9, upper: true }),
  d('recorte', 'Recorte torcido', 'Cajas y tiras', { bg: 'palabra-blanca', font: 'Anton', weight: 400, upper: true, alt: 4 }),
  d('cinta-recta', 'Cinta inclinada', 'Cajas y tiras', { bg: 'caja-acento', font: 'Bebas Neue', weight: 400, upper: true, size: 1.1, tilt: -3 }),
  // Brillo
  d('neon', 'Neón', 'Brillo', { legacy: true }),
  d('halo', 'Halo de luz', 'Brillo', { stroke: 'ninguno', shadow: 'halo', font: 'Sora', weight: 700 }),
  d('neon-blanco', 'Neón blanco', 'Brillo', { color: 'blanco', stroke: 'ninguno', shadow: 'neon', font: 'Righteous', weight: 400 }),
  d('degradado', 'Degradado', 'Brillo', { fill: 'degradado', font: 'Archivo Black', upper: true }),
  d('fuego', 'Fuego', 'Brillo', { fill: 'fuego', font: 'Anton', weight: 400, upper: true, size: 1.2 }),
  d('hielo', 'Hielo', 'Brillo', { fill: 'hielo', font: 'Montserrat', weight: 900, upper: true }),
  d('cromado', 'Cromado', 'Brillo', { fill: 'cromado', font: 'Kanit', weight: 700, upper: true, size: 1.1 }),
  d('oro', 'Oro', 'Brillo', { fill: 'oro', font: 'Playfair Display', weight: 700, size: 1.05 }),
  d('hueco', 'Letras huecas', 'Brillo', { fill: 'hueco', font: 'Archivo Black', upper: true, size: 1.1 }),
  // Elegantes
  d('elegante', 'Elegante', 'Elegantes', { legacy: true }),
  d('editorial', 'Editorial', 'Elegantes', { font: 'Playfair Display', weight: 700, italic: true, upper: false, stroke: 'ninguno', shadow: 'suave' }),
  d('serif', 'Serif clásica', 'Elegantes', { font: 'Lora', weight: 700, upper: false, stroke: 'ninguno', shadow: 'suave', size: 0.95 }),
  d('espaciado', 'Mayúsculas espaciadas', 'Elegantes', { font: 'Raleway', weight: 700, upper: true, size: 0.72, spacing: 0.22, stroke: 'ninguno', shadow: 'suave' }),
  d('minimal', 'Minimal', 'Elegantes', { font: 'DM Sans', weight: 600, upper: false, size: 0.78, stroke: 'ninguno', shadow: 'suave', spacing: 0.01 }),
  d('cine', 'Cine', 'Elegantes', { font: 'Lora', weight: 700, italic: true, upper: false, size: 0.82, color: 'blanco', stroke: 'ninguno', shadow: 'suave', bg: 'caja' }),
  d('revista', 'Revista', 'Elegantes', { font: 'Playfair Display', weight: 700, upper: true, size: 0.9, spacing: 0.08, stroke: 'ninguno', shadow: 'suave' }),
  // Divertidos
  d('comic', 'Cómic', 'Divertidos', { font: 'Bangers', weight: 400, upper: true, size: 1.25, strokeMult: 1.2, shadow: 'dura', alt: 2 }),
  d('burbuja', 'Burbuja', 'Divertidos', { font: 'Rubik', weight: 800, color: 'acento', stroke: 'blanco', strokeMult: 1.6, shadow: 'dura' }),
  d('marcador', 'Marcador a mano', 'Divertidos', { font: 'Permanent Marker', weight: 400, upper: false, size: 1.05, stroke: 'negro', tilt: -2 }),
  d('manuscrito', 'Manuscrito', 'Divertidos', { font: 'Caveat', weight: 700, upper: false, size: 1.35, stroke: 'ninguno', shadow: 'suave' }),
  d('script', 'Caligrafía', 'Divertidos', { font: 'Pacifico', weight: 400, upper: false, size: 1.05, stroke: 'ninguno', shadow: 'dura' }),
  d('rotulo', 'Rótulo', 'Divertidos', { font: 'Lobster', weight: 400, upper: false, size: 1.15, shadow: 'dura-acento', stroke: 'ninguno' }),
  d('saltarin', 'Saltarín', 'Divertidos', { font: 'Poppins', weight: 800, upper: true, alt: 5, shadow: 'dura' }),
  // Retro
  d('retro', 'Retro en capas', 'Retro', { font: 'Righteous', weight: 400, upper: true, stroke: 'ninguno', shadow: 'doble', size: 1.1 }),
  d('arcade', 'Arcade', 'Retro', { font: 'Teko', weight: 700, upper: true, size: 1.3, color: 'acento', stroke: 'negro', shadow: 'dura', spacing: 0.05 }),
  d('vhs', 'VHS', 'Retro', { font: 'Space Grotesk', weight: 700, upper: true, stroke: 'ninguno', shadow: 'doble', spacing: 0.06, size: 0.95 }),
  d('periodico', 'Periódico', 'Retro', { font: 'Lora', weight: 700, upper: true, bg: 'blanca', size: 0.85, spacing: 0.02 }),
];

export interface CaptionEffectSpec {
  id: string; name: string; group: string;
  color?: CapColor;
  /** Fondo detrás de la palabra. */
  bg?: CapColor;
  round?: boolean;
  /** Crece hasta esta escala; sube estos píxeles; gira; se inclina. */
  scale?: number; lift?: number; rotate?: number; skew?: number;
  /** Rebota al entrar (muelle suelto). */
  bounce?: boolean;
  line?: 'debajo' | 'gruesa' | 'fina' | 'doble' | 'puntos' | 'arriba' | 'ambas' | 'marcador' | 'circulo' | 'recuadro';
  glow?: boolean;
  /** Borde de color; letra hueca. */
  outline?: boolean; hollow?: boolean;
  italic?: boolean; heavy?: boolean; caps?: boolean;
  shadow?: boolean;
  /** Tiembla mientras suena; se enfoca al entrar; se voltea al entrar. */
  shake?: boolean; focus?: boolean; flip?: boolean;
  /** Las demás palabras se apagan. */
  dim?: boolean;
  gradient?: boolean;
  stretch?: number;
}

const e = (id: string, name: string, group: string, x: Omit<CaptionEffectSpec, 'id' | 'name' | 'group'>): CaptionEffectSpec => ({ id, name, group, ...x });

export const CAPTION_EFFECTS: CaptionEffectSpec[] = [
  // Color
  e('color', 'Cambia de color', 'Color', { color: 'acento' }),
  e('color-secundario', 'Color secundario', 'Color', { color: 'secundario' }),
  e('blanco', 'Se enciende en blanco', 'Color', { color: 'blanco', glow: true }),
  e('degradado', 'Degradado', 'Color', { gradient: true }),
  e('foco', 'Solo ella encendida', 'Color', { dim: true }),
  e('foco-color', 'Encendida y en color', 'Color', { dim: true, color: 'acento' }),
  e('brillo', 'Brillo de color', 'Color', { color: 'acento', glow: true }),
  e('neon', 'Neón', 'Color', { color: 'blanco', glow: true, scale: 1.08 }),
  e('sombra-color', 'Sombra de color', 'Color', { shadow: true }),
  e('borde-color', 'Borde de color', 'Color', { outline: true }),
  e('hueca', 'Se vuelve hueca', 'Color', { hollow: true }),
  // Movimiento
  e('pop', 'Salta', 'Movimiento', { color: 'acento', scale: 1.2, lift: 4 }),
  e('crece', 'Crece', 'Movimiento', { scale: 1.25 }),
  e('crece-color', 'Crece mucho y en color', 'Movimiento', { color: 'acento', scale: 1.4 }),
  e('rebote', 'Rebota', 'Movimiento', { color: 'acento', scale: 1.18, bounce: true }),
  e('sube', 'Sube', 'Movimiento', { color: 'acento', lift: 12 }),
  e('gira', 'Se tuerce', 'Movimiento', { color: 'acento', rotate: -6, scale: 1.12 }),
  e('gira-derecha', 'Se tuerce al otro lado', 'Movimiento', { color: 'acento', rotate: 6, scale: 1.12 }),
  e('inclina', 'Se inclina', 'Movimiento', { color: 'acento', skew: -12 }),
  e('tiembla', 'Tiembla', 'Movimiento', { color: 'acento', shake: true }),
  e('enfoca', 'Se enfoca', 'Movimiento', { focus: true, color: 'acento' }),
  e('voltea', 'Se voltea', 'Movimiento', { flip: true, color: 'acento' }),
  e('estira', 'Se estira', 'Movimiento', { stretch: 1.25, color: 'acento' }),
  e('aplasta', 'Se ensancha y baja', 'Movimiento', { stretch: 1.18, lift: -3, color: 'acento' }),
  e('latigo', 'Latigazo', 'Movimiento', { color: 'acento', scale: 1.3, rotate: -4, bounce: true }),
  e('golpe', 'Golpe', 'Movimiento', { color: 'blanco', scale: 1.35, shadow: true, bounce: true }),
  // Cajas
  e('caja', 'Caja de color', 'Cajas', { bg: 'acento', scale: 1 }),
  e('caja-blanca', 'Caja blanca', 'Cajas', { bg: 'blanco' }),
  e('caja-negra', 'Caja negra', 'Cajas', { bg: 'negro', color: 'acento' }),
  e('caja-secundaria', 'Caja del color secundario', 'Cajas', { bg: 'secundario' }),
  e('pildora', 'Píldora de color', 'Cajas', { bg: 'acento', round: true }),
  e('pildora-blanca', 'Píldora blanca', 'Cajas', { bg: 'blanco', round: true }),
  e('caja-salta', 'Caja que salta', 'Cajas', { bg: 'acento', scale: 1.15, bounce: true }),
  e('caja-torcida', 'Caja torcida', 'Cajas', { bg: 'acento', rotate: -3 }),
  e('caja-inclinada', 'Caja inclinada', 'Cajas', { bg: 'acento', skew: -10 }),
  e('etiqueta', 'Etiqueta que sube', 'Cajas', { bg: 'blanco', round: true, lift: 8 }),
  e('recuadro', 'Recuadro', 'Cajas', { line: 'recuadro' }),
  e('circulo', 'Rodeada', 'Cajas', { line: 'circulo' }),
  // Líneas
  e('subrayado', 'Subrayado', 'Líneas', { line: 'debajo', lift: 2 }),
  e('subrayado-grueso', 'Subrayado grueso', 'Líneas', { line: 'gruesa' }),
  e('subrayado-fino', 'Subrayado fino', 'Líneas', { line: 'fina', color: 'acento' }),
  e('doble-linea', 'Doble línea', 'Líneas', { line: 'doble' }),
  e('puntos', 'Línea de puntos', 'Líneas', { line: 'puntos' }),
  e('sobre-linea', 'Línea arriba', 'Líneas', { line: 'arriba' }),
  e('entre-lineas', 'Entre dos líneas', 'Líneas', { line: 'ambas' }),
  e('marcador', 'Marcador fluorescente', 'Líneas', { line: 'marcador' }),
  e('marcador-salta', 'Marcador que salta', 'Líneas', { line: 'marcador', scale: 1.12 }),
  // Letra
  e('cursiva', 'Cursiva de color', 'Letra', { italic: true, color: 'acento' }),
  e('negrita', 'Más gruesa', 'Letra', { heavy: true, color: 'acento' }),
  e('mayusculas', 'En mayúsculas', 'Letra', { caps: true, color: 'acento' }),
  e('mayusculas-crece', 'Mayúsculas que crecen', 'Letra', { caps: true, scale: 1.2, color: 'acento' }),
  e('cursiva-subrayada', 'Cursiva subrayada', 'Letra', { italic: true, line: 'fina' }),
  e('ninguno', 'Sin remarcar', 'Letra', {}),
];

export const captionDesign = (id: string) => CAPTION_DESIGNS.find((x) => x.id === id) ?? CAPTION_DESIGNS[0];
export const captionEffect = (id: string) => CAPTION_EFFECTS.find((x) => x.id === id) ?? CAPTION_EFFECTS[0];
