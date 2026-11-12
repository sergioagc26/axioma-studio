# Tu primer reel

Guía sin tecnicismos. Tiempo: unos 15 minutos la primera vez (por la instalación) y unos 10 las siguientes.

## 1. Instalar (solo una vez)

Necesitas:
- Mac (macOS 13 o más) o Windows 10/11, con 8 GB de RAM y 10 GB libres.
- La app de Claude con un plan de pago (Pro o superior).
- Node.js 20 o más (nodejs.org).

Abre una terminal en la carpeta del programa y corre:

```bash
npm run setup
```

Al final verás una lista con ✓. Si algo sale con ✗, la misma línea dice cómo arreglarlo.

## 2. Abrir Claude en la carpeta

Abre la app de Claude, entra a la pestaña **Code** y elige la carpeta del programa. La primera vez te pedirá aceptar el plugin `snz-studio`: acéptalo.

## 3. Pedir el reel

Escribe, cambiando la ruta por la de tu video (en Mac puedes arrastrar el archivo a la ventana):

> edita este video para CRE: /Users/tu-usuario/Videos/mi-video.mp4

Claude te hará unas preguntas cortas (objetivo, ritmo, duración). Luego:

1. Transcribe el video y limpia el audio (1–5 minutos).
2. Quita silencios, muletillas y tomas repetidas.
3. Te muestra el storyboard: las escenas, su orden y los textos.

## 4. Revisar en el studio

Dile a Claude: **«ábrelo en el studio»**. Se abre una página con cinco pestañas:

- **Brief**: tus respuestas.
- **Storyboard**: arrastra las tarjetas para cambiar el orden.
- **Editor**: mira el reel, cambia textos, colores y subtítulos.
- **Variantes**: elige entre las versiones que propone Claude para una escena.
- **Referencias**: sube un video que te guste y guarda su estilo como plantilla.

Lo que cambies allí se guarda solo. Lo que cambie Claude aparece en la página sin recargar.

## 5. Pedir cambios hablando

Ejemplos de lo que puedes escribirle a Claude:

- «quita la escena 3»
- «dame opciones para la escena 2»
- «más rápido» o «usa el preset sobrio»
- «ponle esta música: /ruta/cancion.mp3, la licencia es de Artlist»
- «ponle b-roll a la escena 2»
- «quiero que se vea como este video: /ruta/referencia.mp4»
- «guarda este estilo como "CRE rápido"»
- «vuelve a como estaba antes»

## 6. Exportar

Dile **«renderiza»**, o pulsa **Exportar MP4** en el studio. Puedes elegir 9:16, 4:5 o 1:1. El archivo queda en la carpeta `renders` del proyecto y Claude te da la ruta.

Cuando esté listo para publicar, dile **«aprobado»**. La app nunca publica nada por ti.

## Sin Claude

También funciona desde la terminal:

```bash
npm run se -- edit /ruta/video.mp4 -c CRE
```

```bash
npm run studio
```

```bash
npm run se -- lote /ruta/carpeta-con-videos -c CRE
```

## Si algo falla

```bash
npm run se -- doctor
```

Te dice qué falta y cómo arreglarlo.
