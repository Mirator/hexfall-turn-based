# spec-008-ai-personalities-and-strategy

## Goal and scope

- Make AI turns strategically distinct and deterministic across multiple AI factions.
- Keep AI choices explainable through explicit goal/action scoring outputs.
- Align AI combat, city, research-selection, and production behavior with current game systems.

## Decisions made (and alternatives rejected)

- Chosen: deterministic personality assignment by seed + owner key for every active AI owner.
- Chosen: dynamic AI owner roster (from faction metadata) shares one strategic engine; no owner-specific hardcoded branch logic.
- Chosen: turn-goal scoring with locked goals (`foundFirstCity`, `expand`, `defend`, `assaultCity`, `huntUnits`, `regroup`, `idle`).
- Chosen: scored unit actions with deterministic tie-break `score -> cost -> q -> r -> id`.
- Chosen: owner-aware execution exposed as deterministic step flow (`prepare -> prelude -> step -> finalize`) for sequential playback.
- Chosen: hostiles are all non-owner factions, not player-only.
- Chosen: AI target selection and hostile-priority scoring are visibility-gated and encounter-memory-aware (`seenOwners`).
- Chosen: personality-specific research priority lists and queue-refill priorities.
- Chosen: personality-aware queue refill uses typed queue items (`unit`/`building`) and respects duplicate-building rules.
- Chosen: executed action summaries can carry presentation metadata (`from`/`to`/`target`) for explainable playback surfaces.
- Chosen: personality-specific city outcome policy:
  - `raider`: raze unless AI has zero cities
  - `expansionist`: capture
  - `guardian`: capture if near allied city, else raze
- Rejected for now: stochastic/randomized tie-break behavior and mid-match dynamic personality switching.

## Interfaces/types added

- `GameState.ai`:
  - compatibility buckets: `enemy`, `purple`
  - authoritative bucket: `byOwner`
- AI APIs:
  - `ensureAiState(gameState, owner?)`
  - `getAiPersonality(gameState, owner?)`
  - `ensureEnemyAiState(gameState)`
  - `deriveEnemyPersonality(seed, owner?)`
  - `normalizeEnemyPersonality(personality, fallbackSeed, owner?)`
  - `pickEnemyResearchTech(personality, selectableTechIds)`
  - `pickEnemyQueueUnit(gameState, personality?)`
  - `pickEnemyGoal(gameState, personality?, owner?)`
  - `pickEnemyCityOutcome(attackerOwner, targetCity, gameState)`
  - `prepareEnemyTurnPlan(gameState, owner?)`
  - `executeEnemyTurnPrelude(gameState, plan)`
  - `executeEnemyTurnStep(gameState, step)`
  - `finalizeEnemyTurnPlan(gameState, plan, actions, appliedPrelude?)`
  - `runEnemyTurn(gameState, owner?)`
- Enemy summary shape additions:
  - `EnemyActionSummary.presentation?: { from, to, target }`
- Visibility/encounter dependency:
  - `getSeenHostileOwners(gameState, owner)`
- Test hooks:
  - `window.__hexfallTest.setEnemyPersonality(personality)`
  - `window.__hexfallTest.setAiPersonality(owner, personality)`
  - `window.__hexfallTest.getEnemyAiState()`
  - `window.__hexfallTest.getAiState(owner)`
  - `window.__hexfallTest.clearEnemyCityQueue(cityId?)`
  - `window.__hexfallTest.clearAiCityQueue(owner, cityId?)`

## Behavior and acceptance criteria

- Personality is stable for a given seed/owner unless explicitly overridden.
- `ensureAiState` guarantees AI state exists for every active owner in `factions.aiOwners`.
- Each AI owner summary records goal, research selection, queue refills, and scored actions.
- Sequential playback uses the same deterministic step ordering as wrapper execution.
- AI opening behavior founds first city from settler-only starts when valid.
- Queue refill choices are deterministic and personality-aware.
- AI city capture/raze outcomes follow personality policy and trigger immediate state updates.
- AI planning can only target hostile units/cities currently visible to that AI owner.
- Unseen hostile factions are excluded from direct priority inputs until encountered.
- AI action stream supports per-step explainability messaging (`<Owner> action X/Y`) and deterministic animation targeting.
- Runtime payload exposes AI state by owner for deterministic automation and regression checks.

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/enemyAi.test.js`
  - `tests/integration/enemyTurn.test.js`
  - `tests/integration/combat.test.js`
  - `tests/integration/visibilitySystem.test.js` (seen-hostile memory contract)
- E2E:
  - `tests/e2e/smoke.mjs` verifies personality payload and override hooks in full scenario flow.

## Known gaps and next steps

- No diplomacy/alliance/peace-state system between factions.
- Exploration heuristics are still simple (yield + unseen bonus), not objective-graph driven.
- No dynamic personality switching during a match.
