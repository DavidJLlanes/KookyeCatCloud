# Auditoría de errores: pérdida de datos (3-4 nov 2026)

Origen: el 3 nov se vació el texto de una nota (de 2091 bytes a 6, justo `&nbsp;`, lo que el editor guarda cuando está vacío) y el 4 nov los archivos vacíos de un proyecto de Código dejaban de abrirse. Son dos caras de la misma clase de fallo: **un error o un valor «vacío» se interpreta como «no hay datos» y el siguiente guardado lo hace permanente**.

## Causas probables de los dos incidentes
| Incidente | Causa | Estado |
|---|---|---|
| Nota vaciada | Leer el cuerpo de la nota podía fallar o tardar y devolvía texto vacío con éxito; el editor lo abría vacío y el autoguardado sobrescribía el original. Sin tiempo máximo en las peticiones ni cola en el servidor, además, dos guardados a la vez podían pisarse. | Corregido (`3b90bcf`) |
| Archivo vacío de Código | La limpieza de objetos trataba `tamaño 0` como «sin referencia» (`!p.objetos[h]`, `0` es falso) y borraba el objeto de 0 bytes. | Corregido (`4cad6f5`) |

La causa exacta del primero no pudo confirmarse sin registros del servidor; las defensas siguientes cubren todos los caminos conocidos.

## Hallazgos de la auditoría y arreglos
| # | Dónde | Riesgo | Arreglo |
|---|---|---|---|
| 1 | Notas, papelera, `lib/store.js` | Índice ilegible tomado por «vacío» y sobrescrito; escrituras concurrentes; `.tmp` compartido | Lectura que distingue «no existe» de «ilegible», `.bak`, `.dañado-<fecha>`, cola por usuario, escritura atómica con nombre único, salvavidas, «Buscar notas perdidas» |
| 2 | Favoritos y álbumes (`lib/albums.js`) | Lectura con `catch → []` (un fallo borraba todos los álbumes al guardar), `.tmp` fijo y lecturas-escrituras a la vez | Pasan por `lib/store.js` y sus escrituras van en cola |
| 3 | Favoritos (`GET /favorites`) | Depuraba (borraba) cualquier favorito cuyo acceso fallara, aunque fuera un error temporal | Solo se depura lo que da «no existe» |
| 4 | `uploadlinks.json`, `shares.json`, `passkeys.json`, `users.json`, `sessions.json` | Si el archivo estaba dañado al arrancar se tomaba por vacío y el siguiente guardado lo borraba (enlaces, comparticiones, passkeys, usuarios) | `leeJsonSync` / `escribeJsonSync`: `.bak`, `.dañado`, escritura atómica con nombre único |
| 5 | Caja fuerte: metadatos con la clave envuelta | Se escribían directamente: un corte a mitad dejaba la caja ilegible para siempre | Escritura atómica con `.bak` |
| 6 | Versiones de archivos (`.v`) | Escritura directa de la versión | Escritura atómica |
| 7 | Código: archivos de 0 bytes | Falso positivo de `0` | Comprobación por presencia y recreación del objeto al leer |
| 8 | Peticiones del cliente | Sin tiempo máximo: una lectura colgada dejaba la pantalla «leyendo» | Tiempo máximo y reintento en `api()` |

## Cómo evitar que vuelva a pasar
1. **`npm run check` ejecuta `tests/auditoria.js`**: falla si aparece código nuevo con `JSON.parse(readFile…) catch → vacío`, un `.tmp` de nombre fijo o un `writeFile` directo sobre un `.json`. Probado contra el código anterior: encontraba 11 casos. Lo legítimo se añade a `PERMITIDOS` con su motivo.
2. **Pruebas de humo** (`npm test`) para: 25 notas a la vez, índice dañado con y sin `.bak`, recuperación de notas, salvavidas, archivos vacíos en Código, álbumes a la vez.
3. **Reglas en `CLAUDE.md`** (sección «Persistencia») para cada módulo nuevo.
4. **Salvavidas**: si un guardado vacía o reduce a menos de la mitad una nota de 40+ caracteres, el texto anterior queda en `.notes/salvavidas/` (últimas 5 por nota).
5. **Copia de seguridad diaria** (03:00) con restauración documentada en el README.

## Riesgos que quedan (conocidos)
- La copia es diaria: lo creado o editado desde las 03:00 no está en ella. Para notas, el salvavidas y `.bak` cubren el caso habitual.
- La auditoría es estática y de patrones: no demuestra que no haya otros fallos. Los módulos con un archivo por elemento (prompts, bases) usan lectura-escritura sin cola por elemento; es raro que dos ediciones del mismo elemento coincidan.
- No hay registro del servidor de peticiones lentas ni de la latencia del bucle de eventos: si vuelve a haber lentitud, `journalctl -u kookyecatcloud` es lo único que hay.

## Segunda auditoría (4 nov 2026, noche)

Revisión de todo lo que borra, mueve o sobrescribe (servidor, WebDAV, papelera, transferencias, subidas) y de los autoguardados del cliente. Cada hallazgo marcado «confirmado» se reprodujo con una prueba que **falla con el código anterior** y pasa con el nuevo.

| # | Dónde | Fallo | Gravedad | Arreglo |
|---|---|---|---|---|
| 9 | Papelera de archivos | Varios borrados a la vez se pisaban el índice: **de 20 borrados en paralelo solo 1 quedaba en la papelera**; los otros 19 seguían en disco pero invisibles, sin poder restaurarse ni vaciarse. La selección múltiple de la app ya borraba en serie, pero dos borrados seguidos desde el visor, dos dispositivos o un cliente WebDAV sí coincidían. (confirmado) | Alta | Índice en cola por usuario para borrar, restaurar, eliminar, vaciar y caducar; vaciar escribe el índice primero |
| 10 | WebDAV `MOVE`/`COPY` | Origen y destino iguales: se borraba el «destino» (el propio archivo) y luego fallaba el renombrado → **archivo perdido**. (confirmado) Mover algo sobre una carpeta que lo contiene borraba también el origen. | Alta | Se rechazan los dos casos (403 / 409) |
| 11 | WebDAV `PUT` | Se escribía directamente sobre el archivo: una subida cortada a mitad lo dejaba truncado | Media | Temporal oculto + renombrado al terminar; se borra si la subida se corta |
| 12 | WebDAV `DELETE` y sobrescribir con `MOVE` | Borraban para siempre, sin pasar por la papelera | Media | Van a la papelera, como en la app |
| 13 | Editar texto en la app (`PUT /api/text`) | Escritura directa sobre el archivo | Media | Escritura atómica |
| 14 | Subidas | Dos subidas del mismo nombre a la vez podían elegir el mismo nombre libre y escribir el mismo archivo | Baja | Nombres reservados mientras dura la subida |
| 15 | Deshacer un «Mover» de Copiar o mover entre secciones | `rename` sobrescribía lo que hubiera ahora en el sitio original | Media | Se detiene con un aviso |
| 16 | Prompts | Un fallo pasajero al cargar el índice quedaba en caché y Prompts no funcionaba hasta reiniciar | Media | La carga fallida no se cachea |
| 17 | Notas (cliente) | Lo escrito en los últimos 900 ms se perdía si el móvil descartaba la app al cambiar de app; los guardados pendientes solo vivían en memoria | Media | Se guarda al ocultar la app; los pendientes se copian en el navegador y se reintentan al volver (solo si la nota no se editó después en otro sitio) |
| 18 | Código (cliente) | Si el guardado fallaba, abrir otro archivo o salir del proyecto descartaba lo escrito; no se guardaba al ocultar la app | Media | No cambia de archivo ni sale si no pudo guardar; guarda al ocultar |

Pruebas nuevas: WebDAV (mismo origen y destino, destino que contiene al origen, sobrescribir sin temporales, borrar a la papelera) y 20 borrados en paralelo. Comprobado en navegador (escritorio y 390 px) el guardado al ocultar en Notas y la apertura de archivos en Código.

## Tercera auditoría (4 nov 2026, noche)

Foco: ediciones desde **varios dispositivos o pestañas** (un cliente con datos desfasados que guarda encima) y texto escrito que se pierde al cerrar un diálogo.

| # | Dónde | Fallo | Gravedad | Arreglo |
|---|---|---|---|---|
| 19 | Notas | Una nota abierta en el móvil y cambiada luego en el PC: al escribir una letra en el móvil, su versión vieja **sobrescribía** lo del PC (el salvavidas solo saltaba si el texto encogía a menos de la mitad). (confirmado) | Alta | El cliente manda la versión del texto que abrió (`base`); si otro cliente guardó algo distinto después, el servidor responde 409 y el cliente guarda lo suyo como nota nueva «… (copia en conflicto HH:MM)» y abre la versión del servidor. No se pierde ninguna de las dos. Las pestañas/dispositivos se distinguen por `X-KCC-Client`, así que un mismo cliente nunca choca consigo mismo |
| 20 | Bases | Cambiar o borrar una vista reenviaba todas las columnas que tenía el cliente; si estaba desfasado, **se borraban las columnas creadas en otro dispositivo con todos sus datos**. Editar columnas tenía el mismo problema. (confirmado) | Alta | Cambiar vistas ya no toca columnas; al editar columnas, el cliente dice cuáles conocía y el servidor conserva las que no conocía |
| 21 | Todos los diálogos (`K.modal`) | Un toque fuera o Escape cerraba el diálogo y **tiraba lo escrito** (descripción de un evento, notas de un contacto, un prompt largo…) | Media | Si hay texto escrito (área de texto, editor o campo de 20+ caracteres) se pregunta «¿Descartar los cambios?» antes de cerrar |

Riesgos que quedan en esta línea: contactos, eventos y juegos se guardan como ficha completa (gana el último guardado si se edita la misma ficha a la vez en dos dispositivos); el editor de texto de Archivos también, pero ahí cada guardado deja la versión anterior en «Versiones».

Pruebas nuevas: conflicto de notas entre dos clientes (409 y sin pisar), columnas de Bases con un cliente desfasado. En navegador (escritorio y 390 px): diálogo que pregunta antes de descartar, y conflicto real entre dos pestañas (la nota conserva lo del otro dispositivo y lo escrito aquí queda como copia).

## Cuarta auditoría, profunda (4 nov 2026, noche)

Revisión sistemática: todos los manejadores de la API (con un script que busca los `async` sin `try`), todas las llamadas de red del cliente, el service worker, cada endpoint que escribe archivos, los temporizadores de limpieza y los flujos de escritura.

| # | Dónde | Fallo | Gravedad | Arreglo |
|---|---|---|---|---|
| 22 | Editor de texto de Archivos | En un archivo mayor que lo que carga el visor (512 KB por defecto) solo llega el principio, pero se podía editar y **guardar, y el archivo quedaba cortado** a ese trozo. (confirmado) | Alta | El visor no ofrece editarlo y el servidor rechaza el guardado (413) |
| 23 | Editor de texto de Archivos | Guardar encima de un cambio hecho en otro sitio (otro dispositivo, WebDAV) mientras se editaba | Media | El visor manda la fecha del archivo que abrió; si cambió y el texto es distinto, 409 y el editor sigue abierto (además queda la versión anterior en «Versiones») |
| 24 | Contactos, eventos, juegos y prompts | Un formulario abierto con una versión vieja pisaba los cambios hechos después en otro dispositivo (último que guarda gana). | Media | El formulario manda la fecha de la ficha que abrió; si otro cliente la cambió, 409 y el formulario sigue abierto con lo escrito (comprobado en navegador) |
| 25 | Toda la API | Express 4 no recoge los errores de los manejadores `async` que ocurren fuera de su `try`: **la petición se quedaba sin respuesta** y la app «leyendo» hasta agotar el tiempo (15 rutas con código antes del `try`). | Media | Los rechazos van al manejador de errores final, que responde en JSON; los `HttpError` conservan su mensaje |
| 26 | Restaurar una versión de archivo | Copia directa sobre el archivo | Media | Atómico (temporal + renombrado) |
| 27 | Caja fuerte: sacar archivos | El error de escritura del flujo se escuchaba tarde: con el disco lleno **tumbaba el servidor** | Media | Se escucha desde el principio; se borra el archivo a medias |
| 28 | Papelera de archivos y de notas | Al caducar, una entrada sin fecha se quitaba del índice sin borrar su archivo (quedaba huérfano) | Baja | Solo salen del índice las caducadas |

Revisado sin hallazgos: el service worker no guarda en caché nada de `/api/`, `/dav/`, `/s/`, `/u/`; las importaciones solo añaden; borrar un usuario no borra sus datos; las demás llamadas de red pasan por `api()` (con tiempo máximo) salvo login, passkeys, subidas y la versión, que no lo necesitan; los tamaños que se cargan en memoria están acotados.

Riesgos que quedan: el registro de actividad se recorta reescribiéndolo (si coincide con una línea nueva, esa línea puede perderse; no son datos del usuario); si la copia de una versión falla (p. ej. disco lleno), el archivo se guarda igualmente sin versión.

## Quinta auditoría, exhaustiva (4 nov 2026, noche)

Revisión de: todo lo que borra (cada `rm`/`unlink` del servidor y cada borrado del cliente, con o sin confirmación), todos los errores que se tragan en silencio (`catch {}`), los límites de longitud de cada campo de texto, todas las rutas sin autenticación, las descompresiones, los deshacer, la recarga automática por versión nueva y los dos riesgos que quedaban de la auditoría anterior.

| # | Dónde | Fallo | Gravedad | Arreglo |
|---|---|---|---|---|
| 29 | Caja fuerte: meter una carpeta | Los archivos ocultos de la carpeta (`.env`, `.git`…) **no se cifraban, pero la carpeta original se borraba entera**: se perdían. (confirmado) | Alta | Se incluyen también los ocultos |
| 30 | Bases, proyectos de Código, contactos, juegos y eventos | Borrar era definitivo en el acto (una base o un proyecto entero con un toque y un «Aceptar») | Media | Lo borrado se aparta 30 días en `.kcc/borrados/<sección>/` y luego se elimina solo |
| 31 | Contactos, eventos, juegos y prompts | Las descripciones, notas, reseñas y cuerpos más largos que el máximo **se recortaban en silencio** al guardar | Media | Se rechaza con un mensaje que dice cuánto sobra y el formulario sigue abierto; en importaciones sí se recorta (rechazar haría saltarse la ficha) |
| 32 | Copiar o mover entre secciones: deshacer | Si el deshacer fallaba a medias, el envío quedaba como deshecho y lo apartado **se borraba al caducar** (1 minuto); los fallos al devolver datos se tragaban | Media | Si falla, lo apartado se conserva 30 días, se puede reintentar (los pasos ya hechos se saltan) y el error llega al usuario; devolver a su sitio ya no sobrescribe nada |
| 33 | Archivos → Código al mover | Se apartaban (y luego borraban) también los archivos que Código descarta (`.DS_Store`, `Thumbs.db`) | Baja | Solo se apartan los que entraron en el proyecto |
| 34 | Portapapeles y recordatorios vinculados | Borrar era definitivo y sin confirmación | Media | Se pide confirmación |
| 35 | Recarga automática por versión nueva | Podía recargar con cambios sin guardar en Código o en Notas; al cerrar la pestaña, el guardado de Código podía cortarse | Media | No recarga si hay algo a medio guardar; Código manda lo último con `keepalive` al cerrar |
| 36 | Registro de actividad (pendiente de la cuarta) | Una línea escrita durante la poda podía perderse | Baja | Poda síncrona y atómica, después de las escrituras en curso |
| 37 | Versiones (pendiente de la cuarta) | Si fallaba guardar la versión anterior (disco lleno), el archivo se sobrescribía igualmente | Media | Se avisa y no se sobrescribe (salvo desde WebDAV, que no puede preguntar) |

Revisado sin hallazgos: todas las rutas públicas son las previstas (inicio de sesión, passkeys, enlaces de compartir y de subida); la copia de seguridad, la exportación y la administración exigen administrador; el ZIP de Código no puede escribir fuera del proyecto (rutas normalizadas, sin `..`); las importaciones solo añaden; el servidor no borra archivos del usuario fuera de la papelera salvo temporales; los borrados de la caja fuerte son definitivos a propósito y piden la contraseña o lo avisan.

Riesgos que quedan (conocidos y aceptados):
- Mover un archivo con historial de versiones a la ruta de otro archivo borrado reemplaza el historial de aquel (el archivo borrado sigue en la papelera, sin sus versiones).
- La copia de seguridad es diaria.
- Ninguna auditoría garantiza que no haya fallos: estas cubren los patrones que ya hicieron perder datos y las rutas que borran, mueven o sobrescriben.

Para recuperar algo de `.kcc/borrados/` (bases, proyectos, contactos, juegos, eventos borrados hace menos de 30 días) ver el README.

## Cierre de pendientes (4 nov 2026, noche)

| # | Dónde | Fallo | Arreglo |
|---|---|---|---|
| 38 | Bases: celdas | El texto de una celda de más de 2.000 caracteres se recortaba; un número o una fecha no válidos se vaciaban; un enlace sin `http(s)://` se borraba. Todo sin avisar. Además el navegador cortaba lo pegado en la celda. | Se rechaza con un aviso que nombra la columna; la celda conserva lo escrito para corregirlo; en importaciones se adapta como antes |
| 39 | Campos cortos de contactos, juegos, eventos y prompts (nombre, empresa, cargo, teléfonos, direcciones, título, lugar, estudio, saga, tienda, fuente…) | Se recortaban al máximo sin avisar | Se avisa (`store.corto`); en importaciones y datos de RAWG se recortan |
| 40 | Valores reutilizables (empresa, ciudad, plataforma…) | Se cortaban a 80 caracteres sin avisar (aunque el campo declarase 120) | Se avisa con el máximo real |
| 41 | Notas de contacto y portapapeles | El navegador cortaba en silencio lo pegado por encima del máximo | Sin tope en el campo: el servidor avisa |
| 42 | Versiones al mover (pendiente de la quinta) | Mover un archivo a la ruta de otro con historial borraba ese historial | El historial anterior se aparta 30 días en `.kcc/borrados/versiones/` |

Ya no queda ningún pendiente conocido de las auditorías. Sigue sin estar garantizado que no haya otros fallos, y la copia de seguridad sigue siendo diaria.

## Tercera auditoría (9 nov 2026): Pagos, Marcadores, Perfil y Sonidos

Revisión del código nuevo (validación, persistencia, SSRF, XSS, borrados). Sin hallazgos de pérdida de datos en lectura/escritura; sí cuatro arreglos:

| # | Dónde | Riesgo | Arreglo |
|---|---|---|---|
| 1 | Pagos, `frecuencia` | `'toString' in FRECUENCIAS` era cierto: «toString»/«constructor» pasaban la validación y rompían el cálculo de fechas (NaN) | `hasOwnProperty`; prueba con tres nombres del prototipo |
| 2 | Marcadores, `red.js` | `::127.0.0.1` (IPv4 compatible) y 6to4 (`2002::/16`) no estaban bloqueados | Bloqueo de `::/96` y `2002::/16`; añadidos a la prueba SSRF |
| 3 | Marcadores, `red.js` | El tiempo máximo era por inactividad: un servidor que goteaba bytes mantenía la descarga abierta | Plazo total (el doble del tiempo por inactividad) |
| 4 | Perfil, quitar foto | Un fallo al apartar la copia se ignoraba y la foto se daba por quitada | Solo se ignora «no existe»; cualquier otro error aborta sin tocar nada |
| 5 | Sonidos | Un volumen guardado no numérico dejaba el volumen en NaN | Valor por defecto si no es un número |

Sin hallazgos: ningún `innerHTML` con datos del usuario en los clientes nuevos (todo con `textContent`), enlaces solo http/https, iconos solo por cabecera real (nunca SVG), borrados con copia de 30 días y 409 en ediciones obsoletas.

## Cuarta auditoría (9 nov 2026): recorte de la foto de perfil

Revisión de `public/js/perfil-recorte.js` y del procesado de 300 × 300 WebP (calidad 75). Probado en el navegador con una foto de 6000 × 4000, una de 100 × 100, una con orientación EXIF y un archivo que no era imagen.

| # | Dónde | Riesgo | Arreglo |
|---|---|---|---|
| 1 | Recorte | Las fotos enormes se redibujaban enteras en cada movimiento (lento en móvil) | Se reducen a 2400 px al abrirlas |
| 2 | Recorte | Solo se podía encuadrar con puntero | Flechas para mover y +/− para el zoom |
| 3 | Recorte | Una imagen sin dimensiones dejaba un recorte vacío | Se avisa y se cancela |

Sin hallazgos: cancelar no sube nada, la orientación EXIF sale bien, una foto pequeña no se amplía en el cliente, un archivo que no es imagen lo rechaza el servidor con aviso y siempre se guarda 300 × 300 WebP.

## Quinta auditoría (9 nov 2026): toda la app

Alcance: dependencias, autenticación de las 323 rutas, recorridos de ruta, subidas, XSS en servidor y cliente, cookies/CSRF, ejecución de comandos y barrido de las 22 vistas en móvil y escritorio.

| # | Dónde | Hallazgo | Estado |
|---|---|---|---|
| 1 | `public/index.html` | El script que fija el tema antes de pintar iba en línea y la CSP (`script-src 'self'`) lo bloqueaba: el tema claro parpadeaba en oscuro y la consola mostraba un error en cada carga | Corregido: `public/js/tema-inicial.js` (también en `sw.js`) |
| 2 | `npm audit` | `minimatch` (DoS por patrones) dentro de `archiver`/`readdir-glob` | Aceptado: el único uso es `zip.directory()` con patrón fijo; ningún patrón viene del usuario. Revisar al actualizar `archiver` |

Comprobado sin hallazgos:
- Sin sesión, 302 rutas dan 401, una 403 y las públicas previstas (`/s`, `/p`, `/u`, `/api/public/*`, login, passkeys, versión, manifiesto) responden o dan 404 con un id falso.
- Recorrido de ruta (`../`, `%2f`, rutas absolutas, `\`, byte nulo, `.kcc`, otros usuarios) contra descarga, vista previa, texto y lista: ninguna filtra datos; los parámetros en forma de array se rechazan con 400.
- Subir `.svg` y `.html` no da XSS: la vista previa los rechaza (415) y la descarga va como `attachment` con `application/octet-stream`.
- `innerHTML` solo con texto escapado (notas, Código); cookies `httpOnly` + `SameSite=Strict` (sin CSRF); límites de subida en todos los `multer`; `execFile`/`spawn` sin intérprete y sin entrada del usuario en los argumentos; ningún secreto ni `.env` en el repositorio.
- Las 22 vistas cargan sin errores de JavaScript ni respuestas 5xx y sin desborde horizontal a 390 px (solo falla el mapa por no haber internet en el entorno de pruebas).
