// ---------- Grooming: automatic night crews + player-driven snowcat ----------
const Grooming = {
  machineCapacity(g) {
    const M = GROOMERS[g.kind];
    // cells per night: width × working speed × hours × efficiency / cell area
    return M.width * M.speed * 0.6 * 3600 * 6.5 * 0.55 / (CELL * CELL) * (0.85 + G.morale / 650) * (g.condition || 1);
  },
  autoGroom(manualId) {
    const all = G.groomers.filter(g => g.id !== manualId);
    const crews = Math.min(all.length, G.staff.groomer);
    const used = all.slice().sort((a, b) => GROOMERS[b.kind].price - GROOMERS[a.kind].price).slice(0, crews);
    let winchCap = 0, normCap = 0, fuel = 0;
    const parkCats = used.filter(g => GROOMERS[g.kind].park).length;
    for (const g of used) {
      const c = this.machineCapacity(g);
      if (GROOMERS[g.kind].winch) winchCap += c; else normCap += c;
      fuel += GROOMERS[g.kind].fuel * 6.5 * 1.25 + 6.5 * 38;
      g.hours = (g.hours || 0) + 6.5;
    }
    const runs = G.runs.filter(r => r.groomPlan === 'nightly' || (r.groomPlan === 'alternate' && G.dayNum % 2 === 0));
    runs.forEach(r => Sim.runCondition(r));
    runs.sort((a, b) => {
      const pa = (a.passesToday || 10) * (1.05 - a.condition) * (a.diff === 'green' ? 1.6 : a.diff === 'blue' ? 1.3 : 1) * (a.park ? 1.4 : 1) * (Sim.runDepth(a) >= 30 ? 1 : 0.1);
      const pb = (b.passesToday || 10) * (1.05 - b.condition) * (b.diff === 'green' ? 1.6 : b.diff === 'blue' ? 1.3 : 1) * (b.park ? 1.4 : 1) * (Sim.runDepth(b) >= 30 ? 1 : 0.1);
      return pb - pa;
    });
    // tonight's snowfall arrives before grooming finishes
    const tonight = G.wx[1] ? G.wx[1].snowNight : 0;
    let groomed = 0, skippedSteep = 0, full = 0; const parkDone = new Set();
    for (const r of runs) {
      let all = true;
      for (let k = 0; k < r.cells.length; k++) {
        const i = r.cells[k];
        if (Terrain.groom[i] > 0.93 && Terrain.powder[i] < 2) continue;
        const steep = Terrain.slope[i] > 47;
        if (steep) { if (winchCap >= 1) winchCap--; else { skippedSteep++; all = false; continue; } }
        else if (normCap >= 1) normCap--; else if (winchCap >= 1) winchCap--; else { all = false; continue; }
        Terrain.groom[i] = 0.95 + Math.random() * 0.05; Terrain.gdir[i] = r.cellDir[k]; Terrain.powder[i] = 0;
        Terrain.markSurf(i); groomed++;
      }
      if (all) full++;
      if (r.park && parkCats && all) parkDone.add(r.id);
      r.passesToday = 0;
    }
    G.runs.forEach(r => r.passesToday = 0);
    if (used.length) World.spend(fuel, 'grooming');
    const ha = groomed * CELL * CELL / 10000;
    if (used.length && groomed === 0 && !skippedSteep) World.log(`🚜 Night crew: all runs already in good shape. Fuel & wear ${U.money(fuel)}.`, 'info');
    else if (used.length) World.log(`🚜 Night crew: ${used.length} cat${used.length > 1 ? 's' : ''} groomed ${ha.toFixed(1)} ha (${full}/${runs.length} runs fully done${skippedSteep ? `; ${(skippedSteep * CELL * CELL / 10000).toFixed(1)} ha too steep without a winch cat` : ''}). Fuel & wear ${U.money(fuel)}.${tonight > 5 ? ' Snowing hard — corduroy will be under fresh snow.' : ''}`, skippedSteep > 50 ? 'warn' : 'info');
    else if (G.runs.length && G.groomers.length && !G.staff.groomer) World.log('🚜 No groomer operators hired — nothing was groomed tonight!', 'warn');
    else if (G.runs.length && !G.groomers.length) World.log('🚜 You own no groomers. Runs are getting bumpy — buy a snowcat (Fleet).', 'warn');
    return { groomed, parkDone };
  },
};

// ---------- Player-driven groomer (night) ----------
const Drive = {
  active: false,
  start(groomer) {
    const M = GROOMERS[groomer.kind];
    const garage = World.built('garage')[0];
    const from = garage || World.basePos();
    let start = { x: from.x, y: from.y - 30 }, head = -Math.PI / 2, bd = 1e9;
    for (const r of G.runs) {
      const e = r.points[r.points.length - 1], pv = r.points[r.points.length - 2];
      const d = U.dist(e, from);
      if (d < bd) { bd = d; start = { x: e.x, y: e.y }; head = Math.atan2(pv.y - e.y, pv.x - e.x); }
    }
    this.g = groomer; this.M = M;
    this.x = start.x; this.y = start.y; this.h = head; this.v = 0;
    this.fuel = 1; this.tiller = true; this.blade = false; this.winch = false;
    this.cells = 0; this.msg = ''; this.msgT = 0; this.keys = {};
    this.trail = [];
    this.active = true;
    G.phase = 'drive'; G.time = 18 * 60;
    this.snow = [];
    Render.cam.zoom = 2.4; Render.cam.x = this.x; Render.cam.y = this.y; this.miniT = 0;
    UI.enterDrive();
  },
  key(e, down) {
    const k = e.key.toLowerCase();
    this.keys[k] = down;
    if (!down) return;
    if (k === ' ') { this.tiller = !this.tiller; this.say(this.tiller ? 'Tiller DOWN — laying corduroy' : 'Tiller UP'); e.preventDefault(); }
    if (k === 'b') { this.blade = !this.blade; this.say(this.blade ? 'Blade DOWN — cutting bumps' : 'Blade UP'); }
    if (k === 'e') { if (this.M.winch) { this.winch = !this.winch; this.say(this.winch ? 'Winch ANCHORED — cleared for steep pitches' : 'Winch released'); } else this.say('This machine has no winch.'); }
  },
  say(m) { this.msg = m; this.msgT = 2.5; },
  update(dt) {
    if (!this.active) return;
    const K = this.keys;
    const M = this.M;
    const fwd = K['w'] || K['arrowup'], back = K['s'] || K['arrowdown'];
    const left = K['a'] || K['arrowleft'], right = K['d'] || K['arrowright'];
    const max = M.speed * (this.blade ? 0.8 : 1) * (this.winch ? 0.75 : 1);
    if (fwd) this.v += 2.2 * dt; else if (back) this.v -= 2.8 * dt; else this.v *= Math.pow(0.25, dt);
    // terrain grade along heading
    const hx = Math.cos(this.h), hy = Math.sin(this.h);
    const h0 = Terrain.heightAt(this.x, this.y), h1 = Terrain.heightAt(this.x + hx * 6, this.y + hy * 6);
    const grade = (h1 - h0) / 6 * Math.sign(this.v || 1) * 100;  // + uphill in direction of travel
    const limit = this.winch ? 100 : M.maxSlope;
    let vmax = max * U.clamp(1 - Math.max(0, grade) / (limit * 1.15), 0.08, 1);
    if (grade > limit) { vmax = 0; if (Math.abs(this.v) > 0.3) this.say(M.winch ? `Tracks spinning at ${Math.round(grade)}% — anchor the winch (E)` : `Too steep (${Math.round(grade)}%) — you need a winch cat`); }
    this.v = U.clamp(this.v, -max * 0.5, vmax);
    if (grade < -limit && !this.winch) { this.say(`Sliding on ${Math.round(-grade)}% pitch! Slow down!`); this.v = Math.min(this.v + 1.5 * dt, max * 1.3); }
    const turn = (left ? -1 : 0) + (right ? 1 : 0);
    this.h += turn * dt * (0.9 + 0.3 * (1 - Math.abs(this.v) / max)) * (this.v < 0 ? -1 : 1);
    let nx = this.x + Math.cos(this.h) * this.v * dt * 3, ny = this.y + Math.sin(this.h) * this.v * dt * 3;
    // trees block
    const ci = Terrain.cellAt(nx, ny);
    if (ci < 0) { nx = this.x; ny = this.y; this.v = 0; }
    else if (Terrain.trees[ci] > 0.3) { this.say('Trees! Back up.'); nx = this.x; ny = this.y; this.v = -0.5; }
    else if (Terrain.rock[ci]) { this.say('Cliff band — can\'t drive here.'); nx = this.x; ny = this.y; this.v = -0.5; }
    // lift towers
    for (const l of G.lifts) {
      for (const t of l.towers) {
        const tx = U.lerp(l.bottom.x, l.top.x, t), ty = U.lerp(l.bottom.y, l.top.y, t);
        if (Math.hypot(nx - tx, ny - ty) < 4) { this.say('Watch the lift tower!'); nx = this.x; ny = this.y; this.v = -0.6; }
      }
    }
    this.x = nx; this.y = ny;
    this.fuel = Math.max(0, this.fuel - dt * (0.0009 + Math.abs(this.v) / max * 0.0016) * (M.fuel / 20));
    if (this.fuel <= 0) { this.say('Out of fuel!'); this.v = 0; }
    // groom under tiller
    if (this.tiller && Math.abs(this.v) > 0.4) {
      const bx = this.x - Math.cos(this.h) * 5, by = this.y - Math.sin(this.h) * 5;
      const px = -Math.sin(this.h), py = Math.cos(this.h);
      const q = Math.abs(this.v) * 3 > 14 ? 0.82 : 0.97;
      for (let s = -M.width / 2; s <= M.width / 2; s += 2.5) {
        const i = Terrain.cellAt(bx + px * s, by + py * s);
        if (i < 0) continue;
        const before = Terrain.groom[i];
        let nq = q;
        if (before < 0.3 && !this.blade) nq = Math.min(q, 0.78); // bumps remain without the blade
        if (Terrain.powder[i] > 25 && !this.blade) nq = Math.min(nq, 0.85);
        if (before < nq - 0.05 || Terrain.powder[i] > 1) {
          if (Terrain.runMask[i] && (before < 0.9 || Terrain.powder[i] > 1)) this.cells++;
          Terrain.groom[i] = Math.max(before, nq); Terrain.gdir[i] = this.h; Terrain.powder[i] = 0; Terrain.markSurf(i);
        }
      }
    }
    G.time += dt * 3; // 1 real second = 3 min
    this.msgT -= dt;
    Render.cam.x = U.lerp(Render.cam.x, this.x + Math.cos(this.h) * 25, 0.08);
    Render.cam.y = U.lerp(Render.cam.y, this.y + Math.sin(this.h) * 25, 0.08);
    // snow particles
    const tonight = G.wx[1] ? G.wx[1].snowNight : 0;
    if (tonight > 0) {
      while (this.snow.length < Math.min(400, tonight * 10)) this.snow.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() });
    }
    if (G.time >= 24 * 60 + 6 * 60) this.end('Shift over — 6:00 AM.');
    UI.updateDriveHud();
  },
  end(reason) {
    if (!this.active) return;
    this.active = false;
    const ha = this.cells * CELL * CELL / 10000;
    World.spend(GROOMERS[this.g.kind].fuel * (1 - this.fuel) * 8 * 1.25, 'grooming');
    World.log(`🚜 ${reason || 'You parked the cat.'} You groomed ${ha.toFixed(2)} ha of trail yourself in the ${this.M.name}.`, 'good');
    if (ha > 1.5) { G.reputation = U.clamp(G.reputation + Math.min(2, ha / 4), 0, 100); World.log('Guests will notice that hand-laid corduroy tomorrow. ⭐', 'good'); }
    UI.exitDrive();
    G.time = 18 * 60;
    Sim.runNight(this.g.id);
    Render.cam.zoom = 0.55;
  },
  draw(ctx, cam) {
    if (!this.active) return;
    const M = this.M;
    const s = cam.zoom;
    const sx = (this.x - cam.x) * s + ctx.canvas.width / 2 / devicePixelRatio, sy = (this.y - cam.y) * s + ctx.canvas.height / 2 / devicePixelRatio;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(this.h);
    ctx.scale(1.25, 1.25);
    const L = 9 * s, Wd = 4.2 * s;
    // tiller behind
    ctx.fillStyle = this.tiller ? '#8a8f99' : '#5b5f66';
    ctx.fillRect(-L * 0.5 - 3.2 * s, -M.width / 2 * s, 2.6 * s, M.width * s);
    ctx.fillStyle = '#d0d4dc'; ctx.fillRect(-L * 0.5 - 4.4 * s, -M.width / 2 * s, 1 * s, M.width * s);
    // tracks
    ctx.fillStyle = '#222'; ctx.fillRect(-L / 2, -Wd / 2 - 0.9 * s, L, 1.4 * s); ctx.fillRect(-L / 2, Wd / 2 - 0.5 * s, L, 1.4 * s);
    // body
    ctx.fillStyle = M.color; ctx.fillRect(-L / 2 + 0.5 * s, -Wd / 2 + 0.4 * s, L - 1 * s, Wd - 0.8 * s);
    ctx.fillStyle = '#1b2733'; ctx.fillRect(0.6 * s, -Wd / 2 + 0.9 * s, 2.4 * s, Wd - 1.8 * s); // cab glass
    ctx.fillStyle = '#ffd34d'; ctx.fillRect(-0.4 * s, -0.3 * s, 0.8 * s, 0.6 * s); // beacon
    // blade
    ctx.fillStyle = this.blade ? '#e5e8ee' : '#b8bcc6';
    ctx.beginPath(); ctx.moveTo(L / 2 + (this.blade ? 1.8 : 1.2) * s, -M.width / 2 * s - 0.4 * s); ctx.lineTo(L / 2 + 0.6 * s, -M.width / 2 * s); ctx.lineTo(L / 2 + 0.6 * s, M.width / 2 * s); ctx.lineTo(L / 2 + (this.blade ? 1.8 : 1.2) * s, M.width / 2 * s + 0.4 * s); ctx.closePath(); ctx.fill();
    if (M.winch) { ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(-L * 0.15, 0, 0.9 * s, 0, 7); ctx.fill(); }
    ctx.restore();
    // winch cable to an uphill anchor
    if (this.winch) {
      const ax = this.x - Terrain.aspectX[Terrain.cellAt(this.x, this.y)] * 120, ay = this.y - Terrain.aspectY[Terrain.cellAt(this.x, this.y)] * 120;
      ctx.strokeStyle = 'rgba(230,230,240,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo((ax - cam.x) * s + ctx.canvas.width / 2 / devicePixelRatio, (ay - cam.y) * s + ctx.canvas.height / 2 / devicePixelRatio); ctx.stroke();
    }
  },
};
