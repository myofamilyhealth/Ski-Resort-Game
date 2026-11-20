// ---------- Weather & storm cycles ----------
const STORM_TYPES = {
  clipper:  { name: 'Alberta Clipper', snow: [6, 15], temp: -5, wind: [10, 22], days: [1, 2], desc: 'Fast, cold & windy. Light fluffy snow.' },
  pacific:  { name: 'Pacific Storm', snow: [15, 35], temp: 1, wind: [8, 20], days: [2, 3], desc: 'Classic storm cycle. Dense, base-building snow.' },
  upslope:  { name: 'Upslope Storm', snow: [10, 30], temp: -6, wind: [3, 10], days: [1, 3], desc: 'Calm & cold. Blower champagne powder.' },
  ar:       { name: 'Atmospheric River', snow: [30, 60], temp: 3, wind: [14, 28], days: [2, 4], desc: 'Huge totals, warm & windy. Rain possible down low.' },
};

const Weather = {
  ensure() { while (G.wx.length < 10) G.wx.push(this.gen(G.dayNum + G.wx.length)); },
  today() { return G.wx[0]; },
  advance() { G.wx.shift(); this.ensure(); },
  gen(dayNum) {
    const dt = World.date(dayNum); const m = dt.getUTCMonth();
    const mean = MONTH_TEMP[m] !== undefined ? MONTH_TEMP[m] : 5;
    const pStorm = MONTH_STORM[m] !== undefined ? MONTH_STORM[m] : 0.05;
    const s = G.stormState;
    const day = { dayNum, snowNight: 0, snowDay: 0, rain: 0, wind: 0, tHi: 0, tLo: 0, type: 'clear', storm: null, vis: 1 };
    if (s.left <= 0 && Math.random() < pStorm * 0.7) {
      const r = Math.random();
      const kind = m === 9 || m === 3 ? (r < 0.5 ? 'pacific' : r < 0.8 ? 'clipper' : 'ar') : r < 0.3 ? 'clipper' : r < 0.65 ? 'pacific' : r < 0.88 ? 'upslope' : 'ar';
      const T = STORM_TYPES[kind];
      s.kind = kind; s.left = U.rint(T.days[0], T.days[1]); s.total = s.left; s.after = 0;
    }
    if (s.left > 0) {
      const T = STORM_TYPES[s.kind];
      const amt = U.lerp(T.snow[0], T.snow[1], Math.random()) * ((G && G.site && G.site.snow) || 1);
      day.storm = s.kind; day.type = s.kind === 'ar' && amt > 40 ? 'heavy' : 'snow';
      day.tHi = mean + T.temp + U.gauss() * 2 + 1; day.tLo = day.tHi - 5;
      day.wind = U.lerp(T.wind[0], T.wind[1], Math.random());
      // snow falls overnight and during the day
      let night = amt * 0.6, dayS = amt * 0.4;
      if (s.left === s.total) { night *= 0.3; } // storm arrives during the day
      if (day.tHi > 2.5) { day.rain = Math.round((night + dayS) * 0.3); night *= 0.3; dayS *= 0.2; day.type = 'rain'; }
      day.snowNight = Math.round(night); day.snowDay = Math.round(dayS);
      day.vis = 0.45;
      s.left--; if (s.left === 0) s.after = 2;
    } else if (s.after > 0) {
      day.type = s.after === 2 ? 'bluebird' : 'clear';
      day.tHi = mean - 3 + U.gauss() * 2; day.tLo = day.tHi - 9;
      day.wind = 2 + Math.random() * 6; s.after--;
      if (s.after === 1 && G.wx.length) { /* snow from last night of storm */ }
    } else {
      const r = Math.random();
      day.tHi = mean + 2 + U.gauss() * 3.5; day.tLo = day.tHi - 8 - Math.random() * 4;
      day.wind = 2 + Math.random() * 9;
      if (r < 0.15) { day.type = 'flurries'; day.snowDay = U.rint(1, 4); day.snowNight = U.rint(0, 3); day.vis = 0.75; }
      else if (r < 0.35) { day.type = 'cloudy'; day.vis = 0.85; }
      else if (r < 0.43) { day.type = 'windy'; day.wind = 14 + Math.random() * 14; }
      else day.type = 'clear';
      if (Math.random() < 0.06) { day.tHi -= 10; day.tLo -= 10; day.type = 'cold'; } // arctic outbreak
    }
    day.gust = day.wind * (1.35 + Math.random() * 0.3);
    day.tHi = Math.round(day.tHi); day.tLo = Math.round(day.tLo);
    day.wind = Math.round(day.wind); day.gust = Math.round(day.gust);
    // forecast noise baked per day
    day.fcErr = 0.6 + Math.random() * 0.8;
    return day;
  },
  icon(d) {
    return { clear: '☀️', bluebird: '🌞', cloudy: '☁️', flurries: '🌨️', snow: '❄️', heavy: '🌨️', rain: '🌧️', windy: '💨', cold: '🥶' }[d.type] || '☀️';
  },
  label(d) {
    return { clear: 'Sunny', bluebird: 'Bluebird!', cloudy: 'Overcast', flurries: 'Flurries', snow: 'Snowing', heavy: 'Heavy Snow', rain: 'Rain/Mix', windy: 'Windy', cold: 'Arctic Cold' }[d.type] || d.type;
  },
  forecastText(d, ahead) {
    const tot = d.snowNight + d.snowDay;
    if (tot <= 0) return '0 in';
    const err = ahead === 0 ? 0 : Math.min(0.5, 0.12 * ahead);
    const lo = Math.max(0, Math.round(tot * (1 - err) * (ahead ? d.fcErr * 0.9 + 0.1 : 1))), hi = Math.round(tot * (1 + err) * (ahead ? d.fcErr : 1));
    return ahead === 0 ? U.inch(tot) : `${U.inN(Math.min(lo, hi))}–${Math.max(1, U.inN(Math.max(lo, hi)))} in`;
  },
  stormOutlook() {
    // find next storm in forecast
    for (let k = 0; k < 6 && k < G.wx.length; k++) {
      const d = G.wx[k];
      if (d.storm) {
        const T = STORM_TYPES[d.storm];
        let total = 0, j = k; while (j < G.wx.length && G.wx[j].storm === d.storm) { total += G.wx[j].snowNight + G.wx[j].snowDay; j++; }
        return `${T.name} ${k === 0 ? 'in progress' : 'arriving ' + (k === 1 ? 'tomorrow' : 'in ' + k + ' days')} — ${U.inN(total * 0.75)}–${U.inN(total * 1.25)} in. ${T.desc}`;
      }
    }
    return 'High pressure. No major storms in the 6-day outlook.';
  },
};
