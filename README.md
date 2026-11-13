# Axioma Studio

Editor de reels 9:16 con IA para videos hablando a cámara. Claude (tu suscripción) dirige la edición; el trabajo pesado corre en tu computador con herramientas gratuitas (FFmpeg, whisper.cpp, Remotion).

## Instalación (doble clic)

- **Mac**: doble clic en **«Instalar Axioma Studio.command»**. Instala lo que falte (herramientas de Apple, Homebrew, Node, FFmpeg, cmake, whisper y, si quieres, la IA local), compila la app y deja un ícono **«Axioma Studio»** en el Escritorio. La primera vez tarda entre 5 y 20 minutos; Homebrew pide la contraseña del Mac. Si macOS dice que no puede abrirlo por ser de un desarrollador no identificado: clic derecho → Abrir.
- **Windows 10/11**: doble clic en **«Instalar Axioma Studio.bat»**. Usa winget para Node y FFmpeg y deja un acceso directo en el Escritorio.

Se puede volver a abrir el instalador cuando quieras: salta lo que ya está y repara lo que falte. El registro queda en `workspace/instalacion.log`. Para abrir la app después: el ícono del Escritorio (si ya estaba abierta, solo abre el navegador).

Guía corta para empezar: [docs/primer-reel.md](docs/primer-reel.md).

Instalación a mano (terminal): `npm run setup`.

## Uso

```bash
npm run se -- doctor                      # revisa que todo esté instalado
npm run se -- edit video.mp4 -c CRE       # flujo completo → renders/*.mp4
npm run se -- edit video.mp4 -p sobrio    # otro preset: rapido, con-ritmo, sobrio
npm run se -- cut <carpeta> -p con-ritmo  # volver a cortar con otro preset
npm run se -- render <carpeta>            # volver a renderizar
npm run se -- check archivo.mp4           # tamaño, fps, duración y LUFS
```

Cada proyecto vive en `workspace/clientes/<cliente>/proyectos/<fecha-nombre>/`.

| Archivo | Qué es |
| --- | --- |
| `project.json` | Fuente de verdad: escenas, estilo de subtítulos, pacing |
| `transcript.json` | Palabras con tiempos (DTW + ajuste a silencios) |
| `analysis.json` | Silencios detectados |
| `media/master.mp4` | Master a fps constante (lo que usa el render) |
| `media/voz.wav` | Voz limpia y nivelada a -16 LUFS |
| `proxies/proxy.mp4` | Vista previa liviana para el studio |
| `renders/` | Exportaciones |

## Usarlo desde Claude (Fase 2)

`npm run setup` ya conecta el plugin. Para repetirlo a mano:

```bash
npm run se -- instalar-claude
```

Luego abre Claude Code (o el Code tab de la app de Claude) en esta carpeta, acepta el plugin `axioma-studio` y escribe, por ejemplo:

> edita este video para CRE: /ruta/al/video.mp4

Claude hace el brief, crea el proyecto, arma el storyboard con las frases del video y renderiza.

- **Skills** (`plugin/skills/`): `editar-reel`, `montaje`, `brief`, `variantes`, `crear-preset`, `reglas-edicion`.
- **Servidor MCP** (`packages/mcp`): 57 herramientas. Las principales son `crear_proyecto`, `leer_transcripcion`, `armar_storyboard`, `editar_escena`, `generar_variantes`, `elegir_variante`, `aplicar_preset`, `guardar_preset` y `renderizar`.
- Claude nunca recibe el video. Trabaja con frases numeradas (`f01`, `f02`…) que ya vienen marcadas como muletilla o toma descartada.
- `plugin/.mcp.json` se genera con rutas absolutas de este computador (la app de escritorio no hereda el PATH de la terminal), por eso no está en git.

## Studio (Fase 3)

```bash
npm run studio
```

Abre la interfaz en `http://127.0.0.1:4747`. Desde Claude se abre con la herramienta `abrir_studio`.

- **Proyectos**: arrastra un video para crear un reel nuevo.
- **Brief**: las 7 preguntas. El ritmo cambia el preset.
- **Storyboard**: tarjetas arrastrables; la línea de tiempo se actualiza sola.
- **Editor**: vista previa real (Remotion Player), presets, subtítulos, inspector de escena, línea de tiempo y zonas seguras.
- **Variantes**: elegir entre las versiones que propone Claude y dejarle peticiones.
- Tema oscuro y claro, deshacer y rehacer (⌘Z / ⇧⌘Z), espacio para reproducir y flechas para cambiar de escena.
- Lo que cambia Claude aparece en vivo (Server-Sent Events) y lo que cambias tú se guarda validado en `project.json`. Si los dos editan a la vez, gana el último guardado.
- Solo escucha en `127.0.0.1` y rechaza escrituras desde otras páginas.

## Estilos, kits y referencias (Fase 4)

- **Presets base**: Rápido, Con ritmo, Sobrio, Testimonio, Antes/después y Oferta con CTA. Cada cliente puede guardar los suyos en `workspace/clientes/<cliente>/presets/`.
- **Kit de marca** (`kit.json` del cliente): colores, fuentes y logo. Su color primario y su fuente mandan sobre cualquier preset.
- **Fuentes de subtítulos** (Google Fonts): Montserrat, Inter, Space Grotesk, Poppins, Anton, Bebas Neue, Oswald, Archivo Black y DM Sans.
- **Plantilla desde referencia**: en la pantalla Referencias del studio («Guardar estilo y aplicarlo»), o con `analizar_referencia` y `guardar_referencia`. Todo se detecta solo, sin describir nada:
  - subtítulos: posición, color de letras, color de resaltado, si va en caja y cuántas palabras a la vez (son la franja con más bordes nítidos que cambia varias veces por segundo);
  - aspecto de la imagen (blanco y negro, cálido, frío, contraste) y destellos en los cortes;
  - al guardar, el preset lleva también el estilo de los textos, las transiciones y los efectos de sonido.

  La tipografía y las mayúsculas no se leen de la imagen: se eligen según el ritmo y se pueden ajustar. Además saca:
  - el ritmo de cortes (FFmpeg `scene`);
  - el tempo aproximado (autocorrelación de los ataques del audio, 60–180 BPM);
  - la paleta dominante;
  - 8 fotogramas, para que Claude describa los subtítulos y elija la fuente más parecida.

  Solo se guarda el estilo: el video de referencia no se conserva.

## Recursos y extras (Fase 5)

- **Música**: `poner_musica` con un archivo local y su licencia. Baja sola bajo la voz y la mezcla final se nivela a -16 LUFS.
- **B-roll**: una escena puede mostrar otro video mientras sigue la voz.
  - Con clave de Pexels en `.env` (`PEXELS_API_KEY=…`): `buscar_broll` y `usar_broll`.
  - Sin clave: `usar_broll` con un archivo local y su licencia.
- **Motion graphics** (`poner_motion`): barras, contador, lista, logo y tarjeta de texto. Los datos los pones tú; lo que falte se ve como `[DATO]`.
- **Formatos**: 9:16, 4:5 y 1:1, desde `renderizar`, el studio o `se render -f 4:5`.
- **Versiones**: guardar, listar, comparar y restaurar. Estados `borrador → en_revision → aprobado`.
- **Lote**: `npm run se -- lote <carpeta>` edita todos los videos de una carpeta.
- Cada recurso externo queda registrado con su licencia en `project.json` (`assets`).

## Abrir la app desde el portátil

La app corre en este computador (el Mac mini) y el portátil solo necesita un navegador; los cortes, el render y la IA se hacen aquí.

1. En el Mac mini, haz doble clic en **«Abrir Axioma Studio.command»** (o corre `npm run studio:red`).
2. La ventana muestra un enlace como `http://192.168.x.x:4747/?clave=…`. Ábrelo en el navegador del portátil, conectado a la misma red Wi-Fi.
3. La primera vez el Mac puede preguntar si permites conexiones entrantes para «node»: pulsa Permitir.

La clave queda guardada en ese navegador por 30 días; sin ella nadie más de la red puede entrar. Está en `workspace/clave-red.txt`; bórrala y reinicia la app para cambiarla. El Mac mini tiene que estar encendido y con la app abierta. Fuera de casa no funciona tal cual: para eso hace falta una red privada como Tailscale.

## IA local (gratis, sin internet)

Si Claude no está conectado, la app usa un modelo de lenguaje que corre en tu computador con [Ollama](https://ollama.com):

```bash
brew install ollama
brew services start ollama
ollama pull qwen3:8b
```

Ocupa unos 5 GB y la app lo detecta sola (arriba aparece «IA local lista»). Con él:

- Los botones de «Pedir a Claude» editan por chat: el modelo propone cambios de una lista cerrada (textos, cámara, color, subtítulos, acabados, escenas…) y la app los valida antes de aplicarlos. Antes guarda una versión.
- «Editar todo con IA» escribe el gancho de la pantalla a partir de lo que dices.
- En la ventana de exportar, «Redactar con IA local» escribe título, descripción y hashtags.

Otro modelo: define `AXIOMA_LLM` (por ejemplo `AXIOMA_LLM=qwen2.5:7b`).

## Modo automático

La app edita sola, sin preguntas. Hay tres formas de usarlo:

- **Al subir un video** en la pantalla de proyectos, con la casilla «Automático» marcada: llega al editor ya editado.
- **Botón «Editar todo con IA»** en el editor, sobre un proyecto que ya existe.
- **Carpeta vigilada**, sin abrir la app:

```bash
npm run se -- auto "/ruta/a/mis-videos" --vigilar --client "Mi marca"
```

Cada video que dejes en esa carpeta se corta, se viste y se exporta a `editados/` (o a la carpeta de `--salida`). Sin `--vigilar` edita los que haya y termina. Los videos sin voz se arman como montaje.

Para decidir el estilo usa, en este orden: la referencia guardada del cliente, lo que funciona en el nicho de su marca (guía incluida en la app, no consulta internet) y lo que se ve y se oye en el video.

## Quitar o cambiar el fondo

En el editor, «Recortar a la persona (sin pantalla verde)» procesa el video una sola vez (tarda unos minutos, todo en este computador). Después cada escena puede llevar detrás un color, un degradado, el propio video desenfocado, una imagen o un video subido, o un fondo creado desde una idea.

## Color con LUT

En «Acabados del reel», «LUT de color» trae seis looks incluidos (Teal & Orange, Película cálida, Moderno apagado, Noche azul, Vivo para redes y Blanco y negro de cine) y acepta tu propio archivo `.cube` (el formato de Resolve, Premiere y Final Cut). Se aplica solo al video, con la fuerza que elijas; textos, subtítulos y gráficos conservan los colores de la marca. Tarda unos segundos porque se graba una copia corregida del video (`media/master-lut.mp4`).

**Igualar a una imagen**: en el mismo lugar, sube una foto, un fotograma o un video con el color que te gusta. La app mide los colores del reel y los de la imagen (en espacio Lab: luz, verde-rojo y azul-amarillo) y crea un LUT a la medida que lleva el reel hacia ese color, con límites para que la piel no se rompa con una referencia extrema. Queda como cualquier LUT, con su fuerza ajustable. Claude puede hacerlo con `igualar_color_referencia`.

## Adelanto: la mejor frase en el primer segundo

«Poner la frase más fuerte en el primer segundo» busca, entre lo que quedó en el corte, la frase corta que más atrapa (pregunta, cifra, palabras fuertes) y la pone al inicio con un zoom y un golpe de sonido; luego empieza el reel normal. Se puede cambiar o quitar.

## Búsqueda en tu material

En Variantes, «Busca en tu material» encuentra momentos en todos los reels del mismo cliente (sus videos y b-rolls) a partir de una descripción: lo que **se ve** («hombres entrenando en la calle», «manos en el portátil») con el modelo de visión local, y lo que **se dice**, en las transcripciones. Al elegir un resultado se corta ese tramo del video original (unos 3,5 s, sin audio) y entra como b-roll de la escena, con su origen anotado. La primera vez revisa todo el material (un fotograma por segundo) y guarda el índice en `indice-visual.json` de cada proyecto; después solo revisa lo nuevo. Si la IA local (Ollama) está abierta, la búsqueda se traduce al inglés porque el modelo de visión la entiende mejor. Claude tiene lo mismo con `buscar_material` y `usar_material`.

## Emojis, subtítulos en otro idioma y variantes de gancho

- **Emojis automáticos** (grupo Subtítulos): cuando suena una palabra con un emoji claro (dinero 💰, idea 💡, gimnasio 💪, error ❌…) aparece encima de la línea con un salto. Diccionario en español de unas 70 raíces; como mucho uno cada 1,6 s y sin repetir el mismo seguido.
- **Idioma de los subtítulos** (grupo Subtítulos): inglés, portugués, francés, italiano o alemán, traducidos frase por frase con la IA local; la voz no cambia. Las palabras quedan en el tiempo del video original, así siguen bien aunque cambies los cortes. Para cambiar también la voz está el doblaje.
- **Variantes de gancho** (ventana de exportar): exporta tres versiones para probar cuál retiene más: A tal cual, B con tu frase más fuerte en el primer segundo (o sin ella, si ya la tenía) y C con otro texto de gancho que redacta la IA local. Los archivos llevan `-gancho-A/B/C` y el proyecto no cambia.

Claude: `ajustar_subtitulos` (emojis), `idioma_subtitulos`.

## Editar por texto y revisión del cliente

- **Editar por texto** (pestaña Texto, como Descript): todo lo que se dice, palabra por palabra. Selecciona (clic, arrastrar o Mayús+clic) y «Quitar del video» (⌫) o «Recuperar» (R); espacio escucha la selección. Las tachadas no están en el reel. Quitar una frase del medio parte la escena en dos; recuperar la devuelve a su escena. Se deshace con ⌘Z.
- **Revisión del cliente** (Editor → «Revisión del cliente», como Frame.io): un enlace `http://<tu-ip>:4747/r/<clave>` que solo da acceso a ese reel. El cliente ve el último video exportado (si no hay, un aviso: nunca el video original sin editar), comenta en el segundo exacto y lo aprueba. Los comentarios aparecen en el editor (clic en el minuto para ir ahí) con «Hecho» y «Descartar», y Claude los lee con `leer_peticiones`. Funciona en la misma Wi-Fi con la app abierta desde el ícono (modo red); el resto de la app sigue pidiendo su clave. «Cambiar el enlace» invalida el anterior. Claude: `enlace_revision`.

## Portada, marca de agua, formatos y proyectos

- **Portada del reel** (Imágenes): elige el mejor fotograma de las primeras escenas (nítido, con la cara cerca del centro y buena luz) y le pone el gancho grande, en 9:16, para elegirla como portada al publicar. Todas las imágenes (carrusel, post, historia) usan ahora el mejor fotograma de su escena, no el del medio.
- **Marca de agua** (Acabados): el logo de la marca fijo en una esquina, con tamaño y opacidad; sin logo, el nombre de la marca. El logo se sube ahí mismo y queda en la marca del cliente (`clientes/<cliente>/marca/`), así sirve para todos sus reels.
- **Los 3 formatos de una vez** (Exportar): 9:16, 4:5 y 1:1 seguidos.
- **Duplicar y mover a la papelera** (Proyectos, botón «⋯» de cada tarjeta). La papelera es `workspace/papelera`: el proyecto no se borra; para recuperarlo, se mueve su carpeta de vuelta.
- **Capítulos** en el texto para publicar de videos de 90 s o más («0:00 …», como pide YouTube), donde cambia la idea o cada ~45 s.

Claude: `crear_imagenes` (portada), `marca_de_agua`, `logo_marca`.

## Calidad en videos de baja resolución

Los videos de menos de 1000 px por el lado corto (WhatsApp, capturas, celulares viejos) se preparan quitando los bloques de la compresión antes de agrandarlos a 1080 y con escalado lanczos. Medido contra un original nítido, se parece más que el escalado anterior (SSIM 0,959 frente a 0,951). En «Herramientas de un clic → Calidad del video» se elige «Fiel al original» o «Más nítido» (suma nitidez adaptativa); tarda segundos y no cambia cortes ni textos. Claude: `calidad_video`.

Se probó también un modelo de IA de superresolución (Swin2SR) y no mejoró este tipo de video (0,930) y tardaría horas por minuto; Real-ESRGAN necesitaría una GPU dedicada.

## Cámara lenta suave

En el inspector de la escena, «Cámara lenta»: a la mitad, a un tercio o a un cuarto. En vez de repetir fotogramas (que se ve a saltos), se crean los intermedios siguiendo el movimiento de cada zona de la imagen (interpolación por compensación de movimiento de FFmpeg), en este computador. Tarda unos 20 s por cada segundo de video en 4K; los tramos quedan en `media/lento/` y se reutilizan. La voz de esa escena no suena ni lleva subtítulos (va bien en montajes con música). Mientras se prepara, la vista previa la muestra más lenta sin suavizar. Claude puede hacerlo con `camara_lenta`.

## Órbita y cambio de foco

Dos movimientos de cámara nuevos (en el inspector de la escena, «Cámara»). En fotos con mapa de profundidad, la **órbita** gira alrededor del sujeto con el fondo desenfocado detrás, y el **cambio de foco** empieza con el fondo nítido y pasa el foco a lo cercano (la persona u objeto), como un rack focus de cine. En video normal, la órbita es un arco lento y el cambio de foco es la imagen que se enfoca al empezar la escena. Claude los usa con `editar_escena` (`camara: orbita` o `foco`).

## Doblaje a otro idioma

En Audio, «Doblaje a otro idioma» crea una **copia** del reel en inglés, portugués, francés, italiano o alemán; el original no cambia. La IA local (Ollama) traduce frase por frase lo que quedó en el corte, se genera la voz de cada frase (la del computador, o ElevenLabs si hay clave) a tu ritmo de habla y, si una frase no cabe en su espacio, se acelera hasta un 35 % o empuja un poco a la siguiente. La voz original se apaga; la música y los efectos siguen. Los subtítulos y los textos en pantalla salen traducidos (no los textos que ya venían grabados en el video). Los labios no se sincronizan. Tarda alrededor de un minuto. Claude puede hacerlo con `doblar`.

## Montaje al ritmo de la música

En un montaje (videos sin voz), con música puesta, cada corte cae justo en un golpe de la canción. La app detecta el tempo, el primer golpe de cada compás y dónde sube la energía, en este computador. En Audio, «Cortar al ritmo» permite elegir: automático (cada compás en las partes suaves, cada 2 golpes en las medias y en cada golpe en las fuertes, con un destello en el golpe donde más sube la música), en cada golpe, cada 2 o cada compás. El final también cae en un golpe; con voz en off, en el primero después de que termina la voz. Subir una canción a un montaje lo vuelve a cortar solo, y el montaje automático ya usa los golpes cuando hay música. Si la canción no tiene un pulso claro, se corta parejo como antes. Claude puede hacerlo con `montaje_al_ritmo`.

## Reencuadre al hablante

En videos horizontales con dos o más personas (pódcast, entrevista), el editor muestra «Encuadre → Seguir a quien habla». La app detecta las caras, agrupa a cada persona por su lugar y mide cuánto se mueve su boca (menos el movimiento de los ojos, para no confundir un gesto con hablar) mientras hay voz. El recorte vertical pasa a quien habla con un corte limpio; el audio sigue sin interrupción. Para no marear, solo cambia si la otra persona lleva al menos 1 s hablando y ningún turno dura menos de 1,5 s. El análisis queda en `hablantes.json`. Claude puede hacerlo con `seguir_hablante`.

## Lo más reciente

- **La app ve el video.** Un modelo de visión local (CLIP, en `.modelos/`, ~160 MB la primera vez) mira seis fotogramas y reconoce de qué trata: gente entrenando, comida, alguien hablando, una pantalla, un producto, etc. Eso pesa en el estilo recomendado, propone el sector de la marca y ordena los aspectos de imagen de las variantes. El video no sale del computador.
- **Motion graphics editables** sin regenerarlos: plantilla, fondo (oscuro, claro, color de marca, degradado en movimiento o tu video desenfocado), dos colores, tipografía, tamaño y contenido.
- **Subtítulos**: altura, palabras a la vez, entrada de cada línea, grosor del borde, separación entre letras y placa oscura detrás.
- **Títulos**: giro y separación entre letras, además de estilo, tamaño, letra, entrada y posición.
- **Imagen**: 11 aspectos, brillo, contraste, color y viñeta. **Cámara**: 9 movimientos con fuerza ajustable. **Tamaño del video** dentro del cuadro.
- **26 tipografías** agrupadas y **11 entradas** de texto.
- **Acabados del reel**: barra de progreso, grano de película y bordes oscuros.
- **Exportación**: calidad máxima, alta o ligera, y carpeta donde guardar. El master de edición se crea con menos compresión.
- **Voz**: grabar con el micrófono desde la pantalla Audio; se limpia, se nivela y se subtitula.
- **Estilos**: todos cambian subtítulos, títulos, entradas, imagen, cámara y transiciones; «Guardar lo actual como mi estilo».
- **Variantes**: cinco por clip (gráficos, b-roll, color, tipografía y cámara).
- **Claude**: botón «Conectar Claude» que abre la terminal lista para `/login`.

Pendiente (no construido): quitar el fondo del video, creador de imágenes (carrusel, post, historia), b-roll generado a partir de una idea y estudio de tendencias por nicho. La lectura de referencias sigue siendo aproximada.

## La marca primero

Cada cliente tiene un **perfil de marca**, que se pregunta una sola vez (arriba del brief, o con `guardar_kit`): nombre, a qué se dedica, cómo habla y sus dos colores. El sector y la personalidad deciden el estilo completo, para que cada marca se vea distinta:

| Sector | Subtítulos | Títulos | Imagen |
| --- | --- | --- | --- |
| Gimnasio y deporte | Impacto, letra Anton | Sombra retro | Alto contraste, destellos |
| Comida rápida | Tiras de color, Poppins | Tiras de color | Cálida, todo salta |
| Restaurante y café | Elegante (cursiva) | Subrayado | Cálida, fundidos |
| Moda y belleza | Elegante | Palabras apiladas | Cámara lenta |
| Tecnología | Neón, Space Grotesk | Glitch | Fría |
| Educación | Bloque | Rodeado a mano | Normal |
| Salud | Clásico con subrayado | Etiqueta | Fría y limpia |
| Negocios | Impacto, Montserrat | Marcador | Normal |

También hay inmobiliaria, entretenimiento y servicios profesionales. La **personalidad** matiza: elegante quita destellos y pone cursiva; rebelde pone glitch y contraste; divertida hace que todo entre saltando; seria quita efectos de más.

La marca **aprende**: cada exportación anota el diseño de subtítulos y de títulos usado, y cuando uno se repite tres veces pasa a ser el de la marca.

## Motion graphics automáticos

En la pestaña Variantes, «Motion graphics para este clip» muestra todos los que se pueden armar solos con lo que se dice ahí, ya llenos y con su fotograma real. Sin Claude.

| Plantilla | Cuándo aparece | Con qué se llena |
| --- | --- | --- |
| Pregunta | Hay una pregunta | La pregunta dicha |
| Porcentaje | Se dice «80 %» o «80 por ciento» | La cifra, en un anillo que se llena |
| Número animado | Se dice una cifra | La cifra, contando hacia arriba |
| Antes y después | Hay contraste (antes/ahora, sin/con, no/sino) | Las dos frases |
| Pasos | Se dice primero, luego, después, paso | Las frases, numeradas |
| Lista con vistos, lista | Hay dos o más ideas | Las frases |
| Palabras en movimiento | Siempre que hay voz | Cada palabra, enorme, cuando se dice |
| Frase destacada | Siempre que hay voz | Una frase corta, como cita |
| Cierre con marca | En el llamado a la acción | Nombre o logo de la marca |
| Tarjeta de texto, barras | Siempre / con datos puestos a mano | El texto de la escena |

Nunca se inventa un dato. Al crear la edición desde el brief se colocan algunos en el medio del reel. Desde Claude: `sugerir_motion`.

## El brief manda

El brief es lo primero. Al terminar de responderlo, «Crear mi edición» (o `aplicar_brief`) arma el reel con las respuestas:

| Respuesta | Qué decide |
| --- | --- |
| Ritmo | El preset: cuánta pausa se deja, zooms y subtítulos; en un montaje, el largo de los cortes |
| Duración | El máximo: se quitan partes del medio (de atrás hacia adelante) y se recorta el final si hace falta |
| Tono | Estilo de textos, efecto de los subtítulos, imagen y cámara (directo, cercano, educativo, inspirador, divertido) |
| Llamado a la acción | El texto de la última escena, en banda de titular |
| Formato | En historias, los subtítulos suben para dejar libre la zona de respuesta |

Además pone el gancho en grande en la primera escena (con una frase que sí dijiste), las transiciones recomendadas y, con ritmo rápido, efectos de sonido. Antes guarda una versión. Después se cambia a mano lo que se quiera.

## Cortar, recortar, alargar y dividir clips

En la línea de tiempo del editor:

- **Arrastrar los bordes blancos** del clip seleccionado: hacia dentro lo recorta, hacia fuera lo alarga con el material que hay antes o después del corte.
- **✂ Dividir en el cursor**: parte en dos el clip donde está el cursor rojo.
- **Recuperar clip entero** y **Eliminar clip**.

El recorte no borra material (`trimStart` / `trimEnd`, positivos recortan y negativos alargan). Desde Claude: `recortar_escena`.

## Estilos profesionales y recomendación

Además de los seis presets de ritmo hay seis **estilos completos** (subtítulos, textos, imagen, transiciones y efectos): Negocio directo, Energía, Comida cálida, Tecnología neón, Clase clara y Elegante.

El editor **estudia lo que se dice** y recomienda uno, con el motivo («El video habla de tecnología o herramientas (3 menciones)»). Si no hay un tema claro, decide por el tipo de video y la velocidad al hablar. La búsqueda de tema es por palabras clave en la transcripción; no busca referencias en internet.

## Textos y subtítulos

**Texto en pantalla** de cada escena, en dos niveles:

- **Básicos**: recuadro de color, palabra clave en color, subrayado, banda de titular, etiqueta y contorno.
- **Llamativos**: marcador, palabra gigante, neón, degradado, sombra retro, tiras de color, sello, glitch, rodeado a mano y palabras apiladas.


- La **palabra clave** se remarca sola (un número si lo hay; si no, la palabra con significado más larga) o la eliges tú.
- **Tamaño** (50–200 %), **tipografía** propia del texto y **animación de entrada** (sube, salta, desliza, aparece, se revela).
- **Posición libre**: una rejilla de nueve posiciones y barras horizontal y vertical.
- **Color**: muestras rápidas, rueda para cualquier color y código hexadecimal.

**Subtítulos**, también en dos niveles: el diseño **Clásico** (básico) y los **llamativos**: Impacto (palabras enormes e inclinadas), Bloque (la línea dentro de un bloque de color), Tiras de color, Neón y Elegante (cursiva fina).

- La palabra que suena se marca de cuatro formas: cambia de color, caja de color detrás, salta y crece, o subrayado.
- «Remarcar la palabra más importante» de cada línea (más grande y en color).
- Color de letras y de resaltado (con rueda), tipografía, tamaño, mayúsculas y borde.

**Imagen y cámara** por escena: blanco y negro, cálido, frío o alto contraste; cámara quieta, que se acerca o que se aleja.

## Variantes automáticas

Al seleccionar un clip hay siempre **cuatro variantes, una de cada tipo**, sin esperar a Claude:

| Tipo | Qué cambia | De dónde sale |
| --- | --- | --- |
| Motion graphics | Número animado, lista, cierre con marca o tarjeta de texto | Las cifras y frases que se dijeron en ese clip |
| B-roll | Otro video encima con una etiqueta | Los clips de b-roll del proyecto; si no hay, botón para subir uno |
| Color | Aspecto de la imagen y color del texto | Cálido, blanco y negro, alto contraste o frío |
| Tipografía | Forma, letra y entrada del texto | Ocho combinaciones (gigante con Anton, marcador con Poppins…) |

- La **miniatura es el fotograma real** de la escena con la variante aplicada (Remotion `Thumbnail`), no un dibujo.
- «Otras 4» cambia el set. «Pedir variantes a Claude» queda para cuando ninguna sirva.
- En el Editor aparecen a la derecha y se aplican con un toque.

Desde Claude: `sugerir_variantes` (las de reglas) y `generar_variantes` (las que propone Claude).

## Audio

Pantalla **Audio** del studio, o con las herramientas de Claude:

| Qué | En el studio | Herramienta |
| --- | --- | --- |
| Quitar o bajar el sonido original | Barra de volumen y «Quitar el sonido original» | `ajustar_sonido_original` |
| Corrección de voz | Limpiar ruido (suave, media, fuerte) y «Realzar la voz» | `corregir_audio` |
| Música de fondo | Subir archivo con su licencia, volumen, quitar | `poner_musica` |
| Voz en off | Texto, voz, generar, quitar | `poner_voz_en_off`, `quitar_voz_en_off` |
| Efectos de sonido | Automáticos, o uno por escena con su segundo | `efectos_automaticos`, `poner_efecto`, `quitar_efectos` |

- **Realzar la voz**: ecualización (menos graves turbios, más presencia) y compresión para un volumen parejo.
- **Efectos incluidos**: barrido, pop, clic, campanita, impacto y subida. Se sintetizan con FFmpeg, así que no tienen problema de licencia.
- **Efectos automáticos**: un barrido en cada transición (impacto si es un destello) y un «pop» al entrar cada texto.
- La mezcla final (voz, música, voz en off y efectos) se nivela a -16 LUFS al exportar.
- Los errores del studio quedan escritos en `workspace/studio-errores.log`.

## Transiciones

Cada escena puede tener una **transición de entrada** (cómo se pasa de la anterior a ella). Sin transición es un corte seco.

- **Incluidas**: fundido, deslizar a la izquierda, deslizar hacia arriba, zoom, barrido rápido, destello, desenfoque, golpe y giro con zoom.
- **Recomendación** (`recomendar_transiciones`, o «Recomendar para todo el reel» en el editor), según el estilo:
  - rápido o montaje: casi todo corte seco, con un golpe de energía cada tres escenas;
  - con ritmo: transiciones cortas en los cambios de idea;
  - sobrio: fundidos;
  - al entrar a b-roll o gráficos, deslizar hacia arriba; en el cierre, destello.
- **Transiciones nuevas** (`crear_transicion`, o «Crear con Claude» en el editor): una transición es un dato validado, no código. Dice cómo entra la escena nueva, cómo sale la anterior (opacidad, posición, escala, giro, desenfoque) y un destello opcional. Se guardan por cliente en `workspace/clientes/<cliente>/transiciones/`.
- Mientras dura la transición, la escena anterior sigue viéndose debajo (se usa el material que viene justo después del corte). La duración del reel y el audio no cambian.
- En el editor: un botón en la unión de cada par de clips. Al tocarlo se abre la barra con todas las transiciones, la duración, «Ver», «Recomendar todas» y «Crear con Claude».

## Claude dentro de la app

Los botones «Pedir variantes a Claude», «Pedir a Claude» y «Crear con Claude» del studio le hablan a Claude directamente, sin pasar por el chat. El resultado aparece solo en la pantalla.

- Usa Claude Code (paquete oficial `@anthropic-ai/claude-code`, incluido) en modo no interactivo, con tu suscripción. No usa la API de pago.
- Solo tiene permiso para las herramientas de este programa (`mcp__axioma-studio`).
- **Hay que iniciar sesión una vez** en este computador:

  ```bash
  npx claude
  ```

  y dentro escribir `/login`.
- Si no hay sesión iniciada, la app lo avisa y guarda la petición para atenderla desde el chat («revisa las peticiones del studio»).

## Videos sin voz, voz en off y encuadre a la cara

### Montaje (videos sin voz)

Para gimnasio, comida, producto o cualquier material donde nadie habla a cámara.

```bash
npm run se -- montaje /ruta/carpeta-o-videos -d 15 -m /ruta/musica.mp3 --licencia "Artlist"
```

- Acepta un video, varios o una carpeta. Varios se unen en un master vertical.
- Detecta las tomas (cambios de plano) y reparte cortes cortos entre ellas: ~0,8 s con el preset rápido, ~1,2 s con ritmo y ~2 s sobrio.
- Con música, el largo de los cortes se ajusta al compás.
- Desde Claude: `crear_montaje`, `leer_tomas` y `armar_montaje` (Claude mira una miniatura de cada toma y elige las mejores). En el studio: «Sin voz (montaje)» en la pantalla de proyectos.
- El sonido original se trata como ambiente (`ajustar_sonido_original`).

### Voz en off

```bash
npm run se -- voz <carpeta-del-proyecto> "Texto que dirá la voz"
```

La voz se genera, se nivela a -16 LUFS, se transcribe y se subtitula sola. Suena desde el inicio del reel. En un montaje, el montaje pasa a durar lo que dura la voz. Proveedores, del mejor al más básico:

| Proveedor | Qué necesita | Costo |
| --- | --- | --- |
| `elevenlabs` | `ELEVENLABS_API_KEY` (y opcional `ELEVENLABS_VOICE_ID`) en `.env` | De pago |
| `piper` | `piper` instalado y `SE_PIPER_MODEL` con la ruta del modelo | Gratis, local |
| `sistema` | Nada: usa la voz de macOS (`say`) o de Windows | Gratis, suena más robótica |

### Encuadre que sigue la cara

Al preparar un video, la app busca la cara dos veces por segundo (TensorFlow en WebAssembly, igual en Mac y Windows) y guarda su posición en `faces.json`. Cada corte se encuadra hacia la cara: centrada en horizontal y un poco arriba del centro en vertical. Se nota al recortar un video horizontal a vertical, o uno vertical a 4:5 y 1:1. Si no hay cara, queda centrado. `ajustar_encuadre` lo fija a mano o lo devuelve a automático.

## Cómo funciona el corte automático

1. whisper.cpp 1.9.5 transcribe con alineación DTW (`-nfa`, porque la atención flash desactiva DTW).
2. FFmpeg `silencedetect` marca los silencios sobre la voz nivelada. Las palabras se ajustan a la voz real.
3. Se quitan:
   - muletillas ("eh", "em"…);
   - frases cortas de confianza muy baja, que suelen ser un "eh" mal transcrito;
   - tomas repetidas (se queda la última);
   - silencios más largos que `pacing.maxPause`.
4. Las frases se agrupan en escenas de 2,5–7 s. La primera es el gancho y la última el cierre.

## Estructura

- `packages/schema`: tipos y validación (zod), línea de tiempo y presets.
- `packages/engine`: CLI `se`, FFmpeg, whisper, cortes, render.
- `packages/remotion`: composición `Reel`, con subtítulos palabra por palabra, texto en pantalla y zoom de golpe.
- `packages/mcp`: servidor MCP que expone el engine a Claude.
- `packages/studio`: interfaz web (Vite + React).
- `plugin/`: plugin de Claude Code con las skills.
- `scripts/`: setup para Mac y Windows.

```bash
npm test
npm run typecheck
```

## Licencias

- **Remotion**: gratis para uso individual y para equipos de hasta 3 personas, también en uso comercial. No se puede vender Remotion en sí. Ver remotion.dev/license.
- **Codecs**: H.264/AAC tienen patentes de terceros que la licencia de Remotion no cubre.

## Guía

Paso a paso sin tecnicismos: `docs/TU-PRIMER-REEL.md`.

## Cambiar el nombre

El nombre visible sale de `APP_NAME` en `packages/schema/src/project.ts`. El nombre del plugin y del servidor MCP (`axioma-studio`) está en `plugin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `packages/engine/src/claude.ts` y `packages/mcp/src/server.ts`.

El objetivo completo y la definición de terminado están en `docs/PROMPT-OBJETIVO.md`.
