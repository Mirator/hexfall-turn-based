# spec-009-victory-conditions-and-scenario-loop

## Goal and scope

- Keep a clear domination-only win/loss loop.
- Ensure restart is always available and safe.
- Keep full-scenario e2e aligned with current city assault flow.

## Decisions made (and alternatives rejected)

- Chosen: only domination victory (`eliminate all enemy units and cities`).
- Chosen: defeat condition remains full player elimination (no units and no cities).
- Chosen: restart is available mid-match and post-result.
- Chosen: restart uses confirmation modal + interaction lock.
- Chosen: city defeat now requires explicit resolution (`Capture` / `Raze`) before turn continues.
- Rejected for now: score/time-based victories and multi-objective win sets.

## Interfaces/types added

- Match state:
  - `status`, `reason`
- Victory APIs:
  - `VictorySystem.evaluateMatchState(gameState)`
  - `VictorySystem.getMatchResultLabel(gameState)`
- UI events:
  - `restart-match-requested`
  - `ui-modal-state-changed`
  - `city-outcome-requested`
  - `ui-toast-requested`
- Reset and scenario flow:
  - `WorldScene.startNewMatch(previousLayout?)`
  - `createInitialGameState({ seed, minFactionDistance })`

## Behavior and acceptance criteria

- Match transitions `ongoing -> won/lost` only through elimination checks.
- Restart modal blocks gameplay input and closes via cancel/confirm/escape (restart modal path).
- City-resolution modal blocks gameplay until capture/raze decision is applied.
- Restart confirm creates a fresh seeded match with regenerated layout.
- Full e2e scenario covers:
  - settler-only start
  - player founding + enemy auto-founding
  - production to first combat unit
  - city assault and resolution modal
  - domination victory after enemy units/cities are removed

## Validation performed (tests/manual checks)

- Integration: `tests/integration/victorySystem.test.js`
- Integration: `tests/integration/combat.test.js` (city resolution impact on elimination path)
- E2E: `tests/e2e/smoke.mjs` validates domination win chain and modal gates
- Manual artifact review: `tests/e2e/artifacts/smoke.png`

## Known gaps and next steps

- No post-match breakdown stats.
- No campaign/meta progression hooks.
- No dedicated capture-vs-raze analytics/debug overlay.
