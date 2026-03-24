# spec-008-tech-tree-lite-and-unlocks

## Goal and scope

- Add medium-term progression through selectable research.
- Unlock additional production options upon tech completion.

## Decisions made (and alternatives rejected)

- Chosen: small linear tech set (`bronzeWorking`, `masonry`) with prerequisite checks.
- Chosen: research accrues each turn with baseline + city bonus income.
- Chosen: completing `bronzeWorking` unlocks `spearman` production.
- Rejected for now: branching research UI graph and tech trading/diplomacy.

## Interfaces/types added

- Research state:
  - `activeTechId`, `progress`, `completedTechIds`
- Tech definitions:
  - `core/techTree.js`
- Research system:
  - `ResearchSystem.canSelectResearch()`
  - `ResearchSystem.selectResearch()`
  - `ResearchSystem.cycleResearch()`
  - `ResearchSystem.advanceResearch()`
  - `ResearchSystem.getSelectableTechIds()`

## Behavior and acceptance criteria

- Player can choose active research (UI cycle action).
- Research points are applied each turn.
- Completed tech is stored in `completedTechIds`.
- Unit unlocks from tech completion are added to production options.

## Validation performed (tests/manual checks)

- Integration test: `tests/integration/researchSystem.test.js`.
- E2E scenario asserts `bronzeWorking` completion.
- UI text confirms active/completed research state and unlocked units list.

## Known gaps and next steps

- No dedicated tech panel; current UI uses compact cycling control.
- No overflow carry behavior between completed and next tech.
- No building unlock usage yet beyond data placeholder support.
