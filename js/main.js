// ---------- Save / load & main loop ----------
const Save = {
  key: 'powderline_save_v3',
  has() { try { return !!localStorage.getItem(this.key); } catch (e) { return false; } },
  save() {
    try {
      const data = Object.assign({}, G);
      delete data._runById; delete data._liftById;
      data.terrainState = {
        trees: Array.from(Terrain.trees, v => Math.round(v * 100)),
        groom: Array.from(Terrain.groom, v => Math.round(v * 100)),
        gdir: Array.from(Terrain.gdir, v => Math.round(v * 100) / 100),
        powder: Array.from(Terrain.powder, v => Math.round(v)),
      };
      localStorage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch (e) { console.warn('save failed', e); return false; }
  },
  load() {
    let d;
    try { d = JSON.parse(localStorage.getItem(this.key)); } catch (e) { return false; }
    if (!d) return false;
    Terrain.generate(d.seed, d.site);
    const ts = d.terrainState; delete d.terrainState;
    for (let i = 0; i < Terrain.N; i++) {
      Terrain.trees[i] = ts.trees[i] / 100; Terrain.groom[i] = ts.groom[i] / 100; Terrain.gdir[i] = ts.gdir[i]; Terrain.powder[i] = ts.powder[i];
    }
    G = d;
    let maxId = 1;
    for (const r of G.runs) { maxId = Math.max(maxId, r.id); for (const i of r.cells) Terrain.runMask[i]++; }
    for (const e of [...G.lifts, ...G.buildings, ...G.groomers, ...G.sleds, ...G.dogs]) maxId = Math.max(maxId, e.id);
    U._n = maxId + 1;
    if (G.phase === 'drive' || G.phase === 'dusk') { G.phase = 'day'; G.time = DAY_END - 1; }
    World.rebuildNetwork();
    return true;
  },
};

const Game = {
  seeds: [],
  // Load a save, or begin the game on the mountain already in G (after buying it)
  start(loadSave) {
    if (loadSave) { if (!Save.load()) { this.pickSite(); return; } Terrain.initCanvases(); }
    this.begin(!!loadSave);
  },
  begin(loaded) {
    const b = World.basePos();
    Render.cam.x = b.x; Render.cam.y = b.y - 450; Render.cam.zoom = 0.55;
    $('#log').innerHTML = '';
    for (const l of G.log.slice(0, 30).reverse()) UI.onLog(l.msg, 'info');
    UI.setTool('select'); UI.refreshTop();
    $('#brandName').textContent = G.name || 'Powderline';
    G.speed = loaded ? 1 : 0;
    if (!G.tut) G.tut = { step: 0, on: false };
    if (!loaded) Tutorial.go(0); else Tutorial.show();
    if (W3D.supported()) { W3D.enter({ at: 'office', rebuild: true }); if (!loaded) { $('#h3intro').hidden = false; $('#h3introName').textContent = G.name; } }
  },
  pickSite() {
    this.seeds = SITES.map(() => Math.floor(Math.random() * 1e9));
    UI.openModal('sites');
  },
  preview(i, tour) {
    if (tour && !this._loading) { this._loading = true; $('#loading3d').hidden = false; setTimeout(() => { try { this.preview(i, tour); } finally { this._loading = false; $('#loading3d').hidden = true; } }, 40); return; }
    World.newGame(this.seeds[i], SITES[i], '');
    G.tut.on = false; G.speed = 0; G.log = [];
    Terrain.initCanvases();
    this.site = i;
    if (tour && W3D.supported()) { UI.modal = null; $('#modal').classList.remove('show'); W3D.enter({ tour: true, rebuild: true }); this.tourHud(); }
  },
  tourHud() {
    const s = SITES[this.site];
    $('#h3tour').innerHTML = `<div class="tour-card"><small>Mountain ${this.site + 1} of ${SITES.length}</small><h2>${s.name}</h2><p>${s.desc}</p>
      <div class="tags">${s.tags.map(t => `<span>${t}</span>`).join('')}</div>
      <div class="kv"><span>Vertical drop</span><b>${Math.round(Terrain.maxE - Terrain.minE).toLocaleString()} m</b></div>
      <div class="kv"><span>Summit</span><b>${Math.round(Terrain.maxE).toLocaleString()} m</b></div>
      <div class="kv"><span>Land price</span><b>${U.money(s.price)}</b></div>
      <div class="kv"><span>Money left to build</span><b>${U.money(10000000 - s.price)}</b></div>
      <div class="btns"><button class="btn primary" id="tourBuy">🏔️ Buy this mountain</button><button class="btn" id="tourNext">Next mountain ➡</button><button class="btn ghost" id="tourBack">⬅ All mountains</button></div></div>`;
    $('#tourBuy').onclick = () => this.buy(this.site);
    $('#tourNext').onclick = () => this.preview((this.site + 1) % SITES.length, true);
    $('#tourBack').onclick = () => { W3D.exit(); UI.openModal('sites'); };
  },
  buy(i) {
    if (!G || !G.site || G.site.key !== SITES[i].key || this.site !== i) this.preview(i, false);
    W3D.exit();
    UI.openModal('name');
  },
  finish(name) {
    G.name = (name || '').trim().slice(0, 32) || SITES[this.site].name + ' Resort';
    G.tut = { step: 0, on: true };
    World.log(`🏔️ You bought ${SITES[this.site].name} for ${U.money(SITES[this.site].price)} and founded ${G.name}!`, 'good');
    this.begin(false);
  },
};

UI.m_start = function () {
  return `<div class="title"><div class="logo">🏔️</div><h1>Powderline</h1><p class="sub">Ski Resort Tycoon</p></div>
  <p>Tour real-feeling mountains, buy one, name your resort and build it from the ground up. Walk your village, ride your lifts and ski your own runs in 3D, then run the business from the computer in your office.</p>
  <div class="btns center"><button class="btn primary big" id="newg">⛷️ New Resort</button>${Save.has() ? '<button class="btn big" id="cont">▶ Continue</button>' : ''}</div>`;
};
UI.b_start = function (box) {
  box.querySelector('#newg').onclick = () => { this.modal = null; this.prevSpeed = null; $('#modal').classList.remove('show'); Game.pickSite(); };
  const c = box.querySelector('#cont'); if (c) c.onclick = () => { this.modal = null; this.prevSpeed = null; $('#modal').classList.remove('show'); Game.start(true); };
};
UI.m_sites = function () {
  const has3d = W3D.supported();
  return `<div class="mhead"><h2>🏔️ Choose your mountain</h2></div><p>Three mountains are for sale. Tour each one in 3D, then buy the one you like. You start with <b>$10M</b>: whatever the land doesn't cost is yours to build with.</p>
  <div class="sites">${SITES.map((s, i) => `<div class="site"><h3>${s.name}</h3><div class="tags">${s.tags.map(t => `<span>${t}</span>`).join('')}</div><p>${s.desc}</p>
    <div class="kv"><span>Land price</span><b>${U.money(s.price)}</b></div><div class="kv"><span>Snowfall</span><b>${s.snow > 1.1 ? 'Deep' : s.snow < 0.95 ? 'Light' : 'Good'}</b></div><div class="kv"><span>Size of mountain</span><b>${s.vert > 1.1 ? 'Huge' : s.vert < 0.9 ? 'Small' : 'Medium'}</b></div>
    <div class="btns">${has3d ? `<button class="btn primary" data-tour="${i}">🚁 Tour in 3D</button>` : ''}<button class="btn" data-buysite="${i}">Buy ${U.money(s.price)}</button></div></div>`).join('')}</div>`;
};
UI.b_sites = function (box) {
  box.querySelectorAll('[data-tour]').forEach(b => b.onclick = () => Game.preview(+b.dataset.tour, true));
  box.querySelectorAll('[data-buysite]').forEach(b => b.onclick = () => { this.modal = null; Game.buy(+b.dataset.buysite); });
};
UI.m_name = function () {
  const s = SITES[Game.site];
  const ideas = [s.name.split(' ')[0] + ' Mountain Resort', 'Powder Ridge', 'Snowy Owl Mountain', 'Bluebird Basin', 'Timberline Peaks'];
  return `<div class="mhead"><h2>✍️ Name your resort</h2></div><p>You bought <b>${s.name}</b> for <b>${U.money(s.price)}</b>. What should guests call your resort? It goes on the signs, the welcome arch and your office door.</p>
  <label>Resort name<input id="resortName" maxlength="32" value="${ideas[0]}"></label>
  <div class="tags clickable">${ideas.map(n => `<span data-idea="${n}">${n}</span>`).join('')}</div>
  <div class="btns"><button class="btn primary big" id="nameGo">🎉 Found my resort</button></div>`;
};
UI.b_name = function (box) {
  const inp = box.querySelector('#resortName'); inp.focus(); inp.select();
  box.querySelectorAll('[data-idea]').forEach(s => s.onclick = () => { inp.value = s.dataset.idea; });
  const go = () => { this.modal = null; this.prevSpeed = null; $('#modal').classList.remove('show'); Game.finish(inp.value); };
  box.querySelector('#nameGo').onclick = go; inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
};
UI.m_welcome = function () {
  return this.head('Welcome, General Manager!') + `<p>It's <b>October 20</b>. You own an undeveloped mountain with ${Math.round(Terrain.maxE - Terrain.minE)} m of vertical. Snow usually starts flying in November — get the resort built before then!</p>
  <ol class="help"><li>Follow the <b>Resort Checklist</b> on the right — click any step to jump to that tool.</li>
  <li>Plan runs with the <b>slope overlay</b> (shown automatically while designing): <span class="g">green</span> &lt;25%, <span class="b">blue</span> 25–40%, black 40–60%, <span style="color:#e33">red</span> = experts only.</li>
  <li>Use <b>Staff → Auto-hire</b> after you build things.</li>
  <li>Each evening you can <b>drive a snowcat</b> yourself or let the night crew groom.</li></ol>
  <p class="hint">Tip: speed up pre-season days with the ⏩ buttons or "Skip to evening".</p><button class="btn primary" data-close>Let's build! 🎿</button>`;
};

(function boot() {
  Render.init($('#view'));
  UI.init();
  G = null;
  // dummy state so the start screen has a backdrop
  Tutorial.init();
  World.newGame(12345);
  G.tut.on = false;
  G.log = []; $('#log').innerHTML = '';
  Terrain.initCanvases();
  Render.cam.x = G.basePoint.x; Render.cam.y = G.basePoint.y - 600; Render.cam.zoom = 0.45;
  G.speed = 0;
  UI.openModal('start');
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (G) {
      if (!W3D.active) UI.panKeys(dt);
      if (G.phase === 'day' && G.speed > 0 && !UI.modal) {
        let mins = dt * 6 * G.speed;
        if (!Sim.operating() || !G.today.visitors) mins *= 3;
        while (mins > 0 && G.phase === 'day') { const s = Math.min(2, mins); Sim.tickDay(s); mins -= s; }
        Agents.update(dt * G.speed);
      }
      if (G.phase === 'drive') Drive.update(dt);
      if (W3D.active) { try { W3D.update(dt); W3D.render(); } catch (e) { console.error(e); } }
      else { try { Render.draw(now); } catch (e) { console.error(e); } }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('beforeunload', () => { if (G && G.dayNum > 0 && !UI.modal) Save.save(); });
})();
