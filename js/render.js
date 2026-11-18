// ---------- Rendering ----------
const Render = {
  cam: { x: MAP_W * CELL / 2, y: MAP_H * CELL * 0.6, zoom: 0.5 },
  overlay: 'none', // none | slope | groom | snow
  init(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.night = document.createElement('canvas');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.flakes = Array.from({ length: 300 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.9 }));
  },
  resize() {
    const r = this.c.getBoundingClientRect(); const d = devicePixelRatio || 1;
    this.W = r.width; this.H = r.height;
    this.c.width = r.width * d; this.c.height = r.height * d;
    this.night.width = this.c.width; this.night.height = this.c.height;
  },
  toWorld(sx, sy) { return { x: (sx - this.W / 2) / this.cam.zoom + this.cam.x, y: (sy - this.H / 2) / this.cam.zoom + this.cam.y }; },
  toScreen(x, y) { return { x: (x - this.cam.x) * this.cam.zoom + this.W / 2, y: (y - this.cam.y) * this.cam.zoom + this.H / 2 }; },
  clampCam() {
    const c = this.cam;
    const WW = MAP_W * CELL, HH = MAP_H * CELL;
    c.zoom = U.clamp(c.zoom, Math.max(0.2, Math.min(this.W / WW, this.H / HH) * 0.9), 6);
    const hw = this.W / 2 / c.zoom, hh = this.H / 2 / c.zoom;
    c.x = hw * 2 >= WW ? WW / 2 : U.clamp(c.x, hw, WW - hw);
    c.y = hh * 2 >= HH ? HH / 2 : U.clamp(c.y, hh, HH - hh);
  },

  draw(now) {
    const ctx = this.ctx, d = devicePixelRatio || 1, cam = this.cam;
    Terrain.flush();
    this.clampCam();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#1d2733'; ctx.fillRect(0, 0, this.W, this.H);
    ctx.save();
    ctx.translate(this.W / 2, this.H / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x, -cam.y);
    const WW = MAP_W * CELL, HH = MAP_H * CELL;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(Terrain.cBase, 0, 0, WW, HH);
    const ov = UI.tool && (UI.tool.kind === 'run' || UI.tool.kind === 'lift') && this.overlay === 'none' ? 'slope' : this.overlay;
    if (ov === 'slope') ctx.drawImage(Terrain.cSlope, 0, 0, WW, HH);
    this.drawRunEdges(ctx);
    this.drawSurface(ctx, WW, HH);
    if (ov === 'groom' || ov === 'snow') this.drawConditionOverlay(ctx, ov);
    this.drawAvalanches(ctx);
    ctx.drawImage(Terrain.cTrees, 0, 0, WW, HH);
    this.drawRuns(ctx);
    this.drawBuildings(ctx, now);
    this.drawLifts(ctx, now);
    this.drawAgents(ctx);
    this.drawIncidents(ctx, now);
    this.drawSleds(ctx, now);
    UI.drawToolPreview(ctx);
    ctx.restore();

    // daylight tint
    if (G.phase === 'day' || G.phase === 'dusk') {
      const t = G.time;
      let a = 0;
      if (t < 8 * 60) a = (8 * 60 - t) / 60 * 0.35;
      if (t > 15 * 60 + 30) a = (t - (15 * 60 + 30)) / 60 * 0.4;
      if (a > 0) { ctx.fillStyle = `rgba(30,25,70,${U.clamp(a, 0, 0.45)})`; ctx.fillRect(0, 0, this.W, this.H); }
      const w = Weather.today();
      if (w.vis < 1) { ctx.fillStyle = `rgba(210,215,225,${(1 - w.vis) * 0.35})`; ctx.fillRect(0, 0, this.W, this.H); }
      if (w.snowDay > 0 || w.type === 'rain') this.drawPrecip(ctx, w.type === 'rain', (w.snowDay + 2) / 20, now);
    }
    if (G.phase === 'drive') this.drawNight(ctx, now);
  },

  drawRunEdges(ctx) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of G.runs) {
      ctx.strokeStyle = r.park ? 'rgba(255,110,199,0.6)' : r.diff === 'green' ? 'rgba(46,204,64,0.6)' : r.diff === 'blue' ? 'rgba(31,111,235,0.6)' : 'rgba(10,10,20,0.5)';
      ctx.lineWidth = r.width + Math.max(3, 2.5 / this.cam.zoom);
      ctx.beginPath(); r.points.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      ctx.strokeStyle = 'rgba(248,250,255,0.85)'; ctx.lineWidth = r.width;
      ctx.beginPath(); r.points.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    }
  },
  // crisp corduroy stripes & mogul fields when zoomed in
  drawSurfaceDetail(sc) {
    const tl = this.toWorld(0, 0), br = this.toWorld(this.W, this.H);
    const x0 = Math.max(0, Math.floor(tl.x / CELL) - 1), x1 = Math.min(MAP_W - 1, Math.ceil(br.x / CELL) + 1);
    const y0 = Math.max(0, Math.floor(tl.y / CELL) - 1), y1 = Math.min(MAP_H - 1, Math.ceil(br.y / CELL) + 1);
    const h = CELL / 2, sp = 1.6;
    const groove = new Path2D(), ridge = new Path2D(), bumpsS = new Path2D(), bumpsL = new Path2D();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * MAP_W + x;
      if (!Terrain.runMask[i] || Terrain.powder[i] > 4) continue;
      const g = Terrain.groom[i];
      const cx = (x + 0.5) * CELL, cy = (y + 0.5) * CELL;
      if (g > 0.7) {
        const a = Terrain.gdir[i], dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
        const t0 = cx * nx + cy * ny;
        const reach = h * (Math.abs(nx) + Math.abs(ny));
        for (let s = Math.ceil((t0 - reach) / sp) * sp; s <= t0 + reach; s += sp) {
          const ox = cx + nx * (s - t0), oy = cy + ny * (s - t0);
          let lo = -1e9, hi = 1e9;
          if (Math.abs(dx) > 1e-6) { const a1 = (cx - h - ox) / dx, a2 = (cx + h - ox) / dx; lo = Math.max(lo, Math.min(a1, a2)); hi = Math.min(hi, Math.max(a1, a2)); } else if (Math.abs(ox - cx) > h) continue;
          if (Math.abs(dy) > 1e-6) { const b1 = (cy - h - oy) / dy, b2 = (cy + h - oy) / dy; lo = Math.max(lo, Math.min(b1, b2)); hi = Math.min(hi, Math.max(b1, b2)); } else if (Math.abs(oy - cy) > h) continue;
          if (hi <= lo) continue;
          groove.moveTo(ox + dx * lo, oy + dy * lo); groove.lineTo(ox + dx * hi, oy + dy * hi);
          ridge.moveTo(ox + dx * lo + nx * 0.5, oy + dy * lo + ny * 0.5); ridge.lineTo(ox + dx * hi + nx * 0.5, oy + dy * hi + ny * 0.5);
        }
      } else if (g < 0.45) {
        const r = U.seeded(i * 97 + 13);
        const n = g < 0.2 ? 5 : 3;
        for (let k = 0; k < n; k++) {
          const bx = cx + (r() - 0.5) * CELL * 0.9, by = cy + (r() - 0.5) * CELL * 0.9, rad = 1.3 + r() * 1.2;
          bumpsS.moveTo(bx + rad + 0.6, by + 0.6); bumpsS.ellipse(bx + 0.6, by + 0.6, rad, rad * 0.8, 0, 0, 7);
          bumpsL.moveTo(bx + rad * 0.5 - 0.3, by - 0.3); bumpsL.ellipse(bx - 0.3, by - 0.3, rad * 0.55, rad * 0.45, 0, 0, 7);
        }
      }
    }
    sc.lineWidth = 0.55; sc.strokeStyle = 'rgba(120,145,190,0.55)'; sc.stroke(groove);
    sc.lineWidth = 0.4; sc.strokeStyle = 'rgba(255,255,255,0.9)'; sc.stroke(ridge);
    sc.fillStyle = 'rgba(110,130,175,0.35)'; sc.fill(bumpsS);
    sc.fillStyle = 'rgba(255,255,255,0.8)'; sc.fill(bumpsL);
  },
  drawSurface(ctx, WW, HH) {
    if (!G.runs.length) return;
    const d = devicePixelRatio || 1, cam = this.cam;
    if (!this.surf) this.surf = document.createElement('canvas');
    const s = this.surf;
    if (s.width !== this.c.width || s.height !== this.c.height) { s.width = this.c.width; s.height = this.c.height; }
    const sc = s.getContext('2d');
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.globalCompositeOperation = 'source-over'; sc.clearRect(0, 0, s.width, s.height);
    sc.setTransform(d * cam.zoom, 0, 0, d * cam.zoom, d * (this.W / 2 - cam.x * cam.zoom), d * (this.H / 2 - cam.y * cam.zoom));
    sc.imageSmoothingEnabled = true;
    sc.drawImage(Terrain.cSurf, 0, 0, WW, HH);
    if (cam.zoom > 1.1) this.drawSurfaceDetail(sc);
    sc.globalCompositeOperation = 'destination-in';
    sc.strokeStyle = '#000'; sc.lineCap = 'round'; sc.lineJoin = 'round';
    for (const r of G.runs) { sc.lineWidth = r.width; sc.beginPath(); r.points.forEach((p, k) => k ? sc.lineTo(p.x, p.y) : sc.moveTo(p.x, p.y)); sc.stroke(); }
    sc.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(s, 0, 0); ctx.restore();
  },

  drawPrecip(ctx, rain, intensity, now) {
    const n = Math.min(this.flakes.length, Math.round(80 + intensity * 220));
    ctx.fillStyle = rain ? 'rgba(170,190,220,0.6)' : 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = 'rgba(170,190,220,0.6)';
    const w = Weather.today();
    const drift = (w.wind || 3) * 0.02;
    for (let k = 0; k < n; k++) {
      const f = this.flakes[k];
      f.y += (rain ? 0.02 : 0.0025) * f.z * (G.speed || 1) * 0.6 + 0.0005;
      f.x += drift * 0.05 * f.z + Math.sin(now / 900 + k) * 0.0004;
      if (f.y > 1) { f.y = 0; f.x = Math.random(); } if (f.x > 1) f.x = 0;
      const x = f.x * this.W, y = f.y * this.H;
      if (rain) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 9); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(x, y, f.z * 1.6, 0, 7); ctx.fill(); }
    }
  },

  drawConditionOverlay(ctx, ov) {
    for (const r of G.runs) for (const i of r.cells) {
      const x = i % MAP_W, y = (i / MAP_W) | 0;
      let c;
      if (ov === 'groom') {
        const g = Terrain.groom[i];
        c = Terrain.powder[i] > 4 ? 'rgba(160,220,255,0.6)' : g > 0.7 ? 'rgba(40,200,80,0.55)' : g > 0.4 ? 'rgba(240,200,40,0.55)' : 'rgba(230,60,40,0.55)';
      } else {
        const dep = Sim.runDepth(r);
        c = dep < 30 ? 'rgba(200,60,40,0.6)' : dep < 60 ? 'rgba(240,180,40,0.55)' : dep < 120 ? 'rgba(80,170,240,0.5)' : 'rgba(120,80,240,0.5)';
      }
      ctx.fillStyle = c; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  },

  drawRuns(ctx) {
    const z = this.cam.zoom;
    for (const r of G.runs) {
      const open = Sim.runIsOpen(r);
      const D = DIFF[r.diff];
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // center line in difficulty colour
      ctx.strokeStyle = r.park ? '#ff6ec7' : D.color; ctx.globalAlpha = open ? 0.75 : 0.35;
      ctx.lineWidth = Math.max(1.2 / z, 2.2); ctx.setLineDash(open ? [] : [8 / z, 6 / z]);
      ctx.beginPath(); r.points.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // direction arrows
      if (z > 0.8) {
        ctx.fillStyle = D.color === '#111111' ? '#333' : D.color;
        for (let k = 20; k < r.samples.length - 5; k += 25) {
          const p = r.samples[k], q = r.samples[k + 2]; const a = Math.atan2(q.y - p.y, q.x - p.x);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3, -3); ctx.lineTo(-3, 3); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
      // park features
      if (r.park) for (const f of r.park.features) this.drawFeature(ctx, f, r);
      // trailhead sign
      const s = r.points[0];
      const sz = 9 / z;
      ctx.save(); ctx.translate(s.x, s.y);
      this.diffIcon(ctx, r.diff, sz, r.park);
      if (z > 0.45) {
        ctx.font = `600 ${11 / z}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
        const label = r.name + (open ? '' : r.avyClosed ? ' (AVY CLOSED)' : ' (closed)');
        const w = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(sz * 1.3, -7 / z, w + 6 / z, 14 / z);
        ctx.fillStyle = open ? '#111' : '#b02020'; ctx.fillText(label, sz * 1.3 + 3 / z, 0);
      }
      ctx.restore();
      if (r.deadEnd && z > 0.4) {
        const e = r.points[r.points.length - 1];
        ctx.fillStyle = '#ff9800'; ctx.font = `${14 / z}px sans-serif`; ctx.fillText('⚠', e.x - 6 / z, e.y);
      }
      if (UI.sel === r) {
        ctx.strokeStyle = 'rgba(255,200,0,0.9)'; ctx.lineWidth = 3 / z;
        ctx.beginPath(); r.points.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      }
    }
  },
  diffIcon(ctx, diff, sz, park) {
    ctx.lineWidth = sz * 0.18; ctx.strokeStyle = '#fff';
    if (park) { ctx.fillStyle = '#ff6ec7'; ctx.beginPath(); ctx.rect(-sz, -sz * 0.7, sz * 2, sz * 1.4); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `bold ${sz}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P', 0, 0); ctx.textAlign = 'left'; return; }
    if (diff === 'green') { ctx.fillStyle = DIFF.green.color; ctx.beginPath(); ctx.arc(0, 0, sz * 0.8, 0, 7); ctx.fill(); ctx.stroke(); }
    else if (diff === 'blue') { ctx.fillStyle = DIFF.blue.color; ctx.fillRect(-sz * 0.75, -sz * 0.75, sz * 1.5, sz * 1.5); ctx.strokeRect(-sz * 0.75, -sz * 0.75, sz * 1.5, sz * 1.5); }
    else {
      const dia = (ox) => { ctx.beginPath(); ctx.moveTo(ox, -sz); ctx.lineTo(ox + sz * 0.75, 0); ctx.lineTo(ox, sz); ctx.lineTo(ox - sz * 0.75, 0); ctx.closePath(); ctx.fillStyle = '#111'; ctx.fill(); ctx.stroke(); };
      if (diff === 'black') dia(0); else { dia(-sz * 0.7); dia(sz * 0.7); }
    }
  },
  drawFeature(ctx, f, r) {
    const F = PARK_FEATURES[f.kind];
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a || 0);
    const q = r.park.quality;
    const s = F.size * 6;
    if (F.icon === 'jump') {
      ctx.fillStyle = `rgba(255,255,255,${0.7 + q * 0.3})`; ctx.strokeStyle = '#7a8aa8'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(-s * 2, -s); ctx.lineTo(0, -s * 0.8); ctx.lineTo(0, s * 0.8); ctx.lineTo(-s * 2, s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(120,140,180,0.35)'; ctx.fillRect(0, -s * 0.8, s * 1.2, s * 1.6);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(s * 1.2, -s * 1.1, s * 2.5, s * 2.2); ctx.strokeRect(s * 1.2, -s * 1.1, s * 2.5, s * 2.2);
    } else if (F.icon === 'rail' || F.icon === 'box') {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = F.icon === 'rail' ? 3 : 5;
      ctx.beginPath(); ctx.moveTo(-11, 1.5); ctx.lineTo(11, 1.5); ctx.stroke();
      ctx.strokeStyle = F.icon === 'rail' ? '#d8dce6' : '#f0a020'; ctx.lineWidth = F.icon === 'rail' ? 1.6 : 4;
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke();
    } else if (F.icon === 'wall') {
      ctx.fillStyle = '#7d5a3c'; ctx.fillRect(-9, -2.5, 18, 5); ctx.strokeStyle = '#3d2a1c'; ctx.lineWidth = 0.8; ctx.strokeRect(-9, -2.5, 18, 5);
    } else if (F.icon === 'pipe') {
      ctx.fillStyle = 'rgba(150,175,215,0.6)'; ctx.fillRect(-55, -9, 110, 18);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-55, -9, 110, 18);
      ctx.strokeStyle = 'rgba(100,120,170,0.6)'; ctx.lineWidth = 0.6; for (let k = -50; k < 55; k += 6) { ctx.beginPath(); ctx.moveTo(k, -9); ctx.lineTo(k, 9); ctx.stroke(); }
    }
    ctx.restore();
  },

  drawLifts(ctx, now) {
    const z = this.cam.zoom;
    for (const l of G.lifts) {
      const T = LIFTS[l.kind];
      const a = l.bottom, b = l.top;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const px = -Math.sin(ang), py = Math.cos(ang);
      const building = l.buildDays > 0;
      const surface = T.cat === 'Surface';
      const gap = surface ? 0 : T.cat === 'Tram' ? 5 : T.seats >= 6 ? 3.5 : 2.5;
      // corridor
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = surface ? 6 : 12;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      // cables
      ctx.strokeStyle = building ? 'rgba(80,80,80,0.5)' : '#2b2b2b'; ctx.lineWidth = Math.max(0.5, 1 / z);
      if (building) ctx.setLineDash([6 / z, 6 / z]);
      for (const sgn of surface ? [0] : [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(a.x + px * gap * sgn, a.y + py * gap * sgn); ctx.lineTo(b.x + px * gap * sgn, b.y + py * gap * sgn); ctx.stroke();
      }
      ctx.setLineDash([]);
      // towers
      ctx.fillStyle = '#555';
      for (const t of l.towers) {
        const x = U.lerp(a.x, b.x, t), y = U.lerp(a.y, b.y, t);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        if (surface) ctx.fillRect(-1, -1, 2, 2); else { ctx.fillRect(-1.2, -gap - 1, 2.4, gap * 2 + 2); }
        ctx.restore();
      }
      // terminals
      const termSize = surface ? 4 : T.cat === 'Gondola' || T.cat === 'Tram' ? 11 : T.cat === 'Detachable' ? 8 : 5;
      for (const [p, top] of [[a, false], [b, true]]) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
        ctx.fillStyle = building ? '#b0a080' : top ? '#455a64' : '#37474f';
        ctx.fillRect(-termSize, -termSize * 0.8, termSize * 2, termSize * 1.6);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.strokeRect(-termSize, -termSize * 0.8, termSize * 2, termSize * 1.6);
        ctx.restore();
      }
      // carriers moving
      if (!building) {
        const running = Sim.liftIsOpen(l) && G.phase === 'day' && G.time >= LIFTS_OPEN - 30 && G.time <= LIFTS_CLOSE + 10 && Sim.operating();
        if (T.cat === 'Tram') {
          const ph = running ? (Math.sin(now / 1000 * T.speed / l.len * 40) + 1) / 2 : 0;
          for (const [ph2, sgn] of [[ph, 1], [1 - ph, -1]]) {
            const x = U.lerp(a.x, b.x, ph2) + px * gap * sgn, y = U.lerp(a.y, b.y, ph2) + py * gap * sgn;
            ctx.fillStyle = '#d32f2f'; ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillRect(-5, -3, 10, 6); ctx.restore();
          }
        } else if (!surface || l.kind === 'tbar') {
          const spacing = T.cat === 'Gondola' ? 40 : surface ? 30 : 25;
          const n = Math.floor(l.len / spacing);
          const off = running && !l.broken ? (now / 1000 * T.speed * Agents.K * (G.speed || 1) * 0.2) % spacing : 0;
          for (let k = 0; k < n; k++) {
            for (const sgn of surface ? [0] : [1, -1]) {
              let s = (k * spacing + off * sgn + spacing * 10) % l.len;
              const t = s / l.len;
              const x = U.lerp(a.x, b.x, t) + px * gap * sgn, y = U.lerp(a.y, b.y, t) + py * gap * sgn;
              ctx.fillStyle = T.cat === 'Gondola' ? '#e53935' : T.bubble ? '#1e88e5' : '#424242';
              const cw = T.cat === 'Gondola' ? 2.4 : Math.max(1, T.seats * 0.45);
              ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillRect(-1, -cw / 2, 2, cw); ctx.restore();
            }
          }
        }
      }
      // queue
      if (G.phase === 'day' && Sim.operating()) {
        const qn = Math.min(60, Math.round(Agents.queueCount(l) + (l.wait > 3 ? l.wait * 0.8 : 0)));
        for (let k = 0; k < qn; k++) {
          const row = Math.floor(k / 6), col = k % 6;
          const x = a.x - Math.cos(ang) * (8 + row * 2.4) + px * (col - 2.5) * 2.2;
          const y = a.y - Math.sin(ang) * (8 + row * 2.4) + py * (col - 2.5) * 2.2;
          ctx.fillStyle = JACKETS[(k * 7 + l.id) % JACKETS.length];
          ctx.beginPath(); ctx.arc(x, y, 1.1, 0, 7); ctx.fill();
        }
      }
      // label
      if (z > 0.35) {
        const mx = U.lerp(a.x, b.x, 0.5), my = U.lerp(a.y, b.y, 0.5);
        ctx.font = `600 ${11 / z}px system-ui, sans-serif`;
        let status = '';
        if (building) status = ` 🏗 ${l.buildDays}d`;
        else if (l.broken) status = ' 🛑 DOWN';
        else if (l.holdFrac >= 1) status = ' 💨 WIND HOLD';
        else if (!l.open) status = ' (closed)';
        else if (G.phase === 'day' && Sim.operating() && l.wait > 0.5) status = ` ⏱ ${Math.round(l.wait)} min`;
        const label = `${l.name}${status}`;
        const w = ctx.measureText(label).width;
        ctx.fillStyle = l.broken || l.holdFrac >= 1 ? 'rgba(180,30,30,0.9)' : 'rgba(30,40,55,0.82)';
        ctx.fillRect(mx - w / 2 - 4 / z, my - 8 / z, w + 8 / z, 16 / z);
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(label, mx, my); ctx.textAlign = 'left';
      }
      if (UI.sel === l) { ctx.strokeStyle = 'rgba(255,200,0,0.9)'; ctx.lineWidth = 3 / z; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      if (!l.reachable && !building && z > 0.4) { ctx.fillStyle = '#ff9800'; ctx.font = `${14 / z}px sans-serif`; ctx.fillText('⚠', a.x + 8 / z, a.y); }
    }
  },

  drawBuildings(ctx, now) {
    const z = this.cam.zoom;
    for (const b of G.buildings) {
      const B = BUILDINGS[b.kind];
      const r = B.r;
      ctx.save(); ctx.translate(b.x, b.y);
      if (b.kind === 'parking') {
        ctx.fillStyle = '#5d6168'; ctx.beginPath(); ctx.roundRect(-r, -r * 0.65, r * 2, r * 1.3, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.5;
        for (let x = -r + 4; x < r - 2; x += 3.5) { ctx.beginPath(); ctx.moveTo(x, -r * 0.6); ctx.lineTo(x, -r * 0.15); ctx.moveTo(x, r * 0.15); ctx.lineTo(x, r * 0.6); ctx.stroke(); }
        // cars
        if (G.phase === 'day' && G.today && G.today.visitors) {
          const fill = U.clamp(Sim.onHill() / Math.max(1, World.sumStat('parking', 'cars') * 2.4), 0, 1);
          const spots = Math.floor((r * 2 - 6) / 3.5) * 2; const n = Math.round(spots * fill);
          for (let k = 0; k < n; k++) { ctx.fillStyle = JACKETS[(k * 5) % JACKETS.length]; const x = -r + 4.8 + Math.floor(k / 2) * 3.5; const y = k % 2 ? r * 0.38 : -r * 0.38; ctx.fillRect(x - 1, y - 1.8, 2, 3.6); }
        }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-r * 0.75 + 2, -r * 0.6 + 2, r * 1.5, r * 1.2);
        ctx.fillStyle = B.color; ctx.fillRect(-r * 0.75, -r * 0.6, r * 1.5, r * 1.2);
        // roof w/ snow
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.moveTo(-r * 0.75, -r * 0.6); ctx.lineTo(0, -r * 0.05); ctx.lineTo(r * 0.75, -r * 0.6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.6; ctx.strokeRect(-r * 0.75, -r * 0.6, r * 1.5, r * 1.2);
      }
      if (b.buildDays > 0) {
        ctx.strokeStyle = '#f5b700'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
        ctx.strokeRect(-r, -r * 0.8, r * 2, r * 1.6); ctx.setLineDash([]);
      }
      const fs = Math.max(r * 0.9, 12 / z);
      ctx.font = `${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.buildDays > 0 ? '🏗️' : B.icon, 0, 0);
      if (z > 0.7) {
        ctx.font = `600 ${10 / z}px system-ui`; ctx.fillStyle = '#111';
        const lbl = B.name + (b.level > 1 ? ' L' + b.level : '') + (b.buildDays > 0 ? ` (${b.buildDays}d)` : '');
        const w = ctx.measureText(lbl).width;
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-w / 2 - 2 / z, r * 0.8, w + 4 / z, 13 / z);
        ctx.fillStyle = '#111'; ctx.fillText(lbl, 0, r * 0.8 + 6.5 / z);
      }
      ctx.textAlign = 'left';
      if (UI.sel === b) { ctx.strokeStyle = 'rgba(255,200,0,0.95)'; ctx.lineWidth = 3 / z; ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, 7); ctx.stroke(); }
      ctx.restore();
    }
  },

  drawAgents(ctx) {
    const z = this.cam.zoom;
    const rr = Math.max(1.3, 2.4 / z);
    for (const a of Agents.list) {
      if (a.state === 'queue') continue;
      ctx.fillStyle = a.color;
      if (a.state === 'ski' && z > 1.2) {
        ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.dir || 0);
        ctx.fillStyle = '#333'; if (a.board) ctx.fillRect(-0.5, -1.6, 1, 3.2); else { ctx.fillRect(-1.6, -0.7, 3.2, 0.35); ctx.fillRect(-1.6, 0.35, 3.2, 0.35); }
        ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, 7); ctx.fill();
        ctx.restore();
      } else { ctx.beginPath(); ctx.arc(a.x, a.y, a.state === 'ride' ? rr * 0.8 : rr, 0, 7); ctx.fill(); }
    }
  },

  drawIncidents(ctx, now) {
    const z = this.cam.zoom;
    for (const i of G.incidentsActive) {
      const pulse = 1 + 0.3 * Math.sin(now / 150);
      ctx.fillStyle = 'rgba(220,30,30,0.25)'; ctx.beginPath(); ctx.arc(i.x, i.y, 14 * pulse / Math.max(0.6, z * 0.6), 0, 7); ctx.fill();
      ctx.font = `${14 / z}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⛑️', i.x, i.y); ctx.textAlign = 'left';
    }
  },
  drawAvalanches(ctx) {
    for (const a of G.avalanches) {
      if (G.dayNum - a.day > 3) continue;
      const r = U.seeded(a.x * 7 + a.y);
      ctx.fillStyle = 'rgba(190,200,220,0.75)';
      for (let k = 0; k < 40; k++) { ctx.beginPath(); ctx.arc(a.x + (r() - 0.5) * a.r * 1.4, a.y + r() * a.r * 2.4 - a.r * 0.3, 2 + r() * 5, 0, 7); ctx.fill(); }
      ctx.strokeStyle = 'rgba(80,90,120,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x - a.r * 0.6, a.y - a.r * 0.4); ctx.quadraticCurveTo(a.x, a.y - a.r * 0.7, a.x + a.r * 0.6, a.y - a.r * 0.4); ctx.stroke();
    }
  },
  drawSleds(ctx, now) {
    // patrol sleds move between HQ and incidents
    const hq = World.built('patrolhq')[0];
    if (!hq || !G.sleds.length) return;
    let k = 0;
    for (const inc of G.incidentsActive) {
      if (k >= G.sleds.length) break;
      const t = U.clamp(1 - (inc.until - G.time - 15) / inc.resp, 0, 1);
      const x = U.lerp(hq.x, inc.x, t), y = U.lerp(hq.y, inc.y, t);
      ctx.fillStyle = '#d62828'; ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(inc.y - hq.y, inc.x - hq.x)); ctx.fillRect(-2.5, -1.2, 5, 2.4); ctx.fillStyle = '#ff0'; ctx.fillRect(1.5, -0.5, 1, 1); ctx.restore();
      k++;
    }
  },

  // reflective trail-boundary poles & run names that show up in the dark
  drawPoles(ctx) {
    const z = this.cam.zoom;
    for (const r of G.runs) {
      const smp = r.samples;
      for (let k = 0; k < smp.length - 1; k += 4) {
        const p = smp[k], q = smp[k + 1];
        const dx = q.x - p.x, dy = q.y - p.y, dl = Math.hypot(dx, dy) || 1;
        for (const sg of [-1, 1]) {
          const x = p.x - dy / dl * r.width / 2 * sg, y = p.y + dx / dl * r.width / 2 * sg;
          const s = this.toScreen(x, y);
          if (s.x < -10 || s.y < -10 || s.x > this.W + 10 || s.y > this.H + 10) continue;
          const dd = Drive.active ? Math.hypot(x - Drive.x, y - Drive.y) : 999;
          ctx.fillStyle = dd < 90 ? 'rgba(255,140,30,0.95)' : 'rgba(255,140,30,0.35)';
          ctx.beginPath(); ctx.arc(s.x, s.y, dd < 90 ? 2.2 : 1.4, 0, 7); ctx.fill();
        }
      }
      const s = this.toScreen(r.points[0].x, r.points[0].y);
      ctx.font = '600 12px system-ui'; ctx.fillStyle = 'rgba(200,220,255,0.7)'; ctx.fillText(DIFF[r.diff].icon + ' ' + r.name, s.x + 8, s.y);
    }
  },
  drawMinimap(ctx) {
    const mw = 220, mh = 165, x0 = this.W - mw - 12, y0 = this.H - mh - 12;
    if (!this.mini || Drive.miniT-- <= 0) {
      Drive.miniT = 20;
      if (!this.mini) { this.mini = document.createElement('canvas'); this.mini.width = MAP_W; this.mini.height = MAP_H; }
      const mc = this.mini.getContext('2d');
      mc.drawImage(Terrain.cBase, 0, 0, MAP_W, MAP_H);
      mc.fillStyle = 'rgba(5,10,25,0.55)'; mc.fillRect(0, 0, MAP_W, MAP_H);
      for (const r of G.runs) for (const i of r.cells) {
        const g = Terrain.groom[i];
        mc.fillStyle = Terrain.powder[i] > 4 ? '#9fd8ff' : g > 0.85 ? '#2ecc71' : g > 0.5 ? '#f1c40f' : '#e74c3c';
        mc.fillRect(i % MAP_W, (i / MAP_W) | 0, 1, 1);
      }
    }
    ctx.fillStyle = 'rgba(5,10,25,0.85)'; ctx.fillRect(x0 - 4, y0 - 20, mw + 8, mh + 24);
    ctx.font = '600 11px system-ui'; ctx.fillStyle = '#cfe0ff';
    ctx.fillText('Grooming map', x0, y0 - 6);
    [['#2ecc71', 'groomed'], ['#f1c40f', 'fair'], ['#e74c3c', 'bumpy']].forEach(([c, t], k) => { ctx.fillStyle = c; ctx.fillRect(x0 + 88 + k * 46, y0 - 14, 8, 8); ctx.fillStyle = '#cfe0ff'; ctx.fillText(t, x0 + 99 + k * 46, y0 - 6); });
    ctx.imageSmoothingEnabled = false; ctx.drawImage(this.mini, x0, y0, mw, mh); ctx.imageSmoothingEnabled = true;
    if (Drive.active) {
      const px = x0 + Drive.x / (MAP_W * CELL) * mw, py = y0 + Drive.y / (MAP_H * CELL) * mh;
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(Drive.h) * 9, py + Math.sin(Drive.h) * 9); ctx.stroke();
    }
  },
  drawNight(ctx, now) {
    const n = this.night, nc = n.getContext('2d'), d = devicePixelRatio || 1;
    nc.setTransform(1, 0, 0, 1, 0, 0);
    nc.globalCompositeOperation = 'source-over';
    nc.clearRect(0, 0, n.width, n.height);
    nc.fillStyle = 'rgba(4,8,22,0.9)'; nc.fillRect(0, 0, n.width, n.height);
    nc.setTransform(d, 0, 0, d, 0, 0);
    nc.globalCompositeOperation = 'destination-out';
    const cut = (x, y, r, a = 1) => {
      const g = nc.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      nc.fillStyle = g; nc.beginPath(); nc.arc(x, y, r, 0, 7); nc.fill();
    };
    const z = this.cam.zoom;
    if (Drive.active) {
      const p = this.toScreen(Drive.x, Drive.y);
      const hx = Math.cos(Drive.h), hy = Math.sin(Drive.h);
      // headlight cone
      for (let k = 1; k <= 8; k++) cut(p.x + hx * k * 10 * z, p.y + hy * k * 10 * z, (9 + k * 5.5) * z, 0.95);
      cut(p.x - hx * 9 * z, p.y - hy * 9 * z, 12 * z, 0.8); // work lights on the tiller
      cut(p.x, p.y, 14 * z, 0.6);
    }
    for (const b of G.buildings) { const p = this.toScreen(b.x, b.y); cut(p.x, p.y, (BUILDINGS[b.kind].r + 10) * z, 0.55); }
    for (const l of G.lifts) for (const t of [l.bottom, l.top]) { const p = this.toScreen(t.x, t.y); cut(p.x, p.y, 10 * z, 0.5); }
    nc.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(n, 0, 0);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    // warm glows
    ctx.globalCompositeOperation = 'lighter';
    for (const b of G.buildings) { const p = this.toScreen(b.x, b.y); const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, (BUILDINGS[b.kind].r + 8) * z); g.addColorStop(0, 'rgba(255,170,60,0.25)'); g.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = g; ctx.fillRect(p.x - 200, p.y - 200, 400, 400); }
    if (Drive.active) {
      const p = this.toScreen(Drive.x, Drive.y);
      const g = ctx.createRadialGradient(p.x + Math.cos(Drive.h) * 35 * z, p.y + Math.sin(Drive.h) * 35 * z, 0, p.x + Math.cos(Drive.h) * 35 * z, p.y + Math.sin(Drive.h) * 35 * z, 40 * z);
      g.addColorStop(0, 'rgba(255,250,220,0.12)'); g.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
      // beacon
      if (Math.floor(now / 400) % 2) { ctx.fillStyle = 'rgba(255,190,40,0.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, 7); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';
    this.drawPoles(ctx);
    Drive.draw(ctx, this.cam);
    this.drawMinimap(ctx);
    // night snowfall
    if (Drive.snow && Drive.snow.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const f of Drive.snow) {
        f.y += 0.003 * f.z; f.x += 0.0008 * f.z; if (f.y > 1) { f.y = 0; f.x = Math.random(); } if (f.x > 1) f.x = 0;
        ctx.beginPath(); ctx.arc(f.x * this.W, f.y * this.H, f.z * 1.5, 0, 7); ctx.fill();
      }
    }
  },
};
