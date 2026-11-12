#!/usr/bin/env python3
# Mueve scripts del cliente (public/js) y actualiza todas sus menciones: index.html y demás páginas, sw.js (SHELL),
# pruebas y documentación. Uso: python3 scripts/herramientas/mueve-cliente.py mapa.json
# mapa.json = { "kit.js": "nucleo/kit.js", … } (rutas relativas a public/js). El orden de carga no cambia: solo la ruta.
import json, os, re, subprocess, sys
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
mapa = json.load(open(sys.argv[1]))
for a, b in mapa.items():
    origen, destino = os.path.join(RAIZ, 'public/js', a), os.path.join(RAIZ, 'public/js', b)
    assert os.path.exists(origen), origen
    assert not os.path.exists(destino), destino
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    subprocess.check_call(['git', 'mv', origen, destino], cwd=RAIZ)
textos = []
for base, dirs, files in os.walk(RAIZ):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'vendor', 'docs')]
    for f in files:
        if f.endswith(('.html', '.js', '.md', '.json')) and 'huella' not in f: textos.append(os.path.join(base, f))
cambios = 0
for f in textos:
    s = open(f, encoding='utf-8').read(); antes = s
    for a, b in sorted(mapa.items(), key=lambda x: -len(x[0])):
        s = re.sub(r'(?<![\w.-])(/js/|public/js/|js/)' + re.escape(a) + r'(?![\w-])', lambda m: m.group(1) + b, s)
    if s != antes: open(f, 'w', encoding='utf-8').write(s); cambios += 1
print(f'{len(mapa)} movidos, {cambios} archivos actualizados')
