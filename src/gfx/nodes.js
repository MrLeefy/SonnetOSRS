/* nodes.js - gatherable resources in the world: trees that fall to stumps, ore rocks that go dull, fishing ripples, the campfire */
import * as THREE from 'three';
import { Assets } from '../assets.js';

export class Nodes {
  constructor(scene, list, wrap) {
    this.scene = scene; this.v = new Map(); this.ripples = []; this.flames = [];
    const ore = new Map(), plain = new Map(), inst = (name, n, s, tint) => {
      const o = Assets.env[name].clone(true); o.position.set(n.x + 0.5, 0, n.y + 0.5); o.rotation.y = n.ry || 0; o.scale.setScalar(s);
      o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (tint) { if (!ore.has(m.material)) { const c = wrap(m.material.clone()); c.color.set(tint); ore.set(m.material, c); } m.material = ore.get(m.material); } else { if (!plain.has(m.material)) plain.set(m.material, wrap(m.material.clone())); m.material = plain.get(m.material); } } });
      scene.add(o); return o;
    };
    const ringGeo = new THREE.RingGeometry(0.25, 0.33, 24); ringGeo.rotateX(-Math.PI / 2);
    for (const n of list) {
      if (n.type === 'tree') this.v.set(n.id, { full: inst(n.m, n, n.s), empty: inst('tree_single_A_cut', n, n.s * 0.9) });
      else if (n.type === 'rock') this.v.set(n.id, { full: inst(n.m, n, n.s, 0xd9925a), empty: inst(n.m, n, n.s * 0.7) });
      else if (n.type === 'fish') for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.8, depthWrite: false })); m.position.set(n.x + 0.5, -0.46, n.y + 0.5); scene.add(m); this.ripples.push({ m, ph: i * 0.5 + n.id }); }
      else if (n.type === 'fire') {
        const g = new THREE.Group(); g.position.set(n.x + 0.5, 0, n.y + 0.5); const logs = Assets.env.resource_lumber.clone(true); logs.scale.setScalar(2.2); logs.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.add(logs);
        const outer = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9, fog: false })); outer.position.y = 0.75;
        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 5), new THREE.MeshBasicMaterial({ color: 0xffe9a0, fog: false })); inner.position.y = 0.65; g.add(outer, inner); scene.add(g); this.flames.push({ outer, inner, x: n.x + 0.5, z: n.y + 0.5 });
      }
      this.sync(n);
    }
  }
  sync(n) { const v = this.v.get(n.id); if (v) { v.full.visible = !n.depleted; v.empty.visible = n.depleted; } }
  syncAll(list) { for (const n of list) this.sync(n); }
  update(t, fx, dt) {
    for (const r of this.ripples) { const f = (t * 0.6 + r.ph) % 1; r.m.scale.setScalar(0.6 + f * 2.2); r.m.material.opacity = 0.75 * (1 - f); }
    for (const f of this.flames) { const k = 0.85 + 0.15 * Math.sin(t * 13) + 0.1 * Math.sin(t * 23.3); f.outer.scale.set(k, 0.9 + 0.25 * Math.sin(t * 9), k); f.inner.scale.y = 0.9 + 0.3 * Math.sin(t * 17); f.outer.rotation.y = t * 2;
      if (Math.random() < dt * 12) fx.spark(f.x + (Math.random() - 0.5) * 0.3, 1, f.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 1.2 + Math.random(), (Math.random() - 0.5) * 0.3, 1, 0.55, 0.15, 0.2, 0.9, -0.4); }
  }
}
