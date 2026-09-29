# Builds bitmap font atlases (per-glyph, no antialiasing, integer advances) -> src/font_data.js
from PIL import Image, ImageDraw, ImageFont
import json, base64, io, sys

FONTS = {
  # name: (path, size, extra_advance, weight)
  'p11': ('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', 11, 0),
  'b12': ('/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf', 12, 0),
  'q8':  ('/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf', 9, 0),
  'q16': ('/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf', 15, 0),
}
CW, CH, BASE = 20, 24, 17   # cell size and baseline row inside cell
out = {}
for name,(path,size,extra) in FONTS.items():
    f = ImageFont.truetype(path, size)
    n = 95
    cols = 32
    rows = (n + cols - 1)//cols
    atlas = Image.new('L', (cols*CW, rows*CH), 0)
    d = ImageDraw.Draw(atlas); d.fontmode = '1'
    adv = []
    for i in range(n):
        ch = chr(32+i)
        cx, cy = (i%cols)*CW, (i//cols)*CH
        d.text((cx+3, cy+BASE), ch, font=f, fill=255, anchor='ls')
        a = f.getlength(ch)
        adv.append(int(round(a)) + extra)
    # threshold
    atlas = atlas.point(lambda v: 255 if v>127 else 0)
    # measure vertical metrics
    asc, desc = f.getmetrics()
    rgba = Image.new('RGBA', atlas.size, (255,255,255,0)); rgba.putalpha(atlas)
    buf = io.BytesIO(); rgba.save(buf, 'PNG')
    out[name] = {'cw':CW,'ch':CH,'base':BASE,'cols':cols,'adv':adv,'asc':asc,'desc':desc,'size':size,
                 'png':'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode()}
    atlas.save(f'/tmp/font_{name}.png')
js = 'const FONT_DATA = ' + json.dumps(out) + ';\n'
open('src/font_data.js','w').write(js)
print({k:(v['adv'][:20],v['asc'],v['desc']) for k,v in out.items()})
