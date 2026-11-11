/* geo.js - tiny builder for vertex-coloured low-poly geometry, merged into a single draw call */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class GB {
  constructor() { this.parts = []; }
  get empty() { return this.parts.length === 0; }
  /* o: { p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz] | number, shade: 0..1 vertical darkening, jitter } */
  add(geo, color, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    const s = o.s === undefined ? [1, 1, 1] : (typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s);
    _e.set(...(o.r || [0, 0, 0])); _q.setFromEuler(_e); _p.set(...(o.p || [0, 0, 0])); _s.set(...s);
    const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
    if (o.jitter) { // displace vertices deterministically by position so shared corners stay welded
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + (o.seed || 0)) * 43758.5453, f = 1 + ((h - Math.floor(h)) - 0.5) * o.jitter;
        pos.setXYZ(i, x * f, y * f, z * f);
      }
    }
    g.applyMatrix4(_m.compose(_p, _q, _s));
    _c.set(color); g.computeBoundingBox(); const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, sh = o.shade || 0;
    for (let i = 0; i < n; i++) {
      const f = sh ? 1 - sh * (1 - (pos.getY(i) - y0) / Math.max(1e-4, y1 - y0)) : 1;
      col[i * 3] = _c.r * f; col[i * 3 + 1] = _c.g * f; col[i * 3 + 2] = _c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.parts.push(g); return this;
  }
  box(w, h, d, color, o) { return this.add(new THREE.BoxGeometry(w, h, d), color, o); }
  cyl(rt, rb, h, seg, color, o) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, o); }
  cone(r, h, seg, color, o) { return this.add(new THREE.ConeGeometry(r, h, seg), color, o); }
  ball(r, color, o, detail = 0) { return this.add(new THREE.IcosahedronGeometry(r, detail), color, o); }
  rock(r, color, o) { return this.add(new THREE.DodecahedronGeometry(r, 0), color, o); }
  build() {
    if (!this.parts.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(this.parts, false); for (const p of this.parts) p.dispose(); this.parts = []; return g;
  }
}
export function shade(color, f) { _c.set(color); return new THREE.Color(Math.min(1, _c.r * f), Math.min(1, _c.g * f), Math.min(1, _c.b * f)); }
