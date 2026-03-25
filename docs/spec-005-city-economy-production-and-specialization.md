# spec-005-city-economy-production-and-specialization

## Goal and scope

- Define city founding, city management, and empire-wide economy behavior.
- Keep city outcomes strategic through focus, yields, production queues, and buildings.
- Preserve deterministic single-player + AI behavior.

## Decisions made (and alternatives rejected)

- Chosen: both factions start settler-only; no starting warriors.
- Chosen: only settlers can found cities; enemy auto-founds first valid city opportunity.
- Chosen: successful city founding emits timeline presentation feedback (settlement pulse + city spawn pop) while game-state mutation remains authoritative.
- Chosen: economy is empire-wide per owner (`food/production/science` stockpiles).
- Chosen: city yields are terrain-driven with ring-1 workable area and deterministic assignment.
- Chosen: city focus is direct-select (`balanced`, `food`, `production`, `science`).
- Chosen: shared typed production queue (`unit`/`building`) with max length `3`.
- Chosen: queue consumes front item only on successful completion.
- Chosen: building set for this milestone:
  - `granary` (`cost=9`, unlocked default, `+1 food`)
  - `workshop` (`cost=10`, unlock `bronzeWorking`, `+1 production`)
  - `monument` (`cost=8`, unlock `masonry`, `+1 science`)
- Chosen: duplicate building construction per city is blocked (built or queued).
- Chosen: city identity derives from worked yields; specialization derives from buildings with priority `scholarly > industrial > agricultural > balanced`.
- Chosen: enemy queue refill strategy is personality-aware and defined by `spec-008`.
- Rejected for now: manual citizen placement UI, gold/upkeep/happiness/trade-route systems.

## Interfaces/types added

- Economy types/state:
  - `YieldBundle`
  - `EmpireEconomy`
  - `GameState.economy.{player,enemy,researchIncomeThisTurn}`
- City fields:
  - `focus`, `workedHexes`, `yieldLastTurn`, `identity`, `growthProgress`
  - `productionTab`, `queue` (typed items), `buildings`, `specialization`
  - `health`, `maxHealth`
- City system APIs:
  - `canFoundCity(unitId, gameState)`
  - `foundCity(unitId, gameState)`
  - `getFoundCityReasonText(reason)`
  - `getWorkableHexes(cityId, gameState)`
  - `assignWorkedHexes(cityId, gameState)`
  - `computeCityYield(cityId, gameState)`
  - `setCityFocus(cityId, focus, gameState)`
  - `setCityProductionTab(cityId, tab, gameState)`
  - `enqueueCityQueue(cityId, unitType, gameState)`
  - `enqueueCityBuilding(cityId, buildingId, gameState)`
  - `enqueueCityQueueItem(cityId, queueItem, gameState)`
  - `removeCityQueueAt(cityId, index, gameState)`
  - `processTurn(gameState, owner)`

## Behavior and acceptance criteria

- Founding:
  - settler-only, valid passable/empty tile required
  - founding consumes settler and creates/selects city
  - successful founding plays visible settlement animation clip at founded tile
- Terrain yields (locked defaults):
  - plains `2/1/0`
  - forest `1/2/0`
  - hill `0/2/1`
  - mountain/water `0/0/0` (unworkable)
- Turn economy processing:
  - city yields aggregate into `economy[owner].lastTurnIncome` and stockpiles
  - growth threshold: `8 + (population - 1) * 4`
  - growth spends empire `foodStock` deterministically
  - production spends empire `productionStock` deterministically
- Queue/building behavior:
  - shared queue max 3
  - successful unit spawn/building completion pops front item
  - no pop on blocked spawn/insufficient stock
  - duplicate building enqueue/build per city blocked
- Capture/raze interaction:
  - capture preserves city economy identity fields with owner flip
  - raze removes city

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/citySystem.test.js`
  - `tests/integration/uiSurface.test.js`
  - `tests/integration/enemyTurn.test.js`
  - `tests/integration/researchSystem.test.js` (science stock interaction)
- E2E:
  - `tests/e2e/smoke.mjs` (founding clip visibility + queue/focus/building interactions + economy progression)

## Known gaps and next steps

- No manual tile assignment per city.
- No building maintenance/upkeep pressure.
- No district/adjacency placement layer.
