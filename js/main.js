// ---------- Save / load & main loop ----------
const Save = {
  key: 'powderline_save_v2',
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
    Terrain.generate(d.seed);
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
  start(loadSave) {
    if (!(loadSave && Save.load())) World.newGame(Math.floor(Math.random() * 1e9));
    Terrain.initCanvases();
    const b = World.basePos();
    Render.cam.x = b.x; Render.cam.y = b.y - 450; Render.cam.zoom = 0.55;
    $('#log').innerHTML = '';
    for (const l of G.log.slice(0, 30).reverse()) UI.onLog(l.msg, 'info');
    UI.setTool('select');
    UI.refreshTop();
    G.speed = loadSave ? 1 : 0;
    if (!G.tut) G.tut = { step: 0, on: false };
    if (!loadSave) Tutorial.go(0); else Tutorial.show();
  },
};

UI.m_start = function () {
  return `<div class="title"><div class="logo">🏔️</div><h1>Powderline</h1><p class="sub">Ski Resort Tycoon</p></div>
  <p>Build lifts, draw ski runs, groom the slopes at night and grow the best ski resort in the mountains. A step-by-step guide shows you how.</p>
  <div class="btns center"><button class="btn primary big" id="newg">⛷️ New Mountain</button>${Save.has() ? '<button class="btn big" id="cont">▶ Continue</button>' : ''}</div>`;
};
UI.b_start = function (box) {
  box.querySelector('#newg').onclick = () => { this.modal = null; this.prevSpeed = null; $('#modal').classList.remove('show'); Game.start(false); };
  const c = box.querySelector('#cont'); if (c) c.onclick = () => { this.modal = null; this.prevSpeed = null; $('#modal').classList.remove('show'); Game.start(true); };
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
      UI.panKeys(dt);
      if (G.phase === 'day' && G.speed > 0 && !UI.modal) {
        let mins = dt * 6 * G.speed;
        if (!Sim.operating() || !G.today.visitors) mins *= 3;
        while (mins > 0 && G.phase === 'day') { const s = Math.min(2, mins); Sim.tickDay(s); mins -= s; }
        Agents.update(dt * G.speed);
      }
      if (G.phase === 'drive') Drive.update(dt);
      try { Render.draw(now); } catch (e) { console.error(e); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('beforeunload', () => { if (G && G.dayNum > 0 && !UI.modal) Save.save(); });
})();
