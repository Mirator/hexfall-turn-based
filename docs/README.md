# Specs Index

Every meaningful work item in this repository must be captured in a spec file under `docs/`.

Consolidated domain specs; older milestone specs removed.

Support policy (authoritative): desktop + tablet only. Runtime support requires viewport width `>= 768px`; phone-sized viewports are intentionally blocked.

## Current Specs

- [spec-001-bootstrap-and-runtime-foundation.md](./spec-001-bootstrap-and-runtime-foundation.md) - Repository/tooling bootstrap, lazy runtime loading, startup scene flow, and current Vite chunking foundations.
- [spec-002-core-map-turn-and-victory.md](./spec-002-core-map-turn-and-victory.md) - Core map loop, terrain movement, seeded match generation for map presets and configurable AI roster, and domination victory/restart flow.
- [spec-003-testability.md](./spec-003-testability.md) - Browser hooks, `render_game_to_text` payload contract, deterministic smoke validation, and perf telemetry contract.
- [spec-004-combat-siege-and-ranged.md](./spec-004-combat-siege-and-ranged.md) - Authoritative combat math, ranged/counter behavior, and city siege/capture/raze flow.
- [spec-005-city-economy-production-and-specialization.md](./spec-005-city-economy-production-and-specialization.md) - Founding, city-local growth/production progress, gold upkeep/deficit behavior, rush-buy rules, Campus adjacency snapshots, and science-building city outputs.
- [spec-006-tech-tree-and-unlocks.md](./spec-006-tech-tree-and-unlocks.md) - Direct per-turn research formulas, expanded 14-tech tree, boosts, overflow, and unlock propagation.
- [spec-007-hud-context-panels-and-notifications.md](./spec-007-hud-context-panels-and-notifications.md) - HUD/context requirements for `Food/Production/Gold`, diplomacy controls, tech-tree modal visibility, notifications, and city science breakdown visibility.
- [spec-008-ai-personalities-and-strategy.md](./spec-008-ai-personalities-and-strategy.md) - Deterministic multi-faction AI with boost-aware research scoring, science-infrastructure priorities, diplomacy-aware targeting, and visibility-aware strategy.
- [spec-009-action-timeline-and-turn-playback.md](./spec-009-action-timeline-and-turn-playback.md) - Presentation timeline, action animations, deterministic visual parity constraints, and sequential AI turn playback for explainable combat/movement flow.
- [spec-010-ci-github-actions-pages-publishing.md](./spec-010-ci-github-actions-pages-publishing.md) - GitHub Actions quality-gated build and automatic GitHub Pages publishing policy.
- [spec-011-science-overhaul.md](./spec-011-science-overhaul.md) - Consolidated science-overhaul contract: formulas, data model migration, turn order, and acceptance criteria.

## Spec Template Rules

Each spec must include these sections:

1. Goal and scope
2. Decisions made (and alternatives rejected)
3. Interfaces/types added
4. Behavior and acceptance criteria
5. Validation performed (tests/manual checks)
6. Known gaps and next steps
