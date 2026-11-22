---
name: instalar-axioma
description: Instala y conecta Axioma Studio en el computador de la persona, guiándola desde el chat (Mac o Windows). Úsala cuando digan «instala Axioma», «cómo uso Axioma Studio», «no me aparecen las herramientas de Axioma», o cuando intentes usar Axioma y no existan sus herramientas (por ejemplo `estado_sistema`).
---

# Instalar y conectar Axioma Studio

Axioma Studio son dos partes: **las skills** (esta guía, que se instala en Claude) y **la app** (corre en el computador y hace los cortes, la voz y el render). Las skills solas no editan nada: hace falta la app instalada y conectada. Esta skill lleva a la persona hasta tenerla funcionando. Habla en lenguaje simple y da un paso a la vez.

## 1. Mira dónde está

1. Pregunta el sistema (Mac o Windows) si no lo sabes.
2. Si existen las herramientas de Axioma (`estado_sistema`), la app ya está conectada: llámala y sigue con la skill `axioma`.
3. Si no existen, busca la carpeta de la app: en Mac `~/Axioma Studio` o donde se descomprimió el ZIP (`Instalar Axioma Studio.command`); en Windows `%USERPROFILE%\Axioma Studio` o la carpeta del ZIP. Si la encuentras, salta al paso 3.

## 2. Descarga e instala la app (lo hace la persona, tú la guías)

El instalador pide la contraseña del computador y abre ventanas del sistema, así que **no lo ejecutes tú**: guía los pasos.

1. Descargar: https://github.com/sergioagc26/axioma-studio/archive/refs/heads/main.zip (o la página de instalación que te hayan compartido).
2. Descomprimir en una carpeta normal (en Windows: clic derecho → «Extraer todo»).
3. Abrir el instalador y esperar a que diga «Listo»:
   - **Mac:** «Instalar Axioma Studio.command». Si macOS no lo deja, clic derecho → Abrir.
   - **Windows:** «Instalar Axioma Studio.bat». Si avisa «Windows protegió su PC»: Más información → Ejecutar de todas formas.
4. Tarda de 10 a 40 minutos la primera vez. Pregunta por la IA local (opcional, 5 a 11 GB): se puede decir que no.
5. Si falla, que abra el instalador otra vez (retoma donde quedó) y te cuente el último mensaje o el archivo `workspace/instalacion.log`.

## 3. Conecta la app con Claude

Al terminar, el instalador muestra dos líneas. Dáselas tú también, con la ruta real de la carpeta de la app:

```
/plugin marketplace add "<carpeta de la app>"
/plugin install axioma-studio@axioma-studio
```

Son comandos de Claude: la persona los pega en un chat, **una línea por mensaje**. Luego debe **reiniciar Claude (o abrir un chat nuevo)** para que carguen las herramientas.

**Si las skills se instalaron antes desde GitHub** (`/plugin marketplace add sergioagc26/axioma-studio`), esa copia trae solo las skills, sin las herramientas. Antes de añadir la carpeta local, que quite la anterior: `/plugin uninstall axioma-studio@axioma-studio` y `/plugin marketplace remove axioma-studio`. Si Claude muestra otro error de nombre repetido, léelo y adáptate.

Alternativa sin comandos: abrir Claude Code dentro de la carpeta de la app y aceptar el plugin «axioma-studio».

Si las líneas no aparecen o el plugin quedó viejo, desde la carpeta de la app se repite con `npm run se -- instalar-claude`.

## 4. Comprueba y empieza

1. Llama `estado_sistema`. Si falta algo (whisper, FFmpeg, el plugin), explica el arreglo en una línea.
2. Cuando todo esté en verde, pasa a la skill `axioma`: «Listo, ya está todo. ¿Qué quieres lograr hoy?».

## Actualizar

Cuando haya versión nueva: en la app, pantalla Proyectos → **Actualizar** (o la herramienta `actualizar_app`). Si las skills cambiaron, reiniciar Claude para cargarlas.

## Qué nunca hacer

- No pidas ni guardes contraseñas, claves ni cuentas de la persona: las escribe ella.
- No ejecutes el instalador por ella ni descargues por tu cuenta archivos que no sean el ZIP oficial del repositorio de arriba.
- Si algo del sistema falla (permisos, winget, espacio), dilo sin tecnicismos y para; no insistas con otra vía arriesgada.
