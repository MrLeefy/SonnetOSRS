/* fx.js - particles, projectiles, ground markers, loot orbs and ward flashes */
import * as THREE from 'three';
import { STYLES } from '../data.js';
import { Assets } from '../assets.js';

const MAXP = 900;
export class FX {
  constructor(scene) {
    this.scene = scene; this.n = 0;
    // ---- particle pool (one draw call) ----
    this.pp = new Float32Array(MAXP * 3); this.pc = new Float32Array(MAXP * 4); this.ps = new Float32Array(MAXP);
    this.pv = new Float32Array(MAXP * 3); this.pl = new Float32Array(MAXP * 2); this.pg = new Float32Array(MAXP); this.pz = new Float32Array(MAXP);
    const g = this.pgeo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pp, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcol', new THREE.BufferAttribute(this.pc, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.ps, 1).setUsage(THREE.DynamicDrawUsage));
    this.pmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { scale: { value: 600 } },
      vertexShader: 'attribute vec4 pcol; attribute float psize; varying vec4 vC; uniform float scale; void main(){ vC = pcol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(vC.rgb * a * vC.a, 1.0); }'
    });
    this.points = new THREE.Points(g, this.pmat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
    g.setDrawRange(0, 0);
    // ---- shared resources ----
    this.proj = []; this.rings = []; this.bubbles = []; this.loot = new Map();
    this.ringGeo = new THREE.RingGeometry(0.34, 0.46, 28); this.ringGeo.rotateX(-Math.PI / 2);
    this.bubbleGeo = new THREE.IcosahedronGeometry(1, 1);
    this.orbGeo = new THREE.IcosahedronGeometry(0.16, 1);
    const ag = new THREE.CylinderGeometry(0.018, 0.018, 0.8, 4); ag.rotateX(Math.PI / 2);
    const ah = new THREE.ConeGeometry(0.05, 0.14, 4); ah.rotateX(Math.PI / 2); ah.translate(0, 0, 0.45);
    this.arrowGeo = ag; this.arrowHeadGeo = ah;
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xf2e6c8 });
    this.lootGeo = new THREE.OctahedronGeometry(0.24, 0);
    this.lootMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffaa20, emissiveIntensity: 1.3, roughness: 0.3, metalness: 0.5, flatShading: true });
    // persistent rings: current target (red) and the player (gold)
    this.targetRing = this.makeRing(0xff4433, 0.9); this.targetRing.visible = false; this.targetRing.scale.setScalar(1.5);
    this.selfRing = this.makeRing(0xf2cf6a, 0.45); this.selfRing.scale.setScalar(1.25);
  }
  makeRing(color, opacity) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false }));
    m.position.y = 0.07; m.renderOrder = 2; this.scene.add(m); return m;
  }
  /* ---- particles ---- */
  spark(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0) {
    let i = this.n; if (i >= MAXP) i = (Math.random() * MAXP) | 0; else this.n++;
    this.pp[i * 3] = x; this.pp[i * 3 + 1] = y; this.pp[i * 3 + 2] = z; this.pv[i * 3] = vx; this.pv[i * 3 + 1] = vy; this.pv[i * 3 + 2] = vz;
    this.pc[i * 4] = r; this.pc[i * 4 + 1] = g; this.pc[i * 4 + 2] = b; this.pc[i * 4 + 3] = 1; this.ps[i] = size; this.pz[i] = size; this.pl[i * 2] = life; this.pl[i * 2 + 1] = life; this.pg[i] = grav;
  }
  burst(x, y, z, color, count, speed, size, life, grav = 4, up = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1, h = Math.sqrt(1 - e * e), s = speed * (0.4 + Math.random() * 0.6);
      this.spark(x, y, z, Math.cos(a) * h * s, e * s + up, Math.sin(a) * h * s, c.r, c.g, c.b, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), grav);
    }
  }
  /* ---- projectiles ---- */
  shoot(style, from, to, dur, spec) {
    let obj;
    if (style === 'ranged') { obj = new THREE.Group(); obj.add(new THREE.Mesh(this.arrowGeo, this.arrowMat), new THREE.Mesh(this.arrowHeadGeo, this.arrowMat)); if (spec) obj.scale.setScalar(1.5); }
    else { obj = new THREE.Mesh(this.orbGeo, new THREE.MeshBasicMaterial({ color: spec ? 0xdff6ff : 0x8fdcff, fog: false })); if (spec) obj.scale.setScalar(1.8); }
    this.scene.add(obj); this.proj.push({ obj, style, from: from.clone(), to, t: 0, dur, spec });
  }
  marker(x, z, color) { const m = this.makeRing(color, 1); m.position.set(x, 0.08, z); this.rings.push({ m, t: 0 }); }
  bubble(pos, color) {
    const m = new THREE.Mesh(this.bubbleGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: false, fog: false }));
    m.position.copy(pos); this.scene.add(m); this.bubbles.push({ m, t: 0 });
  }
  syncLoot(list) {
    const ids = new Set(list.map(l => l.id));
    for (const [id, m] of this.loot) if (!ids.has(id)) { this.scene.remove(m); this.loot.delete(id); }
    for (const l of list) if (!this.loot.has(l.id)) { const m = Assets.env[l.items.some(i => /\d$/.test(i.id)) || l.coins > 200 ? 'chest_gold' : 'chest'].clone(true); m.scale.setScalar(0.42); m.position.set(l.x + 0.5, 0, l.y + 0.5); m.rotation.y = l.id; this.scene.add(m); this.loot.set(l.id, m); }
  }
  update(dt, time, h) {
    this.pmat.uniforms.scale.value = h * 0.9;
    // particles: integrate, fade, compact
    let n = this.n; const pp = this.pp, pv = this.pv, pc = this.pc, pl = this.pl;
    for (let i = 0; i < n; i++) {
      pl[i * 2] -= dt;
      if (pl[i * 2] <= 0) { // swap with last
        n--; if (i !== n) {
          for (let k = 0; k < 3; k++) { pp[i * 3 + k] = pp[n * 3 + k]; pv[i * 3 + k] = pv[n * 3 + k]; }
          for (let k = 0; k < 4; k++) pc[i * 4 + k] = pc[n * 4 + k];
          pl[i * 2] = pl[n * 2]; pl[i * 2 + 1] = pl[n * 2 + 1]; this.ps[i] = this.ps[n]; this.pz[i] = this.pz[n]; this.pg[i] = this.pg[n];
        }
        i--; continue;
      }
      pv[i * 3 + 1] -= this.pg[i] * dt;
      pp[i * 3] += pv[i * 3] * dt; pp[i * 3 + 1] += pv[i * 3 + 1] * dt; pp[i * 3 + 2] += pv[i * 3 + 2] * dt;
      if (pp[i * 3 + 1] < 0.04 && this.pg[i] > 0) { pp[i * 3 + 1] = 0.04; pv[i * 3 + 1] *= -0.35; pv[i * 3] *= 0.6; pv[i * 3 + 2] *= 0.6; }
      const f = pl[i * 2] / pl[i * 2 + 1]; pc[i * 4 + 3] = f; this.ps[i] = this.pz[i] * (0.4 + 0.6 * f);
    }
    this.n = n; const g = this.pgeo; g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true; g.attributes.pcol.needsUpdate = true; g.attributes.psize.needsUpdate = true;
    // projectiles
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const p = this.proj[i]; p.t += dt; const f = Math.min(1, p.t / p.dur), o = p.obj;
      const px = o.position.x, py = o.position.y, pz = o.position.z;
      o.position.lerpVectors(p.from, p.to, f); const arc = p.style === 'ranged' ? 0.9 : 0.35; o.position.y += Math.sin(f * Math.PI) * arc * Math.min(1, p.from.distanceTo(p.to) / 6);
      if (p.style === 'ranged') { if (p.t > dt) o.lookAt(o.position.x * 2 - px, o.position.y * 2 - py, o.position.z * 2 - pz); if (p.spec) this.spark(o.position.x, o.position.y, o.position.z, 0, 0, 0, 1, 0.8, 0.3, 0.22, 0.25); }
      else { const k = p.spec ? 3 : 2; for (let j = 0; j < k; j++) this.spark(o.position.x + (Math.random() - 0.5) * 0.15, o.position.y + (Math.random() - 0.5) * 0.15, o.position.z + (Math.random() - 0.5) * 0.15, 0, 0.3, 0, 0.35, 0.75, 1, p.spec ? 0.5 : 0.34, 0.35); o.rotation.y += dt * 9; }
      if (f >= 1) { this.scene.remove(o); if (o.material && o.material !== this.arrowMat) o.material.dispose(); this.proj.splice(i, 1); }
    }
    // tap markers
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const f = r.t / 0.5; r.m.scale.setScalar(1.6 - f * 0.9); r.m.material.opacity = 1 - f;
      if (f >= 1) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]; b.t += dt; const f = b.t / 0.4; b.m.scale.setScalar(0.8 + f * 0.6); b.m.material.opacity = 0.5 * (1 - f);
      if (f >= 1) { this.scene.remove(b.m); b.m.material.dispose(); this.bubbles.splice(i, 1); }
    }
    for (const m of this.loot.values()) { m.position.y = Math.abs(Math.sin(time * 3 + m.position.x)) * 0.08; if (Math.random() < dt * 6) this.spark(m.position.x + (Math.random() - 0.5) * 0.4, 0.3, m.position.z + (Math.random() - 0.5) * 0.4, 0, 0.9, 0, 1, 0.8, 0.3, 0.16, 0.8); }
    const pulse = 1.45 + Math.sin(time * 6) * 0.1; this.targetRing.scale.setScalar(pulse); this.targetRing.rotation.y = time;
  }
}
export const STYLE_COLOR = { melee: STYLES.melee.color, ranged: STYLES.ranged.color, magic: STYLES.magic.color };
