# spec-008-ai-personalities-and-strategy

## Goal and scope

- Make AI turns strategically distinct and deterministic across multiple AI factions.
- Keep AI choices explainable through explicit goal/action scoring outputs.
- Include science-aware AI planning (boost feasibility, strategic tech switching preference, science infrastructure weighting).

## Decisions made (and alternatives rejected)

- Chosen: deterministic personality assignment by seed + owner key for every active AI owner.
- Chosen: dynamic AI owner roster shares one strategic engine; no hardcoded owner branch logic.
- Chosen: goal scoring remains fixed (`foundFirstCity`, `expand`, `defend`, `assaultCity`, `huntUnits`, `regroup`, `idle`).
- Chosen: scored action tie-break remains deterministic (`score -> cost -> q -> r -> id`).
- Chosen: AI research selection is boost-aware and progress-aware:
  - weighs boost readiness (`met` / `current/target`)
  - weighs carryover on currently progressed tech
  - weighs strategic unlock value (units/buildings/global science modifier)
- Chosen: AI can switch research targets strategically during planning.
- Chosen: AI queue priorities now include science infrastructure (`campus`, `library`, `university`, `researchLab`) while still honoring personality combat/expansion lean.
- Chosen: AI research choice is recorded in turn summaries but does not mutate the player-authoritative active research state directly during enemy prelude execution.
- Chosen: planning and targeting remain visibility-gated and encounter-memory-aware (`seenOwners`).
- Chosen: hostile target selection is diplomacy-aware through hostile-owner resolution (`getHostileOwners`) so AI does not attack factions currently at peace.
- Rejected for now: stochastic tie-breaks and mid-match personality changes.

## Interfaces/types added

- AI state contract remains:
  - `GameState.ai.enemy`, `GameState.ai.purple`, `GameState.ai.byOwner`
- Science-aware AI APIs:
  - `pickEnemyResearchTech(personality, selectableTechIds, gameState?, owner?)`
  - `prepareEnemyTurnPlan(gameState, owner?)`
  - `executeEnemyTurnPrelude(gameState, plan)`
- Summary payload:
  - `EnemyTurnSummary.selectedResearch` records chosen tech id when applicable

## Behavior and acceptance criteria

- Personality is stable for a given seed/owner unless explicitly overridden.
- `ensureAiState` guarantees state for every active owner.
- AI research scoring preferences:
  - boost-ready techs are favored
  - partially progressed current techs are favored to avoid wasted switching churn
  - strategic unlocks (unit/building/global modifier) influence final score
- Queue refill behavior:
  - deterministic, personality-aware, typed queue items
  - can choose science infrastructure when available/unlocked
- Visibility behavior:
  - only visible hostile units/cities can be directly targeted
  - unseen hostile owners are excluded from direct priority inputs
- Diplomacy behavior:
  - AI hostility set is derived from current diplomacy status (`war` only)
  - AI does not directly target or attack factions currently at peace
- Turn summary behavior:
  - records goal, selected research target, queue refills, and scored actions for explainability
- Player research safety:
  - enemy prelude execution must not overwrite player active research selection

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/enemyAi.test.js` (priority selection, boost-aware and progress-aware scoring)
  - `tests/integration/enemyTurn.test.js`
  - `tests/integration/diplomacySystem.test.js`
  - `tests/integration/visibilitySystem.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` validates AI summary payload flow and personality override hooks.

## Known gaps and next steps

- AI does not maintain a separate full per-owner research progression model yet.
- Exploration heuristics are still simple (yield + unseen bonus), not objective-graph driven.
- No AI-initiated diplomacy policy layer (current diplomacy actions are player-driven UI actions).
