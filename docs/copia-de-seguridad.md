# Copia de seguridad y restauración (VPS Ubuntu)

Rutas de esta instalación:

- Aplicación: `/var/www/djl.com.es/cloud/`
- Servicio: `kookyecatcloud` (usuario `filecloud`, puerto 4010)
- Copias: `/var/backups/kookyecatcloud/<fecha>/`

## 1. Antes de la primera copia: averigua `DATA_DIR`

Es la carpeta con los archivos, fotos, notas, calendario, prompts, contactos, Código, Bases, versiones y caja fuerte.

```bash
sudo systemctl cat kookyecatcloud | grep -i -E "data_dir|EnvironmentFile"
sudo grep -s "^DATA_DIR" /var/www/djl.com.es/cloud/.env
```

Si no aparece nada, usa el valor por defecto: `/data/storage`.

## 2. Hacer la copia

Cambia `DATA` si tu `DATA_DIR` es otra ruta. Para el servicio unos segundos para que los JSON no cambien durante la copia.

```bash
sudo bash -c '
set -e
APP=/var/www/djl.com.es/cloud
DATA=/data/storage
B=/var/backups/kookyecatcloud/$(date +%F_%H%M)
mkdir -p "$B"
systemctl stop kookyecatcloud
trap "systemctl start kookyecatcloud" EXIT
tar czf "$B/app.tar.gz" --exclude=.thumbs -C "$(dirname $APP)" "$(basename $APP)"
tar cf  "$B/datos.tar"  -C "$(dirname $DATA)" "$(basename $DATA)"
cp -a /etc/systemd/system/kookyecatcloud.service "$B/" 2>/dev/null || true
cp -a /etc/nginx/sites-available "$B/nginx-sites-available" 2>/dev/null || true
chmod -R go-rwx "$B"
sha256sum "$B"/* > "$B/SHA256SUMS" 2>/dev/null || true
echo "Copia lista en $B"; ls -lh "$B"
'
```

- `app.tar.gz`: el código, `node_modules`, `users.json`, `shares.json`, `passkeys.json`, `ical-tokens.json`, `.jwt-secret`, `.env`.
- `datos.tar`: todo `DATA_DIR` (sin comprimir, porque fotos y vídeos ya lo están).
- La copia contiene contraseñas hasheadas y secretos: no la subas a ningún sitio sin cifrar.

Comprobar que la copia se lee bien:

```bash
sudo tar tzf /var/backups/kookyecatcloud/<fecha>/app.tar.gz | head
sudo tar tf  /var/backups/kookyecatcloud/<fecha>/datos.tar  | head
```

## 3. Restaurar (si algo sale mal)

Sustituye `<fecha>` por la carpeta de la copia (`ls /var/backups/kookyecatcloud/`).

```bash
sudo bash -c '
set -e
B=/var/backups/kookyecatcloud/<fecha>
APP=/var/www/djl.com.es/cloud
DATA=/data/storage
systemctl stop kookyecatcloud

# Guarda lo que haya ahora por si acaso
mv "$APP" "$APP.roto.$(date +%s)"
mv "$DATA" "$DATA.roto.$(date +%s)" 2>/dev/null || true

tar xzf "$B/app.tar.gz" -C "$(dirname $APP)"
tar xf  "$B/datos.tar"  -C "$(dirname $DATA)"

chown -R filecloud:filecloud "$APP" "$DATA"
systemctl start kookyecatcloud
sleep 3
systemctl status kookyecatcloud --no-pager | head -8
'
```

Comprobar:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4010/cloud/
sudo journalctl -u kookyecatcloud -n 20 --no-pager
```

Debe dar `200` (o la redirección al login) y el log debe decir que escucha en el puerto 4010.

Cuando confirmes que todo funciona, borra las carpetas `*.roto.*` para recuperar espacio.

### Restaurar solo una parte

- **Solo el código** (por ejemplo, tras un despliegue fallido): `git -C /var/www/djl.com.es/cloud checkout <commit>` y `sudo systemctl restart kookyecatcloud`. Los datos no se tocan.
- **Solo un archivo de configuración** (por ejemplo `users.json`):
  `sudo tar xzf <copia>/app.tar.gz -C /tmp cloud/users.json` y cópialo a su sitio con `chown filecloud:filecloud`.
- **Solo una carpeta de datos** (por ejemplo `.notes`): extráela con `tar xf datos.tar -C /tmp storage/.notes` y cópiala sobre `DATA_DIR/.notes` con el servicio parado.

## 4. Si no arranca tras restaurar

1. `sudo journalctl -u kookyecatcloud -n 50 --no-pager`
2. Error `ENOENT` con `public/index.html`: la carpeta `public/` está incompleta; restáurala con `git -C /var/www/djl.com.es/cloud checkout -- public`.
3. Errores de permisos: repite el `chown -R filecloud:filecloud` del paso de restauración.
4. Falta `node_modules`: `cd /var/www/djl.com.es/cloud && sudo -u filecloud npm ci --omit=dev`.

## 5. Buenas prácticas

- Haz la copia **antes de cada despliegue** y una vez a la semana.
- Guarda una copia **fuera del VPS** (tu PC o un almacenamiento externo), cifrada:
  `rsync -avz usuario@vps:/var/backups/kookyecatcloud/ ./copias-kcc/`
- Conserva las últimas 3–4 copias:
  `ls -1dt /var/backups/kookyecatcloud/*/ | tail -n +5 | sudo xargs -r rm -rf`
