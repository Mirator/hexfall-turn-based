# spec-010-economy-and-city-identity-lite

## Goal and scope

- Keep economy empire-wide (`food/production/science` stockpiles by owner).
- Keep city identity local and terrain-driven.
- Ensure economy state survives ownership changes from city capture.

## Decisions made (and alternatives rejected)

- Chosen: ring-1 workable tiles with deterministic assignment by focus.
- Chosen: growth and production spend from empire stockpiles, not per-city stores.
- Chosen: city focus is set directly from contextual city panel buttons (not cycle-only UX).
- Chosen: city production spending follows queue-front consumption with finite queue slots and typed queue items.
- Chosen: city buildings add local yields and building-driven city specialization.
- Chosen: research consumes empire science stock with carryover.
- Chosen: on city capture, city economy identity fields persist and ownership flips.
- Rejected for now: gold/upkeep/happiness/trade-route systems.

## Interfaces/types added

- `YieldBundle`: `{ food, production, science }`
- `EmpireEconomy`: `{ foodStock, productionStock, scienceStock, lastTurnIncome }`
- `GameState.economy`:
  - `player`, `enemy`, `researchIncomeThisTurn`
- City economy/identity fields:
  - `focus`, `workedHexes`, `yieldLastTurn`, `identity`, `growthProgress`
- City extension fields:
  - `buildings`, `specialization`, `productionTab`, typed `queue` entries
- City durability fields used with capture flow:
  - `health`, `maxHealth`
- City APIs:
  - `assignWorkedHexes`, `computeCityYield`, `setCityFocus`, `enqueueCityQueue`, `removeCityQueueAt`, `processTurn`

## Behavior and acceptance criteria

- Terrain yields stay locked defaults:
  - plains `2/1/0`
  - forest `1/2/0`
  - hill `0/2/1`
  - mountain/water `0/0/0` (unworkable)
- `processTurn(gameState, owner)` aggregates city yield into `economy[owner].lastTurnIncome` and stocks.
- Growth spends empire `foodStock` with threshold `8 + (population - 1) * 4`.
- Production spends empire `productionStock` in deterministic city-id order.
- Shared queue (units/buildings) consumes front item on successful completion; duplicates are blocked for city buildings.
- Enemy refill behavior is now personality-aware via AI planning (`spec-014`), not city-system cheapest fallback.
- Capture keeps city identity/economy fields and resets city HP; raze removes city.
- Research consumes empire science and keeps overflow/leftovers as designed.

## Validation performed (tests/manual checks)

- Integration: `tests/integration/citySystem.test.js`
- Integration: `tests/integration/researchSystem.test.js`
- Integration: `tests/integration/combat.test.js` (capture/raze economy continuity expectations)
- E2E: `tests/e2e/smoke.mjs` validates economy progression in the updated loop

## Known gaps and next steps

- No manual worker assignment UI.
- No economy pressure from gold/upkeep.
- No empire-wide upkeep/maintenance pressure for buildings yet.
