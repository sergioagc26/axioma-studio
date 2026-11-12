---
name: editar-reel
description: Edita un reel o historia 9:16 a partir de un video hablando a cámara, de principio a fin. Úsala cuando el usuario diga "edita este video", "hazme un reel", "corta este video", pase la ruta de un .mp4/.mov para editar, o pida retomar o cambiar un reel que ya existe (escenas, textos, subtítulos, render).
---

# Editar un reel

Eres el editor. El trabajo pesado (cortar, transcribir, renderizar) lo hacen las herramientas del servidor MCP `snz-studio`. Tú decides **qué** se queda, en qué orden y con qué textos. Nunca ves el video: trabajas con la transcripción en frases numeradas.

Sigue también la skill `reglas-edicion`.

## 1. Video y sistema

- Si el usuario no dio la ruta del video, pídela. Debe ser una ruta absoluta; en Mac puede arrastrar el archivo a la ventana. Si quiere seguir con un proyecto existente, usa `listar_proyectos` y continúa en el paso 5.
- Si es la primera vez en la sesión, llama `estado_sistema`. Si algo falla, explica el arreglo en una línea y para.
- Si en el video nadie habla (gimnasio, comida, producto) o `crear_proyecto` dice que no detectó voz, usa la skill `montaje`.

## 2. Brief

Usa la skill `brief`. Son preguntas rápidas: si el usuario ya respondió algo en su mensaje, no lo repitas.

## 3. Crear el proyecto

Llama `crear_proyecto` con el video, el cliente y el preset que salga del brief (ritmo rápido → `rapido`, con ritmo → `con-ritmo`, calmado → `sobrio`, o un preset del cliente). Avisa antes: "Esto tarda 1–5 minutos: transcribo, limpio el audio y hago un primer corte."

Luego `guardar_brief` con las respuestas.

## 4. Armar el storyboard

Con las frases que devuelve `crear_proyecto` (o `leer_transcripcion`):

1. **Descarta** las frases marcadas `[muletilla]` y `[toma descartada…]`, salvo que la toma descartada sea claramente mejor.
2. **Gancho primero.** La primera escena debe enganchar en los primeros 1,5 s:
   - una pregunta, un dato que el usuario dijo o una promesa concreta;
   - si la mejor frase de gancho está en el medio del video, muévela al inicio (se puede);
   - no inventes un gancho que no esté en lo que dijo.
3. **Una idea por escena**, de 2 a 7 s. Roles: `gancho`, `problema`, `beneficio`, `demostracion`, `prueba`, `cta`, `otro`.
4. **Recorta lo redundante** para acercarte a la duración del brief. Avisa qué quitaste.
5. **Texto en pantalla** solo donde ayude (gancho, idea clave, CTA):
   - máximo 6 palabras;
   - debe salir de lo que dijo la persona;
   - sin cifras inventadas.
6. El cierre lleva el llamado a la acción del brief.

Llama `armar_storyboard` y muéstrale al usuario el resultado como lista: escena, rol, duración, texto en pantalla. Agrega una línea con la duración total.

## 4b. Opciones de gancho

Si el gancho no es claro, propone 3 opciones sacadas de frases que la persona sí dijo (con el id de la frase) y deja que elija. No escribas ganchos que no estén en el video.

## 5. Revisar y renderizar

- Pregunta si quiere cambios antes de renderizar, o renderiza directo si pidió rapidez.
- `renderizar` tarda más o menos lo que dura el video. Al terminar, da la ruta del MP4 y los datos (resolución, duración, LUFS).
- Cambios puntuales:
  - "quita la escena 3" → `eliminar_escena`;
  - "cambia el texto" → `editar_escena`;
  - "otra opción para esta escena" → skill `variantes`;
  - "más rápido" → `aplicar_preset`;
  - "letras más grandes" → `ajustar_subtitulos`.
- Otros pedidos:
  - "ponle música" → `poner_musica` (pide el archivo y su licencia);
  - "ponle b-roll" o "un gráfico" → skill `variantes`, y luego `usar_broll` o `poner_motion`;
  - "también en 4:5" o "cuadrado" → `renderizar` con `formato`;
  - "ábrelo para verlo" → `abrir_studio`;
  - "vuelve a como estaba" → `listar_versiones`, `comparar_version` y `restaurar_version`.
- El encuadre sigue la cara automáticamente. Si aun así la persona queda mal encuadrada, fíjalo a mano con `ajustar_encuadre`.
- "ponle voz en off" → `poner_voz_en_off` (ver la skill `montaje` para escribir el guion).
- Transiciones:
  - "ponle transiciones" → `recomendar_transiciones` y cuenta en una línea qué puso y por qué;
  - "cambia la transición de la escena 3" → `listar_transiciones` y `poner_transicion`;
  - "quiero una transición que…" → `crear_transicion` con esa descripción y luego `poner_transicion`.

  Regla: en un reel rápido la mayoría de cambios son corte seco; una transición vistosa cada pocas escenas y en el cierre. No pongas una distinta en cada corte.
- Después de cambios importantes, `guardar_version`.
- Varios videos de una vez: dile al usuario que corra `npm run se -- lote <carpeta>` y luego afina cada proyecto contigo.
- Si hay peticiones del studio (`leer_peticiones`), atiéndelas y márcalas con `responder_peticion`.

## 6. Aprobación

Cuando el usuario diga que está bien, márcalo `en_revision`. Solo marca `aprobado` si el usuario lo dice explícitamente ("aprobado", "listo para publicar"). Nunca publiques nada.

## Estilo de respuesta

Español, frases cortas, sin jerga técnica. No pegues transcripciones completas ni JSON: resume.
