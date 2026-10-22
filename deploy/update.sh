#!/usr/bin/env bash
# Actualiza KookyeCatCloud desde GitHub de forma segura.
#
#   sudo bash deploy/update.sh            actualiza si hay algo nuevo
#   sudo bash deploy/update.sh --check    solo dice si hay actualización, sin tocar nada
#
# Qué hace (y en este orden):
#   1. Mira si hay commits nuevos en origin/main. Si no, no hace nada.
#   2. Se niega a actualizar si hay cambios locales sin guardar o la historia no avanza en línea recta.
#   3. Aplica los cambios con "git merge --ff-only" (nunca fusiones ni reescrituras).
#   4. Si cambió package.json o package-lock.json, ejecuta "npm ci --omit=dev".
#   5. Comprueba la sintaxis de todo el código antes de reiniciar.
#   6. Reinicia el servicio y espera a que responda.
#   7. Si algo falla en los pasos 4-6, VUELVE a la versión anterior y reinicia con ella.
#
# Para pausar las actualizaciones automáticas:   touch /ruta/de/la/app/.no-autoupdate
# Variables opcionales (en el entorno o en un drop-in de systemd):
#   APP_DIR SERVICE APP_USER BRANCH REMOTE HEALTH_URL NOTIFY_CMD
#   NOTIFY_CMD recibe el mensaje por la entrada estándar, p. ej.:  NOTIFY_CMD='mail -s KookyeCatCloud tu@correo.es'
set -uo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE="${SERVICE:-kookyecatcloud}"
APP_USER="${APP_USER:-filecloud}"
BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
MODO="${1:-}"
ENV_FILE="$APP_DIR/.env"
LOCK="${LOCK_DIR:-/tmp/kookyecat-update.lock}"

log() { echo "[$(date '+%F %T')] $*"; }
notifica() {
  log "$*"
  if [ -n "${NOTIFY_CMD:-}" ]; then printf '%s\n' "$*" | bash -c "$NOTIFY_CMD" >/dev/null 2>&1 || true; fi
}
git_() { command git -C "$APP_DIR" -c "safe.directory=$APP_DIR" "$@"; }
leer_env() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d "\"'\r" || true; }

# Dirección que se comprueba tras reiniciar: /api/version es pública y no toca datos
PORT_APP="$(leer_env PORT)"; BASE_APP="$(leer_env BASE_PATH)"
BASE_APP="${BASE_APP#/}"; BASE_APP="${BASE_APP%/}"; [ -n "$BASE_APP" ] && BASE_APP="/$BASE_APP"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT_APP:-4000}${BASE_APP}/api/version}"

# Ganchos sustituibles (así el script se puede probar sin systemd)
NPM_CMD="${NPM_CMD:-npm}"
CHECK_CMD="${CHECK_CMD:-$NPM_CMD run check --silent}"
RESTART_CMD="${RESTART_CMD:-systemctl restart $SERVICE}"
HEALTH_CMD="${HEALTH_CMD:-curl -fsS --max-time 4 -o /dev/null $HEALTH_URL}"
CHOWN_CMD="${CHOWN_CMD:-chown -R $APP_USER:$APP_USER $APP_DIR}"
ESPERA="${ESPERA:-30}"

[ -e "$APP_DIR/.no-autoupdate" ] && { log "Actualizaciones en pausa (existe .no-autoupdate)"; exit 0; }

# Una sola ejecución a la vez
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null; mkdir "$LOCK" 2>/dev/null || exit 0
  else log "Ya hay otra actualización en marcha"; exit 0; fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

git_ rev-parse --git-dir >/dev/null 2>&1 || { log "ERROR: $APP_DIR no es un repositorio git"; exit 1; }
git_ fetch --quiet "$REMOTE" "$BRANCH" || { log "ERROR: no se pudo contactar con $REMOTE (¿sin conexión?)"; exit 1; }

ANTES="$(git_ rev-parse HEAD)"
NUEVO="$(git_ rev-parse "$REMOTE/$BRANCH")"
if [ "$ANTES" = "$NUEVO" ]; then log "Sin cambios: ya estás en $(git_ rev-parse --short HEAD)"; exit 0; fi

N="$(git_ rev-list --count "$ANTES..$NUEVO")"
if [ "$MODO" = "--check" ]; then log "Hay actualización: $N commit(s) nuevos ($(git_ rev-parse --short "$ANTES") -> $(git_ rev-parse --short "$NUEVO"))"; git_ log --oneline "$ANTES..$NUEVO"; exit 0; fi

if ! git_ merge-base --is-ancestor "$ANTES" "$NUEVO"; then notifica "NO se actualiza: la historia local y la de $REMOTE/$BRANCH han divergido"; exit 1; fi
if ! git_ diff --quiet HEAD; then notifica "NO se actualiza: hay cambios locales sin guardar en archivos del repositorio"; exit 1; fi

CAMBIOS="$(git_ diff --name-only "$ANTES" "$NUEVO")"
DEPS=0; echo "$CAMBIOS" | grep -qE '^package(-lock)?\.json$' && DEPS=1

espera_sano() { local i=0; while [ "$i" -lt "$ESPERA" ]; do if bash -c "$HEALTH_CMD" >/dev/null 2>&1; then return 0; fi; sleep 1; i=$((i + 1)); done; return 1; }

vuelve_atras() {
  log "Volviendo a la versión anterior $(git_ rev-parse --short "$ANTES")…"
  git_ reset --hard --quiet "$ANTES"
  if [ "$DEPS" = 1 ]; then (cd "$APP_DIR" && $NPM_CMD ci --omit=dev --silent) || log "AVISO: no se pudieron restaurar las dependencias"; fi
  bash -c "$CHOWN_CMD" >/dev/null 2>&1 || true
  bash -c "$RESTART_CMD" || true
  if espera_sano; then notifica "Actualización FALLIDA ($1). Se ha vuelto a $(git_ rev-parse --short "$ANTES") y el servicio responde."
  else notifica "Actualización FALLIDA ($1) y el servicio NO responde tras volver atrás: revisa 'journalctl -u $SERVICE'."; fi
  exit 1
}

log "Actualizando $(git_ rev-parse --short "$ANTES") -> $(git_ rev-parse --short "$NUEVO") ($N commit(s))"
git_ merge --ff-only --quiet "$NUEVO" || { notifica "NO se actualiza: git no pudo avanzar en línea recta"; exit 1; }

if [ "$DEPS" = 1 ]; then
  log "Cambiaron las dependencias: npm ci --omit=dev"
  (cd "$APP_DIR" && $NPM_CMD ci --omit=dev --silent) || vuelve_atras "npm ci falló"
fi
(cd "$APP_DIR" && bash -c "$CHECK_CMD") || vuelve_atras "el código nuevo no pasa la comprobación de sintaxis"
bash -c "$CHOWN_CMD" >/dev/null 2>&1 || true

log "Reiniciando $SERVICE…"
bash -c "$RESTART_CMD" || vuelve_atras "no se pudo reiniciar el servicio"
espera_sano || vuelve_atras "el servicio no respondió tras reiniciar"

RESUMEN="$(git_ log --oneline "$ANTES..$NUEVO" | head -5 | sed 's/^/  - /')"
notifica "KookyeCatCloud actualizado a $(git_ rev-parse --short "$NUEVO") ($N commit(s)):
$RESUMEN"
exit 0
