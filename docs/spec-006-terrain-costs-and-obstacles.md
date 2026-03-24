# spec-006-terrain-costs-and-obstacles

## Goal and scope

- Replace flat-distance movement with terrain-aware path-cost movement.
- Add impassable obstacle terrain for tactical movement constraints.

## Decisions made (and alternatives rejected)

- Chosen: deterministic generated terrain map to keep tests stable.
- Chosen: Dijkstra-style cost expansion for reachable tile calculation.
- Chosen: `forest`/`hill` are passable with higher move cost; `mountain`/`water` are blocked for land units.
- Rejected for now: per-unit movement class differences (land/naval/flying).

## Interfaces/types added

- Tile fields:
  - `terrainType`, `moveCost`, `blocksMovement`
- Terrain definitions and generator:
  - `core/terrainData.js`
- Movement system updates:
  - `MovementSystem.getReachable()` now path-cost based
  - `MovementSystem.getReachableCostMap()`
  - `MovementSystem.canMoveUnitTo()` blocked-terrain awareness

## Behavior and acceptance criteria

- Reachable overlay reflects cumulative move cost, not pure geometric distance.
- Forest and hills consume more movement points.
- Water and mountains cannot be entered by current unit set.
- Movement through occupied tiles remains disallowed.

## Validation performed (tests/manual checks)

- Integration test: `tests/integration/terrainMovement.test.js`.
- E2E runs on mixed-terrain map and passes movement+turn scenario.
- Manual screenshot checks confirm terrain visual differentiation.

## Known gaps and next steps

- No per-terrain combat modifiers yet.
- No roads or terrain improvement systems.
- No explicit path preview line; only reachable tile highlights.
