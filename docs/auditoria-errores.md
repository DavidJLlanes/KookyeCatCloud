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
