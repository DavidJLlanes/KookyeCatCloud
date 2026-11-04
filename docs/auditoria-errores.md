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
