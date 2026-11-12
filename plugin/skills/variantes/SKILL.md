---
name: variantes
description: Propone 2–4 versiones distintas de una escena de un reel (texto con color, texto sobrio, b-roll, motion graphics) y aplica la que el usuario elija. Úsala cuando el usuario diga "dame opciones para esta escena", "no me convence la escena X", "otra versión" o "variantes".
---

# Variantes de una escena

1. Llama `leer_proyecto` para ver la escena y `leer_transcripcion` si necesitas lo que se dice en ella.
2. Propón de 2 a 4 variantes **realmente distintas**, del mismo mensaje y sin cambiar lo que dice la persona:
   - **Texto con color**: frase corta (≤ 6 palabras) con la palabra clave grande y color de acento (`#FE2C55` por defecto, o el del kit del cliente).
   - **Texto sobrio**: sin texto en pantalla o con una frase discreta; deja hablar a la persona.
   - **B-roll**: `visual: "broll"` con una búsqueda concreta en `broll` (p. ej. "persona editando video en laptop, vertical").
   - **Motion graphics**: `visual: "motion"` con la plantilla en `motion` (barras, contador, lista, logo). Solo con datos que el usuario dio; si faltan, usa `[DATO]` y dilo.
3. Guárdalas con `generar_variantes` y muéstralas como lista: letra, etiqueta, texto en pantalla y qué cambia.
4. Cuando el usuario elija, aplícala con `elegir_variante`. Con "como estaba" usa la variante `original`.
5. Si pide "otras", genera un set nuevo sin repetir las anteriores.

Si el usuario pide "variar solo el texto" (o solo el color, o solo la toma), todas las variantes cambian solo eso.

B-roll y motion graphics se renderizan desde la fase 5. Hasta entonces, avisa que esas variantes quedan guardadas pero en el render se ve la toma original con el texto.
