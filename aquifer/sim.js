/* The Aquifer — simulation core.
 * Plain script: defines window.AquiferSim in a browser, module.exports in Node.
 * Units: depth-to-water h[i] in metres BELOW the land surface (bigger = deeper).
 * Everything here is a simplified, invented scenario model. The RELATIONSHIPS
 * (cones of depression, shallow wells failing first, losing/gaining rivers,
 * recovery needing intervention) are research-backed; the NUMBERS are not.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AquiferSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- Valley geometry -----------------------------------------------------
  const N = 64;               // columns across the valley
  const DX = 100;             // metres per column
  const DEPTH_INTO_PAGE = 1000; // metres (valley "thickness" for volume math)
  const CELL_AREA = DX * DEPTH_INTO_PAGE;
  const BEDROCK = 100;        // metres below surface
  const SY = 0.15;            // specific yield of the aquifer
  const D = 5.0e4;            // lateral spreading coefficient, m^2/yr (tuned, invented)
  const INFIL = 0.30;         // fraction of rain that becomes recharge (invented)
  const EDGE_INFLOW = 0.15;   // mountain-front recharge at edges, m head/yr
  const RIVER_COL = 20;
  const RIVER_STAGE = 7.5;    // river-bed depth below surface (m)
  const RIVER_K = 0.25;       // river–aquifer exchange rate (1/yr)
  const NORMAL_RAIN = 450;    // mm/yr
  const YEARS = 20;
  const START_YEAR = 2026;

  // Scripted rainfall so the learning beat lands: 2 normal years, then a
  // 4-year drought, an atmospheric-river year, and a mixed back half.
  const RAIN = [520, 470, 300, 240, 210, 260, 720, 450, 380, 330,
                250, 220, 610, 500, 420, 310, 280, 660, 480, 400];

  const CROPS = {
    orchard: { label: 'Orchard (almonds)', pump: 650000, income: 260000 },
    row:     { label: 'Row crops',         pump: 380000, income: 160000 },
    fallow:  { label: 'Fallowed',          pump: 0,      income: 0 }
  };

  const COSTS = {
    deepen: { farm: 300000, home: 60000, town: 200000 },
    crop: { 'orchard>row': 50000, 'row>fallow': 0, 'orchard>fallow': 0,
            'fallow>row': 30000, 'row>orchard': 120000, 'fallow>orchard': 150000 },
    importWater: 150000,   // per year while on
    basin: { sand: 200000, clay: 120000 }
  };

  function makeWell(id, col, depth, kind, label, owner) {
    return { id, col, depth, kind, label, owner, dry: false, dryYear: null, deepened: false };
  }

  function initialState() {
    const h = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      // gentle slope toward the river (water table is a subdued copy of the land)
      h[i] = 6; // a healthy valley: water table ~6 m down, above the river bed
    }
    const wells = [
      makeWell('w_farmA', 34, 32, 'farm', 'Delgado Farm well (1978)', 'farmA'),
      makeWell('w_home1', 31, 20, 'home', 'Rivera family well', 'home1'),
      makeWell('w_home2', 38, 22, 'home', 'Nguyen family well', 'home2'),
      makeWell('w_farmB', 50, 40, 'farm', 'Okafor Farm well',  'farmB'),
      makeWell('w_home3', 54, 20, 'home', 'Baptiste family well', 'home3'),
      makeWell('w_town',  10, 30, 'town', 'Town well',          'town')
    ];
    const farms = {
      farmA: { id: 'farmA', name: 'Delgado Farm', col: 34, crop: 'orchard', wellId: 'w_farmA' },
      farmB: { id: 'farmB', name: 'Okafor Farm',  col: 50, crop: 'row',     wellId: 'w_farmB' }
    };
    return {
      year: 0, calendarYear: START_YEAR,
      h, h0: Float64Array.from(h),
      wells, farms,
      town: { col: 10, pump: 420000, importOn: false },
      river: { col: RIVER_COL, flow: 1.0, status: 'gaining' },
      basins: [],            // { col, soil:'sand'|'clay', factor }
      pumpCap: 1.0,          // multiplier on farm pumping (policy)
      budget: 350000, fund: 0,
      income: 0, cumulativeIncome: 0,
      rain: null, rainHistory: [],
      meanHistory: [],       // mean depth-to-water after each year
      log: [], events: [],
      finished: false
    };
  }

  // ---- Helpers --------------------------------------------------------------
  function meanDepth(h) { let s = 0; for (let i = 0; i < N; i++) s += h[i]; return s / N; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wellById(s, id) { return s.wells.find(w => w.id === id); }
  function pumpIntake(w) { return w.depth - 3; } // pump sits 3 m above the bottom
  function isDryAt(w, h) { return h[w.col] > pumpIntake(w); }

  function pumpingPlan(s) {
    // m^3/yr demanded at each column this year
    const q = new Float64Array(N);
    const deficit = clamp((NORMAL_RAIN - s.rain) / NORMAL_RAIN, -0.3, 0.6);
    const irrigMult = 1 + 0.8 * deficit; // dry years need more irrigation
    for (const f of Object.values(s.farms)) {
      const w = wellById(s, f.wellId);
      if (w.dry) continue;
      q[w.col] += CROPS[f.crop].pump * irrigMult * s.pumpCap;
    }
    const tw = wellById(s, 'w_town');
    if (!tw.dry) q[tw.col] += s.town.pump * (s.town.importOn ? 0.3 : 1.0);
    for (const w of s.wells) if (w.kind === 'home' && !w.dry) q[w.col] += 1500;
    return q;
  }

  function stepYear(s) {
    if (s.finished) return s;
    s.rain = RAIN[s.year];
    s.rainHistory.push(s.rain);
    const q = pumpingPlan(s);
    const h = s.h;
    const hBefore = Float64Array.from(h);

    // recharge from rain (head rise), plus mountain-front inflow at the edges
    const rechargeHead = (s.rain / 1000) * INFIL / SY;
    // managed recharge basins only capture water in wet years
    const wet = s.rain > NORMAL_RAIN;
    const basinHead = new Float64Array(N);
    for (const b of s.basins) {
      if (!wet) continue;
      const excess = (s.rain - NORMAL_RAIN) / 1000; // m of "surplus" rain
      // capture area ~ 3 km^2 of runoff, routed into a 1-cell basin (invented)
      const captured = excess * 4.0e6 * b.factor;      // m^3
      basinHead[b.col] += captured / (SY * CELL_AREA);
    }

    // explicit diffusion with sources/sinks, sub-stepped for stability
    const alpha = D / (DX * DX);           // per year
    const sub = Math.ceil(alpha / 0.4);
    const dt = 1 / sub;
    const tmp = new Float64Array(N);
    for (let k = 0; k < sub; k++) {
      for (let i = 0; i < N; i++) {
        const l = h[i > 0 ? i - 1 : i];          // no-flow at the valley edges
        const r = h[i < N - 1 ? i + 1 : i];
        const lap = (l - 2 * h[i] + r) / (DX * DX);
        let dh = D * lap;                  // lateral flow evens out the water table
        dh -= rechargeHead;                // rain raises the water table
        dh -= basinHead[i];
        dh += q[i] / (SY * CELL_AREA);     // pumping lowers it
        if (i === 0 || i === N - 1) dh -= EDGE_INFLOW;
        if (i === RIVER_COL) dh -= RIVER_K * (h[i] - RIVER_STAGE); // losing if deep, gaining if shallow
        tmp[i] = clamp(h[i] + dh * dt, 0.5, BEDROCK);
      }
      h.set(tmp);
    }

    // river condition: head at the river column relative to the river bed
    const gap = h[RIVER_COL] - RIVER_STAGE;
    if (gap < 0) { s.river.status = 'gaining'; }
    else if (gap < 6) { s.river.status = 'losing'; }
    else { s.river.status = 'disconnected'; }
    s.river.flow = clamp(1 + (s.rain - NORMAL_RAIN) / 900 - Math.max(0, gap) * 0.07, 0, 1.6);

    // well status
    const newlyDry = [];
    for (const w of s.wells) {
      if (!w.dry && isDryAt(w, h)) { w.dry = true; w.dryYear = s.calendarYear; newlyDry.push(w); }
    }

    // economics
    // Farm income is the valley's economy; the player's budget is a public fund
    // fed by a 12% levy on farm income plus the town's water rates.
    let farmIncome = 0;
    for (const f of Object.values(s.farms)) {
      const w = wellById(s, f.wellId);
      if (!w.dry) farmIncome += CROPS[f.crop].income * (0.7 + 0.3 * s.pumpCap);
    }
    let fund = 0.12 * farmIncome + 90000;
    if (s.town.importOn) fund -= COSTS.importWater;
    const tw = wellById(s, 'w_town');
    if (tw.dry && !s.town.importOn) fund -= 120000; // emergency water hauling
    s.income = farmIncome; s.cumulativeIncome += farmIncome; s.fund = fund; s.budget += fund;
    if (s.budget < 0 && s.town.importOn) {
      s.town.importOn = false;
      s.log.push('  • The fund ran dry: imported water contract cancelled');
    }
    const income = farmIncome;

    const meanNow = meanDepth(h);
    s.meanHistory.push(meanNow);
    const delta = meanNow - meanDepth(hBefore);

    s.year += 1; s.calendarYear = START_YEAR + s.year;
    const ev = { year: s.calendarYear - 1, rain: s.rain, wet, drought: s.rain < 320,
                 delta, newlyDry: newlyDry.map(w => w.id), river: s.river.status, income };
    s.events.push(ev);
    s.log.push(`${ev.year}: rain ${s.rain} mm, water table ${delta >= 0 ? 'fell' : 'rose'} ${Math.abs(delta).toFixed(1)} m` +
               (newlyDry.length ? `; DRY: ${newlyDry.map(w => w.label).join(', ')}` : ''));
    if (s.year >= YEARS) s.finished = true;
    return ev;
  }

  // ---- Player actions --------------------------------------------------------
  function can(s, cost) { return s.budget >= cost; }
  function spend(s, cost, msg) { s.budget -= cost; s.log.push(`  • ${msg} ($${(cost / 1000).toFixed(0)}k)`); }

  const actions = {
    deepen(s, wellId) {
      const w = wellById(s, wellId);
      const cost = COSTS.deepen[w.kind];
      const newDepth = { farm: 90, home: 45, town: 70 }[w.kind];
      if (!w || w.deepened || !can(s, cost)) return false;
      spend(s, cost, `Deepened ${w.label} to ${newDepth} m`);
      w.depth = newDepth; w.deepened = true;
      if (!isDryAt(w, s.h)) { w.dry = false; }
      return true;
    },
    setCrop(s, farmId, crop) {
      const f = s.farms[farmId];
      if (!f || f.crop === crop || !CROPS[crop]) return false;
      const cost = COSTS.crop[`${f.crop}>${crop}`];
      if (cost === undefined || !can(s, cost)) return false;
      spend(s, cost, `${f.name}: ${CROPS[f.crop].label} → ${CROPS[crop].label}`);
      f.crop = crop; return true;
    },
    importWater(s, on) {
      if (on && !can(s, COSTS.importWater)) return false;
      s.town.importOn = !!on;
      s.log.push(`  • Imported water for the town turned ${on ? 'ON ($150k/yr)' : 'OFF'}`);
      return true;
    },
    buildBasin(s, soil) {
      if (s.basins.length >= 2) return false;
      const cost = COSTS.basin[soil];
      if (!can(s, cost)) return false;
      const col = soil === 'sand' ? RIVER_COL + 3 : 44; // sandy site by the river; clay site inland
      spend(s, cost, `Built a recharge basin on ${soil === 'sand' ? 'sandy ground near the river' : 'clay-rich ground'}`);
      s.basins.push({ col, soil, factor: soil === 'sand' ? 1.0 : 0.3 });
      return true;
    },
    pumpCap(s, level) {
      if (![1.0, 0.8, 0.6].includes(level)) return false;
      s.pumpCap = level;
      s.log.push(`  • Farm pumping cap set to ${Math.round(level * 100)}% of demand`);
      return true;
    }
  };

  // A working well whose water level is within 6 m of the pump intake
  function struggling(s) {
    return s.wells.filter(w => !w.dry && s.h[w.col] > pumpIntake(w) - 6);
  }

  function summary(s) {
    const working = s.wells.filter(w => !w.dry).length;
    const change = meanDepth(s.h0) - meanDepth(s.h); // + = water table rose
    const last3 = s.meanHistory.slice(-3);
    const recovering = last3.length === 3 && last3[2] < last3[0];
    const homesOk = s.wells.filter(w => w.kind === 'home' && !w.dry).length;
    return { working, total: s.wells.length, change, recovering, homesOk,
             river: s.river.status, budget: s.budget, cumulativeIncome: s.cumulativeIncome };
  }

  return { N, DX, BEDROCK, RIVER_COL, RIVER_STAGE, YEARS, START_YEAR, NORMAL_RAIN, RAIN, CROPS, COSTS,
           initialState, stepYear, actions, summary, struggling, meanDepth, pumpIntake, isDryAt, wellById };
});
