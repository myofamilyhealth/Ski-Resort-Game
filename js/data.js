// ---------- Game catalogs & constants ----------
// All manufacturer/model names are fictional.
const CELL = 12;          // meters per terrain cell
const MAP_W = 320;        // cells (3.8 km)
const MAP_H = 240;        // cells (2.9 km)
const PX = 5;             // buffer pixels per cell

const DIFF = {
  green:  { key: 'green',  name: 'Easiest',        color: '#2ecc40', max: 25,  icon: '●', short: 'Green' },
  blue:   { key: 'blue',   name: 'More Difficult', color: '#1f6feb', max: 40,  icon: '■', short: 'Blue' },
  black:  { key: 'black',  name: 'Most Difficult', color: '#111111', max: 60,  icon: '◆', short: 'Black' },
  dblack: { key: 'dblack', name: 'Experts Only',   color: '#111111', max: 999, icon: '◆◆', short: 'Dbl Black' },
};
const DIFF_ORDER = ['green', 'blue', 'black', 'dblack'];

// Guest skill mix (share of visitors) and which ratings they will ski
const SKILLS = [
  { key: 'beginner',     share: 0.22, allowed: ['green'],                          speed: 6 },
  { key: 'intermediate', share: 0.43, allowed: ['green', 'blue'],                  speed: 9 },
  { key: 'advanced',     share: 0.25, allowed: ['green', 'blue', 'black'],         speed: 12 },
  { key: 'expert',       share: 0.10, allowed: ['green', 'blue', 'black', 'dblack'], speed: 14 },
];

// Lift types. cap = persons per hour, speed m/s, cost = base + perM * length
const LIFTS = {
  carpet:  { name: 'Magic Carpet', cat: 'Surface', cap: 1200, speed: 0.9, maxLen: 150,  maxVert: 25,  base: 120000,  perM: 900,  ops: 1, maint: 60,   kw: 15,  wind: 30, days: 1,  seats: 1, beginner: true, desc: 'Conveyor belt for the learning area. Beginners love it.' },
  rope:    { name: 'Rope Tow', cat: 'Surface', cap: 600,  speed: 3.0, maxLen: 300,  maxVert: 70,  base: 45000,   perM: 160,  ops: 1, maint: 35,   kw: 20,  wind: 35, days: 1,  seats: 1, desc: 'Cheap and cheerful. Old-school surface lift.' },
  tbar:    { name: 'T-Bar', cat: 'Surface', cap: 1200, speed: 3.0, maxLen: 1300, maxVert: 400, base: 350000,  perM: 550,  ops: 2, maint: 140,  kw: 110, wind: 32, days: 2,  seats: 2, desc: 'Very wind resistant. Great for exposed alpine terrain.' },
  double:  { name: 'Fixed-Grip Double', cat: 'Chairlift', cap: 1200, speed: 2.3, maxLen: 1800, maxVert: 550, base: 700000,  perM: 900,  ops: 2, maint: 180,  kw: 160, wind: 20, days: 4,  seats: 2, desc: 'Classic two-seat chair. Slow but affordable.' },
  triple:  { name: 'Fixed-Grip Triple', cat: 'Chairlift', cap: 1800, speed: 2.3, maxLen: 1900, maxVert: 600, base: 950000,  perM: 1150, ops: 2, maint: 220,  kw: 220, wind: 20, days: 4,  seats: 3, desc: 'Three-seat fixed grip chair.' },
  quad:    { name: 'Fixed-Grip Quad', cat: 'Chairlift', cap: 2400, speed: 2.4, maxLen: 2000, maxVert: 650, base: 1300000, perM: 1400, ops: 3, maint: 270,  kw: 280, wind: 20, days: 5,  seats: 4, desc: 'Solid workhorse with good capacity.' },
  hsq:     { name: 'High-Speed Detachable Quad', cat: 'Detachable', cap: 2400, speed: 5.0, maxLen: 2800, maxVert: 800, base: 3200000, perM: 2300, ops: 3, maint: 420,  kw: 450, wind: 21, days: 7,  seats: 4, desc: 'Detaches at terminals for fast rides. Guests love it.' },
  six:     { name: 'Detachable Six-Pack', cat: 'Detachable', cap: 3000, speed: 5.5, maxLen: 3000, maxVert: 850, base: 5000000, perM: 2700, ops: 4, maint: 520,  kw: 600, wind: 22, days: 8,  seats: 6, desc: 'High capacity six-seat express.' },
  eight:   { name: 'Bubble Eight-Pack', cat: 'Detachable', cap: 3600, speed: 6.0, maxLen: 3200, maxVert: 900, base: 7200000, perM: 3200, ops: 4, maint: 640,  kw: 750, wind: 23, days: 9,  seats: 8, bubble: true, desc: 'Heated seats + weather bubble. Comfort on storm days.' },
  chondola:{ name: 'Chondola (Chairs + Cabins)', cat: 'Gondola', cap: 3000, speed: 5.5, maxLen: 3000, maxVert: 900, base: 8000000, perM: 3500, ops: 5, maint: 700,  kw: 700, wind: 21, days: 10, seats: 6, bubble: true, desc: 'Mixes chairs and 8-person cabins. Sightseers ride too.' },
  gondola: { name: 'Gondola (10-passenger)', cat: 'Gondola', cap: 3600, speed: 6.0, maxLen: 4500, maxVert: 1200, base: 11000000, perM: 4200, ops: 5, maint: 850,  kw: 900, wind: 20, days: 12, seats: 10, bubble: true, sightseeing: true, desc: 'Enclosed cabins. Big appeal and sightseeing revenue.' },
  funitel: { name: 'Funitel (Twin-Cable)', cat: 'Gondola', cap: 3200, speed: 6.0, maxLen: 3800, maxVert: 1100, base: 14000000, perM: 4800, ops: 5, maint: 950,  kw: 1000, wind: 35, days: 13, seats: 24, bubble: true, sightseeing: true, desc: 'Twin-haul-rope gondola. Keeps running in high wind.' },
  tram:    { name: 'Aerial Tram', cat: 'Tram', cap: 900,  speed: 10.0, maxLen: 3500, maxVert: 1300, base: 16000000, perM: 5200, ops: 6, maint: 1000, kw: 1100, wind: 28, days: 14, seats: 100, bubble: true, sightseeing: true, desc: 'Two huge cabins shuttle to the summit. Iconic.' },
};

// Buildings. levels: array of {cost, days, upkeep, ...stats}
const BUILDINGS = {
  office:   { name: 'Resort Office', icon: '🏢', color: '#4f6272', r: 12, levels: [
              { cost: 250000, days: 1, upkeep: 60 }],
              desc: 'Your HQ. The Resort Manager computer is on your desk.' },
  ticket:   { name: 'Ticket Office', icon: '🎟️', color: '#e8a33d', r: 14, levels: [
              { cost: 180000, days: 2, upkeep: 120, cap: 1500, staff: 3 }, { cost: 250000, days: 2, upkeep: 180, cap: 4000, staff: 5 }, { cost: 420000, days: 3, upkeep: 260, cap: 9000, staff: 8 }],
              desc: 'Sells lift tickets. Capacity = max day visitors served. Required to open.' },
  lodge:    { name: 'Base Lodge', icon: '🏔️', color: '#a0522d', r: 26, levels: [
              { cost: 1200000, days: 4, upkeep: 450, seats: 250 }, { cost: 1100000, days: 4, upkeep: 650, seats: 600 }, { cost: 2200000, days: 6, upkeep: 950, seats: 1200 }],
              desc: 'Food, restrooms, lockers and warmth. Seats limit food sales.' },
  parking:  { name: 'Parking Lot', icon: '🅿️', color: '#666', r: 34, levels: [
              { cost: 220000, days: 2, upkeep: 60, cars: 500 }, { cost: 260000, days: 2, upkeep: 90, cars: 1100 }, { cost: 600000, days: 3, upkeep: 140, cars: 2400 }],
              desc: 'Every car brings ~2.4 guests. Full lot = turned-away guests.' },
  rental:   { name: 'Rental Shop', icon: '🎿', color: '#3d8be8', r: 12, levels: [
              { cost: 300000, days: 2, upkeep: 110, rentals: 300, staff: 4 }, { cost: 350000, days: 2, upkeep: 160, rentals: 750, staff: 8 }, { cost: 600000, days: 3, upkeep: 230, rentals: 1600, staff: 14 }],
              desc: 'Ski & board rentals ($59/day).' },
  school:   { name: 'Ski & Ride School', icon: '🧑‍🏫', color: '#e83d8b', r: 12, levels: [
              { cost: 250000, days: 2, upkeep: 90, students: 120 }, { cost: 300000, days: 2, upkeep: 140, students: 300 }, { cost: 500000, days: 3, upkeep: 200, students: 650 }],
              desc: 'Lessons ($165). Needs instructors (6 students each). Converts beginners into loyal guests.' },
  restaurant:{ name: 'Mid-Mountain Restaurant', icon: '🍲', color: '#c0392b', r: 16, levels: [
              { cost: 1500000, days: 4, upkeep: 400, seats: 200 }, { cost: 1200000, days: 4, upkeep: 550, seats: 450 }, { cost: 2000000, days: 5, upkeep: 750, seats: 800 }],
              desc: 'On-mountain dining with a view. Big satisfaction boost when near lift tops.' },
  patrolhq: { name: 'Ski Patrol HQ', icon: '➕', color: '#d62828', r: 12, levels: [
              { cost: 350000, days: 2, upkeep: 120, resp: 1.0 }, { cost: 300000, days: 2, upkeep: 160, resp: 0.85 }, { cost: 500000, days: 3, upkeep: 210, resp: 0.7 }],
              desc: 'Required for ski patrol. Upgrades speed up response.' },
  patrolhut:{ name: 'Patrol Summit Hut', icon: '⛑️', color: '#d62828', r: 7, levels: [
              { cost: 120000, days: 1, upkeep: 40 }],
              desc: 'Stage patrollers up top. Each hut cuts response times.' },
  clinic:   { name: 'First Aid Clinic', icon: '🏥', color: '#f1f1f1', r: 10, levels: [
              { cost: 450000, days: 3, upkeep: 200 }, { cost: 400000, days: 3, upkeep: 280 }],
              desc: 'Treats injuries on site. Better outcomes, better reviews.' },
  garage:   { name: 'Vehicle Maintenance Shop', icon: '🔧', color: '#7f8c8d', r: 16, levels: [
              { cost: 500000, days: 3, upkeep: 150, bays: 4 }, { cost: 450000, days: 3, upkeep: 220, bays: 9 }, { cost: 700000, days: 4, upkeep: 300, bays: 16 }],
              desc: 'Required to own groomers & snowmobiles. Bays = vehicle capacity.' },
  pumphouse:{ name: 'Snowmaking Pump House', icon: '💧', color: '#5dade2', r: 12, levels: [
              { cost: 900000, days: 4, upkeep: 200, km: 3 }, { cost: 1100000, days: 4, upkeep: 300, km: 7 }, { cost: 1800000, days: 5, upkeep: 420, km: 14 }],
              desc: 'Powers snow guns. Level = km of trail it can supply.' },
  hotel:    { name: 'Slopeside Hotel', icon: '🏨', color: '#8e44ad', r: 22, levels: [
              { cost: 4500000, days: 8, upkeep: 900, rooms: 60 }, { cost: 5500000, days: 8, upkeep: 1600, rooms: 160 }, { cost: 9000000, days: 10, upkeep: 2600, rooms: 320 }],
              desc: 'Overnight guests ($260/night) who ski every day.' },
  bar:      { name: 'Après Bar', icon: '🍻', color: '#d35400', r: 9, levels: [
              { cost: 280000, days: 2, upkeep: 90 }, { cost: 300000, days: 2, upkeep: 130 }],
              desc: 'Après-ski! Revenue and happier guests.' },
  retail:   { name: 'Retail Shop', icon: '🛍️', color: '#16a085', r: 9, levels: [
              { cost: 200000, days: 2, upkeep: 70 }, { cost: 260000, days: 2, upkeep: 110 }],
              desc: 'Goggles, gloves and logo hats.' },
  restroom: { name: 'Warming Hut & Restrooms', icon: '🚻', color: '#95a5a6', r: 7, levels: [
              { cost: 90000, days: 1, upkeep: 30 }],
              desc: 'Small on-mountain comfort station.' },
  condo:    { name: 'Village Condos', icon: '🏘️', color: '#6c5ce7', r: 20, levels: [
              { cost: 2600000, days: 6, upkeep: 500, rooms: 40 }, { cost: 3200000, days: 6, upkeep: 900, rooms: 100 }, { cost: 5000000, days: 8, upkeep: 1400, rooms: 200 }],
              desc: 'Slopeside condos ($210/night). Overnight guests ski every day.' },
  housing:  { name: 'Staff Housing', icon: '🏠', color: '#a1887f', r: 16, levels: [
              { cost: 900000, days: 4, upkeep: 250, morale: 6 }, { cost: 900000, days: 4, upkeep: 380, morale: 12 }],
              desc: 'Affordable beds for your crew. Raises staff morale.' },
  daycare:  { name: 'Kids Club & Daycare', icon: '🧸', color: '#ff9ff3', r: 10, levels: [
              { cost: 350000, days: 2, upkeep: 120, kids: 60 }, { cost: 400000, days: 3, upkeep: 180, kids: 140 }],
              desc: 'Parents ski while kids play ($125/day). Families love it.' },
  rink:     { name: 'Ice Skating Rink', icon: '⛸️', color: '#74b9ff', r: 13, levels: [
              { cost: 450000, days: 3, upkeep: 140 }, { cost: 350000, days: 2, upkeep: 200 }],
              desc: 'Evening fun for everyone ($18 skate rental).' },
  spa:      { name: 'Spa & Hot Pools', icon: '♨️', color: '#00b894', r: 14, levels: [
              { cost: 1400000, days: 5, upkeep: 380 }, { cost: 1200000, days: 4, upkeep: 520 }],
              desc: 'Soak after skiing ($95). Big boost to guest happiness.' },
  tubing:   { name: 'Tubing Hill', icon: '🛟', color: '#fdcb6e', r: 16, levels: [
              { cost: 300000, days: 2, upkeep: 110 }, { cost: 250000, days: 2, upkeep: 150 }],
              desc: 'Snow tubing lanes with a tow ($35). Great for non-skiers.' },
  shuttle:  { name: 'Shuttle Bus Stop', icon: '🚌', color: '#e17055', r: 9, levels: [
              { cost: 180000, days: 1, upkeep: 260, riders: 500 }, { cost: 220000, days: 1, upkeep: 400, riders: 1200 }],
              desc: 'Free buses from town. Brings guests without needing parking.' },
  tune:     { name: 'Ski Tuning Shop', icon: '🛠️', color: '#636e72', r: 8, levels: [
              { cost: 160000, days: 1, upkeep: 60 }],
              desc: 'Waxing & edge tuning ($40).' },
  plaza:    { name: 'Village Plaza & Fire Pits', icon: '🔥', color: '#d63031', r: 15, levels: [
              { cost: 250000, days: 2, upkeep: 70 }, { cost: 350000, days: 2, upkeep: 110 }],
              desc: 'A cozy heart for the village. Small happiness boost, bigger with events.' },
  waffle:   { name: 'Waffle & Coffee Hut', icon: '🧇', color: '#e1b12c', r: 7, levels: [
              { cost: 180000, days: 1, upkeep: 60, seats: 40 }],
              desc: 'Tiny on-mountain snack shack. Adds seats & happiness.' },
  heli:     { name: 'Heli-Ski Base', icon: '🚁', color: '#2d3436', r: 12, levels: [
              { cost: 2500000, days: 5, upkeep: 900 }],
              desc: 'Expert guests pay $1,100 for a day of backcountry powder.' },
  kennel:   { name: 'Avalanche Dog Kennel', icon: '🐕', color: '#b9770e', r: 8, levels: [
              { cost: 150000, days: 2, upkeep: 50, dogs: 2 }, { cost: 120000, days: 2, upkeep: 70, dogs: 4 }, { cost: 180000, days: 2, upkeep: 90, dogs: 8 }],
              desc: 'Home for avalanche rescue dogs. Required before adopting dogs.' },
};

// Groomers (snowcats) — fictional
const GROOMERS = {
  compact: { name: 'Alpine Cub 180', price: 220000, width: 4.2, speed: 4.2, fuel: 12, winch: false, park: false, maxSlope: 40, color: '#e74c3c', desc: 'Compact cat for beginner areas and cat tracks.' },
  std:     { name: 'Ridgeline 400', price: 420000, width: 6.4, speed: 5.0, fuel: 20, winch: false, park: false, maxSlope: 45, color: '#e67e22', desc: 'The all-round workhorse.' },
  wide:    { name: 'Ridgeline 500 Plus', price: 520000, width: 6.8, speed: 5.5, fuel: 23, winch: false, park: false, maxSlope: 48, color: '#f1c40f', desc: 'Wider tiller, more power, LED light bar.' },
  winch:   { name: 'Ridgeline 600 Winch', price: 690000, width: 6.4, speed: 4.8, fuel: 27, winch: true, park: false, maxSlope: 100, color: '#c0392b', desc: 'Winch cat. Grooms black & double-black pitches.' },
  park:    { name: 'Freestyle Pro 550', price: 610000, width: 6.4, speed: 4.8, fuel: 24, winch: false, park: true, maxSlope: 48, color: '#9b59b6', desc: 'Park package: shapes jumps, rails & halfpipe.' },
  polar:   { name: 'Glacier 700 Polar', price: 820000, width: 7.0, speed: 5.5, fuel: 30, winch: true, park: true, maxSlope: 100, color: '#2980b9', desc: 'Flagship: winch, park tools, huge tiller.' },
};

const SNOWMOBILES = {
  util:   { name: 'Trailblazer 550 Utility', price: 11000, upkeep: 12, resp: 0.06, desc: 'Basic workhorse sled.' },
  patrol: { name: 'Patrol 800 + Rescue Toboggan', price: 18000, upkeep: 16, resp: 0.10, desc: 'Fast patrol sled towing a rescue toboggan.' },
  cross:  { name: 'Crossover 850 Mountain', price: 21000, upkeep: 18, resp: 0.12, desc: 'Deep-snow capable for backcountry rescue.' },
  utv:    { name: 'Tracked Side-by-Side UTV', price: 36000, upkeep: 25, resp: 0.14, desc: '4-seat tracked UTV. Mechanics & patrol.' },
};

const DOG_BREEDS = [
  { breed: 'German Shepherd', price: 6500, nose: 1.0 },
  { breed: 'Labrador Retriever', price: 5000, nose: 0.95 },
  { breed: 'Golden Retriever', price: 5200, nose: 0.9 },
  { breed: 'Border Collie', price: 5800, nose: 1.0 },
  { breed: 'Belgian Malinois', price: 7500, nose: 1.05 },
];

const PARK_FEATURES = {
  sjump: { name: 'Small Jump', cost: 15000, icon: 'jump', size: 1, draw: 0.5 },
  mjump: { name: 'Medium Jump', cost: 30000, icon: 'jump', size: 1.5, draw: 0.8 },
  ljump: { name: 'Big Air Jump', cost: 60000, icon: 'jump', size: 2.2, draw: 1.3, risk: 1 },
  box:   { name: 'Box', cost: 8000, icon: 'box', size: 1, draw: 0.4 },
  rail:  { name: 'Rail', cost: 12000, icon: 'rail', size: 1, draw: 0.6 },
  wall:  { name: 'Wall Ride', cost: 20000, icon: 'wall', size: 1, draw: 0.6 },
  pipe:  { name: 'Superpipe (22ft)', cost: 350000, icon: 'pipe', size: 4, draw: 2.5, needsPark: true },
};

const STAFF = {
  liftop:   { name: 'Lift Operators', wage: 150, desc: 'Run lifts. Each lift needs a crew.' },
  patrol:   { name: 'Ski Patrollers', wage: 195, desc: 'First responders, avalanche control, sweep.' },
  groomer:  { name: 'Groomer Operators', wage: 230, desc: 'Night shift. One per snowcat.' },
  snowmaker:{ name: 'Snowmakers', wage: 205, desc: 'Run the guns overnight.' },
  instructor:{ name: 'Ski Instructors', wage: 175, desc: '6 students each per day.' },
  rental:   { name: 'Rental Techs', wage: 135, desc: 'Fit boots and tune skis.' },
  food:     { name: 'Food & Beverage', wage: 125, desc: 'One per ~30 seats.' },
  mechanic: { name: 'Lift & Fleet Mechanics', wage: 245, desc: 'Prevent breakdowns, fix them faster.' },
  park:     { name: 'Terrain Park Crew', wage: 155, desc: 'Shape and maintain features.' },
  guest:    { name: 'Guest Services', wage: 130, desc: 'Ticket windows & info desks.' },
  handler:  { name: 'Avalanche Dog Handlers', wage: 210, desc: 'One per rescue dog.' },
};

const CAMPAIGNS = {
  social:   { name: 'Social Media Campaign', cost: 1500, perDay: true, days: 10, aw: 1.0, desc: 'Reels, stories and paid posts. Young crowd + park riders.', park: 0.3 },
  email:    { name: 'Email Newsletter', cost: 400, perDay: true, days: 14, aw: 0.35, desc: 'Bring back past guests.', loyal: true },
  radio:    { name: 'Local Radio Spots', cost: 900, perDay: true, days: 14, aw: 0.6, desc: 'Day-trippers from nearby towns.' },
  billboard:{ name: 'Highway Billboards', cost: 38000, perDay: false, days: 30, aw: 0.55, desc: 'Steady awareness for a month.' },
  tv:       { name: 'Regional TV Commercial', cost: 120000, perDay: false, days: 14, aw: 2.2, desc: 'Big reach. Pricey.' },
  magazine: { name: 'Ski Magazine Feature', cost: 65000, perDay: false, days: 1, aw: 9, desc: 'One-time awareness spike (+rep if your rep is good).' },
  influencer:{ name: 'Influencer Ski Trip', cost: 25000, perDay: false, days: 1, aw: 7, desc: 'Better with powder or a good terrain park!' , park: 1 },
  powder:   { name: 'Powder Alert Blast', cost: 3000, perDay: false, days: 2, aw: 0, desc: 'Push notification on storm days: big surge if it snowed.', powder: true },
  expo:     { name: 'Ski Expo Booth', cost: 35000, perDay: false, days: 1, aw: 4, desc: 'Boosts season pass sales (pre-season).', pass: true },
};

const EVENTS = {
  railjam:  { name: 'Rail Jam Contest', cost: 15000, needs: 'park', visitors: 0.25, rep: 3, desc: 'Needs a terrain park with rails/boxes.' },
  torch:    { name: 'Torchlight Parade + Fireworks', cost: 30000, visitors: 0.2, rep: 3, desc: 'Instructors ski down with flares at dusk.' },
  demo:     { name: 'Gear Demo Day', cost: 8000, visitors: 0.12, rep: 1, desc: 'Brands bring next season\'s skis.' },
  pond:     { name: 'Spring Pond Skim', cost: 12000, visitors: 0.3, rep: 4, spring: true, desc: 'March & April only. Costumes required.' },
  bigair:   { name: 'Big Air Competition', cost: 60000, needs: 'bigjump', visitors: 0.45, rep: 6, desc: 'Needs a Big Air Jump in your park.' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_TEMP = { 9: 1, 10: -3, 11: -7, 0: -9, 1: -8, 2: -4, 3: 0, 4: 3 }; // mid-mountain mean °C (Oct..Apr)
const MONTH_STORM = { 9: 0.12, 10: 0.22, 11: 0.3, 0: 0.3, 1: 0.3, 2: 0.27, 3: 0.17, 4: 0.1 };

// Snowmaking gun systems (per run). install/upgrade cost is per meter of trail.
const SNOWGUNS = [
  { name: 'Basic Fan Guns', short: 'Basic', perM: 185, temp: -3, out: 1.0, cost: 1.0, crew: 1.0, desc: 'Manual fan guns. Need -3°C or colder.' },
  { name: 'Automated Fan Guns', short: 'Automated', perM: 120, temp: -2, out: 1.4, cost: 0.85, crew: 0.7, desc: 'Weather-sensing guns. Work at -2°C, 40% more snow, fewer crew.' },
  { name: 'Low-Energy Tower Guns', short: 'Tower', perM: 160, temp: -1, out: 1.8, cost: 0.65, crew: 0.5, desc: 'Top-of-the-line towers. Work at -1°C, 80% more snow, cheapest to run.' },
];

// Mountains you can buy at the start. Terrain is generated from these settings.
const SITES = [
  { key: 'cedar', name: 'Cedar Basin', price: 1200000, vert: 0.72, ridges: 0.6, peaks: 0.55, trees: 1.25, snow: 0.9, lake: true,
    desc: 'A gentle, heavily forested valley with lots of easy terrain. Cheap land, great for families and beginners.', tags: ['Easy terrain', 'Lots of trees', 'Cheap'] },
  { key: 'silver', name: 'Silver Creek Valley', price: 2200000, vert: 1.0, ridges: 1.0, peaks: 1.0, trees: 1.0, snow: 1.0, lake: true,
    desc: 'A balanced mountain with creeks, a pond near the base and a mix of every run level.', tags: ['Balanced', 'Creeks & pond', 'Good snow'] },
  { key: 'granite', name: 'Granite Peak', price: 3400000, vert: 1.3, ridges: 1.45, peaks: 1.5, trees: 0.75, snow: 1.2, lake: false,
    desc: 'Huge vertical, cliffs, alpine bowls and deep snow. Expensive land, built for experts.', tags: ['Huge vertical', 'Steep & rocky', 'Most snow'] },
];
