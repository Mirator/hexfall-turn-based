# Specs Index

Every meaningful work item in this repository must be captured in a spec file under `docs/`.

## Current Specs

- [spec-001-bootstrap.md](./spec-001-bootstrap.md) - Project setup, tooling, scripts, and repository layout.
- [spec-002-core-loop.md](./spec-002-core-loop.md) - Hex movement, selection, and turn loop implementation.
- [spec-003-testability.md](./spec-003-testability.md) - Browser hooks and Playwright smoke validation.
- [spec-004-enemy-and-lazy-loading.md](./spec-004-enemy-and-lazy-loading.md) - Enemy AI turn stub and lazy Phaser loading/chunking.
- [spec-005-combat-and-unit-health.md](./spec-005-combat-and-unit-health.md) - Combat flow, health, and unit defeat behavior.
- [spec-006-terrain-costs-and-obstacles.md](./spec-006-terrain-costs-and-obstacles.md) - Terrain move costs, blocked tiles, and path-cost reachability.
- [spec-007-city-founding-and-production-lite.md](./spec-007-city-founding-and-production-lite.md) - Settler city founding and lightweight production loop.
- [spec-008-tech-tree-lite-and-unlocks.md](./spec-008-tech-tree-lite-and-unlocks.md) - Research progression and tech-based unit unlocks.
- [spec-009-victory-conditions-and-scenario-loop.md](./spec-009-victory-conditions-and-scenario-loop.md) - Win/loss conditions, match-end UI, restart, and full scenario e2e.

## Spec Template Rules

Each spec must include these sections:

1. Goal and scope
2. Decisions made (and alternatives rejected)
3. Interfaces/types added
4. Behavior and acceptance criteria
5. Validation performed (tests/manual checks)
6. Known gaps and next steps
