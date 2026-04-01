# spec-005-city-economy-production-and-specialization

## Goal and scope

- Define city founding, city management, and per-owner economy behavior.
- Keep production deterministic with typed queue items and explicit building prerequisites.
- Define city-level science infrastructure (Campus + science buildings) that feeds the direct per-turn research model.

## Decisions made (and alternatives rejected)

- Chosen: all configured owners (`player` + active AI owners) start settler-only; no starting warriors.
- Chosen: only settlers can found cities; AI owners auto-found first valid city opportunities.
- Chosen: economy remains per-owner (`foodStock`, `productionStock`, `sciencePerTurn`) with deterministic processing order by city id.
- Chosen: worked-tile assignment remains deterministic ring-1 selection by balanced food/production priority.
- Chosen: city production queue is typed (`unit`/`building`) with max length `3` and deterministic reorder/remove semantics.
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
- Chosen: specialists are out of scope for this release.
- Chosen: duplicate building construction per city is blocked (already built or already queued).
- Rejected for now: manual district tile placement UI, specialist slots, maintenance/upkeep system.

## Interfaces/types added

- `City` schema:
  - `buildings` includes `campus/library/university/researchLab`
  - `campus: { built, adjacency, adjacencyBreakdown }`
- Economy model:
  - `EmpireEconomy.sciencePerTurn` (replaces `scienceStock` for research funding)
- City/production APIs:
  - `enqueueCityBuilding(cityId, buildingId, gameState)`
  - `getAvailableProductionBuildings(gameState)`
  - `isBuildingUnlocked(buildingId, gameState)`
  - `processTurn(gameState, owner)`
- Research-linked city science support:
  - `getCityScienceBreakdown(city, gameState)` in research system (population + Campus adjacency + science buildings)

## Behavior and acceptance criteria

- Founding:
  - settler-only, valid passable/empty tile required
  - founding consumes settler and creates/selects city
- Turn economy processing:
  - `food` and `production` remain stock-based
  - `sciencePerTurn` is recalculated each turn from city science outputs (not accumulated into research stock)
- City science output formula:
  - `populationScience = population * 0.5`
  - `campusAdjacencyScience = city.campus.adjacency` when Campus exists
  - `buildingScience = library(2) + university(4) + researchLab(5)`
  - `cityScience = populationScience + campusAdjacencyScience + buildingScience`
- Queue/building behavior:
  - queue max `3`, deterministic reorder/remove
  - front item consumed only on successful completion
  - Campus/science buildings follow unlock + prerequisite rules
  - duplicate building enqueue/build per city is blocked
- City identity/specialization:
  - identity derives from current local yields
  - specialization priority remains `scholarly > industrial > agricultural > balanced`

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/citySystem.test.js`
  - `tests/integration/uiSurface.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` (queue flow + science payload presence + city science breakdown payload checks)

## Known gaps and next steps

- No manual district placement or adjacency preview UI (Campus is city-level abstraction only).
- No specialist slots/assignment system.
- No maintenance/upkeep pressure for building-heavy science strategies.
