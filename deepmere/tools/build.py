# Bundles deepmere/src into one self-contained deepmere/index.html (no install, no network needed to play).
# Pass --artifact <path> to also write a head-less page fragment for hosts that supply their own <html> skeleton.
import os, sys
ORDER = ['core', 'world', 'render', 'game', 'ui', 'main']
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = lambda n: open(os.path.join(root, 'src', n), encoding='utf-8').read()
js = '\n'.join('/* ---- %s.js ---- */\n%s' % (n, src(n + '.js')) for n in ORDER)
head = '''<title>Deepmere</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;700&display=swap">
<style>
[hidden]{display:none!important}
''' + src('style.css') + '</style>\n'
page = head + src('body.html') + '<script>\n' + js + '\n</script>\n'
full = '''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#14161b">
<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px);box-sizing:border-box;height:100%}</style>
''' + head + '</head><body>\n' + src('body.html') + '<script>\n' + js + '\n</script>\n</body></html>\n'
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(full)
print('index.html', len(full) // 1024, 'KB')
if '--artifact' in sys.argv:
    out = sys.argv[sys.argv.index('--artifact') + 1]
    open(out, 'w', encoding='utf-8').write(page)
    print(out, len(page) // 1024, 'KB')
