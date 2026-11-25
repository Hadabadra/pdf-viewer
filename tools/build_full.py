#!/usr/bin/env python3
"""גרסה מלאה של הצופה: מודל כתב היד (משקפת) ארוז בתוך התוסף, בלי הורדה ראשונה.
שימוש: python3 tools/build_full.py <plugin-file.otzplugin> <mishkefet-v1.bin> <out.otzplugin>
המודל נדחס ב-gzip ונשמר כ-vendor/mishkefet-model/mk.<n>.js (base64, ~0.9MB לקובץ);
js/mishkefet.js מזהה את window.__MK_EMBED__ וטוען אותו לפני ניסיון הורדה.
גדול מ-50MB ולכן לא נשלח לחנות — רק כקובץ ב-Release."""
import base64, gzip, sys, zipfile

src, model, out = sys.argv[1:4]
raw = open(model, 'rb').read()
b64 = base64.b64encode(gzip.compress(raw, 9, mtime=0)).decode()
CH = 900_000
chunks = [b64[i:i + CH] for i in range(0, len(b64), CH)]
with zipfile.ZipFile(src) as zi, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zo:
    for it in zi.infolist():
        data = zi.read(it.filename)
        if it.filename == 'index.html':
            tag = '<script src="vendor/mishkefet-embedded.js"></script>'
            html = data.decode('utf-8')
            assert '</head>' in html
            data = html.replace('</head>', '  ' + tag + '\n</head>', 1).encode('utf-8')
        zo.writestr(it, data)
    zo.writestr('vendor/mishkefet-embedded.js', '/* גרסה מלאה: מודל כתב היד ארוז בתוסף */\nwindow.__MK_EMBED__ = { n: %d };\n' % len(chunks))
    for k, c in enumerate(chunks):
        zo.writestr('vendor/mishkefet-model/mk.%d.js' % k, '(window.__MK_CHUNKS__=window.__MK_CHUNKS__||{})[%d]="%s";\n' % (k, c))
print('chunks', len(chunks), 'out', out)
