'use strict';
// Optional local raster QA. Does not launch a browser or validate gameplay.
// Requires the external /tmp renderer described in tools/render-ui-components.cjs.
const assert = require('node:assert/strict');
const { createRenderer, drawLayout } = require('../tools/render-ui-components.cjs');
function rgba(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
}
function colorCount(canvas) {
  const d = rgba(canvas), values = new Set();
  for (let i = 0; i < d.length; i += 4) values.add(`${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]}`);
  return values.size;
}
(async () => {
  const renderer = await createRenderer(), { api, Classic, Fonts, IC } = renderer;
  let count = 0;
  for (const name of ['p11', 'b12']) {
    assert.ok(Fonts[name].img.width > 0 && Fonts[name].img.height > 0, `${name}: embedded font decoded`);
    assert.equal(Fonts[name].adv.length, 95);
    count++;
  }
  for (const kind of ['stone', 'brown', 'paper']) {
    const texture = Classic.texture(kind);
    assert.equal(texture.width, 128); assert.equal(texture.height, 128);
    assert.ok(colorCount(texture) > 10, `${kind}: texture has real raster detail`);
    assert.equal(Classic.texture(kind), texture, `${kind}: cached texture`);
    count++;
  }
  for (const id of ['combat', 'stats', 'inv', 'equip', 'prayer', 'magic', 'heart', 'world']) {
    const glyph = Classic.icon(id), d = rgba(glyph);
    assert.equal(glyph.width, 36); assert.equal(glyph.height, 36);
    assert.ok(d.some((v, i) => i % 4 === 3 && v === 255), `${id}: visible icon pixels`);
    assert.ok(d.some((v, i) => i % 4 === 3 && v === 0), `${id}: transparent background`);
    assert.ok(colorCount(glyph) > 4, `${id}: original shaded artwork`);
    count++;
  }
  assert.equal(IC.tab_inv.width, 21); count++;
  const state = (selected, hover) => {
    const c = api.createCanvas(96, 48);
    Classic.stone(c.getContext('2d'), { x: 0, y: 0, w: 96, h: 48 }, selected, hover);
    return c.toBuffer('image/png');
  };
  assert.notDeepEqual(state(false, false), state(true, false), 'selected stone visibly changes');
  assert.notDeepEqual(state(false, false), state(false, true), 'hover stone visibly changes');
  count += 2;
  const ring = api.createCanvas(80, 80), rp = ring.getContext('2d');
  Classic.ring(rp, 40, 40, 34, 7);
  assert.equal(rp.getImageData(40, 40, 1, 1).data[3], 0, 'ring keeps center transparent');
  assert.ok(colorCount(ring) > 20, 'ring has actual lighting and texture'); count++;
  const glyph = api.createCanvas(300, 60), gp = glyph.getContext('2d');
  Classic.text(gp, 'OLDSKOOL 0123456789', 10, 30, 18, 0xe4d4b3, true);
  assert.ok(colorCount(glyph) > 2, 'Classic.text draws repository bitmap atlas'); count++;
  for (const [w, h, touch] of [[1440, 900, false], [390, 844, true], [844, 390, true], [320, 568, true]]) {
    const a = drawLayout(renderer, w, h, touch), b = drawLayout(renderer, w, h, touch);
    assert.equal(a.canvas.width, w); assert.equal(a.canvas.height, h);
    assert.deepEqual(a.canvas.toBuffer('image/png'), b.canvas.toBuffer('image/png'), `${w}x${h}: deterministic component fixture`);
    assert.ok(colorCount(a.canvas) > 150, `${w}x${h}: detailed source UI raster`);
    count++;
    console.log(`PASS UI-only component raster ${w}x${h}`);
  }
  console.log(`UI_ART_TESTS_PASSED=${count}`);
  console.log('Scope: Canvas 2D components only. No gameplay, browser CSS, or input verification.');
})().catch(error => { console.error(error); process.exitCode = 1; });
