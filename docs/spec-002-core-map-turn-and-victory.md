# spec-002-core-map-turn-and-victory

## Goal and scope

- Define the core map, movement, turn flow, and win/loss session loop.
- Keep map generation seeded, restart-safe, and configurable by startup/new-game settings.
- Keep victory rules explicit and domination-only.

## Decisions made (and alternatives rejected)

- Chosen: axial hex coordinates (`q`,`r`) with six-direction movement.
- Chosen: seeded square map presets (`16`, `20`, `24`) with configurable AI faction count (`1..6`).
- Chosen: dynamic faction roster from owner pool (`enemy`, `purple`, `amber`, `teal`, `crimson`, `onyx`) plus `player`.
- Chosen: seeded spawn metadata stores per-owner anchors/spawns (`anchorsByOwner`, `spawnByOwner`), distance constraints, and safe-terrain spawn normalization.
- Chosen: movement reachability uses path cost (Dijkstra-style), not flat distance.
- Chosen: terrain model separates passable high-cost tiles from blocked tiles, and movement/pathing cannot enter city-occupied hexes.
- Chosen: explored-memory fog-of-war is owner-specific (`visible`, `explored`, `seenOwners`) and updated from unit/city sight ranges.
- Chosen: diplomacy status is authoritative for hostility; factions start at war and player can switch known-faction relations (`war`/`peace`) via stats-panel controls.
- Chosen: turn flow remains `player -> enemy -> player`, where enemy phase is combined AI playback over all active `factions.aiOwners` in deterministic order.
- Chosen: only domination victory (`eliminate all AI faction units and cities` across active AI owners); defeat is total player elimination.
- Chosen: restart/new-game flow from pause menu confirm path supports map size + AI count reconfiguration and produces a fresh seeded match.
- Rejected for now: endurance/score victories and non-seeded/random tie-break session logic.

## Interfaces/types added

- Match/faction configuration interfaces:
  - `resolveMatchConfig({ mapWidth, mapHeight, aiFactionCount })`
  - `buildAiOwners(aiFactionCount)`
  - `createFactionMetadata(aiOwners?)`
  - `GameState.matchConfig.{mapWidth,mapHeight,aiFactionCount}`
  - `GameState.factions.{playerOwner,aiOwners,allOwners,labels}`
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
  - `createInitialGameState({ seed, minFactionDistance, mapWidth?, mapHeight?, aiFactionCount?, matchConfig?, enemyPersonality?, purplePersonality?, aiPersonalities? })`
  - `map.seed`, `map.spawnMetadata`
  - `map.spawnMetadata.anchorsByOwner`
  - `map.spawnMetadata.spawnByOwner`
  - legacy compatibility fields: `map.spawnMetadata.anchors`, `map.spawnMetadata.spawns`
  - `map.spawnMetadata.nearestFactionDistance` (nearest pairwise spawn distance)
- Visibility interfaces:
  - `recomputeVisibility(gameState)`
  - `isHexVisibleToOwner(gameState, owner, q, r)`
  - `isHexExploredByOwner(gameState, owner, q, r)`
  - `canOwnerSeeUnit(gameState, owner, unit)`
  - `canOwnerSeeCity(gameState, owner, city)`
  - `getSeenOwners(gameState, owner)`
  - `getSeenHostileOwners(gameState, aiOwner)`
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
- City-occupied hexes are excluded from movement/pathing reachability and cannot be selected as movement destinations.
- Match generation honors startup/new-game config:
  - map size preset (`16/20/24`)
  - AI faction count (`1..6`)
  - one settler spawn per owner in `factions.allOwners`
  - spawn safety + minimum pairwise spawn distance constraints
- Ending turn enters AI phase, exposes active playback state, executes each active AI owner sequentially, and returns to player phase only after playback and AI post-processing complete.
- Fog rules:
  - unexplored tiles are shrouded,
  - explored but not currently visible tiles render dimmed,
  - hostile units/cities are interactable only while currently visible (unless dev reveal is enabled for player),
  - encounter memory (`seenOwners`) persists after visibility is lost.
- Diplomacy rules:
  - factions start at war by default,
  - player diplomacy actions are first-contact gated,
  - peace blocks hostile combat targeting between the involved factions until war is declared again.
- Match state transitions to `won/lost` only through elimination checks (`player` vs all active AI factions).
- Restart flow:
  - Esc opens pause menu.
  - Restart action requires confirm/cancel.
  - Confirm starts a fresh match with configured map size + AI count and new seed/layout.
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
  - `tests/e2e/smoke.mjs` (startup config, expanded roster `24x24` with `6` AI, real AI playback path, fog/dev-vision checks, and return-to-player transition)

## Known gaps and next steps

- No roads/path preview UI for route planning yet.
- No AI-initiated diplomacy/alliance behavior yet (current diplomacy is player-managed relation toggling).
- No alternate game modes beyond domination.
