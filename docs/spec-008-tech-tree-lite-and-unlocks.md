# spec-008-tech-tree-lite-and-unlocks

## Goal and scope

- Add medium-term progression through selectable research.
- Unlock additional production options on tech completion.
- Align research funding with empire-wide science stock.

## Decisions made (and alternatives rejected)

- Chosen: compact tech set (`bronzeWorking`, `archery`, `masonry`) with prerequisite checks.
- Chosen: research consumes pooled empire science (`economy[owner].scienceStock`) plus baseline turn income.
- Chosen: overflow can complete a tech and carry into the next selectable tech in the same turn.
- Chosen: `bronzeWorking` unlocks `spearman` production.
- Chosen: `archery` (prereq `bronzeWorking`) unlocks `archer`.
- Rejected for now: full visual tech graph, diplomacy-based tech exchange, and per-city research sliders.

## Interfaces/types added

- Research state:
  - `activeTechId`, `progress`, `completedTechIds`
- Tech definitions:
  - `src/core/techTree.js`
- Research system:
  - `ResearchSystem.canSelectResearch()`
  - `ResearchSystem.selectResearch()`
  - `ResearchSystem.cycleResearch()`
  - `ResearchSystem.advanceResearch()`
  - `ResearchSystem.consumeScienceStock(gameState, owner, baseIncome)`
  - `ResearchSystem.getSelectableTechIds()`

## Behavior and acceptance criteria

- Player can choose active research through UI cycle action.
- Each player turn adds baseline science and spends available empire `scienceStock` on active tech.
- Completed tech ids are tracked in `completedTechIds`.
- Overflow supports chained completion/progress in a single turn when enough science exists.
- Remaining science is preserved in stock when no further tech is selectable.
- Unit unlocks from completed techs are added to city production options.
- AI research priorities consume the same selectable tech list and include `archery` personality weighting.

## Validation performed (tests/manual checks)

- Integration: `tests/integration/researchSystem.test.js`
- E2E: `tests/e2e/smoke.mjs` verifies `bronzeWorking -> archery` progression in a full gameplay chain
- UI runtime checks show active tech/progress updates during turn advancement

## Known gaps and next steps

- No dedicated research panel; current UX uses compact cycling controls.
- AI research strategy now exists in `spec-014`.
- Building unlock usage now active for `monument` via `masonry` (`spec-016`).
