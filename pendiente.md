# Pendiente

Ideas y tareas por hacer en KookyeCatCloud. Marca con `[x]` lo que se vaya completando.

## Recomendaciones (orden de prioridad)

### Para hacer ya
- [ ] Probar en el móvil real: desplazamiento de ventanas, barra inferior grande, bloqueo de zoom (también en el mapa), foto de contacto y actualización en directo.
- [ ] Copia de seguridad automática de `DATA_DIR`, `users.json`, `.jwt-secret`, `shares.json` y `passkeys.json` (cron nocturno con `rsync` o `restic` a otro servidor).
- [ ] Revisar el Nginx de `patineteleon.es`: nombre de servidor duplicado (`conflicting server name`).

### Pronto
- [ ] Contactos: selección múltiple (borrar o etiquetar varios), fusión de duplicados y cumpleaños en el calendario.
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
- [ ] Línea de tiempo por fecha EXIF y mapa si las fotos tienen GPS.
- [ ] Álbumes inteligentes por cámara, año o ubicación.
- [ ] Descarga de álbumes en ZIP y álbumes compartibles con enlace.

### Contactos
- [ ] Fusión de duplicados y selección múltiple.
- [ ] Cumpleaños en el calendario con recordatorio.
- [ ] Historial por contacto: notas, archivos vinculados y fecha del último contacto.
- [ ] Enlace de "mi tarjeta": página pública del contacto con código QR.

### Prompts
- [ ] Colecciones y versiones de un prompt, para comparar su evolución.
- [ ] Importar metadatos de ComfyUI directamente desde el PNG (workflow, seed, modelo).
- [ ] Plantillas con variables, por ejemplo `{sujeto}` y `{estilo}`, que rellenan el texto.
- [ ] Estadísticas: modelos y herramientas más usados, prompts favoritos.

### Productividad
- [ ] Recordatorios y tareas vinculados a notas o contactos.
- [ ] Papelera con vaciado programado.
- [ ] Portapapeles compartido entre dispositivos, con envío rápido de texto o archivos del móvil al PC.
- [ ] Compartir desde el móvil: que la PWA aparezca en el menú "Compartir" de Android para subir contenido.

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
2. Compartir desde el móvil.
3. Importar metadatos de ComfyUI en prompts.
