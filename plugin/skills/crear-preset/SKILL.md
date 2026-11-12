---
name: crear-preset
description: Crea o ajusta un preset de edición (ritmo de cortes y estilo de subtítulos) para un cliente a partir de comentarios como "más rápido, letras amarillas, sin mayúsculas". Úsala cuando el usuario pida "guarda este estilo", "crea un preset", "que siempre quede así" o describa cómo quiere que se vean sus reels.
---

# Crear un preset

Un preset guarda dos cosas:

- **Ritmo:**
  - `pausa_maxima`: silencio máximo que se deja, en segundos. 0,2 es muy rápido; 0,6 es natural.
  - `zoom_cada`: un zoom de golpe cada N segundos. 0 significa ninguno.
- **Subtítulos:**
  - `modo`: `word`, palabra a palabra con resaltado, o `phrase`, frase completa.
  - `palabras_por_linea`.
  - `fuente`: Montserrat, Inter o Space Grotesk.
  - `color` y `color_resaltado`.
  - `mayusculas`.

## Pasos

1. Traduce lo que dijo el usuario a esos valores. Ejemplos:
   - "más rápido" → `pausa_maxima` 0,2 y `zoom_cada` 4;
   - "letras amarillas" → `color_resaltado` `#FACC15`;
   - "sin mayúsculas" → `mayusculas: false`.
2. Si hay un proyecto abierto, prueba primero con `ajustar_subtitulos` o `aplicar_preset` y ofrece renderizar para verlo.
3. Cuando le guste, guárdalo con `guardar_preset`:
   - un nombre corto;
   - `base`: el preset más parecido;
   - solo los valores que cambian.

   Se guarda en la carpeta del cliente del proyecto.
4. Confirma con el id del preset y cómo usarlo ("la próxima vez di: usa el preset cre-amarillo").

Crear presets desde un video de referencia llega en la fase 4 (`analizar_referencia`). Mientras tanto, pide al usuario que describa el estilo de la referencia y créalo con estos pasos.
