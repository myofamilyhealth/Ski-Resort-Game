# 🏔️ Powderline: Ski Resort Tycoon

A ski resort game that runs in your browser. Tour three mountains in 3D and buy one. Name your resort, then build it from the ground up. Walk around the resort you built, ride your own lifts and ski your own runs in first person. You run the business from the **Resort Manager** computer on your office desk.

## Play

Nothing to install. Open `index.html` in Chrome, Edge, Firefox or Safari (a computer with a mouse and keyboard works best). The game saves every night in your browser's storage.

## How it plays

1. **Choose a mountain.** Pick Cedar Basin (gentle and cheap), Silver Creek Valley (balanced) or Granite Peak (huge and steep). Fly over each one in 3D, buy one and name your resort.
2. **Your office.** You start inside your office next to a small starter village (ticket office, lodge, parking, rentals, patrol, and a maintenance shop with one snowcat). Walk to the desk and press **E** to open the Resort Manager.
3. **Build** your first lift and runs, then grow the village. Everything appears in the 3D world, which always matches the manager map.
4. **Watch construction.** Helicopters fly towers in for chairlifts, tower cranes build gondola and tram stations, and excavators dig for surface lifts.
5. **Go outside** (🚶 Walk the resort). Talk to your staff (lift operators, patrol, instructors, the dog handler and avalanche dog). Ride a lift and ski down.
6. **Groom at night** in a snowcat, in 3D, using the headlights.
7. **Speed up days** or **skip a whole season** whenever you like.

### 3D controls
| Input | Action |
|---|---|
| Click the view, then move the mouse | Look around |
| W A S D / Shift | Walk / run |
| E | Use the office computer, ride a lift, talk to people |
| K | Skis on / off |
| Skiing | Look where you want to go · A/D turn · S snowplow · Space jump |
| Tab / M / H | Fast travel / big map / help |
| Snowcat | W/S drive · A/D steer · Space tiller · B blade · E winch · Esc end shift |

The 3D view is drawn with [Three.js](https://threejs.org) (bundled in `js/vendor`, MIT license), so the game works offline.

## What's in the game

| System | Details |
|---|---|
| **Terrain** | A generated mountain with about 750 m of vertical, ridges and gullies, cliff bands, a treeline and forests. Slope overlay: green < 25%, blue 25–40%, black 40–60%, red > 60%. |
| **Run design** | Click your way down from a lift top. Each run is rated automatically from its steepest sustained pitch (● ■ ◆ ◆◆). Traverses make a run easier. Logging and grading costs are calculated as you draw. |
| **Tree cutting** | Brush tool for gladed terrain, wider trails and building sites. |
| **13 lift types** | Magic carpet, rope tow, T-bar, fixed-grip double/triple/quad, detachable quad, six-pack, bubble eight-pack, chondola, gondola, funitel and aerial tram. Each has its own capacity, speed, length and vertical limits, wind limit, crew size, power use and build time. |
| **Facilities** | Ticket office, base lodge, parking, rentals, ski school, mid-mountain restaurant, patrol HQ, summit patrol huts, clinic, maintenance shop, snowmaking pump house, hotel, après bar, retail, warming huts and an avalanche dog kennel. Most of them can be upgraded. |
| **Economy** | Revenue from day tickets, season passes, rentals, lessons, food, retail, bar, lodging, sightseeing and parking. Costs include wages, lift power and maintenance, fuel, snowmaking, insurance and loan interest. It's tuned so you can turn a profit without much trouble. |
| **Guests** | Demand depends on awareness, reputation, snow, weather, weekends and holidays, and how your price compares with what guests think is fair. Satisfaction covers lift lines, grooming, snow, terrain variety, facilities, safety, value, the terrain park and comfort. Guests leave written reviews. |
| **Staff** | 11 roles with recommended crew sizes, plus an auto-hire button, a pay-rate slider and morale. |
| **Grooming** | Runs get skied off during the day and the night crew grooms them by priority. Steep pitches need a **winch cat**. You can also **drive a snowcat yourself at night** using headlights, the tiller, the blade, the winch, a fuel gauge, trail-marker poles and a grooming minimap. |
| **Fleet** | 6 snowcat models (compact, standard, wide, winch, park and flagship) plus snowmobiles and a tracked UTV for patrol. |
| **Weather** | Storm cycles (Alberta clippers, Pacific storms, upslope storms and atmospheric rivers), a 7-day forecast, wind holds, melt and freeze, rain, and powder days. |
| **Snowmaking** | Pump-house capacity, snow guns installed per run, and nights cold enough to make snow. |
| **Ski patrol** | Incidents with response times, an avalanche danger scale, avalanche control work, slides, and **avalanche rescue dogs** (5 breeds) that improve with training. |
| **Terrain parks** | Jumps, rails, boxes, wall rides and a superpipe. Park quality depends on the park crew and a park cat. |
| **Marketing** | Social media, email, radio, billboards, TV, magazine features, influencer trips, powder alerts and ski expos. Events include rail jams, torchlight parades, demo days, pond skims and big air contests. |

## Controls

| Input | Action |
|---|---|
| Right-drag / WASD | Pan |
| Mouse wheel | Zoom |
| Q R T L B P M X | Select, Runs, Trees, Lifts, Buildings, Park, Snowmaking, Demolish |
| Space / 1–4 | Pause / game speed |
| Enter / Backspace / Esc | Finish run / undo point / cancel |
| **Driving a groomer** | W/S throttle, A/D steer, Space tiller, B blade, E winch, Esc to end shift |

## Code layout

Plain JavaScript and Canvas 2D, with no build step and no dependencies.

```
index.html, css/style.css
js/util.js      helpers, noise, RNG
js/data.js      catalogs (lifts, buildings, groomers, staff, campaigns…)
js/terrain.js   heightmap, trees, layered rendering
js/weather.js   storm cycles & forecast
js/world.js     game state, placement/validation, lift-run network
js/sim.js       day/night loop, guests, economy, patrol, avalanches
js/grooming.js  night crews + drivable snowcat
js/agents.js    animated skiers
js/render.js    map rendering, night mode, minimap
js/ui.js        tools, panels, management screens
js/world3d.js   first-person 3D resort (terrain, trees, lifts, village, NPCs, skiing, grooming)
js/tutorial.js  step-by-step guide
js/main.js      mountain selection, save/load, boot, main loop
```
