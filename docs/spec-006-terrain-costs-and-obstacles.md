# spec-006-terrain-costs-and-obstacles

## Goal and scope

- Keep movement tactical with terrain costs/obstacles.
- Keep map generation seeded and restart-friendly.
- Keep opening positions safe for the current settler-only start model.

## Decisions made (and alternatives rejected)

- Chosen: seeded terrain generator (`generateTerrainTiles(width, height, { seed })`) for replayable variation.
- Chosen: Dijkstra-style reachable expansion by movement cost.
- Chosen: `forest`/`hill` are higher-cost passable terrain; `mountain`/`water` are blocked for current units.
- Chosen: spawn safety normalization forces plains around settler spawn anchors.
- Chosen: start spawns are now exactly one settler per faction.
- Rejected for now: per-unit movement classes (land/naval/flying).

## Interfaces/types added

- Tile fields:
  - `terrainType`, `moveCost`, `blocksMovement`, `yields`
- Terrain helpers:
  - `core/terrainData.js`
  - `applyTerrainDefinition(tile, terrainType)`
- Movement APIs:
  - `MovementSystem.getReachable()`
  - `MovementSystem.getReachableCostMap()`
  - `MovementSystem.canMoveUnitTo()`
- Match generation:
  - `createInitialGameState({ seed, minFactionDistance })`
  - map metadata: `map.seed`, `map.spawnMetadata`
  - settler-based spawn metadata keys: `spawns.playerSettler`, `spawns.enemySettler`

## Behavior and acceptance criteria

- Reachable overlays reflect cumulative movement cost, not flat hex distance.
- Forest/hill consume extra movement; mountain/water remain blocked.
- Occupied destination movement is disallowed.
- Same seed reproduces same terrain/spawn layout; different seeds vary terrain and/or layout.
- Player/enemy settler spawns honor the configured faction-distance floor.

## Validation performed (tests/manual checks)

- Integration: `tests/integration/terrainMovement.test.js`
- Integration: `tests/integration/matchGeneration.test.js` (determinism, variation, spacing, settler-only roster)
- E2E smoke confirms movement still works in the full turn loop.

## Known gaps and next steps

- Terrain combat modifiers now exist (see `spec-015`); movement and combat terrain effects are currently separate but compatible.
- No roads/improvements/path preview.
- No per-unit movement traits yet.
