---
name: variantes
description: Propone 2–4 versiones distintas de una escena de un reel (texto con color, texto sobrio, b-roll, motion graphics) y aplica la que el usuario elija. Úsala cuando el usuario diga "dame opciones para esta escena", "no me convence la escena X", "otra versión" o "variantes".
---

# Variantes de una escena

1. Llama `leer_proyecto` para ver la escena y `leer_transcripcion` si necesitas lo que se dice en ella.
2. Propón de 2 a 4 variantes **realmente distintas**, del mismo mensaje y sin cambiar lo que dice la persona:
   - **Texto con color**: `visual: "original"` con una frase corta (≤ 6 palabras) y color de acento (el del kit del cliente, o `#FE2C55`).
   - **Texto sobrio**: `visual: "original"` sin texto en pantalla; deja hablar a la persona.
   - **Tarjeta de texto**: `visual: "texto"`. La frase ocupa toda la pantalla sobre el color de marca mientras sigue la voz.
   - **B-roll**: `visual: "broll"` con una búsqueda concreta en `broll` (p. ej. "person editing video on laptop").
   - **Motion graphics**: `visual: "motion"` con la plantilla en `motion` (barras, contador, lista, logo). Solo con datos que el usuario dio; si faltan, se muestra `[DATO]` y hay que decirlo.
3. Guárdalas con `generar_variantes` y muéstralas como lista: letra, etiqueta, texto en pantalla y qué cambia.
4. Cuando el usuario elija, aplícala con `elegir_variante`. Con "como estaba" usa la variante `original`.
5. Si pide "otras", genera un set nuevo sin repetir las anteriores.

Si el usuario pide "variar solo el texto" (o solo el color, o solo la toma), todas las variantes cambian solo eso.

## Después de elegir

- **B-roll**: la variante solo guarda la búsqueda. Para que se vea en el render:
  - con clave de Pexels: `buscar_broll`, muestra 3 opciones con su enlace y pon la elegida con `usar_broll`;
  - sin clave: pide un archivo local y su licencia, y usa `usar_broll` con `archivo`.

  Mientras no haya archivo, en el render se ve la toma original.
- **Motion graphics**: pon los datos con `poner_motion`. Pide al usuario las cifras o los puntos de la lista; no los inventes.
