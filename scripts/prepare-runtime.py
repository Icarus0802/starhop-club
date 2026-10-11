"""Fetch official redistributables for release builds; verify before packaging."""
from pathlib import Path
import hashlib, json, urllib.request, zipfile, shutil

root = Path(__file__).resolve().parent.parent
cache = root / 'arena-results' / 'release-downloads'
cache.mkdir(parents=True, exist_ok=True)
def download(url, target):
    request = urllib.request.Request(url, headers={'User-Agent':'Starhop-Release/2.0'})
    with urllib.request.urlopen(request, timeout=120) as response, target.open('wb') as out:
        shutil.copyfileobj(response, out)

version = '24.21.0'
nodebase = f'https://nodejs.org/dist/v{version}/'
download(nodebase + 'SHASUMS256.txt', cache / 'SHASUMS256.txt')
download(nodebase + 'win-x64/node.exe', cache / 'node.exe')
checks = dict(line.split()[::-1] for line in (cache / 'SHASUMS256.txt').read_text().splitlines())
if hashlib.sha256((cache/'node.exe').read_bytes()).hexdigest() != checks['win-x64/node.exe']:
    raise RuntimeError('Official Node checksum mismatch')

download('https://github.com/hzyhhzy/KataGomo_fork/releases/download/20240406/Kata_TiaoQi_20220313.zip', cache / 'kata.zip')
protocol = json.loads((root/'docs/release-manifest.json').read_text())
runtime = root / 'arena-results/current-challenge/runtime'
runtime.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(cache/'kata.zip') as archive:
    for item in protocol['nativeFiles']:
        matches = [n for n in archive.namelist() if n.rsplit('/',1)[-1] == item['file']]
        valid = []
        for name in matches:
            data = archive.read(name)
            if hashlib.sha256(data).hexdigest() == item['sha256']:
                valid.append(data)
        if not valid: raise RuntimeError('Official engine hash mismatch: ' + item['file'])
        (runtime / item['file']).write_bytes(valid[0])
print('Verified Node and accepted native engine files ready.')
