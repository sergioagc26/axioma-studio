---
name: variantes
description: Propone 2–4 versiones distintas de una escena de un reel (texto con color, texto sobrio, b-roll, motion graphics) y aplica la que el usuario elija. Úsala cuando el usuario diga "dame opciones para esta escena", "no me convence la escena X", "otra versión" o "variantes".
---

# Variantes de una escena

Para motion graphics, llama primero `sugerir_motion`: arma solos los que salen de lo que se dice (pregunta, porcentaje, número, antes y después, pasos, listas, palabras en movimiento, cita) y se aplican con su id. Solo si ninguno sirve, arma uno a mano con `poner_motion`.

La app ya da cuatro variantes automáticas por clip (motion graphics, b-roll, color y tipografía) con `sugerir_variantes`. Usa esta skill cuando el usuario quiere algo que esas no cubren. Marca cada variante con su tipo y procura cubrir tipos distintos.

1. Llama `leer_proyecto` para ver la escena y `leer_transcripcion` si necesitas lo que se dice en ella.
2. Propón de 2 a 4 variantes. Cada una es una **idea completa** que tenga sentido para lo que se dice en la escena, no un ajuste suelto. "Otra transición" o "ponerle un texto" no son variantes. Una idea combina:
   - **Texto** (≤ 6 palabras, de lo que dijo la persona) y su **palabra clave** (`palabra_clave`): la que carga el significado.
   - **Forma del texto** (`estilo_texto`):
     - `gigante`: la clave enorme, el resto pequeño. Para ganchos y cifras.
     - `marcador`: trazo de marcador detrás de la clave. Para remarcar un beneficio.
     - `resaltado`: la clave en color y más grande. Uso general.
     - `subrayado`: sobrio y elegante.
     - `neon`: tono nocturno o tecnológico.
     - `banda`: franja de titular. Para b-roll o anuncios.
     - `caja`: recuadro de color. El más simple.
   - **Imagen** (`imagen`): `bn` para lo serio o el problema, `calido` para lo cercano o comida, `frio` para producto y tecnología, `contraste` para energía.
   - **Cámara** (`camara`): `acercar` cuando la persona dice algo importante o personal; `alejar` para cerrar una idea.
   - **Tipo** (`visual`): `original`, `texto` (tarjeta a pantalla completa), `broll` (con una búsqueda concreta) o `motion` (barras, contador, lista, logo; solo con datos que dio el usuario).

   Escribe en `notas` una frase que diga **por qué** esa idea le va a la escena. Ejemplos de ideas distintas para "pierdes horas cada semana":
   - *Golpe en blanco y negro*: `bn`, texto "Pierdes horas", clave "horas", estilo `gigante`, zoom.
   - *Cercano*: sin texto, `acercar`, deja que lo diga mirando a cámara.
   - *Dato*: `motion` contador con las horas reales del usuario (si las dio; si no, `[DATO]`).
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
