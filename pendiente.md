# Pendiente

Ideas y tareas por hacer en KookyeCatCloud. Marca con `[x]` lo que se vaya completando.

## Recomendaciones (orden de prioridad)

### Para hacer ya
- [ ] Probar en el móvil real: desplazamiento de ventanas, barra inferior grande, bloqueo de zoom (también en el mapa), foto de contacto y actualización en directo.
- [ ] Copia de seguridad automática de `DATA_DIR`, `users.json`, `.jwt-secret`, `shares.json` y `passkeys.json` (cron nocturno con `rsync` o `restic` a otro servidor).
- [ ] Revisar el Nginx de `patineteleon.es`: nombre de servidor duplicado (`conflicting server name`).

### Pronto
- [ ] Contactos: etiquetar varios a la vez (el borrado en bloque ya está hecho), fusión de duplicados y cumpleaños en el calendario.
- [ ] Importar los contactos reales desde Google Contacts o iCloud (`.vcf`) y comprobar etiquetas y fotos.
- [ ] Extender las actualizaciones en directo (SSE) a notas, prompts y contactos.
- [ ] Cuota de almacenamiento por usuario con aviso y límite.

### Más adelante
- [ ] SQLite, solo si hay decenas de miles de contactos o prompts (decidido: no migrar de momento).
- [ ] Pruebas automáticas de la API (crear, importar, borrar, permisos).
- [ ] Monitorizar el servicio `kookyecatcloud` con un chequeo externo (por ejemplo UptimeRobot).
- [ ] Prompts: las miniaturas del editor no abren el lightbox.

## Ideas de funcionalidades

### Archivos
- [ ] Versiones de archivo: guardar las últimas N versiones al sobrescribir y poder restaurarlas.
- [ ] Enlaces públicos más completos: caducidad, contraseña, límite de descargas y aviso de descarga.
- [ ] Detección de duplicados por hash, con opción de liberar espacio.
- [ ] Búsqueda en el contenido de notas, textos y PDFs, no solo por nombre.
- [ ] Vista previa de más formatos: PDF, Markdown, audio, vídeo con miniaturas y documentos Office.

### Fotos y galería
- [x] ~~Línea de tiempo por fecha EXIF y mapa si las fotos tienen GPS.~~ Hecho: Colecciones → Línea de tiempo (filtros por año, cámara y ubicación); el mapa ya existía.
- [x] ~~Álbumes inteligentes por cámara, año o ubicación.~~ Hecho: Colecciones → Inteligentes (el lugar se agrupa por coordenadas, sin nombre de ciudad).
- [x] ~~Descarga de álbumes en ZIP y álbumes compartibles con enlace.~~ Hecho: botones ZIP y Compartir en cada álbum.

### Contactos
- [ ] Fusión de duplicados. (Selección múltiple y borrado en bloque: hecho.)
- [ ] Cumpleaños en el calendario con recordatorio.
- [ ] Historial por contacto: notas, archivos vinculados y fecha del último contacto.
- [ ] Enlace de "mi tarjeta": página pública del contacto con código QR.

### Prompts
- [x] ~~Colecciones y versiones de un prompt, para comparar su evolución.~~ Hecho: las listas ya existían; ahora se pueden comparar versiones con las diferencias marcadas.
- [x] ~~Importar metadatos de ComfyUI directamente desde el PNG (workflow, seed, modelo).~~ Hecho (también Automatic1111/Forge): menú ⋯ → Crear desde imágenes.
- [x] ~~Plantillas con variables, por ejemplo `{sujeto}` y `{estilo}`, que rellenan el texto.~~ Ya existía con `{{variable}}` (valor por defecto, listas, texto largo, número y fecha).
- [x] ~~Estadísticas: modelos y herramientas más usados, prompts favoritos.~~ Hecho: menú ⋯ → Estadísticas.
- [x] ~~Prompts de cualquier tipo: mensaje de sistema, fragmentos, resultados con valoración y comparación, cadenas, plantillas, tokens, vistas guardadas, parecidos, exportar, compartir y envío a ComfyUI.~~ Hecho: ver «Prompts que no son de imagen» en el README.

### Gamificación
- [x] ~~Experiencia gamificada: logros por número de elementos y tiempo de uso, niveles, racha, retos semanales y cosméticos.~~ Hecho: pestaña Logros.
- [x] ~~Tetris con potenciadores ligados al progreso y tarjeta para compartir.~~ Hecho: pestaña Tetris.
- [ ] Ranking entre los usuarios de la instancia (de momento todo es personal).
- [x] ~~Sonidos y música en el Tetris.~~ Hecho: 3 pistas CC0 de FreePD (cambian con el nivel) y efectos sintetizados con Web Audio; botones de música y efectos y volumen, guardados en el navegador.

### Productividad
- [x] ~~Recordatorios y tareas vinculados a notas o contactos.~~ Hecho: botón Recordar en notas y Recordatorio en contactos (varios por elemento, con o sin fecha).
- [x] ~~Papelera con vaciado programado.~~ Hecho: días por usuario en Papelera y barrido en segundo plano (`TRASH_SWEEP_HOURS`).
- [x] ~~Portapapeles compartido entre dispositivos, con envío rápido de texto o archivos del móvil al PC.~~ Hecho: pestaña Portapapeles con aviso en directo.
- [x] ~~Compartir desde el móvil: que la PWA aparezca en el menú "Compartir" de Android para subir contenido.~~ Hecho (solo Android/Chrome; en iPhone, Atajos con token).

### Seguridad y administración
- [ ] Cuotas por usuario con avisos.
- [ ] Registro de actividad con filtros y alertas de inicios de sesión raros.
- [ ] Copias de seguridad desde la propia app: exportar todo en ZIP o programar copia a otro servidor.
- [ ] 2FA con TOTP, además de las passkeys.

### Tiempo real
- [ ] Actualizaciones en directo para notas, prompts y contactos.
- [ ] Edición colaborativa de notas entre usuarios.

## Prioridad sugerida
1. Copias de seguridad desde la propia app.
2. ~~Compartir desde el móvil.~~ Hecho.
3. ~~Importar metadatos de ComfyUI en prompts.~~ Hecho.
