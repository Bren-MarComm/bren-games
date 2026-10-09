/* The Aquifer — rendering and interaction. Depends on sim.js (AquiferSim). */
(function () {
  'use strict';
  const S = window.AquiferSim;
  const $ = id => document.getElementById(id);

  // ---- Canvas geometry -----------------------------------------------------
  const cv = $('valley'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const SURF = 210;                        // y of the land surface
  const PXM = (H - SURF - 16) / S.BEDROCK; // pixels per metre underground
  const COLW = W / S.N;
  const cx = col => (col + 0.5) * COLW;
  const yOfDepth = d => SURF + d * PXM;

  // ---- State ---------------------------------------------------------------
  let s, hShown, hFrom, hTo, animStart = 0, animDur = 900, raf = null;
  let highlight = null;      // { col, label } for the "Why?" cone overlay
  let tick = 0;              // animation frame counter for water sparkle
  let lastRain = null;

  function reset() {
    s = S.initialState();
    hShown = Float64Array.from(s.h); hFrom = Float64Array.from(s.h); hTo = Float64Array.from(s.h);
    highlight = null; lastRain = null;
    $('log').textContent = '';
    buildRows(); refresh(); drawChart();
    openEvent({ tag: 'Mission', cls: '', title: 'Keep the valley alive for 20 years',
      body: `<p>Underneath this valley is an aquifer: rock and sand with water in the gaps. Farms, families and the town all drink from it through wells of different depths.</p>
             <p>Each year, rain tops it up and pumping draws it down. <b>Watch the blue line.</b> That's the water table. When it drops below a well's pump, that well goes dry.</p>
             <p>Press <b>Next year</b> and see what happens. Hover any well to inspect it.</p>`,
      buttons: [{ label: 'Start', primary: true }] });
  }

  // ---- Drawing -------------------------------------------------------------
  function skyColours(rain) {
    if (rain === null) return ['#79b8e8', '#d9ecf8'];
    if (rain > 600) return ['#5d7f9c', '#b9c9d6'];
    if (rain < 320) return ['#c9a26a', '#f1dcb3'];
    return ['#79b8e8', '#d9ecf8'];
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // sky
    const [c1, c2] = skyColours(lastRain);
    const sky = ctx.createLinearGradient(0, 0, 0, SURF); sky.addColorStop(0, c1); sky.addColorStop(1, c2);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, SURF);
    // rain streaks in a wet year
    if (lastRain !== null && lastRain > 600) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 90; i++) { const x = (i * 97 + tick * 3) % W, y = (i * 53 + tick * 7) % SURF; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14); ctx.stroke(); }
    }
    // hills
    ctx.fillStyle = 'rgba(70,110,90,.45)';
    ctx.beginPath(); ctx.moveTo(0, SURF);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, SURF - 40 - 35 * Math.sin(x / 190) - 20 * Math.sin(x / 61 + 2));
    ctx.lineTo(W, SURF); ctx.closePath(); ctx.fill();

    // underground layers
    ctx.fillStyle = '#6b4b2e'; ctx.fillRect(0, SURF, W, 3 * PXM);                 // topsoil
    ctx.fillStyle = '#c9a66b'; ctx.fillRect(0, SURF + 3 * PXM, W, H);            // unsaturated sand/gravel
    // saturated zone under the water table
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let i = 0; i < S.N; i++) ctx.lineTo(cx(i), yOfDepth(hShown[i]));
    ctx.lineTo(W, yOfDepth(hShown[S.N - 1])); ctx.lineTo(W, H); ctx.closePath();
    const sat = ctx.createLinearGradient(0, SURF, 0, H); sat.addColorStop(0, '#3d8fc7'); sat.addColorStop(1, '#1f4f78');
    ctx.fillStyle = sat; ctx.fill();
    // grain stipple over everything underground
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let i = 0; i < 700; i++) { const x = (i * 131) % W, y = SURF + 12 + ((i * 263) % (H - SURF - 30)); ctx.fillRect(x, y, 2, 2); }
    // clay lens near the inland basin site
    ctx.fillStyle = 'rgba(120,90,80,.75)';
    ctx.beginPath(); ctx.ellipse(cx(44), yOfDepth(9), 150, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('clay', cx(44), yOfDepth(9) + 4);
    // bedrock
    ctx.fillStyle = '#4a4e57'; ctx.fillRect(0, yOfDepth(S.BEDROCK), W, H);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.textAlign = 'left'; ctx.fillText('bedrock', 8, yOfDepth(S.BEDROCK) + 12);

    // "Why?" cone highlight: fill between the start water table and now around a column
    if (highlight) {
      const { col } = highlight; const a = Math.max(0, col - 10), b = Math.min(S.N - 1, col + 10);
      ctx.beginPath(); ctx.moveTo(cx(a), yOfDepth(s.h0[a]));
      for (let i = a; i <= b; i++) ctx.lineTo(cx(i), yOfDepth(s.h0[i]));
      for (let i = b; i >= a; i--) ctx.lineTo(cx(i), yOfDepth(hShown[i]));
      ctx.closePath(); ctx.fillStyle = 'rgba(255,160,60,.45)'; ctx.fill();
      ctx.fillStyle = '#ffd9a0'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('cone of depression', cx(col), yOfDepth(hShown[col]) + 22);
    }

    // start-of-game water table (dashed white)
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let i = 0; i < S.N; i++) { const y = yOfDepth(s.h0[i]); i ? ctx.lineTo(cx(i), y) : ctx.moveTo(cx(i), y); } ctx.stroke();
    ctx.setLineDash([]);
    // current water table (bright blue)
    ctx.strokeStyle = '#5fd0ff'; ctx.lineWidth = 3;
    ctx.beginPath(); for (let i = 0; i < S.N; i++) { const y = yOfDepth(hShown[i]); i ? ctx.lineTo(cx(i), y) : ctx.moveTo(cx(i), y); } ctx.stroke();

    // depth scale
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    for (let d = 0; d <= 100; d += 20) { ctx.fillRect(W - 30, yOfDepth(d), 8, 1); ctx.fillText(d + ' m', W - 34, yOfDepth(d) + 4); }

    // river
    drawRiver();
    // surface line
    ctx.fillStyle = '#4e7d3a'; ctx.fillRect(0, SURF - 4, W, 5);
    // land uses
    drawTown(); for (const f of Object.values(s.farms)) drawFarm(f);
    for (const w of s.wells) if (w.kind === 'home') drawHouse(cx(w.col), w.label.split(' ')[0]);
    for (const b of s.basins) drawBasin(b);
    // wells last so they sit on top
    for (const w of s.wells) drawWell(w);
  }

  function drawRiver() {
    const x = cx(S.RIVER_COL), stageY = yOfDepth(S.RIVER_STAGE);
    // channel cut into the land
    ctx.fillStyle = '#c9a66b'; ctx.beginPath(); ctx.moveTo(x - 46, SURF - 4); ctx.lineTo(x - 22, stageY); ctx.lineTo(x + 22, stageY); ctx.lineTo(x + 46, SURF - 4); ctx.closePath(); ctx.fill();
    const flow = s.river.flow; // 0..1.6
    const depth = Math.max(0.1, Math.min(1, flow)) * (stageY - (SURF - 4));
    const top = stageY - depth;
    const half = 22 + 24 * ((stageY - top) / (stageY - (SURF - 4)));
    ctx.fillStyle = s.river.status === 'disconnected' ? 'rgba(90,150,200,.45)' : '#49a6e0';
    ctx.beginPath(); ctx.moveTo(x - half, top); ctx.lineTo(x - 22, stageY); ctx.lineTo(x + 22, stageY); ctx.lineTo(x + half, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 3; i++) ctx.fillRect(x - 14 + i * 10 + (tick % 20), top + 3, 6, 1);
    ctx.fillStyle = '#0a2436'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('river (' + s.river.status + ')', x, SURF - 50);
    // exchange arrows
    const gap = hShown[S.RIVER_COL] - S.RIVER_STAGE;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.fillStyle = '#fff';
    const ay = stageY + 10; const dir = gap > 0 ? 1 : -1; // + = water leaks down out of river
    for (const dx of [-14, 14]) { ctx.beginPath(); ctx.moveTo(x + dx, ay); ctx.lineTo(x + dx, ay + 18 * dir); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + dx - 4, ay + 18 * dir - 5 * dir); ctx.lineTo(x + dx + 4, ay + 18 * dir - 5 * dir); ctx.lineTo(x + dx, ay + 18 * dir); ctx.closePath(); ctx.fill(); }
  }

  function drawTown() {
    const x0 = cx(4); ctx.fillStyle = '#7d8aa0';
    const hs = [36, 52, 44, 68, 40, 58, 30];
    hs.forEach((h, i) => { const x = x0 + i * 26; ctx.fillRect(x, SURF - 4 - h, 22, h); ctx.fillStyle = '#ffe9a0'; for (let r = 8; r < h - 6; r += 12) for (let c = 4; c < 18; c += 8) ctx.fillRect(x + c, SURF - 4 - h + r, 4, 5); ctx.fillStyle = '#7d8aa0'; });
    ctx.fillStyle = '#0a2436'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('town', x0 + 85, SURF - 86);
  }

  function drawFarm(f) {
    const x0 = cx(f.col - 4), x1 = cx(f.col + 4);
    ctx.fillStyle = f.crop === 'fallow' ? '#b08a55' : f.crop === 'row' ? '#5c9b3c' : '#3f7d2e';
    ctx.fillRect(x0, SURF - 10, x1 - x0, 7);
    if (f.crop === 'orchard') { ctx.fillStyle = '#2f6b25'; for (let x = x0 + 8; x < x1; x += 16) { ctx.beginPath(); ctx.arc(x, SURF - 24, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 1.5, SURF - 18, 3, 10); } }
    else if (f.crop === 'row') { ctx.fillStyle = '#7ccf52'; for (let x = x0 + 4; x < x1; x += 9) ctx.fillRect(x, SURF - 20, 4, 12); }
    else { ctx.fillStyle = '#8c6a3c'; for (let x = x0 + 6; x < x1; x += 14) ctx.fillRect(x, SURF - 12, 8, 2); }
    ctx.fillStyle = '#0a2436'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(f.name + ' · ' + S.CROPS[f.crop].label.toLowerCase(), cx(f.col), SURF - 66);
  }

  function drawHouse(x, name) {
    ctx.fillStyle = '#e8dcc8'; ctx.fillRect(x + 8, SURF - 24, 22, 20);
    ctx.fillStyle = '#9b3b2e'; ctx.beginPath(); ctx.moveTo(x + 5, SURF - 24); ctx.lineTo(x + 19, SURF - 38); ctx.lineTo(x + 33, SURF - 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a2436'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(name, x + 19, SURF - 42);
  }

  function drawBasin(b) {
    const x = cx(b.col); ctx.fillStyle = '#49a6e0';
    ctx.beginPath(); ctx.moveTo(x - 34, SURF - 4); ctx.lineTo(x - 24, SURF + 6); ctx.lineTo(x + 24, SURF + 6); ctx.lineTo(x + 34, SURF - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a2436'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('recharge basin', x, SURF - 10);
    if (lastRain !== null && lastRain > S.NORMAL_RAIN) { ctx.fillStyle = 'rgba(95,208,255,.8)'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 15 + i * 10, SURF + 8 + ((tick * 2 + i * 9) % 40), 3, 6); }
  }

  function drawWell(w) {
    const x = cx(w.col), bottom = yOfDepth(w.depth), intake = yOfDepth(S.pumpIntake(w));
    const wl = yOfDepth(hShown[w.col]);
    const dry = hShown[w.col] > S.pumpIntake(w);
    // casing
    ctx.fillStyle = dry ? 'rgba(255,107,107,.9)' : '#e7ecf0';
    ctx.fillRect(x - 3, SURF - 2, 6, bottom - SURF + 2);
    // water inside the casing
    if (!dry) { ctx.fillStyle = '#5fd0ff'; ctx.fillRect(x - 2, Math.max(wl, SURF), 4, bottom - Math.max(wl, SURF)); }
    // pump intake tick
    ctx.fillStyle = dry ? '#ffb3b3' : '#ffd166'; ctx.fillRect(x - 7, intake - 1, 14, 2);
    // pump house
    ctx.fillStyle = w.kind === 'farm' ? '#8a1f1f' : w.kind === 'town' ? '#3b4a5c' : '#5a5a5a';
    ctx.fillRect(x - 7, SURF - 16, 14, 13);
    // pumping motion (drops moving up the casing) when working and in use
    if (!dry && !s.finished) { ctx.fillStyle = 'rgba(255,255,255,.8)'; const span = bottom - SURF; for (let i = 0; i < 2; i++) { const y = bottom - ((tick * 1.5 + i * span / 2) % span); ctx.fillRect(x - 1, y, 2, 4); } }
    if (dry) { ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DRY', x, bottom + 14); }
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(w.depth + ' m', x + 7, bottom + 3);
  }

  // ---- Chart (mean depth-to-water over time + rainfall bars) ---------------
  const ch = $('chart'), cctx = ch.getContext('2d');
  function drawChart() {
    const Wc = ch.width, Hc = ch.height; cctx.clearRect(0, 0, Wc, Hc);
    const L = 60, R = 60, T = 18, B = 26, pw = Wc - L - R, ph = Hc - T - B;
    const xOf = i => L + (i + 0.5) * pw / S.YEARS;
    cctx.font = '11px sans-serif'; cctx.fillStyle = '#9db0bf'; cctx.textAlign = 'left';
    cctx.fillText('rain (mm)', L, 12); cctx.textAlign = 'right'; cctx.fillText('average depth to water (m)', Wc - R, 12);
    // rain bars
    for (let i = 0; i < s.rainHistory.length; i++) { const r = s.rainHistory[i]; const bh = (r / 800) * ph; cctx.fillStyle = r < 320 ? 'rgba(255,184,77,.6)' : r > 600 ? 'rgba(95,208,255,.6)' : 'rgba(157,176,191,.45)'; cctx.fillRect(xOf(i) - 10, T + ph - bh, 20, bh); }
    // depth axis: 0 at top, 40 m at bottom
    const maxD = 40, yOf = d => T + (d / maxD) * ph;
    cctx.strokeStyle = '#2b4254'; cctx.lineWidth = 1; cctx.textAlign = 'right'; cctx.fillStyle = '#9db0bf';
    for (let d = 0; d <= maxD; d += 10) { cctx.beginPath(); cctx.moveTo(L, yOf(d)); cctx.lineTo(Wc - R, yOf(d)); cctx.stroke(); cctx.fillText(d, L - 6, yOf(d) + 4); }
    cctx.textAlign = 'center'; for (let i = 0; i < S.YEARS; i += 2) cctx.fillText(S.START_YEAR + i, xOf(i), Hc - 8);
    // start reference
    cctx.setLineDash([5, 5]); cctx.strokeStyle = 'rgba(255,255,255,.6)'; cctx.beginPath(); cctx.moveTo(L, yOf(S.meanDepth(s.h0))); cctx.lineTo(Wc - R, yOf(S.meanDepth(s.h0))); cctx.stroke(); cctx.setLineDash([]);
    // mean depth line
    cctx.strokeStyle = '#5fd0ff'; cctx.lineWidth = 3; cctx.beginPath();
    cctx.moveTo(xOf(-0.5), yOf(S.meanDepth(s.h0)));
    s.meanHistory.forEach((m, i) => cctx.lineTo(xOf(i), yOf(Math.min(maxD, m))));
    cctx.stroke();
    // dry-well markers
    for (const w of s.wells) if (w.dry) { const i = w.dryYear - S.START_YEAR; cctx.fillStyle = '#ff6b6b'; cctx.beginPath(); cctx.arc(xOf(i), yOf(Math.min(maxD, s.meanHistory[i])), 5, 0, Math.PI * 2); cctx.fill(); }
  }

  // ---- Animation loop ------------------------------------------------------
  function loop(ts) {
    tick++;
    if (animStart) { if (animStart === -1) animStart = ts; const t = Math.max(0, Math.min(1, (ts - animStart) / animDur)); const e = 1 - Math.pow(1 - t, 3); for (let i = 0; i < S.N; i++) hShown[i] = hFrom[i] + (hTo[i] - hFrom[i]) * e; if (t >= 1) animStart = 0; }
    draw(); raf = requestAnimationFrame(loop);
  }

  // ---- UI wiring -----------------------------------------------------------
  function money(v) { const a = Math.abs(v); return (v < 0 ? '−$' : '$') + (a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : Math.round(a / 1000) + 'k'); }

  function buildRows() {
    const fr = $('farm-rows'); fr.innerHTML = '';
    for (const f of Object.values(s.farms)) {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<div class="n">${f.name}<small id="farm-note-${f.id}"></small></div>
        <select data-farm="${f.id}">${Object.entries(S.CROPS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('')}</select>`;
      fr.appendChild(row);
      row.querySelector('select').addEventListener('change', e => { const ok = S.actions.setCrop(s, f.id, e.target.value); if (!ok) flash('Not enough in the fund for that change.'); refresh(); });
    }
    const wr = $('well-rows'); wr.innerHTML = '';
    for (const w of s.wells) {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<div class="n">${w.label}<small id="well-note-${w.id}"></small></div><button class="act" data-deepen="${w.id}"></button>`;
      wr.appendChild(row);
      row.querySelector('button').addEventListener('click', () => { const ok = S.actions.deepen(s, w.id); if (!ok) flash('Not enough in the fund.'); refresh(); });
    }
  }

  function refresh() {
    const sm = S.summary(s);
    $('yr').textContent = s.calendarYear; $('yr-of').textContent = s.finished ? 'Final year' : `Year ${s.year + 1} of ${S.YEARS}`;
    const wt = $('s-wt'); wt.textContent = (sm.change >= 0 ? '+' : '−') + Math.abs(sm.change).toFixed(1) + ' m'; wt.className = 'v ' + (sm.change < -5 ? 'bad' : sm.change < -1 ? 'warn' : 'good');
    const ww = $('s-wells'); ww.textContent = `${sm.working} / ${sm.total}`; ww.className = 'v ' + (sm.working < 4 ? 'bad' : sm.working < 6 ? 'warn' : '');
    const rv = $('s-river'); rv.textContent = s.river.status; rv.className = 'v ' + (s.river.status === 'gaining' ? 'good' : s.river.status === 'losing' ? 'warn' : 'bad');
    const bd = $('s-budget'); bd.textContent = money(s.budget); bd.className = 'v ' + (s.budget < 0 ? 'bad' : '');
    for (const f of Object.values(s.farms)) {
      const sel = document.querySelector(`select[data-farm="${f.id}"]`); sel.value = f.crop; sel.disabled = s.finished;
      const w = S.wellById(s, f.wellId);
      $(`farm-note-${f.id}`).textContent = w.dry ? 'Well is dry: no crop, no income' : `${S.CROPS[f.crop].label}: ${money(S.CROPS[f.crop].income)}/yr income`;
    }
    for (const w of s.wells) {
      const b = document.querySelector(`button[data-deepen="${w.id}"]`);
      const cost = S.COSTS.deepen[w.kind]; const level = s.h[w.col];
      b.textContent = w.deepened ? 'Deepened' : `Deepen ${money(cost)}`; b.disabled = w.deepened || s.finished || s.budget < cost;
      $(`well-note-${w.id}`).textContent = w.dry ? `DRY since ${w.dryYear} · ${w.depth} m deep, water ${level.toFixed(0)} m down` : `${w.depth} m deep · water ${level.toFixed(1)} m down · ${Math.max(0, S.pumpIntake(w) - level).toFixed(1)} m to spare`;
    }
    const bi = $('btn-import'); bi.textContent = s.town.importOn ? 'On' : 'Off'; bi.className = 'act' + (s.town.importOn ? ' on' : ''); bi.disabled = s.finished;
    for (const soil of ['sand', 'clay']) { const b = $('btn-basin-' + soil); const built = s.basins.some(x => x.soil === soil); b.textContent = built ? 'Built' : 'Build'; b.disabled = built || s.finished || s.budget < S.COSTS.basin[soil] || s.basins.length >= 2; }
    document.querySelectorAll('#cap button').forEach(b => { b.classList.toggle('on', Number(b.dataset.cap) === s.pumpCap); b.disabled = s.finished; });
    $('next').disabled = s.finished; $('next').textContent = s.finished ? 'Game over · Restart to play again' : 'Next year ▶';
    // log
    const lg = $('log'); lg.innerHTML = s.log.map(l => /^\d{4}:/.test(l) ? `<span class="y">${l}</span>` : l).join('\n'); lg.scrollTop = lg.scrollHeight;
  }

  let flashTimer = null;
  function flash(msg) { const r = $('rain'); r.textContent = msg; clearTimeout(flashTimer); flashTimer = setTimeout(() => refresh(), 2500); }

  function nextYear() {
    if (s.finished) return;
    highlight = null;
    const before = Float64Array.from(s.h);
    const ev = S.stepYear(s);
    hFrom.set(hShown); hTo.set(s.h); animStart = -1; lastRain = ev.rain; // -1: start on the next animation frame
    // if animation frames are paused (background tab), snap to the final state
    setTimeout(() => { if (animStart) { animStart = 0; hShown.set(hTo); draw(); } }, animDur + 100);
    const dPhrase = ev.delta > 0 ? `fell ${ev.delta.toFixed(1)} m on average` : `rose ${(-ev.delta).toFixed(1)} m on average`;
    $('rain').innerHTML = `<b>${ev.year}:</b> ${ev.rain} mm of rain${ev.drought ? ' (drought)' : ev.wet ? ' (very wet)' : ''}. Water table ${dPhrase}. Farm income ${money(ev.income)}, fund ${s.fund >= 0 ? '+' : ''}${money(s.fund)}.`;
    refresh(); drawChart();
    setTimeout(() => storyBeats(ev, before), 950);
  }

  // ---- Story beats: event cards that react to what just happened -----------
  const seen = new Set();
  function once(key, fn) { if (seen.has(key)) return false; seen.add(key); fn(); return true; }

  function storyBeats(ev, before) {
    if (s.finished) { return endCard(); }
    // 1. a well just went dry
    if (ev.newlyDry.length) {
      const w = S.wellById(s, ev.newlyDry[0]); const nearbyFarm = Object.values(s.farms).map(f => S.wellById(s, f.wellId)).filter(fw => Math.abs(fw.col - w.col) <= 6 && !fw.dry).sort((a, b) => Math.abs(a.col - w.col) - Math.abs(b.col - w.col))[0];
      const others = ev.newlyDry.length > 1 ? ` <br><br>Also dry this year: ${ev.newlyDry.slice(1).map(id => S.wellById(s, id).label).join(', ')}.` : '';
      if (w.kind === 'home') {
        return openEvent({ tag: 'Well failure', cls: 'bad', title: `${w.label} ran dry`,
          body: `<p>They turned on the tap this morning and nothing came out. Their well is <b>${w.depth} m</b> deep. The water table under their house is now <b>${s.h[w.col].toFixed(0)} m</b> down, below the pump.</p><p>The aquifer underneath still holds water. Their well just can't reach it any more.${others}</p>`,
          buttons: [{ label: 'Why did this happen?', onClick: () => whyCard(w, nearbyFarm) }, { label: 'Continue', primary: true }] });
      }
      if (w.kind === 'farm') {
        const f = Object.values(s.farms).find(f => f.wellId === w.id);
        return openEvent({ tag: 'Well failure', cls: 'bad', title: `${w.label} ran dry`,
          body: `<p>${f.name}'s ${S.CROPS[f.crop].label.toLowerCase()} will get no water this season, and the farm earns nothing until the well is deepened (${money(S.COSTS.deepen.farm)}) or the valley finds another answer.</p><p>Notice what happens to the water table around the farm now that the pump has stopped.${others}</p>`,
          buttons: [{ label: 'Continue', primary: true }] });
      }
      return openEvent({ tag: 'Well failure', cls: 'bad', title: `${w.label} ran dry`,
        body: `<p>The town has no groundwater supply. Until it is deepened or imported water is switched on, the valley fund pays ${money(120000)} a year to truck water in.${others}</p>`,
        buttons: [{ label: 'Continue', primary: true }] });
    }
    // 2. a farm well is struggling for the first time
    const st = S.struggling(s).filter(w => w.kind === 'farm');
    if (st.length && once('struggle-' + st[0].id, () => {})) {
      const w = st[0]; const f = Object.values(s.farms).find(f => f.wellId === w.id);
      return openEvent({ tag: 'Drought · year ' + (s.calendarYear - 2027), cls: 'warn', title: `${f.name}'s well is sputtering`,
        body: `<p>Rain has been short and the farm is irrigating harder to make up for it. Water in the well is now within <b>${Math.max(0, S.pumpIntake(w) - s.h[w.col]).toFixed(1)} m</b> of the pump.</p>
               <p>The driller can deepen it to 90 m for <b>${money(S.COSTS.deepen.farm)}</b>. That would keep the farm running. It would also keep the pump running.</p>
               <p>Or the farm could switch crops, or the valley could cap pumping. Each choice costs someone something.</p>`,
        buttons: [{ label: `Deepen the well (${money(S.COSTS.deepen.farm)})`, onClick: () => { if (!S.actions.deepen(s, w.id)) flash('Not enough in the fund.'); refresh(); } }, { label: 'Decide later', primary: true }] });
    }
    // 3. first drought year
    if (ev.drought && once('drought', () => {})) {
      return openEvent({ tag: 'Weather', cls: 'warn', title: 'Drought',
        body: `<p>Only ${ev.rain} mm of rain fell this year. Less rain means less recharge, and farms pump harder to make up the difference. Both push the water table down.</p><p>Keep an eye on the shallowest wells.</p>`,
        buttons: [{ label: 'Continue', primary: true }] });
    }
    // 4. first very wet year
    if (ev.wet && ev.rain > 600 && once('wet', () => {})) {
      const hasBasin = s.basins.length > 0;
      return openEvent({ tag: 'Weather', cls: 'good', title: 'Atmospheric river',
        body: `<p>${ev.rain} mm in one year. Most of it ran off down the river.</p><p>${hasBasin ? 'Your recharge basin caught some of that flood and let it soak in. See the bump in the water table beneath it.' : 'A recharge basin would have captured some of that flood water and let it soak into the aquifer. Wet years are rare; the projects that use them have to exist before they arrive.'}</p>`,
        buttons: [{ label: 'Continue', primary: true }] });
    }
    // 5. river changed state
    if (s.river.status !== 'gaining' && once('river-' + s.river.status, () => {})) {
      return openEvent({ tag: 'River', cls: s.river.status === 'losing' ? 'warn' : 'bad', title: s.river.status === 'losing' ? 'The river is now losing water to the ground' : 'The river has disconnected from the aquifer',
        body: s.river.status === 'losing'
          ? `<p>The water table has dropped below the river bed. The river used to <i>gain</i> water seeping in from the aquifer. Now it <i>loses</i> water into the dry ground beneath it, and summer flows shrink.</p>`
          : `<p>The water table is so far below the river bed that the river no longer feels the aquifer at all. What flows is only this year's rain. Fish, wetlands and anyone downstream notice first.</p>`,
        buttons: [{ label: 'Continue', primary: true }] });
    }
    // 6. recovery
    if (s.year >= 6 && ev.delta < -0.3 && !ev.wet && once('recovery', () => {})) {
      return openEvent({ tag: 'Recovery', cls: 'good', title: 'The water table is rising',
        body: `<p>Not because of a wet year. Because pumping fell below recharge. Documented recoveries around the world look like this: an alternative supply, a pumping rule, or managed recharge, held in place for years.</p>`,
        buttons: [{ label: 'Continue', primary: true }] });
    }
  }

  function whyCard(w, farmWell) {
    highlight = farmWell ? { col: farmWell.col } : { col: w.col };
    const f = farmWell ? Object.values(s.farms).find(f => f.wellId === farmWell.id) : null;
    openEvent({ tag: 'Why', cls: '', title: 'Shallower wells fail first',
      body: `<p>Look at the shape of the water table (highlighted in orange). ${f ? `It dips under <b>${f.name}'s</b> well, which pumps far more than a household and ${farmWell.deepened ? 'was deepened, so it kept pumping as the water fell' : 'has been running hard through the drought'}.` : 'It dips wherever pumping is heaviest.'}</p>
             <p>That dip is a <b>cone of depression</b>. It spreads outward to neighbouring wells. A deep well sits inside the cone and keeps drawing water; a shallow well on its edge runs dry first.</p>
             <p>Jasechko and Perrone (2021) found that in their global sample, an estimated 6–20% of wells were vulnerable to water-level declines of only a few metres. The aquifer isn't empty. The well is just too short.</p>
             <p class="note">Options: deepen the household well (${money(S.COSTS.deepen.home)}), cap farm pumping, change crops, or build recharge. Deepening treats the symptom; the water table keeps falling.</p>`,
      buttons: [{ label: 'Got it', primary: true, onClick: () => {} }] });
  }

  function endCard() {
    const sm = S.summary(s);
    let stars = 0;
    if (sm.homesOk === 3) stars++; else if (sm.homesOk >= 2) stars += 0.5;
    if (sm.change > -2) stars++; else if (sm.change > -6) stars += 0.5;
    if (sm.recovering) stars++;
    if (sm.river === 'gaining') stars++; else if (sm.river === 'losing') stars += 0.5;
    if (sm.cumulativeIncome > 5.5e6) stars++; else if (sm.cumulativeIncome > 3.5e6) stars += 0.5;
    const full = Math.floor(stars), half = stars - full >= 0.5;
    const str = '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
    const verdict = stars >= 4.5 ? 'The valley is alive and its aquifer is stable. This is what a documented recovery looks like.'
      : stars >= 3 ? 'The valley survived, with scars. Some of what you did worked; the water table says the rest.'
      : stars >= 1.5 ? 'The farms made it to 2046. The families and the river did not. That trade-off is the quiet story in the data.'
      : 'The valley ran its aquifer down. Everyone with a shallow well lost first.';
    openEvent({ tag: '2046', cls: stars >= 3 ? 'good' : 'bad', title: 'Twenty years later',
      body: `<div class="grade">${str}</div><p>${verdict}</p>
             <ul><li>Water table vs 2026: <b>${(sm.change >= 0 ? '+' : '−') + Math.abs(sm.change).toFixed(1)} m</b> ${sm.recovering ? '(rising in the final years)' : ''}</li>
             <li>Household wells still working: <b>${sm.homesOk} of 3</b></li>
             <li>River: <b>${sm.river}</b></li>
             <li>Farm income over 20 years: <b>${money(sm.cumulativeIncome)}</b></li></ul>
             <p class="note">Try again with a different plan. Protecting the families early is cheap; fixing the water table late is not.</p>`,
      buttons: [{ label: 'Research behind the game', onClick: () => $('research').classList.add('open') }, { label: 'Play again', primary: true, onClick: reset }] });
  }

  function openEvent({ tag, cls, title, body, buttons }) {
    const el = $('event-body');
    el.innerHTML = `<span class="tag ${cls}">${tag}</span><h3>${title}</h3>${body}<div class="btns"></div>`;
    const btns = el.querySelector('.btns');
    for (const b of buttons) { const bt = document.createElement('button'); bt.textContent = b.label; if (b.primary) bt.className = 'primary'; bt.addEventListener('click', () => { $('event').classList.remove('open'); if (b.onClick) b.onClick(); }); btns.appendChild(bt); }
    $('event').classList.add('open');
  }

  // tooltip on hover over wells
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    const w = s.wells.find(w => Math.abs(cx(w.col) - x) < 12 && y > SURF - 20 && y < yOfDepth(w.depth) + 16);
    const tip = $('tip');
    if (!w) { tip.style.display = 'none'; return; }
    const level = hShown[w.col];
    tip.innerHTML = `<b>${w.label}</b>${w.depth} m deep, pump at ${S.pumpIntake(w)} m<br>Water table here: ${level.toFixed(1)} m down<br>${w.dry ? `<span style="color:var(--bad)">Dry since ${w.dryYear}</span>` : `${(S.pumpIntake(w) - level).toFixed(1)} m of water above the pump`}`;
    tip.style.display = 'block'; tip.style.left = Math.min(r.width - 250, e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px';
  });
  cv.addEventListener('mouseleave', () => { $('tip').style.display = 'none'; });

  $('next').addEventListener('click', nextYear);
  document.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { if (!$('event').classList.contains('open') && !$('research').classList.contains('open')) { e.preventDefault(); nextYear(); } } });
  $('btn-import').addEventListener('click', () => { if (!S.actions.importWater(s, !s.town.importOn)) flash('Not enough in the fund to start the contract.'); refresh(); });
  $('btn-basin-sand').addEventListener('click', () => { S.actions.buildBasin(s, 'sand'); refresh(); });
  $('btn-basin-clay').addEventListener('click', () => { S.actions.buildBasin(s, 'clay'); refresh(); });
  document.querySelectorAll('#cap button').forEach(b => b.addEventListener('click', () => { S.actions.pumpCap(s, Number(b.dataset.cap)); refresh(); }));
  $('btn-research').addEventListener('click', () => $('research').classList.add('open'));
  $('btn-research-close').addEventListener('click', () => $('research').classList.remove('open'));
  $('research').addEventListener('click', e => { if (e.target === $('research')) $('research').classList.remove('open'); });
  $('btn-restart').addEventListener('click', () => { seen.clear(); reset(); });

  reset();
  raf = requestAnimationFrame(loop);
  window.__aq = { get s() { return s; }, get hShown() { return hShown; } }; // read-only debug handle
})();
