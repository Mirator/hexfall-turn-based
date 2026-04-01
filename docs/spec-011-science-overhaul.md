# spec-011-science-overhaul

## Goal and scope

- Deliver the science-system big-bang replacement in one release.
- Replace stockpile-driven research with deterministic direct per-turn science.
- Define formulas, data model, turn order, AI behavior expectations, and acceptance criteria for the overhaul.

## Decisions made (and alternatives rejected)

- Chosen: single migration path with no temporary dual compatibility mode.
- Chosen: direct per-turn science model:
  - `sciencePerTurn` is recomputed each turn from city outputs + global modifiers.
  - research progress uses per-tech stored values in scaled fixed-point precision.
- Chosen: tech switching is always allowed among selectable techs; progress is preserved per tech.
- Chosen: medium tree (`14` techs) with:
  - prerequisites
  - era-based cost scaling
  - city-count penalty
  - one-time Eureka boosts
  - unlock payloads and optional global science modifiers
- Chosen: city-level Campus abstraction only (no tile-placement UI) with adjacency snapshot captured on Campus completion.
- Chosen: science buildings are additive and deterministic (`library`, `university`, `researchLab`); specialists are out of scope.
- Chosen: global science modifier framework has initial concrete sources from completed techs + buildings.
- Chosen: AI research scoring is boost-aware/progress-aware and infrastructure-aware, but enemy prelude must not overwrite player active research.
- Rejected for now: science decay, diffusion/catch-up systems, parallel research, randomized tree.

## Interfaces/types added

- `TECH_TREE` (`src/core/techTree.js`):
  - `id`, `name`, `era`, `baseCost`, `prerequisites`, `boostCondition`, `unlocks`, optional `globalScienceModifier`
- `GameState.research` (`src/core/types.js` / `src/core/gameState.js`):
  - `currentTechId`, `activeTechId`
  - `progressByTech`, `effectiveCostByTech`
  - `boostAppliedByTech`, `boostProgressByTech`
  - `lastSciencePerTurn`, `lastBaseSciencePerTurn`, `lastGlobalModifierTotal`
  - `lastCityScienceById`, `boostsAppliedLastTurn`
- `GameState.economy`:
  - `sciencePerTurn` (no research funding via `scienceStock`)
- `City` schema:
  - `campus: { built, adjacency, adjacencyBreakdown }`
  - science-building chain in `buildings`
- UI/runtime payload:
  - expanded `research` payload with per-turn science details, boost progress, city breakdown, turns remaining

## Behavior and acceptance criteria

- Formula set:
  - City science:
    - `populationScience = population * 0.5`
    - `campusAdjacencyScience = stored adjacency (if Campus built)`
    - `buildingScience = library(2) + university(4) + researchLab(5)`
    - `cityScience = populationScience + campusAdjacencyScience + buildingScience`
  - Empire science:
    - `baseSciencePerTurn = sum(cityScience)`
    - `sciencePerTurn = baseSciencePerTurn * (1 + globalModifierTotal)`
  - Tech effective cost:
    - `effectiveCost = baseCost * eraMultiplier * (1 + cityPenalty)`
    - era multipliers: `1.0`, `1.35`, `1.75`
    - `cityPenalty = max(0, cityCount - 1) * 0.03`
  - Eureka boost:
    - one-time `40%` of effective cost
- Deterministic turn order for player research resolution:
  1. city turn processing computes yields and owner economy fields
  2. science breakdown and global modifiers are recomputed
  3. boost progress is evaluated and newly met boosts are applied once
  4. active tech receives `sciencePerTurn`
  5. completion chain resolves with overflow into next selectable tech
  6. unlock propagation is applied
- Switching behavior:
  - switching active tech preserves per-tech progress and cost state
- Campus behavior:
  - Campus completion snapshots adjacency from current map/city state and stores it
- AI behavior:
  - boost feasibility and progress influence tech choice
  - research choice and science infrastructure intent appear in AI summary behavior
  - AI enemy prelude does not mutate player active research state
- UI behavior:
  - HUD/stats/context show science-per-turn, turns remaining, boost status, and city science breakdown where available

## Validation performed (tests/manual checks)

- Commands:
  - `npm run lint`
  - `npm test`
  - `npm run test:e2e`
  - `npm run build`
- Coverage highlights:
  - research formulas/switching/boost/overflow: `tests/integration/researchSystem.test.js`
  - AI boost-aware research scoring: `tests/integration/enemyAi.test.js`
  - city science building/campus queue reasoning: `tests/integration/uiSurface.test.js`
  - runtime research payload and city-science breakdown in smoke flow: `tests/e2e/smoke.mjs`

## Known gaps and next steps

- No full-screen dedicated tech-tree visualization yet.
- Specialists and advanced science systems (diffusion/decay/parallel) are intentionally deferred.
- AI still records research intent without separate per-owner research progression simulation.
