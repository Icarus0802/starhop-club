"""Package only reviewed project roots; no local saves, Git data or controls."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parent.parent
output = root / 'release-package'
output.mkdir(exist_ok=True)
files = ['index.html', 'style.css', 'LICENSE', 'THIRD_PARTY.md', 'README.md',
         'CHANGELOG.md', 'package.json', 'server.cjs', '启动跳棋.cmd', '启动服务.ps1',
         '.nojekyll', '.gitignore', '.gitattributes']
for directory in ['assets', 'js', 'tests', 'benchmarks', 'docs', 'scripts', 'vendor']:
    files += [p.relative_to(root).as_posix() for p in (root / directory).rglob('*')
              if p.is_file() and '__pycache__' not in p.parts]
with zipfile.ZipFile(output / 'source.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sorted(files):
        p = root / name
        if p.is_symlink():
            raise RuntimeError('Symlinks are not packaged')
        info = zipfile.ZipInfo(name, (2026, 10, 10, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        data = p.read_bytes()
        if p.suffix != '.png':
            data = data.replace(b'\r\n', b'\n')
        archive.writestr(info, data)
digest = hashlib.sha256((output / 'source.zip').read_bytes()).hexdigest()
(output / 'source.sha256').write_text(digest + '  source.zip\n', encoding='utf-8')
print(f'{len(files)} files; SHA256 {digest}')
