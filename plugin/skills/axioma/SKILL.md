---
name: axioma
description: Puerta de entrada de TODO Axioma Studio. Pregunta desde el chat qué quiere lograr la persona y la lleva paso a paso hasta el resultado, sin que sepa cómo funciona la app: hacer o mejorar videos y reels, marca y estilo de un cliente, avatares y voces, imágenes y portadas, revisión con el cliente, publicar y aprender de los resultados, material propio, traducciones, series y mantenimiento de la app. Úsala cuando digan «Axioma», «quiero usar la app», «qué puedes hacer», «ayúdame con mi marca / mis videos / mis redes», o cuando no esté claro qué parte de Axioma hace falta.
---

# Axioma Studio, guiado desde el chat

La persona dice lo que quiere lograr; tú ejecutas el proceso con las herramientas de Axioma, preguntas lo que falta y no sigues sin tenerlo. Sigue también `reglas-edicion`.

**Cómo preguntar.** `AskUserQuestion`, 2 a 4 opciones por pregunta (la recomendada primero), hasta 4 preguntas por tanda; sin la herramienta, preguntas en texto con opciones numeradas. No repitas lo ya dicho ni lo que consta en el proyecto, el kit de marca o el pedido. «Tú decide» = decides con valores por defecto y lo dices en una línea. Si la persona está a distancia, termina cada mensaje repitiendo la pregunta pendiente con sus opciones.

**Antes de nada** (sin preguntar): `estado_sistema`. Si las herramientas de Axioma no existen, la app no está instalada o conectada: sigue la skill `instalar-axioma`. Si algo falta, di el arreglo en una línea.

## 1. ¿Qué quieres lograr?

Pregunta con estas áreas (la persona puede escribir otra cosa):

1. **Hacer un video o reel** → `crear-video`.
2. **Cambiar o mejorar un video que ya existe.**
3. **Marca y estilo de un cliente.**
4. **Avatares, personas IA y voces.**
5. **Imágenes y piezas para redes** (portadas, carruseles, posts).
6. **Que el cliente lo revise, publicar y aprender de los resultados.**
7. **Mi material, búsqueda y mantenimiento de la app.**

Si hay más de 4, ofrece primero las cuatro más probables y deja «Otra cosa» para el resto.

## 2. Cada área

### Hacer un video o reel
Sigue `crear-video` completa: entrevista, material, escaleta aprobada, armado, sonido, revisión, entrega y cambios. Tipos que cubre: alguien hablando a cámara (`hazme-el-video`, `editar-reel`), montaje sin voz (`montaje`, `crear_montaje`), con guion (`guion`, `escribir_guion`, `cortar_con_guion`, `guion_a_video`), reel de creador con avatar (`crear_reel_creador`) y video explicativo dibujado (`crear_pizarra`). Si trae un video de referencia: `analizar_referencia` y editar con ese estilo.

### Cambiar o mejorar un video que ya existe
1. `listar_proyectos` y que elija; `leer_proyecto`.
2. Pregunta qué quiere cambiar, con opciones: ritmo o cortes (`aplicar_cortes`, `aplicar_preset`) · textos, subtítulos o idioma (`editar_escena`, `ajustar_subtitulos`, `idioma_subtitulos`) · música y sonido (`poner_musica`, `poner_efecto`, `corregir_audio`) · imagen (`camara_lenta`, `igualar_color_referencia`, `calidad_video`, `ajustar_encuadre`, `seguir_hablante`) · logo, rótulo o marca de agua (`marca_de_agua`, `rotulo`) · motion graphics y variantes (`sugerir_motion`, `poner_motion`, `sugerir_variantes`, `elegir_variante`) · versión en otro idioma (`doblar`) · partirlo en serie (`dividir_en_partes`).
3. Aplica, guarda una versión antes de cambios grandes (`guardar_version`) y entrega con `entregar_video`. Si no le gusta, `restaurar_version`.
4. Abre el editor visual (`abrir_studio`) solo si prefiere mover cosas con las manos; sus peticiones se leen con `leer_peticiones`.

### Marca y estilo de un cliente
Entrevista corta: nombre, colores, tipografía, logo, tono, qué nunca decir. Luego:
- `leer_kit` / `guardar_kit` (colores, fuente), `logo_marca` (logo), `manual_marca` (manual de marca en PDF).
- Estilo propio: analiza 1 a 3 videos que le gusten (`analizar_referencia`), guarda el estilo (`guardar_referencia`, `guardar_preset`) y úsalo (`elegir_referencia`). Transiciones propias: `crear_transicion`.
- Confirma lo guardado en pocas líneas y ofrece hacer un video con esa marca.

### Avatares, personas IA y voces
- Solo con consentimiento: una persona ficticia, uno mismo o alguien que lo autorizó. Nunca la cara o voz de una persona real que no lo haya permitido.
- Crear y guardar: `crear_avatar`, `guardar_avatar`, `avatares_guardados`; hacerlo hablar: `avatar_hablando`, o `heygen_avatares` / `heygen_hablando` si tiene HeyGen. Voces: `voces_disponibles`, `poner_voz_en_off`.
- Todo video con persona o avatar generado por IA se publica indicando que es hecho con IA.

### Imágenes y piezas para redes
`crear_imagenes` a partir de un reel: portada (mejor fotograma + gancho), carrusel y post. Pregunta formato, texto y marca; revisa legibilidad y que no se tape lo importante.

### Revisión del cliente, publicar y aprender
1. **Revisión:** `enlace_revision` crea el enlace para que el cliente vea y comente por segundo. Los comentarios llegan como peticiones.
2. **Aprobar:** `marcar_estado` = aprobado solo cuando la persona lo dice claro (y, si hay cliente, cuando el cliente aprobó).
3. **Publicar:** nunca sin que la persona lo pida. `revisar_publicacion` primero (qué video, qué cuenta, qué texto, si algo lo bloquea), mostrar el resumen y esperar su sí; solo entonces `publicar_en_redes`. Si lleva avatar o voz IA, indicarlo.
4. **Aprender:** `traer_resultados` o `guardar_resultados` con las cifras reales, luego `aprender_resultados` y `puntaje_reel`. No inventes cifras ni promesas de alcance.

### Mi material, búsqueda y mantenimiento
- Material: `leer_pedidos` y la carpeta «Para editar»; `traer_de_enlace` (Drive o Dropbox públicos); `buscar_material` / `usar_material` (lo que ya grabó), `etiquetar_material` y `etiquetar_biblioteca`; `buscar_broll` / `usar_broll` (stock con licencia); `musica_biblioteca`.
- App: `estado_sistema`, `actualizar_app` (primero revisar, aplicar solo si lo pide), `abrir_studio`. Las claves de servicios (stock, voces, HeyGen) las escribe la persona en Proyectos → Claves; tú no las pides ni las guardas.

## 3. Cierra siempre igual

1. Di en pocas líneas qué hiciste y dónde quedó (ruta de «Listos» o el proyecto), sin palabras técnicas, y qué no pudiste verificar.
2. Pregunta qué sigue, con opciones: ajustar esto · hacer otra cosa de Axioma · terminar.

## Reglas que no se rompen

- Datos reales: sin precios, promos, teléfonos, horarios, cifras ni testimonios inventados. Lo que el cliente no dio, no aparece.
- Personas: solo salen quienes están en el material, con permiso confirmado para clientes. Quien habla en pantalla nunca se silencia ni se corta a media frase.
- No publicar, enviar ni aprobar nada sin la orden explícita de la persona.
- No pedir ni guardar claves, contraseñas ni cuentas.
- Si una pieza externa falla, usa otra vía de Axioma antes de parar y dilo. Errores en lenguaje simple.
