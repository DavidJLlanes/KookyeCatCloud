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

## Sexta auditoría (9 nov 2026): avisos push

Revisión de `lib/push/` y su cliente. Cada arreglo tiene prueba en `tests/modulos/push.js`.

| # | Dónde | Riesgo | Arreglo |
|---|---|---|---|
| 1 | Programador | Un ciclo lento (red lenta con muchos usuarios) podía solaparse con el siguiente y enviar dos veces lo mismo | Un solo ciclo a la vez |
| 2 | Dispositivos | Si en un mismo navegador se cambiaba de usuario, el aviso de la cuenta anterior seguía llegando a ese móvil (privacidad) | Un navegador pertenece a una sola cuenta: al registrarlo se quita de las demás |
| 3 | Ajustes | Un archivo antiguo o a medias (sin `vencidos`, sin `dias`…) dejaba valores sin definir y `cfg.dias.length` podía fallar | Fusión con los valores por defecto sección a sección |
| 4 | Contactos | Quien cumple el 29 de febrero no recibía aviso en años no bisiestos | Se avisa el 28 |
| 5 | Prueba | El aviso de prueba se podía lanzar en bucle | Enfriamiento de 10 s (429) |

Sin hallazgos: el destino de los envíos solo puede ser un servicio push de navegador (sin SSRF), la clave privada VAPID no sale al cliente, el endpoint de la suscripción tampoco, los avisos no se repiten (registro por clave), un fallo pasajero se reintenta a los 10 min y un dispositivo caducado (404/410) se quita solo. La ruta `/api/push/_ciclo` solo existe con `KCC_PUSH_PRUEBAS=1` (no usar en producción).

## Séptima auditoría (9 nov 2026): general, segunda pasada

Pruebas de caja negra contra la app en marcha (archivos internos por la web, fugas en errores, sesiones, fuerza bruta, cabeceras, reglas de usuarios y contraseñas). Pruebas nuevas en `tests/modulos/seguridad.js`.

| # | Dónde | Hallazgo | Arreglo |
|---|---|---|---|
| 1 | `sendError` | Un error del sistema devolvía su texto al cliente, con rutas del servidor (`ENOENT … scandir '/…/data'`), y con estado 400 | Errores de disco/permisos y fallos de programación devuelven un mensaje general con el estado correcto (404, 403, 507…) y los graves se registran |
| 2 | Cabeceras | Sin `Strict-Transport-Security` en la app | Se envía con HTTPS real (sin `includeSubDomains`, por si otros subdominios no tienen HTTPS) |
| 3 | Inicio de sesión | `bcrypt.compareSync` bloqueaba a todos los usuarios ~70 ms por intento | `await bcrypt.compare` |
| 4 | Contraseñas | Mínimo 6 y sin máximo: bcrypt ignora lo que pasa de 72 bytes | De 8 a 72 caracteres (cliente y servidor) |
| 5 | Usuarios | «ADMIN» se podía crear junto a «admin» | Unicidad sin distinguir mayúsculas |

Sin hallazgos: ningún archivo interno (`.env`, `.jwt-secret`, `users.json`, `vapid.json`, código, `.git`, `docs`) se sirve por la web, con ni sin sesión; el cierre de sesión invalida el token; tras 5 fallos el inicio de sesión se bloquea 15 min por IP y por usuario; sin `X-Powered-By` ni CORS abierto.

Riesgo conocido: el bloqueo por intentos permite a un atacante bloquear a un usuario concreto durante 15 minutos (compromiso aceptado frente a la fuerza bruta). Las contraseñas ya existentes de menos de 8 caracteres siguen valiendo hasta que se cambien.

## Octava auditoría (seguridad y errores, 11-nov-2026)

Sondeo de caja negra contra una copia temporal (rutas de administración, IDOR entre usuarios, ZIP, WebDAV, enlaces compartidos).

**Corregido**
- **ZIP de Código (memoria):** los topes de 10 MB/archivo y 50 MB totales se comprobaban con el tamaño que declara la cabecera, que un ZIP manipulado falsea; el servidor inflaba 150 MB antes de enterarse. Ahora `lib/descomprime.js` descomprime en flujo y corta en cuanto los bytes reales pasan el tope (400).
- **WebDAV sin límite de intentos:** la autenticación Basic permitía adivinar contraseñas sin freno (y cada intento cuesta ~100 ms de CPU síncrona). Ahora usa el mismo limitador por IP que el login (5 fallos → 15 min, 429).
- **Enlaces compartidos con contraseña:** sin freno en `list`, `thumb`, `view`, `file`. Ahora 10 fallos por hora y por IP+enlace.

**Comprobado sin hallazgos:** recorridos `../` y `%2f` en WebDAV (quedan dentro de la raíz del usuario), acceso a rutas internas (`.kcc`, papelera), rutas de admin con usuario normal, IDOR en pagos/actividad/estadísticas.

**Riesgos aceptados:** el bloqueo por IP puede usarse para impedir temporalmente el acceso desde una misma IP; las contraseñas cortas antiguas siguen valiendo hasta que se cambien.

Pruebas nuevas en `tests/modulos/seguridad.js`.

## Novena auditoría (seguridad y errores, 11-nov-2026)

Repaso de lo añadido desde la octava (nombre visible, reparto de espacio, limitador de WebDAV) y de las dependencias.

**Corregido**
- **El limitador de WebDAV compartía clave con el login web:** un cliente montado con una contraseña vieja que reintenta habría bloqueado también la entrada por la web (15 min). Ahora WebDAV cuenta sus fallos aparte (`dav:<ip>`).
- **Caché de credenciales de WebDAV (5 min):** seguía aceptando una contraseña ya cambiada, un token de aplicación revocado o un usuario borrado. Ahora cada acierto de caché comprueba que el usuario exista y que sus claves no hayan cambiado, y usa el rol actual.

**Comprobado sin hallazgos:** nombre visible (se pinta con `textContent`, se limpia de caracteres de control, tope de 40, cambios concurrentes por `updateJson`, lista de nombres solo para administradores); reparto de espacio (`lstat`, no sigue enlaces simbólicos); descompresión con topes reales.

**Dependencias:** `npm audit` sigue indicando 3 avisos moderados de `minimatch` (DoS por patrones) a través de `archiver`; el patrón es fijo y no lo controla el usuario, así que se mantiene como riesgo aceptado hasta que `archiver` publique una versión corregida sin cambios incompatibles.

Pruebas nuevas en `tests/modulos/seguridad.js`.

## Décima auditoría (seguridad y errores, 11-nov-2026)

Revisión tras el troceo de ~20 archivos (servidor y cliente) y sondeo de caja negra contra una copia temporal.

**Corregido**
- **Despliegue:** `deploy/update.sh` ejecutaba `npm run check`, que incluye ESLint (dependencia de desarrollo, ausente con `npm ci --omit=dev`), y revertía una actualización correcta. Ahora usa `check:despliegue` (sintaxis + auditoría de persistencia).
- **Administración, foto y nombre visibles en «Usuarios»:** se pedían al terminar de cargar los enlaces compartidos, antes de que existieran las filas de la lista (carrera entre dos peticiones). Ahora se piden tras pintar la lista.
- **Rutas `/api/...` inexistentes** devolvían la página de la app con un 200; ahora 404 en JSON.

**Comprobado sin hallazgos**
- Sin sesión solo responden las rutas públicas esperadas (manifiesto, versión, enlaces compartidos, passkeys). Un usuario normal no accede a rutas de administración y no ve ni modifica datos de otro (prompts, código, contactos, juegos, bases, notas, calendario; listados vacíos).
- 523 peticiones vacías o inválidas a las 330 rutas: ningún 500 (solo el 501 esperado de ComfyUI sin configurar).
- SSRF en Marcadores: 12 variantes de dirección interna (127.0.0.1, localhost, [::1], decimal, hexadecimal, 0.0.0.0, IPv4 mapeada en IPv6, nip.io, metadatos 169.254.169.254) no llegan a un servidor interno de prueba.
- Recorridos `../`, `%2f`, rutas absolutas y barras invertidas: 11.327 peticiones a todas las rutas GET y a archivos internos (`users.json`, `.jwt-secret`, `.git`, `server.js`…), sin fugas.
- XSS: el Markdown de notas escapa todo y solo admite `http(s):` y `mailto:`; hay pocos `innerHTML` y con datos escapados; CSP con `script-src 'self'`.
- Cookie de sesión `HttpOnly; SameSite=Strict`; sin cabeceras CORS; un POST de formulario entre sitios no se interpreta.
- Cliente: ningún identificador sin declarar en los 146 scripts, caché sin archivos que falten y todas las vistas (22) sin errores de JavaScript ni de consola como administrador y como usuario normal, en móvil y escritorio.
- Dependencias de ejecución completas en `dependencies` (`sharp` es opcional y tolerado).

**Riesgos aceptados:** los mismos de la octava y novena (`minimatch` vía `archiver`, bloqueo por IP).

Pruebas: `tests/modulos/seguridad.js` (404 de la API) y `tests/ui/todas-las-vistas.js`.

## Undécima auditoría (Recordatorios, imágenes de notas, calendario y push)

Alcance: lo añadido en la jornada (módulo Recordatorios, migración desde el calendario, fuente push, subida optimizada de imágenes en notas).

- **Acceso y aislamiento:** sin sesión todas las rutas nuevas dan 401; un usuario normal no ve, edita, posterga, marca ni borra recordatorios ajenos (404). El barrido de autorización de las 336 rutas no cambia respecto a la décima auditoría.
- **Entradas raras:** cuerpos `[]`, `null`, texto, `__proto__`/`constructor`, JSON roto, campos con el tipo equivocado, ids con `..`, `%2e%2e` o 5000 caracteres, minutos negativos, enormes o no numéricos y cuerpos de 100 kB: ningún 500 y ningún cambio en prototipos. Los 535 pedidos del barrido general solo devuelven el 501 esperado de ComfyUI sin configurar.
- **XSS:** título, notas y vínculo con `<img onerror>` y `<svg onload>` se pintan como texto en la lista, el formulario y el panel; no se ejecuta nada.
- **Vínculos:** el vínculo es solo texto (tipo de una lista cerrada); abrirlo pasa por las rutas normales con los permisos del usuario, así que una ruta inventada no da acceso a nada.
- **Push:** la lista de servicios admitidos (anti-SSRF) no cambia; solo se reconocen mejor Opera y Samsung en el nombre del dispositivo. Horas no válidas de Recordatorios se rechazan (400).
- **Vistas:** las 23 vistas abren sin errores de JavaScript como administrador y como usuario normal, en móvil y escritorio.
- **Corregido:** la optimización de imágenes no intenta decodificar archivos de más de 80 MB (en un móvil agotaría la memoria); se suben tal cual y el límite de 30 MB los rechaza con aviso.
- **Observaciones sin riesgo:** en los ajustes de avisos, un valor que no sea booleano apaga el interruptor (igual que en el resto de secciones) y un objeto de sección mal formado se ignora. Un recordatorio atado a un archivo no sigue al archivo si lo renombras (solo se pierde el vínculo; el recordatorio sigue).
- **Riesgos aceptados (sin cambios):** aviso moderado de `minimatch` vía `archiver`, bloqueo por IP abusable 15 min, contraseñas cortas antiguas válidas hasta que se cambien, push sin probar en móviles reales. Las horas de los avisos usan la zona de la app (`APP_TZ`, Europe/Madrid): quien use la web desde otra zona verá los avisos a la hora de Madrid.

## Duodécima auditoría (11-11-2026): Bases con fórmulas, relaciones y vistas nuevas

Revisado: autorización entre usuarios en todas las rutas de Bases (otro usuario recibe 404 en lectura, edición, borrado, exportación y comprobación de fórmulas; no se puede relacionar con una base ajena), cuerpos raros y claves `__proto__`/`constructor`, fórmulas (sin `eval`; ciclos, potencias enormes, textos que crecen, fechas imposibles, anidado), rendimiento con 5000 filas (lectura ~100 ms, edición ~30 ms), XSS en todas las vistas y editores (nombres, opciones, títulos y resultados con HTML), rutas de archivo (`..` rechazado) y el barrido de rutas de todo el servidor.

Encontrado y corregido:
- **Importar una base grande fallaba con 413**: el límite general de 100 kB del servidor se aplicaba antes que el de la ruta (8 MB). Ahora `/api/bases/import` admite 8 MB y el resto de `/api/bases` 2 MB.
- **Fórmulas con varios niveles se rechazaban** («demasiados niveles») con solo tres funciones anidadas; el límite de profundidad cuenta ahora el anidado real (unos 18 niveles).

Sin riesgo: la fórmula escrita con muchos paréntesis se rechaza por longitud antes de analizarse; un cuerpo de 600 kB se acepta pero los nombres se recortan a su máximo (comportamiento ya existente). Riesgos aceptados sin cambios: los de la auditoría anterior (minimatch vía archiver, bloqueo por IP, contraseñas antiguas cortas, push sin probar en móviles reales).

## Decimotercera auditoría (11-11-2026): dependencias y fuzz de todas las rutas

- **npm audit: 0 vulnerabilidades.** La de `minimatch` (denegación de servicio por amplificación) venía de `readdir-glob`, usado por `archiver` al hacer ZIP de carpetas. Se fuerza `minimatch ^11.0.8` solo dentro de `readdir-glob` (`overrides` en `package.json`), sin cambiar `archiver`.
- **Fuzz de las 337 rutas** (8.000 peticiones como administrador y otras tantas como usuario normal: ids raros, `..`, byte nulo, `?path[]=`, cuerpos con objetos, `__proto__`, textos de 100 kB). Servidor vivo al final y ya sin errores 500 propios. Corregido:
  - `?path=%00` y `?path[]=a` daban 500 en Archivos, vistas previas, texto, Office, EXIF, uso de disco y metadatos de foto: ahora 400 (la validación está en `lib/rutas.js`, para todas las rutas que resuelven archivos, incluido WebDAV).
  - `POST /api/sharelinks` y `/api/uploadlinks` con `path` como objeto: ahora 4xx.
  - `/api/export/__proto__` y `/api/game/arcade/__proto__` daban 500 (se buscaba la clave en un objeto normal): ahora 404 (`Object.hasOwn`).
- Comprobado sin hallazgos: cabeceras (CSP, nosniff, X-Frame-Options, no-referrer), cookie `HttpOnly` y `SameSite=Strict`, bloqueo de intentos de inicio de sesión (429 a partir del sexto), ningún archivo interno servido (`/server.js`, `/.git/config`, `users.json`, `/lib/*` devuelven solo la página de la app), sin secretos en el repositorio (`.env.example` es solo plantilla).
- Pendiente de valor bajo: añadir `Permissions-Policy` (cámara y ubicación solo para la propia app) y HSTS en nginx; no es un fallo.

## Decimocuarta auditoría (11-11-2026): bloques de Notas, repetición de Recordatorios y librerías vendidas

- **Librerías de `public/vendor/` fuera del alcance de `npm audit`:** KaTeX 0.16.11 y Mermaid 11.4.1 (recién añadidas) arrastraban 10 avisos (8 altos). Pasan a KaTeX 0.19.1 y Mermaid 12.3.0 (0 avisos). Al vendorizar una librería hay que auditarla en una carpeta aparte (`npm i <lib> && npm audit`), porque no está en `package.json`.
- **Bloques ricos de Notas, contra XSS:** una nota con `<img onerror>` y `<script>` en un desplegable, `::embed javascript:…`, un PDF de otro dominio, `\href{javascript:…}`/`\url{…}` en KaTeX y `click … href "javascript:…"` en Mermaid no ejecuta nada (0 diálogos, 0 elementos inyectados, 0 errores). Mermaid va en modo `strict`, KaTeX con `trust: false`; los incrustados solo admiten YouTube (youtube-nocookie.com), coordenadas y PDF propio, y lo demás sale como «Contenido no admitido».
- **Bloques sincronizados:** sin sesión 401; un usuario normal no puede leer, editar ni borrar los de otro (404 y su lista sale vacía); ids raros (`__proto__`, `%00`, `..`, 5.000 caracteres) 404; cuerpos con tipos raros, `__proto__` o 30 kB → 400 o aceptados sin efecto.
- **Dos fallos corregidos en Recordatorios:**
  - Una fecha final imposible en la repetición (`2099-13-45`) daba 500: ahora 400.
  - «Deshacer» con una fecha mal formada borraba la fecha del recordatorio (200): ahora 400 y no toca nada.
- **Un fallo de datos en Notas:** un bloque sincronizado editado justo antes de abrir otra nota podía no llegar a guardarse; ahora se guarda al cambiar de nota (`NB.flush`) y al cerrar la pestaña.
- Pendiente de valor bajo: Mermaid pesa 5,3 MB (solo se descarga si una nota tiene un diagrama).

## Decimoquinta auditoría (11-11-2026): repaso completo tras la 14

- Rutas regeneradas (342, con las de bloques sincronizados): sin sesión solo responden las públicas de siempre; un usuario normal no entra en ninguna ruta de administración (solo `diskusage` y `shares/users`, ya revisadas). Fuzz de 8.199 peticiones como administrador y como usuario normal: ningún 500 (quedan los 501 por falta de `COMFY_URL` y la búsqueda de juegos sin clave, esperados) y el servidor sigue vivo; el registro del servidor no tiene ningún `TypeError`, `ReferenceError` ni promesa sin capturar.
- **Denegación de servicio por expresiones regulares:** el lector de bloques de las notas y el contador del servidor con líneas de 2 MB (`:::toggle` con espacios, `$$` sin cerrar, `::embed` larguísimo, 200.000 `::toc`, 500.000 vallas) tardan 1-51 ms; las repeticiones (20.000 saltos de «primer lunes», o un recordatorio muy atrasado) 0-87 ms.
- ESLint sin avisos en los archivos nuevos y `npm audit` a 0. Sin hallazgos nuevos.

## Decimosexta auditoría (12-11-2026): toda la app, con foco en Enlaces, Buscar/IA, Importar y Documentos

- **Rutas regeneradas (385)** sin arrancar el servidor (lista sacada del enrutador de Express). Sin sesión solo responden las públicas de siempre; un usuario normal solo entra en `diskusage` y `shares/users` (ya revisadas). Fuzz de 9.702 peticiones como administrador (ids raros, `..`, `%00`, `path[]`, cuerpos con objetos, `__proto__`, 100 kB) y otras 1.424 con claves del prototipo (`__proto__`, `constructor`, `toString`, `hasOwnProperty`) en todos los campos habituales. Servidor vivo y registro sin `TypeError`/`ReferenceError`. Recorrido de las 27 vistas en móvil y escritorio: sin errores de consola propios ni desbordes.
- **Claves del prototipo como valores (corregido):** `plantilla: "__proto__"` daba 500 en Bases y Código, y en Documentos creaba un archivo **sin título ni texto** (invisible, pero ocupando sitio); `/api/ia/proveedores/__proto__/modelos` daba 502. Causa común: tablas de búsqueda (`PLANTILLAS[x]`, `POR_ID[x]`…) que son objetos normales y heredan `constructor`, `toString`, `__proto__`. Ahora las 16 tablas que se consultan con un valor que llega de fuera no tienen prototipo (`Object.create(null)`): plantillas de Bases, Código y Documentos, proveedores de IA, regiones de festivos, frecuencias de Pagos, orígenes del calendario y de «Enviar a», juegos arcade, tipos de iconos de Marcadores, avisos del PDF, entidades HTML y tipos MIME de los importadores, nombres de origen de Importar, tipos de recordatorio antiguos y datos del análisis.
- **Denegación de servicio por expresiones regulares (corregido, grave):** el saneado de Documentos y el conversor HTML → Markdown de Importar usaban expresiones que vuelven atrás. Un documento de 60 kB con `<a "<a "<a "…` tardaba 3 s en guardarse (uno de 1,5 MB, minutos, con el servidor bloqueado para todos); en Importar, miles de `<aside`, `<img`, `<table`, `<en-crypt` o `<span` sin cerrar, o un texto con 500.000 espacios, igual. Ahora hay un lector de HTML lineal propio (`lib/html-tokens.js`: `tokens`, `atributos`, `bloques`, `etiquetas`, `recorta`) que usan `lib/documentos/sanear.js`, `lib/importar/html-md.js`, `carpeta.js`, `enex.js` y `docx.js`: 1,6 MB de esos casos se procesan en 50-230 ms. Pruebas de humo nuevas con entradas así (deben tardar menos de 4-5 s).
- **Memoria en Importar (corregido):** cualquier usuario podía lanzar a la vez varios análisis de 100 MB (hasta 300 MB descomprimidos cada uno) y dejar el servidor sin memoria. Ahora hay como mucho **2 análisis a la vez** en todo el servidor y un tope de **600 MB** para lo que espera confirmación; si no hay hueco, responde 503 con «espera un minuto».
- **Documentos, arrastrar y soltar (corregido):** el HTML soltado desde otra página entraba sin pasar por el saneado del cliente (el servidor lo limpiaba al guardar, pero mientras tanto estaba en la página). Ahora soltar usa el mismo saneado que pegar; mover texto dentro del propio documento sigue funcionando igual.
- Comprobado sin hallazgos: un usuario no puede leer, cambiar, borrar ni exportar documentos de otro (404), ni usar el análisis de importación de otro (404), ni encontrar lo ajeno en Buscar; el HTML guardado no conserva `script`, `on*`, `javascript:`, `iframe`, `img` ni `url()` en estilos; los ZIP de Importar no escriben fuera de su sitio (`..`) ni copian svg/html/js; `npm audit` a 0 y librerías de `public/vendor/` sin cambios desde la 14.
- Pendiente de valor bajo: el análisis de Importar es síncrono (un ZIP grande ocupa la CPU unos segundos); si se nota, pasarlo a un `worker_thread`. Las bases se crean con un recuento previo fuera de la cola, así que dos importaciones simultáneas podrían pasar una base por encima del máximo (60).
