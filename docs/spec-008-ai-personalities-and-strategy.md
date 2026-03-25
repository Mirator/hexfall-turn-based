# spec-008-ai-personalities-and-strategy

## Goal and scope

- Make enemy turns strategically distinct and deterministic by personality.
- Keep AI choices explainable through explicit goal/action scoring outputs.
- Align AI combat, city, research, and production behavior with current game systems.

## Decisions made (and alternatives rejected)

- Chosen: deterministic personality assignment by seed (`seed % 3`) with explicit test override.
- Chosen: turn-goal scoring with locked goals (`foundFirstCity`, `expand`, `defend`, `assaultCity`, `huntUnits`, `regroup`, `idle`).
- Chosen: scored unit actions with deterministic tie-break `score -> cost -> q -> r -> id`.
- Chosen: personality-specific research priority lists (including `archery`).
- Chosen: personality-aware queue refill uses typed queue items (`unit`/`building`) and respects duplicate-building rules.
- Chosen: personality-specific city outcome policy:
  - `raider`: raze unless AI has zero cities
  - `expansionist`: capture
  - `guardian`: capture if near allied city, else raze
- Rejected for now: stochastic/randomized tie-break behavior.

## Interfaces/types added

- `GameState.ai.enemy`:
  - `personality`
  - `lastGoal`
  - `lastTurnSummary`
- Enemy AI APIs:
  - `ensureEnemyAiState(gameState)`
  - `deriveEnemyPersonality(seed)`
  - `normalizeEnemyPersonality(personality, fallbackSeed)`
  - `pickEnemyResearchTech(personality, selectableTechIds)`
  - `pickEnemyQueueUnit(gameState, personality)`
  - `pickEnemyGoal(gameState, personality)`
  - `pickEnemyCityOutcome(attackerOwner, targetCity, gameState)`
  - `runEnemyTurn(gameState)`
- Test hooks:
  - `window.__hexfallTest.setEnemyPersonality(personality)`
  - `window.__hexfallTest.getEnemyAiState()`

## Behavior and acceptance criteria

- Personality is stable for a seed unless explicitly overridden.
- Enemy turn summary records goal, research choice, queue refills, and scored actions.
- Enemy opening behavior founds first city from settler-only start when valid.
- Queue refill choices are deterministic and personality-aware.
- AI city capture/raze outcomes follow personality policy and trigger immediate state updates.
- Runtime payload exposes AI state for deterministic automation and regression checks.

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/enemyAi.test.js`
  - `tests/integration/enemyTurn.test.js`
  - `tests/integration/combat.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` verifies personality payload and override hooks in full scenario flow.

## Known gaps and next steps

- No fog-of-war-aware long-horizon planning yet.
- No diplomacy/multi-faction strategic behavior.
- No dynamic personality switching during a match.
