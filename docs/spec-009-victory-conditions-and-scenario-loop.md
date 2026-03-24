# spec-009-victory-conditions-and-scenario-loop

## Goal and scope

- Define clear match end conditions and restart flow.
- Validate an end-to-end multi-turn gameplay scenario through e2e.

## Decisions made (and alternatives rejected)

- Chosen: two win conditions:
  - enemy elimination
  - survive until configured hold-turn target
- Chosen: loss condition is complete player elimination (no units and no cities).
- Chosen: end-of-match overlay with explicit restart action in UI scene.
- Rejected for now: score-based or multi-objective victory systems.

## Interfaces/types added

- Match state:
  - `status`, `reason`, `holdTurnsTarget`
- Victory system:
  - `VictorySystem.evaluateMatchState(gameState)`
  - `VictorySystem.getMatchResultLabel(gameState)`
- New events:
  - `restart-match-requested`

## Behavior and acceptance criteria

- Match switches from `ongoing` to `won`/`lost` when condition triggers.
- Result overlay appears with outcome text and restart button.
- Restart resets game state and returns to playable loop.
- E2E scenario executes:
  - move -> attack -> found city -> produce unit -> complete tech -> trigger victory

## Validation performed (tests/manual checks)

- Integration test: `tests/integration/victorySystem.test.js`.
- Updated e2e: `tests/e2e/smoke.mjs` validates full scenario path and final victory.
- Manual visual validation of result overlay and controls:
  - `tests/e2e/artifacts/smoke.png`
  - `tests/e2e/artifacts/mobile-smoke.png`

## Known gaps and next steps

- No post-match summary stats screen yet.
- No scenario parameterization UI for alternate victory targets.
- No separate campaign/meta progression after match completion.
