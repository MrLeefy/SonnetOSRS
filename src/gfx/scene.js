/* scene.js - renderer, post-processing, lighting, sky, island terrain, water and every static prop */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { N, TOWN, WILDS, GRAVE, PLAZA_R, props, lamps, landDist, roadDist, zoneAt, noise, blockAt } from '../world.js';
import { Assets } from '../assets.js';
import { mulberry32, clamp } from '../data.js';

export const QUALITY = {
  low:  { dpr: 1,    shadow: 0,    bloom: false, msaa: 0, lights: 0, grass: 500 },
  med:  { dpr: 1.5,  shadow: 1024, bloom: true,  msaa: 0, lights: 3, grass: 1400 },
  high: { dpr: 2,    shadow: 2048, bloom: true,  msaa: 4, lights: 4, grass: 2600 }
};
export const SUN_DIR = new THREE.Vector3(-0.5, 0.66, -0.42).normalize();
const FOG_COL = 0xcfd8dc, CX = 48, CZ = 50;

export function terrainH(x, z) { const d = landDist(x, z); if (d >= 0.03) return 0; const t = clamp((0.03 - d) / 0.1, 0, 1); return -1.7 * t * t * (3 - 2 * t); }

export class World3D {
  constructor(canvas, qualityId) {
    this.qualityId = qualityId; const Q = this.Q = QUALITY[qualityId];
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = Q.shadow > 0; r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(FOG_COL, 45, 190);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 600);
    this.time = 0; this.flames = []; this.uniforms = { time: { value: 0 } }; this.hole = { value: new THREE.Vector4(0, 0, 0, 1) }; this.focus = new THREE.Vector3(48, 0, 70);
    this.buildLights(); this.buildSky(); this.buildTerrain(); this.buildStatics(); this.buildGrass(); this.buildLamps(); this.buildPost();
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
  setHole(v3) {
    const h = this.hole.value; if (!v3) { h.z = 0; return; }
    const dpr = this.renderer.getPixelRatio(), p = this._hv || (this._hv = new THREE.Vector3()); p.copy(v3).project(this.camera);
    h.x = (p.x * 0.5 + 0.5) * this.w * dpr; h.y = (p.y * 0.5 + 0.5) * this.h * dpr; h.z = this.camera.position.distanceTo(v3) - 1.2; h.w = Math.min(this.w, this.h) * dpr * 0.16;
  }
  setQuality(id) {
    this.qualityId = id; const Q = this.Q = QUALITY[id], r = this.renderer;
    r.shadowMap.enabled = Q.shadow > 0; this.sun.castShadow = Q.shadow > 0;
    if (Q.shadow && this.sun.shadow.mapSize.x !== Q.shadow) { this.sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.grass.count = Q.grass; this.lights.forEach((l, i) => l.visible = i < Q.lights);
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.buildPost(); this.resize();
  }
  buildPost() {
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    if (!this.Q.bloom) return;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: this.Q.msaa });
    const c = this.composer = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.26, 0.6, 1.0); c.addPass(this.bloom); c.addPass(new OutputPass());
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, this.Q.dpr);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(w, h); }
    this.camera.aspect = w / h; this.camera.fov = w < h ? clamp(50 + (h / w - 1) * 16, 50, 68) : 50; this.camera.updateProjectionMatrix(); this.w = w; this.h = h;
  }
  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x7a6a50, 1.15));
    const sun = this.sun = new THREE.DirectionalLight(0xffe6c0, 3.3); this.scene.add(sun, sun.target);
    sun.castShadow = this.Q.shadow > 0; const s = sun.shadow; s.mapSize.set(this.Q.shadow || 1024, this.Q.shadow || 1024);
    s.camera.left = -24; s.camera.right = 24; s.camera.top = 24; s.camera.bottom = -24; s.camera.near = 10; s.camera.far = 130; s.bias = -0.0005; s.normalBias = 0.04; s.radius = 2;
    this.lights = []; for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffb060, 16, 11, 2); l.visible = i < this.Q.lights; this.scene.add(l); this.lights.push(l); }
  }
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { time: this.uniforms.time, sun: { value: SUN_DIR } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 sun;
        void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
          vec3 col = mix(vec3(0.80, 0.86, 0.90), vec3(0.16, 0.42, 0.82), pow(h, 0.5));
          float s = max(dot(d, sun), 0.0); col += vec3(1.0, 0.8, 0.5) * (pow(s, 8.0) * 0.3 + pow(s, 800.0) * 5.0);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const sky = this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 14), mat); sky.frustumCulled = false; sky.renderOrder = -10; this.scene.add(sky);
  }
  buildTerrain() {
    const X0 = -40, X1 = 136, STEP = 1.6, n = Math.round((X1 - X0) / STEP) + 1, pos = [], col = [], idx = [], c = new THREE.Color();
    const grassA = new THREE.Color(0x5f8a33), grassB = new THREE.Color(0x86a845), dirt = new THREE.Color(0x9a7f55), sand = new THREE.Color(0xd2bd8a), bed = new THREE.Color(0x4f6a5c), ash = new THREE.Color(0x6f7358), grave = new THREE.Color(0x5c5a48), town = new THREE.Color(0x77705c), plaza = new THREE.Color(0x4f4a40);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = X0 + i * STEP, z = X0 + j * STEP, h = terrainH(x, z), d = landDist(x, z), nz = noise(x * 0.3, z * 0.3), z0 = zoneAt(x, z);
      pos.push(x, h, z);
      c.copy(grassA).lerp(grassB, nz);
      if (z0 === 'wilds') c.lerp(ash, 0.75 - nz * 0.3); else if (z0 === 'grave') c.lerp(grave, clamp(1.6 - Math.hypot(x - GRAVE.x, z - GRAVE.y) / GRAVE.r, 0, 0.9));
      if (x > TOWN.x0 - 1 && x < TOWN.x1 + 1 && z > TOWN.y0 - 1 && z < TOWN.y1 + 1) c.lerp(town, clamp(Math.min(x - TOWN.x0, TOWN.x1 - x, z - TOWN.y0, TOWN.y1 - z) / 3, 0, 0.75));
      c.lerp(dirt, clamp(1.9 - roadDist(x, z), 0, 1) * 0.9);
      c.lerp(plaza, clamp((PLAZA_R + 2.5 - Math.hypot(x - WILDS.x - 0.5, z - WILDS.y - 0.5)) / 2, 0, 1));
      if (d < 0.07) c.lerp(sand, clamp((0.07 - d) / 0.03, 0, 1)); if (h < -0.5) c.lerp(bed, clamp((-h - 0.5) / 0.8, 0, 1));
      c.multiplyScalar(0.9 + nz * 0.2); col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, d = a + n, e = d + 1; idx.push(a, d, b, b, d, e); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const terr = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })); terr.receiveShadow = true; this.scene.add(terr);
    const fog = this.scene.fog;
    this.water = new THREE.Mesh(new THREE.CircleGeometry(420, 48), new THREE.ShaderMaterial({
      transparent: true, uniforms: { time: this.uniforms.time, fogColor: { value: fog.color }, fogNear: { value: fog.near }, fogFar: { value: fog.far }, sun: { value: SUN_DIR } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; uniform float time, fogNear, fogFar; uniform vec3 fogColor, sun;
        void main(){ vec3 v = normalize(cameraPosition - vW); float dist = distance(vW, cameraPosition);
          vec2 p = vW.xz; float w1 = sin(p.x * 0.8 + time * 1.2) * sin(p.y * 1.1 - time), w2 = sin((p.x + p.y) * 1.9 + time * 1.8) * 0.5, w3 = sin(p.x * 3.7 - p.y * 2.9 + time * 2.6) * 0.25;
          vec3 n = normalize(vec3((w1 + w2 + w3) * 0.10, 1.0, (w2 - w1 + w3) * 0.10));
          float fres = pow(1.0 - max(dot(v, n), 0.0), 3.0);
          vec3 col = mix(vec3(0.07, 0.36, 0.50), vec3(0.62, 0.78, 0.90), fres * 0.85);
          float sp = pow(max(dot(reflect(-sun, n), v), 0.0), 120.0); col += vec3(1.0, 0.9, 0.7) * sp * 1.6;
          float f = smoothstep(fogNear, fogFar, dist);
          gl_FragColor = vec4(mix(col, fogColor, f), mix(0.82, 1.0, max(fres, f)));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(CX, -0.5, CZ); this.scene.add(this.water);
  }
  /* bake every placed model into a few merged meshes (per texture, per 32-tile chunk) */
  buildStatics() {
    const buckets = new Map(), cache = new Map(), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), mm = new THREE.Matrix4();
    const floatGeo = mesh => {
      let g = cache.get(mesh.geometry); if (g) return g; const src = mesh.geometry; g = new THREE.BufferGeometry();
      for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) { const a = src.attributes[name], out = new Float32Array(a.count * size); for (let i = 0; i < a.count; i++) { out[i * size] = a.getX(i); out[i * size + 1] = a.getY(i); if (size === 3) out[i * size + 2] = a.getZ(i); } g.setAttribute(name, new THREE.BufferAttribute(out, size)); }
      g.setIndex(src.index ? Array.from(src.index.array) : Array.from({ length: src.attributes.position.count }, (_, i) => i)); cache.set(src, g); return g;
    };
    const put = (name, x, y, z, ry, sc, group = '', sy = 1) => {
      const node = Assets.env[name]; if (!node) { console.warn('missing model', name); return; }
      node.updateMatrixWorld(true); M.compose(v.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), s.set(sc, sc * sy, sc));
      node.traverse(o => {
        if (!o.isMesh) return; const g = floatGeo(o).clone().applyMatrix4(mm.multiplyMatrices(M, o.matrixWorld));
        const key = o.material.uuid + '|' + (group || (Math.floor(x / 32) + ',' + Math.floor(z / 32))); let b = buckets.get(key); if (!b) buckets.set(key, b = { mat: o.material, list: [], far: !!group }); b.list.push(g);
      });
    };
    for (const p of props) put(p.m, p.x, p.y, p.z, p.ry, p.s, '', p.sy || 1);
    // paving: town square, bank floor, and the worn plaza of the ruins
    const rnd = mulberry32(5), small = ['floor_tile_small', 'floor_tile_small_broken_A', 'floor_tile_small_broken_B', 'floor_tile_small_weeds_A', 'floor_tile_small_weeds_B', 'floor_tile_small'];
    const pave = (cx, cz, worn) => { if (rnd() > worn) put('floor_tile_large', cx, 0.06, cz, Math.floor(rnd() * 4) * Math.PI / 2, 0.5); else for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) if (rnd() > worn * 0.25) put(small[Math.floor(rnd() * small.length)], cx + dx, 0.06, cz + dz, Math.floor(rnd() * 4) * Math.PI / 2, 0.5); };
    for (let z = 62; z < 74; z += 2) for (let x = 42; x < 54; x += 2) pave(x + 1, z + 1, 0.12);
    for (let z = 78; z < 84; z += 2) for (let x = 44; x < 52; x += 2) pave(x + 1, z + 1, 0);
    for (let z = WILDS.y - 14; z < WILDS.y + 14; z += 2) for (let x = WILDS.x - 14; x < WILDS.x + 14; x += 2) { const d = Math.hypot(x + 1 - WILDS.x - 0.5, z + 1 - WILDS.y - 0.5); if (d < PLAZA_R + (rnd() - 0.5) * 2.5) pave(x + 1, z + 1, 0.3 + d / PLAZA_R * 0.4); }
    // distant scenery: a ring of mountains, wooded hills and a castle across the water
    const fr = mulberry32(77);
    for (let k = 0; k < 22; k++) { const a = k / 22 * 6.28 + fr() * 0.2, d = 150 + fr() * 50; put(['mountain_A', 'mountain_B', 'mountain_C_grass', 'mountain_A_grass_trees'][k % 4], CX + Math.cos(a) * d, -3, CZ + Math.sin(a) * d, fr() * 6, 34 + fr() * 26, 'far'); }
    for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28 + fr(), d = 95 + fr() * 30; put(k % 2 ? 'hills_A_trees' : 'hills_B_trees', CX + Math.cos(a) * d, -1.2, CZ + Math.sin(a) * d, fr() * 6, 12 + fr() * 8, 'far'); }
    put('building_castle_blue', -42, 4, 2, 0.8, 9, 'far'); put('hills_A_trees', -42, -1, 2, 0, 22, 'far'); put('building_windmill_blue', 132, 2.5, 96, 2, 8, 'far'); put('hills_B_trees', 132, -1, 96, 0, 18, 'far');
    for (let i = 0; i < 40; i++) { const a = fr() * 6.28, d = 46 + fr() * 6, x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d; if (landDist(x, z) < 0 && landDist(x, z) > -0.12) put(i % 3 ? 'waterlily_A' : 'waterplant_A', x, -0.5, z, fr() * 6, 4 + fr() * 3, 'far'); }
    for (const b of buckets.values()) {
      const mat = b.far ? b.mat : this.seeThrough(b.mat.clone()), m = new THREE.Mesh(mergeGeometries(b.list, false), mat);
      m.castShadow = !b.far; m.receiveShadow = !b.far; this.scene.add(m); for (const g of b.list) g.dispose();
    }
    // drifting clouds
    this.clouds = new THREE.Group(); const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8899aa, emissiveIntensity: 0.55, fog: false });
    for (let i = 0; i < 12; i++) { const src = Assets.env[i % 3 ? 'cloud_big' : 'cloud_small']; src.traverse(o => { if (o.isMesh) { const m = new THREE.Mesh(o.geometry, cm); m.applyMatrix4(o.matrixWorld); const h = new THREE.Group(); h.add(m); h.position.set(CX + (fr() - 0.5) * 420, 46 + fr() * 30, CZ + (fr() - 0.5) * 420); h.scale.setScalar(9 + fr() * 9); h.rotation.y = fr() * 6; this.clouds.add(h); } }); }
    this.scene.add(this.clouds);
  }
  buildGrass() {
    const max = QUALITY.high.grass, g = new THREE.ConeGeometry(0.06, 0.3, 3); g.translate(0, 0.15, 0);
    const m = this.grass = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xffffff }), max), r = mulberry32(31), d = new THREE.Object3D(), c = new THREE.Color();
    let i = 0, guard = 0;
    while (i < max && guard++ < max * 30) {
      const x = 2 + r() * 92, z = 2 + r() * 92, zn = zoneAt(x, z); if (landDist(x, z) < 0.06 || roadDist(x, z) < 2 || zn === 'town' || blockAt(Math.floor(x), Math.floor(z)) || Math.hypot(x - WILDS.x, z - WILDS.y) < PLAZA_R + 1) continue;
      d.position.set(x, 0, z); d.rotation.set((r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5); const s = 0.7 + r() * 1.1; d.scale.set(s, s * (0.7 + r() * 0.9), s); d.updateMatrix();
      m.setMatrixAt(i, d.matrix); m.setColorAt(i, zn === 'wilds' || zn === 'grave' ? c.setHSL(0.17 + r() * 0.05, 0.3, 0.2 + r() * 0.08) : c.setHSL(0.25 + r() * 0.06, 0.6, 0.22 + r() * 0.1)); i++;
    }
    m.count = Math.min(i, this.Q.grass); m.receiveShadow = true; this.scene.add(m);
  }
  buildLamps() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const k = cv.getContext('2d'), gr = k.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,230,170,1)'); gr.addColorStop(0.25, 'rgba(255,170,70,0.55)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); k.fillStyle = gr; k.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.glowMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xffffff });
    this.lampSprites = lamps.map(l => { const s = new THREE.Sprite(this.glowMat); s.position.set(l.x, l.y, l.z); s.scale.setScalar(1.5); this.scene.add(s); return s; });
  }
  update(dt, focus) {
    this.time += dt; this.uniforms.time.value = this.time; const t = this.time;
    if (focus) this.focus.copy(focus);
    // the sun's shadow box follows the action, snapped so shadows do not shimmer
    const f = this.focus, sx = Math.round(f.x / 2) * 2, sz = Math.round(f.z / 2) * 2; this.sun.target.position.set(sx, 0, sz); this.sun.position.set(sx, 0, sz).addScaledVector(SUN_DIR, 70);
    this.sky.position.copy(this.camera.position);
    for (const c of this.clouds.children) { c.position.x += dt * 0.8; if (c.position.x > CX + 230) c.position.x -= 460; }
    // the nearest lanterns get real lights
    if (this.Q.lights) { const near = lamps.map((l, i) => [Math.hypot(l.x - f.x, l.z - f.z), i]).sort((a, b) => a[0] - b[0]); this.lights.forEach((L, i) => { const l = lamps[near[i][1]]; L.position.set(l.x, l.y + 0.3, l.z); L.intensity = 15 + Math.sin(t * 9 + i * 2) * 1.5; }); }
    this.lampSprites.forEach((s, i) => s.scale.setScalar(1.45 + Math.sin(t * 7 + i) * 0.12));
  }
  render() { if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera); }
}
