/* icons.js - item icons are rendered once at boot from the real 3D models, tinted by gear tier */
import * as THREE from 'three';
import { Assets } from '../assets.js';
import { ITEMS, TIERS } from '../items.js';

const SRC = { blade: ['knight', '1H_Sword', [0, 0, -0.75]], bow: ['rogue', '2H_Crossbow', [1.15, 0.5, 0]], staff: ['mage', '2H_Staff', [0, 0, -0.6]], plate: ['knight', 'Knight_Helmet', [0.1, 0.5, 0]],
  leather: ['rogue', 'Rogue_Cape', [0.1, 2.6, 0]], robe: ['mage', 'Mage_Hat', [0.25, 0.5, 0]], bread: [null, 'plate_food_B', [0.9, 0.3, 0]], roast: [null, 'plate_food_A', [0.6, 0.5, 0]], tonic: [null, 'bottle_A_labeled_green', [0.1, 0.4, 0.25]], coins: [null, 'coin_stack_small', [0.5, 0.6, 0]] };

export function renderIcons(renderer) {
  const S = 128, rt = new THREE.WebGLRenderTarget(S, S), scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10), px = new Uint8Array(S * S * 4), out = {};
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 2.6); d.position.set(-2, 3, 4); scene.add(d);
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d'), box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
  const oldTarget = renderer.getRenderTarget(), oldClear = renderer.getClearAlpha(); renderer.setClearAlpha(0);
  const shot = (key, tint) => {
    const [mdl, node, rot] = SRC[key], src = mdl ? Assets.models[mdl].getObjectByName(node) : Assets.env[node]; if (!src) return null;
    const o = src.clone(true); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.visible = true;
    o.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); if (tint !== undefined) m.material.color.set(tint).lerp(new THREE.Color(0xffffff), 0.3); } });
    const piv = new THREE.Group(), g = new THREE.Group(); piv.add(o); g.add(piv); box.setFromObject(o); box.getCenter(c); o.position.sub(c);
    piv.rotation.set(rot[0], rot[1], rot[2]); box.setFromObject(g); box.getSize(sz); box.getCenter(c); g.scale.setScalar(1.75 / Math.max(sz.x, sz.y)); g.position.copy(c).multiplyScalar(-g.scale.x);
    scene.add(g); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, S, S, px); scene.remove(g);
    const img = ctx.createImageData(S, S), dd = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4, j = ((S - 1 - y) * S + x) * 4; for (let k = 0; k < 3; k++) dd[j + k] = Math.min(255, Math.pow(px[i + k] / 255, 1 / 2.2) * 262); dd[j + 3] = px[i + 3]; }
    ctx.putImageData(img, 0, 0); return cv.toDataURL('image/png');
  };
  for (const id in ITEMS) { const it = ITEMS[id]; out[id] = it.slot ? shot(it.slot, TIERS[it.tier].c) : shot(id); }
  out.coins = shot('coins'); renderer.setRenderTarget(oldTarget); renderer.setClearAlpha(oldClear); rt.dispose();
  return out;
}
