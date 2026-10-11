"""Build curated source/browser/Windows archives without user data or experiments."""
from pathlib import Path
import argparse, hashlib, json, subprocess, zipfile
root = Path(__file__).resolve().parent.parent
version = json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
p = argparse.ArgumentParser()
p.add_argument('--node', type=Path)
p.add_argument('--native', action='store_true')
p.add_argument('--output', type=Path, default=root/'release-package'/version)
p.add_argument('--list-only', action='store_true')
a=p.parse_args(); output=a.output.resolve(); output.mkdir(parents=True,exist_ok=True)
def tree(directory):
    return {x.relative_to(root).as_posix():x for x in (root/directory).rglob('*') if x.is_file() and not x.is_symlink() and '__pycache__' not in x.parts}
def named(names):
    return {n:root/n for n in names}
def archive(name,files):
    target=output/name
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for n,f in sorted(files.items()):
            if f.is_symlink(): raise RuntimeError('Symlink: '+n)
            info=zipfile.ZipInfo(n,(2026,10,11,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,f.read_bytes())
    h=hashlib.sha256(target.read_bytes()).hexdigest()
    (output/(name+'.sha256')).write_text(h+'  '+name+'\n',encoding='utf-8')
    print(json.dumps({'archive':name,'files':len(files),'bytes':target.stat().st_size,'sha256':h}))
base=named(['index.html','style.css','style-board.css','style-themes.css','LICENSE','ATTRIBUTION.md','THIRD_PARTY.md','README.md','开始使用.txt','docs/LICENSING_SCOPE.json','docs/RELEASE_NOTES.md','docs/VALIDATION.md','docs/release-verification.json'])
base.update(tree('js')); base.update(tree('assets')); base.pop('assets/starhop-strategist.webp',None)
base.update(tree('vendor/upstream'))
if (root/'docs/screenshots/release-2.2.png').is_file(): base['docs/screenshots/release-2.2.png']=root/'docs/screenshots/release-2.2.png'
entries=['server.cjs','scripts/launch.cjs','scripts/build.cjs','scripts/arena.cjs','scripts/arena-native.cjs','scripts/assess-current-challenge.cjs','scripts/acceptance.cjs']
entries += [f.relative_to(root).as_posix() for f in (root/'tests').glob('*.test.cjs')]
code="console.log(JSON.stringify(Object.keys(require('./scripts/ai-fingerprint.cjs').fingerprint("+json.dumps(entries)+"))))"
deps=json.loads(subprocess.check_output(['node','-e',code],cwd=root,text=True,encoding='utf-8'))
source=dict(base); source.update(named(deps)); source.update(tree('tests')); source.update(tree('vendor'))
source.update(named(['CHANGELOG.md','package.json','启动跳棋.cmd','退出跳棋.cmd','启动服务.ps1','.nojekyll','.gitignore','.gitattributes','scripts/package.py','scripts/prepare-runtime.py','docs/release-manifest.json','docs/benchmarks/current-211-20261011/round-1-openings.json','docs/benchmarks/current-211-20261011/round-2-openings.json','.github/workflows/publish.yml']))
(output/'source-files.json').write_text(json.dumps(sorted(source),ensure_ascii=False,indent=2),encoding='utf-8')
if a.list_only: print('Source list:',len(source)); raise SystemExit()
archive(f'Starhop-Club-{version}-Browser.zip',base)
archive('source.zip',source)
if a.node:
    portable=dict(base); portable.update(tree('vendor'))
    portable.update(named(['package.json','server.cjs','启动跳棋.cmd','退出跳棋.cmd','scripts/launch.cjs','scripts/native-ai-server.cjs','scripts/ai-fingerprint.cjs','docs/release-manifest.json']))
    manifest=json.loads((root/'docs/release-manifest.json').read_text(encoding='utf-8'))
    for n,h in manifest['hashes'].items():
        if hashlib.sha256((root/n).read_bytes()).hexdigest()!=h: raise RuntimeError('Release source mismatch: '+n)
        portable[n]=root/n
    portable['runtime/node.exe']=a.node.resolve(strict=True)
    if a.native:
        for item in manifest['nativeFiles']:
            n='arena-results/current-challenge/runtime/'+item['file']; f=root/n
            if hashlib.sha256(f.read_bytes()).hexdigest()!=item['sha256']: raise RuntimeError('Native mismatch: '+n)
            portable[n]=f
    archive(f'Starhop-Club-{version}-Windows-x64.zip',portable)
