---
name: brief
description: Hace las 5–7 preguntas del brief antes de editar un reel (formato, objetivo, público, ritmo, tono, material, llamado a la acción). Úsala al empezar un reel nuevo o cuando el usuario pida "hazme preguntas" o "empecemos el brief".
---

# Brief del reel

Objetivo: saber lo justo para editar bien. Son como máximo 7 preguntas y casi siempre menos.

## Preguntas (en este orden, saltando lo que ya sepas)

| Clave | Pregunta | Opciones típicas |
| --- | --- | --- |
| `formato` | ¿Reel o historia? | Reel 9:16 (por defecto), Historia |
| `objetivo` | ¿Qué quieres que haga quien lo vea? | Escribir por DM, comentar, guardar, ir al link, seguirte |
| `publico` | ¿Para quién es? | Texto libre corto |
| `ritmo` | ¿Qué ritmo? | Rápido → `rapido`, Con ritmo → `con-ritmo`, Sobrio → `sobrio` |
| `tono` | ¿Qué tono? | Directo, cercano, educativo, inspirador, divertido |
| `duracion` | ¿Duración objetivo? | 15–20 s, 20–30 s, 30–60 s, lo que dure |
| `cta` | ¿Con qué frase cierras? | La que dijo en el video, o una que te dé |

## Cómo preguntar

- Si tienes la herramienta `AskUserQuestion`, úsala con opciones (máximo 4 preguntas por llamada). Si no, haz una sola pregunta con todo en una lista numerada para responder en un mensaje.
- Si el usuario dijo "rápido" o "tú decide", usa estos valores y dilo en una línea:
  - formato: Reel 9:16
  - ritmo: rápido
  - duración: 20–30 s
  - el resto, sacado del contenido del video
- Si el cliente tiene presets guardados (`listar_presets`), ofrécelos en la pregunta de ritmo.

Guarda las respuestas con `guardar_brief`, usando las claves de la tabla, cuando el proyecto ya exista.
