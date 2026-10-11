"""Stage the already-tested Windows release; no AI source is rebuilt or replaced."""
from pathlib import Path
import hashlib, zipfile, shutil
from PIL import Image, ImageDraw

here = Path(__file__).resolve().parent
root = here.parent
archive = root/'release-package/2.2.0/Starhop-Club-2.2.0-Windows-x64.zip'
expected = '854dbc43d18cf95df77d0824d1c83bee14007c28b32f64f6655a9e544d49ebde'
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise SystemExit('Windows payload differs from the verified 2.2 release')
payload = here/'payload'
assert payload.resolve().parent == here.resolve() and payload.name == 'payload'
if payload.exists(): shutil.rmtree(payload)
payload.mkdir(exist_ok=True)
with zipfile.ZipFile(archive) as z:
    for entry in z.infolist():
        dest = (payload/entry.filename).resolve()
        if not dest.is_relative_to(payload.resolve()):
            raise SystemExit('Unsafe archive member')
    z.extractall(payload)
# Match assets/icon.svg exactly; ICO is generated for the Windows shell.
im = Image.new('RGBA', (256,256))
d = ImageDraw.Draw(im)
d.rounded_rectangle((0,0,255,255), radius=72, fill='#242831')
d.polygon([(x*4,y*4) for x,y in [(32,9),(38,26),(55,32),(38,38),(32,55),(26,38),(9,32),(26,26)]], fill='#cfb487')
d.ellipse((108,108,148,148), fill='#eee8df')
im.save(here/'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('Verified release payload and desktop icon are ready.')
