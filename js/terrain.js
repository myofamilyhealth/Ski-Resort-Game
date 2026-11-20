// ---------- Terrain generation & layered rendering ----------
const Terrain = {
  N: MAP_W * MAP_H,
  idx: (x, y) => y * MAP_W + x,

  generate(seed, site) {
    site = site || { vert: 1, ridges: 1, peaks: 1, trees: 1, lake: true };
    this.treeVer = (this.treeVer || 0) + 1;
    const N = this.N;
    this.seed = seed;
    this.elev = new Float32Array(N);
    this.slope = new Float32Array(N);  // fall-line grade in %
    this.aspectX = new Float32Array(N); // downhill unit vector
    this.aspectY = new Float32Array(N);
    this.trees = new Float32Array(N);
    this.rock = new Uint8Array(N);
    this.groom = new Float32Array(N);   // 0..1 surface smoothness
    this.gdir = new Float32Array(N);    // corduroy direction (radians)
    this.powder = new Float32Array(N);  // cm fresh, untracked snow
    this.runMask = new Uint16Array(N);  // number of runs covering cell
    this.dirtyTrees = new Set(); this.dirtySurf = new Set();
    const nz = new Noise(seed), nz2 = new Noise(seed + 77), nz3 = new Noise(seed + 991);
    const S = MAP_H * CELL / 1800; // size factor vs. the original 1.8 km map
    const VERT = 640 * S * site.vert;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const nx = x / MAP_W, ny = y / MAP_H;
        let h = 1580 + VERT * Math.pow(1 - ny, 1.6);
        // ridges & gullies running down the fall line
        const r = nz.ridge(nx * 3.2 * S + 3.1, ny * 1.1 * S + 1.7, 4);
        h += 62 * site.ridges * (r - 0.5) * Math.pow(1 - ny, 0.7);
        h += 24 * (nz2.fbm(nx * 6 * S, ny * 6 * S, 3) - 0.5);
        h += 7 * (nz2.fbm(nx * 30 * S + 9, ny * 30 * S, 2) - 0.5); // knolls, rolls & benches
        // summit peaks
        const pk = (cx, cy, s, a) => a * Math.exp(-((nx - cx) ** 2 + (ny - cy) ** 2) / (2 * s * s));
        h += (pk(0.3, 0.04, 0.12, 110 * S) + pk(0.74, 0.08, 0.11, 85 * S) + pk(0.52, 0.0, 0.09, 50 * S) + pk(0.12, 0.2, 0.08, 60 * S) + pk(0.9, 0.25, 0.07, 55 * S)) * site.peaks;
        // flatten the valley floor for the base area
        if (ny > 0.9) { const t = (ny - 0.9) / 0.1; h = U.lerp(h, 1580 + 6 * (1 - t), Math.min(1, t * 0.9)); }
        this.elev[this.idx(x, y)] = h;
      }
    }
    // smooth once
    const e2 = new Float32Array(N);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H) continue;
        s += this.elev[this.idx(xx, yy)]; c++;
      }
      e2[this.idx(x, y)] = s / c;
    }
    this.elev = e2;
    this.minE = Infinity; this.maxE = -Infinity;
    for (let i = 0; i < N; i++) { this.minE = Math.min(this.minE, this.elev[i]); this.maxE = Math.max(this.maxE, this.elev[i]); }
    this.makeWater(site.lake !== false);
    this.treeLine = this.maxE - 260;
    this.computeSlope();
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const i = this.idx(x, y), nx = x / MAP_W, ny = y / MAP_H;
      let d = U.clamp(nz3.fbm(nx * 5, ny * 5, 4) * 2.6 - 1.15 + (site.trees - 1) * 0.5, 0, 1);
      d = Math.max(d, U.clamp(nz3.fbm(nx * 16 + 5, ny * 16, 2) * 2.2 - 1.3, 0, 1) * 0.7);
      const h = this.elev[i];
      d *= U.clamp((this.treeLine - h) / 70, 0, 1);
      if (this.slope[i] > 72) { this.rock[i] = 1; d *= 0.2; }
      if (ny > 0.9 && Math.abs(nx - 0.5) < 0.22) d *= 0.15; // base meadow
      if (this.water[i]) d = 0;
      else if (this.wet[i] > 0.15 && h < this.treeLine) d = Math.max(d, 0.55); // trees line the creeks
      this.trees[i] = d < 0.12 ? 0 : d;
      this.groom[i] = 0.35; this.gdir[i] = 0; this.powder[i] = 0;
    }
  },

  // Frozen creeks (flow accumulation) and a pond near the base
  makeWater(lake) {
    const N = this.N, E = this.elev;
    this.water = new Uint8Array(N); // 1 = creek, 2 = pond
    if (lake) {
    const lk = { x: Math.round(MAP_W * 0.22), y: Math.round(MAP_H * 0.93), r: Math.round(MAP_W * 0.03) };
    let lv = Infinity;
    for (let y = lk.y - lk.r; y <= lk.y + lk.r; y++) for (let x = lk.x - lk.r; x <= lk.x + lk.r; x++) if (Math.hypot(x - lk.x, (y - lk.y) * 1.4) <= lk.r) lv = Math.min(lv, this.e(x, y));
    lv -= 1.5;
    for (let y = lk.y - lk.r * 2; y <= lk.y + lk.r * 2; y++) for (let x = lk.x - lk.r * 2; x <= lk.x + lk.r * 2; x++) {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      const d = Math.hypot(x - lk.x, (y - lk.y) * 1.4) / lk.r, i = y * MAP_W + x;
      if (d <= 1) { E[i] = lv; this.water[i] = 2; } else if (d < 2) E[i] = U.lerp(lv + 1, E[i], (d - 1));
    }
    this.lake = { x: (lk.x + 0.5) * CELL, y: (lk.y + 0.5) * CELL, r: lk.r * CELL };
    } else this.lake = null;
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => E[b] - E[a]);
    const acc = new Float32Array(N).fill(1);
    for (const i of order) {
      const x = i % MAP_W, y = (i / MAP_W) | 0;
      let best = -1, be = E[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H) continue;
        const j = yy * MAP_W + xx; if (E[j] < be) { be = E[j]; best = j; }
      }
      if (best >= 0) acc[best] += acc[i];
    }
    for (let i = 0; i < N; i++) {
      const y = (i / MAP_W) | 0;
      if (acc[i] > 420 && y > MAP_H * 0.1 && !this.water[i]) { this.water[i] = 1; E[i] -= Math.min(4, Math.log(acc[i]) * 0.5); }
    }
    // smooth wetness field for nice-looking curves when drawing
    this.wet = new Float32Array(N);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H) continue; s += this.water[yy * MAP_W + xx] ? 1 : 0; c++; }
      this.wet[y * MAP_W + x] = s / c;
    }
  },
  wetAt(mx, my) {
    const fx = U.clamp(mx / CELL - 0.5, 0, MAP_W - 1.001), fy = U.clamp(my / CELL - 0.5, 0, MAP_H - 1.001);
    const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y, W = this.wet, i = y * MAP_W + x;
    return U.lerp(U.lerp(W[i], W[i + 1], tx), U.lerp(W[i + MAP_W], W[i + MAP_W + 1], tx), ty);
  },
  computeSlope() {
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const i = this.idx(x, y);
      const ex = this.e(x + 1, y) - this.e(x - 1, y);
      const ey = this.e(x, y + 1) - this.e(x, y - 1);
      const gx = ex / (2 * CELL), gy = ey / (2 * CELL);
      const g = Math.hypot(gx, gy);
      this.slope[i] = g * 100;
      this.aspectX[i] = g ? -gx / g : 0; this.aspectY[i] = g ? -gy / g : 1;
    }
  },
  e(x, y) { x = U.clamp(x, 0, MAP_W - 1); y = U.clamp(y, 0, MAP_H - 1); return this.elev[y * MAP_W + x]; },
  // bilinear elevation at world meters
  heightAt(mx, my) {
    const fx = U.clamp(mx / CELL - 0.5, 0, MAP_W - 1.001), fy = U.clamp(my / CELL - 0.5, 0, MAP_H - 1.001);
    const x = Math.floor(fx), y = Math.floor(fy), tx = fx - x, ty = fy - y;
    const a = this.e(x, y), b = this.e(x + 1, y), c = this.e(x, y + 1), d = this.e(x + 1, y + 1);
    return U.lerp(U.lerp(a, b, tx), U.lerp(c, d, tx), ty);
  },
  cellAt(mx, my) {
    const x = Math.floor(mx / CELL), y = Math.floor(my / CELL);
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return -1;
    return y * MAP_W + x;
  },
  slopeAt(mx, my) { const i = this.cellAt(mx, my); return i < 0 ? 0 : this.slope[i]; },

  // ---------- Rendering layers ----------
  initCanvases() {
    const w = MAP_W * PX, h = MAP_H * PX;
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    this.cBase = mk(); this.cTrees = mk(); this.cSurf = mk(); this.cSlope = mk();
    this.renderBase(); this.renderSlope();
    this.ctxT = this.cTrees.getContext('2d'); this.ctxS = this.cSurf.getContext('2d');
    this.renderAllTrees();
    this.renderAllSurface();
    this.dirtyTrees = new Set(); this.dirtySurf = new Set();
  },
  renderBase() {
    const w = MAP_W * PX, h = MAP_H * PX;
    const ctx = this.cBase.getContext('2d');
    const img = ctx.createImageData(w, h); const d = img.data;
    const L = { x: -0.6, y: -0.7, z: 0.9 }; const ll = Math.hypot(L.x, L.y, L.z);
    L.x /= ll; L.y /= ll; L.z /= ll;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const mx = (px + 0.5) / PX * CELL, my = (py + 0.5) / PX * CELL;
        const hc = this.heightAt(mx, my);
        const hx = this.heightAt(mx + 4, my) - this.heightAt(mx - 4, my);
        const hy = this.heightAt(mx, my + 4) - this.heightAt(mx, my - 4);
        let nx = -hx / 8, ny = -hy / 8, nzv = 1; const nl = Math.hypot(nx, ny, nzv);
        nx /= nl; ny /= nl; nzv /= nl;
        let s = U.clamp(nx * L.x + ny * L.y + nzv * L.z, 0, 1);
        s = Math.pow(s, 1.6);
        let r = U.lerp(118, 250, s), g = U.lerp(140, 252, s), b = U.lerp(190, 255, s);
        const grade = Math.hypot(hx, hy) / 8 * 100;
        const rk = U.clamp((grade - 66) / 14, 0, 1);
        if (rk > 0) {
          const n = ((Math.sin(mx * 0.9 + my * 0.37) + Math.sin(mx * 0.23 - my * 1.1)) * 0.25 + 0.5);
          r = U.lerp(r, U.lerp(72, 150, s) + n * 20, rk * 0.9); g = U.lerp(g, U.lerp(70, 146, s) + n * 18, rk * 0.9); b = U.lerp(b, U.lerp(78, 150, s) + n * 16, rk * 0.9);
        }
        // sun-warmed vs. shaded snow, sparkle texture, alpine brightness
        const hsh = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453; const grain = (hsh - Math.floor(hsh) - 0.5) * 7;
        const warm = (s - 0.6) * 14;
        r += grain + warm; g += grain + warm * 0.6; b += grain - warm * 0.4;
        if (hc > this.maxE - 260) { const a = U.clamp((hc - (this.maxE - 260)) / 200, 0, 1) * 8; r += a; g += a; b += a; }
        // frozen creeks & the pond
        const wv = this.wetAt(mx, my);
        if (this.lake && Math.hypot((mx - this.lake.x), (my - this.lake.y) * 1.4) < this.lake.r) {
          const crack = Math.abs(Math.sin(mx * 0.35 + Math.sin(my * 0.21) * 3)) < 0.06 ? 25 : 0;
          r = 168 + grain - crack; g = 198 + grain - crack; b = 226 + grain - crack * 0.5;
        } else if (wv > 0.16) {
          const k = U.clamp((wv - 0.16) * 4, 0, 0.85);
          r = U.lerp(r, 120, k); g = U.lerp(g, 160, k); b = U.lerp(b, 200, k);
          if (wv > 0.3 && Math.sin(mx * 1.7 + my * 0.9) > 0.6) { r += 18; g += 18; b += 14; } // ice glints
        }
        // contours
        const c25 = Math.floor(hc / 25), c100 = Math.floor(hc / 100);
        const hR = this.heightAt(mx + CELL / PX, my), hD = this.heightAt(mx, my + CELL / PX);
        if (Math.floor(hR / 100) !== c100 || Math.floor(hD / 100) !== c100) { r *= 0.8; g *= 0.82; b *= 0.88; }
        else if (Math.floor(hR / 25) !== c25 || Math.floor(hD / 25) !== c25) { r *= 0.93; g *= 0.94; b *= 0.96; }
        const o = (py * w + px) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // elevation labels on the 100 m contours
    ctx.font = '600 9px system-ui, sans-serif'; ctx.fillStyle = 'rgba(60,75,105,0.75)'; ctx.textAlign = 'center';
    for (let y = 8; y < MAP_H - 4; y += 22) {
      let lastX = -99;
      for (let x = 1; x < MAP_W - 1; x++) {
        const a = Math.floor(this.e(x, y) / 100), bb = Math.floor(this.e(x + 1, y) / 100);
        if (a !== bb && x - lastX > 40 && !this.water[y * MAP_W + x]) { ctx.fillText(Math.max(a, bb) * 100 + ' m', (x + 1) * PX, y * PX + 3); lastX = x; }
      }
    }
    ctx.textAlign = 'left';
  },
  renderSlope() {
    const ctx = this.cSlope.getContext('2d');
    const w = MAP_W * PX, h = MAP_H * PX;
    const img = ctx.createImageData(w, h); const d = img.data;
    const cols = [[46, 204, 64, 95], [31, 111, 235, 100], [20, 20, 20, 105], [220, 30, 30, 115]];
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const mx = (px + 0.5) / PX * CELL, my = (py + 0.5) / PX * CELL;
      const hx = this.heightAt(mx + 12, my) - this.heightAt(mx - 12, my), hy = this.heightAt(mx, my + 12) - this.heightAt(mx, my - 12);
      const s = Math.hypot(hx, hy) / 24 * 100;
      const c = cols[s < 25 ? 0 : s < 40 ? 1 : s < 60 ? 2 : 3];
      const o = (py * w + px) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
    }
    ctx.putImageData(img, 0, 0);
  },
  drawTreesOfCell(ctx, x, y) {
    const i = this.idx(x, y); const d = this.trees[i];
    const r = U.seeded(i * 2654435761);
    const hh = this.elev[i];
    // boulders on cliffs and above treeline
    if (this.rock[i] || (hh > this.treeLine && r() < 0.06)) {
      const bx = (x + r()) * PX, by = (y + r()) * PX, bs = 1.2 + r() * 1.6;
      ctx.fillStyle = 'rgba(30,35,50,0.3)'; ctx.beginPath(); ctx.ellipse(bx + 0.8, by + 0.6, bs * 1.2, bs * 0.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6d6f78'; ctx.beginPath(); ctx.moveTo(bx - bs, by + bs * 0.5); ctx.lineTo(bx - bs * 0.4, by - bs); ctx.lineTo(bx + bs, by - bs * 0.3); ctx.lineTo(bx + bs * 0.8, by + bs * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.moveTo(bx - bs * 0.6, by - bs * 0.2); ctx.lineTo(bx - bs * 0.4, by - bs); ctx.lineTo(bx + bs * 0.6, by - bs * 0.4); ctx.closePath(); ctx.fill();
    }
    if (d <= 0) return;
    const low = hh < this.minE + 320, high = hh > this.treeLine - 90;
    const n = Math.ceil(d * 2.6);
    for (let k = 0; k < n; k++) {
      const tx = (x + r()) * PX, ty = (y + r()) * PX, sz = 1.6 + r() * 1.9 * (0.6 + d * 0.5);
      ctx.fillStyle = 'rgba(30,40,60,0.25)';
      ctx.beginPath(); ctx.ellipse(tx + sz * 0.7, ty + sz * 0.6, sz, sz * 0.7, 0, 0, 7); ctx.fill();
      if (low && r() < 0.3) { // bare aspens & birches
        ctx.fillStyle = r() < 0.5 ? '#8a8174' : '#9b9284';
        ctx.beginPath(); ctx.arc(tx, ty, sz * 0.85, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(70,60,50,0.6)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(tx - sz * 0.6, ty); ctx.lineTo(tx + sz * 0.6, ty); ctx.moveTo(tx, ty - sz * 0.6); ctx.lineTo(tx, ty + sz * 0.6); ctx.stroke();
        continue;
      }
      ctx.fillStyle = high ? (r() < 0.5 ? '#2c5a3a' : '#355f40') : r() < 0.33 ? '#1f4d2b' : r() < 0.5 ? '#23592f' : '#1a4426';
      ctx.beginPath(); ctx.arc(tx, ty, high ? sz * 0.75 : sz, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(tx - sz * 0.3, ty - sz * 0.35, sz * 0.4, 0, 7); ctx.fill();
    }
  },
  renderAllTrees() {
    this.ctxT.clearRect(0, 0, this.cTrees.width, this.cTrees.height);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) this.drawTreesOfCell(this.ctxT, x, y);
  },
  redrawTreeCell(x, y) {
    const ctx = this.ctxT;
    ctx.save(); ctx.beginPath(); ctx.rect(x * PX, y * PX, PX, PX); ctx.clip();
    ctx.clearRect(x * PX, y * PX, PX, PX);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < MAP_W && yy < MAP_H) this.drawTreesOfCell(ctx, xx, yy);
    }
    ctx.restore();
  },
  drawSurfCell(ctx, x, y) {
    const i = this.idx(x, y);
    ctx.clearRect(x * PX, y * PX, PX, PX);
    if (!this.runMask[i]) return;
    const g = this.groom[i], p = this.powder[i];
    const X = x * PX, Y = y * PX;
    if (p > 4) {
      ctx.fillStyle = `rgba(255,255,255,${U.clamp(0.55 + p / 60, 0.55, 0.95)})`;
      ctx.fillRect(X, Y, PX, PX);
      if (g < 0.5) { // tracked powder
        const r = U.seeded(i * 31 + Math.floor(p));
        ctx.strokeStyle = 'rgba(150,170,200,0.35)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); for (let k = 0; k < 2; k++) { const sx = X + r() * PX; ctx.moveTo(sx, Y); ctx.lineTo(sx + (r() - 0.5) * 3, Y + PX); } ctx.stroke();
      }
      return;
    }
    if (g > 0.7) {
      // fresh corduroy
      ctx.fillStyle = 'rgba(246,249,255,0.9)'; ctx.fillRect(X, Y, PX, PX);
      const a = this.gdir[i]; const cx = X + PX / 2, cy = Y + PX / 2;
      const px = -Math.sin(a), py = Math.cos(a), dx = Math.cos(a), dy = Math.sin(a);
      ctx.strokeStyle = `rgba(160,180,215,${0.35 + (g - 0.7)})`; ctx.lineWidth = 0.7;
      ctx.save(); ctx.beginPath(); ctx.rect(X, Y, PX, PX); ctx.clip();
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) {
        const ox = cx + px * k * 1.4, oy = cy + py * k * 1.4;
        ctx.moveTo(ox - dx * PX, oy - dy * PX); ctx.lineTo(ox + dx * PX, oy + dy * PX);
      }
      ctx.stroke(); ctx.restore();
    } else if (g > 0.4) {
      ctx.fillStyle = 'rgba(232,238,248,0.7)'; ctx.fillRect(X, Y, PX, PX);
      const r = U.seeded(i * 7);
      ctx.fillStyle = 'rgba(160,175,205,0.35)';
      for (let k = 0; k < 3; k++) ctx.fillRect(X + r() * PX, Y + r() * PX, 1, 1);
    } else {
      // moguls / skied-off
      ctx.fillStyle = g < 0.15 ? 'rgba(205,218,236,0.75)' : 'rgba(220,229,242,0.7)';
      ctx.fillRect(X, Y, PX, PX);
      const r = U.seeded(i * 13);
      ctx.fillStyle = 'rgba(120,140,180,0.45)';
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(X + r() * PX, Y + r() * PX, 1 + r(), 0, 7); ctx.fill(); }
    }
  },
  renderAllSurface() {
    this.ctxS.clearRect(0, 0, this.cSurf.width, this.cSurf.height);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (this.runMask[this.idx(x, y)]) this.drawSurfCell(this.ctxS, x, y);
  },
  markTree(i) { this.dirtyTrees.add(i); },
  markSurf(i) { this.dirtySurf.add(i); },
  flush() {
    if (this.dirtyTrees.size) { for (const i of this.dirtyTrees) this.redrawTreeCell(i % MAP_W, (i / MAP_W) | 0); this.dirtyTrees.clear(); }
    if (this.dirtySurf.size) { for (const i of this.dirtySurf) this.drawSurfCell(this.ctxS, i % MAP_W, (i / MAP_W) | 0); this.dirtySurf.clear(); }
  },
  // Cells within radius (m) of a polyline
  cellsAlong(points, radius) {
    const set = new Set();
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k], b = points[k + 1];
      const minx = Math.max(0, Math.floor((Math.min(a.x, b.x) - radius) / CELL));
      const maxx = Math.min(MAP_W - 1, Math.floor((Math.max(a.x, b.x) + radius) / CELL));
      const miny = Math.max(0, Math.floor((Math.min(a.y, b.y) - radius) / CELL));
      const maxy = Math.min(MAP_H - 1, Math.floor((Math.max(a.y, b.y) + radius) / CELL));
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const c = { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
        if (U.segDist(c, a, b).d <= radius) set.add(y * MAP_W + x);
      }
    }
    return [...set];
  },
  cellsInCircle(cx, cy, r) {
    const out = [];
    const x0 = Math.max(0, Math.floor((cx - r) / CELL)), x1 = Math.min(MAP_W - 1, Math.floor((cx + r) / CELL));
    const y0 = Math.max(0, Math.floor((cy - r) / CELL)), y1 = Math.min(MAP_H - 1, Math.floor((cy + r) / CELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (Math.hypot((x + 0.5) * CELL - cx, (y + 0.5) * CELL - cy) <= r) out.push(y * MAP_W + x);
    }
    return out;
  },
  treeCost(cells) { let c = 0; for (const i of cells) c += this.trees[i] * 650; return c; },
  clearTrees(cells) { let ch = false; for (const i of cells) if (this.trees[i] > 0) { this.trees[i] = 0; this.markTree(i); ch = true; } if (ch) this.treeVer++; },
};
