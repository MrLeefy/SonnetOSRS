# Bundles src/*.js into one self-contained dist/index.html
import os
ORDER = ['font_data','core','gfx','gl','items','world','game','ai','models','uiicons','ui','input','sound','main']
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
js = []
for n in ORDER:
    p = os.path.join(root,'src',n+'.js')
    if os.path.exists(p): js.append('/* ---- %s.js ---- */\n' % n + open(p).read())
html = '''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RuneScape - Grand Exchange PvP (2007)</title>
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden;-webkit-user-select:none;user-select:none}
#wrap{position:absolute;left:0;top:0;transform-origin:0 0;width:765px;height:503px;background:#000}
canvas{position:absolute;image-rendering:pixelated;image-rendering:crisp-edges}
</style></head><body>
<div id="wrap"><canvas id="gl" width="512" height="334" style="left:4px;top:4px"></canvas><canvas id="ui" width="765" height="503" style="left:0;top:0"></canvas></div>
<script>
''' + '\n'.join(js) + '''
</script></body></html>'''
os.makedirs(os.path.join(root,'dist'),exist_ok=True)
open(os.path.join(root,'dist','index.html'),'w').write(html)
# GitHub Pages serves the branch's docs/ folder, so keep a copy there too
os.makedirs(os.path.join(root,'docs'),exist_ok=True)
open(os.path.join(root,'docs','index.html'),'w').write(html)
print('dist/index.html and docs/index.html', len(html)//1024, 'KB')
