# spec-002-core-map-turn-and-victory

## Goal and scope

- Define the core map, movement, turn flow, and win/loss session loop.
- Keep map generation seeded and restart-safe.
- Keep victory rules explicit and domination-only.

## Decisions made (and alternatives rejected)

- Chosen: axial hex coordinates (`q`,`r`) with six-direction movement.
- Chosen: seeded `12x12` map generation with spawn metadata and faction-distance constraints.
- Chosen: movement reachability uses path cost (Dijkstra-style), not flat distance.
- Chosen: terrain model separates passable high-cost tiles from blocked tiles.
- Chosen: turn flow remains `player -> enemy -> player` with deterministic state transitions.
- Chosen: only domination victory (`eliminate all enemy units and cities`); defeat is total player elimination.
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
- Match/map generation interfaces:
  - `createInitialGameState({ seed, minFactionDistance })`
  - `map.seed`, `map.spawnMetadata`
- Turn/victory interfaces:
  - `beginEnemyTurn(gameState)`
  - `beginPlayerTurn(gameState)`
  - `VictorySystem.evaluateMatchState(gameState)`
  - `restart-match-requested`, `ui-modal-state-changed`, `city-outcome-requested`

## Behavior and acceptance criteria

- Player can select valid entities and move units to reachable hexes.
- Reachable overlays reflect cumulative terrain movement cost.
- Forest/hill are higher-cost passable terrain; mountain/water are blocked for current land units.
- Ending turn enters enemy phase, resolves enemy turn logic, then returns to player phase with updated turn state.
- Match state transitions to `won/lost` only through elimination checks.
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
  - `tests/integration/victorySystem.test.js`
- E2E flow coverage:
  - `tests/e2e/smoke.mjs`

## Known gaps and next steps

- No roads/path preview UI for route planning yet.
- No fog-of-war or line-of-sight map state.
- No alternate game modes beyond domination.
