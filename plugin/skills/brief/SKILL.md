---
name: brief
description: Hace las preguntas del brief antes de editar un reel (formato, objetivo, público, ritmo, tono, duración, llamado a la acción y, si vende algo, producto y precio, dónde se compra, cómo termina, voz y qué no puede salir). Úsala al empezar un reel nuevo o cuando el usuario pida "hazme preguntas" o "empecemos el brief".
---

# Brief del reel

Objetivo: saber lo justo para editar bien. Son 7 preguntas básicas y, si el video vende un producto, 5 más de producto y entrega. Salta las que ya sepas.

## Antes: la marca

Llama `leer_kit`. Si el cliente no tiene sector, pregunta primero por la marca (una sola vez por cliente) y guárdalo con `guardar_kit`:

- A qué se dedica (`sector`): gimnasio, comida rápida, restaurante, moda, tecnología, educación, salud, negocios, inmobiliaria, entretenimiento, servicios u otro.
- Cómo habla (`personalidad`): enérgica, divertida, elegante, cercana, seria o rebelde.
- Sus dos colores, si los tiene.

Eso decide subtítulos, títulos, letra, imagen y efectos: no elijas esos estilos a mano si la marca ya los define.

## Preguntas (en este orden, saltando lo que ya sepas)

| Clave | Pregunta | Opciones (las mismas de la app) |
| --- | --- | --- |
| `formato` | ¿Dónde lo vas a publicar? | Reel 9:16 (por defecto), Historia 9:16, TikTok 9:16, YouTube Short 9:16, Anuncio 9:16 |
| `objetivo` | ¿Qué quieres que haga quien lo vea? | Mensajes por DM, Comentarios, Guardados, Compartidos, Ir al link, Seguidores |
| `publico` | ¿Para quién es? | Gente que aún no me conoce, Seguidores que ya me conocen, Clientes listos para comprar, Dueños de negocio y emprendedores, Jóvenes de 18 a 25, Adultos y familias |
| `ritmo` | ¿Qué ritmo? | Rápido, Con ritmo, Sobrio, Enérgico, Pausado y elegante, Que decida la app |
| `tono` | ¿Qué tono? | Directo, Cercano, Educativo, Inspirador, Divertido, Elegante |
| `duracion` | ¿Cuánto debe durar? | 10–15 s, 15–20 s, 20–30 s, 30–45 s, 45–60 s, Lo que dure |
| `cta` | ¿Con qué frase cierras? | La que digo en el video, o una frase que vaya con el objetivo (por ejemplo: Escríbeme «INFO» por DM) |

### Producto y entrega (siempre en negocios que venden algo)

Estas cinco salieron de los errores de un reel de comida callejera (producto equivocado, cierre por WhatsApp cuando era la web, final con solo papas, voz rechazada, toma con empleado y niño). No las saltes si el video vende un producto.

| Clave | Pregunta | Opciones |
| --- | --- | --- |
| `producto` | ¿Qué producto sale y a qué precio? | Texto libre con precios reales (ej.: «Mazorcada $17.000 · Clásica $12.000»). Nunca inventes un precio. |
| `canal` | ¿Dónde compra o pide el cliente? | En la página web, Por WhatsApp, Por mensaje directo (DM), En el local, Por llamada |
| `contacto` | (solo si respondió `canal`) La web, el número o la dirección | Texto que dé el usuario. Si no lo da, queda vacío: la app no inventa uno. |
| `cierre` | ¿Cómo termina el video? | Producto terminado y logo, Solo el logo, Persona hablando a cámara, Que decida la app |
| `voz` | ¿Qué voz lleva? | Hombre de voz grave, Hombre cercano, Hombre enérgico, Mujer cálida, Mujer elegante, Sin voz, solo música |
| `prohibido` | ¿Qué no puede salir? (varias, separadas por comas) | Personas del equipo, Clientes del local, Niños, Precios, Nada en especial |

Qué hace la app con ellas (`aplicar_brief`):

- **Cierre**: manda la frase de `cta`; si no hay, la de `canal` + `contacto` (ej.: «Pide directo en ejemplo.com»); si no, la del objetivo.
- **`cierre` = Producto terminado**: en un montaje, la última toma pasa a ser la última toma de comida o producto del material. Con «logo», el logo de la marca va sobre la frase final (si la marca tiene logo).
- **`voz`**: la voz en off generada sin elegir otra usa esa voz (voz IA local). En la app se puede oír una muestra de 5 s de cada una.
- **`prohibido`**: en un montaje se dejan fuera las tomas reconocidas como personas. La app no distingue niños: avisa para revisar. «Precios» hace que avise si un texto o la voz dicen un precio.
- **Avisos al final** («Revisa: …»): precios que no están en `producto`, un canal distinto al de `canal` (WhatsApp cuando es la web) o voz en off cuando se pidió sin voz. Díselos al usuario antes de entregar.

Todas las preguntas se responden eligiendo: ofrece siempre estas opciones y deja la respuesta escrita solo como alternativa. Guarda el texto de la opción tal cual.

## Cómo preguntar

- Si tienes la herramienta `AskUserQuestion`, úsala con opciones (máximo 4 preguntas por llamada). Si no, haz una sola pregunta con todo en una lista numerada para responder en un mensaje.
- Si el usuario dijo "rápido" o "tú decide", usa estos valores y dilo en una línea:
  - formato: Reel 9:16
  - ritmo: rápido
  - duración: 20–30 s
  - el resto, sacado del contenido del video
- Si el cliente tiene presets guardados (`listar_presets`), ofrécelos en la pregunta de ritmo.

Guarda las respuestas con `guardar_brief`, usando las claves de la tabla, cuando el proyecto ya exista.
