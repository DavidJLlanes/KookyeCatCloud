<p align="center">
  <img src="docs/assets/cover-kookyecatcloud.png" alt="KookyeCatCloud — Tus archivos y fotos. Siempre contigo." width="100%">
</p>

<h1 align="center">KookyeCatCloud</h1>

<p align="center">
  <strong>Tu nube, en tu servidor.</strong><br>
  Organiza tus archivos, guarda tus fotos y compártelos desde cualquier dispositivo.<br>
  Servidor de archivos y backup de fotos autoalojado, con una PWA instalable.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/LICENCIA-MIT-6366f1?style=for-the-badge" alt="Licencia MIT"></a>
  <a href="public/manifest.json"><img src="https://img.shields.io/badge/PWA-INSTALABLE-8b5cf6?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA instalable"></a>
  <a href="#despliegue-en-el-vps"><img src="https://img.shields.io/badge/ALOJAMIENTO-TU_SERVIDOR-3b82f6?style=for-the-badge" alt="Autoalojado en tu servidor"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-4-555555?logo=express&logoColor=white" alt="Express 4">
  <img src="https://img.shields.io/badge/JavaScript-f7df1e?logo=javascript&logoColor=black" alt="JavaScript">
  <a href="#webdav"><img src="https://img.shields.io/badge/WebDAV-COMPATIBLE-6366f1" alt="Compatible con WebDAV"></a>
</p>

<h3 align="center"><a href="#arrancar-en-local">🚀 Instalar KookyeCatCloud</a></h3>

<p align="center">
  <a href="#arrancar-en-local">Inicio rápido</a> ·
  <a href="#despliegue-en-el-vps">Despliegue</a> ·
  <a href="#variables-de-entorno">Configuración</a> ·
  <a href="https://github.com/DavidJLlanes/KookyeCatCloud/issues">Reportar un problema</a> ·
  <a href="LICENSE">Licencia</a>
</p>

---

## Qué puedes hacer

| | |
| --- | --- |
| 📁 **Archivos organizados** | Gestiona carpetas, favoritos, papelera y descargas ZIP. |
| 📷 **Tu biblioteca de fotos** | Explora álbumes, fechas de captura, datos EXIF y un mapa de fotos. |
| 🎬 **Vistas previas** | Consulta fotos, vídeos, audio y documentos desde el navegador. |
| 🔗 **Compartir fácilmente** | Crea enlaces de subida y descarga con caducidad y contraseña opcional para las descargas. |
| 💻 **Acceso con WebDAV** | Conecta tu nube desde el explorador o una app compatible. |
| 📝 **Notas tipo Notion** | Editor de bloques con carpetas, colores, etiquetas y enlaces internos. |
| 📅 **Calendario** | Mes, semana, día y agenda con calendarios de colores, repetición y recordatorios. |
| ✨ **Prompts de IA** | Biblioteca con categorías, etiquetas, variables e imágenes de muestra en WebP. |
| 🔎 **Todo conectado** | Buscador global (Ctrl+K) y fechas de calendario para lo que subes o creas. |
| 🫆 **Huella y Face ID** | Entra sin contraseña con la biometría de tu móvil u ordenador (passkeys). |
| 🔒 **Caja fuerte** | Archivos cifrados con una contraseña propia, que se bloquea sola. |
| 👥 **Compartir** | Carpetas y archivos entre usuarios, de solo lectura o con edición; versiones de archivos de texto. |
| 🔐 **Control de tu cuenta** | Gestiona sesiones, verificación en dos pasos y tokens de aplicación. |

Licencia [MIT](LICENSE): úsalo, modifícalo o redistribúyelo libremente, con o sin fines
comerciales, siempre que mantengas el aviso de copyright.

## Arrancar en local

```bash
npm install
INSECURE_COOKIES=1 DATA_DIR=./storage npm start
```

Abre `http://localhost:4000`. En el primer arranque se crea el usuario `admin` y su
contraseña se imprime **una sola vez** en la consola; cámbiala desde la pestaña **Cuenta**.

`INSECURE_COOKIES=1` es necesario en local porque la cookie de sesión lleva el flag
`Secure` y el navegador la descartaría sobre `http://`.

## Despliegue en el VPS

```bash
cd /opt/filecloud
npm ci --omit=dev
cp .env.example .env      # y rellena JWT_SECRET con: openssl rand -hex 32
```

### systemd — `/etc/systemd/system/filecloud.service`

El servicio corre con un usuario del sistema sin privilegios, no con `root`:

```bash
useradd --system --no-create-home --shell /usr/sbin/nologin filecloud
mkdir -p /data/storage
chown -R filecloud:filecloud /data/storage /opt/filecloud
```

```ini
[Unit]
Description=KookyeCatCloud
After=network.target

[Service]
Type=simple
User=filecloud
WorkingDirectory=/opt/filecloud
EnvironmentFile=/opt/filecloud/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/data/storage /opt/filecloud

[Install]
WantedBy=multi-user.target
```

`ProtectSystem=strict` deja todo el sistema de archivos en solo lectura salvo lo indicado en
`ReadWritePaths`: si cambias `DATA_DIR` en el `.env` a una ruta distinta de `/data/storage`,
actualiza también esta línea o el servicio no podrá escribir ahí.

```bash
systemctl daemon-reload && systemctl enable --now filecloud
```

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name tu-dominio.com;

    ssl_certificate     /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

    # Las subidas llegan hasta 5 GB: sin esto Nginx corta en 1 MB
    client_max_body_size 5G;
    proxy_read_timeout 600s;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name tu-dominio.com;
    return 301 https://$host$request_uri;
}
```

`X-Forwarded-For` importa: el servidor tiene `trust proxy` activado y el limitador de
intentos de login usa la IP real del cliente.

### En qué dirección instalarla

La app no lleva ningún dominio escrito: todo se calcula a partir de la dirección desde la que
la abres, así que sirve igual en `djl.com.es`, en `davidjllanes.es` o en un subdominio como
`cloud.davidjllanes.es`. Para esos casos basta el bloque de Nginx de arriba cambiando
`server_name` (y el certificado).

Para colgarla de una **subcarpeta** (`davidjllanes.es/cloud`) define el prefijo en el `.env`:

```ini
BASE_PATH=/cloud
```

y en el `server` de ese dominio añade un `location` que **conserve** el prefijo (sin barra
final en `proxy_pass`):

```nginx
    location /cloud/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /cloud { return 301 /cloud/; }
```

Con `BASE_PATH` la app, el manifest de la PWA, el service worker, la cookie de sesión, los
enlaces compartidos (`/cloud/s/…`, `/cloud/u/…`) y WebDAV (`/cloud/dav/`) cuelgan todos de
ese prefijo. Fuera de él el servidor responde 404. Cada instalación necesita su propio
proceso, puerto y `DATA_DIR`.

## Miniaturas

La cuadrícula de fotos pide `/api/thumb`, que genera un WebP de 480 px con **sharp** y lo
cachea en `.thumbs/` (fuera de `DATA_DIR`, para que no aparezca en los listados). La clave de
caché incluye tamaño y `mtime`, así que al reemplazar una foto su miniatura se regenera sola.

`sharp` está declarado como dependencia **opcional** y necesita **Node ≥ 20.9**. Si no se
instala, la app sigue funcionando: la cuadrícula muestra las imágenes originales, solo que
descargando muchos más bytes. Para comprobarlo:

```bash
node -e "console.log(require('sharp').versions)"
```

La caché se puede borrar en cualquier momento, se reconstruye sola:

```bash
rm -rf /opt/filecloud/.thumbs/*
```

## Multimedia

| Formato | Miniatura | Reproducción |
|---|---|---|
| Imágenes (jpg, png, webp, gif, bmp, avif) | sharp | directa |
| **HEIC/HEIF** (fotos de iPhone) | sharp | convertida a WebP al vuelo y cacheada |
| **Vídeo** (mp4, mov, mkv, webm, m4v, ogv) | fotograma con ffmpeg | `<video>` con salto por rangos |
| **Audio** (mp3, m4a, flac, wav, ogg, opus, aac) | — (distintivo) | `<audio>` |

El salto en el vídeo funciona porque el servidor de ficheros de Express ya responde `206 Partial
Content`. Para las miniaturas de vídeo hace falta ffmpeg en el servidor:

```bash
apt install ffmpeg
```

Sin él, los vídeos salen con su distintivo de color y todo lo demás sigue igual. `DISPLAY_MAX`
(2200 px por defecto) limita el tamaño de la conversión HEIC para pantalla.

## Fotos: agrupación y EXIF

El botón del calendario, junto al selector de vista, agrupa por **mes y año** con una cabecera por
grupo; el año se destaca solo cuando cambia. Se vuelve a "todas seguidas" con el mismo botón, y la
preferencia se recuerda en el dispositivo. Las carpetas van en su propio grupo, arriba.

La fecha que manda es la de **captura del EXIF**, no la del archivo: subir hoy una foto de 2019 no
debe colocarla en el mes actual. Si una foto no trae EXIF, se usa su fecha de archivo.

Leer el EXIF de cientos de fotos en cada listado sería insufrible, así que `GET /api/photometa`
cachea fecha y coordenadas en `.thumbs/exif-cache.json`, con la misma clave que las miniaturas
(ruta + tamaño + mtime). La primera vez tarda; después responde en milisegundos. La rejilla se
pinta antes de pedirlas y se reordena cuando llegan.

En el visor, el botón de información abre el panel de detalles de la foto: fecha, cámara, objetivo,
exposición (0,004 s se muestra como 1/250), diafragma, ISO, focal, dimensiones y software. Si la
foto guarda coordenadas, aparece un enlace a **Google Maps** y las coordenadas en decimal.

Se lee con **exifr** (sin dependencias propias). Esa misma caché de coordenadas es la que
aprovecha el mapa de fotos (siguiente sección) para no releer el EXIF de todo el árbol.

## Zonas seguras en móvil

La app declara `viewport-fit=cover` y barra de estado translúcida, así que el contenido llega
hasta los bordes físicos de la pantalla. Para que no quede **debajo** de la barra de estado o de
la barra de gestos, los márgenes salen de cuatro variables:

```css
--safe-top: env(safe-area-inset-top, 0px);
--safe-bottom: env(safe-area-inset-bottom, 0px);
--safe-left / --safe-right
```

Se usan en la cabecera (que crece lo que ocupe la barra de estado), la pantalla de entrada, el
visor, las ventanas, el panel de detalles, las barras flotantes y la navegación inferior. En un
equipo sin muesca valen 0 y no cambia nada.

Van por variable y no por `env()` suelto a propósito: así se pueden **simular** en una prueba
—redefiniéndolas a 47 px— y medir si algo se solapa, que es como se verificó.

El botón de cerrar del visor mide 48×48 en móvil, va destacado sobre el resto y nunca lo tapa el
nombre del archivo, por largo que sea.

## Mapa de fotos

Pestaña **Mapa** con las fotos que guardan coordenadas, sobre Leaflet + OpenStreetMap.

Leaflet va **alojado aquí** (`public/vendor/leaflet/`, 185 KB): ningún CDN. Lo único que sale
fuera son los tiles del mapa, y por eso `img-src` de la CSP incluye el servidor de tiles —es la
única excepción de toda la aplicación. Se cambia de proveedor con `TILE_URL` y `TILE_ATTR`, y el
permiso de la CSP se deriva solo de esa URL.

Los puntos cercanos se agrupan en círculos con el número de fotos; al acercar se separan. La
agrupación es propia, por rejilla, para no añadir otra librería. El globo muestra miniatura,
nombre, fecha y carpeta, con un botón que abre la foto en el visor, navegando por todas las
fotos ubicadas ordenadas por fecha.

`GET /api/photomap` recorre el árbol entero reutilizando la caché de EXIF, así que la segunda
vez es inmediato. Tope de `MAP_LIMIT` (5000) fotos.

Sobre privacidad: tus fotos y tus coordenadas **no** salen de tu servidor. El servidor de tiles
solo sabe qué cuadrantes del mapa pides, como cualquier mapa web.

## Visor de documentos

| Tipo | Cómo se muestra |
|---|---|
| **PDF** | visor propio del navegador, en un marco |
| **Markdown** | intérprete propio (ver abajo) |
| **Texto y código** (txt, json, log, js, css, py, yml…) | monoespaciado, con tope de `TEXT_MAX` |
| **CSV / TSV** | tabla, hasta 500 filas |
| **Hojas de cálculo** (xlsx, xlsm, xls, ods) | rejilla de verdad: columnas, filas y pestañas de hoja |
| **Documentos y presentaciones** (docx, doc, pptx, ppt, odt, odp, rtf) | convertidos a PDF con LibreOffice y cacheados |

Las hojas de cálculo **no** se convierten a PDF: eso las pagina y dejan de parecer una hoja.
Se leen con **exceljs** y se devuelven como datos, y el cliente pinta la rejilla con letras de columna,
números de fila, cabeceras fijas al desplazar y una pestaña por hoja. Solo lectura. Se muestran los
valores ya calculados de las fórmulas, las fechas en formato español y los anchos de columna del
original. Topes: `SHEET_MAX_ROWS` (2000) y `SHEET_MAX_COLS` (60), con aviso si se recorta.

Los `.xls` y `.ods` antiguos no los abre exceljs: LibreOffice los pasa a xlsx primero y el
resultado queda cacheado.

Para los documentos de Office hace falta LibreOffice en el servidor:

```bash
apt install -y libreoffice --no-install-recommends
```

Sin él, esos archivos muestran un aviso claro y el botón de descarga; todo lo demás funciona igual.
Cada conversión usa un perfil de usuario propio (`-env:UserInstallation`) porque dos LibreOffice
a la vez con el mismo perfil chocan. `GET /api/capabilities` dice qué hay disponible, y el cliente
lo usa para no prometer una vista previa que no existe.

El intérprete de Markdown es propio y **devuelve nodos del DOM, nunca cadenas de HTML**: un archivo
que contenga `<script>` se ve como texto, no se ejecuta. Cubre encabezados, negrita, cursiva,
tachado, código en línea y en bloque, listas con un nivel de anidado, citas, reglas, tablas y
enlaces (solo `http`, `https` y `mailto`, con `rel="noopener noreferrer"`).

De los archivos grandes solo se lee el principio (`TEXT_MAX`, 512 kB por defecto): un log de 2 GB
no puede tumbar el servidor. El visor avisa de que está recortado.

Nota sobre el PDF: se sirve **sin** la directiva `sandbox` que llevan las demás vistas previas,
porque el visor del navegador no arranca dentro de un documento aislado. Corre en su propio
proceso y no tiene acceso a la sesión.

## WebDAV

`https://tu-dominio.com/dav/` con tu usuario y contraseña de siempre. Cada uno ve su propia
raíz, igual que en la web, y las carpetas internas (`.trash`, `.notes`) quedan fuera.

- **Windows** — Explorador → Este equipo → Conectar a unidad de red
- **macOS** — Finder → Ir → Conectarse al servidor (⌘K)
- **Android** — FolderSync o similar, para que el móvil suba las fotos solo

Métodos: OPTIONS, PROPFIND, GET/HEAD, PUT, DELETE, MKCOL, MOVE, COPY, PROPPATCH y LOCK/UNLOCK.
Los bloqueos son simbólicos: se conceden y se recuerdan pero no impiden nada. Se anuncian porque
sin ellos Windows monta la unidad en solo lectura.

Va montado **antes** del analizador de JSON a propósito: si no, un cliente que suba un `.json`
con `Content-Type: application/json` haría que Express se comiera el cuerpo y el PUT escribiera
un archivo vacío. La comprobación de contraseña con bcrypt se cachea 5 minutos porque montar una
unidad dispara decenas de peticiones seguidas.

Dos cosas de Windows que conviene saber: exige HTTPS con certificado válido para autenticación
básica (aquí lo hay), y trae un límite de 50 MB por descarga que se sube en el registro
(`HKLM\SYSTEM\CurrentControlSet\Services\WebClient\Parameters\FileSizeLimitInBytes`).

## Espacio de trabajo: notas, calendario y prompts

Tres módulos que comparten **etiquetas de color**, **fechas de calendario** y el **buscador
global**. Todo lo que subes o creas puede llevar una fecha, y esa fecha aparece como evento
en el calendario con un enlace de vuelta al elemento.

| Módulo | Qué guarda | Dónde |
| --- | --- | --- |
| Notas | Un `.md` por nota + `index.json` con la estructura | `<usuario>/.notes/` |
| Calendario | Calendarios, eventos y tareas | `<usuario>/.kcc/calendar.json` |
| Prompts | Un `.json` por prompt + imágenes WebP | `<usuario>/.kcc/prompts/` |
| Etiquetas | Lista de etiquetas con color | `<usuario>/.kcc/labels.json` |

Todo está oculto al explorador de archivos y a WebDAV (son carpetas con punto). Para las
copias de seguridad basta con respaldar `DATA_DIR`.

### Etiquetas de color

Se escriben donde haga falta (nota, prompt, evento) y se crean al vuelo con Enter. Son las
mismas en todas partes: renombrar una o cambiarle el color lo cambia en todos los módulos a la
vez, y borrarla la quita de todo lo que la usaba. Se gestionan desde el menú “⋯” de Prompts, el
panel de etiquetas del Calendario o el buscador (Ctrl+K → “Gestionar etiquetas”).

### Buscador global (Ctrl+K)

Un solo cuadro que busca en archivos, notas (título y contenido), prompts y eventos, y que
también crea cosas (“Nuevo prompt”, “Nuevo evento”…) y salta entre secciones. Se abre con
**Ctrl+K** (⌘K en Mac) o desde el botón de la barra lateral.

### Fecha en el calendario

- **Al subir archivos**: en la barra de subida hay un interruptor *“Poner fecha de subida en
  el calendario”*. Con pocos archivos cada uno tiene su evento; con una subida grande se crea
  un solo evento para la carpeta. El interruptor se recuerda; la fecha vuelve a ser “hoy” en
  cada subida.
- **En un archivo ya subido**: menú del archivo → *“Fecha en el calendario…”* (poner,
  cambiar o quitar). Si el archivo se renombra o se mueve, el evento lo sigue; si va a la
  papelera, el evento desaparece.
- **En un prompt o una nota**: interruptor en el editor / propiedades de la nota.
- **Desde el calendario**: mover un evento de un prompt o una nota (arrastrándolo o
  editándolo) actualiza la fecha en su ficha, y borrarlo la quita de la ficha. Pulsar el
  origen en el evento abre el prompt, la nota o la carpeta del archivo.

Los eventos nacidos de un origen van a calendarios de sistema (*Prompts*, *Notas*,
*Archivos*) que se pueden recolorear o ocultar, pero no borrar.

## Calendario

Vistas **mes, semana, día y agenda**; varios calendarios con color; eventos de día completo,
multidía y **tareas** con casilla; **repetición** (diaria, semanal con días, mensual, anual,
hasta una fecha o N veces) y edición de “solo este evento” o “todos”; **recordatorios** (avisos
en la propia app y notificación del navegador si das permiso); lugar, descripción, etiquetas y
color propio por evento.

- **Arrastrar** una pastilla en la vista mes la mueve de día; en semana/día se arrastra para
  mover (también a otro día), con el borde inferior para cambiar la duración, y arrastrando en
  un hueco vacío se crea un evento con ese rango.
- Las fechas se guardan **sin zona horaria**, tal y como las ves: un evento “a las 9:00” sigue
  siendo a las 9:00 aunque cambie el horario de verano.
- Mini-calendario lateral con puntos en los días con eventos, filtro por etiquetas y búsqueda.
- **Tareas sin fecha**: una lista lateral donde apuntas tareas sin día ni hora. Se arrastran a un
  día (todo el día) o a una hora de la vista semana/día para programarlas, y de vuelta a la lista
  para quitarles la fecha.
- **Festivos de España**: calendario opcional (menú “⋯” → *Festivos de España…*) con los festivos
  nacionales y los de tu comunidad autónoma. Se calculan para cualquier año (la Semana Santa sale
  de la fecha de Pascua), sin servicios externos. Son orientativos: cada comunidad publica su
  calendario oficial y los festivos locales no están incluidos.
- **Importar .ics** (Google Calendar, Apple, Outlook…): se interpreta en el navegador, así que las
  horas en UTC o con zona horaria pasan a tu hora local. Admite eventos y tareas, todo el día,
  repeticiones (diaria, semanal con días, mensual, anual), excepciones, instancias modificadas y
  avisos. Volver a importar el mismo archivo no duplica nada.
- **Suscripción iCal de solo lectura** (menú “⋯” → *Suscribirse desde otro calendario…*): genera un
  enlace privado `…/ical/<token>.ics` para ver tu calendario en Google Calendar, Apple Calendar u
  Outlook. El token es de 256 bits, se puede regenerar o apagar, y puedes elegir qué calendarios
  incluir. Google actualiza estos enlaces cada cierto número de horas.

## Prompts de IA

Biblioteca pensada para guardar muchos prompts (aguanta decenas de miles: el índice vive en
memoria y cada prompt es un archivo propio).

- **Clasificación**: categorías en **árbol** (con emoji y color), **listas** (agrupan prompts de
  cualquier categoría: un proyecto, un cliente), etiquetas de color, **tipo** (imagen, texto,
  código, vídeo, audio, agente), **estado** (borrador / probando / final / archivado), modelo o
  herramienta, idioma, valoración de 1 a 5, favorito, fijado y color de tarjeta.
- **Imágenes de muestra**: hasta **10 por prompt**. Se convierten a **WebP**, se reducen a
  **1600 px** como máximo por el lado mayor y se genera una miniatura de 480 px. Se pueden
  arrastrar, pegar (Ctrl+V), reordenar, elegir portada y poner pie de foto. Requiere `sharp`
  (ver *Miniaturas*). Máximo 15 MB y 64 megapíxeles por imagen de origen.
- **Variables y plantillas con formulario**: al copiar, la app abre un formulario con un campo por
  variable y una vista previa del resultado. Sintaxis dentro del texto:
  `{{nombre}}` (campo de texto) · `{{nombre=valor}}` (con valor por defecto) ·
  `{{tono=formal|cercano|técnico}}` (lista desplegable; la primera opción es la predeterminada) ·
  `{{detalle:largo}}` (varias líneas; también `:numero` y `:fecha`). Una variable repetida se
  pide una sola vez, se rellena también en el prompt negativo y la app recuerda los últimos
  valores de cada prompt.
- Prompt negativo, notas, parámetros (seed, steps, aspect ratio…) y fuente.
- **Historial** de versiones del texto (las 30 últimas) para volver atrás.
- **Vistas** en tarjetas, lista o **tablero por estado** (arrastrando entre columnas), orden por
  fecha, título, valoración o uso, filtros combinables, **selección múltiple** con acciones en
  lote y **papelera** con restauración.
- **Importar / exportar** en JSON (hasta 5000 por importación), o pegando texto con prompts
  separados por una línea `---`.

## Notas (editor de bloques)

Editor estilo Notion sobre las mismas carpetas y el mismo autoguardado de siempre.

- **Bloques**: texto, títulos 1-3, listas con viñetas, numeradas y de tareas (anidables con
  Tab), citas, código, avisos de colores y separadores. Escribe **`/`** para insertar, o usa
  atajos de Markdown (`# `, `- `, `1. `, `[] `, `> `, tres comillas invertidas, `---`).
- **Formato**: negrita, cursiva, tachado, resaltado, código y enlaces (barra flotante al
  seleccionar, o Ctrl+B / I / E / K). Arrastra el asa ⠿ para reordenar bloques.
- **Enlaces internos**: `/Enlazar un prompt` y `/Enlazar una nota` insertan un enlace que
  abre el prompt o la nota.
- **Tablas** (Tab y Enter recorren las celdas, botones para filas y columnas) e **imágenes**:
  súbelas, pégalas (Ctrl+V), arrástralas o elige una de tus archivos. Se guardan en la carpeta
  *Adjuntos de notas* de tu nube y la nota las referencia, así que no se duplican.
- **Menciones `@`**: escribe `@` y un nombre para enlazar notas, prompts o archivos. Cada nota
  muestra abajo **“Enlazada desde…”** (backlinks), y la ficha de un prompt enseña en qué notas
  se menciona.
- **Plantillas**: reunión, diario, proyecto, planificación semanal y apuntes de lectura, más las
  tuyas (menú ⋯ de una nota → *Guardar como plantilla*).
- **Exportar**: una nota a **Markdown** (si tiene imágenes, un ZIP con `Adjuntos/`), una carpeta a
  un ZIP con su estructura, o a **PDF** (se abre el diálogo de impresión del navegador →
  *Guardar como PDF*; una carpeta junta todas sus notas).
- **Propiedades**: icono (emoji), color, **fijar** arriba, etiquetas y **fecha en el
  calendario**.
- El contenido se guarda como **Markdown** en el mismo `.md`: las notas anteriores se abren
  tal cual y todo sigue siendo texto recuperable a mano.

Notas y carpetas anidadas sin límite de profundidad. Las notas eliminadas van a `.notes/trash/`
y se restauran con su rama entera; caducan a los mismos `TRASH_TTL_DAYS` que los archivos.
`NOTES_LIMIT` (5000) topa el número de elementos y `NOTE_MAX_CHARS` (500 000) el tamaño de una
nota. Las rutas de notas, prompts y calendario aceptan hasta 2 MB de cuerpo (30 MB la
importación de prompts), frente a los 100 kB del resto de la API.

## Huella y Face ID (passkeys)

Entra con **Face ID, Touch ID, la huella del móvil, Windows Hello** o una llave de seguridad, sin
escribir la contraseña. Funciona en iPhone/iPad (Safari y la app instalada, iOS 16+), Android
(Chrome, Edge, Samsung Internet…), Mac y Windows.

- **Activarlo**: *Cuenta → Huella y Face ID → Añadir este dispositivo* (hay que haber entrado antes
  con la contraseña). Cada dispositivo se puede renombrar o quitar. En la pantalla de inicio de
  sesión aparece el botón **“Entrar con huella o Face ID”**. La contraseña sigue funcionando.
- **Seguridad**: la biometría nunca sale del dispositivo; el servidor solo guarda una **clave
  pública** por dispositivo (`passkeys.json`). Se exige siempre verificación del usuario (huella,
  cara o PIN), por eso una passkey cuenta como contraseña + segundo factor y no se pide el código
  de verificación en dos pasos. Cada intento usa un reto de un solo uso (5 min), se comprueban el
  dominio y el origen, la firma, y un contador detecta claves clonadas.
- **Requisitos**: HTTPS (o `localhost`). Las passkeys quedan ligadas al **dominio**: si abres la
  nube en `cloud.ejemplo.es` y en `ejemplo.es/cloud` tendrás que registrar el dispositivo en cada
  dirección. Si la app está detrás de un proxy, Nginx debe enviar `Host` y `X-Forwarded-Proto`
  (ya van en la configuración de ejemplo); en casos raros se pueden fijar con `WEBAUTHN_RP_ID` y
  `WEBAUTHN_ORIGIN`.
- Las passkeys de iPhone y Android se sincronizan con iCloud o con tu cuenta de Google, así que un
  móvil nuevo suele traerlas ya, aunque conviene registrarlo igualmente.
- Los datos de acceso a la caja fuerte **no** se desbloquean con la huella: la caja usa su propia
  contraseña a propósito.

## Versiones de archivos de texto

Cada vez que guardas un archivo de texto desde el editor de la web (o lo sobrescribes por WebDAV)
se guarda antes una copia de lo que había. Menú del archivo → *Historial de versiones…*, o el botón
*Historial* mientras lo editas: lista de versiones, comparación línea a línea con la actual,
descarga y restauración. Restaurar guarda antes lo de ahora, así que siempre se puede deshacer.
Guardar sin cambios no crea versiones. Se conservan las últimas `VERSIONS_KEEP` (30) y se borran
las de más de `VERSIONS_DAYS` (180) días; no se versionan archivos de más de
`VERSIONS_MAX_BYTES` (5 MB). Si renombras o mueves el archivo, sus versiones lo siguen. Viven en
`<usuario>/.kcc/versions/`.

## Caja fuerte

Una sección con **contraseña propia**, distinta a la de la cuenta, para lo realmente privado.

- **Cifrado**: AES-256-GCM por bloques de 1 MiB. La clave sale de tu contraseña con scrypt
  (N=32768) y envuelve una clave de datos aleatoria; cambiar la contraseña solo vuelve a envolver
  esa clave, no recifra nada. Los **nombres** y la estructura de carpetas también están cifrados, y
  cada bloque lleva autenticación: si alguien altera o trunca un archivo en disco, se detecta y no
  se entregan datos falsos.
- **Clave en memoria**: el servidor solo tiene la clave mientras la caja está desbloqueada, ligada
  a tu sesión. Se descarta al bloquear, al cerrar sesión, al salir de la sección (opcional) y tras
  `VAULT_IDLE_MIN` (15) minutos sin usarla. Cinco contraseñas erróneas bloquean los intentos 5 min.
- **Uso**: subir (con barra de progreso y arrastrar y soltar), carpetas, vista previa de
  imágenes, PDF, texto, vídeo y audio (con rangos para saltar en el vídeo), descargar, renombrar,
  mover, **mover desde tus archivos** (se cifran y se borran los originales) y **sacar a tus
  archivos**. También desde el menú de cualquier archivo → *Mover a la caja fuerte…*.
- **Límites a propósito**: los archivos de la caja no aparecen en la búsqueda, ni en WebDAV, ni en
  enlaces compartidos, ni en copias de miniaturas en claro. Los SVG y HTML se descargan en vez de
  abrirse.
- **Si olvidas la contraseña, los datos no se pueden recuperar**, ni siquiera el administrador. La
  caja vive en `<usuario>/.vault/`: haz copia de esa carpeta junto con el resto de `DATA_DIR`.

## Compartir con usuarios

Menú de un archivo o carpeta → *Compartir con usuarios…*: eliges qué usuarios del servidor lo ven y
con qué permiso, **solo ver** o **puede editar**. Quien lo recibe lo encuentra en su raíz de
archivos, en **Compartido conmigo**.

- Con permiso de edición se puede subir, crear carpetas, renombrar, editar textos y borrar dentro
  (lo borrado va a la **papelera de su dueño**). Sobre la carpeta compartida entera no se puede
  borrar ni mover, solo dejar de verla.
- El servidor traduce cada ruta compartida al almacén de su dueño y **comprueba en cada petición**
  el permiso y que no se sale de la carpeta (`../` no funciona). Lo compartido contigo no se puede
  volver a compartir con un enlace público ni repartirse a terceros, y no aparece en WebDAV.
- Si el dueño renombra o mueve la carpeta, la compartición la sigue; si la borra o borras al
  usuario, desaparece. En **Cuenta → Compartir con usuarios** ves lo que compartes y lo que
  comparten contigo, y puedes cambiarlo o quitarlo.
- Los favoritos y los álbumes no admiten elementos de carpetas compartidas.

## Actualizaciones

### En el navegador y en el móvil
Cuando el servidor tiene una versión nueva, la app lo detecta sola (busca al volver a la pestaña, al
recuperar la conexión y cada 30 minutos) y muestra un aviso **“Hay una versión nueva · Actualizar”**,
sin tener que abrirla dos veces. El service worker sabe que hay novedad porque su caché lleva un
identificador de versión (`/api/version`) calculado a partir de los archivos de `public/`: cambia
solo al actualizar el código, no hay que subir ningún número a mano. En **Cuenta → Acerca de** se
ve la versión instalada y hay un botón para buscar actualizaciones.

### En el servidor
Actualizar a mano:

```bash
cd /var/www/tu-dominio/cloud
sudo -u filecloud git pull
npm ci --omit=dev              # como root: el usuario filecloud no tiene carpeta personal
chown -R filecloud:filecloud .
systemctl restart kookyecatcloud
```

O con el script, que además comprueba y **vuelve atrás si algo falla**:

```bash
sudo bash deploy/update.sh --check   # solo mira si hay algo nuevo
sudo bash deploy/update.sh           # actualiza
```

El script solo aplica avances en línea recta (`git merge --ff-only`); se niega si hay cambios
locales o la historia ha divergido; ejecuta `npm ci --omit=dev` solo si cambiaron las dependencias;
comprueba la sintaxis de todo el código **antes** de reiniciar; reinicia y espera a que
`/api/version` responda; y si algo falla en esos pasos, **restaura la versión anterior** y vuelve a
reiniciar. Cada resultado se escribe en el registro del sistema.

### Actualización automática cada noche (opcional)
```bash
sudo cp deploy/kookyecat-update.service deploy/kookyecat-update.timer /etc/systemd/system/
sudo nano /etc/systemd/system/kookyecat-update.service      # revisa la ruta de ExecStart
sudo systemctl daemon-reload
sudo systemctl enable --now kookyecat-update.timer
systemctl list-timers kookyecat-update.timer                # próxima ejecución (≈ 04:30)
journalctl -u kookyecat-update.service -n 30 --no-pager     # qué hizo la última vez
```

- Aplica **todo lo que haya en la rama `main` de tu repositorio**: actívalo solo si tú controlas
  lo que se sube. Para **pausarlo** sin desinstalar nada: `touch .no-autoupdate` en la carpeta de la
  app (bórralo para reanudar).
- **Aviso por correo** (necesita el comando `mail`): en el `.service`, descomenta la línea
  `Environment=NOTIFY_CMD=…` con tu dirección. Recibirás el resultado de cada actualización o de
  cada vuelta atrás. Con otro comando (Telegram, un webhook…) funciona igual: recibe el mensaje por
  la entrada estándar.
- Si no existe el repositorio remoto, no hay red o GitHub falla, el script lo anota y no toca nada.

## Papelera

`DELETE /api/files` ya no borra: renombra el elemento a `<carpeta del usuario>/.trash/<id>` y
apunta su origen en `.trash/index.json`, para poder restaurarlo en su sitio. Los elementos
caducan a los `TRASH_TTL_DAYS` días (30 por defecto) y se purgan al abrir la papelera.

Todo lo que empieza por punto es interno: no se lista, no se cuenta en las estadísticas y la
API rechaza cualquier ruta que lo contenga, así que a `.trash` solo se llega por sus endpoints.

Al restaurar (o al subir) nunca se sobrescribe: si el nombre ya está ocupado se añade `_1`, `_2`…

## Descargar como ZIP

`GET /api/zip?p=ruta&p=otra` empaqueta al vuelo carpetas enteras o una selección, hasta
`ZIP_LIMIT` (200) elementos. Se transmite mientras se comprime, sin archivo temporal.

Los nombres con acentos viajan en `filename*=UTF-8''…` además del `filename` en ASCII, que es
lo que exige la norma para que todos los navegadores acierten.

## Enlaces de descarga

El inverso de los de subida: `https://tu-dominio.com/s/<token>` para mandarle un archivo o
una carpeta a alguien sin cuenta. Se crean desde el menú de cualquier elemento (clic derecho →
*Compartir enlace…*) eligiendo descripción, caducidad y **contraseña opcional**.

Un archivo suelto se descarga directamente. Una **carpeta** abre además una galería pública
navegable (`/s/<token>` → *Ver galería*): miniaturas, subcarpetas y un visor de fotos y vídeos,
todo sin sesión y sin salir nunca de la carpeta compartida. El botón *Descargar todo (ZIP)*
sigue disponible para quien prefiera bajárselo entero. La página pública muestra nombre, tamaño
y caducidad, y nada más: ni la ruta, ni el dueño, ni el resto de la nube. La contraseña se guarda
con bcrypt, nunca sale en las respuestas, y protege igual la galería que la descarga.

Comparten almacén con los de subida (`uploadlinks.json`) y se distinguen por el campo `kind`;
los creados antes de que existieran se tratan como `upload`.

## Enlaces de subida

Desde Administración se crea un enlace `https://tu-dominio.com/u/<token>` que permite a
cualquiera **dejar** archivos en una carpeta concreta, sin cuenta. Los enlaces viven en
`uploadlinks.json` y guardan dueño, carpeta destino, caducidad y contadores.

Lo que el endpoint público **no** permite: listar, descargar, ver la ruta de destino ni saber
quién es el dueño. Los topes se ajustan por entorno:

| Variable | Por defecto | Qué limita |
|---|---|---|
| `LINK_MAX_FILES` | 50 | archivos totales que admite un enlace |
| `LINK_MAX_BYTES` | 2 GB | tamaño total acumulado por enlace |
| `LINK_IP_HOURLY` | 200 | subidas por IP y hora en el endpoint público |

El rol del dueño se relee en cada subida, así que degradar o borrar a un usuario invalida
sus enlaces al instante.

## Renombrado en lote

Desde la selección múltiple (o el menú contextual sobre varios elementos), *Renombrar en
lote…* aplica un patrón a todos: `{n}` es el número de orden (con ceros a la izquierda) y
`{name}` el nombre original sin extensión. La extensión se conserva siempre, y si el nombre
resultante ya existe se le añade un sufijo automático, igual que al restaurar de la papelera.

## Descargar convertido

Un HEIC se puede descargar como `.jpg` (conversión con sharp) y un documento de Office
(`.docx`, `.pptx`, `.odt`…) como `.pdf` (con LibreOffice, reutilizando la misma caché que la
vista previa). Los botones solo aparecen cuando el servidor tiene la herramienta instalada:
`GET /api/download?path=...&as=jpg` y `&as=pdf`.

## Editar archivos de texto

El visor de archivos de texto y código incluye un lápiz para editarlos ahí mismo y guardar con
`PUT /api/text`. Vale para cualquier extensión de las que ya se previsualizan como texto (`.txt`,
`.md`, `.csv`, código…); Markdown y CSV se editan como texto plano, no en su vista renderizada.

## Favoritos y presentación

Cualquier archivo o carpeta se puede marcar como favorito desde su menú de opciones. La pestaña
**Colecciones → Favoritos** los reúne todos en un único sitio, sin importar en qué carpeta
estén. Dentro del visor, el botón de presentación (▶) pasa las fotos solas cada pocos segundos;
se detiene al navegar a mano o al cerrar. Se guardan en `.favorites.json`, dentro de la carpeta
de cada usuario.

## Álbumes

Colecciones con nombre que apuntan a fotos por ruta, sin moverlas ni duplicarlas: la misma foto
puede estar en varios álbumes a la vez. Se crean y se rellenan desde **Colecciones → Álbumes** o
añadiendo elementos con *Añadir a álbum…* desde cualquier menú de opciones. Viven en
`.albums/index.json` dentro de la carpeta de cada usuario.

## Analizador de espacio y duplicados

Dos herramientas nuevas en Administración:

- **Espacio por carpeta** — un vistazo carpeta a carpeta, con el tamaño de cada subcarpeta ya
  sumado recursivamente, para encontrar qué está llenando el disco sin adivinarlo por tipo.
  Tope de `DU_LIMIT` (200 000) archivos examinados por subcarpeta, para que un almacén enorme
  no agote los descriptores de archivo del sistema.
- **Duplicados** — compara primero por tamaño y solo calcula el hash de lo que coincide, así que
  un almacén con miles de archivos se puede analizar sin tardar minutos. Cada grupo permite
  marcar todas las copias menos la más antigua y mandarlas a la papelera de una vez. Tope de
  `DUP_LIMIT` (20 000) archivos por escaneo.

## Sesiones, verificación en dos pasos y tokens de aplicación

Todo esto vive en la pestaña **Cuenta**, disponible para cualquier usuario, no solo para el
administrador:

- **Sesiones abiertas** — cada inicio de sesión queda registrado (`sessions.json`) con IP,
  navegador y última actividad, y se puede cerrar en remoto una a una o todas menos la actual.
  Los tokens JWT emitidos antes de esta función siguen funcionando: solo se revisan contra la
  lista de sesiones los que ya llevan el identificador nuevo.
- **Verificación en dos pasos (TOTP)** — un segundo factor de 6 dígitos compatible con Google
  Authenticator, Aegis o similar, implementado sin dependencias nuevas (HMAC-SHA1 + base32, RFC
  6238). Como aquí no hay lector de QR, la clave se añade a mano en la app de códigos.
- **Tokens de aplicación** — para montar WebDAV o usar scripts sin escribir la contraseña real
  de la cuenta. Se muestran una sola vez al crearlos y se revocan individualmente; WebDAV acepta
  tanto la contraseña de la cuenta como cualquiera de sus tokens.

## Bloqueo con PIN

Un bloqueo puramente del lado del cliente (Cuenta → Bloqueo con PIN): pide un PIN de 4 a 8
dígitos al reabrir la pestaña, al volver de segundo plano o tras 10 minutos de inactividad. El
hash del PIN (SHA-256) se guarda solo en `localStorage` de ese dispositivo y nunca llega al
servidor — no sustituye a la contraseña de la cuenta, es solo para que nadie cotillee si se deja
el móvil desbloqueado un momento.

## Registro de actividad

Cada acción relevante (subidas, borrados, movimientos, inicios de sesión, cambios de
contraseña, enlaces creados, verificación en dos pasos, tokens…) queda anotada en
`activity.log.jsonl`, una línea JSON por evento. Se ve en la pestaña **Cuenta**: cada usuario
ve solo las suyas, y el administrador ve las de todos desde esa misma tarjeta. El archivo se
recorta solo a `ACTIVITY_MAX` líneas.

## Cómo se guardan los archivos

- **admin** → ve y gestiona todo `DATA_DIR`.
- **usuarios normales** → aislados en `DATA_DIR/users/<username>/`, creado al vuelo.

## Variables de entorno

Ver [.env.example](.env.example).

## Copias de seguridad

Lo imprescindible: `DATA_DIR` (los archivos), `users.json` (las cuentas, incluye tokens de
aplicación y el secreto de verificación en dos pasos de quien la tenga activada) y
`.jwt-secret` (si se pierde, todas las sesiones abiertas se invalidan). Los datos de notas,
calendario, prompts, etiquetas, versiones y la caja fuerte viven dentro de `DATA_DIR` (carpetas
`.notes`, `.kcc` y `.vault`), así que quedan cubiertos por la copia de `DATA_DIR`. Junto a
`users.json` conviene copiar `shares.json` (comparticiones entre usuarios), `passkeys.json` (dispositivos con huella/Face ID)
e `ical-tokens.json` (enlaces de suscripción de calendario). `sessions.json` y
`activity.log.jsonl` son prescindibles: perderlos solo borra el historial de sesiones/actividad,
no cierra a nadie ni rompe nada.
