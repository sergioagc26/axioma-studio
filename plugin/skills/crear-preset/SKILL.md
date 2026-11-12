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

1. Llama `analizar_referencia` con la ruta del video. Devuelve el ritmo de cortes, el tempo, la paleta, los valores sugeridos y 8 fotogramas.
2. Mira 3 o 4 fotogramas con tu herramienta de lectura de imágenes y anota **solo el estilo** de los subtítulos:
   - posición (arriba, centro, tercio inferior → `posicion_y`);
   - mayúsculas o no;
   - cuántas palabras por línea;
   - si resalta una palabra y con qué color;
   - la fuente más parecida de la lista disponible.
3. Resume el reporte al usuario en 4–5 líneas y pregunta qué quiere tomar: ritmo, color, tipografía o todo.
4. Guarda con `guardar_preset`, usando los valores sugeridos más lo que viste, y pasa `referencia` y `paleta`.
5. Ofrece aplicarlo al proyecto (`aplicar_preset`) y renderizar.

Nunca copies textos, clips ni música de la referencia. Si la fuente exacta no está en la lista, dilo y usa la más parecida.

El mismo análisis sirve para los reels propios del usuario que mejor funcionaron.

## Kit de marca

Si el usuario da los colores o la fuente de un cliente, guárdalos con `guardar_kit`. El kit manda sobre los presets: su color primario es el resaltado de los subtítulos y su fuente de títulos es la de los subtítulos, en proyectos nuevos y cada vez que se aplica un preset. Consulta el kit con `leer_kit` antes de proponer colores.
