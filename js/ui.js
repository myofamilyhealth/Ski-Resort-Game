// ---------- User interface ----------
const $ = (s) => document.querySelector(s);
const UI = {
  tool: null, sel: null, modal: null, mouse: { x: 0, y: 0, wx: 0, wy: 0 }, keys: {},

  init() {
    this.canvas = $('#view');
    this.buildToolbar();
    this.bindInput();
    $('#btnOpen').onclick = () => { const r = Sim.openSeason(); if (!r.ok) this.toast(r.err, 'bad'); this.refreshTop(); };
    document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { G.speed = +b.dataset.speed; this.refreshTop(); });
    $('#btnSeason').onclick = () => { if (G.phase === 'drive') return; this.confirm('Skip ahead to the end of this season? Days fly by with the crew grooming every night, then you\'ll see the season summary. You can stop at any time.', () => Sim.skipSeason()); };
    $('#btnSkip').onclick = () => { if (G.phase === 'day') { G.time = DAY_END; Sim.endDay(); } };
    document.querySelectorAll('[data-modal]').forEach(b => b.onclick = () => this.openModal(b.dataset.modal));
    document.querySelectorAll('[data-ov]').forEach(b => b.onclick = () => { Render.overlay = Render.overlay === b.dataset.ov ? 'none' : b.dataset.ov; this.refreshOverlayBtns(); });
    $('#btnEndShift').onclick = () => Drive.end('You ended your shift early.');
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
    setInterval(() => { if (G) { this.refreshTop(); if (!this.tool && !document.activeElement.matches('input,select') && (this._pc = (this._pc || 0) + 1) % 3 === 0) this.renderPanel(); } }, 500);
  },

  // ---------- Toolbar ----------
  buildToolbar() {
    const tools = [
      ['select', '🖱️', 'Select / Inspect (Q)'],
      ['run', '⛷️', 'Design a Run (R)'],
      ['trees', '🌲', 'Cut Trees / Glades (T)'],
      ['lift', '🚡', 'Build a Lift (L)'],
      ['building', '🏠', 'Build Facilities (B)'],
      ['park', '🛹', 'Terrain Park Features (P)'],
      ['snowmaking', '💧', 'Install Snowmaking (M)'],
      ['demolish', '🧨', 'Demolish (X)'],
    ];
    const bar = $('#tools');
    for (const [k, ic, tip] of tools) {
      const short = { select: 'Select', run: 'Runs', trees: 'Trees', lift: 'Lifts', building: 'Build', park: 'Park', snowmaking: 'Snow', demolish: 'Delete' }[k];
      const b = U.el('button', { class: 'tool', title: tip, 'data-tool': k }, `<span>${ic}</span><small>${short}</small>`);
      b.onclick = () => this.setTool(k);
      bar.appendChild(b);
    }
  },
  setTool(kind, opts = {}) {
    if (kind === 'select') { this.tool = null; }
    else this.tool = Object.assign({ kind, points: [], sub: null, width: 30, brush: 25 }, opts);
    if (kind === 'lift' && !this.tool.sub) this.tool.sub = 'double';
    if (kind === 'building' && !this.tool.sub) this.tool.sub = 'lodge';
    if (kind === 'park' && !this.tool.sub) this.tool.sub = 'sjump';
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === (this.tool ? this.tool.kind : 'select')));
    this.renderPanel();
  },

  // ---------- Input ----------
  bindInput() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mousedown', e => {
      if (G.phase === 'drive') return;
      const w = Render.toWorld(e.offsetX, e.offsetY);
      if (e.button === 2 || e.button === 1 || (e.button === 0 && !this.tool && e.shiftKey)) { drag = { x: e.offsetX, y: e.offsetY, cx: Render.cam.x, cy: Render.cam.y, pan: true }; return; }
      if (e.button === 0) {
        if (this.tool && this.tool.kind === 'trees') { this.tool.painting = true; this.paintTrees(w); return; }
        if (!this.tool) { drag = { x: e.offsetX, y: e.offsetY, cx: Render.cam.x, cy: Render.cam.y, pan: true, click: true }; return; }
        this.click(w, e);
      }
    });
    window.addEventListener('mouseup', e => {
      if (drag && drag.click && Math.hypot(e.offsetX - drag.x, e.offsetY - drag.y) < 5 && e.target === c) this.select(Render.toWorld(e.offsetX, e.offsetY));
      drag = null; if (this.tool) this.tool.painting = false;
    });
    c.addEventListener('mousemove', e => {
      this.mouse.x = e.offsetX; this.mouse.y = e.offsetY;
      const w = Render.toWorld(e.offsetX, e.offsetY); this.mouse.wx = w.x; this.mouse.wy = w.y;
      if (drag && drag.pan) { Render.cam.x = drag.cx - (e.offsetX - drag.x) / Render.cam.zoom; Render.cam.y = drag.cy - (e.offsetY - drag.y) / Render.cam.zoom; Render.clampCam(); }
      if (this.tool && this.tool.painting) this.paintTrees(w);
      this.updateHover(w);
    });
    c.addEventListener('dblclick', e => { if (this.tool && this.tool.kind === 'run') this.finishRun(); });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (G.phase === 'drive') return;
      const before = Render.toWorld(e.offsetX, e.offsetY);
      Render.cam.zoom *= Math.pow(1.0015, -e.deltaY);
      Render.clampCam();
      const after = Render.toWorld(e.offsetX, e.offsetY);
      Render.cam.x += before.x - after.x; Render.cam.y += before.y - after.y; Render.clampCam();
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select')) return;
      if (G && G.phase === 'drive') { Drive.key(e, true); if (e.key === 'Escape') Drive.end('You ended your shift early.'); return; }
      this.keys[e.key.toLowerCase()] = true;
      const k = e.key.toLowerCase();
      if (k === 'escape') { if (this.modal && this.modal !== 'report' && this.modal !== 'start' && this.modal !== 'season') this.closeModal(); else if (this.tool && this.tool.points && this.tool.points.length) { this.tool.points = []; this.renderPanel(); } else { this.setTool('select'); this.sel = null; this.renderPanel(); } }
      if (k === 'enter' && this.tool && this.tool.kind === 'run') this.finishRun();
      if (k === 'backspace' && this.tool && this.tool.points && this.tool.points.length) { this.tool.points.pop(); this.renderPanel(); e.preventDefault(); }
      const map = { q: 'select', r: 'run', t: 'trees', l: 'lift', b: 'building', p: 'park', m: 'snowmaking', x: 'demolish' };
      if (map[k] && !this.modal) this.setTool(map[k]);
      if (k === ' ' && !this.modal) { G.speed = G.speed ? 0 : 1; e.preventDefault(); }
      if (['1', '2', '3', '4'].includes(k) && !this.modal) G.speed = [1, 2, 4, 10][+k - 1];
    });
    window.addEventListener('keyup', e => { if (G && G.phase === 'drive') Drive.key(e, false); this.keys[e.key.toLowerCase()] = false; });
  },
  panKeys(dt) {
    if (!G || G.phase === 'drive' || this.modal) return;
    const k = this.keys, s = 600 * dt / Render.cam.zoom;
    if (k['w'] || k['arrowup']) Render.cam.y -= s;
    if (k['s'] || k['arrowdown']) Render.cam.y += s;
    if (k['a'] || k['arrowleft']) Render.cam.x -= s;
    if (k['d'] || k['arrowright']) Render.cam.x += s;
    Render.clampCam();
  },

  updateHover(w) {
    const t = this.tool;
    const tip = $('#hoverTip');
    const el = Terrain.heightAt(w.x, w.y), sl = Terrain.slopeAt(w.x, w.y);
    const ci = Terrain.cellAt(w.x, w.y);
    let txt = `${Math.round(el)} m · ${Math.round(sl)}% grade`;
    if (ci >= 0 && Terrain.trees[ci] > 0) txt += ' · 🌲 forest';
    if (ci >= 0 && Terrain.rock[ci]) txt += ' · 🪨 cliffs';
    if (t && t.kind === 'run' && t.points.length) {
      const pts = [...t.points, w];
      const info = World.analyzeRun(pts, t.width);
      txt += ` · run ${Math.round(info.len)} m, max pitch ${Math.round(info.maxPitch)}% → ${DIFF[info.diff].icon} ${DIFF[info.diff].short}`;
    }
    if (t && t.kind === 'lift' && t.points.length === 1) {
      const v = World.validateLift(t.sub, t.points[0], w);
      txt += v.ok ? ` · ${Math.round(v.len)} m, ${Math.round(v.vert)} m vert, ${U.money(v.cost)}` : ' · ' + v.err;
    }
    tip.textContent = txt;
    tip.style.left = (this.mouse.x + 16) + 'px'; tip.style.top = (this.mouse.y + 16) + 'px';
    tip.style.display = G.phase === 'drive' ? 'none' : 'block';
  },

  click(w, e) {
    const t = this.tool;
    if (t.kind === 'run') {
      if (t.points.length) {
        const last = t.points[t.points.length - 1];
        if (U.dist(last, w) < 8) { this.finishRun(); return; }
      } else {
        // snap start to a lift top or run nearby
        for (const l of G.lifts) if (U.dist(l.top, w) < 60) { w = { x: l.top.x, y: l.top.y }; break; }
      }
      // snap to lift bottom when finishing near one
      for (const l of G.lifts) if (U.dist(l.bottom, w) < 30 && t.points.length) { w = { x: l.bottom.x, y: l.bottom.y - 6 }; }
      t.points.push({ x: w.x, y: w.y });
      this.renderPanel();
    } else if (t.kind === 'lift') {
      // snap bottom near base / run ends
      t.points.push({ x: w.x, y: w.y });
      if (t.points.length === 2) {
        const r = World.createLift(t.sub, t.points[0], t.points[1]);
        if (!r.ok) { this.toast(r.err, 'bad'); t.points.pop(); }
        else { this.toast(`Building ${LIFTS[t.sub].name}!`, 'good'); t.points = []; this.sel = r.lift; }
      }
      this.renderPanel();
    } else if (t.kind === 'building') {
      const r = World.createBuilding(t.sub, w);
      if (!r.ok) this.toast(r.err, 'bad'); else { this.toast(`${BUILDINGS[t.sub].name} under construction`, 'good'); }
      this.renderPanel();
    } else if (t.kind === 'park') {
      const run = this.pickRun(w, 10);
      if (!run) { this.toast('Click on a run to place a park feature.', 'bad'); return; }
      if (!run.park) { this.confirm(`Convert "${run.name}" into a Terrain Park? Freestyle riders will love it.`, () => { run.park = { features: [], quality: 0.8 }; World.log(`🛹 ${run.name} is now a terrain park!`, 'build'); this.renderPanel(); }); return; }
      const F = PARK_FEATURES[t.sub];
      if (G.cash < F.cost) { this.toast('Not enough cash.', 'bad'); return; }
      // snap along run
      let best = 0, bd = 1e9; run.samples.forEach((s, k) => { const d = U.dist(s, w); if (d < bd) { bd = d; best = k; } });
      const p = run.samples[best], q = run.samples[Math.min(best + 2, run.samples.length - 1)];
      run.park.features.push({ kind: t.sub, x: w.x, y: w.y, a: Math.atan2(q.y - p.y, q.x - p.x) });
      World.spend(F.cost, 'construction');
      World.log(`🛹 Built ${F.name} in ${run.name}.`, 'build');
      this.renderPanel();
    } else if (t.kind === 'snowmaking') {
      const run = this.pickRun(w, 10);
      if (!run) { this.toast('Click a run to install snow guns along it.', 'bad'); return; }
      if (run.snowmaking) { run.smOn = !run.smOn; this.toast(`Snowmaking on ${run.name}: ${run.smOn ? 'ON' : 'OFF'}`); this.renderPanel(); return; }
      const cost = Math.round(run.len * 185);
      this.confirm(`Install snowmaking (pipe, hydrants & fan guns) on ${run.name}? ${Math.round(run.len)} m × $185/m = ${U.money(cost)}. Needs a Pump House and Snowmakers.`, () => {
        if (G.cash < cost) return this.toast('Not enough cash.', 'bad');
        World.spend(cost, 'construction'); run.snowmaking = true; run.smOn = true;
        World.log(`💧 Snowmaking installed on ${run.name}.`, 'build'); this.renderPanel();
      });
    } else if (t.kind === 'demolish') {
      const ent = this.pickEntity(w);
      if (!ent) return;
      const name = ent.name || BUILDINGS[ent.kind]?.name;
      this.confirm(`Demolish ${name}? You'll recover 20% salvage value for lifts/buildings.`, () => {
        if (ent.type === 'run') World.removeRun(ent);
        else if (ent.type === 'lift') { World.earn(ent.cost * 0.2, 'salvage'); World.removeLift(ent); }
        else { const B = BUILDINGS[ent.kind]; World.earn(B.levels[0].cost * 0.2, 'salvage'); G.buildings = G.buildings.filter(b => b !== ent); World.rebuildNetwork(); }
        if (this.sel === ent) this.sel = null;
        Agents.reset();
        World.log(`🧨 Demolished ${name}.`, 'build');
        this.renderPanel();
      });
    }
  },
  paintTrees(w) {
    const cells = Terrain.cellsInCircle(w.x, w.y, this.tool.brush);
    const cost = Terrain.treeCost(cells);
    if (cost <= 0) return;
    if (G.cash < cost) { this.toast('Not enough cash to log trees.', 'bad'); this.tool.painting = false; return; }
    World.spend(cost, 'construction');
    Terrain.clearTrees(cells);
    this.tool.spent = (this.tool.spent || 0) + cost;
    $('#treeSpent') && ($('#treeSpent').textContent = U.money(this.tool.spent));
  },
  finishRun() {
    const t = this.tool; if (!t || t.points.length < 2) return;
    const name = ($('#runName') && $('#runName').value.trim()) || null;
    const r = World.createRun(t.points, t.width, name);
    if (!r.ok) { this.toast(r.err, 'bad'); return; }
    this.toast(`${DIFF[r.run.diff].icon} ${r.run.name} is cut!`, 'good');
    t.points = [];
    this.sel = r.run;
    this.renderPanel();
  },
  pickRun(w, extra = 0) {
    let best = null, bd = 1e9;
    for (const r of G.runs) for (let k = 0; k < r.points.length - 1; k++) {
      const d = U.segDist(w, r.points[k], r.points[k + 1]).d;
      if (d < r.width / 2 + extra && d < bd) { bd = d; best = r; }
    }
    return best;
  },
  pickEntity(w) {
    for (const b of G.buildings) if (U.dist(b, w) < BUILDINGS[b.kind].r + 3) return b;
    let bl = null, bd = Math.max(10, 10 / Render.cam.zoom);
    for (const l of G.lifts) { const d = U.segDist(w, l.bottom, l.top).d; if (d < bd) { bd = d; bl = l; } }
    if (bl) return bl;
    return this.pickRun(w, 6);
  },
  select(w) { this.sel = this.pickEntity(w); this.renderPanel(); },

  drawToolPreview(ctx) {
    const t = this.tool; const z = Render.cam.zoom;
    const m = { x: this.mouse.wx, y: this.mouse.wy };
    if (!t) return;
    if (t.kind === 'run') {
      const pts = [...t.points, m];
      if (t.points.length) {
        const v = World.validateRun(pts, t.width);
        const col = v.info ? DIFF[v.info.diff].color : '#999';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = v.ok ? 'rgba(255,255,255,0.45)' : 'rgba(255,80,80,0.35)'; ctx.lineWidth = t.width;
        ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
        ctx.strokeStyle = col === '#111111' ? '#000' : col; ctx.lineWidth = 3 / z; ctx.setLineDash([10 / z, 6 / z]);
        ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
        // pitch coloring of segments
        if (v.info) {
          const smp = v.info.samples;
          for (let i = 0; i < smp.length - 5; i += 5) {
            const p = smp[i], q = smp[i + 5]; const pitch = (p.h - q.h) / Math.max(1, q.s - p.s) * 100;
            ctx.strokeStyle = pitch < 0 ? '#ff00ff' : pitch < 25 ? '#2ecc40' : pitch < 40 ? '#1f6feb' : pitch < 60 ? '#000' : '#e02020';
            ctx.lineWidth = 5 / z; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
      for (const p of t.points) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1 / z; ctx.beginPath(); ctx.arc(p.x, p.y, 4 / z, 0, 7); ctx.fill(); ctx.stroke(); }
    } else if (t.kind === 'lift') {
      // show link radius around lift tops and base
      if (t.points.length === 1) {
        const v = World.validateLift(t.sub, t.points[0], m);
        ctx.strokeStyle = v.ok ? '#00e676' : '#ff5252'; ctx.lineWidth = 3 / z;
        ctx.beginPath(); ctx.moveTo(t.points[0].x, t.points[0].y); ctx.lineTo(m.x, m.y); ctx.stroke();
        ctx.fillStyle = v.ok ? '#00e676' : '#ff5252'; ctx.beginPath(); ctx.arc(m.x, m.y, 6 / z, 0, 7); ctx.fill();
        // max length ring
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.setLineDash([6 / z, 6 / z]); ctx.lineWidth = 1.5 / z;
        ctx.beginPath(); ctx.arc(t.points[0].x, t.points[0].y, LIFTS[t.sub].maxLen, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc((t.points[0] || m).x, (t.points[0] || m).y, 5 / z, 0, 7); ctx.fill();
      const base = World.basePos(); ctx.strokeStyle = 'rgba(255,235,59,0.5)'; ctx.lineWidth = 1.5 / z; ctx.setLineDash([4 / z, 4 / z]);
      ctx.beginPath(); ctx.arc(base.x, base.y, 320, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    } else if (t.kind === 'building') {
      const v = World.validateBuilding(t.sub, m); const B = BUILDINGS[t.sub];
      ctx.fillStyle = v.ok ? 'rgba(0,230,118,0.35)' : 'rgba(255,82,82,0.35)';
      ctx.beginPath(); ctx.arc(m.x, m.y, B.r, 0, 7); ctx.fill();
      ctx.font = `${Math.max(B.r, 14 / z)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(B.icon, m.x, m.y); ctx.textAlign = 'left';
    } else if (t.kind === 'trees') {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.arc(m.x, m.y, t.brush, 0, 7); ctx.stroke();
    } else if (t.kind === 'park') {
      ctx.fillStyle = 'rgba(255,110,199,0.6)'; ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, 7); ctx.fill();
    }
  },

  // ---------- Right panel ----------
  renderPanel() {
    const p = $('#panel'); const t = this.tool;
    let h = '';
    if (t) {
      if (t.kind === 'run') {
        const pts = t.points;
        h += `<h3>⛷️ Design a Run</h3>
        <ol class="howto"><li>Click at the <b>top of a lift</b>.</li><li>Keep clicking down the hill to add turns.</li><li>End near the <b>bottom of a lift</b> or the base, then <b>double-click</b>.</li></ol>
        <p class="hint">The map colours show steepness: <span class="g">green = easy</span>, <span class="b">blue = medium</span>, <b>black = hard</b>, <span style="color:#ff6b6b">red = experts</span>. Zig-zag across the hill to make a run easier. Backspace undoes a point.</p>
        <label>Trail width: <b>${t.width} m</b><input type="range" min="15" max="70" step="5" value="${t.width}" id="runW"></label>
        <label>Name <input id="runName" placeholder="(random)"></label>`;
        if (pts.length >= 2) {
          const v = World.validateRun(pts, t.width);
          if (v.info) {
            const D = DIFF[v.info.diff];
            h += `<div class="card"><div class="big">${D.icon} ${D.short}</div>
            <div class="kv"><span>Length</span><b>${Math.round(v.info.len)} m</b></div>
            <div class="kv"><span>Vertical</span><b>${Math.round(v.info.vert)} m</b></div>
            <div class="kv"><span>Avg / Max pitch</span><b>${Math.round(v.info.avgPitch)}% / ${Math.round(v.info.maxPitch)}%</b></div>
            ${v.cost ? `<div class="kv"><span>Tree clearing</span><b>${U.money(v.cost.trees)}</b></div><div class="kv"><span>Grading & signage</span><b>${U.money(v.cost.grading)}</b></div><div class="kv"><span>Total</span><b>${U.money(v.cost.total)}</b></div>` : ''}
            ${v.ok ? '' : `<p class="err">${v.err}</p>`}</div>`;
          }
          h += `<button class="btn primary" id="finishRun">✔ Cut this trail</button>`;
        }
        if (pts.length) h += ` <button class="btn" id="undoPt">↶ Undo point</button>`;
      } else if (t.kind === 'lift') {
        h += `<h3>🚡 Build a Lift</h3>
        <ol class="howto"><li>Pick a lift below.</li><li>Click once for the <b>bottom</b> (inside the yellow circle to connect to the base).</li><li>Click again up the hill for the <b>top</b>. Green line = OK.</li></ol><div class="list">`;
        const BASIC = { carpet: 'Beginner area', double: '⭐ Best first lift', quad: 'More guests', hsq: 'Fast & popular', gondola: 'Big upgrade' };
        for (const k in LIFTS) {
          if (!this.showAllLifts && !BASIC[k] && t.sub !== k) continue;
          const L = LIFTS[k];
          h += `<div class="item ${t.sub === k ? 'on' : ''}" data-lift="${k}"><div class="row"><b>${L.name}</b><span>~${U.money(L.base + L.perM * 1200)}</span></div>
          ${BASIC[k] ? `<span class="tag">${BASIC[k]}</span>` : ''}<small class="dim">${L.desc} Carries ${L.cap.toLocaleString()} people/hour. Builds in ${L.days} day${L.days > 1 ? 's' : ''}.</small></div>`;
        }
        h += `</div><button class="btn ghost" id="moreLifts">${this.showAllLifts ? 'Show fewer lifts' : 'Show all 13 lift types'}</button>`;
      } else if (t.kind === 'building') {
        const CATS = { village: ['🏘️ Village', ['lodge', 'parking', 'shuttle', 'rental', 'tune', 'school', 'daycare', 'retail', 'bar', 'plaza', 'rink', 'tubing', 'spa', 'hotel', 'condo', 'heli']],
          mountain: ['⛰️ On the mountain', ['restaurant', 'waffle', 'restroom', 'patrolhut']],
          ops: ['🔧 Operations', ['ticket', 'patrolhq', 'clinic', 'garage', 'pumphouse', 'kennel', 'housing']] };
        const cat = this.bldCat || 'village';
        h += `<h3>🏠 Build</h3><p class="hint">Pick a building, then click flat ground (not on a run or the pond). Village buildings go near the base.</p>
        <div class="tabs">${Object.entries(CATS).map(([k, v]) => `<button class="tabb ${k === cat ? 'on' : ''}" data-bcat="${k}">${v[0]}</button>`).join('')}</div><div class="list">`;
        for (const k of CATS[cat][1]) {
          const B = BUILDINGS[k]; const n = G.buildings.filter(b => b.kind === k).length;
          h += `<div class="item ${t.sub === k ? 'on' : ''}" data-bld="${k}"><div class="row"><b>${B.icon} ${B.name}</b><span>${U.money(B.levels[0].cost)}</span></div><small class="dim">${B.desc}${n ? ` · <b>Owned: ${n}</b>` : ''}</small></div>`;
        }
        h += `</div>`;
      } else if (t.kind === 'trees') {
        h += `<h3>🌲 Cut Trees</h3><p class="hint">Click & drag to log trees — widen trails, open glades, or clear building sites. ~$650 per dense cell.</p>
        <label>Brush radius: <b>${t.brush} m</b><input type="range" min="8" max="70" step="2" value="${t.brush}" id="brushR"></label>
        <p>Spent this session: <b id="treeSpent">${U.money(t.spent || 0)}</b></p>`;
      } else if (t.kind === 'park') {
        h += `<h3>🛹 Terrain Park</h3><p class="hint">Click a run to turn it into a park, then click along it to place features. Parks need <b>Park Crew</b> staff and ideally a <b>park cat</b> groomer.</p><div class="list">`;
        for (const k in PARK_FEATURES) { const F = PARK_FEATURES[k]; h += `<div class="item ${t.sub === k ? 'on' : ''}" data-feat="${k}"><div class="row"><b>${F.name}</b><span>${U.money(F.cost)}</span></div></div>`; }
        h += '</div>';
      } else if (t.kind === 'snowmaking') {
        h += `<h3>💧 Snowmaking</h3><p class="hint">Click a run to install snow guns ($185/m). Click again to toggle it on/off. Guns run on nights ≤ -3°C if you have a <b>Pump House</b> with enough capacity and <b>Snowmakers</b> on staff.</p>
        <p>Pump capacity: <b>${World.sumStat('pumphouse', 'km')} km</b> · Installed: <b>${(G.runs.filter(r => r.snowmaking).reduce((a, r) => a + r.len, 0) / 1000).toFixed(1)} km</b></p>`;
      } else if (t.kind === 'demolish') {
        h += `<h3>🧨 Demolish</h3><p class="hint">Click a run, lift or building to remove it. Lifts & buildings return 20% salvage.</p>`;
      }
      h += `<p class="hint" style="margin-top:12px">Esc to exit tool · Right-drag to pan · Wheel to zoom</p>`;
    } else if (this.sel) {
      h += this.selPanel(this.sel);
    } else {
      h += this.guidePanel();
    }
    p.innerHTML = h;
    // bindings
    const q = (s) => p.querySelector(s);
    if (q('#runW')) q('#runW').oninput = (e) => { t.width = +e.target.value; e.target.previousElementSibling.textContent = t.width + ' m'; };
    if (q('#runW')) q('#runW').onchange = () => this.renderPanel();
    if (q('#brushR')) q('#brushR').oninput = (e) => { t.brush = +e.target.value; e.target.previousElementSibling.textContent = t.brush + ' m'; };
    if (q('#finishRun')) q('#finishRun').onclick = () => this.finishRun();
    if (q('#moreLifts')) q('#moreLifts').onclick = () => { this.showAllLifts = !this.showAllLifts; this.renderPanel(); };
    p.querySelectorAll('[data-bcat]').forEach(e => e.onclick = () => { this.bldCat = e.dataset.bcat; this.renderPanel(); });
    if (q('#undoPt')) q('#undoPt').onclick = () => { t.points.pop(); this.renderPanel(); };
    p.querySelectorAll('[data-lift]').forEach(e => e.onclick = () => { t.sub = e.dataset.lift; t.points = []; this.renderPanel(); });
    p.querySelectorAll('[data-bld]').forEach(e => e.onclick = () => { t.sub = e.dataset.bld; this.renderPanel(); });
    p.querySelectorAll('[data-feat]').forEach(e => e.onclick = () => { t.sub = e.dataset.feat; this.renderPanel(); });
    p.querySelectorAll('[data-act]').forEach(e => e.onclick = () => this.selAction(e.dataset.act, e));
    p.querySelectorAll('[data-go]').forEach(e => e.onclick = () => { const [kind, sub] = e.dataset.go.split(':'); this.setTool(kind, sub ? { sub } : {}); });
    p.querySelectorAll('[data-modal]').forEach(e => e.onclick = () => this.openModal(e.dataset.modal));
    if (q('#selName')) q('#selName').onchange = (e) => { this.sel.name = e.target.value || this.sel.name; };
    if (q('#groomPlan')) q('#groomPlan').onchange = (e) => { this.sel.groomPlan = e.target.value; };
  },
  guidePanel() {
    const has = (k) => World.built(k).length > 0 || G.buildings.some(b => b.kind === k);
    const steps = [
      [G.lifts.some(l => l.fromBase), 'Build a <b>lift</b> from the base', 'lift:double'],
      [G.runs.some(r => r.reachable), 'Draw a <b>run</b> from the lift top back down', 'run'],
      [G.runs.some(r => r.diff === 'green' && r.reachable), 'Add an easy <b>● green</b> run', 'run'],
      [G.lifts.some(l => l.buildDays <= 0), 'Speed up time until the lift is built', null],
      [G.seasonOpen, '<b>Open for the season!</b>', null],
      [G.runs.length >= 4, 'Grow: 4+ runs for more guests', 'run'],
      [G.lifts.length >= 2, 'Grow: a second lift', 'lift:quad'],
    ];
    let h = `<h3>🏔️ What to do next</h3><div class="steps">`;
    for (const [ok, txt, go, modal] of steps) h += `<div class="step ${ok ? 'done' : ''}" ${go ? `data-go="${go}"` : modal ? `data-modal="${modal}"` : ''}>${ok ? '✅' : '⬜'} ${txt}</div>`;
    h += '</div>';
    const w = Weather.today();
    h += `<h3>📋 Today</h3><div class="card">
      <div class="kv"><span>Base depth</span><b>${Math.round(G.baseDepth)} cm</b></div>
      <div class="kv"><span>Season snowfall</span><b>${Math.round(G.seasonSnow)} cm</b></div>
      <div class="spark" data-modal="weather" title="Open the snow report">${this.snowChart(300, 110)}</div>
      <div class="kv"><span>Avalanche danger</span><b class="avy${G.avy.danger}">${['', 'Low', 'Moderate', 'Considerable', 'High', 'Extreme'][G.avy.danger]} (${G.avy.danger})</b></div>
      <div class="kv"><span>Weather</span><b>${Weather.icon(w)} ${Weather.label(w)} ${w.tHi}°/${w.tLo}°C</b></div>
      <div class="kv"><span>Wind / gusts</span><b>${w.wind} / ${w.gust} m/s</b></div>
      <p class="hint">${Weather.stormOutlook()}</p></div>`;
    if (G.reviews.length) { h += `<h3>💬 Recent Reviews</h3>`; for (const r of G.reviews.slice(0, 4)) h += `<div class="review"><span class="stars">${r.s}</span> ${r.t}</div>`; }
    return h;
  },
  selPanel(e) {
    let h = '';
    if (e.type === 'run') {
      const D = DIFF[e.diff];
      const cond = Sim.runCondition(e);
      h += `<h3><span class="dicon ${e.diff}">${e.park ? '🛹' : D.icon}</span> <input id="selName" value="${e.name}"></h3>
      <div class="card">
      <div class="kv"><span>Rating</span><b>${D.name}${e.park ? ' · Terrain Park' : ''}</b></div>
      <div class="kv"><span>Status</span><b class="${Sim.runIsOpen(e) ? 'ok' : 'bad'}">${Sim.runIsOpen(e) ? 'OPEN' : e.avyClosed ? 'Avalanche closure' : !e.reachable ? 'Not lift-served' : Sim.runDepth(e) < 30 ? 'Not enough snow' : 'Closed'}</b></div>
      <div class="kv"><span>Length / vertical</span><b>${Math.round(e.len)} m / ${Math.round(e.vert)} m</b></div>
      <div class="kv"><span>Avg / max pitch</span><b>${Math.round(e.avgPitch)}% / ${Math.round(e.maxPitch)}%</b></div>
      <div class="kv"><span>Snow depth</span><b>${Sim.runDepth(e)} cm${e.smDepth > 0 ? ` (${Math.round(e.smDepth)} man-made)` : ''}</b></div>
      <div class="kv"><span>Surface</span><b>${Sim.surfaceLabel(e)}</b></div>
      <div class="bar"><i style="width:${cond * 100}%;background:${cond > 0.7 ? '#2ecc40' : cond > 0.4 ? '#f1c40f' : '#e74c3c'}"></i></div>
      <div class="kv"><span>Snowmaking</span><b>${e.snowmaking ? (e.smOn ? '💧 ON' : 'off') : 'none'}</b></div>
      ${e.deadEnd ? '<p class="err">⚠ This run dead-ends! Its bottom must reach a lift, the base, or merge into another run.</p>' : ''}
      ${!e.reachable ? '<p class="err">⚠ No lift serves the top of this run.</p>' : ''}
      </div>
      <label>Grooming plan <select id="groomPlan">
        <option value="nightly" ${e.groomPlan === 'nightly' ? 'selected' : ''}>Groom every night (corduroy)</option>
        <option value="alternate" ${e.groomPlan === 'alternate' ? 'selected' : ''}>Every other night</option>
        <option value="never" ${e.groomPlan === 'never' ? 'selected' : ''}>Never — let moguls & powder build</option></select></label>
      <div class="btns"><button class="btn" data-act="toggleOpen">${e.open ? '🚫 Close run' : '✅ Open run'}</button>
      ${e.snowmaking ? `<button class="btn" data-act="toggleSM">💧 Snowmaking ${e.smOn ? 'OFF' : 'ON'}</button>` : `<button class="btn" data-go="snowmaking">💧 Add snowmaking</button>`}
      ${e.park ? `<button class="btn" data-go="park">🛹 Add features</button>` : `<button class="btn" data-act="makePark">🛹 Make terrain park</button>`}</div>`;
      if (e.park) h += `<div class="card"><div class="kv"><span>Park quality</span><b>${Math.round(e.park.quality * 100)}%</b></div><div class="kv"><span>Features</span><b>${e.park.features.length}</b></div><small class="dim">${e.park.features.map(f => PARK_FEATURES[f.kind].name).join(', ') || 'none yet'}</small></div>`;
    } else if (e.type === 'lift') {
      const L = LIFTS[e.kind];
      h += `<h3>🚡 <input id="selName" value="${e.name}"></h3><div class="card">
      <div class="kv"><span>Type</span><b>${L.name}</b></div>
      <div class="kv"><span>Status</span><b class="${Sim.liftIsOpen(e) ? 'ok' : 'bad'}">${e.buildDays > 0 ? '🏗 Under construction (' + e.buildDays + ' days)' : e.broken ? '🛑 Broken down' : e.holdFrac >= 1 ? '💨 Wind hold' : e.open ? 'Operating' : 'Closed'}</b></div>
      <div class="kv"><span>Length / vertical</span><b>${Math.round(e.len)} m / ${Math.round(e.vert)} m</b></div>
      <div class="kv"><span>Ride time</span><b>${(e.len / L.speed / 60).toFixed(1)} min</b></div>
      <div class="kv"><span>Capacity</span><b>${L.cap.toLocaleString()} skiers/hr</b></div>
      <div class="kv"><span>Lift line now</span><b>${Math.round(e.wait || 0)} min (${Math.round((e.util || 0) * 100)}% utilization)</b></div>
      <div class="kv"><span>Rides today</span><b>${Math.round(e.ridesToday || 0).toLocaleString()}</b></div>
      <div class="kv"><span>Wind limit</span><b>${L.wind} m/s</b></div>
      <div class="kv"><span>Crew</span><b>${L.ops} lift ops</b></div>
      <div class="kv"><span>Daily maint. + power</span><b>~${U.money(L.maint + L.kw * 7 * 0.15)}</b></div>
      <div class="kv"><span>Runs from top</span><b>${(e.topRuns || []).length}</b></div>
      ${!e.fromBase && !e.reachable ? '<p class="err">⚠ Guests can\'t reach this lift. Connect a run that ends at its bottom, or move it near the base.</p>' : ''}
      ${e.minDiff === 9 && e.buildDays <= 0 ? '<p class="err">⚠ No runs start at the top of this lift. Draw one!</p>' : ''}
      </div><div class="btns"><button class="btn" data-act="toggleOpen">${e.open ? '🚫 Close lift' : '✅ Open lift'}</button><button class="btn" data-go="run">⛷️ Draw run from top</button></div>`;
    } else if (e.type === 'building') {
      const B = BUILDINGS[e.kind]; const lv = B.levels[e.level - 1]; const next = B.levels[e.level];
      h += `<h3>${B.icon} ${B.name}</h3><p class="hint">${B.desc}</p><div class="card">
      <div class="kv"><span>Level</span><b>${e.level} / ${B.levels.length}</b></div>
      ${e.buildDays > 0 ? `<div class="kv"><span>Construction</span><b>🏗 ${e.buildDays} days left</b></div>` : ''}
      <div class="kv"><span>Upkeep</span><b>${U.money(lv.upkeep)}/day</b></div>
      ${Object.entries(lv).filter(([k]) => !['cost', 'days', 'upkeep'].includes(k)).map(([k, v]) => `<div class="kv"><span>${{ cap: 'Ticket capacity/day', seats: 'Seats', cars: 'Parking spaces', rentals: 'Rentals/day', students: 'Students/day', staff: 'Staff needed', resp: 'Response factor', bays: 'Vehicle bays', km: 'Snowmaking km', rooms: 'Rooms', dogs: 'Dog capacity', kids: 'Kids/day', riders: 'Bus riders/day', morale: 'Staff morale bonus' }[k] || k}</span><b>${typeof v === 'number' ? v.toLocaleString() : v}</b></div>`).join('')}
      </div>${next ? `<button class="btn primary" data-act="upgrade">⬆ Upgrade to L${e.level + 1} — ${U.money(next.cost)}</button>` : '<p class="hint">Fully upgraded.</p>'}`;
      if (e.kind === 'garage') h += `<button class="btn" data-modal="fleet">🚜 Open Fleet</button>`;
      if (e.kind === 'patrolhq' || e.kind === 'kennel') h += `<button class="btn" data-modal="patrol">⛑️ Patrol & Dogs</button>`;
    }
    h += `<p><button class="btn ghost" data-act="deselect">← Back to checklist</button></p>`;
    return h;
  },
  selAction(act) {
    const e = this.sel;
    if (act === 'deselect') { this.sel = null; }
    if (act === 'toggleOpen') { e.open = !e.open; World.log(`${e.name} ${e.open ? 'opened' : 'closed'} by management.`); }
    if (act === 'toggleSM') e.smOn = !e.smOn;
    if (act === 'makePark') { e.park = { features: [], quality: 0.8 }; this.setTool('park'); World.log(`🛹 ${e.name} is now a terrain park!`, 'build'); return; }
    if (act === 'upgrade') { const r = World.upgradeBuilding(e); if (!r.ok) this.toast(r.err, 'bad'); }
    this.renderPanel();
  },

  // ---------- Top bar ----------
  refreshTop() {
    const T = G.today || {};
    $('#cash').textContent = U.money(G.cash);
    $('#cash').className = G.cash < 0 ? 'neg' : '';
    $('#date').textContent = World.dateStr();
    $('#clock').textContent = G.phase === 'drive' ? '🌙 ' + Sim.clockStr() : Sim.clockStr();
    const w = Weather.today();
    $('#wx').textContent = `${Weather.icon(w)} ${w.tHi}°C ${w.snowNight ? '❄' + w.snowNight + 'cm' : ''}`;
    $('#wx').title = `${Weather.label(w)} · wind ${w.wind} m/s (gusts ${w.gust}) · base ${Math.round(G.baseDepth)} cm`;
    $('#guests').textContent = Sim.operating() ? `${Math.round(Sim.onHill()).toLocaleString()} / ${(T.visitors || 0).toLocaleString()}` : (G.seasonOpen ? 'Closed' : 'Pre-season');
    $('#rep').textContent = `${Math.round(G.reputation)}`;
    const last = G.history.filter(h => h.visitors > 0).pop();
    $('#happy').textContent = last ? `${last.sat >= 70 ? '😀' : last.sat >= 50 ? '🙂' : '😟'} ${last.sat}%` : '–';
    $('#depth').textContent = `${Math.round(G.baseDepth)}cm`;
    $('#btnOpen').style.display = G.seasonOpen ? 'none' : '';
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === G.speed));
  },
  refreshOverlayBtns() { document.querySelectorAll('[data-ov]').forEach(b => b.classList.toggle('on', Render.overlay === b.dataset.ov)); },

  onLog(msg, type) {
    const el = $('#log');
    if (!el) return;
    const d = U.el('div', { class: 'ln ' + type }, `<span>${Sim.clockStr()}</span> ${msg}`);
    el.prepend(d);
    while (el.children.length > 60) el.lastChild.remove();
    if ((type === 'bad' || type === 'good') && !G._skipping) this.toast(msg, type);
  },
  toast(msg, type = '') {
    const box = $('#toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const t = U.el('div', { class: 'toast ' + type }, msg);
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3800);
    setTimeout(() => t.remove(), 4400);
  },
  confirm(msg, yes) {
    this.openModal('confirm', { msg, yes });
  },

  // ---------- Modals ----------
  openModal(name, data) { this.modal = name; this.modalData = data; this.prevSpeed = this.prevSpeed ?? G.speed; if (name !== 'confirm') G.speed = 0; this.renderModal(); },
  closeModal() { this.modal = null; $('#modal').classList.remove('show'); if (this.prevSpeed !== undefined && this.prevSpeed !== null) { G.speed = this.prevSpeed; this.prevSpeed = null; } },
  renderModal() {
    const m = $('#modal'); const box = $('#modalBox');
    m.classList.add('show');
    const f = this['m_' + this.modal];
    const keep = this._lastModal === this.modal ? box.scrollTop : 0; this._lastModal = this.modal;
    box.innerHTML = f ? f.call(this, this.modalData) : '';
    box.scrollTop = keep;
    box.querySelectorAll('[data-close]').forEach(e => e.onclick = () => this.closeModal());
    box.querySelectorAll('[data-modal]').forEach(e => e.onclick = () => this.openModal(e.dataset.modal));
    if (this['b_' + this.modal]) this['b_' + this.modal](box, this.modalData);
  },
  m_confirm(d) { return `<h2>Confirm</h2><p>${d.msg}</p><div class="btns"><button class="btn primary" id="yes">Yes</button><button class="btn" data-close>Cancel</button></div>`; },
  b_confirm(box, d) { box.querySelector('#yes').onclick = () => { this.closeModal(); d.yes(); }; },
  head(title) { return `<div class="mhead"><h2>${title}</h2><button class="x" data-close>✕</button></div>`; },

  // Finance
  m_finance() {
    const hist = G.history.slice(-30);
    const T = G.today || { rev: {}, exp: {} };
    let h = this.head('📊 Finances');
    h += `<div class="grid2"><div class="card"><h4>Balance</h4><div class="big">${U.moneyFull(G.cash)}</div>
      <div class="kv"><span>Loan</span><b>${U.moneyFull(G.loan)}</b></div><div class="kv"><span>Interest</span><b>6.5% APR</b></div>
      <div class="btns"><button class="btn" id="loan1">Borrow $2M</button><button class="btn" id="repay1" ${G.loan <= 0 ? 'disabled' : ''}>Repay $2M</button></div>
      <h4>Season to date</h4><div class="kv"><span>Revenue</span><b class="ok">${U.money(G.season.revenue)}</b></div><div class="kv"><span>Expenses</span><b class="bad">${U.money(G.season.expense)}</b></div><div class="kv"><span>Profit</span><b>${U.money(G.season.revenue - G.season.expense)}</b></div><div class="kv"><span>Skier visits</span><b>${G.season.visitors.toLocaleString()}</b></div><div class="kv"><span>Season pass holders</span><b>${G.passHolders.toLocaleString()}</b></div></div>
      <div class="card"><h4>Today</h4>${this.breakdown(T)}</div></div>`;
    h += `<h4>Last 30 days</h4>${this.chart(hist)}`;
    return h;
  },
  breakdown(T) {
    let h = '<table class="tbl">';
    let tr = 0, te = 0;
    const LBL = { tickets: '🎟️ Lift tickets', passes: '🎫 Season passes', rentals: '🎿 Rentals', lessons: '🧑‍🏫 Lessons', food: '🍔 Food & beverage', retail: '🛍️ Retail', bar: '🍻 Après bar', lodging: '🏨 Lodging', sightseeing: '🚠 Sightseeing', parking: '🅿️ Parking', salvage: '♻️ Salvage', village: '🏘️ Village (spa, rink, tubing, daycare…)', construction: '🏗️ Construction', wages: '👷 Wages', lifts: '🚡 Lift power & maintenance', upkeep: '🏠 Building & fleet upkeep', insurance: '📄 Insurance', interest: '🏦 Loan interest', grooming: '🚜 Grooming fuel & wear', snowmaking: '💧 Snowmaking', marketing: '📣 Marketing', patrol: '⛑️ Patrol & avalanche control', vehicles: '🚜 Vehicle purchases' };
    for (const [k, v] of Object.entries(T.rev || {}).sort((a, b) => b[1] - a[1])) { if (v < 1) continue; h += `<tr><td>${LBL[k] || k}</td><td class="ok">+${U.money(v)}</td></tr>`; tr += v; }
    for (const [k, v] of Object.entries(T.exp || {}).sort((a, b) => b[1] - a[1])) { if (v < 1) continue; h += `<tr><td>${LBL[k] || k}</td><td class="bad">-${U.money(v)}</td></tr>`; te += v; }
    h += `<tr class="tot"><td>Net</td><td class="${tr - te >= 0 ? 'ok' : 'bad'}">${U.money(tr - te)}</td></tr></table>`;
    return h;
  },
  chart(hist) {
    if (!hist.length) return '<p class="hint">No history yet.</p>';
    const W = 640, H = 140, n = hist.length;
    const max = Math.max(1, ...hist.map(d => Math.max(d.rev, d.exp)));
    const maxV = Math.max(1, ...hist.map(d => d.visitors));
    let s = `<svg viewBox="0 0 ${W} ${H + 20}" class="chart">`;
    const bw = W / n;
    hist.forEach((d, i) => {
      const rh = d.rev / max * H, eh = d.exp / max * H;
      s += `<rect x="${i * bw + 2}" y="${H - rh}" width="${bw / 2 - 2}" height="${rh}" fill="#2ecc71"><title>${d.date}: revenue ${U.money(d.rev)}</title></rect>`;
      s += `<rect x="${i * bw + bw / 2}" y="${H - eh}" width="${bw / 2 - 2}" height="${eh}" fill="#e74c3c"><title>${d.date}: expenses ${U.money(d.exp)}</title></rect>`;
    });
    s += `<polyline fill="none" stroke="#3498db" stroke-width="2" points="${hist.map((d, i) => `${i * bw + bw / 2},${H - d.visitors / maxV * H}`).join(' ')}"/>`;
    s += `<text x="4" y="${H + 15}" fill="#9ab">■ revenue  ■ expenses  — visitors (max ${maxV.toLocaleString()})</text></svg>`;
    return s;
  },
  b_finance(box) {
    box.querySelector('#loan1').onclick = () => { if (G.loan >= 20000000) return this.toast('Bank says no — loan limit $20M.', 'bad'); G.loan += 2000000; G.cash += 2000000; this.renderModal(); };
    box.querySelector('#repay1').onclick = () => { const a = Math.min(2000000, G.loan); if (G.cash < a) return this.toast('Not enough cash.', 'bad'); G.loan -= a; G.cash -= a; this.renderModal(); };
  },

  // Staff
  m_staff() {
    const need = World.staffNeeds();
    let h = this.head('👷 Staff') + `<div class="card"><label><input type="checkbox" id="autoStaff" ${G.autoStaff ? 'checked' : ''}> <b>Hire staff automatically</b> (recommended)</label><small class="dim">The game keeps every job filled to exactly what your resort needs. Turn this off only if you want to manage each crew yourself.</small></div>`;
    if (G.autoStaff) h += `<p class="hint">Your crews are handled for you. Payroll is currently <b>${U.money(Object.keys(STAFF).reduce((a, k) => a + G.staff[k] * STAFF[k].wage * G.payRate, 0))}/day</b>.</p>`;
    h += `<details ${G.autoStaff ? '' : 'open'}><summary>Show crew details</summary><table class="tbl staff"><tr><th>Role</th><th>Wage</th><th>Needed</th><th>Hired</th><th></th></tr>`;
    let total = 0;
    for (const k in STAFF) {
      const S = STAFF[k]; const n = G.staff[k]; total += n * S.wage * G.payRate;
      const cls = n < need[k] ? 'bad' : 'ok';
      h += `<tr><td><b>${S.name}</b><br><small class="dim">${S.desc}</small></td><td>$${Math.round(S.wage * G.payRate)}</td><td>${need[k]}</td><td class="${cls}"><b>${n}</b></td>
      <td><button class="sbtn" data-h="${k}" data-d="-5">−5</button><button class="sbtn" data-h="${k}" data-d="-1">−</button><button class="sbtn" data-h="${k}" data-d="1">+</button><button class="sbtn" data-h="${k}" data-d="5">+5</button></td></tr>`;
    }
    h += `</table><div class="grid2"><div class="card"><div class="kv"><span>Payroll / day</span><b>${U.money(total)}</b></div><div class="kv"><span>Morale</span><b>${Math.round(G.morale)}%</b></div>
      <label>Pay rate: <b>${Math.round(G.payRate * 100)}%</b> of market <input type="range" id="pay" min="85" max="140" step="5" value="${Math.round(G.payRate * 100)}"></label><small class="dim">Higher pay → better morale → faster patrol, fewer breakdowns, better grooming.</small></div>
      <div class="card"><button class="btn primary" id="autohire">✨ Hire to recommended now</button></div></div></details>`;
    return h;
  },
  b_staff(box) {
    box.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { G.staff[b.dataset.h] = Math.max(0, G.staff[b.dataset.h] + +b.dataset.d); this.renderModal(); });
    box.querySelector('#autohire').onclick = () => { const n = World.staffNeeds(); for (const k in n) G.staff[k] = n[k]; World.log('👷 Staffing adjusted to recommended levels.'); this.renderModal(); };
    box.querySelector('#autoStaff').onchange = (e) => { G.autoStaff = e.target.checked; World.autoStaff(); this.renderModal(); };
    box.querySelector('#pay').onchange = (e) => { G.payRate = +e.target.value / 100; this.renderModal(); };
  },

  // Fleet
  m_fleet() {
    const bays = World.vehicleBays(); const used = G.groomers.length + G.sleds.length;
    let h = this.head('🚜 Fleet: Groomers & Snowmobiles') + `<p class="hint">Vehicles need a <b>Vehicle Maintenance Shop</b>. Bays used: <b>${used} / ${bays}</b>. Each groomer needs a <b>Groomer Operator</b> to run at night — or drive one yourself!</p>`;
    h += `<div class="card"><label><input type="checkbox" id="autoGroomF" ${G.autoGroom ? 'checked' : ''}> <b>Auto night grooming:</b> the crew grooms every night automatically and the end-of-day screen is skipped.</label><small class="dim">Turn this off when you want to drive a snowcat yourself.</small></div>`;
    h += `<h4>Your snowcats</h4>`;
    if (!G.groomers.length) h += '<p class="dim">No groomers yet.</p>';
    for (const g of G.groomers) {
      const M = GROOMERS[g.kind];
      h += `<div class="item"><div class="row"><b><span class="swatch" style="background:${M.color}"></span>${g.name} — ${M.name}</b><span>${Math.round(g.hours || 0)} engine hrs</span></div><small>${M.width} m tiller · ${M.winch ? '🪝 winch' : 'no winch'} · ${M.park ? '🛹 park tools' : ''} · ~${(Grooming.machineCapacity(g) * CELL * CELL / 10000).toFixed(1)} ha/night</small> <button class="sbtn" data-sell="${g.id}">Sell (40%)</button></div>`;
    }
    h += `<h4>Buy a groomer</h4><div class="list">`;
    for (const k in GROOMERS) { const M = GROOMERS[k]; h += `<div class="item"><div class="row"><b><span class="swatch" style="background:${M.color}"></span>${M.name}</b><button class="btn small" data-buyg="${k}">Buy ${U.money(M.price)}</button></div><small>${M.width} m tiller · ${Math.round(M.speed * 3.6 * 0.6)} km/h grooming · max ${M.winch ? '100' : M.maxSlope}% pitch · ${M.fuel} L/h${M.winch ? ' · 🪝 WINCH' : ''}${M.park ? ' · 🛹 PARK' : ''}</small><small class="dim">${M.desc}</small></div>`; }
    h += `</div><h4>Snowmobiles & UTVs</h4>`;
    for (const s of G.sleds) h += `<div class="item"><div class="row"><b>🛷 ${SNOWMOBILES[s.kind].name}</b><button class="sbtn" data-sells="${s.id}">Sell</button></div></div>`;
    h += '<div class="list">';
    for (const k in SNOWMOBILES) { const S = SNOWMOBILES[k]; h += `<div class="item"><div class="row"><b>${S.name}</b><button class="btn small" data-buys="${k}">Buy ${U.money(S.price)}</button></div><small class="dim">${S.desc} Speeds up patrol response.</small></div>`; }
    return h + '</div>';
  },
  b_fleet(box) {
    box.querySelector('#autoGroomF').onchange = (e) => { G.autoGroom = e.target.checked; World.log(`🚜 Auto night grooming ${G.autoGroom ? 'ON: the crew grooms every night' : 'OFF: you choose each evening'}.`); };
    const bayCheck = () => { if (G.groomers.length + G.sleds.length >= World.vehicleBays()) { this.toast('No free vehicle bays — build or upgrade a Maintenance Shop.', 'bad'); return false; } return true; };
    box.querySelectorAll('[data-buyg]').forEach(b => b.onclick = () => {
      const M = GROOMERS[b.dataset.buyg]; if (!bayCheck()) return; if (G.cash < M.price) return this.toast('Not enough cash.', 'bad');
      World.spend(M.price, 'vehicles'); G.groomers.push({ id: U.uid(), kind: b.dataset.buyg, name: 'Cat ' + (G.groomers.length + 1), hours: 0, condition: 1 });
      World.log(`🚜 Bought a ${M.name}.`, 'build'); this.renderModal();
    });
    box.querySelectorAll('[data-buys]').forEach(b => b.onclick = () => {
      const S = SNOWMOBILES[b.dataset.buys]; if (!bayCheck()) return; if (G.cash < S.price) return this.toast('Not enough cash.', 'bad');
      World.spend(S.price, 'vehicles'); G.sleds.push({ id: U.uid(), kind: b.dataset.buys }); World.log(`🛷 Bought a ${S.name}.`, 'build'); this.renderModal();
    });
    box.querySelectorAll('[data-sell]').forEach(b => b.onclick = () => { const g = G.groomers.find(x => x.id == b.dataset.sell); World.earn(GROOMERS[g.kind].price * 0.4, 'salvage'); G.groomers = G.groomers.filter(x => x !== g); this.renderModal(); });
    box.querySelectorAll('[data-sells]').forEach(b => b.onclick = () => { const s = G.sleds.find(x => x.id == b.dataset.sells); World.earn(SNOWMOBILES[s.kind].price * 0.4, 'salvage'); G.sleds = G.sleds.filter(x => x !== s); this.renderModal(); });
  },

  // Patrol
  m_patrol() {
    const pi = Sim.patrolInfo(); const kennel = World.sumStat('kennel', 'dogs');
    let h = this.head('⛑️ Ski Patrol & Avalanche Dogs');
    h += `<div class="grid2"><div class="card"><h4>Patrol</h4>
      <div class="kv"><span>Patrollers</span><b>${G.staff.patrol} (need ${World.staffNeeds().patrol})</b></div>
      <div class="kv"><span>Coverage</span><b>${Math.round(pi.coverage * 100)}%</b></div>
      <div class="kv"><span>Avg response time</span><b>${pi.resp} min</b></div>
      <div class="kv"><span>Summit huts</span><b>${pi.huts}</b></div>
      <div class="kv"><span>Snowmobiles</span><b>${G.sleds.length}</b></div>
      <div class="kv"><span>Incidents this season</span><b>${G.season.incidents}</b></div>
      <div class="kv"><span>Avalanche rescues</span><b>${G.season.rescues}</b></div>
      <small class="dim">Faster response = happier guests. Add patrollers, summit huts, snowmobiles and upgrade HQ.</small></div>
      <div class="card"><h4>Avalanche Program</h4>
      <div class="kv"><span>Danger today</span><b class="avy${G.avy.danger}">${['', 'Low', 'Moderate', 'Considerable', 'High', 'Extreme'][G.avy.danger]} (${G.avy.danger}/5)</b></div>
      <label><input type="checkbox" id="avyctl" ${G.avy.control ? 'checked' : ''}> Do avalanche control work on danger ≥ 3 (explosives ~$450/shot)</label>
      <label><input type="checkbox" id="avyany" ${G.avy.openAnyway ? 'checked' : ''}> ⚠️ Open steep terrain WITHOUT control (risky!)</label>
      <small class="dim">Steep runs (> 38%) need control after storms. Needs ≥4 patrollers + Patrol HQ.</small></div></div>`;
    h += `<h4>🐕 Avalanche Rescue Dogs — kennel space ${G.dogs.length}/${kennel}</h4>`;
    if (!kennel) h += '<p class="hint">Build an <b>Avalanche Dog Kennel</b> first. Dogs find buried skiers far faster than probe lines — and guests adore them.</p>';
    for (const d of G.dogs) {
      const lv = d.train < 30 ? 'Puppy' : d.train < 70 ? 'In training' : 'Certified ✅';
      h += `<div class="item"><div class="row"><b>🐕 ${d.name}</b><span>${d.breed}</span></div><small>${lv} · training ${Math.round(d.train)}% · finds: ${d.finds || 0}</small><div class="bar"><i style="width:${d.train}%;background:#b9770e"></i></div></div>`;
    }
    if (kennel) {
      h += '<div class="list">';
      DOG_BREEDS.forEach((b, i) => h += `<div class="item"><div class="row"><b>${b.breed}</b><button class="btn small" data-dog="${i}" ${G.dogs.length >= kennel ? 'disabled' : ''}>Adopt ${U.money(b.price)}</button></div><small class="dim">Nose rating ${Math.round(b.nose * 100)}%. Needs a handler (Staff).</small></div>`);
      h += '</div>';
    }
    return h;
  },
  b_patrol(box) {
    box.querySelector('#avyctl').onchange = (e) => { G.avy.control = e.target.checked; };
    box.querySelector('#avyany').onchange = (e) => { G.avy.openAnyway = e.target.checked; };
    box.querySelectorAll('[data-dog]').forEach(b => b.onclick = () => {
      const B = DOG_BREEDS[+b.dataset.dog]; if (G.cash < B.price) return this.toast('Not enough cash.', 'bad');
      World.spend(B.price, 'patrol');
      const name = NAMES.dog.filter(n => !G.dogs.some(d => d.name === n))[0] || 'Dog ' + (G.dogs.length + 1);
      G.dogs.push({ id: U.uid(), name, breed: B.breed, nose: B.nose, train: 15 });
      World.log(`🐕 Welcome ${name} the ${B.breed} to the avalanche team!`, 'good');
      this.renderModal();
    });
  },

  // Marketing
  m_marketing() {
    let h = this.head('📣 Marketing & Events') + `<div class="grid2"><div class="card"><div class="kv"><span>Awareness</span><b>${Math.round(G.awareness)} / 100</b></div><div class="bar"><i style="width:${G.awareness}%;background:#3498db"></i></div><div class="kv"><span>Reputation</span><b>${Math.round(G.reputation)} / 100</b></div><div class="bar"><i style="width:${G.reputation}%;background:#9b59b6"></i></div><small class="dim">Awareness brings people in. Reputation (from satisfaction) makes them come back & tell friends.</small></div>
    <div class="card"><h4>Active campaigns</h4>${G.campaigns.length ? G.campaigns.map(c => `<div class="kv"><span>${CAMPAIGNS[c.key].name}</span><b>${c.left} days left</b></div>`).join('') : '<p class="dim">None running.</p>'}</div></div><h4>Campaigns</h4><div class="list">`;
    for (const k in CAMPAIGNS) {
      const C = CAMPAIGNS[k]; const run = G.campaigns.some(c => c.key === k);
      h += `<div class="item"><div class="row"><b>${C.name}</b><button class="btn small" data-camp="${k}" ${run ? 'disabled' : ''}>${run ? 'Running' : (C.perDay ? `$${C.cost.toLocaleString()}/day × ${C.days}` : U.money(C.cost))}</button></div><small class="dim">${C.desc}</small></div>`;
    }
    h += `</div><h4>Events</h4><div class="list">`;
    for (const k in EVENTS) {
      const E = EVENTS[k]; const sched = G.events.find(e => e.key === k && e.day >= G.dayNum);
      h += `<div class="item"><div class="row"><b>${E.name}</b><button class="btn small" data-ev="${k}" ${sched ? 'disabled' : ''}>${sched ? 'Scheduled' : 'Host this Saturday — ' + U.money(E.cost)}</button></div><small class="dim">${E.desc}</small></div>`;
    }
    return h + '</div>';
  },
  b_marketing(box) {
    box.querySelectorAll('[data-camp]').forEach(b => b.onclick = () => {
      const C = CAMPAIGNS[b.dataset.camp];
      if (!C.perDay) { if (G.cash < C.cost) return this.toast('Not enough cash.', 'bad'); World.spend(C.cost, 'marketing'); }
      G.campaigns.push({ key: b.dataset.camp, left: C.days, fresh: true });
      World.log(`📣 Launched: ${C.name}.`, 'build'); this.renderModal();
    });
    box.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => {
      const E = EVENTS[b.dataset.ev];
      if (E.needs === 'park' && !G.runs.some(r => r.park && r.park.features.some(f => ['rail', 'box'].includes(f.kind)))) return this.toast('You need a terrain park with rails or boxes.', 'bad');
      if (E.needs === 'bigjump' && !G.runs.some(r => r.park && r.park.features.some(f => f.kind === 'ljump'))) return this.toast('You need a Big Air Jump.', 'bad');
      const m = World.date().getUTCMonth(); if (E.spring && !(m === 2 || m === 3)) return this.toast('Pond skims are a spring thing (March/April).', 'bad');
      if (G.cash < E.cost) return this.toast('Not enough cash.', 'bad');
      const dow = World.date().getUTCDay(); const d = G.dayNum + ((6 - dow + 7) % 7 || 7);
      World.spend(E.cost, 'marketing'); G.events.push({ key: b.dataset.ev, day: d });
      World.log(`🎉 ${E.name} scheduled for ${World.dateStr(d)}.`, 'build'); this.renderModal();
    });
  },

  // Pricing
  m_pricing() {
    const T = G.today || {};
    return this.head('💲 Pricing') + `<div class="card">
      <label>Day lift ticket: <b>$${G.prices.ticket}</b><input type="range" id="pt" min="29" max="249" step="5" value="${G.prices.ticket}"></label>
      <small class="dim">Guests think a fair price for your resort today is about <b>$${Math.round(T.refPrice || 0) || '—'}</b>. Higher = fewer but more profitable guests.</small>
      <label>Season pass: <b>$${G.prices.pass}</b><input type="range" id="pp" min="199" max="1499" step="25" value="${G.prices.pass}"></label>
      <small class="dim">Passes sell before & early in the season (until Dec 15). Pass holders ski free but spend at the lodge.</small>
      <label>Parking fee: <b>$${G.prices.parking}</b><input type="range" id="pk" min="0" max="40" step="5" value="${G.prices.parking}"></label>
      <small class="dim">Extra revenue, but it hurts the value rating.</small></div>`;
  },
  b_pricing(box) {
    box.querySelector('#pt').onchange = e => { G.prices.ticket = +e.target.value; this.renderModal(); };
    box.querySelector('#pp').onchange = e => { G.prices.pass = +e.target.value; this.renderModal(); };
    box.querySelector('#pk').onchange = e => { G.prices.parking = +e.target.value; this.renderModal(); };
  },

  // Weather
  snowChart(w = 700, hgt = 190) {
    let H = G.history.filter(d => d.season === G.seasonNum || d.season === undefined), note = '';
    if (H.length < 3 && G.seasonNum > 1) { const P = G.history.filter(d => d.season === G.seasonNum - 1); if (P.length > 2) { H = P; note = `<p class="hint">Showing last season (Yr ${G.seasonNum - 1}) until this season has a few days of data.</p>`; } }
    if (H.length < 2) return '<p class="hint">The snow depth chart fills in as days go by. Check back after a few days.</p>';
    const pad = { l: 40, r: 40, t: 14, b: 26 }, iw = w - pad.l - pad.r, ih = hgt - pad.t - pad.b;
    const maxD = Math.max(60, ...H.map(d => d.depth)) * 1.1, maxS = Math.max(20, ...H.map(d => d.snow)) * 1.15;
    const x = (i) => pad.l + (H.length === 1 ? iw / 2 : i / (H.length - 1) * iw);
    const yD = (v) => pad.t + ih - v / maxD * ih, yS = (v) => pad.t + ih - v / maxS * ih;
    const bw = Math.max(2, iw / H.length * 0.6);
    let s = `<svg viewBox="0 0 ${w} ${hgt}" class="chart" role="img" aria-label="Snow depth chart">`;
    const step = maxD > 300 ? 100 : maxD > 120 ? 50 : 25;
    for (let v = 0; v <= maxD; v += step) s += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${yD(v)}" y2="${yD(v)}" stroke="#2a3b50" stroke-width="1"/><text x="${pad.l - 6}" y="${yD(v) + 4}" text-anchor="end" fill="#8fa3b8" font-size="10">${v}</text>`;
    s += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${yD(30)}" y2="${yD(30)}" stroke="#f5b700" stroke-dasharray="4 4"/><text x="${w - pad.r - 4}" y="${yD(30) - 4}" text-anchor="end" fill="#f5b700" font-size="10">30 cm needed to open</text>`;
    H.forEach((d, i) => { if (d.snow > 0) s += `<rect x="${x(i) - bw / 2}" y="${yS(d.snow)}" width="${bw}" height="${pad.t + ih - yS(d.snow)}" fill="#7cc4ff" opacity="0.55"><title>${d.date}: ${d.snow} cm new snow</title></rect>`; });
    const pts = H.map((d, i) => `${x(i)},${yD(d.depth)}`).join(' ');
    s += `<polygon points="${pad.l},${pad.t + ih} ${pts} ${x(H.length - 1)},${pad.t + ih}" fill="#ffffff" opacity="0.10"/>`;
    s += `<polyline points="${pts}" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>`;
    const L = H[H.length - 1]; s += `<circle cx="${x(H.length - 1)}" cy="${yD(L.depth)}" r="4" fill="#fff"/><text x="${x(H.length - 1) - 6}" y="${yD(L.depth) - 8}" text-anchor="end" fill="#fff" font-size="11" font-weight="700">${L.depth} cm</text>`;
    H.forEach((d, i) => { if (i % Math.ceil(H.length / 7) === 0) s += `<text x="${x(i)}" y="${hgt - 8}" text-anchor="middle" fill="#8fa3b8" font-size="10">${d.date.split(',')[0].slice(4)}</text>`; });
    for (let v = 0; v <= maxS; v += maxS > 60 ? 20 : 10) s += `<text x="${w - pad.r + 6}" y="${yS(v) + 4}" fill="#7cc4ff" font-size="10">${v}</text>`;
    s += `</svg>${note}<p class="legend"><span class="lw"></span> Base depth (cm, left)  <span class="lb"></span> New snow per day (cm, right)  <span class="ly"></span> Opening depth</p>`;
    return s;
  },
  m_weather() {
    let h = this.head('🌨️ Weather & Snow Report') + `<h4>❄️ Snow depth this season</h4>${this.snowChart()}<p><b>Storm outlook:</b> ${Weather.stormOutlook()}</p><div class="fc">`;
    G.wx.slice(0, 7).forEach((d, k) => {
      const dt = World.date(d.dayNum);
      h += `<div class="fday ${d.storm ? 'storm' : ''}"><b>${k === 0 ? 'Today' : DOW[dt.getUTCDay()]}</b><div class="fi">${Weather.icon(d)}</div><small>${Weather.label(d)}</small><div>${d.tHi}° / ${d.tLo}°</div><div>❄ ${Weather.forecastText(d, k)}</div><small>💨 ${k < 3 ? d.wind : '~' + Math.round(d.wind / 5) * 5} m/s</small></div>`;
    });
    h += `</div><div class="grid2"><div class="card"><h4>Snowpack</h4><div class="kv"><span>Mid-mountain base</span><b>${Math.round(G.baseDepth)} cm</b></div><div class="kv"><span>Season total</span><b>${Math.round(G.seasonSnow)} cm</b></div><div class="kv"><span>Surface</span><b>${G.icy > 0.5 ? 'Firm / icy' : 'Packed powder'}</b></div></div>
    <div class="card"><h4>How weather works</h4><small class="dim">Storms arrive in cycles (clippers, Pacific storms, upslope events and atmospheric rivers). Snow piles up as powder on runs until groomed or skied off. High winds trigger lift <b>wind holds</b> — T-bars and Funitels resist wind best. Warm days melt the base and refreeze to ice. Big storms raise avalanche danger.</small></div></div>`;
    h += `<h4>Run conditions</h4><table class="tbl"><tr><th>Run</th><th>Depth</th><th>Surface</th><th>Groom</th></tr>${G.runs.map(r => `<tr><td>${DIFF[r.diff].icon} ${r.name}</td><td>${Sim.runDepth(r)} cm</td><td>${Sim.surfaceLabel(r)}</td><td>${r.groomPlan}</td></tr>`).join('')}</table>`;
    return h;
  },

  // Guests
  m_guests() {
    const S = G.lastSat; const T = G.history[G.history.length - 1];
    let h = this.head('😀 Guest Satisfaction');
    if (!S) return h + '<p class="hint">Open the resort to start collecting guest feedback.</p>';
    const names = { lines: 'Lift lines', grooming: 'Grooming', snow: 'Snow conditions', terrain: 'Terrain variety', facilities: 'Facilities & food', safety: 'Safety & patrol', value: 'Value for money', park: 'Terrain park', comfort: 'Comfort & weather' };
    h += `<div class="grid2"><div class="card">`;
    for (const k in S) h += `<div class="kv"><span>${names[k]}</span><b>${Math.round(S[k])}</b></div><div class="bar"><i style="width:${S[k]}%;background:${S[k] > 70 ? '#2ecc71' : S[k] > 45 ? '#f1c40f' : '#e74c3c'}"></i></div>`;
    h += `</div><div class="card"><div class="kv"><span>Overall (last day)</span><b>${T ? T.sat : '–'}</b></div><div class="kv"><span>Reputation</span><b>${Math.round(G.reputation)}</b></div><h4>Reviews</h4>${G.reviews.slice(0, 10).map(r => `<div class="review"><span class="stars">${r.s}</span> ${r.t}</div>`).join('')}</div></div>`;
    const km = Sim.openKmBy();
    h += `<h4>Open terrain</h4><p>● ${km.green.toFixed(1)} km · ■ ${km.blue.toFixed(1)} km · ◆ ${km.black.toFixed(1)} km · ◆◆ ${km.dblack.toFixed(1)} km</p><p class="hint">Guest mix: 22% beginners, 43% intermediates, 25% advanced, 10% experts. Each group wants enough terrain at their level.</p>`;
    return h;
  },

  // Help
  m_help() {
    const tab = this.helpTab || 'start';
    const tabs = { start: '🚀 Getting started', runs: '⛷️ Runs', lifts: '🚡 Lifts', groom: '🚜 Grooming', snow: '🌨️ Snow & weather', money: '💰 Money & guests', safety: '⛑️ Patrol & safety', keys: '⌨️ Controls' };
    const body = {
      start: `<p><b>Your goal:</b> build a ski resort guests love, and grow it season after season.</p>
        <ol class="howto big"><li><b>Build a lift</b> from the base village (🚡 Lifts).</li><li><b>Draw runs</b> from the top of the lift back down (⛷️ Runs).</li><li><b>Speed up time</b> (⏩ at the top) until the lift is built.</li><li>Click <b>🎿 Open for Season</b>.</li><li>Each evening, let the crew groom or <b>drive a snowcat yourself</b>.</li><li>Use your profits to add lifts, runs and buildings.</li></ol>
        <p>Your base village (tickets, lodge, parking, rentals, patrol and snowcat garage), one snowcat and your staff are already set up. Staff are hired automatically.</p>
        <button class="btn primary" id="restartTut">▶ Restart the step-by-step tutorial</button>`,
      runs: `<p>Runs are drawn by clicking down the mountain. They should <b>start at the top of a lift</b> and <b>end at the bottom of a lift or the base</b>. A ⚠️ means a run doesn't connect.</p>
        <p>A run's colour comes from its steepest part: <span class="g">● Green</span> easy, <span class="b">■ Blue</span> medium, <b>◆ Black</b> hard, <b>◆◆ Double black</b> experts only. While drawing, the map is coloured the same way. Zig-zagging across the slope makes a run easier.</p>
        <p>Guests come in every level: about 1 in 5 are beginners, so always have some green runs. More runs = more guests.</p>`,
      lifts: `<p>A <b>Double Chair</b> is the best first lift. Put its bottom inside the yellow circle by the base so guests can reach it.</p>
        <p>Faster and bigger lifts carry more people and shorten lift lines. Very strong wind can stop chairlifts (a "wind hold"); T-bars and the Funitel keep running in wind.</p>
        <p>A <b>Magic Carpet</b> near the base makes a great beginner area.</p>`,
      groom: `<p>Skiers wear runs down into bumps during the day. Every night your snowcats <b>groom</b> them flat again (that's the "corduroy" lines).</p>
        <p>At the end of each day choose <b>🚜 Drive a groomer tonight</b> to do it yourself:<br><b>W / S</b> drive forward / back · <b>A / D</b> steer · <b>Space</b> tiller on/off · <b>B</b> blade (flattens big bumps) · <b>E</b> winch (steep runs).</p>
        <p>Orange dots mark the run edges in the dark, and the minimap shows what still needs grooming (red). Very steep runs need a <b>winch</b> snowcat, which you can buy in 🚜 Fleet.</p>
        <p>Don't want to choose every evening? Turn on <b>Auto night grooming</b> in 🚜 Fleet (or tick the box on the end-of-day screen) and the crew grooms every night automatically.</p>`,
      snow: `<p>Runs need <b>30 cm of snow</b> to open. Storms bring fresh powder, and powder days bring big crowds.</p>
        <p>The 🌨️ Weather screen shows a 7-day forecast. Warm days melt snow. A <b>Pump House</b> plus snowmaking on your runs adds snow on cold nights.</p>`,
      money: `<p>You earn money from lift tickets, season passes, rentals, food and more. Your biggest costs are staff wages and lift power.</p>
        <p><b>Happiness</b> (top bar) is how much guests liked their day. Keep lift lines short, runs groomed and have enough food seats. Happy guests raise your <b>Reputation</b>, which brings more guests.</p>
        <p>Use 📣 Marketing to bring in more people, and 💲 Pricing to set ticket prices. If cash gets low, 📊 Money lets you take a loan.</p>`,
      safety: `<p>Ski patrol handles injuries automatically. Snowmobiles and summit huts help them get there faster.</p>
        <p>After big storms the <b>avalanche danger</b> rises and patrol does control work on steep runs. Avalanche rescue dogs (build a Kennel, then adopt in ⛑️ Patrol) save buried skiers.</p>`,
      keys: `<table class="tbl"><tr><td>Move the map</td><td>Right-click & drag, or W A S D</td></tr><tr><td>Zoom</td><td>Mouse wheel</td></tr><tr><td>Pause / speed</td><td>Space / 1 2 3 4</td></tr><tr><td>Tools</td><td>Q select · R runs · L lifts · B build · T trees · P park · M snow · X delete</td></tr><tr><td>Finish / undo a run</td><td>Double-click or Enter / Backspace</td></tr><tr><td>Cancel</td><td>Esc</td></tr></table>`,
    };
    return this.head('❓ How to Play') + `<div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="tabb ${k === tab ? 'on' : ''}" data-ht="${k}">${v}</button>`).join('')}</div><div class="help">${body[tab]}</div>`;
  },
  b_help(box) {
    box.querySelectorAll('[data-ht]').forEach(b => b.onclick = () => { this.helpTab = b.dataset.ht; this.renderModal(); });
    const r = box.querySelector('#restartTut'); if (r) r.onclick = () => { this.closeModal(); Tutorial.restart(); };
  },

  // Day report
  showDayReport(T) {
    this.openModal('report', T);
  },
  m_report(T) {
    const w = Weather.today(); const tom = G.wx[1];
    let h = `<div class="mhead"><h2>🌆 End of Day — ${World.dateStr()}</h2></div>`;
    if (T.visitors) {
      h += `<div class="grid3"><div class="stat"><small>Skier visits</small><b>${T.visitors.toLocaleString()}</b><small>${T.pass.toLocaleString()} pass holders</small></div>
      <div class="stat"><small>Net today</small><b class="${T.net >= 0 ? 'ok' : 'bad'}">${U.money(T.net)}</b><small>cash ${U.money(G.cash)}</small></div>
      <div class="stat"><small>Satisfaction</small><b>${T.sat}%</b><small>avg lift line ${Math.round(T.avgWait || 0)} min</small></div></div>`;
      h += `<div class="grid2"><div class="card">${this.breakdown(T)}</div><div class="card"><h4>Guest reviews</h4>${(T.reviews || []).map(r => `<div class="review"><span class="stars">${r.s}</span> ${r.t}</div>`).join('') || '<p class="dim">No comments.</p>'}
      <div class="kv"><span>Patrol calls</span><b>${T.incidents.length}</b></div>${T.turned ? `<div class="kv"><span>Turned away</span><b class="bad">${T.turned}</b></div>` : ''}</div></div>`;
    } else {
      h += `<p>${G.seasonOpen ? (T.closedReason || 'The resort did not operate today.') : 'Pre-season. Keep building! Build a lift and a run, then click 🎿 Open for Season at the top.'}</p><div class="card">${this.breakdown(T)}</div>`;
    }
    if (tom) h += `<p class="hint"><b>Tonight / tomorrow:</b> ${Weather.icon(tom)} ${Weather.label(tom)}, low ${tom.tLo}°C${tom.snowNight ? `, ${Weather.forecastText(tom, 1)} overnight` : ''}. ${Weather.stormOutlook()}</p>`;
    h += `<div class="night"><h4>🌙 Night shift</h4>`;
    if (G.groomers.length) {
      h += `<label>Drive yourself: <select id="driveSel">${G.groomers.map(g => `<option value="${g.id}">${g.name} — ${GROOMERS[g.kind].name}</option>`).join('')}</select></label>
      <button class="btn primary" id="drive">🚜 Drive a groomer tonight</button> `;
    } else h += `<p class="hint">Buy a snowcat in <b>Fleet</b> to groom (or drive one yourself!).</p>`;
    h += `<button class="btn" id="sleep">😴 Let the crew groom & sleep</button>
      <label class="autog"><input type="checkbox" id="autoGroom" ${G.autoGroom ? 'checked' : ''}> <b>Always let the crew groom at night</b> and skip this screen. You can turn it off in 🚜 Fleet.</label></div>`;
    h += `<label class="hint"><input type="checkbox" id="showClosed" ${G.showClosedReports ? 'checked' : ''}> Also show this report on days the resort is closed (pre-season, storm closures)</label>`;
    return h;
  },
  b_report(box) {
    box.querySelector('#showClosed').onchange = (e) => { G.showClosedReports = e.target.checked; };
    box.querySelector('#autoGroom').onchange = (e) => { G.autoGroom = e.target.checked; };
    const d = box.querySelector('#drive');
    if (d) d.onclick = () => { const g = G.groomers.find(x => x.id == box.querySelector('#driveSel').value); this.modal = null; $('#modal').classList.remove('show'); G.speed = this.prevSpeed || 1; this.prevSpeed = null; Drive.start(g); };
    box.querySelector('#sleep').onclick = () => { this.modal = null; $('#modal').classList.remove('show'); G.speed = this.prevSpeed || 1; this.prevSpeed = null; Sim.runNight(null); Save.save(); };
  },

  showSeasonSummary(S) { this.openModal('season', S); },
  m_skipping(d) {
    return `<div class="mhead"><h2>⏩ Skipping to the end of the season…</h2></div>
      <p>Your crew grooms every night, staff are handled automatically and the resort opens as soon as it can.</p>
      <div class="bar big"><i id="skipBar" style="width:0%;background:#4fb3ff"></i></div>
      <div class="grid3"><div class="stat"><small>Date</small><b id="skipDate">${World.dateStr()}</b></div><div class="stat"><small>Skier visits so far</small><b id="skipVis">0</b></div><div class="stat"><small>Cash</small><b id="skipCash">${U.money(G.cash)}</b></div></div>
      <div class="btns center"><button class="btn" id="skipStop">⏹ Stop here</button></div>`;
  },
  b_skipping(box) { box.querySelector('#skipStop').onclick = () => { G._skipping = false; this.closeModal(); G.speed = 0; Save.save(); World.log('⏹ Stopped skipping. Game paused.'); }; },
  updateSkip() {
    const d = this.modalData || {}; if (this.modal !== 'skipping') return;
    const end = Math.round((Date.UTC(2026 + G.seasonNum, 3, 20) - START_DATE) / 86400000), start = Math.round((Date.UTC(2026 + G.seasonNum - 1, 10, 3) - START_DATE) / 86400000);
    const pct = U.clamp((G.dayNum - start) / (end - start) * 100, 0, 100);
    const q = (s) => document.querySelector(s);
    if (q('#skipBar')) { q('#skipBar').style.width = pct + '%'; q('#skipDate').textContent = World.dateStr(); q('#skipVis').textContent = (G.season.visitors - d.startVisits).toLocaleString(); q('#skipCash').textContent = U.money(G.cash); }
  },
  m_season(S) {
    return `<div class="mhead"><h2>🏁 Season ${G.seasonNum} Complete!</h2></div>
    <div class="grid3"><div class="stat"><small>Skier visits</small><b>${S.visitors.toLocaleString()}</b></div><div class="stat"><small>Revenue</small><b class="ok">${U.money(S.revenue)}</b></div><div class="stat"><small>Profit</small><b class="${S.revenue - S.expense >= 0 ? 'ok' : 'bad'}">${U.money(S.revenue - S.expense)}</b></div></div>
    <div class="card"><div class="kv"><span>Season snowfall</span><b>${Math.round(G.seasonSnow)} cm</b></div><div class="kv"><span>Reputation</span><b>${Math.round(G.reputation)}</b></div><div class="kv"><span>Patrol incidents</span><b>${S.incidents}</b></div><div class="kv"><span>Avalanche rescues</span><b>${S.rescues}</b></div></div>
    <p>Summer is here. Crews will maintain the lifts and the hotel & gondola run summer operations. Next season starts in early November.</p>
    <button class="btn primary" id="next">☀️ Skip summer → Season ${G.seasonNum + 1}</button>`;
  },
  b_season(box) { box.querySelector('#next').onclick = () => { this.modal = null; $('#modal').classList.remove('show'); G.speed = 1; this.prevSpeed = null; Sim.startNextSeason(); Save.save(); }; },

  // Drive HUD
  enterDrive() { $('#hoverTip').style.display = 'none'; $('#driveHud').classList.add('show'); document.body.classList.add('driving'); this.setTool('select'); },
  exitDrive() { $('#driveHud').classList.remove('show'); document.body.classList.remove('driving'); },
  updateDriveHud() {
    const D = Drive; const M = D.M;
    const ci = Terrain.cellAt(D.x, D.y);
    let onRun = null; for (const r of G.runs) if (r.cells.includes(ci)) { onRun = r; break; }
    $('#dhStats').innerHTML = `<b>${M.name}</b> · ${Sim.clockStr()}<br>
      Speed <b>${(Math.abs(D.v) * 3 * 3.6 / 3).toFixed(1)} km/h</b> · Grade <b>${Math.round(Terrain.slope[ci] || 0)}%</b><br>
      Fuel <span class="fuel"><i style="width:${D.fuel * 100}%"></i></span><br>
      Tiller <b class="${D.tiller ? 'ok' : ''}">${D.tiller ? 'DOWN' : 'UP'}</b> · Blade <b class="${D.blade ? 'ok' : ''}">${D.blade ? 'DOWN' : 'UP'}</b> ${M.winch ? `· Winch <b class="${D.winch ? 'ok' : ''}">${D.winch ? 'ON' : 'OFF'}</b>` : ''}<br>
      Groomed <b>${(D.cells * CELL * CELL / 10000).toFixed(2)} ha</b><br>
      ${onRun ? `On: ${DIFF[onRun.diff].icon} <b>${onRun.name}</b> (${Sim.surfaceLabel(onRun)})` : '<span class="dim">Off-piste</span>'}`;
    $('#dhMsg').textContent = D.msgT > 0 ? D.msg : '';
  },
};
