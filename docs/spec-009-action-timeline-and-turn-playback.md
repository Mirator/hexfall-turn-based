# spec-009-action-timeline-and-turn-playback

## Goal and scope

- Add a lightweight action timeline so key gameplay events are visible and easier to follow.
- Keep gameplay determinism and combat/economy authority in simulation state.
- Replace instant enemy-phase resolution with sequential, explainable playback.

## Decisions made (and alternatives rejected)

- Chosen: keep current Graphics renderer and add a tween-driven presentation layer (`no full sprite refactor`).
- Chosen: movement/combat/founding/outcome visuals are queued clips (`move`, `attack`, `attack-city`, `found-city`, `city-outcome`) and run sequentially.
- Chosen: authoritative state mutates first; animation reads committed results and visualizes them.
- Chosen: enemy phase executes as plan-based step playback (`prepare -> prelude -> execute step-by-step -> finalize`).
- Chosen: adaptive enemy playback speed scaling by action count to avoid long dead time on large turns.
- Rejected for now: frame-by-frame simulation rewind, manual step-confirm enemy playback mode, and full sprite asset pipeline.

## Interfaces/types added

- Movement:
  - `getPathTo(unitId, destination, gameState)`
  - `moveUnit(...)` now returns `path` metadata on success.
- Enemy turn:
  - `prepareEnemyTurnPlan(gameState)`
  - `executeEnemyTurnPrelude(gameState, plan)`
  - `executeEnemyTurnStep(gameState, step)`
  - `finalizeEnemyTurnPlan(gameState, plan, actions, appliedPrelude?)`
  - `runEnemyTurn(gameState)` retained as compatibility wrapper.
- Runtime payload surfaces:
  - `animationState: { busy, kind, queueLength }`
  - `turnPlayback: { active, actor, stepIndex, totalSteps, message }`
  - `EnemyActionSummary.presentation?: { from, to, target }`
- Browser hooks:
  - `window.__hexfallTest.getAnimationState()`
  - `window.__hexfallTest.requestEndTurn()`
  - `window.__hexfallTest.endTurnImmediate()` retained unchanged for deterministic fast-path tests.

## Behavior and acceptance criteria

- Unit movement no longer appears as tile teleport; it animates along contiguous path segments.
- Combat readability:
  - unit attack lunge + hit pulse + floating damage,
  - optional counterattack pulse/lunge,
  - defeat burst feedback.
- City interactions:
  - city assault pulse/damage feedback,
  - founding pulse/spawn animation,
  - capture/raze outcome burst animation.
- Enemy turn flow:
  - entering enemy turn exposes active `turnPlayback`,
  - action index advances per executed enemy action,
  - phase returns to player only after playback finishes and enemy turn post-processing is complete.
- Input lock:
  - player command actions are blocked while animation queue is busy,
  - camera pan remains available while no modal is open.

## Validation performed (tests/manual checks)

- `npm run lint`
- `npm test`
- `npm run test:e2e`
- `npm run build`
- E2E smoke now validates non-immediate enemy playback activity (`turnPlayback.active` + step progression) and return to player phase.

## Known gaps and next steps

- Presentation layer remains minimalist (shape/pulse/text feedback only; no authored sprite sheets yet).
- No animation skip/fast-forward toggle in UI yet.
- No dedicated combat timeline panel beyond playback banner + notification stream.
