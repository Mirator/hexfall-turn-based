# spec-007-city-founding-and-production-lite

## Goal and scope

- Make city founding the opening action for both factions in a settler-only start.
- Keep production simple while integrating with empire-wide resource spending.

## Decisions made (and alternatives rejected)

- Chosen: only settlers can found cities.
- Chosen: both factions start with one settler; no starting warriors.
- Chosen: enemy auto-founds its first city during enemy turn when valid.
- Chosen: city queues remain city-level, but spending is from empire `productionStock`.
- Chosen: discoverability relies on contextual hints/toasts and `F` shortcut (no persistent tutorial blocks).
- Rejected for now: border expansion, manual worker placement, and building branches in this milestone.

## Interfaces/types added

- `CitySystem.canFoundCity(unitId, gameState)`
- `CitySystem.foundCity(unitId, gameState)`
- `CitySystem.processTurn(gameState, owner)`
- `CitySystem.cycleCityQueue(cityId, gameState)`
- `CitySystem.getFoundCityReasonText(reason)`
- City state includes:
  - `focus`, `workedHexes`, `yieldLastTurn`, `identity`, `growthProgress`, `health`, `maxHealth`, `queue`

## Behavior and acceptance criteria

- Settler can found city only on valid passable tile with no existing city.
- Found City action is context-sensitive and provides reasoned disabled feedback.
- Player founding consumes the settler and selects the new city.
- Enemy opening behavior auto-founds first enemy city from settler start.
- City yields feed empire income; queues spend empire production to spawn units.

## Validation performed (tests/manual checks)

- Integration: `tests/integration/citySystem.test.js`
- Integration: `tests/integration/enemyTurn.test.js` (auto-found behavior)
- Integration: `tests/integration/uiSurface.test.js` (founding hints/action state)
- E2E: `tests/e2e/smoke.mjs` includes player founding + enemy auto-founding in scenario flow

## Known gaps and next steps

- No building queue branches yet.
- No city placement preview pathing.
- No dedicated early-game advisor/tutorial sequence.
