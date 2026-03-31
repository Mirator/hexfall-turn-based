# spec-006-tech-tree-and-unlocks

## Goal and scope

- Define research progression and unlock behavior for units/buildings.
- Keep research deterministic and funded by empire science stock.
- Keep UI/research hooks compact and automation-friendly.

## Decisions made (and alternatives rejected)

- Chosen: compact tech set (`bronzeWorking`, `archery`, `masonry`) with explicit prerequisite checks.
- Chosen: research consumes pooled empire science (`economy[owner].scienceStock`) plus baseline turn income.
- Chosen: overflow can complete a tech and continue into the next selectable tech in the same turn.
- Chosen: unlock mapping:
  - `bronzeWorking` -> `spearman`
  - `archery` (prereq `bronzeWorking`) -> `archer`
  - `masonry` (prereq `bronzeWorking`) supports building unlock usage (`monument`) through city system rules.
- Chosen: AI personalities can select active tech deterministically (when none is active) through `spec-008` prelude behavior.
- Rejected for now: full visual tech graph, diplomacy-based exchange, per-city research sliders.

## Interfaces/types added

- Research state:
  - `activeTechId`, `progress`, `completedTechIds`
- Tech definitions:
  - `src/core/techTree.js`
- Research APIs:
  - `canSelectResearch(techId, gameState)`
  - `selectResearch(techId, gameState)`
  - `cycleResearch(gameState)`
  - `advanceResearch(gameState, points)`
  - `consumeScienceStock(gameState, owner, baseIncome)`
  - `getSelectableTechIds(gameState)`

## Behavior and acceptance criteria

- Player can set/cycle active research.
- Each player turn adds baseline science and spends available empire stock on active tech.
- Completed techs are persisted in `completedTechIds`.
- Overflow/carryover behavior is deterministic and preserved.
- Remaining science is retained when no further selectable tech exists.
- Unlocks update production availability for city queue choices.
- AI research selection uses the same selectable-tech constraints and personality priorities from `spec-008`.

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/researchSystem.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` verifies `bronzeWorking -> archery` progression in scenario flow.

## Known gaps and next steps

- No dedicated research panel beyond compact controls.
- No branching visualization UI for prerequisites.
- No non-technology unlock classes yet (civics/policies, etc.).
