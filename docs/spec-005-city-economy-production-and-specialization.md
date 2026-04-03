# spec-005-city-economy-production-and-specialization

## Goal and scope

- Define city founding, city management, and per-owner economy behavior.
- Keep city growth and production deterministic through local progress meters (no empire food/production stockpiles).
- Define gold upkeep, deficit handling, rush-buy rules, and science infrastructure behavior.

## Decisions made (and alternatives rejected)

- Chosen: all configured owners (`player` + active AI owners) start settler-only; no starting warriors.
- Chosen: only settlers can found cities; AI owners auto-found first valid city opportunities.
- Chosen: worked-tile assignment remains deterministic ring-1 selection by combined local yield priority.
- Chosen: city growth is local via `city.growthProgress` with threshold `8 + (population - 1) * 4`.
- Chosen: city production is local via `city.productionProgress` and queue-front completion; overflow carries to subsequent queue items.
- Chosen: city production queue is typed (`unit`/`building`) with max length `3` and deterministic reorder/remove semantics.
- Chosen: owner economy buckets are gold-centric:
  - `goldBalance`
  - `goldIncomeLastTurn`
  - `goldUpkeepLastTurn`
  - `goldNetLastTurn`
  - `disabledUnitIds`
  - `outputLastTurn` (`food`, `production`, `gold`)
  - `sciencePerTurn`
- Chosen: upkeep pressure is active:
  - units consume upkeep from unit definitions (default fallback `1`)
  - buildings consume upkeep from building definitions (default fallback `1`)
  - deficit disables deterministic unit subset until upkeep is payable
- Chosen: pre-city bootstrap guard keeps one settler active when owner has zero cities so founding cannot soft-lock.
- Chosen: rush-buy completes queue-front progress using gold at `remainingProduction * 3`.
- Chosen: city-level Campus abstraction is queue-built infrastructure (no tile placement UI in this release).
- Chosen: Campus adjacency is snapshotted once on Campus completion and stored in `city.campus`:
  - mountain neighbor: `+1`
  - forest neighbor: `+0.5`
  - nearby owned city with Campus (`distance <= 2`): `+0.5`
- Chosen: science building chain and prerequisites:
  - `campus` (unlock `writing`)
  - `library` (unlock `writing`, requires `campus`, `+2 science`)
  - `university` (unlock `education`, requires `library`, `+4 science`)
  - `researchLab` (unlock `chemistry`, requires `university`, `+5 science`)
- Chosen: duplicate building construction per city is blocked (already built or already queued).
- Rejected for now: manual district tile placement UI, specialist slots, trade-route economy, and per-city tax policies.

## Interfaces/types added

- `City` schema:
  - `growthProgress`
  - `productionProgress`
  - typed `queue: Array<{ kind: "unit"|"building", id: string }>`
  - `buildings` includes `campus/library/university/researchLab`
  - `campus: { built, adjacency, adjacencyBreakdown }`
- `EmpireEconomy` schema:
  - `goldBalance`, `goldIncomeLastTurn`, `goldUpkeepLastTurn`, `goldNetLastTurn`
  - `disabledUnitIds`
  - `outputLastTurn`
  - `sciencePerTurn`
- City/production APIs:
  - `setCityProductionTab(cityId, tab, gameState)`
  - `enqueueCityQueueItem(cityId, queueItem, gameState)`
  - `enqueueCityQueue(cityId, unitType, gameState)`
  - `enqueueCityBuilding(cityId, buildingId, gameState)`
  - `moveCityQueueItem(cityId, index, direction, gameState)`
  - `removeCityQueueAt(cityId, index, gameState)`
  - `processTurn(gameState, owner)`
- Gold/rush-buy APIs:
  - `canRushBuyCityQueueFront(cityId, gameState)`
  - `rushBuyCityQueueFront(cityId, gameState)`
- Research-linked city science support:
  - `getCityScienceBreakdown(city, gameState)` in research system (population + Campus adjacency + science buildings)

## Behavior and acceptance criteria

- Founding:
  - settler-only, valid passable/empty tile required
  - founding consumes settler and creates/selects city
  - disabled settlers cannot found cities
- Per-turn city processing:
  - city yields aggregate from worked hexes plus building yield bonuses
  - growth increments `growthProgress` and can trigger multiple population gains if threshold is exceeded
  - production increments `productionProgress`; front queue item completes when progress meets cost
  - UI ETA values are dynamic snapshots (not fixed promises) and can change as growth updates population/worked-hex yields
  - queue-front completion consumes only required progress and carries overflow to subsequent queue items
  - queue-front unit completion requires valid spawn hex
  - queue-front building completion requires unlocks/prerequisites and updates city building state
- Queue behavior:
  - queue max `3`, deterministic reorder/remove
  - removing/moving queue-front resets `productionProgress` to prevent stale carry into a different front item
  - duplicate building enqueue/build per city is blocked
- Gold economy behavior:
  - `goldIncomeLastTurn` derives from aggregated city gold output
  - upkeep includes units + built buildings
  - `goldNetLastTurn = income - payableUpkeep`; `goldBalance` updates by net
  - deficit disables deterministic unit subset (`disabledUnitIds`) and disabled units are forced to `hasActed=true`, `movementRemaining=0`
  - if owner has no cities, one settler is preserved from disable selection to keep first-city bootstrap possible
- Rush-buy behavior:
  - only queue-front item is rush-buyable
  - cost uses `remainingProduction * 3`
  - rush-buy spends gold, fills remaining production, then resolves normal queue completion flow
- City science output formula:
  - `populationScience = population * 0.5`
  - `campusAdjacencyScience = city.campus.adjacency` when Campus exists
  - `buildingScience = library(2) + university(4) + researchLab(5)`
  - `cityScience = populationScience + campusAdjacencyScience + buildingScience`
- City identity/specialization:
  - identity derives from current local yields
  - specialization priority remains `scholarly > industrial > agricultural > balanced`

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/citySystem.test.js`
  - `tests/integration/uiSurface.test.js`
  - `tests/integration/unitActionSystem.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` (city queue flow, gold/upkeep payload shape, disabled-unit fields, and rush-buy action state)

## Known gaps and next steps

- No manual district placement or adjacency preview UI (Campus remains city-level abstraction).
- No specialist slots/assignment system.
- No additional treasury spend systems beyond queue-front rush-buy.
