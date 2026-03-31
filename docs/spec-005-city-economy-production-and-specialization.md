# spec-005-city-economy-production-and-specialization

## Goal and scope

- Define city founding, city management, and empire-wide economy behavior.
- Keep city outcomes strategic through yields, production queues, and buildings.
- Preserve deterministic single-player + AI behavior.

## Decisions made (and alternatives rejected)

- Chosen: all configured owners (`player` + active AI owners) start settler-only; no starting warriors.
- Chosen: only settlers can found cities; AI owners auto-found first valid city opportunities.
- Chosen: successful city founding emits timeline presentation feedback (settlement pulse + city spawn pop) while game-state mutation remains authoritative.
- Chosen: economy is per-owner empire stockpile (`food/production/science`) with dynamic owner buckets.
- Chosen: city yields are terrain-driven with ring-1 workable area and deterministic assignment.
- Chosen: city worked tiles are assigned with a single deterministic balanced priority (best combined local yields).
- Chosen: shared typed production queue (`unit`/`building`) with max length `3`.
- Chosen: queue order is player-editable with deterministic up/down reordering.
- Chosen: queue consumes front item only on successful completion.
- Chosen: building set for this milestone:
  - `granary` (`cost=9`, unlocked default, `+1 food`)
  - `workshop` (`cost=10`, unlock `bronzeWorking`, `+1 production`)
  - `monument` (`cost=8`, unlock `masonry`, `+1 science`)
- Chosen: duplicate building construction per city is blocked (built or queued).
- Chosen: city identity derives from worked yields; specialization derives from buildings with priority `scholarly > industrial > agricultural > balanced`.
- Chosen: AI queue refill strategy is personality-aware and defined by `spec-008`.
- Rejected for now: manual citizen placement UI, gold/upkeep/happiness/trade-route systems.

## Interfaces/types added

- Economy types/state:
  - `YieldBundle`
  - `EmpireEconomy`
  - `GameState.economy` by owner + `researchIncomeThisTurn`
- City fields:
  - `workedHexes`, `yieldLastTurn`, `identity`, `growthProgress`
  - `productionTab`, `queue` (typed items), `buildings`, `specialization`
  - `health`, `maxHealth`
- City system APIs:
  - `canFoundCity(unitId, gameState)`
  - `foundCity(unitId, gameState)`
  - `getFoundCityReasonText(reason)`
  - `getWorkableHexes(cityId, gameState)`
  - `assignWorkedHexes(cityId, gameState)`
  - `computeCityYield(cityId, gameState)`
  - `setCityProductionTab(cityId, tab, gameState)`
  - `enqueueCityQueue(cityId, unitType, gameState)`
  - `enqueueCityBuilding(cityId, buildingId, gameState)`
  - `enqueueCityQueueItem(cityId, queueItem, gameState)`
  - `removeCityQueueAt(cityId, index, gameState)`
  - `moveCityQueueItem(cityId, index, direction, gameState)`
  - `getAvailableProductionUnits(gameState)`
  - `getAvailableProductionBuildings(gameState)`
  - `processTurn(gameState, owner)`

## Behavior and acceptance criteria

- Founding:
  - settler-only, valid passable/empty tile required
  - founding consumes settler and creates/selects city
  - successful founding plays visible settlement animation clip at founded tile
  - AI owners auto-found first valid city opportunities from settler-only starts
- Terrain yields (locked defaults):
  - plains `2/1/0`
  - forest `1/2/0`
  - hill `0/2/1`
  - mountain/water `0/0/0` (unworkable)
- Turn economy processing:
  - city yields aggregate into `economy[owner].lastTurnIncome` and stockpiles
  - growth threshold: `8 + (population - 1) * 4`
  - growth spends empire `foodStock` deterministically in city-id order
  - production spends empire `productionStock` deterministically
- Queue/building behavior:
  - shared queue max 3
  - queue supports deterministic up/down reordering
  - successful unit spawn/building completion pops front item
  - no pop on blocked spawn/insufficient stock
  - duplicate building enqueue/build per city blocked
  - UI-facing queue payload supports right-rail vertical 3-slot stack rendering with per-slot up/down move + remove availability and estimated turns
  - UI-facing production hover payload uses full-word phrasing (`Production Cost`, `Estimated Turns`, `Current Production Stock`, `Local Production Per Turn`)
  - UI notifications for city management follow high-level HUD policy from `spec-007` (major outcomes + warnings/failures; low-value city operation success spam suppressed)
- Capture/raze interaction:
  - capture preserves city economy identity fields with owner flip
  - raze removes city

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/citySystem.test.js`
  - `tests/integration/uiSurface.test.js`
  - `tests/integration/enemyTurn.test.js`
  - `tests/integration/matchGeneration.test.js`
  - `tests/integration/researchSystem.test.js` (science stock interaction)
- E2E:
  - `tests/e2e/smoke.mjs` (founding clip visibility + queue/building interactions + economy progression)

## Known gaps and next steps

- No manual tile assignment per city.
- No building maintenance/upkeep pressure.
- No district/adjacency placement layer.
