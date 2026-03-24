# spec-007-city-founding-and-production-lite

## Goal and scope

- Add foundational expansion gameplay through settler city founding.
- Add city production accumulation and unit spawning.

## Decisions made (and alternatives rejected)

- Chosen: only `settler` can found cities.
- Chosen: founding consumes settler and creates a city on that tile.
- Chosen: city production is lightweight and turn-based with queue cycling.
- Rejected for now: city tile ownership, districting, food/housing/happiness systems.

## Interfaces/types added

- City type:
  - `id`, `owner`, `q`, `r`, `population`, `productionPerTurn`, `storedProduction`, `queue`
- City system:
  - `CitySystem.canFoundCity(unitId, gameState)`
  - `CitySystem.foundCity(unitId, gameState)`
  - `CitySystem.processTurn(gameState, owner)`
  - `CitySystem.cycleCityQueue(cityId, gameState)`

## Behavior and acceptance criteria

- Settler can found a city via UI action when selected.
- City gains production per turn.
- Queue item is produced once enough production is accumulated.
- Produced unit spawns on valid adjacent tile when available.

## Validation performed (tests/manual checks)

- Integration test: `tests/integration/citySystem.test.js`.
- E2E scenario includes `found city` step followed by produced unit assertion.

## Known gaps and next steps

- No city growth/food model beyond static population field.
- No building production branch yet (unit-only queue focus).
- Enemy city behavior is not implemented in this milestone.
