// Node check of the simulation core: run three strategies for 20 years.
const S = require('./sim.js');
function run(name, policy) {
  const s = S.initialState();
  const rows = [];
  while (!s.finished) {
    policy(s);
    const ev = S.stepYear(s);
    rows.push({ yr: ev.year, rain: ev.rain, mean: S.meanDepth(s.h).toFixed(1),
      dry: s.wells.filter(w => w.dry).map(w => w.id.replace('w_', '')).join(','),
      river: ev.river, budget: Math.round(s.budget / 1000) + 'k' });
  }
  console.log('\n== ' + name); console.table(rows);
  console.log(S.summary(s));
  return s;
}
run('do nothing', () => {});
run('deepen farm A in 2028, nothing else', s => { if (s.calendarYear === 2028) S.actions.deepen(s, 'w_farmA'); });
run('conserve: cap 60% + basin + import', s => {
  if (s.calendarYear === 2028) { S.actions.pumpCap(s, 0.6); S.actions.importWater(s, true); }
  if (s.calendarYear === 2029) S.actions.buildBasin(s, 'sand');
  if (s.calendarYear === 2030) S.actions.setCrop(s, 'farmA', 'row');
});
