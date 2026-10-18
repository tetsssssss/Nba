#!/usr/bin/env python3
"""Fetch published, working Fase9+CP1 files for an independent Android APK build."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import quote
import json, hashlib, time

BASE = 'https://glittery-dasik-6b139f.netlify.app/'
ROOT = Path(__file__).resolve().parents[1]
WWW = ROOT / 'app/src/main/assets/www'
WWW.mkdir(parents=True, exist_ok=True)

def fetch(path):
    # Reject traversal or accidental remote origins.
    if '..' in Path(path).parts or path.startswith('/'):
        raise ValueError(path)
    url = BASE + quote(path, safe='/.-_')
    last_error = None
    for trial in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'NBAUniverseAndroidRebuild/1.0'}), timeout=25) as response:
                if response.status != 200: raise OSError(f'{path}: HTTP {response.status}')
                data = response.read()
                if not data: raise ValueError(f'{path} vazio')
                file = WWW / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(data)
                return data
        except Exception as err:
            last_error = err
            time.sleep(1 + trial)
    raise RuntimeError(f'Falha ao obter {path}: {last_error}')

manifest = json.loads(fetch('offline-assets.json'))
assert manifest['version'] == 'nuv-management-20261018-r7-cp1-mobile', 'A versão no Netlify mudou. Verifique antes de construir.'
paths = set(manifest['files'])
paths.update(['index.html','manifest.webmanifest','sw.js','offline-assets.json'])
paths.update([
    'src/match/moves/action-state.js','src/match/moves/catalog.js',
    'src/match/moves/executor.js','src/match/moves/pose.js',
    'src/match/moves/rules.js','src/match/moves/selector.js',
    'src/match/moves/transition.js'
])
for idx, path in enumerate(sorted(paths), 1):
    if path != 'offline-assets.json':
        fetch(path)
    if idx % 40 == 0: print(f'{idx}/{len(paths)} arquivos baixados')

pwa = WWW / 'src/pwa/install.js'
text = pwa.read_text(encoding='utf-8')
needle = "if ('serviceWorker' in navigator && window.isSecureContext) {"
assert text.count(needle) == 1
text = text.replace(needle, "if (!/NBAUniverseAndroid\\//.test(navigator.userAgent) && 'serviceWorker' in navigator && window.isSecureContext) {")
pwa.write_text(text, encoding='utf-8')

icon = WWW / 'assets/icons/nba-universe-512.png'
icon_dst = ROOT / 'app/src/main/res/drawable/ic_launcher.png'
icon_dst.parent.mkdir(parents=True, exist_ok=True)
icon_dst.write_bytes(icon.read_bytes())
assert 'src/main.js' in paths and (WWW/'src/main.js').is_file()
assert (WWW/'index.html').read_text(encoding='utf8').find('NBA Universe Manager') >= 0
print('Recursos Web incluídos:', len([p for p in WWW.rglob('*') if p.is_file()]))
print('Versão:', manifest['version'])
print('SHA256 index:', hashlib.sha256((WWW/'index.html').read_bytes()).hexdigest())
