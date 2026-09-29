'use strict';
/* ==========================================================================
   gl.js  -  tiny WebGL renderer: matrices, mesh builder, camera, picking
   World space: X = east, Y = up, Z = south (tile y = -Z). 1 unit = 1 tile.
   ========================================================================== */
const M4 = {
  ident() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  mul(a, b) { // column-major: result = a * b
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  trans(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  scale(x, y, z) { return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]; },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
  },
  lookAt(e, c, u) {
    let fx = c[0] - e[0], fy = c[1] - e[1], fz = c[2] - e[2]; let l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
    let sx = fy * u[2] - fz * u[1], sy = fz * u[0] - fx * u[2], sz = fx * u[1] - fy * u[0]; l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    return [sx, ux, -fx, 0, sy, uy, -fy, 0, sz, uz, -fz, 0, -(sx * e[0] + sy * e[1] + sz * e[2]), -(ux * e[0] + uy * e[1] + uz * e[2]), (fx * e[0] + fy * e[1] + fz * e[2]), 1];
  },
  pt(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; },
  dir(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; }
};

/* lighting (baked into vertex colours, RS2 style) */
const LIGHT = (() => { const l = [-0.42, 0.78, 0.46]; const n = Math.hypot(...l); return [l[0] / n, l[1] / n, l[2] / n]; })();
let AMBIENT = 0.60, DIFFUSE = 0.52;
function lightAt(nx, ny, nz) {
  const l = Math.hypot(nx, ny, nz) || 1; const d = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / l;
  return AMBIENT + DIFFUSE * Math.max(0, d);
}

class Mesh {
  constructor(tex) { this.tex = tex || 'white'; this.p = []; this.c = []; this.blend = false; }
  get count() { return this.p.length / 5; }
  clear() { this.p.length = 0; this.c.length = 0; }
  vert(x, y, z, u, v, r, g, b, a) { this.p.push(x, y, z, u, v); this.c.push(r, g, b, a); }
  /* pts: 3 arrays [x,y,z]; col int or array of 3 ints; sh = apply flat face light */
  tri(a, b, c, col, sh, uvs, alpha) {
    let cs;
    if (Array.isArray(col)) cs = col; else cs = [col, col, col];
    let f = 1;
    if (sh !== false) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (ny < 0 && sh !== 2) { nx = -nx; ny = -ny; nz = -nz; } // double-sided: light the up-facing side
      f = lightAt(nx, ny, nz);
    }
    const A = alpha === undefined ? 255 : alpha; const P = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const cc = cs[i]; const uv = uvs ? uvs[i] : [0, 0];
      this.vert(P[i][0], P[i][1], P[i][2], uv[0], uv[1],
        Math.min(255, (cc >> 16 & 255) * f) | 0, Math.min(255, (cc >> 8 & 255) * f) | 0, Math.min(255, (cc & 255) * f) | 0, A);
    }
  }
  quad(a, b, c, d, col, sh, uvs, alpha) {
    if (Array.isArray(col)) {
      this.tri(a, b, c, [col[0], col[1], col[2]], sh, uvs && [uvs[0], uvs[1], uvs[2]], alpha);
      this.tri(a, c, d, [col[0], col[2], col[3]], sh, uvs && [uvs[0], uvs[2], uvs[3]], alpha);
    } else {
      this.tri(a, b, c, col, sh, uvs && [uvs[0], uvs[1], uvs[2]], alpha);
      this.tri(a, c, d, col, sh, uvs && [uvs[0], uvs[2], uvs[3]], alpha);
    }
  }
  /* box centred at (cx,cy,cz) with half extents, transformed by matrix m (or null). k = texture repeat per unit */
  box(m, cx, cy, cz, hx, hy, hz, col, k, alpha, shadeMul) {
    const V = (x, y, z) => { const p = [cx + x * hx, cy + y * hy, cz + z * hz]; return m ? M4.pt(m, p[0], p[1], p[2]) : p; };
    const faces = [ // [normal-ish corners ccw seen from outside], dims for uv
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], hx * 2, hy * 2],      // +z
      [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], hx * 2, hy * 2],  // -z
      [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], hz * 2, hy * 2],      // +x
      [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], hz * 2, hy * 2],  // -x
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], hx * 2, hz * 2],      // +y
      [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], hx * 2, hz * 2]   // -y
    ];
    for (const f of faces) {
      const pts = [V(...f[0]), V(...f[1]), V(...f[2]), V(...f[3])];
      let uvs = null; if (k) { const u = f[4] * k, v = f[5] * k; uvs = [[0, v], [u, v], [u, 0], [0, 0]]; }
      let c = col; if (shadeMul) c = shadeCol(col, shadeMul);
      this.quad(pts[0], pts[1], pts[2], pts[3], c, true, uvs, alpha);
    }
  }
  /* upright prism/cylinder with n sides around (cx,cz), from y0 to y1 */
  prism(m, cx, cz, y0, y1, rx, rz, n, col, k, rot) {
    const V = (x, y, z) => m ? M4.pt(m, x, y, z) : [x, y, z];
    const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (rot || 0); pts.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]); }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const uu = Math.hypot(b[0] - a[0], b[1] - a[1]) * (k || 0), vv = (y1 - y0) * (k || 0);
      this.quad(V(b[0], y0, b[1]), V(a[0], y0, a[1]), V(a[0], y1, a[1]), V(b[0], y1, b[1]), col, true, k ? [[0, vv], [uu, vv], [uu, 0], [0, 0]] : null);
    }
    for (let i = 1; i < n - 1; i++) this.tri(V(pts[0][0], y1, pts[0][1]), V(pts[i + 1][0], y1, pts[i + 1][1]), V(pts[i][0], y1, pts[i][1]), col, true);
  }
  /* low-poly ellipsoid */
  blob(m, cx, cy, cz, rx, ry, rz, seg, rings, col, jitter, rnd, alpha) {
    const V = (x, y, z) => m ? M4.pt(m, x, y, z) : [x, y, z];
    const R = rnd || Math.random; const grid = [];
    for (let j = 0; j <= rings; j++) {
      const row = []; const th = j / rings * Math.PI;
      for (let i = 0; i < seg; i++) {
        const ph = i / seg * TAU; const jt = jitter ? 1 + (R() - 0.5) * jitter : 1;
        row.push(V(cx + Math.sin(th) * Math.cos(ph) * rx * jt, cy + Math.cos(th) * ry * jt, cz + Math.sin(th) * Math.sin(ph) * rz * jt));
      }
      grid.push(row);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      const cvar = jitter ? shadeCol(col, 0.9 + R() * 0.2) : col;
      this.quad(grid[j][i], grid[j][i2], grid[j + 1][i2], grid[j + 1][i], cvar, 2, null, alpha);
    }
  }
}

class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: true, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL unavailable');
    this.canvas = canvas;
    const vs = `attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol;
      uniform mat4 uVP; uniform vec3 uEye; uniform vec2 uFog;
      varying vec4 vCol; varying vec2 vUV; varying float vFog;
      void main(){ gl_Position=uVP*vec4(aPos,1.0); vCol=aCol; vUV=aUV;
        float d=length(aPos-uEye); vFog=clamp((d-uFog.x)/(uFog.y-uFog.x),0.0,1.0); }`;
    const fs = `precision mediump float; uniform sampler2D uTex; uniform vec3 uFogCol; uniform float uOpacity;
      varying vec4 vCol; varying vec2 vUV; varying float vFog;
      void main(){ vec4 t=texture2D(uTex,vUV); vec4 c=t*vCol; if(c.a<0.02) discard;
        gl_FragColor=vec4(mix(c.rgb,uFogCol,vFog*vFog),c.a*uOpacity); }`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = this.prog = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    this.aPos = gl.getAttribLocation(pr, 'aPos'); this.aUV = gl.getAttribLocation(pr, 'aUV'); this.aCol = gl.getAttribLocation(pr, 'aCol');
    this.uVP = gl.getUniformLocation(pr, 'uVP'); this.uEye = gl.getUniformLocation(pr, 'uEye'); this.uFog = gl.getUniformLocation(pr, 'uFog');
    this.uOpacity=gl.getUniformLocation(pr,'uOpacity');gl.uniform1f(this.uOpacity,1);
    this.uFogCol = gl.getUniformLocation(pr, 'uFogCol'); this.uTex = gl.getUniformLocation(pr, 'uTex');
    this.textures = {}; this.fogCol = [0, 0, 0]; this.fogRange = [20, 34];
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.dynBuf = gl.createBuffer();
    // white 1x1
    const w = document.createElement('canvas'); w.width = w.height = 1; const wc = w.getContext('2d'); wc.fillStyle = '#fff'; wc.fillRect(0, 0, 1, 1);
    this.makeTexture('white', w, false);
  }
  makeTexture(name, cv, repeat) {
    const gl = this.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    const pot = (cv.width & (cv.width - 1)) === 0 && (cv.height & (cv.height - 1)) === 0;
    if (pot && name !== 'white') { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const wrap = repeat && pot ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    this.textures[name] = t;
  }
  pack(mesh) {
    const n = mesh.count; const buf = new ArrayBuffer(n * 24); const f = new Float32Array(buf), u = new Uint8Array(buf);
    for (let i = 0; i < n; i++) {
      f[i * 6] = mesh.p[i * 5]; f[i * 6 + 1] = mesh.p[i * 5 + 1]; f[i * 6 + 2] = mesh.p[i * 5 + 2]; f[i * 6 + 3] = mesh.p[i * 5 + 3]; f[i * 6 + 4] = mesh.p[i * 5 + 4];
      const o = (i * 6 + 5) * 4; u[o] = mesh.c[i * 4]; u[o + 1] = mesh.c[i * 4 + 1]; u[o + 2] = mesh.c[i * 4 + 2]; u[o + 3] = mesh.c[i * 4 + 3];
    }
    return buf;
  }
  upload(mesh) {
    const gl = this.gl; const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, this.pack(mesh), gl.STATIC_DRAW);
    return { buf: b, count: mesh.count, tex: mesh.tex, blend: mesh.blend };
  }
  bindAttribs() {
    const gl = this.gl;
    gl.enableVertexAttribArray(this.aPos); gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.aUV); gl.vertexAttribPointer(this.aUV, 2, gl.FLOAT, false, 24, 12);
    gl.enableVertexAttribArray(this.aCol); gl.vertexAttribPointer(this.aCol, 4, gl.UNSIGNED_BYTE, true, 24, 20);
  }
  drawGPU(g) {
    if (!g.count) return; const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf); this.bindAttribs();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures[g.tex] || this.textures.white); gl.uniform1i(this.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, g.count);
  }
  drawDynamic(mesh) {
    if (!mesh.count) return; const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf); gl.bufferData(gl.ARRAY_BUFFER, this.pack(mesh), gl.DYNAMIC_DRAW); this.bindAttribs();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures[mesh.tex] || this.textures.white); gl.uniform1i(this.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }
  begin(cam) {
    const gl = this.gl;
    gl.viewport(0, 0, VW, VH);
    gl.clearColor(this.fogCol[0], this.fogCol[1], this.fogCol[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uVP, false, new Float32Array(cam.vp));
    gl.uniform3f(this.uEye, cam.eye[0], cam.eye[1], cam.eye[2]);
    gl.uniform2f(this.uFog, this.fogRange[0], this.fogRange[1]);
    gl.uniform3f(this.uFogCol, this.fogCol[0], this.fogCol[1], this.fogCol[2]);
    gl.depthMask(true);
  }
  setDepthWrite(b) { this.gl.depthMask(b); }
}

/* RS2-style orbit camera. focal length 512px over a 512x334 viewport. */
class Camera {
  constructor() { this.tx = 0; this.ty = 0; this.tz = 0; this.yaw = 0; this.pitch = 0.78; this.dist = 15.5; this.vp = M4.ident(); this.eye = [0, 0, 0]; this.fovy = 2 * Math.atan(167 / 512); }
  update() {
    const dh = Math.cos(this.pitch) * this.dist, dv = Math.sin(this.pitch) * this.dist;
    this.eye = [this.tx - Math.sin(this.yaw) * dh, this.ty + dv, this.tz + Math.cos(this.yaw) * dh];
    const view = M4.lookAt(this.eye, [this.tx, this.ty, this.tz], [0, 1, 0]);
    this.view = view;
    this.vp = M4.mul(M4.persp(this.fovy, VW / VH, 0.4, 90), view);
    // basis for picking
    let fx = this.tx - this.eye[0], fy = this.ty - this.eye[1], fz = this.tz - this.eye[2]; const l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
    let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0; // f x up
    const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    this.fwd = [fx, fy, fz]; this.right = [rx, ry, rz]; this.up = [ux, uy, uz];
    this.tanY = Math.tan(this.fovy / 2); this.tanX = this.tanY * VW / VH;
  }
  /* world -> viewport pixels (0..512, 0..334); returns null if behind camera */
  project(x, y, z) {
    const m = this.vp; const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw < 0.4) return null;
    return [(cx / cw * 0.5 + 0.5) * VW, (1 - (cy / cw * 0.5 + 0.5)) * VH, cw];
  }
  /* ray through viewport pixel */
  ray(px, py) {
    const nx = (px / VW) * 2 - 1, ny = 1 - (py / VH) * 2;
    const d = [this.fwd[0] + this.right[0] * nx * this.tanX + this.up[0] * ny * this.tanY,
      this.fwd[1] + this.right[1] * nx * this.tanX + this.up[1] * ny * this.tanY,
      this.fwd[2] + this.right[2] * nx * this.tanX + this.up[2] * ny * this.tanY];
    const l = Math.hypot(...d); return { o: this.eye, d: [d[0] / l, d[1] / l, d[2] / l] };
  }
}
