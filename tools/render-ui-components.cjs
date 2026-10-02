'use strict';
/**
 * UI-only raster QA, deliberately not a gameplay or browser screenshot.
 * Runs the real Classic/Pix/bitmap-font source in a local Canvas 2D VM.
 * No browser, server, sockets, source rewrites, or repository dependencies.
 *
 * One-time optional renderer installation (outside this repository):
 *   npm install --prefix /tmp/oldskool-ui-render --cache /tmp/oldskool-ui-render/npm-cache --no-audit --no-fund --ignore-scripts @napi-rs/canvas@0.1.80
 * Run:
 *   node tools/render-ui-components.cjs
 * Override the renderer location with OLDSKOOL_CANVAS_MODULE if needed.
 * Output: qa/ui-components-{desktop,phone,phone-landscape}.png and a JSON manifest.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sources = ['font_data', 'core', 'gfx', 'items', 'uiicons', 'classic', 'client'];
const disclaimer = 'UI-only component QA | no gameplay render';
const tabIds = ['combat', 'stats', 'quests', 'inv', 'equip', 'prayer', 'magic', 'clan', 'friends', 'ignore', 'logout', 'options', 'emotes', 'music'];
const iconIds = [...tabIds, 'heart', 'run', 'world', 'save', 'full', 'chat', 'bank', 'journal', 'menu', 'up', 'down'];

function loadCanvas() {
  const modulePath = process.env.OLDSKOOL_CANVAS_MODULE || '/tmp/oldskool-ui-render/node_modules/@napi-rs/canvas';
  try { return { api: require(modulePath), modulePath }; }
  catch (error) {
    throw new Error('UI-only renderer unavailable. Install @napi-rs/canvas outside the repository at /tmp/oldskool-ui-render, or set OLDSKOOL_CANVAS_MODULE. No browser fallback was attempted. ' + error.message);
  }
}

async function createRenderer() {
  const { api, modulePath } = loadCanvas();
  const sourceHashes = {};
  const context = vm.createContext({
    console,
    G: { player: { inv: ['dscim', 'dds', 'gmaul', 'ags', 'ancstaff', 'rcb', 'rhelm', 'rbody', 'rlegs', 'rboots', 'prayer', 'restore', 'brew', 'supstr', ...Array(14).fill('shark')].map(id => ({ id, n: 1 })) } },
    UI: { touchMode: true, drag: null },
    // Canvas creation is the entire DOM surface available to the real source.
    document: { createElement(tag) {
      if (tag !== 'canvas') throw new Error('UI-only renderer supports canvas elements only: ' + tag);
      return api.createCanvas(1, 1);
    } },
    __loadImage: api.loadImage
  });
  for (const name of sources) {
    const source = fs.readFileSync(path.join(root, 'src', name + '.js'), 'utf8');
    sourceHashes[name + '.js'] = crypto.createHash('sha256').update(source).digest('hex');
    vm.runInContext(source, context, { filename: 'src/' + name + '.js', timeout: 10000 });
  }
  // Decode the repository's embedded bitmap atlases, then use its original
  // tintedAtlas/textWidth/drawText path. No replacement typeface is involved.
  await vm.runInContext(`Promise.all(Object.entries(FONT_DATA).map(async ([name, data]) => {
    const img = await __loadImage(data.png);
    Fonts[name] = Object.assign({ img, tint: {} }, data);
  }))`, context);
  vm.runInContext('for (const name of TAB_NAMES) mkIcon("tab_" + name, 21, 21, TAB_FN[name]);', context);
  const { Classic, Fonts, IC, Client, ITEMS } = vm.runInContext('({Classic, Fonts, IC, Client, ITEMS})', context);
  for (const slot of context.G.player.inv) if (!ITEMS[slot.id]) throw new Error('Unknown QA item fixture: ' + slot.id);
  return { api, modulePath, context, Classic, Fonts, IC, Client, sourceHashes };
}

function label(p, text, x, y, size = 13, color = '#d9e1e7') {
  p.save(); p.font = size + 'px sans-serif'; p.fillStyle = color; p.fillText(text, x, y); p.restore();
}
function hatch(p, r) {
  p.save(); p.beginPath(); p.rect(r.x, r.y, r.w, r.h); p.clip();
  p.fillStyle = '#172127'; p.fillRect(r.x, r.y, r.w, r.h);
  p.strokeStyle = '#22323a'; p.lineWidth = 1;
  for (let x = r.x - r.h; x < r.x + r.w; x += 24) {
    p.beginPath(); p.moveTo(x, r.y); p.lineTo(x + r.h, r.y + r.h); p.stroke();
  }
  p.restore();
}
function icon(p, Classic, id, x, y, size) {
  p.imageSmoothingEnabled = false; p.drawImage(Classic.icon(id), x, y, size, size);
}

function drawLayout(renderer, width, height, touch) {
  const { api, Classic } = renderer;
  const c = api.createCanvas(width, height), p = c.getContext('2d');
  p.imageSmoothingEnabled = false;
  const L = Classic.layout(width, height, false, touch);
  Classic.background(p, L);
  hatch(p, L.world);
  const cx = L.world.x + L.world.w / 2, cy = L.world.y + L.world.h / 2;
  Classic.text(p, 'UI COMPONENT FIXTURE', cx, cy - 8, Math.min(18, Math.max(12, L.world.w / 30)), 0xc5d4dc, false, 'center');
  Classic.text(p, 'No gameplay render', cx, cy + 17, 12, 0x91a4ae, false, 'center');
  L.tabs.forEach((r, i) => {
    Classic.stone(p, r, i === 3, i === 5);
    // Match Client.draw's tab icon sizing; these are component states only.
    const size = Math.round(Math.min(r.w * .75, r.h * .78, 48));
    icon(p, Classic, tabIds[i], r.x + (r.w - size) / 2, r.y + (r.h - size) / 2, size);
  });
  // Show only the real ring component around a explicitly blank minimap.
  const T = L.mapTransform;
  p.save(); p.translate(T.x, T.y); p.scale(T.s, T.s);
  p.fillStyle = '#172127'; p.beginPath(); p.arc(124, 84, 73, 0, Math.PI * 2); p.fill();
  Classic.ring(p, 124, 84, 81, 8);
  Classic.text(p, 'NO MAP', 124, 88, 11, 0x9aadb7, false, 'center');
  for (const [i, id] of ['bank', 'stats', 'world'].entries()) {
    Classic.ring(p, 224, 39 + i * 50, 20, 4);
    icon(p, Classic, id, 212, 27 + i * 50, 24);
  }
  p.restore();
  // Exercise the real inventory painter with explicitly static art samples.
  renderer.Client.L = L; renderer.Client.pointer = null;
  renderer.Client.drawInventory(p);
  p.save(); p.beginPath(); p.rect(L.chat.x + 7, L.chat.y + 7, L.chat.w - 14, L.chat.h - 14); p.clip();
  Classic.text(p, 'Bitmap text sample: Welcome to OLDSKOOL', L.chat.x + 12, L.chat.y + Math.min(27, L.chat.h - 9), 12, 0x342511, false);
  if (L.chat.h > 70) {
    Classic.text(p, 'UI-only fixture. Static sample item artwork.', L.chat.x + 12, L.chat.y + 49, 12, 0x493519, false);
    Classic.text(p, 'No game state, chat or input is simulated.', L.chat.x + 12, L.chat.y + 69, 12, 0x493519, false);
  }
  p.restore();
  // Footer button component samples, not a claim about the mobile DOM dock.
  const buttons = touch ? ['Bag', 'Gear', 'Prayer', 'Magic', 'Run', 'Chat', 'Menu'] : ['All', 'Game', 'Public', 'Private', 'Clan', 'Trade', 'Report'];
  const r = L.channels, bw = r.w / buttons.length;
  buttons.forEach((name, i) => {
    const b = { x: r.x + bw * i, y: r.y, w: bw, h: r.h };
    Classic.stone(p, b, i === 0);
    Classic.text(p, name, b.x + bw / 2, b.y + b.h * .60, Math.min(12, bw / 4.5), 0xeadab8, true, 'center');
  });
  return { canvas: c, layout: L };
}

function drawComponents(renderer, p, x, y, availableWidth) {
  const { Classic, IC } = renderer;
  label(p, 'Actual procedural textures, stone states, frame and rings', x, y);
  const sw = Math.min(110, Math.floor((availableWidth - 40) / 4));
  for (const [i, kind] of ['stone', 'brown', 'paper'].entries()) {
    Classic.fill(p, { x: x + i * (sw + 10), y: y + 12, w: sw, h: 65 }, kind);
    Classic.frame(p, { x: x + i * (sw + 10), y: y + 12, w: sw, h: 65 }, 5);
    label(p, kind, x + i * (sw + 10), y + 93, 11);
  }
  const statesY = y + 116;
  ['default', 'selected', 'hover'].forEach((name, i) => {
    const r = { x: x + i * (sw + 10), y: statesY, w: sw, h: 44 };
    Classic.stone(p, r, i === 1, i === 2); Classic.text(p, name, r.x + sw / 2, r.y + 27, 12, 0xe9d8ad, true, 'center');
  });
  if (availableWidth >= 430) {
    Classic.ring(p, x + availableWidth - 46, y + 54, 34, 7);
    icon(p, Classic, 'heart', x + availableWidth - 64, y + 36, 36);
    Classic.ring(p, x + availableWidth - 46, y + 136, 22, 4);
    icon(p, Classic, 'prayer', x + availableWidth - 59, y + 123, 26);
  }
  const cols = Math.max(5, Math.floor(availableWidth / 70));
  const iy = y + 195;
  label(p, 'Original Classic icons (36px) and source bitmap fonts', x, iy);
  iconIds.forEach((id, i) => {
    const ix = x + (i % cols) * 70, py = iy + 13 + Math.floor(i / cols) * 64;
    icon(p, Classic, id, ix + 13, py, 36); label(p, id, ix, py + 49, 10, '#b3c0c8');
  });
  const fy = iy + 26 + Math.ceil(iconIds.length / cols) * 64;
  Classic.text(p, 'Plain 11: The quick brown fox 0123456789', x, fy, 11, 0xe4d4b3, true);
  Classic.text(p, 'Bold 12: OLDSKOOL interface', x, fy + 27, 12, 0xe4c77e, true, 'left', true);
  Classic.text(p, 'Scaled 18: Inventory and prayer', x, fy + 62, 18, 0xe4d4b3, true);
  label(p, 'Legacy source tab sprites, 2x nearest-neighbor', x, fy + 93, 11);
  for (let i = 0; i < tabIds.length; i++) p.drawImage(IC['tab_' + tabIds[i]], x + (i % cols) * 54, fy + 108 + Math.floor(i / cols) * 48, 42, 42);
  return fy + 110 + Math.ceil(tabIds.length / cols) * 48;
}

function renderSheets(renderer, outputDir = path.join(root, 'qa')) {
  fs.mkdirSync(outputDir, { recursive: true });
  const specs = [
    { name: 'desktop', w: 1440, h: 900, touch: false },
    { name: 'phone', w: 390, h: 844, touch: true },
    { name: 'phone-landscape', w: 844, h: 390, touch: true }
  ];
  const outputs = [];
  for (const spec of specs) {
    const rendered = drawLayout(renderer, spec.w, spec.h, spec.touch);
    const side = spec.w < 600;
    const width = side ? spec.w + 540 : spec.w + 32;
    const componentWidth = side ? 490 : spec.w;
    const componentX = side ? spec.w + 36 : 16;
    const componentY = side ? 100 : spec.h + 115;
    const cols = Math.max(5, Math.floor(componentWidth / 70));
    const componentHeight = 460 + Math.ceil(iconIds.length / cols) * 64 + Math.ceil(tabIds.length / cols) * 48;
    const height = Math.max(spec.h + 116, componentY + componentHeight);
    const sheet = renderer.api.createCanvas(width, height), p = sheet.getContext('2d');
    p.imageSmoothingEnabled = false; p.fillStyle = '#10171c'; p.fillRect(0, 0, width, height);
    label(p, disclaimer, 16, 29, 18, '#eff4f7');
    label(p, `${spec.name}: ${spec.w} x ${spec.h} CSS-pixel layout, ${spec.touch ? 'touch' : 'desktop'} flag; source canvas components at 1x`, 16, 52, 12);
    label(p, 'Does not verify WebGL, browser CSS, touch targets, pointer input, online state or playability.', 16, 72, 12, '#a2b4bf');
    p.drawImage(rendered.canvas, 16, 92);
    drawComponents(renderer, p, componentX, componentY, componentWidth);
    const filename = 'ui-components-' + spec.name + '.png';
    const buffer = sheet.toBuffer('image/png');
    fs.writeFileSync(path.join(outputDir, filename), buffer);
    outputs.push({ filename, width, height, layoutWidth: spec.w, layoutHeight: spec.h, touch: spec.touch, sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
  }
  const manifest = {
    scope: disclaimer,
    limitations: ['No gameplay rendering', 'No browser or CSS validation', 'No interaction or touch validation', 'No networking or deployment'],
    sourceHashes: renderer.sourceHashes,
    renderer: { package: '@napi-rs/canvas', modulePath: renderer.modulePath },
    files: outputs
  };
  fs.writeFileSync(path.join(outputDir, 'ui-components-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

module.exports = { createRenderer, drawLayout, renderSheets, disclaimer };
if (require.main === module) {
  createRenderer().then(renderer => renderSheets(renderer)).then(manifest => {
    for (const file of manifest.files) console.log(`${file.filename}: ${file.width}x${file.height}; ${disclaimer}`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
