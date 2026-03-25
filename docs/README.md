# Specs Index

Every meaningful work item in this repository must be captured in a spec file under `docs/`.

Consolidated domain specs; older milestone specs removed.

## Current Specs

- [spec-001-bootstrap-and-runtime-foundation.md](./spec-001-bootstrap-and-runtime-foundation.md) - Repository/tooling bootstrap, lazy runtime loading, and build/chunk foundations.
- [spec-002-core-map-turn-and-victory.md](./spec-002-core-map-turn-and-victory.md) - Core map loop, terrain movement rules, seeded match generation, and domination victory/restart flow.
- [spec-003-testability.md](./spec-003-testability.md) - Browser hooks, runtime payload contract, and Playwright smoke validation.
- [spec-005-combat-siege-and-ranged.md](./spec-005-combat-siege-and-ranged.md) - Authoritative combat math, ranged/counter behavior, and city siege/capture/raze flow.
- [spec-007-city-economy-production-and-specialization.md](./spec-007-city-economy-production-and-specialization.md) - Founding, empire-wide city economy, shared production queue, buildings, and specialization.
- [spec-008-tech-tree-and-unlocks.md](./spec-008-tech-tree-and-unlocks.md) - Research progression, science-stock spending, and unlock behavior.
- [spec-012-hud-context-panels-and-notifications.md](./spec-012-hud-context-panels-and-notifications.md) - HUD layout, contextual panels, previews/readiness UX, pause flow, and notification center behavior.
- [spec-014-ai-personalities-and-strategy.md](./spec-014-ai-personalities-and-strategy.md) - Deterministic AI personalities, goal/action scoring, and strategic policies.

## Spec Template Rules

Each spec must include these sections:

1. Goal and scope
2. Decisions made (and alternatives rejected)
3. Interfaces/types added
4. Behavior and acceptance criteria
5. Validation performed (tests/manual checks)
6. Known gaps and next steps
