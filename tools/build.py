"""Build the deterministic standalone game. Required modules never silently skip."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
ORDER = ['font_data','core','gfx','gl','items','world','game','ai','models','uiicons','ui','input','sound','engine_ext','expedition','profiles','classic','client','controls','polish','classic_presenter','main']
HEAD = '''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#342d21"><title>SonnetOSRS - Classic Client</title>
<style>html,body{margin:0;width:100%;height:100%;background:#342d21;overflow:hidden;user-select:none}#wrap{position:absolute;left:0;top:0;transform-origin:0 0;width:765px;height:503px}canvas{position:absolute;image-rendering:pixelated}</style></head><body>
<div id="wrap"><canvas id="gl" width="512" height="334" style="left:4px;top:4px;width:512px;height:334px"></canvas><canvas id="ui" width="765" height="503" style="left:0;top:0"></canvas></div>
'''
def build():
    modules = ['/* ---- %s.js ---- */\n' % name + (ROOT / 'src' / (name + '.js')).read_text(encoding='utf-8') for name in ORDER]
    code = '\n'.join(modules).replace('</script', '<\\/script')
    out = ROOT / 'dist'; out.mkdir(exist_ok=True)
    (out / 'index.html').write_text(HEAD + '<script>\n' + code + '\n</script></body></html>\n', encoding='utf-8')
    dev = HEAD + '\n'.join('<script src="src/%s.js"></script>' % n for n in ORDER) + '\n</body></html>\n'
    for name in ['dev.html','index.html']:
        (ROOT / name).write_text(dev, encoding='utf-8')
    print('Built dist/index.html:', (out/'index.html').stat().st_size, 'bytes; modules:', len(ORDER))
if __name__ == '__main__':
    build()
