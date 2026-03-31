# spec-009-action-timeline-and-turn-playback

## Goal and scope

- Add a lightweight action timeline so key gameplay events are visible and easier to follow.
- Keep gameplay determinism and combat/economy authority in simulation state.
- Replace instant AI-phase resolution with sequential, explainable playback across active AI owners.

## Decisions made (and alternatives rejected)

- Chosen: sprite-backed presentation layer for terrain + unit/city actors while simulation authority remains unchanged.
- Chosen: movement/combat/founding/outcome visuals are queued clips (`move`, `attack`, `attack-city`, `found-city`, `city-outcome`) and run sequentially.
- Chosen: authoritative state mutates first; animation reads committed results and visualizes them.
- Chosen: AI phase executes as plan-based step playback per owner (`prepare -> prelude -> execute step-by-step -> finalize`).
- Chosen: AI phase runs all active owners sequentially (`factions.aiOwners` order) in the same turn phase.
- Chosen: adaptive playback speed scaling by action count to reduce dead time on large turns.
- Chosen: deterministic owner tint fallback supports expanded owner roster for sprite readability.
- Rejected for now: frame-by-frame simulation rewind, manual step-confirm mode, and full sprite-sheet authoring pipeline.

## Interfaces/types added

- Movement:
  - `getPathTo(unitId, destination, gameState)`
  - `moveUnit(...)` returns `path` metadata on success.
- Enemy turn:
  - `prepareEnemyTurnPlan(gameState, owner?)`
  - `executeEnemyTurnPrelude(gameState, plan)`
  - `executeEnemyTurnStep(gameState, step)`
  - `finalizeEnemyTurnPlan(gameState, plan, actions, appliedPrelude?)`
  - `runEnemyTurn(gameState, owner?)` retained as compatibility wrapper.
- Runtime payload surfaces:
  - `animationState: { busy, kind, queueLength }`
  - `spriteLayers: { terrain, units, cities, fx, unitSamples? }`
  - `turnPlayback: { active, actor, stepIndex, totalSteps, message }`
  - `EnemyActionSummary.presentation?: { from, to, target }`
- Browser hooks:
  - `window.__hexfallTest.getAnimationState()`
  - `window.__hexfallTest.getSpriteLayerCounts()`
  - `window.__hexfallTest.requestEndTurn()`
  - `window.__hexfallTest.endTurnImmediate()` retained for deterministic fast-path tests.

## Behavior and acceptance criteria

- Unit movement no longer appears as tile teleport; it animates along contiguous path segments.
- Combat readability:
  - unit attack lunge + hit pulse + floating damage
  - optional counterattack pulse/lunge
  - defeat burst feedback
- City interactions:
  - city assault pulse/damage feedback
  - founding pulse/spawn animation
  - capture/raze outcome burst animation
- Visual stack:
  - terrain uses deterministic per-tile sprite variants with fog/memory overlays preserved
  - units/cities render as sprite containers keyed by entity id
  - owner tinting remains deterministic, including fallback for expanded AI owner pool
  - health bars and tactical overlays remain simulation-driven
- AI turn flow:
  - entering AI turn exposes active `turnPlayback`
  - playback actor identifies currently resolving owner
  - action index advances per executed AI action
  - phase returns to player only after all active AI owners finish playback and post-processing completes
- Input lock:
  - player command actions are blocked while animation queue is busy
  - camera pan remains available while no modal is open
- Determinism guard:
  - visual/presentation changes do not alter deterministic simulation outcomes for fixed seeds

## Validation performed (tests/manual checks)

- `npm run lint`
- `npm test`
- `npm run test:e2e`
- `npm run build`
- Integration:
  - `tests/integration/determinismVisualParity.test.js`
  - `tests/unit/visualAssets.test.js`
- E2E smoke validates playback activity (`turnPlayback.active` + step progression) and deterministic return-to-player transition.

## Known gaps and next steps

- Sprite content is static v1 (single-frame tokens with lightweight FX), not full multi-frame authored animation sheets.
- No animation skip/fast-forward toggle in UI yet.
- No dedicated combat timeline panel beyond playback banner + notification stream.
