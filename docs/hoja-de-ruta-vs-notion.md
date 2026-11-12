# Qué tiene Notion que KookyeCatCloud no tiene (solo uso personal)

Comparación hecha el 11-11-2026, pensando en una sola persona: no incluye nada de colaboración, equipos, permisos ni comentarios.
Está basada en el conocimiento general de Notion, sin verificar con fuentes recientes. Lo que ya existe aquí se indica entre paréntesis.

## Prioridad alta

4. **Recortador web.** Extensión del navegador que guarda una página entera, limpia, en la nube propia (Marcadores solo guarda el enlace).

## Prioridad media

6. ~~**Importadores**~~ **Hecho (12-11-2026):** Notion, Evernote, Google Docs, Apple Notes y CSV con asignación de columnas (pestaña *Importar*).
7. **Historial de versiones por nota** con restauración (hoy hay versiones de archivos de texto y un salvavidas en las notas).
8. **Publicar una nota como página web** propia (hoy hay enlaces compartidos).
9. **Automatizaciones sencillas:** «al pasar una tarea a Hecha, crea otra la semana que viene», «al vencer un pago, crea un recordatorio».
10. **Uso sin conexión real:** guardar los datos en el dispositivo para editar sin red (hoy la PWA solo guarda la interfaz).

## Lo que KookyeCatCloud tiene y Notion no

Todo en servidor propio y en archivos JSON legibles, gestor de archivos con WebDAV, caja fuerte cifrada, Pagos, Compra, Prompts con versiones, Código, Juegos y gamificación, avisos push sin cuota, y ninguna dependencia de un servicio externo.

## Orden sugerido

Primero (4) y (6).

## Ya hecho

- (3) Notas con más bloques, 11-11-2026: desplegables, columnas, índice automático, ecuaciones KaTeX, diagramas Mermaid, incrustados (YouTube, mapa con el Leaflet de la app, PDF), una base dentro de la nota y bloques sincronizados (módulo propio).
- (5) Plantillas, 11-11-2026: plantillas de fila en Bases (con fechas relativas) y bloque «Botón» en notas que crea una nota o una fila desde una plantilla.
- (5, parte) Repetición en Recordatorios, 11-11-2026: diaria, semanal (con días), mensual (día del mes o «el primer lunes»), anual, cada N y fecha final; avisos con botones «Hecho» y «Posponer 1 h».
- (1, parte) Bases, 11-11-2026 (tarde): relaciones de doble sentido, agrupar la tabla, fila de totales y arrastrar filas; en Notas, bloques anidados en columnas y vista elegible de una base; en Pagos, gráfico anual y documentos adjuntos.
- Compartir, 11-11-2026 (tarde): enlaces cortos `/cloud/<12 caracteres>`, caducidad configurable y QR en PNG.
- (1) Bases más potentes, 11-11-2026: calendario, galería y línea de tiempo, relaciones, resúmenes, fórmulas, tipos nuevos, cambio de tipo y filtros/órdenes múltiples. La numeración de arriba se mantiene.
- (2, parte) Búsqueda y respuestas, 12-11-2026: búsqueda global sin IA (índice BM25 sobre todos los módulos y archivos de texto) y capa de IA opcional con tu propia clave (OpenAI, Anthropic, Google, OpenRouter con modelos gratis, OpenCode Zen, Groq, Mistral, DeepSeek, xAI, Ollama y APIs compatibles) para preguntar con fuentes citadas y resumir fichas. Queda: búsqueda semántica con embeddings, rellenar campos solos, transcribir reuniones, respuesta en streaming y buscar dentro de PDF y Office.
