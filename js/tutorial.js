// ---------- Step-by-step tutorial coach ----------
const Tutorial = {
  steps: [
    { title: 'Welcome to the Resort Manager! 💻',
      text: 'This is the computer in your office. Your mountain is bare, so let\'s build a resort from the ground up. Everything you build here appears out on the mountain in 3D.<br><br><b>Move the map:</b> right-click and drag, or W A S D. <b>Zoom:</b> mouse wheel. Go outside any time with <b>🚶 Walk the resort</b>.',
      next: 'Let\'s build' },
    { title: 'Step 1 of 9 · Build a Ticket Office',
      text: 'Click <b>🏠 Build</b> on the left, open the <b>🔧 Operations</b> tab and pick <b>Ticket Office</b>. Then click flat ground near the bottom of the mountain. Guests can\'t ski without tickets!',
      target: '[data-tool="building"]',
      enter: () => { UI.bldCat = 'ops'; },
      done: () => G.buildings.some(b => b.kind === 'ticket') },
    { title: 'Step 2 of 9 · Base Lodge & Parking',
      text: 'In the <b>🏘️ Village</b> tab, place a <b>Base Lodge</b> (food and warmth) and a <b>Parking Lot</b> (no parking = no guests). Put them near your ticket office.',
      target: '[data-tool="building"]',
      enter: () => { UI.bldCat = 'village'; if (UI.tool && UI.tool.kind === 'building') { UI.tool.sub = 'lodge'; UI.renderPanel(); } },
      done: () => G.buildings.some(b => b.kind === 'lodge') && G.buildings.some(b => b.kind === 'parking') },
    { title: 'Step 3 of 9 · Pick the Lifts tool',
      text: 'Click the <b>🚡 Lifts</b> button on the left side of the screen.',
      target: '[data-tool="lift"]',
      done: () => UI.tool && UI.tool.kind === 'lift' },
    { title: 'Step 4 of 9 · Place your first chairlift',
      text: 'The <b>Fixed-Grip Double</b> is selected.<br>1. <b>Click once inside the dashed yellow circle</b> by your lodge (bottom terminal).<br>2. <b>Click again higher up the mountain</b> (top terminal). Green line = OK.<br><br>Out on the mountain you\'ll see a helicopter flying the towers in while it\'s being built!',
      enter: () => { if (UI.tool && UI.tool.kind === 'lift') { UI.tool.sub = 'double'; UI.renderPanel(); } Tutorial.focusBase(); },
      done: () => G.lifts.some(l => l.fromBase),
      hint: () => G.lifts.length && !G.lifts.some(l => l.fromBase) ? '⚠️ That lift is too far from the base. Try again with the bottom inside the yellow circle.' : '' },
    { title: 'Step 5 of 9 · Draw a run',
      text: 'Click <b>⛷️ Runs</b>. Then:<br>1. Click at the <b>top of your lift</b>.<br>2. Click a few times going <b>down the hill</b>.<br>3. Finish near the <b>bottom of your lift</b> and <b>double-click</b>.<br><br>The map turns <span class="g">green</span> / <span class="b">blue</span> / black / <span style="color:#ff6b6b">red</span> to show how steep each spot is.',
      target: '[data-tool="run"]',
      enter: () => Tutorial.focusLift(),
      done: () => G.runs.some(r => r.reachable && !r.deadEnd),
      hint: () => G.runs.some(r => r.deadEnd) ? '⚠️ A run must end at a lift bottom or the base. Undo with Backspace or draw another.' : G.runs.some(r => !r.reachable) ? '⚠️ Start the run right at the top of your lift.' : '' },
    { title: 'Step 6 of 9 · Make an easy run',
      text: 'About 1 in 5 guests are beginners, and they only ski <b>● green</b> runs. Draw another run that <b>zig-zags across the hill</b> so it stays gentle. You can skip this for now.',
      target: '[data-tool="run"]',
      done: () => G.runs.some(r => r.reachable && r.diff === 'green'),
      next: 'Skip for now' },
    { title: 'Step 7 of 9 · Get a snowcat',
      text: 'Runs get bumpy every day. In <b>🏠 Build → 🔧 Operations</b> place a <b>Vehicle Maintenance Shop</b>. When it\'s finished, open <b>🚜 Fleet</b> at the top and buy a <b>Ridgeline 400</b>.',
      target: '[data-tool="building"]',
      enter: () => { UI.bldCat = 'ops'; },
      done: () => G.groomers.length > 0,
      next: 'Skip for now' },
    { title: 'Step 8 of 9 · Speed up time',
      text: 'Construction takes a few days. Press <b>⏩</b> or <b>⏭</b> at the top to make days go faster, and watch the 🏗 day counters. Your staff are hired automatically.',
      target: '.speed',
      done: () => G.lifts.some(l => l.buildDays <= 0 && l.fromBase) && World.built('ticket').length },
    { title: 'Step 9 of 9 · Open the resort! 🎿',
      text: 'Your lift and ticket office are ready and there\'s snow on the ground. Click the green <b>🎿 Open for Season</b> button at the top.',
      target: '#btnOpen',
      done: () => G.seasonOpen },
    { title: 'You\'re open! 🎉',
      text: 'Guests now arrive every morning. Click <b>🚶 Walk the resort</b> to go outside: walk to your lift and press <b>E</b> to ride it, then ski down your own run!<br><br>• <b>Happiness</b> shows how much guests liked their day.<br>• Click any lift or run on this map for details.',
      next: 'Got it' },
    { title: 'Tonight: grooming 🚜',
      text: 'At the end of each day pick <b>🚜 Drive a groomer tonight</b> to drive the snowcat yourself (W/S drive, A/D steer), in 3D if you\'re outside. Or let the crew do it. Smooth runs mean happy guests!',
      done: () => G._droveOnce || G.history.filter(h => h.visitors > 0).length >= 2,
      next: 'Got it' },
    { title: 'You\'ve got this! ⭐',
      text: 'Ways to grow:<br>• More <b>runs</b> and <b>lifts</b> = more guests.<br>• <b>📣 Ads</b> bring in new visitors.<br>• <b>🏠 Build</b>: rental shop, ski school, restaurant, snowmaking, spa, hotel…<br>• <b>⏩ Skip season</b> to fast-forward.<br><br>Open <b>❓ Help</b> any time.',
      next: 'Finish tutorial', last: true },
  ],

  init() {
    this.el = document.getElementById('coach');
    setInterval(() => this.tick(), 300);
  },
  restart() { G.tut = { step: 0, on: true }; this.show(); },
  stop() { G.tut.on = false; this.clearTarget(); this.el.classList.remove('show'); },
  cur() { return G && G.tut && G.tut.on ? this.steps[G.tut.step] : null; },
  go(i) {
    G.tut.step = i;
    if (i >= this.steps.length) { this.stop(); return; }
    const s = this.steps[i];
    if (s.enter) s.enter();
    this.show();
  },
  tick() {
    const s = this.cur();
    if (!s) { this.el && this.el.classList.remove('show'); return; }
    if (!this.el.classList.contains('show')) this.show();
    if (s.done && s.done()) {
      this.flash();
      this.go(G.tut.step + 1);
      return;
    }
    const h = this.el.querySelector('.coach-hint');
    if (h && s.hint) h.innerHTML = s.hint();
    this.el.classList.toggle('dim', !!UI.modal && UI.modal !== 'help');
  },
  show() {
    const s = this.cur(); if (!s) return;
    const n = this.steps.length;
    this.el.innerHTML = `<div class="coach-head"><b>${s.title}</b><button class="x" id="tutClose" title="Close tutorial">✕</button></div>
      <div class="coach-text">${s.text}</div><div class="coach-hint"></div>
      <div class="coach-foot"><div class="dots">${this.steps.map((_, k) => `<i class="${k === G.tut.step ? 'on' : k < G.tut.step ? 'done' : ''}"></i>`).join('')}</div>
      <div>${G.tut.step > 0 ? '<button class="btn small" id="tutBack">Back</button> ' : ''}${s.next ? `<button class="btn primary small" id="tutNext">${s.next}</button>` : '<span class="dim waiting">Waiting for you…</span>'}</div></div>`;
    this.el.classList.add('show');
    this.el.querySelector('#tutClose').onclick = () => { this.stop(); World.log('Tutorial closed. Restart it any time from ❓ Help.'); };
    const nx = this.el.querySelector('#tutNext'); if (nx) nx.onclick = () => this.go(G.tut.step + 1);
    const bk = this.el.querySelector('#tutBack'); if (bk) bk.onclick = () => this.go(Math.max(0, G.tut.step - 1));
    this.setTarget(s.target);
  },
  setTarget(sel) {
    this.clearTarget();
    if (!sel) return;
    const t = document.querySelector(sel); if (t) t.classList.add('tut-target');
  },
  clearTarget() { document.querySelectorAll('.tut-target').forEach(e => e.classList.remove('tut-target')); },
  flash() { UI.toast('✅ Nice work!', 'good'); },
  focusBase() { const b = World.basePos(); Render.cam.x = b.x; Render.cam.y = b.y - 500; Render.cam.zoom = 0.5; },
  focusLift() { const l = G.lifts.find(l => l.fromBase); if (l) { Render.cam.x = (l.bottom.x + l.top.x) / 2; Render.cam.y = (l.bottom.y + l.top.y) / 2; Render.cam.zoom = Math.max(0.4, Math.min(0.9, 500 / Math.max(300, l.len))); } },
};
