# spec-014-ai-personalities-and-strategic-goals

## Goal and scope

- Make enemy turns strategically distinct and deterministic by personality.
- Add turn-goal planning and scored unit actions so AI behavior is explainable.
- Align enemy research/queue/city-outcome choices with personality rules.

## Decisions made (and alternatives rejected)

- Chosen: deterministic personality assignment by seed (`seed % 3`) with explicit test override.
- Chosen: turn-goal scoring with locked goals (`foundFirstCity`, `expand`, `defend`, `assaultCity`, `huntUnits`, `regroup`, `idle`).
- Chosen: scored unit actions with deterministic tie-break `score -> cost -> q -> r -> id`.
- Chosen: personality-specific research priority lists including `archery`.
- Chosen: personality-aware queue refill now uses typed queue items (units/buildings) and respects building duplicate rules.
- Chosen: city defeat policy by personality:
  - `raider`: raze unless AI has zero cities.
  - `expansionist`: capture.
  - `guardian`: capture if near allied city, else raze.
- Rejected for now: stochastic behavior and hidden randomness in tie resolution.

## Interfaces/types added

- `GameState.ai.enemy`:
  - `personality`
  - `lastGoal`
  - `lastTurnSummary`
- Enemy AI exports:
  - `ensureEnemyAiState(gameState)`
  - `getEnemyPersonality(gameState)`
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

- Personality is stable for a given seed unless explicitly overridden.
- AI turn flow records summary each turn:
  - selected goal,
  - selected research (if changed),
  - queue refills,
  - executed actions and scores.
- Queue refill uses typed items (`unit`/`building`) with deterministic personality preference and duplicate-building protection.
- City capture/raze on AI city kills follows personality policy.
- `render_game_to_text` exposes enemy AI runtime payload for automation.

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/enemyAi.test.js`
  - `tests/integration/enemyTurn.test.js`
  - `tests/integration/combat.test.js`
- Full suite:
  - `npm run lint`
  - `npm test`
- E2E:
  - `npm run test:e2e` verifies personality payload + override hooks in scenario flow.

## Known gaps and next steps

- No fog-of-war-aware planning yet.
- No long-horizon city placement planner (current settle scoring is local).
- No diplomacy-driven goal adaptation yet.
