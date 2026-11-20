// ---------- First-person 3D resort (Three.js) ----------
// Everything here is built from the same game data the office computer edits,
// so the 3D world always matches the manager map.
const W3D = {
  active: false, ready: false, mode: 'walk', keys: {}, yaw: 0, pitch: -0.05,
  P: { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, ground: true },
  sig: '', texT: 0, treeCenter: null, treeVer: -1, msgT: 0,

  supported() { try { const c = document.createElement('canvas'); return !!(window.THREE && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } },

  // ---------- setup ----------
  init() {
    if (this.ready) return;
    const c = document.getElementById('c3d');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.82;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 14000);
    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x8d9db3, 0.65); this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0dc, 2.0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -170; sc.right = 170; sc.top = 170; sc.bottom = -170; sc.near = 10; sc.far = 1600;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
    this.scene.add(sun); this.scene.add(sun.target);
    this.scene.fog = new THREE.FogExp2(0xdfe8f3, 0.00028);
    this.makeSky();
    this.makeSnowfall();
    this.mats = {
      steel: new THREE.MeshStandardMaterial({ color: 0x7c8590, metalness: 0.6, roughness: 0.45 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x23272d, metalness: 0.3, roughness: 0.6 }),
      snow: new THREE.MeshStandardMaterial({ color: 0xf6f9ff, roughness: 0.85 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0xa7a39b, roughness: 0.95 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x1d2c3a, metalness: 0.4, roughness: 0.15, transparent: true, opacity: 0.85 }),
      bubble: new THREE.MeshStandardMaterial({ color: 0x5ea4d8, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.45 }),
      vcol: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.9 }),
      orange: new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: 0.5, metalness: 0.2 }),
      cable: new THREE.LineBasicMaterial({ color: 0x1b1d20 }),
    };
    this.groups = {};
    for (const k of ['terrain', 'trees', 'lifts', 'buildings', 'npcs', 'guests', 'fleet', 'build']) { this.groups[k] = new THREE.Group(); this.scene.add(this.groups[k]); }
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.ready = true;
  },
  resize() {
    if (!this.renderer) return;
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  },
  H(x, z) { return Terrain.heightAt(x, z) - this.y0; },

  makeSky() {
    const g = new THREE.SphereGeometry(10000, 32, 16);
    this.skyU = { top: { value: new THREE.Color(0x3d7fd6) }, hor: { value: new THREE.Color(0xdfe9f5) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(0xfff2d0) } };
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vP; void main(){ vec3 d = normalize(vP); float h = max(d.y, 0.0); vec3 c = mix(hor, top, pow(h, 0.55)); if (d.y < 0.0) c = hor; float s = max(dot(d, sunDir), 0.0); c += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.25); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new THREE.Mesh(g, m); this.sky.renderOrder = -1; this.scene.add(this.sky);
  },
  makeSnowfall() {
    const n = 3000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 120; pos[i * 3 + 1] = Math.random() * 60; pos[i * 3 + 2] = (Math.random() - 0.5) * 120; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.visible = false; this.scene.add(this.snow);
  },

  // ---------- helpers ----------
  clearGroup(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } },
  box(w, h, d, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m; },
  cyl(rt, rb, h, mat, seg = 10, parent) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m; },
  std(color, extra = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, extra)); },
  // merge simple geometries into one with vertex colors
  merge(parts) {
    let total = 0; const prepped = parts.map(p => { let g = p.g.index ? p.g.toNonIndexed() : p.g; if (p.m) g.applyMatrix4(p.m); total += g.attributes.position.count; return { g, c: p.c }; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const { g, c } of prepped) {
      const n = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      for (let i = 0; i < n; i++) {
        const cc = typeof c === 'function' ? c(g.attributes.position.array[i * 3 + 1], g.attributes.normal.array[i * 3 + 1]) : c;
        col[(o + i) * 3] = cc[0]; col[(o + i) * 3 + 1] = cc[1]; col[(o + i) * 3 + 2] = cc[2];
      }
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  },
  M(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) { const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s)); return m; },
  textTex(text, opts = {}) {
    const c = document.createElement('canvas'); c.width = opts.w || 512; c.height = opts.h || 128;
    const x = c.getContext('2d');
    x.fillStyle = opts.bg || '#2b1d12'; x.fillRect(0, 0, c.width, c.height);
    if (opts.border !== false) { x.strokeStyle = opts.fg || '#f3e3c3'; x.lineWidth = 8; x.strokeRect(8, 8, c.width - 16, c.height - 16); }
    x.fillStyle = opts.fg || '#f3e3c3'; x.font = `bold ${opts.size || 58}px Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, c.width / 2, c.height / 2 + 4);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  },

  // ---------- world build ----------
  buildWorld(force) {
    this.y0 = Terrain.minE;
    if (force || this.builtSeed !== Terrain.seed) {
      this.builtSeed = Terrain.seed;
      this.clearGroup(this.groups.terrain);
      this.makeTerrainTexture();
      this.makeTerrain();
      this.makeOuterTerrain();
      this.treeVer = -1; this.allTrees = null;
    }
    this.refreshTexture();
    this.sig = '';
    this.syncEntities(true);
  },
  makeTerrainTexture() {
    const TW = 1536, TH = Math.round(TW * MAP_H / MAP_W);
    const WW = MAP_W * CELL, HH = MAP_H * CELL;
    const base = document.createElement('canvas'); base.width = TW; base.height = TH;
    const ctx = base.getContext('2d'); const img = ctx.createImageData(TW, TH); const d = img.data;
    const treeAt = (mx, my) => { const fx = U.clamp(mx / CELL - 0.5, 0, MAP_W - 1.001), fy = U.clamp(my / CELL - 0.5, 0, MAP_H - 1.001); const x = fx | 0, y = fy | 0, tx = fx - x, ty = fy - y, T = Terrain.trees, i = y * MAP_W + x; return U.lerp(U.lerp(T[i], T[i + 1], tx), U.lerp(T[i + MAP_W], T[i + MAP_W + 1], tx), ty); };
    for (let py = 0; py < TH; py++) for (let px = 0; px < TW; px++) {
      const mx = (px + 0.5) / TW * WW, my = (py + 0.5) / TH * HH;
      const hx = Terrain.heightAt(mx + 3, my) - Terrain.heightAt(mx - 3, my), hy = Terrain.heightAt(mx, my + 3) - Terrain.heightAt(mx, my - 3);
      const grade = Math.hypot(hx, hy) / 6 * 100;
      const hsh = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453, grain = (hsh - Math.floor(hsh) - 0.5) * 10;
      const n2 = Math.sin(mx * 0.05) * Math.sin(my * 0.07) * 6;
      let r = 238 + grain + n2, g = 242 + grain + n2, b = 249 + grain + n2 * 0.5;
      // concave gullies collect blue shade, convex ridges catch light
      const lap = (Terrain.heightAt(mx + 18, my) + Terrain.heightAt(mx - 18, my) + Terrain.heightAt(mx, my + 18) + Terrain.heightAt(mx, my - 18)) / 4 - Terrain.heightAt(mx, my);
      const ao = U.clamp(lap * 0.9, -6, 10);
      r -= ao * 2.2; g -= ao * 1.6; b -= ao * 0.5;
      const tr = treeAt(mx, my);
      if (tr > 0.05) { const k = Math.min(0.75, tr); r = U.lerp(r, 92, k * 0.55); g = U.lerp(g, 112, k * 0.55); b = U.lerp(b, 104, k * 0.55); }
      const rk = U.clamp((grade - 62) / 16, 0, 1);
      if (rk > 0) { const n = (Math.sin(mx * 0.9 + my * 0.37) + Math.sin(mx * 0.23 - my * 1.1)) * 0.25 + 0.5; r = U.lerp(r, 96 + n * 40, rk * 0.85); g = U.lerp(g, 94 + n * 38, rk * 0.85); b = U.lerp(b, 100 + n * 34, rk * 0.85); }
      if (Terrain.lake && Math.hypot(mx - Terrain.lake.x, (my - Terrain.lake.y) * 1.4) < Terrain.lake.r) { r = 176 + grain; g = 204 + grain; b = 228 + grain; }
      else { const wv = Terrain.wetAt(mx, my); if (wv > 0.16) { const k = U.clamp((wv - 0.16) * 4, 0, 0.85); r = U.lerp(r, 128, k); g = U.lerp(g, 166, k); b = U.lerp(b, 204, k); } }
      const o = (py * TW + px) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.texBase = base;
    this.texCanvas = document.createElement('canvas'); this.texCanvas.width = TW; this.texCanvas.height = TH;
    this.terrainTex = new THREE.CanvasTexture(this.texCanvas);
    this.terrainTex.encoding = THREE.sRGBEncoding; this.terrainTex.anisotropy = 8;
  },
  refreshTexture() {
    const c = this.texCanvas, x = c.getContext('2d'), TW = c.width, TH = c.height;
    const sx = TW / (MAP_W * CELL), sy = TH / (MAP_H * CELL);
    x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(this.texBase, 0, 0);
    x.setTransform(sx, 0, 0, sy, 0, 0);
    x.lineCap = 'round'; x.lineJoin = 'round';
    // lift lines (cut corridors)
    for (const l of G.lifts) { x.strokeStyle = 'rgba(236,240,247,0.9)'; x.lineWidth = LIFTS[l.kind].cat === 'Surface' ? 8 : 16; x.beginPath(); x.moveTo(l.bottom.x, l.bottom.y); x.lineTo(l.top.x, l.top.y); x.stroke(); }
    // runs: bright groomed snow + surface state from the manager map
    if (G.runs.length) {
      const tmp = this.runTmp || (this.runTmp = document.createElement('canvas')); tmp.width = TW; tmp.height = TH;
      const t = tmp.getContext('2d'); t.setTransform(sx, 0, 0, sy, 0, 0); t.clearRect(0, 0, MAP_W * CELL, MAP_H * CELL);
      t.lineCap = 'round'; t.lineJoin = 'round';
      for (const r of G.runs) { t.strokeStyle = '#f7f9fd'; t.lineWidth = r.width; t.beginPath(); r.points.forEach((p, k) => k ? t.lineTo(p.x, p.y) : t.moveTo(p.x, p.y)); t.stroke(); }
      t.globalCompositeOperation = 'source-atop'; t.globalAlpha = 0.9; t.imageSmoothingEnabled = true;
      t.drawImage(Terrain.cSurf, 0, 0, MAP_W * CELL, MAP_H * CELL);
      t.globalAlpha = 1; t.globalCompositeOperation = 'source-over';
      x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(tmp, 0, 0); x.setTransform(sx, 0, 0, sy, 0, 0);
    }
    // plowed village ground, parking lots, plazas
    for (const b of G.buildings) {
      const R = BUILDINGS[b.kind] ? BUILDINGS[b.kind].r : 10;
      x.fillStyle = b.kind === 'parking' ? '#5d6066' : b.kind === 'plaza' || b.kind === 'heli' ? '#8f8a84' : 'rgba(205,210,216,0.85)';
      if (b.kind === 'parking') { x.fillRect(b.x - R, b.y - R * 0.65, R * 2, R * 1.3); x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 0.3; for (let px = -R + 3; px < R - 2; px += 3.2) { x.beginPath(); x.moveTo(b.x + px, b.y - R * 0.6); x.lineTo(b.x + px, b.y - R * 0.15); x.moveTo(b.x + px, b.y + R * 0.15); x.lineTo(b.x + px, b.y + R * 0.6); x.stroke(); } }
      else { x.beginPath(); x.ellipse(b.x, b.y, R * 1.05, R * 0.9, 0, 0, 7); x.fill(); }
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    this.terrainTex.needsUpdate = true;
  },
  makeTerrain() {
    const g = new THREE.BufferGeometry();
    const n = MAP_W * MAP_H, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      pos[i * 3] = (x + 0.5) * CELL; pos[i * 3 + 1] = Terrain.elev[i] - this.y0; pos[i * 3 + 2] = (y + 0.5) * CELL;
      uv[i * 2] = (x + 0.5) / MAP_W; uv[i * 2 + 1] = 1 - (y + 0.5) / MAP_H;
    }
    const idx = new Uint32Array((MAP_W - 1) * (MAP_H - 1) * 6); let k = 0;
    for (let y = 0; y < MAP_H - 1; y++) for (let x = 0; x < MAP_W - 1; x++) {
      const a = y * MAP_W + x, b = a + 1, c = a + MAP_W, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: this.terrainTex, roughness: 0.88, metalness: 0 });
    this.snowShader(mat);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true; this.groups.terrain.add(m);
  },
  // close-up snow detail: wind ripples, grain and sparkle computed from world position
  snowShader(mat) {
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
float dist = length(vWP - cameraPosition);
float near = 1.0 - smoothstep(30.0, 260.0, dist);
float rip = vn(vWP.xz * vec2(0.35, 0.9)) * 0.6 + vn(vWP.xz * 2.3) * 0.4;
diffuseColor.rgb *= mix(1.0, 0.93 + rip * 0.1, near);
float sp = step(0.9965, h21(floor(vWP.xz * 9.0) + floor(cameraPosition.xz * 0.5)));
diffuseColor.rgb += sp * near * 0.6;`);
    };
  },
  // surrounding mountains so the valley doesn't end in a void
  makeOuterTerrain() {
    const WW = MAP_W * CELL, HH = MAP_H * CELL, ext = 5000, step = 60;
    const nx = Math.ceil((WW + ext * 2) / step), nz = Math.ceil((HH + ext * 1.2 + ext) / step);
    const g = new THREE.PlaneGeometry(nx * step, nz * step, nx, nz); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), nz2 = new Noise(Terrain.seed + 5);
    const cx = WW / 2, cz = (HH - ext * 0.1) / 2;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, z = p.getZ(i) + cz;
      const ox = Math.max(0, -x, x - WW), oz = Math.max(0, -z, z - HH);
      const out = Math.hypot(ox, oz);
      let h = Terrain.heightAt(U.clamp(x, 0, WW), U.clamp(z, 0, HH)) - this.y0;
      const ridge = nz2.ridge(x / 2600, z / 2600, 4), f = nz2.fbm(x / 900, z / 900, 3);
      if (z > HH) h = h * Math.exp(-oz / 900) + (oz > 1500 ? (oz - 1500) * 0.35 * ridge : 0); // valley continues south
      h += Math.max(0, out - 150) * (0.16 + ridge * 0.38) * (z > HH && !ox ? 0.4 : 1) + (f - 0.5) * Math.min(out, 400) * 0.2;
      if (out < 1) h -= 3; // tuck under the playable terrain
      p.setX(i, x); p.setZ(i, z); p.setY(i, h);
      const tr = U.clamp((f - 0.45) * 3, 0, 1) * U.clamp(1 - (h - 900) / 400, 0, 1);
      const rock = U.clamp((ridge - 0.75) * 3, 0, 0.6);
      col[i * 3] = U.lerp(U.lerp(0.93, 0.36, tr * 0.6), 0.5, rock); col[i * 3 + 1] = U.lerp(U.lerp(0.95, 0.44, tr * 0.6), 0.5, rock); col[i * 3 + 2] = U.lerp(U.lerp(0.98, 0.42, tr * 0.6), 0.53, rock);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    m.receiveShadow = true; this.groups.terrain.add(m);
  },

  // ---------- trees (instanced, within view radius) ----------
  treeGeos() {
    if (this._tg) return this._tg;
    const trunk = [0.17, 0.1, 0.06];
    // snow-laden spruce: 6 drooping tiers, snow on the upward-facing branch tops
    const tier = (r, h, y, rot, seed) => {
      const g = new THREE.ConeGeometry(r, h, 9, 2, true);
      const p = g.attributes.position, rr = U.seeded(seed);
      for (let i = 0; i < p.count; i++) { const yy = p.getY(i); if (yy < -h * 0.3) { const k = 1 + (rr() - 0.5) * 0.35; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, yy - rr() * 0.35); } }
      g.computeVertexNormals();
      return { g, m: this.M(0, y, 0, rot), c: (vy, ny) => ny > 0.5 && rr() < 0.55 ? [0.78, 0.82, 0.88] : (vy < y - h * 0.3 ? [0.03, 0.09, 0.05] : [0.05, 0.14, 0.075]) };
    };
    const spruce = this.merge([
      { g: new THREE.CylinderGeometry(0.16, 0.3, 3, 6), m: this.M(0, 1.5), c: trunk },
      tier(2.6, 2.6, 2.4, 0, 1), tier(2.25, 2.4, 3.8, 0.4, 2), tier(1.9, 2.2, 5.1, 0.9, 3), tier(1.5, 2.0, 6.3, 1.3, 4), tier(1.1, 1.8, 7.4, 1.8, 5), tier(0.7, 1.8, 8.5, 2.2, 6),
      { g: new THREE.ConeGeometry(0.25, 1.2, 6), m: this.M(0, 9.6), c: [0.75, 0.8, 0.86] },
    ]);
    // bare aspen: pale trunk with a sparse grey-brown twig crown
    const twig = [0.3, 0.26, 0.23];
    const parts = [{ g: new THREE.CylinderGeometry(0.1, 0.17, 9, 6), m: this.M(0, 4.5), c: (vy) => vy % 1.3 < 0.12 ? [0.18, 0.17, 0.16] : [0.78, 0.77, 0.72] }];
    for (let k = 0; k < 7; k++) { const a = k * 2.4, h = 4.5 + k * 0.6; parts.push({ g: new THREE.CylinderGeometry(0.03, 0.06, 2.4, 4), m: this.M(Math.cos(a) * 0.5, h + 0.6, Math.sin(a) * 0.5, -a, 0, 0.8), c: twig }); }
    for (let k = 0; k < 9; k++) { const a = k * 1.9 + 0.5; parts.push({ g: new THREE.CylinderGeometry(0.015, 0.035, 1.8, 3), m: this.M(Math.cos(a) * 0.35, 8.2 + (k % 3) * 0.3, Math.sin(a) * 0.35, -a, 0, 0.45), c: twig }); }
    const aspen = this.merge(parts);
    return (this._tg = { conifer: spruce, aspen });
  },
  collectTrees() {
    const list = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x, d = Terrain.trees[i]; if (d <= 0) continue;
      const r = U.seeded(i * 2654435761 + 7), n = Math.ceil(d * 2.6), low = Terrain.elev[i] < Terrain.minE + 320, high = Terrain.elev[i] > Terrain.treeLine - 90;
      for (let k = 0; k < n; k++) list.push((x + r()) * CELL, (y + r()) * CELL, (high ? 0.55 : 0.75) + r() * 0.6, low && r() < 0.3 ? 1 : 0, r() * 6.28);
    }
    this.allTrees = new Float32Array(list);
  },
  updateTrees(force) {
    const P = this.P;
    if (Terrain.treeVer !== this.treeVer || !this.allTrees) { this.collectTrees(); this.treeVer = Terrain.treeVer; force = true; }
    if (!force && this.treeCenter && Math.hypot(P.x - this.treeCenter.x, P.z - this.treeCenter.z) < 140) return;
    this.treeCenter = { x: P.x, z: P.z };
    const R = 1100, A = this.allTrees, geos = this.treeGeos();
    const sel = [[], []];
    for (let i = 0; i < A.length; i += 5) { const dx = A[i] - P.x, dz = A[i + 1] - P.z; if (dx * dx + dz * dz < R * R) sel[A[i + 3]].push(i); }
    this.clearGroup(this.groups.trees); this._tg = null; const g2 = this.treeGeos();
    if (!this.treeMat) { this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    ['conifer', 'aspen'].forEach((kind, t) => {
      const ids = sel[t]; if (!ids.length) return;
      const mesh = new THREE.InstancedMesh(g2[kind], this.treeMat, ids.length);
      ids.forEach((i, j) => { const s = A[i + 2]; e.set(0, A[i + 4], 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(A[i], this.H(A[i], A[i + 1]) - 0.3, A[i + 1]), q, new THREE.Vector3(s, s * (0.9 + (A[i + 4] % 0.4)), s)); mesh.setMatrixAt(j, m4); });
      mesh.castShadow = true; mesh.receiveShadow = true; this.groups.trees.add(mesh);
    });
  },

  // ---------- people ----------
  personGeo() {
    if (this._pg) return this._pg;
    const W = [1, 1, 1], pants = [0.16, 0.17, 0.2], skin = [0.86, 0.7, 0.58], helm = [0.12, 0.12, 0.14];
    this._pg = this.merge([
      { g: new THREE.CylinderGeometry(0.085, 0.075, 0.82, 8), m: this.M(-0.11, 0.42, 0.02, 0, 0.12), c: pants }, { g: new THREE.CylinderGeometry(0.085, 0.075, 0.82, 8), m: this.M(0.11, 0.42, 0.02, 0, 0.12), c: pants },
      { g: new THREE.BoxGeometry(0.2, 0.14, 0.32), m: this.M(-0.11, 0.07, 0.05), c: [0.15, 0.15, 0.17] }, { g: new THREE.BoxGeometry(0.2, 0.14, 0.32), m: this.M(0.11, 0.07, 0.05), c: [0.15, 0.15, 0.17] },
      { g: new THREE.CylinderGeometry(0.2, 0.17, 0.66, 10), m: this.M(0, 1.14, 0, 0, 0.15), c: W },
      { g: new THREE.SphereGeometry(0.2, 10, 6), m: this.M(0, 1.45), c: W },
      { g: new THREE.CylinderGeometry(0.055, 0.05, 0.58, 6), m: this.M(-0.26, 1.08, 0.08, 0, -0.35, 0.18), c: W }, { g: new THREE.CylinderGeometry(0.055, 0.05, 0.58, 6), m: this.M(0.26, 1.08, 0.08, 0, -0.35, -0.18), c: W },
      { g: new THREE.CylinderGeometry(0.012, 0.012, 1.2, 4), m: this.M(-0.32, 0.55, 0.3, 0, 0.3), c: [0.2, 0.2, 0.22] }, { g: new THREE.CylinderGeometry(0.012, 0.012, 1.2, 4), m: this.M(0.32, 0.55, 0.3, 0, 0.3), c: [0.2, 0.2, 0.22] },
      { g: new THREE.SphereGeometry(0.14, 8, 6), m: this.M(0, 1.6), c: skin },
      { g: new THREE.SphereGeometry(0.155, 8, 6, 0, 6.3, 0, 1.5), m: this.M(0, 1.62), c: helm },
      { g: new THREE.BoxGeometry(0.2, 0.08, 0.06), m: this.M(0, 1.6, 0.13), c: [0.3, 0.55, 0.8] },
    ]);
    return this._pg;
  },
  skiGeo() { return this._sg || (this._sg = this.merge([{ g: new THREE.BoxGeometry(0.09, 0.03, 1.7), m: this.M(-0.12, 0.02), c: [0.9, 0.2, 0.2] }, { g: new THREE.BoxGeometry(0.09, 0.03, 1.7), m: this.M(0.12, 0.02), c: [0.9, 0.2, 0.2] }])); },
  makePerson(color, opts = {}) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(this.personGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness: 0.75 }));
    m.castShadow = true; g.add(m);
    if (opts.cross) { const c = this.box(0.18, 0.18, 0.02, this.std(0xffffff), 0, 1.2, 0.14, g); this.box(0.06, 0.18, 0.025, this.std(0xd62828), 0, 1.2, 0.14, g); }
    if (opts.skis) { const s = new THREE.Mesh(this.skiGeo(), this.mats.vcol); g.add(s); }
    if (opts.scale) g.scale.setScalar(opts.scale);
    return g;
  },
  dog(color = 0x6b4a2b) {
    const g = new THREE.Group(), m = this.std(color);
    this.box(0.3, 0.3, 0.8, m, 0, 0.55, 0, g); this.box(0.24, 0.24, 0.3, m, 0, 0.78, 0.48, g); this.box(0.1, 0.12, 0.14, this.std(0x2a2018), 0, 0.74, 0.66, g);
    for (const [x, z] of [[-0.1, -0.28], [0.1, -0.28], [-0.1, 0.28], [0.1, 0.28]]) this.box(0.08, 0.4, 0.08, m, x, 0.2, z, g);
    this.box(0.32, 0.06, 0.45, this.std(0xd62828), 0, 0.71, 0, g); // rescue vest
    return g;
  },

  // ---------- snowcat (farm-sim style) ----------
  makeSnowcat(kind) {
    const M = GROOMERS[kind] || GROOMERS.std;
    const g = new THREE.Group(), body = this.std(M.color, { roughness: 0.45, metalness: 0.3 });
    this.box(1.1, 1.0, 6.6, this.mats.dark, -1.55, 0.6, 0, g); this.box(1.1, 1.0, 6.6, this.mats.dark, 1.55, 0.6, 0, g);
    for (let k = -3; k <= 3; k++) { this.box(1.15, 0.12, 0.25, this.std(0x3a3d42), -1.55, 1.12, k * 0.9, g); this.box(1.15, 0.12, 0.25, this.std(0x3a3d42), 1.55, 1.12, k * 0.9, g); }
    this.box(2.4, 1.1, 5.2, body, 0, 1.45, -0.2, g);
    this.box(2.3, 1.4, 2.2, this.mats.glass, 0, 2.6, 0.8, g);
    this.box(2.4, 0.15, 2.4, body, 0, 3.35, 0.8, g);
    const lb = this.box(2.0, 0.15, 0.2, this.std(0xffffff, { emissive: 0xfff3c0, emissiveIntensity: 0.6 }), 0, 3.5, 1.9, g); lb.castShadow = false;
    this.box(0.25, 0.25, 0.25, this.std(0xffa000, { emissive: 0xff8800, emissiveIntensity: 0.8 }), 0.9, 3.55, 0, g);
    this.cyl(0.08, 0.08, 1.2, this.mats.steel, 8, g).position.set(-0.9, 3.0, -1.2);
    // blade
    const bl = this.std(0xd8dde4, { metalness: 0.5, roughness: 0.4 });
    for (let k = -1; k <= 1; k++) { const p = this.box(M.width / 3 + 0.05, 1.2, 0.18, bl, k * M.width / 3, 0.9, 4.25 + Math.abs(k) * 0.25, g); p.rotation.y = -k * 0.2; }
    this.box(0.2, 0.2, 1.0, this.mats.steel, -0.8, 1.0, 3.6, g); this.box(0.2, 0.2, 1.0, this.mats.steel, 0.8, 1.0, 3.6, g);
    // tiller + finisher comb
    const t = this.cyl(0.42, 0.42, M.width, this.std(0x9aa1a9, { metalness: 0.5 }), 12, g); t.rotation.z = Math.PI / 2; t.position.set(0, 0.6, -4.3);
    this.box(M.width + 0.2, 0.6, 0.6, this.std(0x6d737a), 0, 1.0, -4.3, g);
    this.box(M.width, 0.08, 0.9, this.std(0x2b2d31), 0, 0.15, -4.95, g);
    if (M.winch) { const w = this.cyl(0.5, 0.5, 0.6, this.mats.steel, 12, g); w.rotation.z = Math.PI / 2; w.position.set(0, 2.25, -1.8); }
    g.userData.width = M.width;
    return g;
  },

  // ---------- lifts ----------
  liftPath(l) {
    const T = LIFTS[l.kind], surface = T.cat === 'Surface';
    const a = l.bottom, b = l.top, ang = Math.atan2(b.y - a.y, b.x - a.x);
    const gap = surface ? 0 : T.cat === 'Tram' ? 6 : T.cat === 'Gondola' ? 3.2 : T.seats >= 6 ? 3.2 : 2.6;
    const ts = [0, ...l.towers, 1];
    const sup = ts.map((t, i) => { const x = U.lerp(a.x, b.x, t), z = U.lerp(a.y, b.y, t); const end = i === 0 || i === ts.length - 1; return this.H(x, z) + (surface ? (l.kind === 'carpet' ? 0.4 : end ? 2 : 4.5) : end ? (T.cat === 'Gondola' || T.cat === 'Tram' ? 7.5 : 6) : (T.cat === 'Tram' ? 28 : T.cat === 'Gondola' ? 15 : 10.5)); });
    const at = (t, side) => {
      t = U.clamp(t, 0, 1); let k = 0; while (k < ts.length - 2 && t > ts[k + 1]) k++;
      const f = (t - ts[k]) / Math.max(1e-6, ts[k + 1] - ts[k]);
      const seg = (ts[k + 1] - ts[k]) * l.len;
      const y = U.lerp(sup[k], sup[k + 1], f) - Math.sin(Math.PI * f) * seg * (surface ? 0.004 : 0.018);
      const px = -Math.sin(ang), pz = Math.cos(ang);
      return { x: U.lerp(a.x, b.x, t) + px * gap * side, z: U.lerp(a.y, b.y, t) + pz * gap * side, y };
    };
    return { at, ang, gap, ts, sup, T, surface };
  },
  carrierGeo(T, kind) {
    const k = T.cat + kind;
    this._cg = this._cg || {};
    if (this._cg[k]) return this._cg[k];
    const steel = [0.22, 0.24, 0.27], seat = [0.12, 0.2, 0.45], pad = [0.2, 0.36, 0.7];
    let parts;
    if (T.cat === 'Gondola' || T.cat === 'Tram') {
      const big = T.cat === 'Tram', w = big ? 5 : 2.0, h = big ? 3.2 : 2.2, d = big ? 9 : 2.0, col = kind === 'funitel' ? [0.95, 0.75, 0.1] : big ? [0.75, 0.1, 0.12] : [0.82, 0.13, 0.16];
      parts = [
        { g: new THREE.BoxGeometry(0.12, 2.4, 0.12), m: this.M(0, -1.2), c: steel },
        { g: new THREE.BoxGeometry(w, h * 0.45, d), m: this.M(0, -2.4 - h * 0.78), c: col },
        { g: new THREE.BoxGeometry(w * 0.98, h * 0.45, d * 0.98), m: this.M(0, -2.4 - h * 0.33), c: [0.12, 0.17, 0.22] },
        { g: new THREE.BoxGeometry(w * 1.02, h * 0.1, d * 1.02), m: this.M(0, -2.4 - h * 0.05), c: col },
        { g: new THREE.BoxGeometry(0.8, 0.4, 0.8), m: this.M(0, -0.1), c: steel },
      ];
    } else if (T.cat === 'Surface') {
      parts = kind === 'tbar' ? [{ g: new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), m: this.M(0, -1.6), c: steel }, { g: new THREE.BoxGeometry(1.2, 0.08, 0.08), m: this.M(0, -3.2), c: [0.85, 0.75, 0.2] }]
        : [{ g: new THREE.BoxGeometry(0.06, 0.6, 0.06), m: this.M(0, -0.3), c: steel }];
    } else {
      const S = T.seats, w = S * 0.62;
      parts = [
        { g: new THREE.BoxGeometry(0.1, 2.6, 0.1), m: this.M(0, -1.3, -0.25), c: steel },
        { g: new THREE.BoxGeometry(w, 0.1, 0.1), m: this.M(0, -2.55, -0.25), c: steel },
        { g: new THREE.BoxGeometry(w, 0.14, 0.62), m: this.M(0, -2.75, 0.1), c: T.cat === 'Detachable' ? pad : seat },
        { g: new THREE.BoxGeometry(w, 0.7, 0.12), m: this.M(0, -2.35, -0.22, 0, -0.15), c: T.cat === 'Detachable' ? pad : seat },
        { g: new THREE.BoxGeometry(w, 0.05, 0.05), m: this.M(0, -2.15, 0.55), c: steel },
        { g: new THREE.BoxGeometry(w * 0.8, 0.05, 0.3), m: this.M(0, -3.15, 0.55), c: steel },
        { g: new THREE.BoxGeometry(0.4, 0.3, 0.3), m: this.M(0, 0, -0.25), c: steel },
      ];
    }
    return (this._cg[k] = this.merge(parts));
  },
  buildLift(l) {
    const P = this.liftPath(l), T = P.T, grp = new THREE.Group(); grp.userData.lift = l;
    const prog = l.buildDays > 0 ? U.clamp(1 - l.buildDays / T.days, 0, 0.95) : 1;
    const nTow = l.towers.length, builtTowers = Math.floor(nTow * Math.min(1, prog / 0.75));
    const towerMat = T.cat === 'Detachable' || T.cat === 'Gondola' ? this.std(0x8b939c, { metalness: 0.6, roughness: 0.4 }) : this.std(0x5f6f62, { metalness: 0.5, roughness: 0.5 });
    // towers
    l.towers.forEach((t, i) => {
      const x = U.lerp(l.bottom.x, l.top.x, t), z = U.lerp(l.bottom.y, l.top.y, t), gy = this.H(x, z), top = P.sup[i + 1];
      const tw = new THREE.Group(); tw.position.set(x, gy, z); tw.rotation.y = -P.ang + Math.PI / 2;
      let h = top - gy;
      if (i >= builtTowers) { if (i === builtTowers && prog < 1) h *= 0.35; else { this.box(1.6, 0.6, 1.6, this.mats.concrete, 0, 0.3, 0, tw); grp.add(tw); return; } }
      this.box(1.6, 0.6, 1.6, this.mats.concrete, 0, 0.3, 0, tw);
      const col = this.cyl(P.surface ? 0.18 : 0.32, P.surface ? 0.24 : 0.48, h, towerMat, 10, tw); col.position.y = h / 2;
      if (h === top - gy) {
        if (!P.surface) {
          this.box(P.gap * 2 + 1.6, 0.4, 0.4, towerMat, 0, h - 0.2, 0, tw);
          for (const s of [-1, 1]) { this.box(0.35, 0.35, 2.2, this.mats.dark, s * P.gap, h - 0.55, 0, tw); }
          this.box(0.08, h * 0.8, 0.08, this.mats.yellow, 0.42, h * 0.45, 0, tw); // ladder
        } else this.box(1.2, 0.2, 0.2, towerMat, 0, h, 0, tw);
      }
      grp.add(tw);
    });
    // terminals
    for (const [end, pt] of [[0, l.bottom], [1, l.top]]) {
      const term = new THREE.Group(); const gy = this.H(pt.x, pt.y); term.position.set(pt.x, gy, pt.y); term.rotation.y = -P.ang + Math.PI / 2;
      const cy = P.sup[end ? P.sup.length - 1 : 0] - gy;
      const done = prog >= (end ? 0.9 : 0.3);
      if (T.cat === 'Detachable' || T.cat === 'Gondola' || T.cat === 'Tram') {
        const big = T.cat !== 'Detachable';
        this.box(big ? 16 : 13, 0.6, big ? 12 : 8, this.mats.concrete, 0, 0.3, 0, term);
        if (done) {
          const shell = this.std(T.cat === 'Tram' ? 0x8d2a2a : 0xe8ebee, { roughness: 0.5, metalness: 0.2 });
          // rounded detachable terminal shell (bullwheel + haul rope inside), like modern high-speed lifts
          const len = big ? 10 : 8, rad = big ? 2.8 : 1.9;
          const capG = new THREE.CapsuleGeometry(rad, len, 6, 18); capG.rotateZ(Math.PI / 2); capG.scale(1, big ? 0.85 : 0.75, 1.55);
          const cap = new THREE.Mesh(capG, shell); cap.position.set(0, cy + 0.6, end ? -1 : 1); cap.castShadow = true; cap.receiveShadow = true; term.add(cap);
          const band = new THREE.Mesh(new THREE.CapsuleGeometry(rad * 1.01, len, 4, 18, 1), this.std(0xc8202c)); band.geometry.rotateZ(Math.PI / 2); band.scale.set(1, 0.12, 1.57); band.position.set(0, cy + 0.2, end ? -1 : 1); term.add(band);
          this.box(len + rad * 2, 0.3, 3.2, this.mats.steel, 0, cy - 1.6, end ? -2.5 : 3.5, term); // loading/unloading ramp
          for (const s of [-1, 1]) this.box(1, cy, 1, this.mats.steel, s * 4, cy / 2, end ? -1 : 1, term);
          if (big) { const roof = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 14.2, 16, 1, false, 0, Math.PI), this.mats.snow); roof.rotation.z = Math.PI / 2; roof.position.set(0, cy + 3, end ? -1 : 1); roof.castShadow = true; term.add(roof); }
          this.box(2.6, 2.6, 2.6, this.mats.glass, 5.5, 1.3, end ? 4 : -4, term); // operator booth
        } else this.addCrane(term, 0, 0, 22);
      } else if (P.surface) {
        this.cyl(0.25, 0.3, cy + 1, this.mats.steel, 8, term).position.y = (cy + 1) / 2;
        const bw = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 6, 16), this.mats.dark); bw.rotation.x = Math.PI / 2; bw.position.y = cy; term.add(bw);
        if (!end) this.hut(term, 3, 0, 0x8a5a36);
      } else {
        this.box(5, 0.5, 5, this.mats.concrete, 0, 0.25, 0, term);
        if (done) {
          this.cyl(0.45, 0.6, cy, towerMat, 10, term).position.y = cy / 2;
          const bw = new THREE.Mesh(new THREE.TorusGeometry(P.gap, 0.18, 8, 24), this.mats.dark); bw.rotation.x = Math.PI / 2; bw.position.y = cy; term.add(bw);
          this.box(P.gap * 2, 0.5, 0.8, towerMat, 0, cy + 0.3, 0, term);
          if (!end) { this.box(3.5, 2.6, 3, this.std(0x6c7a86), 0, 1.3, -3.5, term); }
          this.hut(term, 5, end ? -2 : 2, 0x8a5a36);
        }
      }
      // ramp / loading area sign
      if (done && !end) { const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({ map: this.textTex(l.name.toUpperCase(), { bg: '#16324f', fg: '#ffffff', size: 44 }) })); s.position.set(-5, 3.2, 5); term.add(s); this.cyl(0.08, 0.08, 3, this.mats.steel, 6, term).position.set(-6.5, 1.5, 5); this.cyl(0.08, 0.08, 3, this.mats.steel, 6, term).position.set(-3.5, 1.5, 5); }
      grp.add(term);
    }
    // cables & carriers
    if (prog >= 0.75) {
      for (const side of P.surface ? [0] : [-1, 1]) {
        const pts = []; for (let i = 0; i <= 80; i++) { const p = P.at(i / 80, side); pts.push(new THREE.Vector3(p.x, p.y, p.z)); }
        grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.mats.cable));
      }
    }
    if (l.buildDays <= 0 && l.kind !== 'carpet' && l.kind !== 'rope') {
      const spacing = T.cat === 'Gondola' ? 45 : T.cat === 'Tram' ? 1e9 : P.surface ? 30 : 26;
      const n = T.cat === 'Tram' ? 2 : Math.max(2, Math.floor(l.len * 2 / spacing));
      const geo = this.carrierGeo(T, l.kind);
      const inst = new THREE.InstancedMesh(geo, this.mats.vcol, n); inst.castShadow = true;
      inst.userData = { n, spacing: T.cat === 'Tram' ? l.len : spacing, P, l, T };
      grp.add(inst); grp.userData.carriers = inst;
      if (T.bubble && T.cat !== 'Gondola' && T.cat !== 'Tram') {
        const bg = new THREE.SphereGeometry(T.seats * 0.36, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); bg.scale(1, 0.75, 0.6); bg.rotateX(-0.5); bg.translate(0, -2.0, 0.25);
        const bi = new THREE.InstancedMesh(bg, this.mats.bubble, n); grp.add(bi); grp.userData.bubbles = bi;
      }
    }
    if (l.kind === 'carpet') { const a = P.at(0, 0), b = P.at(1, 0), len = Math.hypot(b.x - a.x, b.z - a.z); const belt = this.box(1.4, 0.3, len, this.mats.dark, (a.x + b.x) / 2, (this.H(a.x, a.z) + this.H(b.x, b.z)) / 2 + 0.15, (a.z + b.z) / 2); belt.rotation.y = -P.ang + Math.PI / 2; belt.rotation.x = Math.atan2(this.H(b.x, b.z) - this.H(a.x, a.z), len); grp.add(belt); }
    // construction crew & machines
    if (l.buildDays > 0) this.addLiftConstruction(grp, l, P, prog, builtTowers);
    this.groups.lifts.add(grp);
    this.liftPaths[l.id] = P;
  },
  hut(parent, x, z, color) {
    const h = new THREE.Group(); h.position.set(x, 0, z);
    this.box(2.4, 2.4, 2.4, this.std(color), 0, 1.2, 0, h);
    const r = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.1, 4), this.mats.snow); r.rotation.y = Math.PI / 4; r.position.y = 2.95; r.castShadow = true; h.add(r);
    this.box(1.2, 0.8, 0.05, this.std(0xfff1c4, { emissive: 0xffd28a, emissiveIntensity: 0.4 }), 0, 1.5, 1.23, h);
    parent.add(h); return h;
  },
  addCrane(parent, x, z, h) {
    const c = new THREE.Group(); c.position.set(x, 0, z);
    for (let k = 0; k < h; k += 2) { const s = this.box(1.2, 2, 1.2, this.mats.yellow, 0, k + 1, 0, c); s.material = this.mats.yellow; }
    const jib = this.box(26, 0.8, 0.9, this.mats.yellow, 7, h + 0.4, 0, c);
    this.box(3, 1.6, 2, this.std(0x555555), -5, h + 0.8, 0, c);
    const hook = this.box(0.3, 0.3, 0.3, this.mats.dark, 15, h - 6, 0, c);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(15, h, 0), new THREE.Vector3(15, h - 6, 0)]), this.mats.cable); c.add(line);
    c.userData.spin = jib; c.userData.anim = 'crane'; parent.add(c); this.anims.push(c); return c;
  },
  addLiftConstruction(grp, l, P, prog, built) {
    const T = P.T;
    const next = l.towers[Math.min(built, l.towers.length - 1)] ?? 0.5;
    const nx = U.lerp(l.bottom.x, l.top.x, next), nz = U.lerp(l.bottom.y, l.top.y, next);
    const stage = { x: l.bottom.x + Math.cos(P.ang + 1.6) * 30, z: l.bottom.y + Math.sin(P.ang + 1.6) * 30 };
    // staging yard with steel tower sections
    for (let k = 0; k < 4; k++) { const s = this.box(0.7, 0.7, 6, this.mats.steel, stage.x + k * 1.2, this.H(stage.x, stage.z) + 0.4, stage.z); s.rotation.y = -P.ang; grp.add(s); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: this.textTex(`${Math.round(prog * 100)}% · ${l.buildDays} DAY${l.buildDays > 1 ? 'S' : ''} LEFT`, { bg: '#f2b705', fg: '#1b1d20', size: 46 }) }));
    sign.position.set(stage.x, this.H(stage.x, stage.z) + 3, stage.z + 4); grp.add(sign);
    if (T.cat === 'Surface') {
      // excavator digging tower footings
      const ex = this.excavator(); ex.position.set(nx + 4, this.H(nx + 4, nz), nz); ex.rotation.y = -P.ang; grp.add(ex); this.anims.push(ex);
    } else if (T.cat === 'Gondola' || T.cat === 'Tram') {
      const term = prog < 0.5 ? l.bottom : l.top;
      const cr = new THREE.Group(); cr.position.set(term.x + 12, this.H(term.x + 12, term.y + 8), term.y + 8); grp.add(cr); this.addCrane(cr, 0, 0, 28);
      const heli = this.helicopter(); heli.userData = { anim: 'heli', from: stage, to: { x: nx, z: nz }, h0: this.H(stage.x, stage.z), h1: this.H(nx, nz), t: Math.random() }; grp.add(heli); this.anims.push(heli);
    } else {
      // chairlifts: helicopter flies tower sections from the staging yard
      const heli = this.helicopter(); heli.userData = { anim: 'heli', from: stage, to: { x: nx, z: nz }, h0: this.H(stage.x, stage.z), h1: this.H(nx, nz), t: Math.random() }; grp.add(heli); this.anims.push(heli);
      const crew = this.makePerson(0xff7a1a); crew.position.set(nx + 3, this.H(nx + 3, nz + 2), nz + 2); grp.add(crew);
      const crew2 = this.makePerson(0xffd000); crew2.position.set(nx - 3, this.H(nx - 3, nz - 1), nz - 1); grp.add(crew2);
    }
  },
  helicopter() {
    const h = new THREE.Group(), body = this.std(0xd0312d, { roughness: 0.4, metalness: 0.3 });
    const b = this.box(2.4, 2.2, 5, body, 0, 0, 0, h);
    this.box(0.7, 0.7, 6, body, 0, 0.3, -5, h);
    this.box(2.2, 1.2, 1.6, this.mats.glass, 0, 0.3, 2.3, h);
    const rotor = this.box(14, 0.08, 0.4, this.mats.dark, 0, 1.4, 0, h); h.userData.rotor = rotor;
    const rotor2 = this.box(0.4, 0.08, 14, this.mats.dark, 0, 1.4, 0, h); h.userData.rotor2 = rotor2;
    this.box(0.1, 2.4, 0.3, this.mats.dark, 0.3, 0.6, -8, h);
    for (const s of [-1, 1]) this.box(0.1, 0.1, 4, this.mats.dark, s * 1, -1.4, 0, h);
    const load = this.box(0.6, 6, 0.6, this.mats.steel, 0, -9, 0, h); h.userData.load = load;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -6, 0)]), this.mats.cable); h.add(line);
    return h;
  },
  excavator() {
    const e = new THREE.Group(), y = this.mats.yellow;
    this.box(2.6, 0.9, 4, this.mats.dark, 0, 0.45, 0, e);
    const top = new THREE.Group(); top.position.y = 1.2; e.add(top);
    this.box(2.6, 1.2, 3, y, 0, 0.6, -0.3, top); this.box(1.2, 1.4, 1.2, this.mats.glass, -0.6, 1.8, 0.4, top);
    const arm = this.box(0.5, 0.5, 4.5, y, 0.6, 1.6, 2.6, top); arm.rotation.x = -0.4;
    this.box(0.9, 0.8, 0.6, this.mats.dark, 0.6, 0.4, 4.6, top);
    e.userData = { anim: 'dig', top }; return e;
  },

  // ---------- buildings ----------
  BSPEC: {
    office: { wall: 0x4f6272, floors: 1, sign: 'RESORT OFFICE' }, ticket: { wall: 0x8d5a3c, floors: 1, sign: 'LIFT TICKETS' }, lodge: { wall: 0x6e4b33, floors: 2, stone: true, sign: 'BASE LODGE' },
    rental: { wall: 0x2f6688, sign: 'RENTALS' }, school: { wall: 0xa8435f, sign: 'SKI & RIDE SCHOOL' }, restaurant: { wall: 0x7b4a2d, floors: 2, sign: 'SUMMIT RESTAURANT', aframe: true },
    patrolhq: { wall: 0xa82020, sign: 'SKI PATROL', cross: true }, patrolhut: { wall: 0xa82020, sign: 'PATROL', cross: true }, clinic: { wall: 0xe4e4e4, sign: 'FIRST AID', cross: true, dark: true },
    garage: { wall: 0x6f7a80, sign: 'MAINTENANCE', shed: true }, pumphouse: { wall: 0x4f7898, sign: 'SNOWMAKING', flat: true }, hotel: { wall: 0xc4b294, floors: 4, stone: true, sign: 'HOTEL' },
    condo: { wall: 0x8f7d6a, floors: 3, sign: 'CONDOS' }, housing: { wall: 0x8d7b6a, floors: 2, sign: 'STAFF HOUSING' }, bar: { wall: 0x5e341b, sign: 'APRÈS BAR' }, retail: { wall: 0x2f7464, sign: 'SKI SHOP' },
    restroom: { wall: 0x7f8c8d, sign: 'WARMING HUT' }, kennel: { wall: 0x8a6a3a, sign: 'K9 UNIT' }, daycare: { wall: 0xd977a8, sign: 'KIDS CLUB' }, spa: { wall: 0x4e7369, sign: 'SPA', pools: true },
    tune: { wall: 0x4d4d4d, sign: 'TUNING' }, waffle: { wall: 0x9c6b21, sign: 'WAFFLES' }, shuttle: { special: 'bus' }, plaza: { special: 'plaza' }, rink: { special: 'rink' }, tubing: { special: 'tubing' }, heli: { special: 'heli' }, parking: { special: 'lot' },
  },
  wallTex(color, w, h, floors, stone) {
    const key = [color, Math.round(w), Math.round(h), floors, stone].join('_');
    this._wt = this._wt || {};
    if (this._wt[key]) return this._wt[key];
    const c = document.createElement('canvas'); c.width = Math.max(64, Math.round(w * 12)); c.height = Math.max(64, Math.round(h * 12));
    const x = c.getContext('2d'); const col = '#' + color.toString(16).padStart(6, '0');
    x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1; for (let y = 0; y < c.height; y += 6) { x.beginPath(); x.moveTo(0, y); x.lineTo(c.width, y); x.stroke(); }
    if (stone) { const sh = c.height / (floors + 0.5) * 0.6; x.fillStyle = '#7d766d'; x.fillRect(0, c.height - sh, c.width, sh); x.strokeStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 80; i++) x.strokeRect(Math.random() * c.width, c.height - sh + Math.random() * sh, 14, 8); }
    const em = document.createElement('canvas'); em.width = c.width; em.height = c.height; const ex = em.getContext('2d'); ex.fillStyle = '#000'; ex.fillRect(0, 0, em.width, em.height);
    const fh = c.height / floors, nw = Math.max(1, Math.floor(w / 3.2));
    for (let f = 0; f < floors; f++) for (let k = 0; k < nw; k++) {
      const wx = (k + 0.5) * c.width / nw - 9, wy = f * fh + fh * 0.28;
      x.fillStyle = '#e9d3a5'; x.fillRect(wx - 2, wy - 2, 22, fh * 0.42 + 4);
      x.fillStyle = '#273645'; x.fillRect(wx, wy, 18, fh * 0.42);
      x.fillStyle = 'rgba(255,255,255,0.2)'; x.fillRect(wx + 2, wy + 2, 6, fh * 0.2);
      ex.fillStyle = Math.random() < 0.75 ? '#ffc76b' : '#000'; ex.fillRect(wx, wy, 18, fh * 0.42);
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; const te = new THREE.CanvasTexture(em);
    return (this._wt[key] = { map: t, em: te });
  },
  buildBuilding(b) {
    const B = BUILDINGS[b.kind], S = this.BSPEC[b.kind] || { wall: 0x777777 };
    const R = B ? B.r : 10, g = new THREE.Group(), gy = this.H(b.x, b.y);
    g.position.set(b.x, gy, b.y); g.userData.b = b;
    const building = b.buildDays > 0 && b.level === 1;
    const w = R * 1.5, d = R * 1.15;
    // foundation down to the slope
    let minH = gy; for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) minH = Math.min(minH, this.H(b.x + dx, b.y + dz));
    if (S.special) { this.buildSpecial(g, b, S.special, R); this.groups.buildings.add(g); return; }
    const found = gy - minH + 0.6;
    this.box(w + 0.6, found + 0.4, d + 0.6, this.mats.concrete, 0, -found / 2 + 0.2, 0, g);
    const floors = Math.min(6, (S.floors || 1) + (b.level - 1));
    const H = floors * 3.3;
    const prog = building ? U.clamp(1 - b.buildDays / B.levels[0].days, 0.15, 0.9) : 1;
    const tex = this.wallTex(S.wall, w, H, floors, S.stone);
    const wm = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
    this.wallMats.push(wm);
    const walls = this.box(w, H * prog, d, wm, 0, H * prog / 2 + 0.4, 0, g);
    if (building) {
      // scaffolding + crane while under construction
      const sc = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, H + 0.6, d + 1.4), new THREE.MeshBasicMaterial({ color: 0x9a7b4f, wireframe: true }));
      sc.position.y = H / 2 + 0.4; g.add(sc);
      this.addCrane(g, w / 2 + 4, 0, H + 10);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshStandardMaterial({ map: this.textTex(`${b.buildDays} DAY${b.buildDays > 1 ? 'S' : ''} LEFT`, { bg: '#f2b705', fg: '#1b1d20', size: 50 }) }));
      sign.position.set(0, 2, d / 2 + 1.2); g.add(sign);
      this.groups.buildings.add(g); return;
    }
    // roof
    const rh = S.aframe ? R * 0.9 : S.flat ? 0.6 : Math.min(6, w * 0.28);
    if (S.flat || S.shed) {
      this.box(w + 0.8, 0.6, d + 0.8, this.mats.snow, 0, H + 0.7, 0, g);
    } else {
      const shape = new THREE.Shape(); shape.moveTo(-w / 2 - 0.8, 0); shape.lineTo(0, rh); shape.lineTo(w / 2 + 0.8, 0); shape.lineTo(-w / 2 - 0.8, 0);
      const rg = new THREE.ExtrudeGeometry(shape, { depth: d + 1.2, bevelEnabled: false }); rg.translate(0, 0, -(d + 1.2) / 2);
      const roof = new THREE.Mesh(rg, this.mats.snow); roof.position.y = H + 0.4; roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
      this.box(w + 1.7, 0.25, 0.3, this.mats.wood, 0, H + 0.45, d / 2 + 0.6, g);
      // chimney with smoke anchor
      this.box(0.9, 2.2, 0.9, this.std(0x6e6a64), w * 0.25, H + rh * 0.7, -d * 0.2, g);
    }
    if (S.shed) for (let k = -1; k <= 1; k++) this.box(w / 3.6, H * 0.75, 0.2, this.std(0x9aa3aa), k * w / 3, H * 0.375 + 0.4, d / 2 + 0.05, g);
    // porch + door + sign
    this.box(3, 0.3, 2.4, this.mats.wood, 0, 0.55, d / 2 + 1.2, g);
    this.box(1.6, 2.4, 0.15, this.std(0x3b2414), 0, 1.6, d / 2 + 0.05, g);
    if (S.sign) {
      const label = b.kind === 'office' && G.name ? G.name.toUpperCase() + ' · OFFICE' : S.sign;
      const sw = Math.min(w * 0.9, 1.2 + label.length * 0.42);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, 1.0), new THREE.MeshStandardMaterial({ map: this.textTex(label, { w: 1024, size: label.length > 18 ? 52 : 64, bg: S.cross ? '#a51d1d' : '#2b1d12' }) }));
      sign.position.set(0, Math.min(H, 3.3) + 0.2 + (floors > 1 ? 0 : 0), d / 2 + 0.12); g.add(sign);
    }
    if (S.cross) { this.box(1.6, 0.5, 0.1, this.std(0xffffff), 0, H - 0.4, d / 2 + 0.1, g); this.box(0.5, 1.6, 0.11, this.std(0xffffff), 0, H - 0.4, d / 2 + 0.1, g); }
    if (S.pools) { for (const s of [-1, 1]) { const pool = this.box(w * 0.35, 0.3, d * 0.6, this.std(0x2fa7b8, { roughness: 0.1, metalness: 0.2 }), s * (w * 0.75), 0.3, d * 0.2, g); pool.receiveShadow = true; } }
    if (b.kind === 'office') this.buildOfficeInterior(g, w, d, H, wm);
    this.groups.buildings.add(g);
    this.colliders.push({ x0: b.x - w / 2, x1: b.x + w / 2, z0: b.y - d / 2, z1: b.y + d / 2, b });
  },
  buildOfficeInterior(g, w, d, H, wm) {
    // the office is a real room you can walk into through the front door
    g.children.forEach(c => { if (c.geometry && c.geometry.type === 'BoxGeometry' && Math.abs(c.position.y - (H / 2 + 0.4)) < 0.01) c.visible = false; });
    const wall = wm, t = 0.25;
    this.box(w, H, t, wall, 0, H / 2 + 0.4, -d / 2, g);
    this.box(t, H, d, wall, -w / 2, H / 2 + 0.4, 0, g); this.box(t, H, d, wall, w / 2, H / 2 + 0.4, 0, g);
    this.box((w - 2.2) / 2, H, t, wall, -(w + 2.2) / 4, H / 2 + 0.4, d / 2, g); this.box((w - 2.2) / 2, H, t, wall, (w + 2.2) / 4, H / 2 + 0.4, d / 2, g);
    this.box(2.2, H - 2.6, t, wall, 0, 2.6 + (H - 2.6) / 2 + 0.4, d / 2, g);
    this.box(w - 0.4, 0.1, d - 0.4, this.std(0x8a6a4a), 0, 0.45, 0, g);
    this.box(w, 0.2, d, this.std(0xbfb7a8), 0, H + 0.35, 0, g);
    const desk = this.box(3, 0.9, 1.3, this.mats.wood, 0, 0.9, -d / 2 + 1.6, g);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.85), new THREE.MeshBasicMaterial({ map: this.textTex('RESORT MANAGER', { bg: '#0f2740', fg: '#7cd3ff', size: 48 }) }));
    scr.position.set(0, 1.85, -d / 2 + 1.3); g.add(scr); this.box(1.5, 0.95, 0.08, this.mats.dark, 0, 1.85, -d / 2 + 1.25, g);
    this.box(0.7, 0.9, 0.7, this.std(0x2b2d31), 0, 0.85, -d / 2 + 2.9, g);
    const map = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(Terrain.cBase) })); map.position.set(-w / 2 + 0.2, 2.2, 0); map.rotation.y = Math.PI / 2; g.add(map);
    const lamp = new THREE.PointLight(0xffd7a0, 0.9, 14); lamp.position.set(0, H - 0.3, 0); g.add(lamp);
    const b = g.userData.b;
    this.officeDesk = { x: b.x, z: b.y - d / 2 + 2.9 };
    this.officeDoor = { x: b.x, z: b.y + d / 2 + 2.5 };
    this.officeWalls = [
      { x0: b.x - w / 2 - 0.3, x1: b.x + w / 2 + 0.3, z0: b.y - d / 2 - 0.3, z1: b.y - d / 2 + 0.3 },
      { x0: b.x - w / 2 - 0.3, x1: b.x - w / 2 + 0.3, z0: b.y - d / 2, z1: b.y + d / 2 },
      { x0: b.x + w / 2 - 0.3, x1: b.x + w / 2 + 0.3, z0: b.y - d / 2, z1: b.y + d / 2 },
      { x0: b.x - w / 2, x1: b.x - 1.1, z0: b.y + d / 2 - 0.3, z1: b.y + d / 2 + 0.3 },
      { x0: b.x + 1.1, x1: b.x + w / 2, z0: b.y + d / 2 - 0.3, z1: b.y + d / 2 + 0.3 },
      { x0: b.x - 1.6, x1: b.x + 1.6, z0: b.y - d / 2 + 0.9, z1: b.y - d / 2 + 2.3 },
    ];
  },
  buildSpecial(g, b, type, R) {
    if (type === 'lot') {
      const T = G.today || {}; const fill = Sim.operating() ? U.clamp(Sim.onHill() / Math.max(1, World.sumStat('parking', 'cars') * 2.4), 0, 1) : 0.05;
      const spots = Math.floor((R * 2 - 6) / 3.2) * 2, n = Math.round(spots * fill);
      if (n) {
        const cg = this.merge([{ g: new THREE.BoxGeometry(1.8, 0.8, 4.3), m: this.M(0, 0.6), c: [1, 1, 1] }, { g: new THREE.BoxGeometry(1.6, 0.6, 2.2), m: this.M(0, 1.25, -0.2), c: [0.15, 0.18, 0.22] }, { g: new THREE.BoxGeometry(1.7, 0.12, 2.0), m: this.M(0, 1.6, -0.2), c: [0.97, 0.98, 1] }]);
        const inst = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 }), n);
        const m4 = new THREE.Matrix4(), cols = [0xc0392b, 0x2c3e50, 0xecf0f1, 0x7f8c8d, 0x2980b9, 0x16a085, 0x111111, 0x8e44ad];
        for (let k = 0; k < n; k++) { const x = -R + 4.6 + Math.floor(k / 2) * 3.2, z = k % 2 ? R * 0.38 : -R * 0.38; m4.makeTranslation(x, this.H(b.x + x, b.y + z) - this.H(b.x, b.y), z); inst.setMatrixAt(k, m4); inst.setColorAt(k, new THREE.Color(cols[(k * 7) % cols.length])); }
        inst.castShadow = true; g.add(inst);
      }
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ map: this.textTex('P', { w: 128, h: 128, bg: '#1d4f91', fg: '#fff', size: 100 }) })); s.position.set(-R - 1, 3, 0); s.rotation.y = Math.PI / 2; g.add(s);
      this.cyl(0.08, 0.08, 3, this.mats.steel, 6, g).position.set(-R - 1.05, 1.5, 0);
    } else if (type === 'rink') {
      const ice = this.box(R * 1.6, 0.15, R * 1.0, this.std(0xd8f0ff, { roughness: 0.05, metalness: 0.1 }), 0, 0.1, 0, g);
      for (const [w, d, x, z] of [[R * 1.6, 0.2, 0, R * 0.5], [R * 1.6, 0.2, 0, -R * 0.5], [0.2, R, R * 0.8, 0], [0.2, R, -R * 0.8, 0]]) this.box(w, 1.1, d, this.std(0xffffff), x, 0.55, z, g);
      for (let k = 0; k < 6; k++) { const p = this.makePerson(JACKETS[k % JACKETS.length]); p.position.set((Math.random() - 0.5) * R, 0.15, (Math.random() - 0.5) * R * 0.6); p.userData.anim = 'skate'; p.userData.c = { r: 2 + Math.random() * R * 0.4, a: Math.random() * 6 }; g.add(p); this.anims.push(p); }
    } else if (type === 'plaza') {
      const pit = this.cyl(1.4, 1.6, 0.6, this.std(0x6e6a64), 14, g); pit.position.y = 0.3;
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a })); fire.position.y = 1.2; g.add(fire); fire.userData.anim = 'fire'; this.anims.push(fire);
      const pl = new THREE.PointLight(0xff9a40, 1.2, 18); pl.position.y = 2; g.add(pl);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const bench = this.box(2.4, 0.5, 0.6, this.mats.wood, Math.cos(a) * 4.5, 0.4, Math.sin(a) * 4.5, g); bench.rotation.y = -a + Math.PI / 2; }
      const tree = new THREE.Mesh(this.treeGeos().conifer, this.treeMat || this.mats.vcol); tree.position.set(R * 0.6, 0, -R * 0.4); g.add(tree);
    } else if (type === 'bus') {
      this.box(5, 0.2, 2, this.mats.concrete, 0, 0.1, 0, g); this.box(5, 0.15, 2.2, this.mats.glass, 0, 2.6, 0, g); this.box(0.1, 2.5, 2, this.mats.glass, -2.5, 1.35, 0, g);
      const bus = new THREE.Group(); this.box(2.6, 2.8, 11, this.std(0x2a7ab0, { metalness: 0.3, roughness: 0.4 }), 0, 1.7, 0, bus); this.box(2.65, 1.0, 10, this.mats.glass, 0, 2.2, 0, bus); bus.position.set(4, 0, 0); g.add(bus);
    } else if (type === 'tubing') {
      for (let k = -2; k <= 2; k++) { const lane = this.box(2.6, 0.2, R * 1.8, this.std(0xffffff), k * 3.2, 0.1, 0, g); lane.rotation.x = 0.12; this.box(0.3, 0.6, R * 1.8, this.std(0xbfd4e8), k * 3.2 + 1.45, 0.3, 0, g); }
      this.hut(g, R * 0.9, -R * 0.7, 0x2a7ab0);
      for (let k = 0; k < 4; k++) { const tube = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.25, 8, 14), this.std([0xff3b30, 0xffcc00, 0x34c759, 0x0a84ff][k])); tube.rotation.x = Math.PI / 2; tube.position.set((k - 1.5) * 3.2, 0.4, R * 0.6); g.add(tube); }
    } else if (type === 'heli') {
      this.cyl(R * 0.8, R * 0.8, 0.2, this.std(0x5a5a5a), 24, g).position.y = 0.1;
      const hs = new THREE.Mesh(new THREE.PlaneGeometry(R * 0.9, R * 0.9), new THREE.MeshStandardMaterial({ map: this.textTex('H', { w: 256, h: 256, bg: '#5a5a5a', fg: '#ffffff', size: 200, border: false }) })); hs.rotation.x = -Math.PI / 2; hs.position.y = 0.22; g.add(hs);
      const h = this.helicopter(); h.position.y = 2; h.userData.load.visible = false; h.children.filter(c => c.type === 'Line').forEach(c => c.visible = false); g.add(h);
    }
  },

  // ---------- NPC staff ----------
  buildNPCs() {
    this.clearGroup(this.groups.npcs); this.npcs = [];
    const add = (x, z, color, role, line, opts = {}) => { const p = this.makePerson(color, opts); p.position.set(x, this.H(x, z), z); p.rotation.y = opts.ry || Math.random() * 6; this.groups.npcs.add(p); this.npcs.push({ obj: p, x, z, role, line }); return p; };
    for (const l of G.lifts) {
      if (l.buildDays > 0) continue;
      const P = this.liftPaths[l.id]; if (!P) continue;
      const side = { x: Math.cos(P.ang + Math.PI / 2) * 6, z: Math.sin(P.ang + Math.PI / 2) * 6 };
      add(l.bottom.x + side.x - Math.cos(P.ang) * 6, l.bottom.y + side.z - Math.sin(P.ang) * 6, 0x1f5fa8, 'Lift Operator', () => l.broken ? `${l.name} is down — mechanics are on it, boss.` : l.holdFrac >= 1 ? `Wind's howling. ${l.name} is on wind hold.` : `${l.name} is running smooth. Line is about ${Math.round(l.wait || 0)} minutes.`, { ry: -P.ang });
      if (LIFTS[l.kind].ops >= 2) add(l.top.x + side.x + Math.cos(P.ang) * 6, l.top.y + side.z + Math.sin(P.ang) * 6, 0x1f5fa8, 'Lift Operator', () => `Top of ${l.name}. ${(l.topRuns || []).length} runs start from up here.`);
    }
    const lines = {
      ticket: ['Ticket Agent', 0x2e8b57, () => `We sold ${Math.round((G.today && G.today.ticketBuyers) || 0).toLocaleString()} tickets today at $${G.prices.ticket}.`],
      rental: ['Rental Tech', 0x2f6688, () => `${(G.today && G.today.rentals) || 0} rental setups today. Boots are flying off the shelves!`],
      school: ['Ski Instructor', 0xd02b6b, () => `Pizza! French fries! ${(G.today && G.today.students) || 0} students in lessons today.`],
      patrolhq: ['Ski Patroller', 0xc81e1e, () => `Avalanche danger is ${['', 'Low', 'Moderate', 'Considerable', 'High', 'Extreme'][G.avy.danger]}. ${(G.today && G.today.incidents.length) || 0} calls so far today.`],
      patrolhut: ['Ski Patroller', 0xc81e1e, () => `Quiet up here. We can be anywhere on this side in a few minutes.`],
      garage: ['Mechanic', 0x5c6670, () => `${G.groomers.length} cat${G.groomers.length === 1 ? '' : 's'} in the shop. All tuned and fueled for tonight.`],
      lodge: ['Lodge Cook', 0xffffff, () => `Chili's on! ${((G.today && G.today.meals) || 0).toLocaleString()} meals served today.`],
      kennel: ['Dog Handler', 0xc81e1e, () => G.dogs.length ? `${G.dogs.map(d => d.name).join(' and ')} ${G.dogs.length > 1 ? 'are' : 'is'} ready to search. Good dog${G.dogs.length > 1 ? 's' : ''}!` : `Kennel's ready. We just need a dog to train!`],
      office: ['Assistant Manager', 0x34495e, () => `Morning! Cash is ${U.money(G.cash)} and guests rate us ${Math.round(G.reputation)}/100. The computer's on your desk.`],
      parking: ['Parking Attendant', 0xff7a1a, () => `Lot's ${Sim.operating() ? Math.round(U.clamp(Sim.onHill() / Math.max(1, World.sumStat('parking', 'cars') * 2.4), 0, 1) * 100) : 0}% full.`],
    };
    for (const b of G.buildings) {
      const L = lines[b.kind]; if (!L || b.buildDays > 0 && b.level === 1) continue;
      const R = BUILDINGS[b.kind].r, d = R * 1.15;
      add(b.x + 3, b.y + d / 2 + 3.5, L[1], L[0], L[2], { ry: 0, cross: L[1] === 0xc81e1e });
      if (b.kind === 'kennel' && G.dogs.length) { const dg = this.dog(); dg.position.set(b.x + 4.2, this.H(b.x + 4.2, b.y + d / 2 + 3.5), b.y + d / 2 + 3.5); this.groups.npcs.add(dg); }
      if (b.kind === 'school') for (let k = 0; k < 4; k++) add(b.x - 4 + k * 1.3, b.y + d / 2 + 6, JACKETS[k + 2], 'Little skier', () => U.pick(['I did a pizza!', 'Can we go on the big lift?', 'My mittens are wet.', 'Whoa, look at the snowcat!']), { scale: 0.6, skis: true });
    }
    // fleet parked at the garage
    this.clearGroup(this.groups.fleet); this.cats = [];
    const gar = World.built('garage')[0];
    if (gar) G.groomers.forEach((c, k) => { const m = this.makeSnowcat(c.kind); const x = gar.x - 10 + k * 7, z = gar.y + BUILDINGS.garage.r * 0.6 + 8; m.position.set(x, this.H(x, z), z); m.rotation.y = Math.PI; this.groups.fleet.add(m); this.cats.push({ obj: m, x, z, c }); });
    const hq = World.built('patrolhq')[0];
    if (hq) G.sleds.forEach((s, k) => { const m = new THREE.Group(); this.box(1, 0.6, 2.6, this.std(0xc81e1e), 0, 0.5, 0, m); this.box(0.9, 0.5, 0.6, this.mats.glass, 0, 1.0, 0.7, m); this.box(1.1, 0.1, 1.2, this.mats.dark, 0, 0.1, 1.2, m); const x = hq.x + 8 + k * 2.2, z = hq.y + 6; m.position.set(x, this.H(x, z), z); this.groups.fleet.add(m); });
  },

  // ---------- sync with game state ----------
  entitySig() {
    return [G.lifts.map(l => l.id + ':' + l.buildDays + ':' + l.kind).join(','), G.buildings.map(b => b.id + ':' + b.buildDays + ':' + b.level).join(','), G.groomers.length, G.sleds.length, G.dogs.length, G.runs.length, G.name].join('|');
  },
  syncEntities(force) {
    const s = this.entitySig();
    if (!force && s === this.sig) return;
    this.sig = s;
    this.clearGroup(this.groups.lifts); this.clearGroup(this.groups.buildings);
    this.anims = []; this.liftPaths = {}; this.colliders = []; this.wallMats = []; this.officeDesk = null; this.officeWalls = [];
    for (const l of G.lifts) this.buildLift(l);
    for (const b of G.buildings) this.buildBuilding(b);
    this.buildNPCs();
    this.buildSignposts();
    this.refreshTexture();
  },
  buildSignposts() {
    for (const r of G.runs) {
      const p = r.points[0], nx = p.x + 6, nz = p.y + 2;
      const g = new THREE.Group(); g.position.set(nx, this.H(nx, nz), nz);
      this.cyl(0.08, 0.08, 2.6, this.mats.wood, 6, g).position.y = 1.3;
      const icon = { green: '●', blue: '■', black: '◆', dblack: '◆◆' }[r.diff];
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), new THREE.MeshStandardMaterial({ map: this.textTex(`${icon} ${r.name}`, { bg: r.diff === 'green' ? '#1f8a36' : r.diff === 'blue' ? '#1f5fbf' : '#111111', fg: '#ffffff', size: 54 }), side: THREE.DoubleSide }));
      s.position.y = 2.4; g.add(s);
      this.groups.lifts.add(g);
    }
    // welcome arch at the base
    const bp = World.basePos();
    if (G.name) {
      const g = new THREE.Group(); const x = bp.x, z = bp.y + 60; g.position.set(x, this.H(x, z), z);
      for (const s of [-1, 1]) this.box(1, 6, 1, this.mats.wood, s * 7, 3, 0, g);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(14, 2), new THREE.MeshStandardMaterial({ map: this.textTex('WELCOME TO ' + G.name.toUpperCase(), { w: 1024, size: 56 }), side: THREE.DoubleSide }));
      sg.position.y = 6.2; g.add(sg); this.box(15, 0.4, 0.6, this.mats.snow, 0, 7.4, 0, g);
      this.groups.lifts.add(g);
    }
  },

  // ---------- enter / exit ----------
  enter(opts = {}) {
    if (!this.supported()) { UI.toast('3D needs WebGL, which this browser has turned off. Staying in the map view.', 'bad'); return false; }
    this.init();
    document.body.classList.add('mode3d');
    UI.closeModal && UI.modal && UI.modal !== 'report' && UI.modal !== 'season' && UI.modal !== 'skipping' && UI.closeModal();
    if (UI.tool) UI.setTool('select');
    this.active = true;
    this.resize();
    this.buildWorld(opts.rebuild);
    if (opts.tour) { this.mode = 'tour'; this.tourT = 0; }
    else if (opts.at === 'office' && this.officeDesk) { this.place(this.officeDesk.x, this.officeDesk.z + 1.5, Math.PI); }
    else if (opts.at === 'door' && this.officeDoor) { this.place(this.officeDoor.x, this.officeDoor.z, Math.PI); }
    else if (!this.P.placed) { const b = World.basePos(); this.place(b.x, b.y - 40, Math.PI); }
    if (!opts.tour && this.mode === 'tour') this.mode = 'walk';
    this.updateTrees(true);
    this.hud();
    return true;
  },
  exit() {
    this.active = false; document.body.classList.remove('mode3d');
    if (document.pointerLockElement) document.exitPointerLock();
    Render.resize();
  },
  place(x, z, yaw) { this.P.x = x; this.P.z = z; this.P.y = this.H(x, z); this.P.vx = this.P.vz = this.P.vy = 0; this.P.placed = true; if (yaw !== undefined) this.yaw = yaw; this.pitch = -0.05; if (this.mode !== 'tour') this.mode = 'walk'; },
  openOffice() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.exit();
    this.cameFromOffice = true;
    UI.toast('💻 Resort Manager open. Click 🚶 Walk the resort to head back outside.');
    UI.renderPanel(); UI.refreshTop();
    if (G.tut && G.tut.on) Tutorial.show();
  },

  // ---------- input ----------
  bindInput() {
    const c = document.getElementById('c3d');
    c.addEventListener('click', () => { if (!this.active || UI.modal) return; if (this.mode === 'tour') return; try { const r = c.requestPointerLock && c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} document.getElementById('h3intro').hidden = true; });
    let drag = null;
    c.addEventListener('mousedown', e => { if (!document.pointerLockElement) drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('mouseup', () => drag = null);
    window.addEventListener('mousemove', e => {
      if (!this.active) return;
      if (document.pointerLockElement === c) { this.yaw -= e.movementX * 0.0022; this.pitch -= e.movementY * 0.0022; }
      else if (drag) { this.yaw -= (e.clientX - drag.x) * 0.004; this.pitch -= (e.clientY - drag.y) * 0.004; drag = { x: e.clientX, y: e.clientY }; }
      this.pitch = U.clamp(this.pitch, -1.45, 1.35);
    });
    window.addEventListener('keydown', e => {
      if (!this.active || UI.modal || e.target.matches('input, textarea, select')) return;
      const k = e.key.toLowerCase(); this.keys[k] = true;
      if (G.phase === 'drive') return;
      if (k === 'e') this.interact();
      if (k === 'k' && this.mode !== 'ride' && this.mode !== 'tour') { this.mode = this.mode === 'ski' ? 'walk' : 'ski'; this.say(this.mode === 'ski' ? '🎿 Skis on. Point downhill and go! S to snowplow.' : '🥾 Skis off.'); }
      if (k === 'tab') { e.preventDefault(); this.toggleTravel(); }
      if (k === 'h') { const h = document.getElementById('h3help'); h.hidden = !h.hidden; }
      if (k === 'm') { this.bigMap = !this.bigMap; }
      if (k === ' ' && this.mode !== 'ski') e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    document.getElementById('h3travel').addEventListener('click', e => { const b = e.target.closest('[data-tp]'); if (!b) return; const [x, z, mode] = b.dataset.tp.split(','); this.place(+x, +z, Math.PI); if (mode) this.mode = mode; this.toggleTravel(false); this.updateTrees(true); });
    document.getElementById('btn3dOffice').onclick = () => { if (this.officeDesk) { this.place(this.officeDesk.x, this.officeDesk.z + 1.5, Math.PI); this.updateTrees(true); } };
  },
  toggleTravel(force) {
    const el = document.getElementById('h3travel'); const show = force === undefined ? el.hidden : force;
    el.hidden = !show;
    if (!show) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const o = this.officeDoor, bp = World.basePos();
    let h = `<h3>🧭 Fast travel</h3><div class="tplist">`;
    if (o) h += `<button data-tp="${o.x},${o.z}">🏢 Resort office</button>`;
    h += `<button data-tp="${bp.x},${bp.y - 30}">🏘️ Base village</button>`;
    for (const l of G.lifts) { const P = this.liftPaths[l.id]; if (!P) continue; h += `<button data-tp="${l.bottom.x - Math.cos(P.ang) * 12},${l.bottom.y - Math.sin(P.ang) * 12}">🚡 ${l.name} — bottom</button><button data-tp="${l.top.x + Math.cos(P.ang) * 10},${l.top.y + Math.sin(P.ang) * 10},ski">⛷️ ${l.name} — top (skis on)</button>`; }
    h += `</div><p class="hint">Tab to close</p>`;
    el.innerHTML = h;
  },
  say(msg) { const m = document.getElementById('h3msg'); m.textContent = msg; this.msgT = 3.5; m.hidden = false; },
  nearest() {
    const P = this.P; const out = [];
    if (this.officeDesk && Math.hypot(P.x - this.officeDesk.x, P.z - this.officeDesk.z) < 2.6) out.push({ d: 0, label: 'E — Use the office computer (Resort Manager)', act: () => this.openOffice() });
    for (const l of G.lifts) {
      if (l.buildDays > 0 || l.kind === 'carpet' || l.kind === 'rope') continue;
      const dd = Math.hypot(P.x - l.bottom.x, P.z - l.bottom.y);
      if (dd < 16) out.push({ d: dd, label: `E — Ride ${l.name}${l.broken ? ' (broken down)' : ''}`, act: () => { if (l.broken) return this.say('🛑 This lift is broken down. Try again later.'); this.ride(l); } });
    }
    for (const n of this.npcs || []) { const dd = Math.hypot(P.x - n.x, P.z - n.z); if (dd < 3.5) out.push({ d: dd + 0.5, label: `E — Talk to ${n.role}`, act: () => this.say(`${n.role}: "${n.line()}"`) }); }
    for (const c of this.cats || []) { const dd = Math.hypot(P.x - c.x, P.z - c.z); if (dd < 6) out.push({ d: dd + 1, label: `E — Check ${GROOMERS[c.c.kind].name}`, act: () => this.say(`🚜 ${GROOMERS[c.c.kind].name}: snowcats groom at night. At the end of the day choose "Drive a groomer tonight" to drive it here in 3D.`) }); }
    out.sort((a, b) => a.d - b.d);
    return out[0];
  },
  interact() { const n = this.nearest(); if (n) n.act(); },
  ride(l) {
    this.mode = 'ride'; this.rideLift = l; this.rideT = 0.0;
    this.say(`🚡 Riding ${l.name}. Hold Shift to speed up.`);
  },

  // ---------- per-frame ----------
  update(dt) {
    if (!this.active) return;
    this.syncEntities(false);
    const P = this.P, K = this.keys;
    if (G.phase === 'drive' && Drive.active) {
      // night grooming in 3D: drive the cat with W/A/S/D
      this.mode = 'drive';
      P.x = Drive.x; P.z = Drive.y; P.y = this.H(P.x, P.z);
    } else if (this.mode === 'drive') { this.mode = 'walk'; if (this.officeDoor) this.place(this.officeDoor.x, this.officeDoor.z, Math.PI); this.updateTrees(true); }
    if (this.mode === 'tour') {
      this.tourT += dt * 0.025;
      const WW = MAP_W * CELL, HH = MAP_H * CELL, a = this.tourT;
      P.x = WW / 2 + Math.cos(a) * WW * 0.42; P.z = HH * 0.55 + Math.sin(a) * HH * 0.5;
      P.y = Math.max(this.H(P.x, P.z), this.H(WW / 2, HH * 0.4)) + 260;
      this.yaw = Math.atan2(-(WW / 2 - P.x), -(HH * 0.4 - P.z)); this.pitch = -0.32;
    } else if (this.mode === 'ride') {
      const l = this.rideLift, Pp = this.liftPaths[l.id];
      const sp = LIFTS[l.kind].speed * (K['shift'] ? 14 : 3);
      if (!l.broken) this.rideT += sp * dt / l.len;
      const p = Pp.at(this.rideT, 1); P.x = p.x; P.z = p.z; P.y = p.y - (LIFTS[l.kind].cat === 'Surface' ? 4.2 : 3.6);
      if (this.rideT >= 1) { const ex = l.top.x + Math.cos(Pp.ang) * 10, ez = l.top.y + Math.sin(Pp.ang) * 10; this.place(ex, ez); this.mode = 'ski'; this.say(`🎿 Top of ${l.name}. Skis on — pick a run! (${(l.topRuns || []).map(id => World.runById(id)).filter(Boolean).map(r => DIFF[r.diff].icon + ' ' + r.name).join(', ') || 'no runs yet'})`); }
    } else if (this.mode === 'walk' || this.mode === 'ski') {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = -fz, rz = fx;
      if (this.mode === 'walk') {
        let mx = 0, mz = 0; const sp = K['shift'] ? 8 : 4.2;
        if (K['w'] || K['arrowup']) { mx += fx; mz += fz; } if (K['s'] || K['arrowdown']) { mx -= fx; mz -= fz; }
        if (K['a'] || K['arrowleft']) { mx -= rx; mz -= rz; } if (K['d'] || K['arrowright']) { mx += rx; mz += rz; }
        const l = Math.hypot(mx, mz) || 1; P.vx = mx / l * sp * (mx || mz ? 1 : 0); P.vz = mz / l * sp * (mx || mz ? 1 : 0);
      } else {
        // skiing physics: gravity along the slope, edges carve toward where you look
        const e = 2, gx = (this.H(P.x + e, P.z) - this.H(P.x - e, P.z)) / (2 * e), gz = (this.H(P.x, P.z + e) - this.H(P.x, P.z - e)) / (2 * e);
        const n = 1 / Math.sqrt(1 + gx * gx + gz * gz);
        P.vx += -gx * 9.81 * n * dt; P.vz += -gz * 9.81 * n * dt;
        if (K['a'] || K['arrowleft']) this.yaw += 1.6 * dt; if (K['d'] || K['arrowright']) this.yaw -= 1.6 * dt;
        const along = P.vx * fx + P.vz * fz, lat = P.vx * rx + P.vz * rz;
        const brake = K['s'] || K['arrowdown'];
        const grip = brake ? 1.5 : 4.5;
        const lat2 = lat * Math.exp(-grip * dt);
        let al2 = along + (along < 0 ? Math.abs(lat - lat2) * 0 : Math.abs(lat - lat2) * 0.7);
        if ((K['w'] || K['arrowup']) && Math.hypot(P.vx, P.vz) < 4) al2 += 2.5 * dt; // skate
        P.vx = fx * al2 + rx * lat2; P.vz = fz * al2 + rz * lat2;
        const sp = Math.hypot(P.vx, P.vz);
        const fr = (brake ? 0.9 : 0.04) + sp * 0.003;
        const k = Math.max(0, 1 - fr * dt); P.vx *= k; P.vz *= k;
        const ci = Terrain.cellAt(P.x, P.z);
        if (ci >= 0 && Terrain.trees[ci] > 0.45 && sp > 7 && Math.random() < dt * 3) { P.vx = P.vz = 0; this.say('🌲 Wipeout! You hit a tree. Stick to the runs!'); }
        if (K[' '] && P.ground) { P.vy = 4.5; P.ground = false; }
      }
      let nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
      nx = U.clamp(nx, 2, MAP_W * CELL - 2); nz = U.clamp(nz, 2, MAP_H * CELL - 2);
      // collisions with buildings (office interior uses its walls)
      for (const c of this.colliders.concat(this.officeWalls || [])) {
        if (c.b && c.b.kind === 'office') continue;
        if (nx > c.x0 - 0.4 && nx < c.x1 + 0.4 && nz > c.z0 - 0.4 && nz < c.z1 + 0.4) {
          const dx = Math.min(Math.abs(nx - (c.x0 - 0.4)), Math.abs(nx - (c.x1 + 0.4))), dz = Math.min(Math.abs(nz - (c.z0 - 0.4)), Math.abs(nz - (c.z1 + 0.4)));
          if (dx < dz) { nx = Math.abs(nx - (c.x0 - 0.4)) < Math.abs(nx - (c.x1 + 0.4)) ? c.x0 - 0.4 : c.x1 + 0.4; P.vx = 0; } else { nz = Math.abs(nz - (c.z0 - 0.4)) < Math.abs(nz - (c.z1 + 0.4)) ? c.z0 - 0.4 : c.z1 + 0.4; P.vz = 0; }
        }
      }
      P.x = nx; P.z = nz;
      const gh = this.H(P.x, P.z) + (this.inOffice() ? 0.45 : 0);
      if (!P.ground) { P.vy -= 9.81 * dt; P.y += P.vy * dt; if (P.y <= gh) { P.y = gh; P.ground = true; P.vy = 0; } }
      else P.y = gh;
    }
    // camera
    if (this.mode === 'drive' && this.driveYaw0 === undefined) this.pitch = -0.22;
    const eye = this.mode === 'tour' ? 0 : this.mode === 'drive' ? 3.1 : this.mode === 'ski' ? 1.55 : 1.7;
    let cy = P.y + eye, yaw = this.yaw;
    if (this.mode === 'drive') {
      // chase camera behind the snowcat; move the mouse to look around it
      const off = (this.yaw - (this.driveYaw0 ?? this.yaw)); yaw = -Drive.h - Math.PI / 2 + off;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), bx = P.x - fx * 15, bz = P.z - fz * 15;
      this.camera.position.set(bx, Math.max(this.H(bx, bz) + 2, P.y + 7.5), bz);
    }
    else this.camera.position.set(P.x, cy, P.z);
    if (this.mode === 'drive' && this.driveYaw0 === undefined) this.driveYaw0 = this.yaw;
    if (this.mode !== 'drive') this.driveYaw0 = undefined;
    const roll = this.mode === 'ski' ? U.clamp(-(this.keys['a'] ? -1 : 0) - (this.keys['d'] ? 1 : 0), -1, 1) * 0.08 : 0;
    this.camera.rotation.set(this.pitch, yaw, roll, 'YXZ');
    this.updateTrees(false);
    this.updateLighting(dt);
    this.updateCarriers(dt);
    this.updateGuests();
    this.updateAnims(dt);
    this.updateDriveCat();
    this.texT -= dt;
    if (this.texT <= 0) { this.texT = G.phase === 'drive' ? 1.2 : 4; Terrain.flush(); this.refreshTexture(); }
    this.hud(dt);
  },
  inOffice() { const o = G.buildings.find(b => b.kind === 'office'); if (!o) return false; const R = BUILDINGS.office.r, w = R * 1.5, d = R * 1.15; return Math.abs(this.P.x - o.x) < w / 2 && Math.abs(this.P.z - o.y) < d / 2; },
  updateLighting(dt) {
    const t = G.phase === 'drive' ? 23 * 60 : G.time;
    const day = U.clamp((t - 7 * 60) / (10 * 60), 0, 1);
    const el = Math.sin(day * Math.PI) * 0.55 + (G.phase === 'drive' ? -0.4 : 0.02), az = day * Math.PI;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.max(0.05, Math.sin(el)), Math.sin(az) * Math.cos(el) * 0.9 + 0.3).normalize();
    const w = Weather.today(), overcast = ['snow', 'heavy', 'cloudy', 'flurries', 'rain'].includes(w.type);
    const night = G.phase === 'drive' || t < 7 * 60 || t > 17 * 60, dusk = U.clamp((t - 15.5 * 60) / 90, 0, 1);
    const P = this.P;
    this.sun.position.set(P.x + dir.x * 700, P.y + dir.y * 700, P.z + dir.z * 700); this.sun.target.position.set(P.x, P.y, P.z);
    this.sun.intensity = night ? 0.12 : (overcast ? 0.55 : 2.1) * (1 - dusk * 0.6);
    this.sun.color.set(night ? 0x8fa8ff : dusk > 0.2 ? 0xffb27a : 0xfff0dc);
    this.hemi.intensity = night ? 0.12 : overcast ? 0.8 : 0.6;
    const top = night ? new THREE.Color(0x060b1c) : overcast ? new THREE.Color(0x9aa6b4) : new THREE.Color(0x2f73cf).lerp(new THREE.Color(0x46407a), dusk);
    const hor = night ? new THREE.Color(0x111a30) : overcast ? new THREE.Color(0xc9d0d8) : new THREE.Color(0xdbe7f4).lerp(new THREE.Color(0xf2b98c), dusk);
    this.skyU.top.value.copy(top); this.skyU.hor.value.copy(hor); this.skyU.sunDir.value.copy(dir); this.skyU.sunCol.value.set(night || overcast ? 0x000000 : 0xfff2d0);
    this.scene.fog.color.copy(hor); this.scene.fog.density = night ? 0.0009 : overcast ? (w.type === 'heavy' ? 0.0016 : 0.0007) : 0.00018;
    this.sky.position.copy(this.camera.position);
    for (const m of this.wallMats) m.emissiveIntensity = night ? 1 : dusk * 0.8;
    // snowfall around the camera
    const snowing = G.phase === 'drive' ? (G.wx[1] && G.wx[1].snowNight > 0) : (w.snowDay > 0 && w.type !== 'rain');
    this.snow.visible = snowing;
    if (snowing) {
      const a = this.snow.geometry.attributes.position, wind = (w.wind || 3) * 0.08;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 2.2, x = a.getX(i) + dt * wind; if (y < 0) { y = 60; x = (Math.random() - 0.5) * 120; } if (x > 60) x -= 120; a.setY(i, y); a.setX(i, x); }
      a.needsUpdate = true; this.snow.position.set(P.x, P.y - 10, P.z);
    }
    if (G.phase === 'drive' && Drive.active) {
      if (!this.headlights) { this.headlights = new THREE.SpotLight(0xfff6e0, 3.5, 160, 0.6, 0.5, 1.2); this.headlights.castShadow = false; this.scene.add(this.headlights); this.scene.add(this.headlights.target); this.workLight = new THREE.PointLight(0xffe2b0, 1.2, 25); this.scene.add(this.workLight); }
      const hx = Math.cos(Drive.h), hz = Math.sin(Drive.h);
      this.headlights.visible = this.workLight.visible = true;
      this.headlights.position.set(P.x + hx * 2, P.y + 3.4, P.z + hz * 2); this.headlights.target.position.set(P.x + hx * 40, this.H(P.x + hx * 40, P.z + hz * 40), P.z + hz * 40);
      this.workLight.position.set(P.x - hx * 4, P.y + 3, P.z - hz * 4);
    } else if (this.headlights) { this.headlights.visible = this.workLight.visible = false; }
  },
  updateCarriers(dt) {
    const now = performance.now() / 1000, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (const grp of this.groups.lifts.children) {
      const inst = grp.userData.carriers; if (!inst) continue;
      const { n, spacing, P, l, T } = inst.userData;
      const running = Sim.liftIsOpen(l) && !l.broken && (G.phase === 'day' && G.time > LIFTS_OPEN - 60 && G.time < LIFTS_CLOSE + 20);
      if (running) grp.userData.off = (grp.userData.off || 0) + T.speed * 3 * dt;
      const off = grp.userData.off || 0, loop = l.len * 2;
      for (let k = 0; k < n; k++) {
        let s;
        if (T.cat === 'Tram') { const ph = (Math.sin(off / l.len * 1.2) + 1) / 2; s = k === 0 ? ph * l.len : l.len + ph * l.len; }
        else s = ((k * spacing + off) % loop + loop) % loop;
        const up = s < l.len, t = up ? s / l.len : 1 - (s - l.len) / l.len;
        const p = P.at(t, P.surface ? 0 : up ? 1 : -1);
        e.set(0, up ? Math.PI / 2 - P.ang : -Math.PI / 2 - P.ang, 0); q.setFromEuler(e);
        v.set(p.x, p.y, p.z); m4.compose(v, q, one); inst.setMatrixAt(k, m4);
        if (grp.userData.bubbles) grp.userData.bubbles.setMatrixAt(k, m4);
      }
      inst.instanceMatrix.needsUpdate = true; if (grp.userData.bubbles) grp.userData.bubbles.instanceMatrix.needsUpdate = true;
    }
  },
  updateGuests() {
    const list = Agents.list, n = Math.min(list.length, 500);
    if (!this.guestMesh) {
      this.guestMesh = new THREE.InstancedMesh(this.personGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), 500);
      this.guestSkis = new THREE.InstancedMesh(this.skiGeo(), this.mats.vcol, 500);
      this.guestMesh.castShadow = true; this.groups.guests.add(this.guestMesh); this.groups.guests.add(this.guestSkis);
      for (let k = 0; k < 500; k++) this.guestMesh.setColorAt(k, new THREE.Color(JACKETS[k % JACKETS.length]));
      this.guestMesh.instanceColor.needsUpdate = true;
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    let c = 0;
    for (let i = 0; i < n; i++) {
      const a = list[i]; let y;
      if (a.state === 'ride' && a.lift && this.liftPaths[a.lift.id]) { const p = this.liftPaths[a.lift.id].at(a.p, LIFTS[a.lift.kind].cat === 'Surface' ? 0 : 1); y = p.y - (LIFTS[a.lift.kind].cat === 'Surface' ? 4.6 : 3.4); v.set(p.x, y, p.z); e.set(0, Math.PI / 2 - this.liftPaths[a.lift.id].ang, 0); }
      else { y = this.H(a.x, a.y); v.set(a.x, y, a.y); e.set(a.state === 'ski' ? 0.25 : 0, Math.PI / 2 - (a.dir || 0), a.state === 'ski' ? Math.sin(a.ph * 1.4) * 0.25 : 0); }
      q.setFromEuler(e); m4.compose(v, q, one);
      this.guestMesh.setMatrixAt(c, m4);
      if (a.state === 'ski' || a.state === 'ride') this.guestSkis.setMatrixAt(c, m4); else { m4.makeScale(0, 0, 0); this.guestSkis.setMatrixAt(c, m4); }
      c++;
    }
    this.guestMesh.count = c; this.guestSkis.count = c;
    this.guestMesh.instanceMatrix.needsUpdate = true; this.guestSkis.instanceMatrix.needsUpdate = true;
  },
  updateAnims(dt) {
    const t = performance.now() / 1000;
    for (const o of this.anims || []) {
      const u = o.userData;
      if (u.anim === 'heli') {
        u.t = (u.t + dt * 0.05) % 1;
        const ph = u.t < 0.5 ? u.t * 2 : 2 - u.t * 2, s = ph * ph * (3 - 2 * ph);
        const x = U.lerp(u.from.x, u.to.x, s), z = U.lerp(u.from.z, u.to.z, s);
        o.position.set(x, U.lerp(u.h0, u.h1, s) + 38 + Math.sin(t * 1.3) * 1.2, z);
        o.rotation.y = Math.atan2(u.to.x - u.from.x, u.to.z - u.from.z) + (u.t < 0.5 ? 0 : Math.PI);
        if (u.rotor) { u.rotor.rotation.y += dt * 40; u.rotor2.rotation.y += dt * 40; }
        if (u.load) u.load.visible = u.t < 0.5;
      } else if (u.anim === 'crane') { if (u.spin) { o.rotation.y = Math.sin(t * 0.15) * 1.2; } }
      else if (u.anim === 'dig') { u.top.rotation.y = Math.sin(t * 0.6) * 0.9; }
      else if (u.anim === 'skate') { u.c.a += dt * 0.6; o.position.x = Math.cos(u.c.a) * u.c.r; o.position.z = Math.sin(u.c.a) * u.c.r * 0.5; o.rotation.y = -u.c.a; }
      else if (u.anim === 'fire') { o.scale.set(1, 0.8 + Math.sin(t * 9) * 0.15 + Math.random() * 0.1, 1); }
    }
    for (const g of this.groups.buildings.children) if (g.userData.helirotor) g.userData.helirotor.rotation.y += dt * 2;
  },
  updateDriveCat() {
    if (G.phase !== 'drive' || !Drive.active) { if (this.driveCat) this.driveCat.visible = false; return; }
    if (!this.driveCat || this.driveCatKind !== Drive.g.kind) { if (this.driveCat) this.scene.remove(this.driveCat); this.driveCat = this.makeSnowcat(Drive.g.kind); this.driveCatKind = Drive.g.kind; this.scene.add(this.driveCat); }
    const c = this.driveCat; c.visible = true;
    const x = Drive.x, z = Drive.y, hx = Math.cos(Drive.h), hz = Math.sin(Drive.h);
    const y = this.H(x, z), yf = this.H(x + hx * 3, z + hz * 3), yb = this.H(x - hx * 3, z - hz * 3);
    c.position.set(x, y, z); c.rotation.set(0, 0, 0); c.rotation.order = 'YXZ'; c.rotation.y = -Drive.h + Math.PI / 2; c.rotation.x = -Math.atan2(yf - yb, 6);
  },

  // ---------- HUD ----------
  hud(dt = 0) {
    const el = (id) => document.getElementById(id);
    const T = G.today || {};
    el('h3stats').innerHTML = `<b>${G.name || 'Your resort'}</b><br>${World.dateStr()} · ${G.phase === 'drive' ? '🌙 ' : ''}${Sim.clockStr()}<br>💰 ${U.money(G.cash)} · 👥 ${Sim.operating() ? Math.round(Sim.onHill()).toLocaleString() + ' on the hill' : G.seasonOpen ? 'closed' : 'pre-season'} · ❄ ${Math.round(G.baseDepth)} cm`;
    const modeTxt = { walk: '🥾 Walking', ski: '🎿 Skiing', ride: '🚡 Riding', drive: '🚜 Grooming', tour: '🚁 Touring' }[this.mode];
    const sp = Math.hypot(this.P.vx, this.P.vz) * 3.6;
    el('h3mode').innerHTML = `${modeTxt}${this.mode === 'ski' ? ` · <b>${Math.round(sp)} km/h</b>` : ''}${this.mode === 'drive' ? ` · <b>${(Math.abs(Drive.v) * 3.6).toFixed(0)} km/h</b> · fuel ${Math.round(Drive.fuel * 100)}% · tiller ${Drive.tiller ? 'DOWN' : 'up'} · blade ${Drive.blade ? 'DOWN' : 'up'} · groomed ${(Drive.cells * CELL * CELL / 10000).toFixed(2)} ha` : ''}`;
    // where am I
    const ci = Terrain.cellAt(this.P.x, this.P.z); let where = '';
    for (const r of G.runs) if (r.cells.includes(ci)) { where = `${DIFF[r.diff].icon} ${r.name} · ${Sim.surfaceLabel(r)}`; break; }
    el('h3where').textContent = where || (this.inOffice() ? '🏢 Resort office' : '');
    const n = this.mode === 'tour' || this.mode === 'drive' ? null : this.nearest();
    el('h3prompt').hidden = !n; if (n) el('h3prompt').textContent = n.label;
    if (G.phase === 'drive' && Drive.msgT > 0) this.say(Drive.msg);
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) el('h3msg').hidden = true; }
    el('h3tour').hidden = this.mode !== 'tour'; document.body.classList.toggle('tour3d', this.mode === 'tour');
    el('h3cross').hidden = this.mode === 'tour';
    this.drawMinimap();
  },
  drawMinimap() {
    const c = document.getElementById('h3mini'); if (!c) return;
    if ((this._mm = (this._mm || 0) + 1) % 6 && c.width === (this.bigMap ? 520 : 200)) return;
    const big = this.bigMap, W = big ? 520 : 200, H = Math.round(W * MAP_H / MAP_W);
    if (c.width !== W) { c.width = W; c.height = H; c.style.width = W + 'px'; c.style.height = H + 'px'; }
    const x = c.getContext('2d');
    x.drawImage(Terrain.cBase, 0, 0, W, H);
    const sx = W / (MAP_W * CELL), sy = H / (MAP_H * CELL);
    x.lineCap = 'round';
    for (const r of G.runs) { x.strokeStyle = r.diff === 'green' ? '#2ecc40' : r.diff === 'blue' ? '#1f6feb' : '#111'; x.lineWidth = big ? 3 : 2; x.beginPath(); r.points.forEach((p, k) => k ? x.lineTo(p.x * sx, p.y * sy) : x.moveTo(p.x * sx, p.y * sy)); x.stroke(); }
    for (const l of G.lifts) { x.strokeStyle = '#d62828'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(l.bottom.x * sx, l.bottom.y * sy); x.lineTo(l.top.x * sx, l.top.y * sy); x.stroke(); }
    for (const b of G.buildings) { x.fillStyle = b.kind === 'office' ? '#ffd34d' : '#6b4b3b'; x.fillRect(b.x * sx - 2, b.y * sy - 2, 4, 4); }
    const px = this.P.x * sx, py = this.P.z * sy, a = -this.yaw - Math.PI / 2;
    x.fillStyle = '#ffd34d'; x.strokeStyle = '#000'; x.beginPath(); x.moveTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7); x.lineTo(px + Math.cos(a + 2.5) * 5, py + Math.sin(a + 2.5) * 5); x.lineTo(px + Math.cos(a - 2.5) * 5, py + Math.sin(a - 2.5) * 5); x.closePath(); x.fill(); x.stroke();
  },
  render() { if (this.active) this.renderer.render(this.scene, this.camera); },
};
