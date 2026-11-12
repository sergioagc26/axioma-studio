---
name: brief
description: Hace las 5–7 preguntas del brief antes de editar un reel (formato, objetivo, público, ritmo, tono, material, llamado a la acción). Úsala al empezar un reel nuevo o cuando el usuario pida "hazme preguntas" o "empecemos el brief".
---

# Brief del reel

Objetivo: saber lo justo para editar bien. Son como máximo 7 preguntas y casi siempre menos.

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
