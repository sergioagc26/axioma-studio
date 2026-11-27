import React from 'react';
import { AbsoluteFill, Audio, cancelRender, continueRender, delayRender, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame } from 'remotion';

// «Etiqueta por etiqueta»: tipografía cinética a 120 BPM (1 tiempo = 15 cuadros).
// Fuentes de la marca (Archivo y Geist), guardadas en public/ para que el render no dependa de internet.
const archivo = 'ArchivoLB', geist = 'GeistLB';
if (typeof document !== 'undefined') {
  for (const [fam, file, weight] of [[archivo, 'Archivo-900.woff2', '900'], [geist, 'Geist.woff2', '100 900']] as const) {
    const h = delayRender(`Fuente ${fam}`);
    const face = new FontFace(fam, `url(${staticFile(file)}) format('woff2')`, { weight });
    face.load().then((f) => { document.fonts.add(f); continueRender(h); }).catch((e) => cancelRender(e));
  }
}
const C = { night: '#0b1f4d', night2: '#12306f', accent: '#1f4fd8', tag: '#ffc61a', ink: '#0e1726', white: '#ffffff', muted: '#b9c6e6', bad: '#b3261e', badBg: '#fce8e6', soft: '#eaf0fd' };
const B = 15; // cuadros por tiempo
const DUR = [120, 120, 120, 120, 120, 180, 120, 120, 60, 120];
export const TOTAL = DUR.reduce((a, b) => a + b, 0);
const SAFE = { top: 230, bottom: 400, side: 70 }; // zonas seguras del vertical

const pop = (f: number, at: number, damping = 11, stiffness = 190) => spring({ frame: f - at, fps: 30, config: { damping, stiffness, mass: 0.6 } });
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Palabras que entran estiradas desde abajo, una por una. */
const Kinetic: React.FC<{ text: string; at: number; size: number; color?: string; stagger?: number; font?: string; weight?: number; align?: 'left' | 'center'; width?: number }> = ({ text, at, size, color = C.white, stagger = 3, font = archivo, weight = 900, align = 'left', width }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `0 ${size * 0.26}px`, justifyContent: align === 'center' ? 'center' : 'flex-start', fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 1.02, color, letterSpacing: '-0.02em', width }}>
      {text.split(' ').map((w, i) => {
        const s = pop(f, at + i * stagger);
        return <span key={i} style={{ display: 'inline-block', transformOrigin: '50% 100%', transform: `translateY(${(1 - s) * size * 0.9}px) scaleY(${1 + (1 - s) * 0.9}) skewX(${(1 - s) * -8}deg)`, opacity: Math.min(1, s * 4), filter: `blur(${Math.max(0, (1 - s) * 10)}px)` }}>{w}</span>;
      })}
    </div>
  );
};

/** Etiqueta amarilla de bodega que cae de golpe (con ojal y cordón). */
const Tag: React.FC<{ at: number; rot?: number; size?: number; color?: string; ink?: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, rot = -4, size = 64, color = C.tag, ink = C.ink, children, style }) => {
  const f = useCurrentFrame();
  const s = pop(f, at, 9, 230);
  if (f < at) return null;
  const shake = f - at < 6 ? Math.sin((f - at) * 2.4) * (6 - (f - at)) * 0.8 : 0;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3, background: color, color: ink, fontFamily: archivo, fontWeight: 900, fontSize: size, lineHeight: 1.05, padding: `${size * 0.28}px ${size * 0.5}px ${size * 0.28}px ${size * 0.4}px`, borderRadius: size * 0.18, clipPath: `polygon(${size * 0.35}px 0, 100% 0, 100% 100%, ${size * 0.35}px 100%, 0 50%)`, transform: `translateX(${shake}px) rotate(${rot + (1 - s) * 14}deg) scale(${interpolate(s, [0, 1], [2.8, 1])})`, opacity: Math.min(1, s * 5), boxShadow: '0 18px 0 rgba(0,0,0,.25)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', ...style }}>
      <span style={{ width: size * 0.22, height: size * 0.22, borderRadius: 99, background: C.night, flex: 'none', marginLeft: size * 0.12 }} />
      <span>{children}</span>
    </div>
  );
};

/** Botón del panel, con su nombre exacto. Se «toca» en el cuadro `press`. */
const Btn: React.FC<{ at: number; press?: number; size?: number; children: React.ReactNode }> = ({ at, press, size = 58, children }) => {
  const f = useCurrentFrame();
  const s = pop(f, at);
  const p = press === undefined ? 0 : f - press;
  const squash = p >= 0 && p < 10 ? interpolate(p, [0, 3, 10], [1, 0.88, 1]) : 1;
  const ring = p >= 0 ? interpolate(p, [0, 16], [0, 1], clamp) : 0;
  if (f < at) return null;
  return (
    <div style={{ position: 'relative', display: 'inline-block', transform: `scale(${s * squash})`, opacity: Math.min(1, s * 4) }}>
      {p >= 0 && <div style={{ position: 'absolute', inset: -ring * 46, border: `${10 * (1 - ring)}px solid ${C.tag}`, borderRadius: 30 + ring * 46, opacity: 1 - ring }} />}
      <div style={{ background: p >= 0 ? '#173fb3' : C.accent, color: C.white, fontFamily: geist, fontWeight: 700, fontSize: size, padding: `${size * 0.42}px ${size * 0.8}px`, borderRadius: 24, boxShadow: `0 ${p >= 0 && p < 5 ? 4 : 14}px 0 rgba(0,0,0,.3)`, whiteSpace: 'nowrap' }}>{children}</div>
      {p >= 0 && p < 14 && <div style={{ position: 'absolute', right: -30, bottom: -50, fontSize: 96, transform: `scale(${interpolate(p, [0, 3, 14], [1.3, 0.9, 1.1])}) rotate(-18deg)` }}>👆</div>}
    </div>
  );
};

const StepHeader: React.FC<{ n: number; title: string }> = ({ n, title }) => {
  const f = useCurrentFrame();
  const g = pop(f, 0, 14, 120);
  return (
    <>
      <div style={{ position: 'absolute', right: -40, top: 120, fontFamily: archivo, fontWeight: 900, fontSize: 900, lineHeight: 0.8, color: 'transparent', WebkitTextStroke: `6px ${C.night2}`, transform: `translateX(${(1 - g) * 500}px) rotate(${6 - g * 6}deg)`, opacity: 0.9 }}>{n}</div>
      <div style={{ position: 'absolute', left: SAFE.side, top: SAFE.top }}><Tag at={0} size={54} rot={-5}>PASO {n} DE 6</Tag></div>
      <div style={{ position: 'absolute', left: SAFE.side, top: SAFE.top + 150, width: 940 }}><Kinetic text={title} at={4} size={132} /></div>
    </>
  );
};

const Note: React.FC<{ at: number; children: React.ReactNode; color?: string; size?: number }> = ({ at, children, color = C.muted, size = 46 }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [at, at + 8], [0, 1], clamp);
  return <div style={{ fontFamily: geist, fontWeight: 500, fontSize: size, lineHeight: 1.25, color, opacity: o, transform: `translateY(${(1 - o) * 24}px)` }}>{children}</div>;
};

const Body: React.FC<{ top?: number; children: React.ReactNode }> = ({ top = 720, children }) => <div style={{ position: 'absolute', left: SAFE.side, right: SAFE.side, top, bottom: SAFE.bottom, display: 'flex', flexDirection: 'column', gap: 44, alignItems: 'flex-start' }}>{children}</div>;

// —— Escenas ——
const S0: React.FC = () => {
  const f = useCurrentFrame();
  const s = pop(f, B, 8, 200);
  return (
    <AbsoluteFill style={{ padding: `${SAFE.top + 120}px ${SAFE.side}px` }}>
      <Kinetic text="Hola," at={0} size={150} color={C.muted} />
      <div style={{ fontFamily: archivo, fontWeight: 900, fontSize: 330, lineHeight: 0.9, color: C.tag, letterSpacing: '-0.04em', transformOrigin: '0 100%', transform: `scale(${s}, ${s * (1 + (1 - Math.min(1, s)) * 1.2)}) rotate(${(1 - s) * -8}deg)`, opacity: f < B ? 0 : 1 }}>Laura.</div>
      <div style={{ marginTop: 70 }}><Kinetic text="El panel de La Bodega" at={4 * B} size={118} /></div>
      <div style={{ marginTop: 60 }}><Tag at={6 * B} size={96} rot={-6}>en 6 pasos</Tag></div>
    </AbsoluteFill>
  );
};

const S1: React.FC = () => {
  const f = useCurrentFrame();
  const url = 'somoslabodega.com/admin';
  const typed = url.slice(0, Math.round(interpolate(f, [B, 2 * B + 8], [0, url.length], clamp)));
  const card = pop(f, 2 * B, 13, 130);
  return (
    <AbsoluteFill>
      <StepHeader n={1} title="Entra" />
      <Body top={540}>
        <div style={{ background: C.white, color: C.ink, fontFamily: geist, fontWeight: 700, fontSize: 58, padding: '26px 40px', borderRadius: 99, opacity: f >= B ? 1 : 0, boxShadow: '0 12px 0 rgba(0,0,0,.25)' }}>🔒 {typed}<span style={{ opacity: f % 10 < 5 ? 1 : 0, color: C.accent }}>|</span></div>
        {/* Captura REAL de la página de ingreso (sin credenciales) */}
        <div style={{ flex: 'none', width: 720, height: 420, borderRadius: 28, overflow: 'hidden', border: `8px solid ${C.white}`, transform: `translateX(${(1 - card) * 1100}px) rotate(${3 - card * 5}deg)`, boxShadow: '0 30px 60px rgba(0,0,0,.45)', alignSelf: 'center' }}>
          <Img src={staticFile('login.png')} style={{ width: 1150, marginLeft: -215, marginTop: -55 }} />
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          <Tag at={4 * B} size={44} rot={-3}>Correo electrónico</Tag>
          <Tag at={5 * B} size={44} rot={2}>Contraseña</Tag>
          <Btn at={6 * B} press={7 * B} size={50}>Ingresar</Btn>
        </div>
        <Note at={5 * B}>Tu contraseña es solo tuya. No la compartas.</Note>
      </Body>
    </AbsoluteFill>
  );
};

const S2: React.FC = () => {
  const f = useCurrentFrame();
  const q = 'nombre o modelo';
  const typed = q.slice(0, Math.round(interpolate(f, [3 * B + 6, 5 * B], [0, q.length], clamp)));
  const bar = pop(f, 3 * B);
  return (
    <AbsoluteFill>
      <StepHeader n={2} title="Busca el producto" />
      <Body top={800}>
        <Note at={B - 4} color={C.white}>Arriba, en el menú, toca</Note>
        <Btn at={B} press={2 * B} size={96}>Productos</Btn>
        <div style={{ width: 940 * bar, overflow: 'hidden', background: C.white, borderRadius: 26, padding: '34px 40px', fontFamily: geist, fontSize: 60, color: C.ink, fontWeight: 500, whiteSpace: 'nowrap', opacity: f >= 3 * B ? 1 : 0, marginTop: 30, boxShadow: `0 0 0 8px ${C.tag}` }}>
          <span style={{ fontWeight: 700 }}>Buscar </span><span style={{ color: '#586274' }}>{typed}</span><span style={{ color: C.accent, opacity: f % 10 < 5 ? 1 : 0 }}>|</span>
        </div>
        <Tag at={6 * B} size={60} rot={-3}>y tócalo para abrirlo</Tag>
      </Body>
    </AbsoluteFill>
  );
};

const S3: React.FC = () => {
  const f = useCurrentFrame();
  const flip = interpolate(f, [4 * B, 4 * B + 8], [0, 180], { ...clamp, easing: Easing.out(Easing.cubic) });
  const showNew = flip > 90;
  const st = pop(f, B);
  return (
    <AbsoluteFill>
      <StepHeader n={3} title="Pásalo a revisión" />
      <Body top={830}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30, opacity: f >= B ? 1 : 0 }}>
          <span style={{ fontFamily: geist, fontWeight: 500, fontSize: 50, color: C.muted }}>Estado:</span>
          <div style={{ transform: `perspective(900px) rotateX(${showNew ? flip - 180 : flip}deg) scale(${st * (showNew ? 1.25 : 1)})`, transformOrigin: '0 50%', background: showNew ? C.tag : '#dfe5f0', color: C.ink, fontFamily: archivo, fontWeight: 900, fontSize: 84, padding: '18px 44px', borderRadius: 99 }}>{showNew ? 'Por revisar' : 'Borrador'}</div>
        </div>
        <Note at={2 * B - 4} color={C.white}>Al lado, toca el botón</Note>
        <Btn at={2 * B} press={4 * B} size={64}>Pasar a «Por revisar»</Btn>
        <Note at={6 * B} color={C.tag} size={52}>✓ Arriba sale un aviso que lo confirma</Note>
      </Body>
    </AbsoluteFill>
  );
};

const S4: React.FC = () => {
  const f = useCurrentFrame();
  const y = interpolate(f, [B, 3 * B], [900, 0], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const n = Math.round(interpolate(f, [4 * B, 8 * B - 8], [1, 10], clamp));
  return (
    <AbsoluteFill>
      <StepHeader n={4} title="Baja por la ficha" />
      <Body top={800}>
        <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ fontFamily: archivo, fontSize: 120, color: C.tag, transform: `translateY(${((f * 9 + i * 40) % 120) - 60}px)`, opacity: f < 3 * B ? 0.9 - i * 0.25 : 0 }}>↓</div>)}
        </div>
        <div style={{ transform: `translateY(${y - 180}px)`, filter: `blur(${Math.min(18, Math.abs(y) / 30)}px)`, fontFamily: archivo, fontWeight: 900, fontSize: 150, color: C.white, letterSpacing: '-0.03em', borderBottom: `14px solid ${C.tag}`, paddingBottom: 6 }}>Fotografías</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 28, opacity: f >= 4 * B ? 1 : 0, marginTop: -120 }}>
          <span style={{ fontFamily: archivo, fontWeight: 900, fontSize: 330, lineHeight: 0.85, color: C.tag, transform: `scale(${1 + ((f - 4 * B) % 7 === 0 && n < 10 ? 0.12 : 0)})`, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
          <span style={{ fontFamily: geist, fontWeight: 700, fontSize: 60, color: C.white, lineHeight: 1.1 }}>fotos máximo<br />por producto</span>
        </div>
      </Body>
    </AbsoluteFill>
  );
};

const Row: React.FC<{ at: number; n: number; name: string; hint: string }> = ({ at, n, name, hint }) => {
  const f = useCurrentFrame();
  const s = pop(f, at, 12, 170);
  if (f < at) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28, transform: `translateX(${(1 - s) * -900}px) skewX(${(1 - s) * 14}deg)`, width: '100%' }}>
      <div style={{ flex: 'none', width: 104, height: 104, borderRadius: 99, background: C.tag, color: C.ink, fontFamily: archivo, fontWeight: 900, fontSize: 64, display: 'grid', placeItems: 'center' }}>{n}</div>
      <div>
        <div style={{ fontFamily: archivo, fontWeight: 900, fontSize: 78, color: C.white, lineHeight: 1 }}>{name}</div>
        <div style={{ fontFamily: geist, fontWeight: 500, fontSize: 40, color: C.muted, marginTop: 8 }}>{hint}</div>
      </div>
    </div>
  );
};

const S5: React.FC = () => (
  <AbsoluteFill>
    <StepHeader n={5} title="Sube la foto" />
    <Body top={660}>
      <Row at={B} n={1} name="Archivo" hint="JPG, PNG o WebP · hasta 5 MB" />
      <Row at={3 * B} n={2} name="Texto alternativo" hint="Describe la foto: «Licuadora vista de frente»" />
      <Row at={5 * B} n={3} name="Origen" hint="¿La tomaste tú? «Fotografía del negocio»" />
      <div style={{ alignSelf: 'center', marginTop: 20 }}><Btn at={7 * B} press={9 * B} size={70}>Subir fotografía</Btn></div>
    </Body>
  </AbsoluteFill>
);

const S6: React.FC = () => {
  const f = useCurrentFrame();
  const strike = (at: number) => interpolate(f, [at, at + 6], [0, 100], clamp);
  return (
    <AbsoluteFill style={{ background: C.tag, padding: `${SAFE.top + 60}px ${SAFE.side}px` }}>
      <Kinetic text="SOLO FOTOS" at={0} size={176} color={C.ink} />
      <div style={{ fontFamily: archivo, fontWeight: 900, fontSize: 236, lineHeight: 0.95, color: C.night, letterSpacing: '-0.04em', transform: `scale(${interpolate(pop(f, B, 8, 220), [0, 1], [3, 1])}) rotate(-3deg)`, opacity: f >= B ? 1 : 0, transformOrigin: '30% 50%' }}>REALES</div>
      <div style={{ marginTop: 60 }}><Kinetic text="del mismo producto, modelo y color" at={3 * B} size={76} color={C.ink} font={geist} weight={700} /></div>
      <div style={{ marginTop: 80, display: 'flex', flexDirection: 'column', gap: 26 }}>
        {[['parecidas', 5 * B], ['inventadas', 6 * B]].map(([w, at]) => (
          <div key={w as string} style={{ position: 'relative', alignSelf: 'flex-start', fontFamily: archivo, fontWeight: 900, fontSize: 120, color: 'rgba(14,23,38,.55)', opacity: f >= (at as number) - 6 ? 1 : 0 }}>
            {w}
            <div style={{ position: 'absolute', left: -10, top: '52%', height: 16, width: `${strike(at as number)}%`, background: C.bad, transform: 'rotate(-3deg)' }} />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const S7: React.FC = () => {
  const f = useCurrentFrame();
  const a = 4 * B;
  const sh = f >= a && f < a + 12 ? Math.sin((f - a) * 2.6) * (12 - (f - a)) * 1.6 : 0;
  const s = pop(f, a, 10, 200);
  return (
    <AbsoluteFill>
      <StepHeader n={6} title="Revisa el resultado" />
      <Body top={800}>
        <Note at={B} color={C.white} size={56}>✓ La foto aparece en la lista</Note>
        <Note at={2 * B} size={46}>Aún no se ve en la tienda: primero se aprueba.</Note>
        <div style={{ transform: `translateX(${sh}px) scale(${s})`, opacity: f >= a ? 1 : 0, background: C.badBg, color: C.bad, borderLeft: `16px solid ${C.bad}`, borderRadius: 18, padding: '34px 40px', fontFamily: geist, fontWeight: 700, fontSize: 54, lineHeight: 1.2, width: '100%' }}>¿Sale «No se pudo guardar la foto…»?<div style={{ fontWeight: 500, fontSize: 42, color: C.ink, marginTop: 10 }}>Léelo: dice exactamente qué pasó.</div></div>
        <Tag at={6 * B} size={72} rot={-4}>📸 Captura → enviar</Tag>
      </Body>
    </AbsoluteFill>
  );
};

const S8: React.FC = () => (
  <AbsoluteFill style={{ padding: `${SAFE.top + 200}px ${SAFE.side}px`, gap: 40 }}>
    <Tag at={0} size={46} rot={-4}>Y en Inventario, la regla de la casa:</Tag>
    <div style={{ marginTop: 60 }}><Kinetic text="Disponible es disponible." at={B} size={136} stagger={4} /></div>
    <div style={{ marginTop: 40 }}><Kinetic text="Solo lo contado en bodega." at={2 * B} size={72} color={C.tag} font={geist} weight={700} /></div>
  </AbsoluteFill>
);

const S9: React.FC = () => {
  const f = useCurrentFrame();
  const s = pop(f, 0, 9, 200);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 60, paddingBottom: 160 }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [2.4, 1])}) rotate(-4deg)` }}><Tag at={0} size={104} rot={0}>¡Listo, Laura!</Tag></div>
      <div style={{ textAlign: 'center', opacity: interpolate(f, [B, B + 8], [0, 1], clamp) }}>
        <div style={{ fontFamily: archivo, fontWeight: 900, fontSize: 150, color: C.white, letterSpacing: '-0.03em', lineHeight: 1 }}>La Bodega</div>
        <div style={{ fontFamily: geist, fontWeight: 700, fontSize: 36, color: C.muted, letterSpacing: '0.18em', marginTop: 14 }}>ELECTRO · TECNOLOGÍA · HOGAR</div>
      </div>
      <Btn at={2 * B} press={2 * B + B} size={46}>Entra a somoslabodega.com/admin</Btn>
      <Note at={4 * B} color={C.white} size={48}>¿Algo no sale? Captura y envíala.</Note>
    </AbsoluteFill>
  );
};

const SCENES = [S0, S1, S2, S3, S4, S5, S6, S7, S8, S9];

/** Fondo: franjas de código de barras que avanzan y laten con el bombo. */
const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const beat = 1 - ((f % B) / B);
  const bars = [8, 3, 14, 5, 3, 10, 4, 18, 3, 6, 12, 3, 8, 4, 16, 5, 3, 9];
  let x = 0;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 30% 20%, ${C.night2}, ${C.night} 60%)` }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 300 + beat * beat * 26, display: 'flex', opacity: 0.16, transform: `translateX(${-((f * 2) % 180)}px)`, width: 2400 }}>
        {[...bars, ...bars, ...bars, ...bars].map((w, i) => { x += w; return <div key={i} style={{ width: w, marginRight: (i % 3) * 5 + 6, background: C.white }} />; })}
      </div>
      <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 ${200 + beat * 60}px rgba(0,0,0,.45)` }} />
    </AbsoluteFill>
  );
};

/** Transición: barrido del escáner (franja amarilla con línea láser) en cada cambio de escena. */
const Scan: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [at - 5, at + 6], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  if (f < at - 5 || f > at + 6) return null;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: `${interpolate(t, [0, 1], [-45, 105])}%`, height: '45%', background: `linear-gradient(${C.tag}00, ${C.tag} 35%, ${C.tag} 65%, ${C.tag}00)`, filter: 'blur(6px)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: `${interpolate(t, [0, 1], [-22, 128])}%`, height: 10, background: C.white, boxShadow: `0 0 40px 12px ${C.white}` }} />
    </AbsoluteFill>
  );
};

export const Promo: React.FC = () => {
  const f = useCurrentFrame();
  let from = 0;
  const starts: number[] = [];
  const fade = interpolate(f, [TOTAL - 20, TOTAL], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: C.night, opacity: fade }}>
      <Audio src={staticFile('pista.wav')} />
      <Backdrop />
      {SCENES.map((S, i) => {
        const el = <Sequence key={i} from={from} durationInFrames={DUR[i]}><S /></Sequence>;
        starts.push(from);
        from += DUR[i];
        return el;
      })}
      {starts.slice(1).map((s) => <Scan key={s} at={s} />)}
    </AbsoluteFill>
  );
};
