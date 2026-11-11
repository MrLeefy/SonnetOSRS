/* scene.js - renderer, lighting, sky, terrain, water and all static arena props */
import * as THREE from 'three';
import { GB } from './geo.js';
import { N, C, PLAZA_R, props } from '../world.js';
import { mulberry32, clamp } from '../data.js';

export const QUALITY = {
  low:  { dpr: 1,   shadow: 0,    lights: false, grass: 250 },
  med:  { dpr: 1.5, shadow: 1024, lights: true,  grass: 600 },
  high: { dpr: 2,   shadow: 2048, lights: true,  grass: 1100 }
};
export const SUN_DIR = new THREE.Vector3(-0.55, 0.62, -0.45).normalize();
const FOG_COL = 0xd8c8ac, STONE = 0x9a968c, STONE_D = 0x6f6b63, STONE_L = 0xb9b4a6;

function vnoise(seed) {
  const r = mulberry32(seed), L = 64, lat = new Float32Array(L * L); for (let i = 0; i < lat.length; i++) lat[i] = r();
  const sm = t => t * t * (3 - 2 * t), g = (a, b) => lat[((b & 63) * L) + (a & 63)];
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi); const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
}
const noise = vnoise(77);
export function terrainH(x, z) {
  const r = Math.hypot(x - C, z - C);
  if (r <= 21) return 0;
  const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  let h = -1.5 * sm((r - 21) / 6);
  if (r > 38) { const t = (r - 38) / 26; h += sm(t) * (5 + 22 * noise(x * 0.07 + 5, z * 0.07 + 9) * (0.4 + noise(x * 0.02, z * 0.02))) + sm(t * 3) * 1.6; }
  return h;
}

function flagstoneTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d'), r = mulberry32(11);
  c.fillStyle = '#5b574f'; c.fillRect(0, 0, S, S);
  const rows = 8, rh = S / rows;
  for (let j = 0; j < rows; j++) {
    let x = -(r() * 60);
    while (x < S) {
      const w = 48 + r() * 70, v = 150 + r() * 46, warm = r() * 14;
      for (const ox of [0, S]) { // wrap horizontally
        c.fillStyle = `rgb(${v + warm | 0},${v + warm * 0.6 | 0},${v - 8 | 0})`; c.fillRect(x - ox + 2, j * rh + 2, w - 4, rh - 4);
        c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(x - ox + 2, j * rh + 2, w - 4, 3);
        c.fillStyle = 'rgba(0,0,0,0.14)'; c.fillRect(x - ox + 2, j * rh + rh - 6, w - 4, 4);
      }
      x += w;
    }
  }
  for (let i = 0; i < 2600; i++) { const a = r() * 0.10; c.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; c.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3); }
  for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(${60 + r() * 30 | 0},${95 + r() * 40 | 0},50,${0.08 + r() * 0.12})`; c.beginPath(); c.ellipse(r() * S, r() * S, 4 + r() * 16, 3 + r() * 9, r() * 3, 0, 7); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 9); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class World3D {
  constructor(canvas, qualityId) {
    this.qualityId = qualityId; const Q = this.Q = QUALITY[qualityId];
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: qualityId !== 'low', powerPreference: 'high-performance', alpha: false, stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = Q.shadow > 0; r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(FOG_COL, 38, 150);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 500);
    this.time = 0; this.flames = []; this.uniforms = { time: { value: 0 } };
    this.hole = { value: new THREE.Vector4(0, 0, 0, 1) };   // xy: player on screen (device px), z: distance to player, w: radius
    this.statMat = this.seeThrough(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0.02 }));
    this.buildLights(); this.buildSky(); this.buildTerrain(); this.buildProps(); this.buildGrass();
    this.resize();
  }
  /* props between the camera and the player are dithered away inside a circle around the player */
  seeThrough(mat) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uHole = this.hole;
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec4 uHole;\nvoid main() {').replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        { float hr = length(gl_FragCoord.xy - uHole.xy) / uHole.w;
          if (hr < 1.0 && length(vViewPosition) < uHole.z) { if (hr < 0.72 || mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 0.5) discard; } }`);
    };
    return mat;
  }
  /* call once per frame with the player's chest position (or null to disable) */
  setHole(v3) {
    const h = this.hole.value; if (!v3) { h.z = 0; return; }
    const dpr = this.renderer.getPixelRatio(), p = this._hv || (this._hv = new THREE.Vector3()); p.copy(v3).project(this.camera);
    h.x = (p.x * 0.5 + 0.5) * this.w * dpr; h.y = (p.y * 0.5 + 0.5) * this.h * dpr; h.z = this.camera.position.distanceTo(v3) - 1.2; h.w = Math.min(this.w, this.h) * dpr * 0.17;
  }
  setQuality(id) {
    this.qualityId = id; const Q = this.Q = QUALITY[id], r = this.renderer;
    r.shadowMap.enabled = Q.shadow > 0; this.sun.castShadow = Q.shadow > 0;
    if (Q.shadow && this.sun.shadow.mapSize.x !== Q.shadow) { this.sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    for (const f of this.flames) f.light.visible = Q.lights;
    this.crystalLight.visible = Q.lights; this.grass.count = Q.grass;
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, this.Q.dpr);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep a comfortable horizontal view in portrait
    this.camera.fov = w < h ? clamp(50 + (h / w - 1) * 16, 50, 68) : 50;
    this.camera.updateProjectionMatrix(); this.w = w; this.h = h;
  }
  buildLights() {
    const hemi = new THREE.HemisphereLight(0xa9c9ff, 0x6a5a44, 0.95); this.scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffe0b0, 3.5);
    sun.position.set(C, 0, C).addScaledVector(SUN_DIR, 60); sun.target.position.set(C, 0, C); this.scene.add(sun, sun.target);
    sun.castShadow = this.Q.shadow > 0; const s = sun.shadow; s.mapSize.set(this.Q.shadow || 1024, this.Q.shadow || 1024);
    s.camera.left = -25; s.camera.right = 25; s.camera.top = 25; s.camera.bottom = -25; s.camera.near = 10; s.camera.far = 120; s.bias = -0.0006; s.normalBias = 0.03; s.radius = 2.5;
  }
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { time: this.uniforms.time, sun: { value: SUN_DIR } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir; uniform float time; uniform vec3 sun;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<4;i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
          vec3 top = vec3(0.10, 0.30, 0.66), hor = vec3(0.86, 0.70, 0.50);
          vec3 col = mix(hor, top, pow(h, 0.55));
          float s = max(dot(d, sun), 0.0);
          col += vec3(1.0, 0.72, 0.38) * (pow(s, 6.0) * 0.35 + pow(s, 900.0) * 6.0);
          if (d.y > 0.01) { vec2 uv = d.xz / (d.y + 0.12) * 1.3 + vec2(time * 0.006, 0.0);
            float c = smoothstep(0.52, 0.85, fbm(uv)) * smoothstep(0.02, 0.25, d.y);
            col = mix(col, vec3(1.0, 0.93, 0.84) * (0.75 + 0.4 * s), c * 0.75); }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 14), mat); sky.position.set(C, 0, C); sky.frustumCulled = false; sky.renderOrder = -10; this.scene.add(sky);
  }
  buildTerrain() {
    // polar grid terrain: flat under the arena, sloping into the lake, mountains on the horizon
    const radii = [0, 8, 17, 19, 21, 22, 23, 24, 25.5, 27, 30, 34, 38, 41, 44, 48, 53, 58, 66, 78, 100], SEG = 96;
    const pos = [], col = [], idx = [], c = new THREE.Color();
    const grassA = new THREE.Color(0x5d7a2e), grassB = new THREE.Color(0x7d9440), sand = new THREE.Color(0xb39c6c), bed = new THREE.Color(0x4a5a4a), rock = new THREE.Color(0x77705f), snow = new THREE.Color(0xe6e2d8);
    for (let j = 0; j < radii.length; j++) for (let i = 0; i <= SEG; i++) {
      const a = i / SEG * Math.PI * 2, r = radii[j], x = C + Math.cos(a) * r, z = C + Math.sin(a) * r, h = terrainH(x, z);
      pos.push(x, h, z);
      const n = noise(x * 0.35, z * 0.35);
      if (r > 38) c.copy(rock).lerp(grassA, clamp(0.9 - h / 6, 0, 0.8)).lerp(snow, clamp((h - 15) / 6, 0, 1)).multiplyScalar(0.8 + n * 0.4);
      else if (h < -0.9) c.copy(bed);
      else if (h < -0.15) c.copy(sand).lerp(bed, clamp((-h - 0.5) / 0.6, 0, 1));
      else c.copy(grassA).lerp(grassB, n).lerp(sand, clamp((r - 21.4) / 1.2, 0, 1));
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < radii.length - 1; j++) for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i, b = a + 1, d = a + SEG + 1, e = d + 1; idx.push(a, b, d, b, e, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const terr = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })); terr.receiveShadow = true; this.scene.add(terr);
    // paved plaza
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA_R + 0.4, 72), new THREE.MeshStandardMaterial({ map: flagstoneTexture(), roughness: 0.92, metalness: 0 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(C, 0.03, C); plaza.receiveShadow = true; this.scene.add(plaza); this.ground = plaza;
    // inlaid rings
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x3f3b36, roughness: 0.8 }), goldMat = new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.45, metalness: 0.6 });
    for (const [r0, r1, m] of [[PLAZA_R - 0.5, PLAZA_R + 0.45, ringMat], [8.6, 9.0, ringMat], [3.1, 3.3, goldMat], [8.75, 8.85, goldMat]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), m); ring.rotation.x = -Math.PI / 2; ring.position.set(C, 0.045 + (m === goldMat ? 0.005 : 0), C); ring.receiveShadow = true; this.scene.add(ring);
    }
    // water
    const fog = this.scene.fog;
    this.water = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.ShaderMaterial({
      transparent: true, uniforms: { time: this.uniforms.time, fogColor: { value: fog.color }, fogNear: { value: fog.near }, fogFar: { value: fog.far }, center: { value: new THREE.Vector2(C, C) } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; uniform float time, fogNear, fogFar; uniform vec3 fogColor; uniform vec2 center;
        void main(){ float d = length(vW.xz - center);
          vec3 col = mix(vec3(0.13, 0.42, 0.46), vec3(0.03, 0.14, 0.27), smoothstep(23.0, 40.0, d));
          float w = sin(vW.x * 0.9 + time * 1.1) * sin(vW.z * 1.3 - time * 0.9) + sin((vW.x + vW.z) * 2.1 + time * 1.7) * 0.5;
          col += vec3(1.0, 0.85, 0.6) * pow(max(w * 0.6, 0.0), 6.0) * 0.5 + w * 0.012;
          float shore = 24.6 + sin(atan(vW.z - center.y, vW.x - center.x) * 14.0 + time * 0.7) * 0.25 + sin(time * 0.9) * 0.15;
          col = mix(col, vec3(0.85, 0.93, 0.92), (1.0 - smoothstep(0.0, 0.5, abs(d - shore))) * 0.35);
          float f = smoothstep(fogNear, fogFar, distance(vW, cameraPosition));
          gl_FragColor = vec4(mix(col, fogColor, f), 0.9);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(C, -0.55, C); this.scene.add(this.water);
  }
  buildProps() {
    const gb = new GB(), wood = new GB(), leaf = new GB();
    const rs = seed => mulberry32(seed || 1);
    for (const p of props) {
      if (p.type === 'monument') {
        gb.cyl(2.0, 2.15, 0.3, 8, STONE_D, { p: [p.x, 0.15, p.y], r: [0, Math.PI / 8, 0] });
        gb.cyl(1.55, 1.7, 0.3, 8, STONE, { p: [p.x, 0.45, p.y], r: [0, Math.PI / 8, 0] });
        gb.box(1.5, 1.1, 1.5, STONE_L, { p: [p.x, 1.15, p.y], shade: 0.25 });
        gb.box(1.7, 0.16, 1.7, STONE_D, { p: [p.x, 1.78, p.y] });
        gb.cyl(0.32, 0.62, 4.4, 4, STONE_L, { p: [p.x, 4.06, p.y], r: [0, Math.PI / 4, 0], shade: 0.3 });
        gb.cone(0.45, 0.6, 4, 0xb08a3c, { p: [p.x, 6.56, p.y], r: [0, Math.PI / 4, 0] });
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; gb.box(0.5, 0.5, 0.12, 0xb08a3c, { p: [p.x + Math.sin(a) * 0.76, 1.2, p.y + Math.cos(a) * 0.76], r: [0, a, Math.PI / 4] }); }
        const cr = this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: 0x8fe9ff, emissive: 0x39c6ff, emissiveIntensity: 2.2, roughness: 0.2, flatShading: true }));
        cr.position.set(p.x, 7.6, p.y); cr.scale.y = 1.5; this.scene.add(cr);
        this.crystalLight = new THREE.PointLight(0x58d0ff, 30, 16, 2); this.crystalLight.position.set(p.x, 6.2, p.y); this.crystalLight.visible = this.Q.lights; this.scene.add(this.crystalLight);
      } else if (p.type === 'brazier') {
        gb.cyl(0.34, 0.42, 0.25, 6, STONE_D, { p: [p.x, 0.125, p.y] });
        gb.cyl(0.16, 0.22, 0.8, 6, STONE, { p: [p.x, 0.65, p.y] });
        gb.cyl(0.46, 0.2, 0.34, 8, 0x3a3836, { p: [p.x, 1.2, p.y] });
        gb.cyl(0.38, 0.38, 0.06, 8, 0x1c1410, { p: [p.x, 1.36, p.y] });
        const fl = new THREE.Group(); fl.position.set(p.x, 1.4, p.y);
        const outer = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.85, 6), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, fog: false })); outer.position.y = 0.4;
        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.55, 5), new THREE.MeshBasicMaterial({ color: 0xffe07a, fog: false })); inner.position.y = 0.28;
        const light = new THREE.PointLight(0xff8a3a, 22, 12, 2); light.position.y = 0.9; light.visible = this.Q.lights;
        fl.add(outer, inner, light); this.scene.add(fl); this.flames.push({ g: fl, outer, inner, light, ph: p.x * 3.1, x: p.x, z: p.y });
      } else if (p.type === 'wall') {
        const r = rs(p.seed);
        for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
          const end = (p.w > 1 ? (x === p.x || x === p.x + p.w - 1) : (y === p.y || y === p.y + p.h - 1));
          const h = (end ? 0.9 : 1.7) + r() * 1.3, cx = x + 0.5, cz = y + 0.5;
          gb.box(1.02, h, 0.86 + (p.h > 1 ? 0.16 : 0), [STONE, STONE_L, STONE_D][Math.floor(r() * 3)], { p: [cx, h / 2, cz], shade: 0.35, r: [0, (r() - 0.5) * 0.06, 0] });
          if (r() < 0.6) gb.box(0.6 + r() * 0.3, 0.3, 0.7, STONE_L, { p: [cx + (r() - 0.5) * 0.2, h + 0.13, cz], r: [0, (r() - 0.5) * 0.4, (r() - 0.5) * 0.15] });
          if (r() < 0.35) gb.box(0.9, 0.1, 0.95, 0x5c7a34, { p: [cx, h + 0.02, cz] }); // moss cap
        }
      } else if (p.type === 'pillar') {
        const r = rs(p.seed), h = p.broken ? 1.3 + r() * 1.6 : 4.4;
        gb.box(1.0, 0.3, 1.0, STONE_D, { p: [p.x, 0.15, p.y] }); gb.box(0.84, 0.2, 0.84, STONE, { p: [p.x, 0.4, p.y] });
        gb.cyl(0.33, 0.38, h, 8, STONE_L, { p: [p.x, 0.5 + h / 2, p.y], shade: 0.3 });
        if (!p.broken) { gb.box(0.86, 0.2, 0.86, STONE, { p: [p.x, 0.6 + h, p.y] }); gb.box(1.04, 0.2, 1.04, STONE_D, { p: [p.x, 0.8 + h, p.y] }); }
        else { gb.cyl(0.2, 0.33, 0.3, 6, STONE, { p: [p.x + 0.05, 0.6 + h, p.y], r: [0.2, r() * 3, 0.15] }); gb.cyl(0.33, 0.33, 0.7, 8, STONE, { p: [p.x + (r() - 0.5) * 2, 0.33, p.y + (r() - 0.5) * 2], r: [Math.PI / 2, 0, r() * 3] }); }
      } else if (p.type === 'rock') {
        const r = rs(p.seed);
        gb.rock(0.5, STONE_D, { p: [p.x, 0.28, p.y], s: [1, 0.75, 0.9], r: [r(), r() * 3, r()], jitter: 0.3, seed: p.seed });
        gb.rock(0.28, STONE, { p: [p.x + 0.3, 0.16, p.y + 0.25], r: [r() * 3, r() * 3, 0], jitter: 0.3, seed: p.seed + 1 });
      } else if (p.type === 'crate') {
        const r = rs(p.seed), a = r() * 1.5;
        wood.box(0.8, 0.8, 0.8, 0x8a6236, { p: [p.x, 0.4, p.y], r: [0, a, 0], shade: 0.25 });
        for (const s of [-1, 1]) { wood.box(0.86, 0.1, 0.86, 0x5e4020, { p: [p.x, 0.4 + s * 0.36, p.y], r: [0, a, 0] }); }
        wood.box(0.45, 0.45, 0.45, 0x9a7040, { p: [p.x + 0.05, 1.03, p.y - 0.05], r: [0, a + 0.6, 0], shade: 0.2 });
      } else if (p.type === 'tree') {
        const r = rs(p.seed), s = p.s, y0 = terrainH(p.x, p.y) - 0.1, pine = r() < 0.5;
        wood.cyl(0.12 * s, 0.2 * s, 1.8 * s, 6, 0x5a4027, { p: [p.x, y0 + 0.9 * s, p.y] });
        if (pine) for (let k = 0; k < 3; k++) leaf.cone((1.1 - k * 0.27) * s, 1.3 * s, 7, k % 2 ? 0x2f5f33 : 0x3a6e39, { p: [p.x, y0 + (1.6 + k * 0.8) * s, p.y], r: [0, r() * 3, 0], shade: 0.35 });
        else for (let k = 0; k < 4; k++) leaf.ball((0.75 + r() * 0.35) * s, [0x4c7a2c, 0x5f8f34, 0x3f6a2a][k % 3], { p: [p.x + (r() - 0.5) * 1.1 * s, y0 + (2.0 + r() * 0.9) * s, p.y + (r() - 0.5) * 1.1 * s], s: [1, 0.8, 1], jitter: 0.25, seed: p.seed + k, shade: 0.3 });
      }
    }
    // sunken ruins poking out of the lake, purely scenic
    const r = mulberry32(909);
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = 29 + r() * 8, x = C + Math.cos(a) * d, z = C + Math.sin(a) * d, h = 1.5 + r() * 4;
      gb.cyl(0.4, 0.5, h, 8, STONE, { p: [x, h / 2 - 1.2, z], r: [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3], shade: 0.4 });
      if (r() < 0.5) gb.rock(1.2, STONE_D, { p: [x + 1.5, -0.6, z + 0.6], s: [1.3, 0.7, 1], jitter: 0.3, seed: i });
    }
    for (const [b, mat] of [[gb, this.statMat], [wood, this.statMat], [leaf, this.seeThrough(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }))]]) {
      const m = new THREE.Mesh(b.build(), mat); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    }
  }
  buildGrass() {
    const max = QUALITY.high.grass, g = new THREE.ConeGeometry(0.07, 0.34, 3); g.translate(0, 0.17, 0);
    const m = this.grass = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    const r = mulberry32(31), d = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      const a = r() * Math.PI * 2, rad = PLAZA_R + 0.9 + Math.pow(r(), 0.8) * 4.6, x = C + Math.cos(a) * rad, z = C + Math.sin(a) * rad;
      d.position.set(x, terrainH(x, z) - 0.02, z); d.rotation.set((r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5); const s = 0.6 + r() * 0.9; d.scale.set(s, s * (0.7 + r() * 0.8), s); d.updateMatrix();
      m.setMatrixAt(i, d.matrix); m.setColorAt(i, c.setHSL(0.24 + r() * 0.07, 0.55, 0.2 + r() * 0.1));
    }
    m.count = this.Q.grass; m.receiveShadow = true; this.scene.add(m);
  }
  update(dt) {
    this.time += dt; this.uniforms.time.value = this.time; const t = this.time;
    for (const f of this.flames) {
      const k = 0.85 + 0.15 * Math.sin(t * 13 + f.ph) + 0.1 * Math.sin(t * 23.3 + f.ph * 2);
      f.outer.scale.set(k, 0.9 + 0.25 * Math.sin(t * 9 + f.ph), k); f.inner.scale.y = 0.9 + 0.3 * Math.sin(t * 17 + f.ph); f.outer.rotation.y = t * 2;
      f.light.intensity = 20 * k;
    }
    if (this.crystal) { this.crystal.rotation.y = t * 0.8; this.crystal.position.y = 7.6 + Math.sin(t * 1.3) * 0.15; }
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
