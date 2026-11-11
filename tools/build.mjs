// Bundles src/ into one self-contained dist/index.html (no network needed at runtime).
//   node tools/build.mjs           one-off build
//   node tools/build.mjs --watch   rebuild on change
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const emit = {
  name: 'emit-html',
  setup(b) {
    b.onEnd(res => {
      if (res.errors.length || !res.outputFiles) return;
      const js = res.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
      const html = readFileSync(join(root, 'src/index.html'), 'utf8')
        .replace('/*CSS*/', () => readFileSync(join(root, 'src/style.css'), 'utf8'))
        .replace('/*JS*/', () => js);
      mkdirSync(join(root, 'dist'), { recursive: true });
      writeFileSync(join(root, 'dist/index.html'), html);
      console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} KB`);
    });
  }
};
const opts = { entryPoints: [join(root, 'src/main.js')], bundle: true, minify: true, format: 'iife', target: 'es2019', write: false, legalComments: 'none', plugins: [emit] };
if (process.argv.includes('--watch')) { const ctx = await context(opts); await ctx.watch(); console.log('watching src/ ...'); } else await build(opts);
