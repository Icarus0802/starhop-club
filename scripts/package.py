"""Reproducible source, browser and Windows portable archives. No user data."""
from pathlib import Path
import argparse, hashlib, json, zipfile
root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
output = root / 'release-package'
output.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--node', type=Path, help='Reviewed Windows x64 node.exe')
parser.add_argument('--native', action='store_true', help='Include verified local Kata runtime')
args = parser.parse_args()
def tree(directory):
    return {p.relative_to(root).as_posix(): p for p in (root / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts}
def archive(name, files):
    target = output / name
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, p in sorted(files.items()):
            if p.is_symlink(): raise RuntimeError('Symlinks are not packaged')
            info = zipfile.ZipInfo(name, (2026, 10, 11, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, p.read_bytes()) # Exact engine bytes are part of acceptance.
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    (output / (target.name + '.sha256')).write_text(digest + '  ' + target.name + '\n', encoding='utf-8')
    print(f'{target.name}: {len(files)} files, {target.stat().st_size:,} bytes, SHA256 {digest}')
base = {n: root / n for n in ['index.html','style.css','style-board.css','LICENSE','THIRD_PARTY.md','README.md','开始使用.txt']}
for d in ['assets', 'js', 'docs', 'vendor']: base.update(tree(d))
archive(f'Starhop-Club-{version}-Browser.zip', base)
source = dict(base)
for n in ['CHANGELOG.md','package.json','server.cjs','启动跳棋.cmd','退出跳棋.cmd','启动服务.ps1','.nojekyll','.gitignore','.gitattributes']: source[n] = root / n
for d in ['tests','benchmarks','docs','scripts','vendor','.github']: source.update(tree(d))
archive('source.zip', source)
(output / 'source.sha256').write_text((output / 'source.zip.sha256').read_text(), encoding='utf-8')
if args.node:
    portable = dict(base)
    for n in ['package.json','server.cjs','启动跳棋.cmd','退出跳棋.cmd','scripts/launch.cjs','scripts/native-ai-server.cjs','benchmarks/kata-native.cjs']: portable[n] = root / n
    portable.update(tree('vendor'))
    portable.update(tree('docs/benchmarks/kata-acceptance-20261011'))
    portable['runtime/node.exe'] = args.node.resolve(strict=True)
    if args.native:
        protocol = json.loads((root / 'docs/benchmarks/kata-acceptance-20261011/protocol.json').read_text())
        for n in ['benchmarks/kata-native.cjs','js/fast-search.js']:
            if hashlib.sha256((root/n).read_bytes()).hexdigest() != protocol['sha256'][n]: raise RuntimeError('Accepted search mismatch: ' + n)
        for item in protocol['nativeFiles']:
            n = 'arena-results/external-kata/runtime/' + item['file']
            if hashlib.sha256((root/n).read_bytes()).hexdigest() != item['sha256']: raise RuntimeError('Native mismatch: ' + n)
            portable[n] = root / n
    archive(f'Starhop-Club-{version}-Windows-x64.zip', portable)
