# Técnica: tropiezos conocidos

## Disco lento (externo)
Muchos archivos pequeños (`node_modules`) pueden tardar decenas de minutos. Deja la carpeta del proyecto como original, copia `package*.json`, `tsconfig.json`, configuración, `src`, `scripts` y `public` a un disco interno, instala y renderiza allí, y devuelve `src` y el MP4. No ejecutes `du` ni `find` sobre `node_modules` externos.

## Render
- Un solo bundle para varios cuadros (`scripts/stills.mjs`) es mucho más rápido que `remotion still` repetido.
- Si el primer render falla conectando con Chrome, reintenta. Si la descarga de `chrome-headless-shell` se traba, copia `node_modules/.remotion` de otro proyecto.
- Texto con `background-clip: text` animando `background-position` deja un rectángulo borroso en el video (el still se ve bien): pon `key={frame}` en ese elemento y no le apliques `drop-shadow`.
- `z-index` debe ser entero.
- Usa `<Img>` de Remotion en vez de `background-image: url()`.
- Nada de animaciones CSS ni `Math.random()`: todo depende del cuadro (`useCurrentFrame`, `random()` de Remotion).
- El grano de película dispara el peso: sube el CRF (22 en vez de 19).

## Archivos
- Copia liviana para chat:
  `ffmpeg -i Renders/promo.mp4 -c:v libx264 -crf 26 -preset medium -c:a copy -movflags +faststart Renders/promo-liviano.mp4`
- Vistas previas en JPG liviano, no PNG grandes.
- Para la duración exacta del audio: `ffmpeg -i in.mp4 -c:v copy -af atrim=end=<segundos> out.mp4`.
- Un ffmpeg pesado que muere con código 137: repítelo en segundo plano con `-threads 6`.

## Zonas seguras (vertical 1080x1920)
Nada importante en los ~220 px de arriba, ~380 px de abajo ni ~120 px a la derecha.
