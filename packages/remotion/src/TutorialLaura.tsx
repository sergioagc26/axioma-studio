import React from 'react';
import { AbsoluteFill, Sequence, Video, Img, staticFile, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Video tutorial para Laura (La Bodega): 8 escenas, ~2:40.
 * La toma del panel NUNCA se dibuja: es una grabación real que se coloca en
 * `public/laura/escena-N.mp4` (o .png) y se pasa en `screens`. Mientras no
 * exista, la escena muestra un recuadro que dice qué grabar.
 * `highlight` (en % de la toma: x, y, w, h) dibuja el círculo/recuadro
 * amarillo sobre el botón; se ajusta cuando ya existe la grabación.
 */
export interface Highlight { x: number; y: number; w: number; h: number; from?: number; to?: number } // from/to: segundos dentro de la escena
export interface Scene {
  seconds: number;
  step?: number; // «Paso N de 6»
  title: string;
  narration: string; // subtítulo (frases cortas)
  record: string; // qué debe mostrar la grabación real
  touch?: string[]; // botones/campos con el nombre exacto del panel
  note?: string; // texto destacado
  highlights?: Highlight[];
}

export const SCENES: Scene[] = [
  { seconds: 10, title: 'Panel de La Bodega · Por revisar y fotos', narration: 'Hola, Laura. Te muestro, paso a paso, cómo pasar un producto a «Por revisar» y cómo subirle una foto. Es fácil y toma pocos minutos.', record: 'Sin grabación: tarjeta de título.' },
  { seconds: 20, step: 1, title: 'Entra al panel', narration: 'Abre el navegador y entra a somoslabodega.com/admin. Escribe tu correo y tu contraseña, y toca «Ingresar». Tu contraseña es solo tuya: no la compartas.', record: 'Página «Panel de La Bodega» con «Correo electrónico», «Contraseña» e «Ingresar». Sin mostrar el correo completo ni la contraseña.', touch: ['Correo electrónico', 'Contraseña', 'Ingresar'], note: 'somoslabodega.com/admin' },
  { seconds: 20, step: 2, title: 'Busca el producto', narration: 'En el menú toca «Productos». En la casilla «Buscar» escribe el nombre o el modelo, y toca el producto para abrirlo.', record: 'Menú del panel (Resumen, Productos, Inventario…), luego casilla «Buscar» con un producto real.', touch: ['Productos', 'Buscar'] },
  { seconds: 25, step: 3, title: 'Pásalo a «Por revisar»', narration: 'Arriba de la ficha ves el estado, por ejemplo «Borrador». Toca «Pasar a «Por revisar»». Aparece un aviso y el estado ahora dice «Por revisar». Si sale un error, tómale una captura y envíala.', record: 'Etiqueta de estado y botón «Pasar a «Por revisar»»; después el aviso y el estado «Por revisar».', touch: ['Pasar a «Por revisar»'] },
  { seconds: 15, step: 4, title: 'Ve a Fotografías', narration: 'Baja por la ficha hasta la sección «Fotografías». Ahí se suben las fotos. Cada producto admite máximo 10.', record: 'Scroll hasta la sección «Fotografías».', touch: ['Fotografías'], note: 'Máximo 10 fotos por producto' },
  { seconds: 40, step: 5, title: 'Sube la foto', narration: 'Toca «Archivo» y elige la foto: JPG, PNG o WebP, hasta 5 megas. En «Texto alternativo» descríbela, por ejemplo «Licuadora vista de frente». En «Origen» elige de dónde salió. Si la tomaste tú en la tienda, «Fotografía del negocio». Si es del fabricante o distribuidor, llena nombre, enlace y permiso. Por último toca «Subir fotografía».', record: 'Formulario de Fotografías: Archivo → Texto alternativo → Origen → botón «Subir fotografía».', touch: ['Archivo', 'Texto alternativo', 'Origen', 'Subir fotografía'], note: 'Solo fotos reales del producto. Nada de fotos parecidas ni inventadas.' },
  { seconds: 20, step: 6, title: 'Revisa el resultado', narration: 'Si salió bien, la foto aparece en la lista. Todavía no se ve en la tienda: primero tiene que aprobarse. Si sale «No se pudo guardar la foto», léelo, tómale una captura y envíala.', record: 'La foto en la lista de fotografías; luego un mensaje real «No se pudo guardar la foto…».', touch: ['Lista de fotografías'], note: 'Captura → enviar' },
  { seconds: 10, title: '¡Listo, Laura!', narration: 'Ya sabes pasar un producto a «Por revisar» y subirle una foto. Si algo no sale, toma una captura y envíala. ¡Gracias!', record: 'Sin grabación: resumen.', note: '1. Productos → buscar → abrir el producto\n2. Pasar a «Por revisar»\n3. Fotografías → Archivo → Texto alternativo → Origen → Subir fotografía' },
];

export const TUTORIAL_FPS = 30;
export const TUTORIAL_FRAMES = SCENES.reduce((a, s) => a + s.seconds * TUTORIAL_FPS, 0);

const C = { night: '#0B1B3B', white: '#FFFFFF', yellow: '#FFC83D' };

export interface TutorialLauraProps {
  /** Archivos dentro de public/ por número de escena (1–8), p. ej. { 2: 'laura/escena-2.mp4' }. */
  screens?: Record<number, string>;
  /** Voz en off ya generada (opcional), p. ej. 'laura/voz.mp3'. */
  voice?: string;
  /** Música de fondo muy baja (opcional). */
  music?: string;
  /** Presentadora (avatar o persona real) en una esquina: video o imagen (opcional). */
  presenter?: string;
  highlights?: Record<number, Highlight[]>;
}

const Slot: React.FC<{ src?: string; scene: Scene; hl: Highlight[]; vertical: boolean }> = ({ src, scene, hl, vertical }) => {
  const frame = useCurrentFrame();
  const t = frame / TUTORIAL_FPS;
  const isVideo = !!src && /\.(mp4|mov|webm)$/i.test(src);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 28, overflow: 'hidden', background: '#102A5C', border: `4px solid ${C.white}22` }}>
      {src ? (isVideo ? <Video src={staticFile(src)} muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, textAlign: 'center', gap: 16, color: C.white }}>
          <div style={{ fontSize: vertical ? 34 : 30, color: C.yellow, fontWeight: 800 }}>AQUÍ VA LA GRABACIÓN REAL</div>
          <div style={{ fontSize: vertical ? 38 : 32, lineHeight: 1.3 }}>{scene.record}</div>
        </div>
      )}
      {hl.filter((h) => t >= (h.from ?? 0) && t <= (h.to ?? 999)).map((h, i) => {
        const pulse = 1 + 0.04 * Math.sin(frame / 5);
        return <div key={i} style={{ position: 'absolute', left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%`, border: `6px solid ${C.yellow}`, borderRadius: 999, boxShadow: `0 0 0 6px ${C.yellow}55`, transform: `scale(${pulse})` }} />;
      })}
    </div>
  );
};

const SceneView: React.FC<{ scene: Scene; index: number; props: TutorialLauraProps; vertical: boolean }> = ({ scene, index, props, vertical }) => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const bookend = index === 0 || index === SCENES.length - 1;
  const big = vertical ? 1 : 0.8;
  return (
    <AbsoluteFill style={{ background: C.night, fontFamily: 'Inter, system-ui, sans-serif', color: C.white, opacity: fade, padding: vertical ? 48 : 56, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {scene.step && <div style={{ background: C.yellow, color: C.night, fontWeight: 900, fontSize: 44 * big, padding: '8px 24px', borderRadius: 999 }}>Paso {scene.step} de 6</div>}
        <div style={{ fontSize: (bookend ? 64 : 52) * big, fontWeight: 900, lineHeight: 1.1 }}>{scene.title}</div>
      </div>
      {bookend ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52 * big, lineHeight: 1.5, whiteSpace: 'pre-line', color: C.yellow, fontWeight: 800, textAlign: 'left' }}>{scene.note ?? ''}</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <Slot src={props.screens?.[index + 1]} scene={scene} hl={props.highlights?.[index + 1] ?? scene.highlights ?? []} vertical={vertical} />
        </div>
      )}
      {scene.touch && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{scene.touch.map((b, i) => <span key={i} style={{ border: `3px solid ${C.yellow}`, color: C.yellow, borderRadius: 14, padding: '6px 18px', fontSize: 34 * big, fontWeight: 800 }}>{i + 1}. {b}</span>)}</div>}
      {!bookend && scene.note && <div style={{ background: `${C.yellow}`, color: C.night, borderRadius: 16, padding: '12px 24px', fontSize: 36 * big, fontWeight: 800 }}>{scene.note}</div>}
      <div style={{ fontSize: 38 * big, lineHeight: 1.35, background: '#00000055', borderRadius: 20, padding: '16px 24px' }}>{scene.narration}</div>
      {props.presenter && /\.(mp4|mov|webm)$/i.test(props.presenter)
        ? <Video src={staticFile(props.presenter)} muted style={{ position: 'absolute', right: 40, top: 40, width: 220, height: 220, borderRadius: 999, objectFit: 'cover', border: `5px solid ${C.yellow}` }} />
        : props.presenter ? <Img src={staticFile(props.presenter)} style={{ position: 'absolute', right: 40, top: 40, width: 220, height: 220, borderRadius: 999, objectFit: 'cover', border: `5px solid ${C.yellow}` }} /> : null}
    </AbsoluteFill>
  );
};

export const TutorialLaura: React.FC<TutorialLauraProps & { vertical?: boolean }> = ({ vertical = true, ...props }) => {
  const { fps } = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {SCENES.map((s, i) => {
        const d = s.seconds * fps;
        const el = <Sequence key={i} from={from} durationInFrames={d}><SceneView scene={s} index={i} props={props} vertical={vertical} /></Sequence>;
        from += d;
        return el;
      })}
    </AbsoluteFill>
  );
};
