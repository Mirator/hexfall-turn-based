# spec-006-tech-tree-and-unlocks

## Goal and scope

- Define the civ-like science/research model based on direct per-turn science.
- Provide deterministic formulas for tech costs, boosts, switching, and overflow.
- Document the expanded medium tree (`14` techs), unlock outputs, and research-facing runtime payloads.

## Decisions made (and alternatives rejected)

- Chosen: research is direct progression (`science_per_turn`) and no longer consumes science stockpiles.
- Chosen: active research can be switched at any time; progress is stored per tech and never reset by switching.
- Chosen: medium tree with `14` techs and explicit prerequisites.
- Chosen: per-tech effective cost formula uses base cost, era multiplier, and city-count penalty:
  - `effectiveCost = baseCost * eraMultiplier * (1 + cityPenalty)`
  - `eraMultiplier`: era1=`1.0`, era2=`1.35`, era3=`1.75`
  - `cityPenalty = max(0, cityCount - 1) * 0.03`
- Chosen: one-time Eureka boosts grant `40%` of effective tech cost.
- Chosen: boost progress is tracked for every incomplete tech and exposed in runtime payload.
- Chosen: overflow is deterministic and can chain-complete multiple techs in a single turn.
- Chosen: global science modifiers apply after city aggregation and before tech progress is added.
- Chosen: no dual-mode compatibility period; old stock-based API remains as compatibility wrapper only.
- Rejected for now: specialists, diffusion/decay, parallel research, randomized tech tree.

## Interfaces/types added

- `TECH_TREE` schema in `src/core/techTree.js`:
  - `baseCost`, `era`, `prerequisites`, `boostCondition`, `unlocks`, optional `globalScienceModifier`
- `GameState.research`:
  - `currentTechId`, `activeTechId`
  - `progressByTech`, `effectiveCostByTech`
  - `boostAppliedByTech`, `boostProgressByTech`
  - `lastSciencePerTurn`, `lastBaseSciencePerTurn`, `lastGlobalModifierTotal`
  - `lastCityScienceById`, `boostsAppliedLastTurn`
- Core APIs in `src/systems/researchSystem.js`:
  - `computeOwnerSciencePerTurn(owner, gameState)`
  - `getOwnerGlobalScienceModifier(owner, gameState)`
  - `resolveResearchTurn(gameState, owner)`
  - `selectResearch(techId, gameState)`
  - `cycleResearch(gameState)`
  - `getSelectableTechIds(gameState)`
  - `getEffectiveTechCost(techId, gameState)`

## Behavior and acceptance criteria

- Science aggregation:
  - `baseSciencePerTurn = sum(cityScienceOutput)`
  - `sciencePerTurn = baseSciencePerTurn * (1 + globalModifierTotal)`
- Research progression:
  - if no active tech and at least one selectable tech exists, first selectable tech is auto-selected
  - active tech receives `sciencePerTurn` each player turn
  - tech completes when `progress >= effectiveCost`
- Switching:
  - selecting another tech does not clear progress on prior tech
  - switching updates `currentTechId/activeTechId` and continues from stored `progressByTech`
- Eureka boosts:
  - each tech can apply at most one boost (`boostAppliedByTech[techId]`)
  - when condition is met, apply `round(effectiveCost * 0.4)` to that tech's progress
  - boost progress payload includes `current`, `target`, `met`, `label`
- Overflow/completion chain:
  - overflow from completed tech is carried into next selectable tech immediately
  - completion chain repeats until no further completion or no selectable tech remains
- Unlock propagation:
  - unit unlocks are pushed into `gameState.unlocks.units` on completion
  - building unlock gates are consumed by city production system checks
- Expanded tree contract:
  - `pottery`, `mining`, `writing`, `bronzeWorking`, `archery`, `masonry`, `engineering`, `mathematics`, `education`, `civilService`, `machinery`, `astronomy`, `chemistry`, `scientificMethod`

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/researchSystem.test.js`
    - cost scaling (era + city-count penalty)
    - switching with preserved per-tech progress
    - one-time 40% boost behavior
    - overflow chaining and unlock propagation
- Integration (AI selection coupling):
  - `tests/integration/enemyAi.test.js` (boost-aware and progress-aware tech scoring)
- E2E:
  - `tests/e2e/smoke.mjs` verifies runtime research payloads:
    - `sciencePerTurn`
    - `turnsRemaining`
    - `boostProgressByTech`
    - `cityScienceById`

## Known gaps and next steps

- No dedicated interactive research-management screen; current `Tech Tree` modal is read-only.
- Research is currently single-player-authoritative in game-state ownership.
- Specialist-driven science and advanced catch-up systems are intentionally deferred.
