/* assets.js - decodes the embedded glTF packs (CC0 models by Kay Lousberg, see assets/README.md) */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import knight from '../assets/knight.glb';
import mage from '../assets/mage.glb';
import rogue from '../assets/rogue.glb';
import barbarian from '../assets/barbarian.glb';
import sk_warrior from '../assets/sk_warrior.glb';
import sk_mage from '../assets/sk_mage.glb';
import sk_rogue from '../assets/sk_rogue.glb';
import sk_minion from '../assets/sk_minion.glb';
import env from '../assets/env.glb';

const FILES = { knight, mage, rogue, barbarian, sk_warrior, sk_mage, sk_rogue, sk_minion, env };
export const Assets = { models: {}, clips: {}, env: {}, envMats: [] };

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader(), names = Object.keys(FILES); let done = 0;
  await Promise.all(names.map(async n => {
    const u8 = FILES[n], buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const g = await loader.parseAsync(buf, '');
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material; m.metalness = 0; m.roughness = 0.82; if (m.map) { m.map.anisotropy = 4; }
      o.castShadow = true; o.receiveShadow = n === 'env';
    });
    if (n === 'env') { for (const c of g.scene.children) Assets.env[c.name] = c; }
    else Assets.models[n] = g.scene;
    for (const c of g.animations) Assets.clips[c.name] = c;
    onProgress(++done / names.length);
  }));
  // root motion would fight the simulation's own movement: keep the hips' vertical bob only
  for (const k in Assets.clips) {
    const c = Assets.clips[k]; c.tracks = c.tracks.filter(t => !/^root\.|IK|control|kneeIK|elbowIK/.test(t.name));
  }
  return Assets;
}
