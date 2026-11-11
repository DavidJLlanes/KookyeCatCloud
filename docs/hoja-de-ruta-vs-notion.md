# Qué tiene Notion que KookyeCatCloud no tiene (solo uso personal)

Comparación hecha el 11-11-2026, pensando en una sola persona: no incluye nada de colaboración, equipos, permisos ni comentarios.
Está basada en el conocimiento general de Notion, sin verificar con fuentes recientes. Lo que ya existe aquí se indica entre paréntesis.

## Prioridad alta

1. **Bases de datos más potentes.** Ya hay tabla, tablero Kanban, filtro y orden (`lib/bases/`, `public/js/bases.js`). Falta:
   - Vistas de **calendario**, **galería** y **línea de tiempo**.
   - **Relaciones** entre bases (un libro enlazado a su autor) y **resúmenes** sobre las filas relacionadas.
   - **Fórmulas**.
   - Más tipos de columna: correo, teléfono, selección múltiple, archivo; y poder **cambiar el tipo** de una columna ya creada.
   - Filtros y ordenaciones guardados por vista, más de uno a la vez.
2. **Búsqueda y respuestas sobre todo lo propio (equivalente a Notion AI).** Preguntar «¿qué apunté sobre el VPS?» y recibir la respuesta, resumir notas largas, rellenar campos solos, transcribir reuniones. Se puede empezar por una búsqueda semántica propia.
3. **Notas con más bloques.** Ya hay bloques, carpetas, tablas, imágenes y enlaces internos. Falta:
   - Columnas, desplegables (toggles) e índice automático.
   - Ecuaciones LaTeX y diagramas Mermaid.
   - Incrustados (YouTube, mapas, PDF).
   - Bloques sincronizados y mostrar una base dentro de una nota.
4. **Recortador web.** Extensión del navegador que guarda una página entera, limpia, en la nube propia (Marcadores solo guarda el enlace).
5. **Plantillas y repetición.** Plantillas de fila y de nota con botones («Nueva reunión» con su estructura) y **recordatorios y tareas recurrentes** (diario, semanal, el primer lunes del mes…).

## Prioridad media

6. **Importadores:** desde Notion, Evernote, Google Docs, Apple Notes y CSV con asignación de columnas (hoy solo JSON propio y vCard).
7. **Historial de versiones por nota** con restauración (hoy hay versiones de archivos de texto y un salvavidas en las notas).
8. **Publicar una nota como página web** propia (hoy hay enlaces compartidos).
9. **Automatizaciones sencillas:** «al pasar una tarea a Hecha, crea otra la semana que viene», «al vencer un pago, crea un recordatorio».
10. **Uso sin conexión real:** guardar los datos en el dispositivo para editar sin red (hoy la PWA solo guarda la interfaz).

## Lo que KookyeCatCloud tiene y Notion no

Todo en servidor propio y en archivos JSON legibles, gestor de archivos con WebDAV, caja fuerte cifrada, Pagos, Compra, Prompts con versiones, Código, Juegos y gamificación, avisos push sin cuota, y ninguna dependencia de un servicio externo.

## Orden sugerido

Primero (1) y (5): vistas de calendario y galería con relaciones entre Bases, y repetición en Recordatorios. Son lo que más se usaría a diario y encajan con la estructura actual. Después (3), (4) y (6).
