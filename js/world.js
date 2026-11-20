// ---------- Game state, entities, placement & network ----------
const START_DATE = Date.UTC(2026, 10, 3); // Nov 3
let G = null;

const World = {
  newGame(seed, site, name) {
    site = site || SITES[1];
    G = {
      version: 2, seed, site, name: name || 'Powderline',
      cash: 10000000 - (site.price || 0), loan: 0, autoStaff: true, tut: { step: 0, on: true },
      dayNum: 0, time: 7 * 60 + 30, phase: 'day', speed: 1,
      seasonOpen: false, seasonNum: 1, closedForSeason: false,
      runs: [], lifts: [], buildings: [], groomers: [], sleds: [], dogs: [],
      staff: Object.fromEntries(Object.keys(STAFF).map(k => [k, 0])),
      payRate: 1.0, morale: 72,
      prices: { ticket: 99, pass: 599, parking: 0 },
      awareness: 18, reputation: 55, passHolders: 0,
      campaigns: [], events: [],
      wx: [], stormState: { left: 0, kind: null, intensity: 0 },
      baseDepth: 0, seasonSnow: 0, icy: 0,
      avy: { danger: 1, control: true, closedSteep: false },
      today: null, history: [], log: [], reviews: [],
      season: { revenue: 0, expense: 0, visitors: 0, incidents: 0, rescues: 0 },
      incidentsActive: [], avalanches: [],
      tutorialDone: false,
    };
    Terrain.generate(seed, site);
    Weather.ensure();
    G.basePoint = { x: MAP_W * CELL * 0.5, y: MAP_H * CELL * 0.955 };
    G.baseDepth = 45; G.seasonSnow = 70;
    this.buildStarterVillage(site.starter);
    Sim.startDay(true);
  },

  // Free starter base area so new players can go straight to lifts & runs
  // Ground-up start: only your office. (full=true gives the old ready-made village.)
  buildStarterVillage(full) {
    const b = G.basePoint;
    const plan = full ? [['office', 0, 60], ['ticket', -70, -10], ['lodge', 40, -10], ['parking', -175, 0], ['rental', -70, 32], ['patrolhq', 110, 25], ['garage', 195, 0]] : [['office', 0, 20]];
    for (const [kind, dx, dy] of plan) {
      let placed = false;
      for (let tries = 0; tries < 40 && !placed; tries++) {
        const p = { x: b.x + dx + (tries ? (Math.random() - 0.5) * 60 : 0), y: b.y + dy + (tries ? (Math.random() - 0.5) * 40 : 0) };
        const v = this.validateBuilding(kind, p);
        if (!v.ok) continue;
        Terrain.clearTrees(v.cells);
        G.buildings.push({ id: U.uid(), type: 'building', kind, x: p.x, y: p.y, level: 1, buildDays: 0, status: 'open' });
        placed = true;
      }
    }
    if (full) { G.groomers.push({ id: U.uid(), kind: 'std', name: 'Cat 1', hours: 0, condition: 1 }); G.sleds.push({ id: U.uid(), kind: 'patrol' }); }
    this.rebuildNetwork();
    this.autoStaff();
  },
  autoStaff() {
    if (!G.autoStaff) return;
    const n = this.staffNeeds(); for (const k in n) G.staff[k] = n[k];
  },
  date(d = G.dayNum) { return new Date(START_DATE + d * 86400000); },
  dateStr(d = G.dayNum) {
    const dt = this.date(d);
    return `${DOW[dt.getUTCDay()]} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}, Yr ${G.seasonNum}`;
  },
  inSeasonWindow(d = G.dayNum) {
    const dt = this.date(d); const m = dt.getUTCMonth(), dd = dt.getUTCDate();
    if (m === 10) return dd >= 1; // Nov 1+
    if (m === 11 || m === 0 || m === 1 || m === 2) return true;
    if (m === 3) return dd <= 19;
    return false;
  },

  log(msg, type = 'info') {
    G.log.unshift({ t: this.dateStr() + ' ' + Sim.clockStr(), msg, type });
    if (G.log.length > 200) G.log.pop();
    UI && UI.onLog && UI.onLog(msg, type);
  },

  spend(amount, cat, label) {
    G.cash -= amount;
    if (G.today) { G.today.exp[cat] = (G.today.exp[cat] || 0) + amount; }
    G.season.expense += amount;
  },
  earn(amount, cat) {
    G.cash += amount;
    if (G.today) { G.today.rev[cat] = (G.today.rev[cat] || 0) + amount; }
    G.season.revenue += amount;
  },

  // ----- Runs -----
  analyzeRun(points, width) {
    // resample polyline every 6 m
    const samples = [];
    let len = 0;
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k], b = points[k + 1]; const d = U.dist(a, b);
      const n = Math.max(1, Math.ceil(d / 6));
      for (let j = 0; j < n; j++) {
        const t = j / n; const p = { x: U.lerp(a.x, b.x, t), y: U.lerp(a.y, b.y, t) };
        p.h = Terrain.heightAt(p.x, p.y); p.s = len + d * t; samples.push(p);
      }
      len += d;
    }
    const last = points[points.length - 1];
    samples.push({ x: last.x, y: last.y, h: Terrain.heightAt(last.x, last.y), s: len });
    // sustained pitch over 30 m windows
    let maxPitch = 0, uphill = 0;
    for (let i = 0; i < samples.length; i++) {
      let j = i; while (j < samples.length - 1 && samples[j].s - samples[i].s < 45) j++;
      const ds = samples[j].s - samples[i].s; if (ds < 20) continue;
      const pitch = (samples[i].h - samples[j].h) / ds * 100;
      if (pitch > maxPitch) maxPitch = pitch;
      if (pitch < -6) uphill = Math.max(uphill, -pitch);
    }
    const vert = samples[0].h - samples[samples.length - 1].h;
    const cells = Terrain.cellsAlong(points, width / 2);
    let rockN = 0, maxCell = 0;
    for (const i of cells) { if (Terrain.rock[i]) rockN++; maxCell = Math.max(maxCell, Terrain.slope[i]); }
    const rock = rockN > cells.length * 0.08;
    let diff = 'green';
    if (maxPitch > 25) diff = 'blue';
    if (maxPitch > 40) diff = 'black';
    if (maxPitch > 60 || rock) diff = 'dblack';
    return { samples, len, vert, maxPitch, avgPitch: len ? vert / len * 100 : 0, uphill, cells, rock, diff, maxCell };
  },
  runCost(info, width) {
    const trees = Terrain.treeCost(info.cells.filter(i => !Terrain.runMask[i]));
    const grading = info.len * (25 + width * 0.9);
    return { trees, grading, total: Math.round(trees + grading) };
  },
  validateRun(points, width) {
    if (points.length < 2) return { ok: false, err: 'Click at least 2 points (top → bottom).' };
    const info = this.analyzeRun(points, width);
    if (info.len < 120) return { ok: false, err: 'Run is too short (min 120 m).', info };
    if (info.vert < 10) return { ok: false, err: 'Runs must drop at least 10 m. Draw from top to bottom.', info };
    if (info.uphill > 8) return { ok: false, err: 'Part of this run goes uphill — skiers can\'t climb.', info };
    if (info.cells.some(i => Terrain.water[i] === 2)) return { ok: false, err: 'Runs can\'t cross the pond.', info };
    const cost = this.runCost(info, width);
    return { ok: true, info, cost };
  },
  createRun(points, width, name) {
    const v = this.validateRun(points, width);
    if (!v.ok) return v;
    if (G.cash < v.cost.total) return { ok: false, err: 'Not enough cash.' };
    this.spend(v.cost.total, 'construction');
    const info = v.info;
    const run = {
      id: U.uid(), type: 'run', name: name || genRunName(), points: points.map(p => ({ x: p.x, y: p.y })), width,
      len: info.len, vert: info.vert, maxPitch: info.maxPitch, avgPitch: info.avgPitch,
      diff: info.diff, autoDiff: info.diff, cells: info.cells, open: true, groomPlan: 'nightly',
      snowmaking: false, smOn: true, smDepth: 0, park: null, condition: 0.5, buildDays: 0,
      avyClosed: false,
    };
    run.samples = info.samples.map(s => ({ x: s.x, y: s.y, h: s.h, s: s.s }));
    // per-cell corduroy direction (along the run)
    run.cellDir = info.cells.map(i => {
      const c = { x: (i % MAP_W + 0.5) * CELL, y: ((i / MAP_W | 0) + 0.5) * CELL };
      let best = 0, bd = 1e9;
      for (let k = 0; k < run.points.length - 1; k++) { const r = U.segDist(c, run.points[k], run.points[k + 1]); if (r.d < bd) { bd = r.d; best = k; } }
      const a = run.points[best], b = run.points[best + 1];
      return Math.atan2(b.y - a.y, b.x - a.x);
    });
    Terrain.clearTrees(info.cells);
    for (let k = 0; k < info.cells.length; k++) {
      const i = info.cells[k];
      Terrain.runMask[i]++;
      Terrain.groom[i] = 0.5; Terrain.gdir[i] = run.cellDir[k]; Terrain.markSurf(i);
    }
    run.avgElev = info.samples.reduce((a, s) => a + s.h, 0) / info.samples.length;
    G.runs.push(run);
    this.rebuildNetwork();
    this.log(`New trail cut: ${DIFF[run.diff].icon} ${run.name} (${Math.round(run.len)} m, ${Math.round(run.vert)} m vert) for ${U.money(v.cost.total)}`, 'build');
    return { ok: true, run };
  },
  removeRun(run) {
    for (const i of run.cells) { Terrain.runMask[i] = Math.max(0, Terrain.runMask[i] - 1); Terrain.markSurf(i); }
    G.runs = G.runs.filter(r => r !== run);
    this.rebuildNetwork();
  },

  // ----- Lifts -----
  validateLift(type, a, b) {
    const T = LIFTS[type];
    const ha = Terrain.heightAt(a.x, a.y), hb = Terrain.heightAt(b.x, b.y);
    const len = U.dist(a, b), vert = hb - ha;
    if (len < 40) return { ok: false, err: 'Too short.' };
    if (len > T.maxLen) return { ok: false, err: `Max length for ${T.name} is ${T.maxLen} m (this is ${Math.round(len)} m).` };
    if (vert > T.maxVert) return { ok: false, err: `Max vertical is ${T.maxVert} m (this is ${Math.round(vert)} m).` };
    if (vert < (type === 'carpet' ? -2 : 10)) return { ok: false, err: 'The top terminal must be uphill of the bottom terminal.' };
    if (T.cat === 'Surface') {
      // surface lifts need a skiable grade along the line
      let steep = 0; for (let t = 0; t <= 1; t += 0.05) steep = Math.max(steep, Terrain.slopeAt(U.lerp(a.x, b.x, t), U.lerp(a.y, b.y, t)));
      if (type === 'carpet' && vert / len > 0.2) return { ok: false, err: 'Magic carpets only work on gentle beginner slopes (<20%).' };
      if (steep > 75) return { ok: false, err: 'Too steep for a surface lift. Use a chairlift.' };
    }
    const corridor = Terrain.cellsAlong([a, b], T.cat === 'Surface' ? 5 : 8);
    const trees = Terrain.treeCost(corridor);
    const cost = Math.round(T.base + T.perM * len + trees);
    return { ok: true, len, vert, cost, trees, corridor, rideTime: len / T.speed };
  },
  createLift(type, a, b) {
    const v = this.validateLift(type, a, b);
    if (!v.ok) return v;
    if (G.cash < v.cost) return { ok: false, err: 'Not enough cash.' };
    this.spend(v.cost, 'construction');
    const T = LIFTS[type];
    const lift = {
      id: U.uid(), type: 'lift', kind: type, name: U.pick(NAMES.lift) + ' ' + (T.cat === 'Gondola' ? 'Gondola' : T.cat === 'Tram' ? 'Tram' : T.cat === 'Surface' ? (type === 'carpet' ? 'Carpet' : type === 'tbar' ? 'T-Bar' : 'Tow') : (T.cap >= 2400 && T.speed > 4 ? 'Express' : 'Chair')),
      bottom: { x: a.x, y: a.y }, top: { x: b.x, y: b.y }, len: v.len, vert: v.vert, cost: v.cost,
      buildDays: T.days, open: true, status: 'building', broken: 0, condition: 1, age: 0, wait: 0, util: 0,
      ridesToday: 0, holdFrac: 0,
    };
    Terrain.clearTrees(v.corridor);
    // towers every ~110m
    lift.towers = [];
    const nT = Math.max(1, Math.floor(v.len / (T.cat === 'Surface' ? 70 : 110)));
    for (let k = 1; k < nT; k++) lift.towers.push(k / nT);
    G.lifts.push(lift);
    this.rebuildNetwork();
    this.log(`Construction started: ${T.name} "${lift.name}" — ${Math.round(v.len)} m, ${Math.round(v.vert)} m vertical. Ready in ${T.days} day(s).`, 'build');
    return { ok: true, lift };
  },
  removeLift(l) { G.lifts = G.lifts.filter(x => x !== l); this.rebuildNetwork(); },

  // ----- Buildings -----
  validateBuilding(type, p) {
    const B = BUILDINGS[type];
    const r = B.r;
    if (p.x < r || p.y < r || p.x > MAP_W * CELL - r || p.y > MAP_H * CELL - r) return { ok: false, err: 'Out of bounds.' };
    const cells = Terrain.cellsInCircle(p.x, p.y, r);
    let maxS = 0; for (const i of cells) { maxS = Math.max(maxS, Terrain.slope[i]); if (Terrain.runMask[i]) return { ok: false, err: 'Can\'t build on a ski run.' }; if (Terrain.water[i] === 2) return { ok: false, err: 'Can\'t build on the pond.' }; }
    const limit = (type === 'patrolhut' || type === 'restroom' || type === 'waffle') ? 55 : type === 'restaurant' ? 40 : type === 'tubing' ? 45 : 30;
    if (maxS > limit) return { ok: false, err: `Ground too steep (${Math.round(maxS)}%). Needs < ${limit}%.` };
    for (const o of G.buildings) if (U.dist(o, p) < BUILDINGS[o.kind].r + r + 4) return { ok: false, err: 'Overlaps another building.' };
    for (const l of G.lifts) if (U.segDist(p, l.bottom, l.top).d < r + 6) return { ok: false, err: 'Too close to a lift line.' };
    const trees = Terrain.treeCost(cells);
    return { ok: true, cost: Math.round(B.levels[0].cost + trees), cells };
  },
  createBuilding(type, p) {
    const v = this.validateBuilding(type, p);
    if (!v.ok) return v;
    if (G.cash < v.cost) return { ok: false, err: 'Not enough cash.' };
    this.spend(v.cost, 'construction');
    Terrain.clearTrees(v.cells);
    const B = BUILDINGS[type];
    const b = { id: U.uid(), type: 'building', kind: type, x: p.x, y: p.y, level: 1, buildDays: B.levels[0].days, status: 'building' };
    G.buildings.push(b);
    this.rebuildNetwork();
    this.log(`Construction started: ${B.name}. Ready in ${B.levels[0].days} day(s).`, 'build');
    return { ok: true, b };
  },
  upgradeBuilding(b) {
    const B = BUILDINGS[b.kind]; const next = B.levels[b.level];
    if (!next) return { ok: false, err: 'Max level.' };
    if (b.buildDays > 0) return { ok: false, err: 'Still under construction.' };
    if (G.cash < next.cost) return { ok: false, err: 'Not enough cash.' };
    this.spend(next.cost, 'construction');
    b.level++; b.buildDays = next.days; b.status = 'building';
    this.log(`Upgrading ${B.name} to level ${b.level} (${next.days} days).`, 'build');
    return { ok: true };
  },
  // buildings keep working at their old level while an upgrade is under construction
  bstat(b, key) { const lv = b.buildDays > 0 ? b.level - 1 : b.level; return lv >= 1 ? (BUILDINGS[b.kind].levels[lv - 1][key] || 0) : 0; },
  built(kind) { return G.buildings.filter(b => b.kind === kind && (b.buildDays <= 0 || b.level > 1)); },
  sumStat(kind, key) { return this.built(kind).reduce((a, b) => a + this.bstat(b, key), 0); },

  // ----- Network (connectivity graph) -----
  basePos() {
    const l = this.built('lodge')[0] || G.buildings.find(b => b.kind === 'lodge') || this.built('ticket')[0] || G.buildings.find(b => b.kind === 'ticket');
    return l ? { x: l.x, y: l.y } : G.basePoint;
  },
  rebuildNetwork() {
    const base = this.basePos();
    const LINK = 90, BASE_LINK = 320;
    for (const r of G.runs) {
      r.branches = []; r.endLifts = []; r.endsAtBase = false;
      const end = r.points[r.points.length - 1];
      for (const l of G.lifts) if (U.dist(end, l.bottom) < LINK) r.endLifts.push(l.id);
      r.endsAtBase = U.dist(end, base) < BASE_LINK;
    }
    for (const a of G.runs) for (const b of G.runs) {
      if (a === b) continue;
      const bs = b.points[0];
      // b starts somewhere along a  → branch
      for (let i = 0; i < a.samples.length - 3; i += 2) {
        const p = a.samples[i];
        if (Math.hypot(p.x - bs.x, p.y - bs.y) < 45 && p.h >= b.samples[0].h - 8) { a.branches.push({ i, run: b.id, j: 0 }); break; }
      }
      // a ends somewhere along b → merge
      const ae = a.samples[a.samples.length - 1];
      let best = -1, bd = 70;
      for (let j = 0; j < b.samples.length - 3; j++) {
        const q = b.samples[j]; const d = Math.hypot(q.x - ae.x, q.y - ae.y);
        if (d < bd && q.h <= ae.h + 8) { bd = d; best = j; }
      }
      if (best >= 0) a.branches.push({ i: a.samples.length - 1, run: b.id, j: best, merge: true });
    }
    for (const l of G.lifts) {
      l.topRuns = G.runs.filter(r => U.dist(r.points[0], l.top) < LINK).map(r => r.id);
      // runs passing close to the top terminal (ski off mid-run)
      for (const r of G.runs) {
        if (l.topRuns.includes(r.id)) continue;
        for (let i = 0; i < r.samples.length - 3; i += 2) if (Math.hypot(r.samples[i].x - l.top.x, r.samples[i].y - l.top.y) < 40) { l.topRuns.push(r.id); l.topJoin = l.topJoin || {}; l.topJoin[r.id] = i; break; }
      }
      l.fromBase = U.dist(l.bottom, base) < BASE_LINK;
    }
    // reachability BFS
    const runById = Object.fromEntries(G.runs.map(r => [r.id, r]));
    const liftById = Object.fromEntries(G.lifts.map(l => [l.id, l]));
    G.runs.forEach(r => r.reachable = false); G.lifts.forEach(l => l.reachable = false);
    const q = G.lifts.filter(l => l.fromBase);
    q.forEach(l => l.reachable = true);
    while (q.length) {
      const n = q.shift();
      if (n.type === 'lift') {
        for (const id of n.topRuns) { const r = runById[id]; if (r && !r.reachable) { r.reachable = true; q.push(r); } }
      } else {
        for (const br of n.branches) { const r = runById[br.run]; if (r && !r.reachable) { r.reachable = true; q.push(r); } }
        for (const id of n.endLifts) { const l = liftById[id]; if (l && !l.reachable) { l.reachable = true; q.push(l); } }
      }
    }
    // dead-end detection & easiest-way-down for each run (memoized)
    const memo = {};
    const easiest = (r, depth) => {
      if (memo[r.id] !== undefined) return memo[r.id];
      if (depth > 8) return 9;
      memo[r.id] = 9;
      const di = DIFF_ORDER.indexOf(r.diff);
      let best = 9;
      if (r.endLifts.length || r.endsAtBase) best = di;
      for (const br of r.branches) { const o = runById[br.run]; if (o) best = Math.min(best, Math.max(di, easiest(o, depth + 1))); }
      memo[r.id] = best; return best;
    };
    for (const r of G.runs) { r.deadEnd = !(r.endLifts.length || r.endsAtBase || r.branches.some(b => b.merge)); }
    for (const r of G.runs) r.routeDiff = easiest(r, 0);
    for (const l of G.lifts) {
      let m = 9; for (const id of l.topRuns) { const r = runById[id]; if (r) m = Math.min(m, r.routeDiff); }
      l.minDiff = m; // 9 = no way down
    }
    G._runById = runById; G._liftById = liftById;
  },
  runById(id) { return G._runById ? G._runById[id] : G.runs.find(r => r.id === id); },
  liftById(id) { return G._liftById ? G._liftById[id] : G.lifts.find(l => l.id === id); },

  // ----- Staff requirements -----
  staffNeeds() {
    const lifts = G.lifts.filter(l => l.buildDays <= 0);
    const runKm = G.runs.reduce((a, r) => a + r.len, 0) / 1000;
    const vis = G.history.length ? G.history[G.history.length - 1].visitors : 600;
    const smKm = G.runs.filter(r => r.snowmaking).reduce((a, r) => a + r.len * SNOWGUNS[(r.smTier || 1) - 1].crew, 0) / 1000;
    const seats = this.sumStat('lodge', 'seats') + this.sumStat('restaurant', 'seats');
    const vehicles = G.groomers.length + G.sleds.length;
    const parks = G.runs.filter(r => r.park).length;
    return {
      liftop: lifts.reduce((a, l) => a + LIFTS[l.kind].ops, 0),
      patrol: G.runs.length ? Math.ceil(3 + runKm * 1.1 + vis / 800) : 0,
      groomer: G.groomers.length,
      snowmaker: this.built('pumphouse').length ? Math.ceil(smKm / 1.5) : 0,
      instructor: Math.ceil(this.sumStat('school', 'students') / 6),
      rental: this.sumStat('rental', 'staff'),
      food: Math.ceil(seats / 30),
      mechanic: Math.ceil(lifts.length * 0.6 + vehicles / 5),
      park: parks * 3,
      guest: this.sumStat('ticket', 'staff'),
      handler: G.dogs.length,
    };
  },
  staffFactor(role) {
    const need = this.staffNeeds()[role];
    if (!need) return 1;
    return U.clamp(G.staff[role] / need, 0, 1.2);
  },
  vehicleBays() { return this.sumStat('garage', 'bays'); },
};
