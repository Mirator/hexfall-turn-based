# spec-009-victory-conditions-and-scenario-loop

## Goal and scope

- Keep a clear domination-only win/loss loop.
- Ensure restart is always accessible and safe during and after matches.
- Keep scenario automation aligned with city assault/capture flow.

## Decisions made (and alternatives rejected)

- Chosen: only domination victory (`eliminate all enemy units and cities`).
- Chosen: defeat remains total player elimination (no units and no cities).
- Chosen: restart path moved behind Esc pause menu, with explicit confirm step.
- Chosen: city defeat requires explicit `Capture` / `Raze` resolution before turn flow continues.
- Rejected for now: endurance/turn-hold victory, score victory, and multi-objective rule sets.

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
- Reset/match APIs:
  - `WorldScene.startNewMatch(previousLayout?)`
  - `createInitialGameState({ seed, minFactionDistance })`

## Behavior and acceptance criteria

- Match transitions `ongoing -> won/lost` only through elimination checks.
- Restart flow:
  - Esc opens pause menu
  - pause menu `Restart` opens confirm modal
  - confirm creates a fresh seeded match
  - cancel returns to current match unchanged
- Modal flow blocks world actions while pause/restart/city-resolution modals are open.
- City-resolution modal requires explicit capture/raze choice before play continues.
- Scenario automation verifies pause/restart path and city-resolution flow without unexpected defeat regressions.

## Validation performed (tests/manual checks)

- Integration: `tests/integration/victorySystem.test.js` (domination-only outcome logic).
- Integration: `tests/integration/combat.test.js` (city resolution effects on elimination state).
- E2E: `tests/e2e/smoke.mjs` (pause/restart + city-resolution + scenario continuity).
- Manual artifact review: `tests/e2e/artifacts/smoke.png`.

## Known gaps and next steps

- No post-match analytics/breakdown panel.
- No campaign/meta progression after victory.
- No dedicated deterministic e2e branch for full domination finish in one run.
