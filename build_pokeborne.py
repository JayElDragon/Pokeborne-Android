"""Build the Pokeborne Android APK.  Run: python build_pokeborne.py

Game files come from src/site (pokeborne-main-web mirror of play.pokeborne.fun, build in src/site/version.json).
Port files: port/android_port.js + android_port.css (native flag, on-screen controls), android/ (WebView activity, manifest).
Output: "Pokeborne.apk" next to this script. Signing key: android/pokeborne.keystore (keep it).
"""
from pathlib import Path
import json, os, re, secrets, shutil, subprocess, zipfile

ROOT = Path(__file__).resolve().parent
SITE = ROOT / 'src/site'
GAME_VERSION = json.loads((SITE / 'version.json').read_text(encoding='utf-8'))['v'].split('+')[0]
VERSION_CODE, VERSION_NAME = '7', GAME_VERSION + '-android7'
OUT = ROOT / 'Pokeborne.apk'
sdk = Path(os.environ.get('ANDROID_SDK_ROOT') or r'C:\Users\user\AppData\Local\Android\Sdk')
jdk = Path(os.environ.get('JAVA_HOME_17') or r'C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot')
bt = sdk / 'build-tools/36.0.0'
aj = sdk / 'platforms/android-35/android.jar'
for p in [bt / 'aapt2.exe', aj, jdk / 'bin/javac.exe']:
    if not p.is_file():
        raise SystemExit(f'Missing build tool: {p}')

build = ROOT / 'work-build'
shutil.rmtree(build, ignore_errors=True)
classes = build / 'classes'
classes.mkdir(parents=True)


def run(cmd):
    subprocess.run([str(x) for x in cmd], check=True)


# Launcher icons from the game's own PWA icon.
from PIL import Image
res = build / 'res'
icon = Image.open(SITE / 'icons/pb-icon-512.png').convert('RGBA')
for d, size in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    (res / f'mipmap-{d}').mkdir(parents=True)
    icon.resize((size, size), Image.LANCZOS).save(res / f'mipmap-{d}/ic_launcher.png')

run([bt / 'aapt2.exe', 'compile', '--dir', res, '-o', build / 'res.zip'])
run([bt / 'aapt2.exe', 'link', '-o', build / 'resources.apk', '-I', aj, '--manifest', ROOT / 'android/AndroidManifest.xml',
     build / 'res.zip', '--min-sdk-version', '26', '--target-sdk-version', '35',
     '--version-code', VERSION_CODE, '--version-name', VERSION_NAME])
run([jdk / 'bin/javac.exe', '-nowarn', '-source', '11', '-target', '11', '-encoding', 'UTF-8', '-cp', aj, '-d', classes,
     *(ROOT / 'android/src').rglob('*.java')])
run([jdk / 'bin/java.exe', '-cp', bt / 'lib/d8.jar', 'com.android.tools.r8.D8', '--release', '--min-api', '26',
     '--lib', aj, '--output', build, *classes.rglob('*.class')])

# index.html: port script first; Google Fonts css -> local copy (same rewrite mirror.py does when serving).
index = (SITE / 'index.html').read_text(encoding='utf-8')
head = '<meta charset="utf-8">'
assert index.count(head) == 1
index = index.replace(head, head + '\n<script src="./android_port.js"></script>')
pre = '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
assert index.count(pre) == 1
index = index.replace(pre, '')
fonts = re.findall(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]+">', index)
assert len(fonts) == 1, fonts
index = index.replace(fonts[0], '<link rel="stylesheet" href="./_ext/fonts.css">')
assert 'googleapis' not in index
assert index.count('</head>') == 1
index = index.replace('</head>', '<link rel="stylesheet" href="./android_port.css">\n</head>')
css_files = list((SITE / '_ext/fonts.googleapis.com').glob('css2.*'))
assert len(css_files) == 1, css_files
fonts_css = re.sub(r'https://(fonts\.gstatic\.com)/', r'/_ext/\1/', css_files[0].read_text(encoding='utf-8'))
for u in re.findall(r'url\((/_ext/[^)]+)\)', fonts_css):
    assert (SITE / u.lstrip('/')).is_file(), 'font missing: ' + u

# Touch stick: the game reached full speed at 55% of the stick travel (too twitchy). New curve: 15% dead
# zone, full speed at 92%, eased (power 1.4) so small moves walk slowly; sprint only at the very edge.
STICK_PATCHES = [
    ('a=i<.12?0:Math.min(1,(i-.12)/(.55-.12))', 'a=i<.15?0:Math.pow(Math.min(1,(i-.15)/(.92-.15)),1.4)'),
    ('i>=.9?A.fullT', 'i>=.97?A.fullT'),
    # Main attack button label: ATK (user request) instead of the translated COUP/HIT.
    ('[`light`,o(`COUP`),`big`]', '[`light`,`ATK`,`big`]'),
]
INPUT_JS = next((SITE / 'assets').glob('input-*.js'))
input_js = INPUT_JS.read_text(encoding='utf-8')
for old, new in STICK_PATCHES:
    assert input_js.count(old) == 1, old
    input_js = input_js.replace(old, new)

# Render resolution cap: 2x by default, lowered by android_port.js in 120 Hz mode (window.__pbMaxPR).
old = 'var Pl=Math.min(devicePixelRatio,2);'
RENDER_JS = next(f for f in sorted((SITE / 'assets').glob('render-*.js')) if old in f.read_text(encoding='utf-8'))
render_js = RENDER_JS.read_text(encoding='utf-8')
assert render_js.count(old) == 1, old
render_js = render_js.replace(old, 'var Pl=Math.min(devicePixelRatio,window.__pbMaxPR||2);')
# 120 Hz mode also keeps a minimum quality tier (window.__pbMinPalier, 2 by default; see android_port.js).
for a, b2 in [('function Gl(e){let t=zl.palier;', 'function Gl(e){e=Math.max(e,window.__pbMinPalier||0);let t=zl.palier;'),
              ('t!==zl.palier&&Gl(t)', '(t!==zl.palier||window.__pbMinPalier)&&Gl(t)')]:
    assert render_js.count(a) == 1, a
    render_js = render_js.replace(a, b2)

COMPRESS = {'.js', '.json', '.html', '.css', '.webmanifest', '.ttf', '.bin'}
SKIP = {SITE / 'index.html', SITE / 'sw.js', INPUT_JS, RENDER_JS}
with zipfile.ZipFile(build / 'resources.apk') as zi, zipfile.ZipFile(build / 'unsigned.apk', 'w') as zo:
    for info in zi.infolist():
        zo.writestr(info, zi.read(info.filename))
    zo.write(build / 'classes.dex', 'classes.dex', compress_type=zipfile.ZIP_DEFLATED)
    zo.writestr('assets/www/index.html', index, compress_type=zipfile.ZIP_DEFLATED)
    zo.writestr('assets/www/assets/' + INPUT_JS.name, input_js, compress_type=zipfile.ZIP_DEFLATED)
    zo.writestr('assets/www/assets/' + RENDER_JS.name, render_js, compress_type=zipfile.ZIP_DEFLATED)
    zo.writestr('assets/www/_ext/fonts.css', fonts_css, compress_type=zipfile.ZIP_DEFLATED)
    zo.write(ROOT / 'port/android_port.js', 'assets/www/android_port.js', compress_type=zipfile.ZIP_DEFLATED)
    zo.write(ROOT / 'port/android_port.css', 'assets/www/android_port.css', compress_type=zipfile.ZIP_DEFLATED)
    n = 0
    for f in sorted(SITE.rglob('*')):
        if not f.is_file() or f in SKIP:
            continue
        rel = f.relative_to(SITE).as_posix()
        kind = zipfile.ZIP_DEFLATED if f.suffix.lower() in COMPRESS else zipfile.ZIP_STORED
        zo.write(f, 'assets/www/' + rel, compress_type=kind)
        n += 1
print('game files:', n)

run([bt / 'zipalign.exe', '-p', '-f', '4', build / 'unsigned.apk', build / 'aligned.apk'])
ks = ROOT / 'android/pokeborne.keystore'
props = ROOT / 'android/keystore.properties'
if ks.exists() and not props.exists():
    raise SystemExit('Keystore exists but keystore.properties is missing.')
if ks.exists():
    password = next(l.split('=', 1)[1] for l in props.read_text(encoding='utf-8').splitlines() if l.startswith('storePassword='))
else:
    password = secrets.token_urlsafe(24)
    props.write_text('storePassword=' + password + '\n', encoding='utf-8')
pw = build / 'pw.tmp'
try:
    pw.write_text(password + '\n' + password + '\n', encoding='utf-8')
    if not ks.exists():
        run([jdk / 'bin/keytool.exe', '-genkeypair', '-keystore', ks, '-alias', 'pokeborne', '-keyalg', 'RSA', '-keysize', '2048',
             '-validity', '10000', '-storepass:file', pw, '-keypass:file', pw, '-dname', 'CN=JayElDragon Android port'])
    run([jdk / 'bin/java.exe', '-jar', bt / 'lib/apksigner.jar', 'sign', '--ks', ks, '--ks-key-alias', 'pokeborne',
         '--ks-pass', 'file:' + str(pw), '--key-pass', 'file:' + str(pw), '--out', OUT, build / 'aligned.apk'])
finally:
    pw.unlink(missing_ok=True)
run([jdk / 'bin/java.exe', '-jar', bt / 'lib/apksigner.jar', 'verify', OUT])
for tmp in ['unsigned.apk', 'aligned.apk']:
    (build / tmp).unlink(missing_ok=True)
print('APK ready:', OUT, f'({OUT.stat().st_size / 1e6:.0f} MB)')
