---
name: crear-video
description: Puerta de entrada de Axioma Studio. Guía de principio a fin, desde el chat, cualquier video o reel (promo de productos, hablando a cámara, montaje sin voz, reel con avatar): hace las preguntas necesarias con opciones, trae el material, propone la escaleta, arma el video, pone voz, música y efectos, revisa el resultado y entrega con ciclo de cambios hasta que la persona lo apruebe. Úsala cuando digan «quiero un video», «hazme un reel», «edítame esto», «promo para…», «crea un video para mi cliente», o cuando no esté claro qué skill de Axioma usar.
---

# Crear un video, guiado desde el chat

(Es la rama «hacer un video» de la skill `axioma`, que cubre toda la app.)

La persona no tiene que saber cómo funciona la app: tú llevas el proceso, preguntas lo que falta y no sigues hasta tener lo necesario. Sigue también `reglas-edicion`. Esta skill decide y ordena; el trabajo lo hacen `brief`, `hazme-el-video`, `editar-reel`, `montaje`, `guion`, `variantes` y las herramientas de Axioma.

**Cómo preguntar.** Usa `AskUserQuestion` con 2 a 4 opciones por pregunta (la recomendada primero), hasta 4 preguntas por tanda. Si la herramienta no está, pregunta en texto con las mismas opciones numeradas. No repitas lo que ya dijo la persona, lo que está en el `pedido.txt`, en el brief guardado (`leer_proyecto`), en la marca (`leer_kit`) o en el documento del cliente (Notion, Drive) si te dieron el enlace. Si dice «tú decide», decide con los valores por defecto y dilo en una línea.

**Si la persona trabaja a distancia** (no ve la pantalla), termina cada mensaje repitiendo la pregunta pendiente con sus opciones.

## Fase 0 · Prepara (sin preguntar nada)

1. `estado_sistema`: si falta algo, di el arreglo en una línea y para. **Si las herramientas de Axioma no existen**, la app no está instalada o conectada: sigue la skill `instalar-axioma` y vuelve aquí cuando termine.
2. `leer_pedidos` y `listar_proyectos`: ¿ya hay material o un proyecto empezado? Si hay uno en curso, ofrece continuarlo en vez de empezar otro.
3. Si hay marca del cliente, `leer_kit`.

## Fase 1 · Entrevista (máximo 3 tandas)

**Tanda 1 · Qué y para quién**
- Tipo de video: promo de productos · alguien hablando a cámara · montaje sin voz (gym, comida, viajes) · reel con avatar o voz IA.
- Cliente o marca (una existente o «personal»).
- Dónde se publica: Instagram Reels, Historias, TikTok, YouTube Shorts, Facebook Reels, estado de WhatsApp, YouTube (horizontal) o anuncio. Con la respuesta llama a `plataforma_destino`: cada red tapa zonas distintas (cuenta, descripción, música, botones, barra de respuesta) y subtítulos, rótulos, palabras y logo se mantienen dentro de la zona libre. Si dice dos redes, usa la más estricta (TikTok).
- Duración: 15 s · 30 s · 60 s · lo que dure.

**Tanda 2 · Material y sonido**
- De dónde sale el material: ya está en «Para editar» · enlace de Drive o Dropbox (`traer_de_enlace`) · Fotos o iCloud del Mac · una ruta. Si es un enlace de carpeta de Drive, pide que lo compartan como «Cualquier persona con el enlace» o los archivos uno por uno.
- Voz: la de quienes salen en los videos · voz en off IA (voces con `voces_disponibles`: femenina, masculina grave, etc.) · sin voz.
- Música (género): rock · urbano · electrónica · lofi · épica · sin música. Búscala con `musica_biblioteca`; si no hay del género, dilo y propón la más cercana.
- Efectos de sonido: pocos (whoosh en cambios fuertes) · muchos · ninguno.
- Calidad de entrega: **Full HD 1080p** (recomendado: redes, liviano y rápido) · 4K (más lento y pesado). Fíjala con `resolucion_entrega` antes de armar y confírmala al final: el video no debe salir en otra resolución sin que la persona lo haya elegido.

**Tanda 3 · Contenido y límites**
- Qué debe mostrar o decir sí o sí: productos exactos, el mensaje, la frase final.
- Datos que se pueden poner: precio, WhatsApp, dirección, horario. **Solo si el cliente los dio.** Si no, el video no los lleva.
- Qué NO puede salir: productos que no se venden, personas que no autorizaron, música o marcas ajenas, promesas.
- Qué haga quien lo vea al final (ir al local, escribir por DM, pedir en la web) y a quién le aprueba el video antes de publicar.

Con esto, resume el pedido en 5 a 8 líneas y sigue. Si algo crítico sigue sin respuesta (datos, personas, producto), pregúntalo antes de armar.

## Fase 2 · Material (mira antes de armar)

1. Trae y revisa lo que llegó: `describir_tomas`, `leer_tomas`, `leer_transcripcion` y, si hace falta, cuadros del video para ver qué se muestra de verdad.
2. Haz el **inventario**: qué productos se ven, quién habla y qué dice cada persona, qué tomas son solo producto, cuáles no sirven (borrosas, personales, de otro negocio).
3. **Verifica contra la fuente.** Los productos y datos salen del material y del documento del cliente, nunca de suposiciones. Lo que no se ve o no está escrito, no se promete (no pongas calzado si no venden calzado). Tomas personales que no son del negocio, fuera.
4. Para cada persona que habla, apunta sus frases con el segundo exacto donde empiezan y terminan.

## Fase 3 · Escaleta (se aprueba antes de armar)

Muestra una tabla corta: orden · lo que se oye · lo que se ve · duración · texto en pantalla · sonido. Reglas:

- **Coherencia:** lo que se dice y lo que se ve cuentan lo mismo. El producto nombrado aparece justo cuando se nombra. El orden sigue una historia: gancho → producto o promesa → prueba o demostración → llamada a la acción. Abre con la frase más fuerte, sin saludo.
- **La persona que habla nunca se silencia ni se corta.** Mientras se la ve hablando, se oye su voz, y su escena termina cuando acaba su frase, nunca a media palabra. Las tomas de producto van entre frases, o encima de una voz que habla fuera de cámara.
- Una sola llamada a la acción al final.
- Rótulos de producto cortos (máximo ~25 caracteres para que no se partan), en una franja libre, sin tapar el producto.

Pregunta: «¿Armo así o cambias algo?» con opciones (Armar · Cambiar orden · Quitar algo · Agregar algo). No armes sin el sí.

## Fase 4 · Arma

Elige el camino según lo que hay:

| Material | Camino |
| --- | --- |
| Alguien habla a cámara | `hazme-el-video` o `editar-reel` |
| Varios videos con voz de distintas personas y producto | Montaje con las frases reales: `montaje` + `leer_guion`/`editar_escena` con las frases elegidas, tomas de producto entre ellas |
| Videos sin voz | `montaje` con voz en off IA (`guion`) y música |
| Reel con avatar o voz IA | herramienta de reel de creador del servidor (`crear_reel_creador`) o `guion` + `poner_voz_en_off` |

Dos herramientas que hacen la diferencia:
- `editar_escena` con `sin_audio: true`: silencia el ruido de fondo de una toma de producto. **Nunca** en una escena donde se ve a alguien hablando.
- `ajustar_sonido_original` y `poner_voz_en_off`: la voz de las personas manda; la música baja sola cuando hay voz.

## Fase 5 · Sonido

1. Música del género pedido (`musica_biblioteca` → `poner_musica`). Si no hay del género, busca una con licencia libre y dilo. Volumen: que no tape las voces.
2. Efectos con medida (`listar_efectos`, `poner_efecto`): un whoosh en cada movimiento fuerte (algo que se lanza, un giro) y en el corte hacia una toma de producto; un golpe corto al inicio.  Para un gag de golpe o sartenazo usa `bonk` (golpe cómico de caricatura, sintetizado, sin copiar ninguna grabación). Nunca encima de una frase clave. No uses `efectos_automaticos` si ya los pusiste a mano.
3. Subtítulos legibles abajo (`ajustar_subtitulos`), con las palabras corregidas: marca, nombres de producto y números bien escritos.

## Fase 6 · Revisa antes de mostrar

Revisa tú primero, no le pases un borrador sin mirar:

- **Regla más importante: ningún texto sobre el producto ni sobre la cara.** Después de armar, llama a `ubicar_textos` (busca la franja libre de cada toma dentro de la zona segura) y MIRA un cuadro por escena: si un subtítulo o rótulo cae sobre el producto, corrígelo con `editar_escena` (`subtitulos_y`, `texto_y`), acorta el texto, quita el rótulo de esa escena o cambia de toma. Un texto que tapa el producto es un error, aunque esté dentro de la zona de la red.
- Zonas seguras: `plataforma_destino` sin plataforma dice qué se mueve; en los cuadros revisados nada de texto debe quedar bajo la descripción de la red, junto a los botones de la derecha ni pegado arriba.
- Duración, resolución y volumen: sin pasarse de la duración pedida, resolución igual a la elegida (Full HD = 1080 px de ancho, comprobable con `resolucion_entrega`) y ~-14 LUFS.
- Cuadros cada ~4 s: nadie hablando sin voz, rótulos que no tapan ni se parten, producto visible cuando se nombra, nada que la persona pidió excluir.
- Subtítulos acordes con lo que se oye.
- Que ninguna frase se corte a media palabra.

Corrige lo que veas y vuelve a renderizar. Si algo no pudiste comprobar (por ejemplo, no oíste el audio), dilo.

## Fase 7 · Entrega y cambios

1. `entregar_video`: deja el archivo en «Listos». Para mandarlo por chat, prepara una copia 1080p que pese menos de 30 MB.
2. Cuéntalo en pocas líneas, sin palabras técnicas: qué hace el video, qué decidiste (música, voz, orden) y qué no pudiste verificar.
3. Pregunta con opciones: **Aprobado · Cambiar la música · Cambiar el orden o las tomas · Otros cambios**.
4. Cada cambio: aplica con `editar_escena`, `reordenar_escenas`, `poner_musica`, `poner_efecto`, `ajustar_subtitulos`, etc., revisa de nuevo (fase 6) y vuelve a entregar. Las versiones anteriores quedan guardadas (`listar_versiones`, `restaurar_version`).
5. Solo con un «aprobado» claro: `marcar_estado` como aprobado. **Nada se publica sin que la persona lo pida y confirme** (`revisar_publicacion` primero, `publicar_en_redes` solo con su sí y, para clientes, después de que el cliente apruebe). Si el video lleva una persona o un avatar generado por IA, avisa que debe publicarse indicando que es hecho con IA.

## Reglas que no se rompen

- Datos reales: sin precios, promos, teléfonos, horarios ni plazos inventados.
- Personas: solo salen quienes están en el material y, para un cliente, con su permiso confirmado.
- No cambies lo que dijo una persona; puedes ordenar y recortar entre frases, no poner palabras en su boca.
- Cuando una pieza externa falle (voz, servicio, descarga), usa otra vía de Axioma antes de parar, y dilo.
- Errores en lenguaje simple, nunca el texto técnico crudo.


## Voces cortadas y datos hablados (reglas aprendidas con La Bodega)

- **Nunca cortes una voz en seco.** Al unir pedazos de voz de distintos clips: corta en un silencio entre palabras, deja 80–150 ms de fundido cruzado entre un pedazo y el siguiente (o deja que la voz del siguiente empiece unos 0,2 s antes de que cambie la imagen, corte en J) y pon una transición o un barrido en el cambio de imagen. Escucha cada unión; si una palabra queda a medias, alarga el pedazo.
- **Dirección y datos del local:** si la persona que dice la dirección sale en cámara, usa su voz pero cubre la imagen con tomas del local o de la entrada del centro comercial (`editar_escena` con b-roll del cliente); nunca repitas la toma de la persona diciendo la dirección. Escribe en pantalla solo lo que se dijo o lo que está en el documento del cliente. Si hay un video de la fachada o la entrada, úsalo ahí.

## Estilo «Creador neón» (sacado de reels de referencia)

Cuando pidan un video «dinámico», «como los de creador» o con «transiciones, efectos e íconos», usa el estilo `creador-neon` (`aplicar_preset`):
- **Ritmo:** planos de unos 2 s; cambia de lugar o de luz en cada idea (otro look del avatar, otra toma).
- **Transiciones de luz:** `luz-calida`, `luz-amarilla`, `luz-magenta`, `luz-cian`, `zoom-luz`, `luz-blanca` (cierre) y `tarjeta` (al entrar a un gráfico). El estilo las elige solo con la recomendación de transiciones.
- **Subtítulos:** una palabra a la vez, Poppins, al centro bajo de la cara, la clave en verde neón.
- **Elementos con la voz** (`poner_palabras`): `emoji` (sticker que salta justo cuando se dice la palabra), `neon` (título luminoso para el gancho), `circulo` (sello rojo con la palabra ancha para el golpe: «HORAS», «PIERDES»), `cristal` (etiquetas de vidrio para contrastes: «ANTES» / «AHORA»). Uno o dos por escena, nunca sobre la cara ni el producto.
- **Imagen:** look `neon` o `neon-frio` en las escenas con luces de color.

### Textos y objetos profesionales (segunda tanda de referencias)
- **Títulos** (`poner_palabras`): `ancho` (letras anchas que entran separadas y se juntan, con relieve; `/` separa líneas y `!` agranda una), `apilado` (título condensado en varias líneas; `*línea*` va sobre barra verde), `tresd` (palabra 3D de color) y `neon`. Ponlos con `detras: true` para que queden **detrás de la persona** (necesita el recorte: `recortar_persona`) y se vean como en los reels profesionales.
- **Objetos:** `objeto` (PNG con transparencia que entra girando en 3D, flota y proyecta sombra), `app` (ícono tipo app con un emoji), `foto` (tarjeta flotante) y `emoji`. Nunca pegues una imagen cuadrada: genera el objeto sobre pantalla verde (`generate_image_local`), quítale el fondo con chromakey y úsalo como `objeto`.
- **Lienzos de solo texto:** `fondo` (blanco o negro) y encima un `apilado`: se usa en las escenas de «el problema» y «así de simple», como en las referencias.
- Cada elemento sale justo en la palabra que se dice: calcula el segundo con la transcripción, no a ojo.
