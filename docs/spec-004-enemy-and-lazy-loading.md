# spec-004-enemy-and-lazy-loading

Status: historical baseline milestone. Current enemy combat/strategy behavior is defined by `spec-014` and `spec-015`.

## Goal and scope

- Add a minimal enemy turn stub to the playable loop (baseline at the time of this milestone).
- Refactor startup so Phaser is loaded lazily and bundled into separate chunks.
- Keep existing test hooks and automated smoke coverage stable.

## Decisions made (and alternatives rejected)

- Chosen (at milestone time): one deterministic enemy unit that moves one hex toward the nearest player unit per enemy phase.
- Chosen: explicit phase transitions (`player -> enemy -> player`) with a short delay for readability.
- Chosen: dynamic import of game bootstrap from `main.js` and manual chunk splitting in Vite.
- Rejected in this milestone: full enemy pathfinding/combat and complex AI behavior (later delivered in `spec-014`/`spec-015`).

## Interfaces/types added

- `runEnemyTurn(gameState)` in `src/systems/enemyTurnSystem.js`
- Turn system phase helpers:
  - `beginEnemyTurn(gameState)`
  - `beginPlayerTurn(gameState)`
- Added phase-aware UI behavior:
  - End Turn button disables while enemy phase is active.
- Added `vite.config.js` build chunk controls:
  - `manualChunks` for Phaser vendor and gameplay modules.

## Behavior and acceptance criteria

- On End Turn, game enters enemy phase and ignores player input.
- Enemy unit performs one deterministic movement step (baseline behavior for this milestone).
- Turn then returns to player phase, increments turn counter, and resets player movement.
- Phaser runtime is not in the initial entry bundle and loads through dynamic import.

## Validation performed (tests/manual checks)

- `npm run lint` passed.
- `npm test` passed (`8` tests across unit/integration suites).
- `npm run build` passed with split output:
  - `dist/assets/index-*.js` (entry) ~3.3 kB
  - `dist/assets/gameplay-*.js` ~1092.6 kB (reduced from prior ~1208.9 kB)
- `npm run test:e2e` passed with enemy-turn assertions and screenshot artifact.
- Manual screenshot inspection:
  - `tests/e2e/artifacts/smoke.png`
  - `tests/e2e/artifacts/mobile-smoke.png`

## Known gaps and next steps

- At this milestone, enemy logic only chased nearest player unit and did not attack.
- At this milestone, enemy movement did not yet consider full terrain/path constraints.
- Current enemy behavior is superseded by `spec-014` and `spec-015`.
- Consider adding separate enemy unit visuals/animation states for richer readability.
