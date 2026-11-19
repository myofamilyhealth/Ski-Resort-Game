// ---------- Simulation: days, nights, economy, guests, patrol ----------
const DAY_START = 7 * 60 + 30, LIFTS_OPEN = 9 * 60, LIFTS_CLOSE = 16 * 60, DAY_END = 16 * 60 + 30;

const Sim = {
  clockStr(t = G ? G.time : 0) {
    t = ((t % 1440) + 1440) % 1440;
    const h = Math.floor(t / 60), m = Math.floor(t % 60);
    const ap = h >= 12 ? 'PM' : 'AM'; const hh = h % 12 || 12;
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
  },
  operating() { return G.seasonOpen && World.inSeasonWindow(); },
  isHoliday(dt) {
    const m = dt.getUTCMonth(), d = dt.getUTCDate();
    if ((m === 11 && d >= 20) || (m === 0 && d <= 3)) return 1.9;
    if (m === 10 && d >= 26 && d <= 29) return 1.4; // Thanksgiving
    if (m === 0 && d >= 15 && d <= 20) return 1.25; // MLK
    if (m === 1 && d >= 14 && d <= 22) return 1.45; // Presidents week
    if (m === 2 && d >= 7 && d <= 28) return 1.2;  // spring break
    return 1;
  },

  // ---------- Terrain stats ----------
  runDepth(r) {
    const f = 0.75 + 0.5 * (r.avgElev - Terrain.minE) / (Terrain.maxE - Terrain.minE);
    return Math.round(G.baseDepth * f + r.smDepth);
  },
  runIsOpen(r) {
    return r.open && r.reachable && !r.avyClosed && this.runDepth(r) >= 30 && r.buildDays <= 0;
  },
  liftIsOpen(l) { return l.open && l.buildDays <= 0 && !l.broken && l.holdFrac < 1; },
  runCondition(r) {
    let g = 0, p = 0;
    for (const i of r.cells) { g += Terrain.groom[i]; p += Terrain.powder[i]; }
    r.condition = g / r.cells.length; r.powderAvg = p / r.cells.length;
    return r.condition;
  },
  surfaceLabel(r) {
    this.runCondition(r);
    const d = this.runDepth(r);
    if (d < 30) return 'Closed — thin cover';
    if (r.powderAvg > 12) return 'Deep powder';
    if (r.powderAvg > 4) return r.condition > 0.6 ? 'Packed powder' : 'Chopped powder';
    if (G.icy > 0.5 && r.condition < 0.7) return 'Icy / firm';
    if (r.condition > 0.85) return 'Fresh corduroy';
    if (r.condition > 0.6) return 'Groomed';
    if (r.condition > 0.4) return 'Packed / skied';
    return r.diff === 'black' || r.diff === 'dblack' ? 'Moguls' : 'Skied-off / bumpy';
  },
  openKmBy() {
    const km = { green: 0, blue: 0, black: 0, dblack: 0 };
    for (const r of G.runs) if (this.runIsOpen(r)) km[r.diff] += r.len / 1000;
    return km;
  },

  // ---------- Day start ----------
  startDay(first = false) {
    G.phase = 'day'; G.time = DAY_START;
    World.autoStaff();
    const w = Weather.today();
    const dt = World.date();
    G.today = { dayNum: G.dayNum, rev: {}, exp: {}, visitors: 0, arrived: 0, ticketBuyers: 0, pass: 0, turned: 0, incidents: [], wait: 0, events: [] };
    // morning: overnight snow on terrain
    if (w.snowNight > 0 && !first) this.addSnow(w.snowNight);
    // lifts: wind holds & build status
    for (const l of G.lifts) {
      const T = LIFTS[l.kind];
      l.holdFrac = l.buildDays > 0 ? 0 : U.clamp((w.gust - T.wind) / 8, 0, 1);
      if (l.holdFrac > 0 && l.buildDays <= 0) World.log(`${l.name}: ${l.holdFrac >= 1 ? 'on WIND HOLD all day' : 'wind holds expected'} (gusts ${w.gust} m/s, limit ${T.wind} m/s).`, 'warn');
      l.ridesToday = 0;
    }
    this.avalancheMorning(w);
    G.events = G.events.filter(e => e.day >= G.dayNum);
    World.rebuildNetwork();
    if (this.operating()) {
      this.computeVisitors(w, dt);
      this.scheduleIncidents();
      // event scheduled today
      for (const ev of G.events) if (ev.day === G.dayNum) { G.today.events.push(ev.key); World.log(`🎉 Today: ${EVENTS[ev.key].name}!`, 'good'); }
      World.log(`${Weather.icon(w)} ${Weather.label(w)} ${w.tHi}°C. ${w.snowNight ? w.snowNight + ' cm overnight! ' : ''}${G.today.visitors ? 'Expecting ~' + G.today.visitors.toLocaleString() + ' guests.' : 'Resort can\'t operate today: ' + (G.today.closedReason || 'no open terrain') + '.'}`, w.snowNight >= 10 ? 'good' : G.today.visitors ? 'info' : 'warn');
    } else if (G.seasonOpen && !World.inSeasonWindow()) {
      // past closing day
    }
    if (typeof Agents !== 'undefined') Agents.reset();
  },

  addSnow(cm) {
    const span = Terrain.maxE - Terrain.minE;
    for (const r of G.runs) for (const i of r.cells) {
      const f = 0.7 + 0.6 * (Terrain.elev[i] - Terrain.minE) / span;
      Terrain.powder[i] = Math.min(120, Terrain.powder[i] + cm * f);
      Terrain.markSurf(i);
    }
    G.baseDepth += cm * 0.5;
    G.seasonSnow += cm;
    G.icy = Math.max(0, G.icy - cm / 10);
  },

  avalancheMorning(w) {
    // danger from 72h snow + wind + warming
    const recent = (G.recentSnow || [0, 0, 0]);
    const s72 = recent.reduce((a, b) => a + b, 0) + w.snowNight;
    let danger = 1 + s72 / 22 + (w.wind > 12 ? 0.7 : 0) + (w.tHi > 3 && s72 > 10 ? 0.8 : 0);
    danger = U.clamp(Math.round(danger), 1, 5);
    G.avy.danger = danger;
    const steep = G.runs.filter(r => r.maxPitch > 38);
    steep.forEach(r => r.avyClosed = false);
    G.avy.controlled = true;
    if (danger >= 3 && steep.length && this.operating()) {
      const patrolOk = G.staff.patrol >= 4 && World.built('patrolhq').length > 0;
      if (G.avy.control && patrolOk) {
        const shots = Math.ceil(steep.length * (danger - 1.5));
        World.spend(shots * 450, 'patrol');
        // control work delays opening of steep terrain; small chance it doesn't stabilize
        if (danger >= 5 && Math.random() < 0.5) { steep.forEach(r => r.avyClosed = true); World.log(`⚠️ Avalanche danger EXTREME (5). Patrol fired ${shots} shots but steep terrain stays closed today.`, 'warn'); }
        else World.log(`💥 Avalanche control: patrol threw ${shots} shots (${U.money(shots * 450)}). Danger ${danger}/5 — steep runs opening after control.`, 'info');
      } else if (G.avy.openAnyway) {
        G.avy.controlled = false;
        World.log(`⚠️ Avalanche danger ${danger}/5 and NO control work done. Steep terrain is open at your risk!`, 'bad');
      } else {
        steep.forEach(r => r.avyClosed = true);
        World.log(`⚠️ Avalanche danger ${danger}/5. Steep terrain closed — need ≥4 patrollers + Patrol HQ for control work.`, 'warn');
      }
    }
  },

  computeVisitors(w, dt) {
    const T = G.today;
    const km = this.openKmBy(); const openKm = km.green + km.blue + km.black + km.dblack;
    const openLifts = G.lifts.filter(l => this.liftIsOpen(l) && l.reachable);
    if (!openLifts.length || openKm <= 0 || !World.built('ticket').length) {
      T.visitors = 0;
      const holds = G.lifts.some(l => l.buildDays <= 0 && l.holdFrac >= 1);
      T.closedReason = !World.built('ticket').length ? 'no finished Ticket Office' : !G.lifts.some(l => l.buildDays <= 0) ? 'no finished lifts' : holds ? 'lifts on wind hold' : G.runs.some(r => r.avyClosed) ? 'avalanche closures' : G.runs.every(r => this.runDepth(r) < 30) ? 'not enough snow (30 cm needed)' : 'no lift-served open runs';
      return;
    }
    const market = 250 + G.awareness * 75;
    let quality = 0; for (const l of openLifts) quality += LIFTS[l.kind].cat === 'Detachable' || LIFTS[l.kind].cat === 'Gondola' || LIFTS[l.kind].cat === 'Tram' ? 1.6 : 1;
    const appeal = U.clamp(0.3 + 0.1 * openKm + 0.05 * quality + (km.green > 0 && km.blue > 0 ? 0.1 : 0) + (km.black + km.dblack > 0 ? 0.1 : 0), 0.3, 2.0);
    const repF = 0.5 + G.reputation / 100;
    let snowF = G.baseDepth < 30 ? 0.55 : G.baseDepth < 60 ? 0.85 : 1.0;
    if (w.snowNight >= 10) snowF *= 1.25 + Math.min(0.5, w.snowNight / 80);
    let wxF = 1;
    if (w.type === 'bluebird') wxF = 1.15; else if (w.type === 'rain') wxF = 0.55; else if (w.type === 'cold') wxF = 0.7;
    else if (w.type === 'heavy') wxF = 0.85; else if (w.wind > 18) wxF = 0.85;
    const dow = [1.3, 0.75, 0.7, 0.72, 0.8, 1.1, 1.6][dt.getUTCDay()];
    const hol = this.isHoliday(dt);
    const refPrice = Math.min(229, 50 + openKm * 4.5 + G.reputation * 0.5 + quality * 3);
    const priceF = U.clamp(Math.pow(refPrice / G.prices.ticket, 1.35), 0.2, 1.6);
    let mkt = 1;
    for (const c of G.campaigns) if (CAMPAIGNS[c.key].powder && w.snowNight >= 8) mkt += 0.35;
    for (const ev of G.events) if (ev.day === G.dayNum) mkt += EVENTS[ev.key].visitors;
    let buyers = market * appeal * repF * snowF * wxF * dow * hol * priceF * mkt * (0.9 + Math.random() * 0.2) * 0.55;
    let pass = G.passHolders * 0.085 * dow * snowF * Math.min(1.3, wxF + 0.1);
    // guests won't come if the lifts are obviously overloaded (keeps lines reasonable for small resorts)
    const liftCap = openLifts.reduce((a, l) => a + LIFTS[l.kind].cap * (1 - l.holdFrac), 0) * 0.65;
    if (buyers + pass > liftCap) { const f = liftCap / (buyers + pass); buyers *= f; pass *= f; }
    // hotel guests
    const rooms = World.sumStat('hotel', 'rooms') + World.sumStat('condo', 'rooms');
    const occ = rooms ? U.clamp((buyers + pass) / (rooms * 9), 0.25, 1) : 0;
    const hotelGuests = Math.round(rooms * occ * 2.1);
    T.occupancy = occ; T.rooms = rooms;
    // capacity limits
    const ticketCap = World.sumStat('ticket', 'cap') * U.clamp(World.staffFactor('guest'), 0.3, 1);
    let turned = 0;
    if (buyers > ticketCap) { turned += buyers - ticketCap; buyers = ticketCap; }
    const parkCap = World.sumStat('parking', 'cars') * 2.4 + World.sumStat('shuttle', 'riders');
    const driving = buyers + pass;
    if (driving > parkCap) {
      const over = driving - parkCap; const f = parkCap / driving;
      turned += over; buyers *= f; pass *= f;
    }
    buyers = Math.round(buyers); pass = Math.round(pass);
    T.ticketBuyers = buyers + hotelGuests; T.pass = pass; T.turned = Math.round(turned);
    T.visitors = T.ticketBuyers + pass;
    T.priceF = priceF; T.refPrice = refPrice;
    if (T.turned > 50) World.log(`🚗 ${T.turned.toLocaleString()} guests turned away (parking/ticket windows full).`, 'warn');
  },

  arrivedFrac(t) {
    if (t < 8 * 60) return 0;
    const a = U.clamp((t - 8 * 60) / 210, 0, 1);
    return a * a * (3 - 2 * a);
  },
  departedFrac(t) {
    const a = U.clamp((t - 14 * 60) / 150, 0, 1);
    return a * a * (3 - 2 * a);
  },
  onHill(t = G.time) { return G.today ? Math.max(0, G.today.visitors * (this.arrivedFrac(t) - this.departedFrac(t)) * 0.9) : 0; },

  // ---------- Lift demand model ----------
  liftDemand() {
    const open = G.lifts.filter(l => this.liftIsOpen(l) && l.reachable && l.minDiff < 9);
    const onHill = this.onHill();
    let wsum = 0;
    for (const l of open) {
      let w = 0;
      for (const sk of SKILLS) {
        const ok = l.topRuns.map(id => World.runById(id)).filter(r => r && this.runIsOpen(r) && sk.allowed.includes(r.diff)).length;
        if (DIFF_ORDER[l.minDiff] && sk.allowed.includes(DIFF_ORDER[l.minDiff])) w += sk.share * (ok + 0.3);
      }
      w *= 0.6 + Math.min(l.vert, 600) / 600;
      if (l.fromBase) w *= 1.15;
      l._w = w; wsum += w;
    }
    const staffF = U.clamp(World.staffFactor('liftop'), 0.2, 1) * (0.85 + World.staffFactor('mechanic') * 0.15);
    let totWait = 0, totDem = 0;
    for (const l of G.lifts) { l.util = 0; if (!open.includes(l)) l.wait = 0; }
    for (const l of open) {
      const T = LIFTS[l.kind];
      const share = wsum ? l._w / wsum : 0;
      const skiers = onHill * share;
      const cycle = l.len / T.speed / 60 + 5 + l.vert / 140 + (l.wait || 0);
      const demand = skiers * 60 / cycle;   // rides per hour wanted
      const cap = T.cap * staffF * (1 - l.holdFrac);
      const rho = cap > 0 ? demand / cap : 3;
      l.util = Math.min(rho, 3);
      let wait = rho <= 0.6 ? 1 + rho * 2.5 : 2.5 + 32 * Math.pow(rho - 0.6, 1.4);
      l.wait = U.clamp(U.lerp(l.wait || 0, wait, 0.3), 0, 45);
      l.ridesPerHour = Math.min(demand, cap);
      totWait += l.wait * demand; totDem += demand;
    }
    G.avgWait = totDem ? totWait / totDem : 0;
    return open;
  },

  // ---------- Per-minute day tick ----------
  tickDay(dtMin) {
    const prev = G.time; G.time += dtMin;
    if (!this.operating() || !G.today.visitors) {
      if (G.time >= DAY_END) this.endDay();
      return;
    }
    const T = G.today;
    // ticket sales as guests arrive
    const arr = this.arrivedFrac(G.time) - this.arrivedFrac(prev);
    if (arr > 0) {
      const n = T.ticketBuyers * arr;
      World.earn(n * G.prices.ticket * 0.92, 'tickets');
      if (G.prices.parking > 0) World.earn((T.visitors * arr / 2.4) * G.prices.parking, 'parking');
      T.arrived += T.visitors * arr;
    }
    // lift wait model every 5 min
    G._liftAcc = (G._liftAcc || 0) + dtMin;
    if (G._liftAcc >= 5 && G.time >= LIFTS_OPEN && G.time <= LIFTS_CLOSE) {
      const open = this.liftDemand();
      for (const l of open) l.ridesToday += l.ridesPerHour * G._liftAcc / 60;
      T.waitSamples = (T.waitSamples || 0) + 1; T.waitSum = (T.waitSum || 0) + G.avgWait;
      this.wearRuns(G._liftAcc, open);
      G._liftAcc = 0;
    }
    // daytime snowfall adds powder gradually
    const w = Weather.today();
    if (w.snowDay > 0) {
      G._snowAcc = (G._snowAcc || 0) + w.snowDay * dtMin / (DAY_END - DAY_START);
      if (G._snowAcc >= 1) { this.addSnow(G._snowAcc); G._snowAcc = 0; }
    }
    this.processIncidents();
    this.liftBreakdowns(dtMin);
    if (G.time >= DAY_END) this.endDay();
  },

  wearRuns(mins, openLifts) {
    // distribute lift rides to runs at the top
    const passes = new Map();
    for (const l of openLifts) {
      const runs = l.topRuns.map(id => World.runById(id)).filter(r => r && this.runIsOpen(r));
      if (!runs.length) continue;
      const rides = l.ridesPerHour * mins / 60;
      for (const r of runs) {
        // skill share that will ski this run
        const sh = SKILLS.reduce((a, s) => a + (s.allowed.includes(r.diff) ? s.share : 0), 0);
        passes.set(r, (passes.get(r) || 0) + rides * sh / runs.length);
      }
    }
    // flow down via merges
    for (const [r, p] of [...passes]) for (const br of r.branches) if (br.merge) { const o = World.runById(br.run); if (o) passes.set(o, (passes.get(o) || 0) + p * 0.8); }
    for (const [r, p] of passes) {
      r.passesToday = (r.passesToday || 0) + p;
      const widthCells = Math.max(1, r.width / CELL);
      const perCell = p / widthCells;
      const steep = r.diff === 'black' || r.diff === 'dblack' ? 1.6 : r.diff === 'blue' ? 1.15 : 1;
      const dg = perCell * 0.0011 * steep;
      const pk = 1 - Math.pow(0.988, perCell);
      for (const i of r.cells) {
        const g0 = Terrain.groom[i], p0 = Terrain.powder[i];
        Terrain.groom[i] = Math.max(0.05, g0 - dg * (0.6 + Math.random() * 0.8));
        if (p0 > 0) Terrain.powder[i] = Math.max(0, p0 - p0 * pk - 0.05 * perCell);
        if ((g0 > 0.7) !== (Terrain.groom[i] > 0.7) || (g0 > 0.4) !== (Terrain.groom[i] > 0.4) || (g0 > 0.15) !== (Terrain.groom[i] > 0.15) || (p0 > 4) !== (Terrain.powder[i] > 4) || (p0 > 0 && Math.random() < 0.1)) Terrain.markSurf(i);
      }
    }
  },

  liftBreakdowns(dtMin) {
    if (G.time < LIFTS_OPEN || G.time > LIFTS_CLOSE) return;
    const mech = World.staffFactor('mechanic');
    for (const l of G.lifts) {
      if (l.buildDays > 0) continue;
      if (l.broken > 0) {
        l.broken -= dtMin * (0.5 + mech * 0.8);
        if (l.broken <= 0) { l.broken = 0; World.log(`🔧 ${l.name} is spinning again.`, 'good'); }
        continue;
      }
      if (!this.liftIsOpen(l)) continue;
      const p = 0.012 * (1.6 - mech) * (1.2 - l.condition * 0.4) * (1 + G.today.dayNum % 1 * 0) * dtMin / 420;
      if (Math.random() < p) {
        l.broken = U.rint(40, 180);
        World.log(`🛑 ${l.name} stopped: ${U.pick(['drive motor fault', 'chair deropement — rope retrack needed', 'brake sensor fault', 'power outage', 'bullwheel bearing alarm', 'comms line fault'])}. Mechanics responding.`, 'bad');
        World.spend(U.rint(1500, 9000), 'lifts');
      }
    }
  },

  // ---------- Incidents & patrol ----------
  patrolInfo() {
    const hq = World.built('patrolhq');
    const need = World.staffNeeds().patrol || 1;
    const cov = hq.length ? U.clamp(G.staff.patrol / need, 0, 1.3) : 0.15;
    const huts = World.built('patrolhut').length;
    let sledBoost = 0; G.sleds.forEach(s => sledBoost += SNOWMOBILES[s.kind].resp);
    sledBoost = Math.min(0.5, sledBoost);
    const hqF = hq.length ? World.bstat(hq[0], 'resp') : 1.3;
    const resp = U.clamp(28 * hqF / (0.35 + cov) * (1 - sledBoost) * Math.pow(0.88, Math.min(huts, 4)) * (1.1 - G.morale / 500), 4, 90);
    return { coverage: cov, resp: Math.round(resp), huts, sledBoost };
  },
  scheduleIncidents() {
    const T = G.today;
    const km = this.openKmBy();
    const tot = km.green + km.blue + km.black + km.dblack || 1;
    let risk = 1 + (km.black + km.dblack * 2) / tot * 0.6 + G.icy * 0.5;
    const parks = G.runs.filter(r => r.park && this.runIsOpen(r));
    risk += parks.reduce((a, r) => a + r.park.features.reduce((b, f) => b + (PARK_FEATURES[f.kind].risk || 0.2), 0), 0) * 0.05;
    const n = U.poisson(T.visitors * 0.0011 * risk);
    T.incidentQueue = [];
    for (let k = 0; k < n; k++) T.incidentQueue.push({ t: U.rint(LIFTS_OPEN + 20, LIFTS_CLOSE - 10) });
    T.incidentQueue.sort((a, b) => a.t - b.t);
    // uncontrolled avalanche risk
    if (!G.avy.controlled && G.avy.danger >= 3) {
      const steep = G.runs.filter(r => r.maxPitch > 38 && this.runIsOpen(r));
      if (steep.length && Math.random() < 0.12 * (G.avy.danger - 2)) T.incidentQueue.push({ t: U.rint(LIFTS_OPEN + 30, 14 * 60), avy: U.pick(steep).id });
    }
    // in-bounds slides can still happen on big days even with control
    if (G.avy.controlled && G.avy.danger >= 4 && Math.random() < 0.06) {
      const steep = G.runs.filter(r => r.maxPitch > 45 && this.runIsOpen(r));
      if (steep.length) T.incidentQueue.push({ t: U.rint(LIFTS_OPEN + 30, 14 * 60), avy: U.pick(steep).id, small: true });
    }
  },
  processIncidents() {
    const T = G.today; if (!T.incidentQueue) return;
    while (T.incidentQueue.length && T.incidentQueue[0].t <= G.time) {
      const inc = T.incidentQueue.shift();
      if (inc.avy) { const ar = World.runById(inc.avy); if (ar) this.avalanche(ar, inc.small); continue; }
      const runs = G.runs.filter(r => this.runIsOpen(r));
      if (!runs.length) continue;
      const weights = runs.map(r => (r.passesToday || 1) * (r.diff === 'dblack' ? 2.2 : r.diff === 'black' ? 1.6 : r.park ? 1.8 : 1));
      let tot = weights.reduce((a, b) => a + b, 0), x = Math.random() * tot, run = runs[0];
      for (let k = 0; k < runs.length; k++) { x -= weights[k]; if (x <= 0) { run = runs[k]; break; } }
      const pi = this.patrolInfo();
      const sev = Math.random(); const kind = sev < 0.6 ? U.pick(['sprained knee', 'wrist injury', 'collision — bumps and bruises', 'lost child reunited', 'dislocated shoulder', 'snowboarder with a concussion check']) : sev < 0.96 ? U.pick(['ACL tear', 'broken wrist', 'tree-well fall', 'tib-fib fracture', 'collision with a tree']) : U.pick(['serious head injury', 'cardiac event', 'femur fracture']);
      const level = sev < 0.6 ? 1 : sev < 0.96 ? 2 : 3;
      const resp = Math.max(3, Math.round(pi.resp * (0.7 + Math.random() * 0.6)));
      const s = run.samples[U.rint(0, run.samples.length - 1)];
      G.incidentsActive.push({ x: s.x, y: s.y, until: G.time + resp + 15, resp, run: run.id, level });
      let msg = `⛑️ Patrol: ${kind} on ${DIFF[run.diff].icon} ${run.name} — on scene in ${resp} min`;
      if (level >= 2) msg += World.built('clinic').length ? ', treated at the clinic' : ', transported by ambulance';
      if (level === 3) msg += pi.sledBoost > 0 ? ' (sled + toboggan evac)' : '';
      World.log(msg + '.', level === 3 ? 'bad' : 'patrol');
      T.incidents.push({ level, resp });
      G.season.incidents++;
      World.spend(level === 1 ? 150 : level === 2 ? 900 : 3000, 'patrol');
    }
    G.incidentsActive = G.incidentsActive.filter(i => i.until > G.time);
  },
  avalanche(run, small) {
    const T = G.today;
    run.avyClosed = true;
    const s = run.samples[Math.floor(run.samples.length * (0.2 + Math.random() * 0.3))];
    G.avalanches.push({ x: s.x, y: s.y, run: run.id, day: G.dayNum, r: small ? 30 : 55 });
    const buried = !small || Math.random() < 0.3 ? U.rint(1, small ? 1 : 3) : 0;
    let msg = `🏔️ AVALANCHE on ${run.name}! ${small ? 'Small slab released after control work.' : 'Natural slide on uncontrolled terrain.'}`;
    if (!buried) { World.log(msg + ' No one caught. Run closed.', 'bad'); return; }
    const pi = this.patrolInfo();
    const dogs = G.dogs.filter(d => d.train >= 30);
    let saved = 0, lost = 0;
    for (let k = 0; k < buried; k++) {
      let p = 0.25 + pi.coverage * 0.15;
      let dogMsg = '';
      if (dogs.length) {
        const d = dogs.reduce((a, b) => (a.train * a.nose > b.train * b.nose ? a : b));
        const eff = 0.4 + 0.6 * d.train / 100 * d.nose;
        p += 0.55 * eff * (G.staff.handler >= 1 ? 1 : 0.5);
        const mins = Math.max(3, Math.round(25 * (1 - eff) + 4));
        dogMsg = ` Rescue dog ${d.name} (${d.breed}) located the victim in ${mins} min!`;
        d.finds = (d.finds || 0) + 1;
      }
      if (Math.random() < Math.min(0.97, p)) { saved++; World.log(`🐕 Buried skier rescued alive.${dogMsg}`, 'good'); }
      else { lost++; }
    }
    G.season.rescues += saved;
    msg += ` ${buried} buried — ${saved} rescued${lost ? ', ' + lost + ' fatality' : ''}.`;
    World.log(msg, lost ? 'bad' : 'warn');
    T.avalanche = { buried, saved, lost };
    G.reputation = U.clamp(G.reputation - lost * 12 - (small ? 1 : 3), 0, 100);
    if (lost) G.awareness = Math.max(5, G.awareness - 5);
    else if (saved) G.reputation = U.clamp(G.reputation + 2, 0, 100);
    World.spend(lost ? 250000 : 15000, 'patrol');
  },

  // ---------- End of day ----------
  endDay() {
    G.time = DAY_END; G.phase = 'dusk';
    const T = G.today, w = Weather.today();
    const operating = this.operating() && T.visitors > 0;
    if (operating) this.dayRevenue(T);
    this.dayExpenses(T, operating);
    if (operating) this.satisfaction(T, w);
    T.net = Object.values(T.rev).reduce((a, b) => a + b, 0) - Object.values(T.exp).reduce((a, b) => a + b, 0);
    G.season.visitors += T.visitors;
    G.history.push({ season: G.seasonNum, day: G.dayNum, date: World.dateStr(), visitors: T.visitors, rev: Object.values(T.rev).reduce((a, b) => a + b, 0), exp: Object.values(T.exp).reduce((a, b) => a + b, 0), sat: T.sat || 0, wait: T.avgWait || 0, snow: w.snowNight + w.snowDay, depth: Math.round(G.baseDepth), cash: G.cash });
    if (G.history.length > 400) G.history.shift();
    // marketing & awareness
    this.updateMarketing(T);
    if (G._skipping || (!operating && !G.showClosedReports)) { Sim.runNight(null); return; }
    if (operating && G.autoGroom) {
      World.log(`🌆 Day done: ${T.visitors.toLocaleString()} guests, ${T.sat}% happy, net ${U.money(T.net)}. 🚜 Crew is grooming overnight (auto).`, T.net >= 0 ? 'good' : 'warn');
      Sim.runNight(null);
      return;
    }
    UI.showDayReport(T);
  },

  dayRevenue(T) {
    const v = T.visitors;
    const rentCap = World.sumStat('rental', 'rentals') * U.clamp(World.staffFactor('rental'), 0.2, 1);
    const rentals = Math.min(rentCap, v * 0.24); T.rentals = Math.round(rentals); T.rentalShort = v * 0.24 - rentals;
    World.earn(rentals * 59, 'rentals');
    const stud = Math.min(World.sumStat('school', 'students'), G.staff.instructor * 6, v * 0.13);
    T.students = Math.round(stud); World.earn(stud * 165, 'lessons');
    const seats = World.sumStat('lodge', 'seats') + World.sumStat('restaurant', 'seats') + World.sumStat('waffle', 'seats');
    const meals = Math.min(v * 0.85, seats * 3.2 * U.clamp(World.staffFactor('food'), 0.3, 1));
    T.meals = Math.round(meals); T.foodShort = Math.max(0, v * 0.85 - meals);
    World.earn(meals * 21, 'food');
    if (World.built('retail').length) World.earn(v * (4 + 3 * World.built('retail').reduce((a, b) => a + b.level, 0)), 'retail');
    if (World.built('bar').length) World.earn(Math.min(v * 0.3, 350 * World.built('bar').reduce((a, b) => a + b.level, 0)) * 16, 'bar');
    if (T.rooms) World.earn(T.rooms * T.occupancy * 245, 'lodging');
    // village extras
    const lv = (k) => World.built(k).reduce((a, b) => a + b.level, 0);
    let village = 0;
    if (lv('daycare')) village += Math.min(World.sumStat('daycare', 'kids'), v * 0.03) * 125;
    if (lv('rink')) village += v * 0.08 * (0.8 + 0.2 * lv('rink')) * 18;
    if (lv('spa')) village += Math.min(v * 0.07, 220 * lv('spa')) * 95;
    if (lv('tubing')) village += Math.min(v * 0.06, 250 * lv('tubing')) * 35;
    if (lv('tune')) village += v * 0.04 * 40;
    if (lv('heli') && Weather.today().wind < 14) village += Math.min(v * 0.004, 24) * 1100;
    if (village) World.earn(village, 'village');
    const sight = G.lifts.filter(l => LIFTS[l.kind].sightseeing && this.liftIsOpen(l)).length;
    if (sight) World.earn(Math.round(v * 0.04 * sight) * 39, 'sightseeing');
    T.avgWait = T.waitSamples ? T.waitSum / T.waitSamples : 0;
  },

  dayExpenses(T, operating) {
    let wages = 0;
    for (const k in G.staff) wages += G.staff[k] * STAFF[k].wage * G.payRate;
    if (!World.inSeasonWindow() && !G.seasonOpen) wages *= 0.5; // preseason: partial crews
    World.spend(wages, 'wages');
    let lp = 0;
    for (const l of G.lifts) {
      if (l.buildDays > 0) continue;
      const L = LIFTS[l.kind];
      lp += L.maint * (operating ? 1 : 0.3);
      if (operating && this.liftIsOpen(l)) lp += L.kw * 7 * 0.15 * (1 - l.holdFrac * 0.8);
      l.age += 1 / 150;
    }
    World.spend(lp, 'lifts');
    let up = 0; for (const b of G.buildings) if (b.buildDays <= 0) up += World.bstat(b, 'upkeep');
    G.dogs.forEach(() => up += 18);
    G.sleds.forEach(s => up += SNOWMOBILES[s.kind].upkeep);
    World.spend(up, 'upkeep');
    World.spend(700 + 120 * G.lifts.length + (T.visitors || 0) * 0.35, 'insurance');
    if (G.loan > 0) World.spend(G.loan * 0.065 / 365, 'interest');
  },

  satisfaction(T, w) {
    const S = {};
    S.lines = U.clamp(100 - (T.avgWait - 4) * 4.5, 0, 100);
    // grooming quality on groomed-type runs + powder
    let gsum = 0, gw = 0, pw = 0;
    for (const r of G.runs) if (this.runIsOpen(r)) {
      this.runCondition(r);
      const use = (r.passesToday || 1);
      const want = r.diff === 'green' || r.diff === 'blue' ? 1 : 0.4;
      gsum += r.condition * use * want; gw += use * want; pw += r.powderAvg * use;
    }
    S.grooming = gw ? U.clamp(30 + 75 * gsum / gw, 0, 100) : 50;
    let snow = G.baseDepth < 40 ? 45 : G.baseDepth < 80 ? 70 : G.baseDepth < 140 ? 85 : 95;
    if (w.snowNight >= 10) snow += 15; if (w.type === 'rain') snow -= 30;
    snow -= G.icy * 25 * (1 - S.grooming / 200);
    S.snow = U.clamp(snow, 0, 100);
    const km = this.openKmBy();
    const need = { beginner: [1.0, km.green], intermediate: [3.5, km.green * 0.4 + km.blue], advanced: [5, km.blue * 0.5 + km.black + km.dblack * 0.5], expert: [3, km.black * 0.5 + km.dblack] };
    let terr = 0; for (const sk of SKILLS) terr += sk.share * U.clamp(need[sk.key][1] / need[sk.key][0], 0, 1);
    S.terrain = U.clamp(terr * 100, 0, 100);
    const seatsOk = T.foodShort > 0 ? U.clamp(1 - T.foodShort / T.visitors * 2, 0, 1) : 1;
    const lodge = World.built('lodge').length ? 1 : 0.3;
    const rest = Math.min(1, 0.7 + World.built('restroom').length * 0.1 + World.built('restaurant').length * 0.15);
    const rentOk = T.rentalShort > 1 ? U.clamp(1 - T.rentalShort / (T.visitors * 0.24), 0.2, 1) : 1;
    const parkOk = T.turned > 0 ? U.clamp(1 - T.turned / (T.visitors + T.turned), 0.3, 1) : 1;
    const extra = (World.built('bar').length ? 5 : 0) + (World.built('hotel').length || World.built('condo').length ? 4 : 0) + (World.built('retail').length ? 2 : 0) + (World.built('spa').length ? 5 : 0) + (World.built('daycare').length ? 3 : 0) + (World.built('rink').length ? 2 : 0) + (World.built('tubing').length ? 2 : 0) + (World.built('plaza').length ? 3 : 0) + (World.built('waffle').length ? 2 : 0);
    S.facilities = U.clamp((seatsOk * 0.35 + lodge * 0.25 + rest * 0.15 + rentOk * 0.15 + parkOk * 0.1) * 95 + extra, 0, 100);
    const pi = this.patrolInfo();
    S.safety = U.clamp(40 + pi.coverage * 45 + (pi.resp < 10 ? 15 : pi.resp < 20 ? 5 : -10) - T.incidents.filter(i => i.level >= 2).length * 2 + G.dogs.length * 2 - (T.avalanche ? T.avalanche.lost * 40 : 0), 0, 100);
    S.value = U.clamp(50 + (T.refPrice - G.prices.ticket) * 0.8, 0, 100);
    // park
    const parks = G.runs.filter(r => r.park && this.runIsOpen(r));
    let park = 0; for (const r of parks) park += r.park.quality * Math.min(1, r.park.features.reduce((a, f) => a + PARK_FEATURES[f.kind].draw, 0) / 5);
    S.park = parks.length ? U.clamp(park * 100, 0, 100) : 20;
    // comfort: bubble lifts on cold/windy days, holds
    let comfort = 75;
    const holds = G.lifts.filter(l => l.holdFrac > 0 && l.buildDays <= 0).length;
    comfort -= holds * 8;
    if (w.tHi < -12 || w.wind > 15) comfort += G.lifts.some(l => LIFTS[l.kind].bubble && this.liftIsOpen(l)) ? 10 : -10;
    S.comfort = U.clamp(comfort, 0, 100);
    const W = { lines: 0.2, grooming: 0.16, snow: 0.14, terrain: 0.16, facilities: 0.12, safety: 0.08, value: 0.07, park: 0.03, comfort: 0.04 };
    let sat = 0; for (const k in W) sat += S[k] * W[k];
    T.sat = Math.round(sat); T.satParts = S;
    G.reputation = U.clamp(G.reputation + (sat - G.reputation) * 0.07 - (T.turned > 200 ? 0.3 : 0), 0, 100);
    G.lastSat = S;
    this.makeReviews(S, T, w);
  },
  makeReviews(S, T, w) {
    const good = {
      lines: ['Walked right onto the lifts all day!', 'Zero lift lines. Lap heaven.'],
      grooming: ['The corduroy this morning was PERFECT.', 'Groomers deserve a raise. Silky smooth.'],
      snow: ['Snow was fantastic. Deep base everywhere.', 'Powder day!!! Face shots for days.'],
      terrain: ['So much terrain variety — something for the whole family.', 'Loved the steeps AND the cruisers.'],
      facilities: ['Lodge food was great and easy to find a seat.', 'Super easy rentals, friendly staff.'],
      safety: ['Patrol was everywhere and super helpful.', 'Met the avalanche dog! Best day ever.'],
      value: ['Great value for the price.', 'Affordable lift tickets, will be back!'],
      park: ['Park crew had the jumps dialed!', 'Best terrain park in the region.'],
      comfort: ['The bubble chair kept us warm in the storm.', 'Comfortable, fast lifts.'],
    };
    const bad = {
      lines: [`Waited ${Math.round(T.avgWait)} minutes in the lift line. Ugh.`, 'Lift lines were insane. Need more lifts!'],
      grooming: ['Runs were bumped out and nasty. Groom more!', 'No corduroy on the blues. Disappointed.'],
      snow: ['Pretty thin and icy out there.', 'Rocks showing through. Need more snow(making).'],
      terrain: ['Not enough terrain for my level.', 'Got bored after two hours. Need more runs.'],
      facilities: ['Couldn\'t find a seat at lunch. Lodge is way too small.', 'Rental line took forever.', 'Parking lot was full by 9am!'],
      safety: ['Took forever for patrol to show up after my buddy fell.', 'Felt unsafe — barely saw any patrol.'],
      value: ['Way too expensive for what you get.', 'Overpriced lift tickets.'],
      park: ['Park features were rutted and sketchy.', 'Barely a terrain park. Where are the rails?'],
      comfort: ['Wind holds all day, half the mountain closed.', 'Freezing on that slow chair.'],
    };
    const keys = Object.keys(S).filter(k => !(k === 'park' && S.park === 20));
    keys.sort((a, b) => S[a] - S[b]);
    const out = [];
    const stars = (v) => '★'.repeat(U.clamp(Math.round(v / 20), 1, 5)) + '☆'.repeat(5 - U.clamp(Math.round(v / 20), 1, 5));
    if (S[keys[0]] < 65) out.push({ s: stars(S[keys[0]]), t: U.pick(bad[keys[0]]) });
    if (S[keys[1]] < 60) out.push({ s: stars(S[keys[1]]), t: U.pick(bad[keys[1]]) });
    const top = keys[keys.length - 1];
    if (S[top] > 70) out.push({ s: stars(S[top]), t: U.pick(good[top]) });
    if (w.snowNight >= 15 && S.snow > 70) out.push({ s: '★★★★★', t: `${w.snowNight} cm overnight. Best powder day of the year!` });
    G.reviews = out.concat(G.reviews).slice(0, 30);
    T.reviews = out;
  },

  updateMarketing(T) {
    let aw = 0;
    for (const c of G.campaigns) {
      const C = CAMPAIGNS[c.key];
      if (C.perDay) { World.spend(C.cost, 'marketing'); }
      aw += C.days === 1 ? (c.fresh ? C.aw : 0) : C.aw;
      if (C.park && c.fresh) { const hasPark = G.runs.some(r => r.park && r.park.features.length); aw += hasPark ? C.aw * 0.5 * C.park : 0; }
      if (C.days === 1 && c.fresh && C.key === 'magazine' && G.reputation > 60) G.reputation += 2;
      c.fresh = false; c.left--;
    }
    G.campaigns = G.campaigns.filter(c => c.left > 0);
    G.awareness += aw;
    // word of mouth
    if (T.sat) G.awareness += (T.sat - 55) / 100 * Math.min(2, T.visitors / 1500);
    G.awareness -= G.awareness * 0.008;
    G.awareness = U.clamp(G.awareness, 5 + G.reputation * 0.08, 100);
  },

  // ---------- Night ----------
  runNight(manual) {
    const w = Weather.today();
    const T = G.today;
    // auto grooming
    const gr = Grooming.autoGroom(manual);
    // snowmaking
    const tomorrow = G.wx[1];
    const pumps = World.sumStat('pumphouse', 'km');
    let smKm = 0, smCost = 0;
    const cold = Math.min(w.tLo, tomorrow ? tomorrow.tLo : w.tLo);
    if (pumps > 0 && cold <= -1) {
      const smF = U.clamp(World.staffFactor('snowmaker'), 0, 1);
      const list = G.runs.filter(r => r.snowmaking && r.smOn && this.runDepth(r) < (G.smTarget || 110)).sort((a, b) => this.runDepth(a) - this.runDepth(b));
      for (const r of list) {
        const gun = SNOWGUNS[(r.smTier || 1) - 1];
        if (cold > gun.temp) continue;
        const km = r.len / 1000;
        if (smKm + km > pumps * smF + 0.001) continue;
        smKm += km;
        const made = U.clamp((gun.temp - cold + 2) * 1.6, 3, 16) * gun.out;
        r.smDepth += made;
        smCost += km * 2400 * gun.cost;
        for (const i of r.cells) { Terrain.groom[i] = Math.min(Terrain.groom[i], 0.3); Terrain.markSurf(i); }
      }
      if (smKm > 0) { World.spend(smCost, 'snowmaking'); World.log(`❄️ Snowmakers covered ${smKm.toFixed(1)} km of trail overnight (${U.money(smCost)}).`, 'info'); }
    }
    // melt / settle
    if (w.tHi > 3) { const m = (w.tHi - 3) * 1.4; G.baseDepth = Math.max(0, G.baseDepth - m); G.runs.forEach(r => r.smDepth = Math.max(0, r.smDepth - m * 0.6)); G.icy = Math.min(1, G.icy + 0.35); }
    if (w.rain) { G.baseDepth = Math.max(0, G.baseDepth - w.rain * 0.6); G.icy = 1; }
    G.baseDepth = Math.max(0, G.baseDepth * 0.995);
    // powder settles overnight
    for (const r of G.runs) for (const i of r.cells) if (Terrain.powder[i] > 0) { Terrain.powder[i] *= 0.82; Terrain.markSurf(i); }
    // park decay & maintenance
    const parkCats = G.groomers.filter(g => GROOMERS[g.kind].park).length;
    for (const r of G.runs) if (r.park) {
      const crew = U.clamp(World.staffFactor('park'), 0, 1);
      r.park.quality = U.clamp(r.park.quality - 0.18 + (parkCats ? 0.25 * crew : 0.06 * crew) + (gr.parkDone && gr.parkDone.has(r.id) ? 0.15 : 0), 0.1, 1);
    }
    // construction
    for (const e of [...G.lifts, ...G.buildings]) {
      if (e.buildDays > 0) {
        e.buildDays--;
        if (e.buildDays <= 0) {
          e.status = 'open';
          World.log(`✅ ${e.type === 'lift' ? 'Lift "' + e.name + '"' : BUILDINGS[e.kind].name + (e.level > 1 ? ' (Lv ' + e.level + ')' : '')} is complete!`, 'good');
        }
      }
    }
    for (const r of G.runs) if (r.buildDays > 0) r.buildDays--;
    // dogs train
    for (const d of G.dogs) d.train = Math.min(100, d.train + (G.staff.handler >= G.dogs.length ? 1.6 : 0.6));
    // staff morale
    const needs = World.staffNeeds(); let over = 0, n = 0;
    for (const k in needs) if (needs[k]) { over += Math.max(0, 1 - G.staff[k] / needs[k]); n++; }
    over = n ? over / n : 0;
    const target = 70 + (G.payRate - 1) * 130 - over * 40 + World.sumStat('housing', 'morale');
    G.morale = U.clamp(G.morale + (target - G.morale) * 0.15, 0, 100);
    // recent snow memory for avalanche model
    G.recentSnow = (G.recentSnow || []).concat([w.snowNight + w.snowDay]).slice(-3);
    // pass sales (preseason & early season)
    const dt = World.date();
    if (dt.getUTCMonth() === 9 || dt.getUTCMonth() === 10 || (dt.getUTCMonth() === 11 && dt.getUTCDate() <= 15)) {
      const ref = 45 + G.runs.length * 12 + G.reputation * 5 + G.lifts.length * 30;
      const pf = U.clamp(Math.pow(ref / G.prices.pass, 1.5), 0.1, 2);
      let sold = (G.awareness * 1.4 + G.reputation * 0.5) * pf * (0.7 + Math.random() * 0.6);
      if (G.campaigns.some(c => CAMPAIGNS[c.key].pass)) sold *= 1.8;
      sold = Math.round(sold);
      G.passHolders += sold; World.earn(sold * G.prices.pass, 'passes');
      T.passSold = sold;
    }
    // advance date
    G.dayNum++;
    Weather.advance();
    // season transitions
    const nd = World.date();
    if (nd.getUTCMonth() === 3 && nd.getUTCDate() === 20) {
      this.endSeason();
      return;
    }
    this.startDay();
    if (!G._skipping) Save.save();
  },

  // Fast-forward to the end of the season (crew grooms every night, no reports)
  skipSeason() {
    if (G.phase === 'drive') return;
    G._skipping = true;
    const startVisits = G.season.visitors, startCash = G.cash;
    UI.openModal('skipping', { startVisits, startCash });
    const step = () => {
      if (!G._skipping) return;
      for (let k = 0; k < 3 && G._skipping; k++) {
        if (G.phase === 'dusk' && UI.modal !== 'season') { G.phase = 'day'; this.runNight(null); }
        if (!G.seasonOpen && World.inSeasonWindow()) this.openSeason();
        const d0 = G.dayNum; let guard = 0;
        while (G.dayNum === d0 && G.phase === 'day' && guard++ < 400) this.tickDay(5);
        if (UI.modal === 'season') { G._skipping = false; Save.save(); return; }
      }
      UI.updateSkip();
      setTimeout(step, 0);
    };
    setTimeout(step, 30);
  },
  openSeason() {
    if (G.seasonOpen) return { ok: false, err: 'Already open.' };
    if (!World.inSeasonWindow()) return { ok: false, err: 'The season opens in November.' };
    if (!World.built('ticket').length) return { ok: false, err: 'You need a completed Ticket Office.' };
    const openLift = G.lifts.some(l => l.buildDays <= 0 && l.reachable);
    if (!openLift) return { ok: false, err: G.lifts.length ? 'Your lift is still being built — speed up time (⏩) and try again.' : 'Build a lift from the base first (🚡 Lifts).' };
    if (!G.runs.some(r => this.runDepth(r) >= 30 && r.reachable)) return { ok: false, err: 'No runs have 30 cm of snow yet. Make snow or wait for storms.' };
    G.seasonOpen = true;
    World.log('🎿 OPENING DAY! The resort is open for the season.', 'good');
    G.awareness += 4;
    if (G.time < LIFTS_OPEN) { this.computeVisitors(Weather.today(), World.date()); this.scheduleIncidents(); Agents.reset(); }
    return { ok: true };
  },

  endSeason() {
    const S = G.season;
    UI.showSeasonSummary(S);
  },
  startNextSeason() {
    // summer: jump to Oct 20 next year
    const summerCost = G.buildings.reduce((a, b) => a + World.bstat(b, 'upkeep') * 40, 0) + G.lifts.reduce((a, l) => a + LIFTS[l.kind].maint * 30, 0) + 250000;
    G.cash -= summerCost;
    const summerRev = G.lifts.filter(l => LIFTS[l.kind].sightseeing).length * 450000 + World.built('hotel').length * 300000 + World.built('restaurant').length * 150000;
    G.cash += summerRev;
    World.log(`☀️ Summer: maintenance & insurance ${U.money(summerCost)}, summer operations ${U.money(summerRev)}.`, 'info');
    G.seasonNum++;
    G.dayNum = Math.round((Date.UTC(2026 + G.seasonNum - 1, 10, 3) - START_DATE) / 86400000);
    G.seasonOpen = false; G.baseDepth = 40; G.icy = 0; G.passHolders = 0; G.recentSnow = [];
    G.season = { revenue: 0, expense: 0, visitors: 0, incidents: 0, rescues: 0 };
    G.wx = []; G.stormState = { left: 0, kind: null }; Weather.ensure();
    G.runs.forEach(r => { r.smDepth = 0; r.cells.forEach(i => { Terrain.powder[i] = 0; Terrain.groom[i] = 0.4; Terrain.markSurf(i); }); });
    G.lifts.forEach(l => { l.condition = Math.max(0.6, l.condition - 0.03); });
    G.avalanches = [];
    G.reputation = U.lerp(G.reputation, 55, 0.2);
    this.startDay(true);
  },
};
