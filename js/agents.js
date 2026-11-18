// ---------- Visual skier agents ----------
const JACKETS = ['#e63946', '#f1c453', '#2a9d8f', '#e76f51', '#8338ec', '#ff006e', '#3a86ff', '#06d6a0', '#222', '#fb8500', '#90be6d'];
const Agents = {
  list: [], K: 15,
  reset() { this.list = []; },
  pickSkill() { let r = Math.random(); for (const s of SKILLS) { r -= s.share; if (r <= 0) return s; } return SKILLS[1]; },
  allowedRun(a, r) { return r && Sim.runIsOpen(r) && a.skill.allowed.includes(r.diff); },
  liftOk(a, l) { return l && Sim.liftIsOpen(l) && l.reachable && l.minDiff < 9 && a.skill.allowed.includes(DIFF_ORDER[l.minDiff]); },
  spawn() {
    const base = World.basePos();
    const a = { x: base.x + (Math.random() - 0.5) * 60, y: base.y + (Math.random() - 0.5) * 30, skill: this.pickSkill(), color: U.pick(JACKETS), board: Math.random() < 0.3, state: 'base', t: Math.random() * 3, off: (Math.random() - 0.5) * 0.8, ph: Math.random() * 6 };
    this.list.push(a);
    return a;
  },
  goToLift(a, fromBase) {
    const opts = G.lifts.filter(l => this.liftOk(a, l) && (!fromBase || l.fromBase));
    if (!opts.length) { a.state = 'leave'; return; }
    // prefer nearby lifts with short waits
    opts.sort((p, q) => (U.dist(a, p.bottom) / 80 + p.wait) - (U.dist(a, q.bottom) / 80 + q.wait));
    a.lift = U.chance(0.7) ? opts[0] : U.pick(opts);
    a.state = 'walk'; a.target = { x: a.lift.bottom.x + (Math.random() - 0.5) * 8, y: a.lift.bottom.y + 6 };
  },
  update(dt) {
    if (!G.today) return;
    const operating = Sim.operating() && G.today.visitors > 0 && G.time >= LIFTS_OPEN - 30;
    const scale = Math.max(1, Math.ceil((G.today.visitors || 0) / 450));
    const target = operating ? Math.min(450, Math.round(Sim.onHill() / scale)) : 0;
    if (this.list.length < target && Math.random() < 0.6) { const a = this.spawn(); this.goToLift(a, true); }
    const K = this.K * dt;
    const liftsRunning = G.time >= LIFTS_OPEN && G.time <= LIFTS_CLOSE;
    for (const a of this.list) {
      a.ph += dt * 3;
      switch (a.state) {
        case 'walk': {
          if (!a.lift || !Sim.liftIsOpen(a.lift)) { this.goToLift(a, false); break; }
          const d = U.dist(a, a.target);
          const sp = 2.2 * K;
          if (d < sp) { a.state = 'queue'; a.t = 0; a.qWait = (a.lift.wait || 1) * 0.35 + Math.random() * 0.5; }
          else { a.x += (a.target.x - a.x) / d * sp; a.y += (a.target.y - a.y) / d * sp; }
          break;
        }
        case 'queue': {
          if (!Sim.liftIsOpen(a.lift)) { this.goToLift(a, false); break; }
          if (!liftsRunning) break;
          a.t += dt;
          if (a.t >= a.qWait) { a.state = 'ride'; a.p = 0; }
          break;
        }
        case 'ride': {
          const L = LIFTS[a.lift.kind];
          if (a.lift.broken) break; // stuck on the chair!
          a.p += L.speed * K / a.lift.len * (L.cat === 'Tram' ? 0.6 : 1);
          a.x = U.lerp(a.lift.bottom.x, a.lift.top.x, a.p); a.y = U.lerp(a.lift.bottom.y, a.lift.top.y, a.p);
          if (a.p >= 1) this.atTop(a);
          break;
        }
        case 'ski': {
          const r = a.run;
          if (!r) { a.state = 'leave'; break; }
          a.s += a.skill.speed * K * (r.diff === 'green' ? 0.75 : 1) * (a.board ? 0.95 : 1);
          const smp = r.samples;
          while (a.i < smp.length - 2 && smp[a.i + 1].s < a.s) {
            a.i++;
            // branch?
            for (const br of r.branches) if (br.i === a.i && !br.merge && Math.random() < 0.35) { const o = World.runById(br.run); if (this.allowedRun(a, o)) { this.startRun(a, o, br.j); break; } }
            if (a.run !== r) break;
          }
          if (a.run !== r) break;
          if (a.s >= smp[smp.length - 1].s) { this.runEnd(a); break; }
          const p = smp[a.i], q = smp[Math.min(a.i + 1, smp.length - 1)];
          const t = q.s > p.s ? U.clamp((a.s - p.s) / (q.s - p.s), 0, 1) : 0;
          const dx = q.x - p.x, dy = q.y - p.y, dl = Math.hypot(dx, dy) || 1;
          const wig = Math.sin(a.ph * (a.skill.key === 'beginner' ? 0.8 : 1.4)) * r.width * 0.28 + a.off * r.width * 0.3;
          a.x = U.lerp(p.x, q.x, t) - dy / dl * wig; a.y = U.lerp(p.y, q.y, t) + dx / dl * wig;
          a.dir = Math.atan2(dy, dx);
          break;
        }
        case 'leave': {
          const base = World.basePos(); const d = U.dist(a, base);
          if (d < 20) { a.dead = true; break; }
          a.x += (base.x - a.x) / d * 2.5 * K; a.y += (base.y - a.y) / d * 2.5 * K;
          break;
        }
        case 'base': this.goToLift(a, true); break;
      }
    }
    // trim excess
    if (this.list.length > target) {
      let excess = this.list.length - target;
      for (const a of this.list) { if (excess <= 0) break; if (a.state === 'walk' || a.state === 'leave' || a.state === 'queue' || !operating) { a.dead = true; excess--; } }
    }
    this.list = this.list.filter(a => !a.dead);
  },
  atTop(a) {
    const l = a.lift;
    const opts = l.topRuns.map(id => World.runById(id)).filter(r => this.allowedRun(a, r));
    if (!opts.length) {
      if (LIFTS[l.kind].cat === 'Gondola' || LIFTS[l.kind].cat === 'Tram') { a.x = l.bottom.x; a.y = l.bottom.y; this.goToLift(a, false); }
      else a.dead = true;
      return;
    }
    // experts prefer harder runs; beginners easiest
    const want = DIFF_ORDER.indexOf(a.skill.allowed[a.skill.allowed.length - 1]);
    opts.sort((p, q) => Math.abs(DIFF_ORDER.indexOf(p.diff) - want) - Math.abs(DIFF_ORDER.indexOf(q.diff) - want));
    const r = Math.random() < 0.55 ? opts[0] : U.pick(opts);
    this.startRun(a, r, l.topJoin && l.topJoin[r.id] ? l.topJoin[r.id] : 0);
  },
  startRun(a, r, j) {
    a.state = 'ski'; a.run = r; a.i = j; a.s = r.samples[j].s; a.off = (Math.random() - 0.5) * 0.8;
  },
  runEnd(a) {
    const r = a.run;
    const merges = r.branches.filter(b => b.merge).map(b => ({ b, r: World.runById(b.run) })).filter(o => this.allowedRun(a, o.r));
    const lifts = r.endLifts.map(id => World.liftById(id)).filter(l => this.liftOk(a, l));
    const late = G.time > 15 * 60 + 30;
    if (lifts.length && !late && (Math.random() < 0.6 || !merges.length)) {
      const l = U.pick(lifts); a.lift = l; a.state = 'walk'; a.target = { x: l.bottom.x + (Math.random() - 0.5) * 8, y: l.bottom.y + 6 };
    } else if (merges.length) {
      const m = U.pick(merges); this.startRun(a, m.r, m.b.j);
    } else if (r.endsAtBase) {
      if (late || Math.random() < 0.15) a.state = 'leave'; else this.goToLift(a, true);
    } else { a.dead = true; }
  },
  queueCount(l) {
    let n = 0; for (const a of this.list) if (a.state === 'queue' && a.lift === l) n++; return n;
  },
};
