import type { CaptionStyle, Preset } from './project.ts';

/** Fecha de la lista incluida en la app. No se consulta internet: es una guía que se actualiza con la app. */
export const TRENDS_DATE = 'junio de 2026';

export interface Trend {
  /** Qué está funcionando en ese nicho, en frases cortas para mostrar. */
  points: string[];
  /** Estilo incluido del que parte. */
  preset: string;
  /** Duración máxima recomendada (s). */
  seconds: number;
  captions?: Partial<CaptionStyle>;
  style?: NonNullable<Preset['style']>;
}

/** Lo que mejor está funcionando en reels por nicho. Lo usa la edición automática cuando no hay referencia propia. */
export const TRENDS: Record<string, Trend> = {
  gimnasio: { preset: 'energia', seconds: 25,
    points: ['Gancho con el resultado o el reto en el primer segundo', 'Cortes al ritmo, cada 1–2 s, con golpes de zoom', 'Pocas palabras enormes en mayúsculas y sonidos de impacto'],
    style: { texts: 'muchos', hook: 'apilado', zoomText: true, cameras: ['pulso', 'temblor', 'acercar'], flashes: true, sfxAuto: true, finish: { progressBar: true } } },
  'comida-rapida': { preset: 'oferta-cta', seconds: 20,
    points: ['El producto en primer plano desde el inicio', 'Textos divertidos en tiras de color que rebotan', 'Precio u oferta grande y cierre con llamado claro'],
    style: { texts: 'muchos', hook: 'cinta', zoomText: true, look: 'calido', cameras: ['acercar', 'pulso'], sfxAuto: true, finish: { progressBar: true } } },
  restaurante: { preset: 'comida-calida', seconds: 30,
    points: ['Planos lentos y cercanos de la comida', 'Tonos cálidos y pocos textos, discretos', 'Sonido ambiente o música suave, sin efectos fuertes'],
    style: { texts: 'pocos', hook: 'subrayado', cameras: ['acercar', 'derecha', 'alejar', 'izquierda'], sfxAuto: false, finish: { vignette: true } } },
  moda: { preset: 'elegante', seconds: 20,
    points: ['Cortes al ritmo de la música, sin explicar de más', 'Tipografía fina, palabras apiladas estilo editorial', 'Movimientos de cámara lentos y grano de película'],
    style: { texts: 'pocos', hook: 'apilado', cameras: ['acercar', 'alejar'], sfxAuto: false, finish: { grain: true } } },
  tecnologia: { preset: 'tech-neon', seconds: 35,
    points: ['Gancho con el problema que resuelve la herramienta', 'Pantalla o demo a los pocos segundos', 'Datos y pasos convertidos en gráficos animados'],
    style: { texts: 'muchos', hook: 'glitch', zoomText: true, motionEvery: 3, cameras: ['acercar', 'ninguno'], sfxAuto: true, finish: { progressBar: true } } },
  educacion: { preset: 'clase-clara', seconds: 45,
    points: ['Prometer en el gancho qué se va a aprender', 'Pasos numerados y listas en pantalla', 'Barra de progreso para que se queden hasta el final'],
    style: { texts: 'pocos', hook: 'marcador', zoomText: true, motionEvery: 2, cameras: ['ninguno', 'acercar'], finish: { progressBar: true } } },
  salud: { preset: 'sobrio', seconds: 40,
    points: ['Tono calmado y cercano, sin exagerar', 'Una idea por video, con la frase clave en pantalla', 'Imagen limpia y clara, textos discretos'],
    style: { texts: 'pocos', hook: 'etiqueta', look: 'suave', cameras: ['acercar', 'ninguno'], sfxAuto: false, finish: {} } },
  negocios: { preset: 'negocio-directo', seconds: 35,
    points: ['Gancho con una cifra o un error común', 'Subtítulos grandes con la palabra clave en amarillo', 'Cifras y comparaciones como gráficos, cierre con «comenta» o «escríbeme»'],
    style: { texts: 'muchos', hook: 'gigante', zoomText: true, motionEvery: 3, cameras: ['acercar', 'ninguno', 'pulso'], sfxAuto: true, finish: { progressBar: true } } },
  inmobiliaria: { preset: 'con-ritmo', seconds: 30,
    points: ['Mostrar el mejor espacio en el primer plano', 'Recorrido con paneos suaves y cortes al ritmo', 'Datos clave (zona, área, precio) en etiquetas'],
    style: { texts: 'pocos', hook: 'banda', textStyle: 'etiqueta', cameras: ['derecha', 'acercar', 'izquierda', 'alejar'], look: 'vivo', finish: {} } },
  entretenimiento: { preset: 'rapido', seconds: 20,
    points: ['Empezar por el momento más fuerte', 'Cortes muy rápidos, destellos y sonidos', 'Textos grandes y de colores, tono divertido'],
    style: { texts: 'muchos', hook: 'gigante', zoomText: true, cameras: ['pulso', 'temblor', 'acercar'], flashes: true, sfxAuto: true, finish: { progressBar: true } } },
  servicios: { preset: 'testimonio', seconds: 40,
    points: ['Un caso real o una pregunta del cliente como gancho', 'Hablar a cámara con frases completas subtituladas', 'Pocas ideas subrayadas y cierre con contacto'],
    style: { texts: 'pocos', hook: 'subrayado', cameras: ['acercar', 'ninguno'], sfxAuto: false, finish: { vignette: true } } },
  otro: { preset: 'con-ritmo', seconds: 30,
    points: ['Gancho claro en los primeros 2 segundos', 'Subtítulos grandes y fáciles de leer', 'Un solo mensaje y un llamado a la acción al final'],
    style: { texts: 'pocos', hook: 'gigante', zoomText: true, cameras: ['acercar', 'ninguno', 'alejar'], finish: { progressBar: true } } },
};
