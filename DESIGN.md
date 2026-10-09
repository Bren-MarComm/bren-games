# Groundwater games: design notes

Brief from AL, 2026-10-09, lightly edited. The strongest opportunity is to make
groundwater, an invisible resource, visible, interactive and consequential.

## Research foundation

UCSB's Groundwater Research Hub (five-year centre, Scott Jasechko and Debra
Perrone) uses observational data to understand water stress and evaluate
management responses, connecting global science to local decisions. Three
findings offer unusually good game mechanics:

1. **Groundwater levels are declining, sometimes increasingly rapidly.**
   Jasechko, Perrone and colleagues' 2024 *Nature* study analysed roughly
   170,000 monitoring wells across 1,693 aquifer systems.
2. **Wells can fail long before an aquifer is empty.** Their 2021 *Science*
   paper estimated 6–20% of wells in the global sample were vulnerable to
   relatively modest groundwater declines.
3. **Recovery is possible, but it takes intervention.** Jasechko's March 2026
   *Science* review documented 67 cases of groundwater recovery involving
   alternative supplies, management policies and artificial recharge.

Also usable: river–aquifer exchange (gaining vs losing streams, Jasechko et al.
2021 *Nature*) and the California Groundwater Recharge Observatory's work on how
rainfall intensity, geology, land use and managed flooding shape recharge.

## Three concepts

| | The Aquifer | Water Wars | Rainmaker |
|---|---|---|---|
| Core mechanic | Manage a changing water table | Negotiate scarce resources | Route and infiltrate water |
| Style | Simulation | Turn-based strategy | Physics puzzle |
| Audience | Ages 10–16 | Ages 12–18 | Ages 7–13 |
| Research connection | Excellent | Excellent | Strong |
| Visual appeal | High | Moderate | Very high |
| Prototype scope | Medium | Small | Small–medium |

**The Aquifer.** A side-view cross-section of a valley. Farms, homes and a town
above ground; soil, aquifer and wells of different depths below. The essential
mechanic is that the player can see the water table move. Press Next Year; rain
recharges, wells withdraw; a drought arrives; shallow wells start failing; the
player chooses between reducing pumping, changing crops, deepening wells,
importing water or investing in recharge, and tries to keep the valley alive
for 20 years. The defining moment: deepen a farm well to save a farm, and watch
the neighbours' shallower drinking-water wells fail a few years later.

**Water Wars.** Four communities share one aquifer; farmers, residents,
industry and ecosystems each want more. The player sets policy (restrictions,
alternative supplies, recharge, domestic-well protection, who pays) while the
other users respond to incentives. Event cards: drought, growth, a new
agricultural operation, an atmospheric river, a new state rule.

**Rainmaker.** Build a landscape from terrain tiles (sand, clay, forest,
pavement, wetlands, recharge basins, rivers), release a storm, watch water run
off, pool, infiltrate or reach the sea. Levels score recharge, flood damage,
cost and ecological impact. Should not assume every infiltrated drop reaches
the aquifer, or that maximum recharge is always desirable.

## Chosen direction

The Aquifer is the main game. Rainmaker becomes a short puzzle inside it when
the player buys a recharge project. Water Wars (policy) and a Salmon Run module
(surface–groundwater ecology) can share the same valley and hydrologic
variables later. Every module gets an optional Research Behind the Game panel
with citations to actual UCSB publications, and distinguishes research-backed
relationships from invented scenario values.

The key creative rule: do not make a groundwater dashboard disguised as a game.
The player must experience a failure, discover its cause, experiment with a
solution and see the consequences.

## What the prototype (2026-10-09) does and does not do

Built: `aquifer/`. See its [README](aquifer/README.md) for the model, the
tuned numbers, the story beats and the verification record.

Not built yet: the Rainmaker mini-game (recharge basins are a one-click purchase
with a sand/clay site choice), Water Wars, Salmon Run, sound, touch-first
controls, and faculty review of the model and citations.
