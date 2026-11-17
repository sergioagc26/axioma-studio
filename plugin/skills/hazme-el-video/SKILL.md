---
name: hazme-el-video
description: La forma más simple de usar Axioma Studio. La persona deja sus videos en crudo en la carpeta «Para editar» (con un pedido.txt, guion, referencia, logo o música si quiere) y Claude entrega el video terminado en «Listos», sin preguntas técnicas. Úsala cuando diga "hazme el video", "edita lo que dejé en la carpeta", "ya subí mis videos", "tengo un pedido", nombre una carpeta de «Para editar», o cuando alguien nuevo no sepa por dónde empezar. Sirve para cualquier material - hablando a cámara, VSL, varias tomas, video sin voz (gimnasio, comida, producto) o grabaciones de pantalla.
---

# Hazme el video

La persona no tiene que saber cómo funciona la app. Ella trae el material y dice qué quiere; tú decides todo lo demás y le entregas el video terminado.

Sigue también la skill `reglas-edicion`.

## 1. Mira qué trajo

Llama `leer_pedidos`.

- **No hay pedidos.** Explícale los 3 pasos y para:
  1. Crear una carpeta con el nombre del video dentro de «Para editar». La ruta exacta la da `leer_pedidos`.
  2. Meter ahí lo que grabó.
  3. Decirte «hazme el video de <nombre>».

  Si quiere decir qué busca, puede copiar `_plantilla/pedido.txt` dentro de su carpeta y llenarlo.
- **Hay varios pendientes y no dijo cuál.** Pregunta cuál, dando los nombres como opciones.
- **Es la primera vez en la sesión.** Llama `estado_sistema`. Si algo falla, explica el arreglo en una línea y para.

## 2. Pregunta lo mínimo (como mucho 2 cosas)

Lo que diga el `pedido.txt` (lo muestra `leer_pedidos` como «lo que pide») y lo que diga la persona en su mensaje ya cuenta. **No repitas preguntas ya respondidas.**

Solo si faltan, pregunta en un solo mensaje, con opciones:

1. **¿Qué quieres que haga quien lo vea?** Escribirte por DM, comentar, guardar, compartir, ir al link o seguirte.
2. **¿Dónde lo vas a publicar?** Instagram o TikTok (vertical), YouTube (horizontal) o un anuncio.

Todo lo demás tiene un valor por defecto: ritmo, tono, duración, subtítulos, música y estilo. La marca guardada y el video lo deciden. Si la persona tiene prisa o dice «tú decide», no preguntes nada.

## 3. Haz el video

Avisa en una línea: «Lo estoy editando: tarda de 3 a 15 minutos según lo largo del material».

Luego llama `hacer_video`:

- `pedido`: el nombre del pedido.
- `respuestas`: lo que te respondió en el paso 2. Claves: `objetivo`, `formato`, `duracion`, `ritmo`, `tono`, `publico`, `cta` y `notas`.
- `cliente`: solo si la persona nombró su marca y el pedido no la dice.

La herramienta decide sola según el material:

| Lo que trajo | Qué hace |
| --- | --- |
| Alguien hablando a cámara (reel, VSL, tutorial con voz) | Corta silencios, muletillas y tomas repetidas. Pone gancho, subtítulos, textos y música. |
| Varias partes habladas | Las une en orden y las edita como un solo video. |
| `guion.txt` | Corta con el guion: elige la mejor toma de cada frase, sigue su orden y avisa las frases que faltan. |
| Video sin voz (gym, comida, producto) | Arma un montaje de cortes al ritmo de la música, con gancho en pantalla. |
| `referencia.mp4` | Edita con ese estilo. |
| `logo.png` / `musica.mp3` | Los usa. |

**Videos hablados largos (VSL, más de 90 s).** Si el pedido no dice duración, no los acortes a reel: pasa `respuestas.duracion = "Lo que dure"`. Si pide clips para redes, después usa `dividir_en_partes`.

**Videos sin voz que vinieron con uno hablado.** `hacer_video` los nombra al final. Ponlos como apoyo en las escenas donde se habla de lo que muestran:

1. `leer_proyecto` para ver las escenas.
2. `usar_broll` con el archivo local y licencia `"propia"`.
3. `entregar_video` para exportar de nuevo.

## 4. Entrega

Cuéntale en pocas líneas, sin palabras técnicas:

- Dónde está el video, con la ruta de «Listos».
- Qué hiciste: lo que quitaste, el gancho que elegiste y la música.
- Si algo falta o salió raro: frases del guion que no encontró, un logo que no sirvió o que no había música.

Termina ofreciendo cambios con ejemplos concretos: «Si quieres algo distinto, dímelo así: *más corto*, *otro gancho*, *sin música*, *subtítulos más grandes*, *quita la parte de…*».

## 5. Cambios

Haz cada cambio con las herramientas de siempre: `leer_proyecto`, `editar_escena`, `recortar_escena`, `eliminar_escena`, `reordenar_escenas`, `ajustar_subtitulos`, `poner_musica`, `musica_biblioteca`, `poner_transicion`, `generar_variantes`, etc. Ver también la skill `editar-reel`.

Después de cada tanda de cambios, llama `entregar_video`: deja el video nuevo en «Listos» y guarda el anterior con su fecha.

- No le pidas que abra el studio. Ofrécelo solo si quiere ver o mover algo con sus manos (`abrir_studio`).
- No publiques nada ni marques nada como aprobado sin que lo diga.

## Si algo falla

Explica en una frase qué pasó y qué puede hacer la persona. Por ejemplo:

- «El video no tiene sonido: si es un montaje, perfecto; si hablabas, revisa el micrófono.»
- «No encontré el pedido: revisa que la carpeta esté dentro de "Para editar".»

Nunca muestres errores técnicos crudos.
