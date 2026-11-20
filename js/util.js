// ---------- Utility helpers ----------
const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  rand: Math.random,
  rint: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
  // Poisson sample (small lambda)
  poisson(l) {
    if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * U.gauss()));
    let L = Math.exp(-l), k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  },
  gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  },
  // ---- US display units (the simulation runs in metric internally) ----
  ft: (m) => Math.round(m * 3.28084).toLocaleString() + ' ft',
  mi: (km, d = 1) => (km * 0.621371).toFixed(d) + ' mi',
  inch: (cm) => Math.round(cm / 2.54) + ' in',
  inN: (cm) => Math.round(cm / 2.54),
  F: (c) => Math.round(c * 9 / 5 + 32) + '°F',
  Fn: (c) => Math.round(c * 9 / 5 + 32),
  mph: (ms) => Math.round(ms * 2.23694) + ' mph',
  kmh2mph: (k) => Math.round(k * 0.621371) + ' mph',
  ac: (ha, d = 1) => (ha * 2.47105).toFixed(d) + ' acres',
  money(v) {
    const neg = v < 0; v = Math.abs(v);
    let s;
    if (v >= 1e6) s = '$' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'M';
    else if (v >= 1e4) s = '$' + (v / 1e3).toFixed(0) + 'k';
    else s = '$' + Math.round(v).toLocaleString();
    return neg ? '-' + s : s;
  },
  moneyFull(v) { return (v < 0 ? '-$' : '$') + Math.round(Math.abs(v)).toLocaleString(); },
  pct: (v) => Math.round(v * 100) + '%',
  // Seeded RNG (mulberry32)
  seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  // Point to segment distance + projection param
  segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = U.clamp(t, 0, 1);
    const px = a.x + dx * t, py = a.y + dy * t;
    return { d: Math.hypot(p.x - px, p.y - py), t, x: px, y: py };
  },
  el(tag, attrs = {}, html = '') {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (html) e.innerHTML = html;
    return e;
  },
  _n: 1,
  uid() { return ++U._n; },
};

// Value noise / fBm (seeded)
class Noise {
  constructor(seed) {
    const r = U.seeded(seed);
    this.p = new Uint8Array(512);
    this.g = new Float32Array(256);
    const perm = [];
    for (let i = 0; i < 256; i++) { perm[i] = i; this.g[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  v(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const h = (ix, iy) => this.g[this.p[(this.p[ix & 255] + iy) & 511]];
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    const u = s(xf), w = s(yf);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), w);
  }
  fbm(x, y, oct = 5) {
    let amp = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * this.v(x * f, y * f); norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  }
  ridge(x, y, oct = 4) {
    let amp = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(this.v(x * f, y * f) * 2 - 1); sum += amp * n * n; norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  }
}

const NAMES = {
  runA: ['Fox', 'Eagle', 'Timber', 'Ptarmigan', 'Bear', 'Raven', 'Lynx', 'Elk', 'Marmot', 'Summit', 'Glacier', 'Avalanche', 'Powder', 'Cornice', 'Spruce', 'Aspen', 'Ridge', 'Comet', 'Thunder', 'Silver', 'Gold', 'Moose', 'Wolverine', 'Osprey', 'Bluebird', 'Hidden', 'Lost', 'Upper', 'Lower', 'Big', 'Little', 'Widow', 'Devil', 'Angel', 'Lone Pine', 'Snowshoe', 'Chinook', 'Cougar'],
  runB: ['Run', 'Trail', 'Bowl', 'Glade', 'Chute', 'Way', 'Alley', 'Line', 'Couloir', 'Face', 'Meadow', 'Express', 'Lane', 'Drop', 'Ridge', 'Gulch', 'Traverse', 'Highway', 'Path', "Maker", 'Plunge'],
  lift: ['Summit', 'Eagle', 'Timberline', 'Bluebird', 'Sunrise', 'Alpenglow', 'Powder', 'Ridge', 'Base', 'Village', 'Peak', 'Glacier', 'Lookout', 'Cirque', 'Basin', 'Pioneer', 'Thunderbird', 'Gold Rush', 'Silver Queen', 'High Noon'],
  dog: ['Bella', 'Koda', 'Juneau', 'Tahoe', 'Rocky', 'Maple', 'Aspen', 'Bodhi', 'Willow', 'Ranger', 'Scout', 'Echo', 'Luna', 'Moose', 'Sierra', 'Teton', 'Boone', 'Nova', 'Diesel', 'Yukon'],
};
function genRunName() { return U.pick(NAMES.runA) + ' ' + U.pick(NAMES.runB); }
