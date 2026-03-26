# spec-002-core-map-turn-and-victory

## Goal and scope

- Define the core map, movement, turn flow, and win/loss session loop.
- Keep map generation seeded and restart-safe.
- Keep victory rules explicit and domination-only.

## Decisions made (and alternatives rejected)

- Chosen: axial hex coordinates (`q`,`r`) with six-direction movement.
- Chosen: seeded `16x16` map generation with three-faction spawn metadata, pairwise distance constraints, and safe-terrain spawn normalization.
- Chosen: movement reachability uses path cost (Dijkstra-style), not flat distance.
- Chosen: terrain model separates passable high-cost tiles from blocked tiles.
- Chosen: explored-memory fog-of-war is owner-specific (`visible` + `explored` sets) and updated from unit/city sight ranges.
- Chosen: turn flow remains `player -> enemy -> player`, where enemy phase is the combined AI phase (`enemy` then `purple`) with deterministic sequential playback.
- Chosen: only domination victory (`eliminate all AI faction units and cities`); defeat is total player elimination.
- Chosen: restart is available through pause menu + confirm path and produces a fresh seeded match.
- Rejected for now: endurance/score victories and non-seeded/random tie-break session logic.

## Interfaces/types added

- Hex/grid interfaces:
  - `neighbors(hex)`
  - `distance(a, b)`
- Movement interfaces:
  - `MovementSystem.getReachable(unitId, gameState)`
  - `MovementSystem.getReachableCostMap(unitId, gameState)`
  - `MovementSystem.canMoveUnitTo(unitId, q, r, gameState)`
  - `MovementSystem.getPathTo(unitId, destination, gameState)`
  - `MovementSystem.moveUnit(...)` returns `{ ok, cost, path }` on success
- Match/map generation interfaces:
  - `createInitialGameState({ seed, minFactionDistance, enemyPersonality?, purplePersonality?, aiPersonalities? })`
  - `map.seed`, `map.spawnMetadata`
  - `map.spawnMetadata.anchors` (`player`, `enemy`, `purple`)
  - `map.spawnMetadata.spawns` (`playerSettler`, `enemySettler`, `purpleSettler`)
  - `map.spawnMetadata.nearestFactionDistance` (nearest pairwise spawn distance)
- Visibility interfaces:
  - `recomputeVisibility(gameState)`
  - `isHexVisibleToOwner(gameState, owner, q, r)`
  - `isHexExploredByOwner(gameState, owner, q, r)`
  - `canOwnerSeeUnit(gameState, owner, unit)`
  - `canOwnerSeeCity(gameState, owner, city)`
- Turn/victory interfaces:
  - `beginEnemyTurn(gameState)`
  - `beginPlayerTurn(gameState)`
  - `prepareEnemyTurnPlan(gameState, owner?)`
  - `executeEnemyTurnPrelude(gameState, plan)`
  - `executeEnemyTurnStep(gameState, step)`
  - `finalizeEnemyTurnPlan(gameState, plan, actions, appliedPrelude?)`
  - `runEnemyTurn(gameState, owner?)` (compatibility wrapper)
  - `VictorySystem.evaluateMatchState(gameState)`
  - `restart-match-requested`, `ui-modal-state-changed`, `city-outcome-requested`

## Behavior and acceptance criteria

- Player can select valid entities and move units to reachable hexes.
- Reachable overlays reflect cumulative terrain movement cost.
- Forest/hill are higher-cost passable terrain; mountain/water are blocked for current land units.
- Ending turn enters AI phase, exposes active playback state, executes `enemy` then `purple` actions sequentially, and returns to player phase only after playback and AI post-processing complete.
- Fog rules:
  - unexplored tiles are shrouded,
  - explored but not currently visible tiles render dimmed,
  - hostile units/cities are interactable only while currently visible (unless dev reveal is enabled for player).
- Match state transitions to `won/lost` only through elimination checks (`player` vs all AI factions).
- Restart flow:
  - Esc opens pause menu.
  - Restart action requires confirm/cancel.
  - Confirm starts a fresh match with a new seed/layout.
  - Cancel preserves current state.
- Modal states block world actions while open.

## Validation performed (tests/manual checks)

- Unit/integration coverage:
  - `tests/unit/hexGrid.test.js`
  - `tests/integration/movementTurn.test.js`
  - `tests/integration/terrainMovement.test.js`
  - `tests/integration/matchGeneration.test.js`
  - `tests/integration/visibilitySystem.test.js`
  - `tests/integration/victorySystem.test.js`
  - `tests/integration/enemyTurn.test.js`
- E2E flow coverage:
  - `tests/e2e/smoke.mjs` (real AI playback path + fog/dev-vision checks + return-to-player transition)

## Known gaps and next steps

- No roads/path preview UI for route planning yet.
- No diplomacy/peace treaties between factions yet.
- No alternate game modes beyond domination.
