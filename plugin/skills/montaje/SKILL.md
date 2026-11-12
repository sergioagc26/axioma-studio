---
name: montaje
description: Edita videos SIN voz como un montaje de cortes rápidos (gimnasio, comida, producto, viajes, detrás de cámaras) y pone voz en off o música. Úsala cuando el usuario pase uno o varios videos donde nadie habla a cámara, pida "cortes rápidos", "un montaje", "un reel de gym / de comida", "ponle voz en off", o cuando crear_proyecto falle porque no se detectó voz.
---

# Montaje (videos sin voz)

Aquí no hay transcripción que guíe el corte: se trabaja con **tomas** (`t01`, `t02`…), que son los cambios de plano del material. Sigue también la skill `reglas-edicion`.

## 1. Crear

- Pide los videos: uno o varios archivos, o una carpeta. Rutas absolutas.
- Pregunta solo lo necesario, en una sola vez:
  - duración (por defecto 15 s);
  - ritmo: rápido (~0,8 s por corte), con ritmo (~1,2 s) o sobrio (~2 s);
  - si llevará música, voz en off, textos en pantalla, o nada.
- Llama `crear_montaje`. Avisa que tarda 1–5 minutos.

## 2. Elegir las mejores tomas

`crear_montaje` devuelve las tomas con la ruta de una miniatura de cada una.

1. Mira las miniaturas con tu herramienta de lectura de imágenes. Si son muchas, mira como máximo 12, repartidas.
2. Descarta las que no aportan: borrosas, tapadas, repetidas, sin acción.
3. Ordena para que cuente algo:
   - **Gancho**: la toma más llamativa primero (el plato terminado, el levantamiento más pesado, el resultado).
   - **Desarrollo**: el proceso, variando planos.
   - **Cierre**: el resultado o el producto.
4. Llama `armar_montaje` con `tomas` en ese orden. Puedes repetir una toma con distinto `inicio` si es larga y buena.

Si el usuario solo quiere algo rápido, deja el montaje automático de `crear_montaje` y sáltate este paso.

## 3. Música

- Con `poner_musica` (archivo local y su licencia). Después llama `armar_montaje` otra vez: los cortes se ajustan al compás.
- En un montaje la música es protagonista: volumen 0,4–0,6. Con voz en off, bájala a 0,15–0,2.
- `ajustar_sonido_original` controla el ambiente del video: 0 para silenciarlo, 0,3–0,6 si aporta (golpes, sartén, pesas).

## 4. Voz en off

1. Escribe el guion **con el usuario**: propón un borrador corto y deja que lo apruebe o lo cambie. Unas 2,5 palabras por segundo: para 15 s, 35–40 palabras. No inventes datos, precios ni resultados.
2. Consulta `voces_disponibles`. Si solo está `sistema`, avisa que suena robótica y que con una clave de ElevenLabs en `.env` (`ELEVENLABS_API_KEY`) suena natural.
3. Llama `poner_voz_en_off`. La voz se subtitula sola.
4. Llama `armar_montaje` sin duración: el montaje pasa a durar lo que dura la voz.

La voz en off también sirve en un video hablado (reemplaza la voz original): úsala solo si el usuario lo pide.

## 5. Textos, revisión y render

- Textos en pantalla con `editar_escena` (máximo 6 palabras, solo en 1–3 cortes clave).
- `abrir_studio` para que el usuario vea y reordene los cortes.
- `renderizar`. El encuadre sigue la cara solo; si no hay cara, queda centrado, y se puede fijar con `ajustar_encuadre`.

## Estilo de respuesta

Español, frases cortas. Muestra el montaje como lista numerada: corte, toma y qué se ve.
