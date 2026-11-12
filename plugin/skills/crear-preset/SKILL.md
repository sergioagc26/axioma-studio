---
name: crear-preset
description: Crea o ajusta un preset de edición (ritmo de cortes y estilo de subtítulos) o el kit de marca de un cliente, a partir de comentarios ("más rápido, letras amarillas") o de un video de referencia. Úsala cuando el usuario pida "guarda este estilo", "crea un preset", "que siempre quede así", "quiero que se vea como este video", pase un video de referencia o hable de los colores y fuentes de un cliente.
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

## Desde un video de referencia

1. Llama `analizar_referencia` con la ruta del video. Detecta solo: ritmo de cortes, tempo, paleta, subtítulos (posición, color, resaltado, palabras a la vez), aspecto de la imagen y destellos en los cortes.
2. Llama `guardar_referencia` con el id: guarda todo ese estilo como plantilla y lo aplica al proyecto. No hay que describir nada a mano.
3. Resume al usuario en 3–4 líneas qué se detectó y ofrece renderizar.
4. Solo si el usuario dice que algo no coincide (la tipografía y las mayúsculas no se leen de la imagen), mira 2 o 3 fotogramas y corrige con `ajustar_subtitulos` y `guardar_preset`.

Nunca copies textos, clips ni música de la referencia. El mismo análisis sirve para los reels propios del usuario que mejor funcionaron.

## Kit de marca

Si el usuario da los colores o la fuente de un cliente, guárdalos con `guardar_kit`. El kit manda sobre los presets: su color primario es el resaltado de los subtítulos y su fuente de títulos es la de los subtítulos, en proyectos nuevos y cada vez que se aplica un preset. Consulta el kit con `leer_kit` antes de proponer colores.
