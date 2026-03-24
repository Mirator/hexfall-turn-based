# spec-003-testability

## Goal and scope

- Keep gameplay machine-readable for deterministic automation.
- Preserve stable browser test hooks while simulation complexity grows.
- Validate the full civ-lite loop through a Playwright smoke scenario.

## Decisions made (and alternatives rejected)

- Chosen: keep hooks on `window` for low-friction automation from e2e and ad-hoc debugging.
- Chosen: keep `tests/e2e/smoke.mjs` self-contained (spins server, runs scenario, asserts, captures artifact).
- Chosen: include modal state and city-resolution state in text payload instead of scraping UI visuals.
- Chosen: harden e2e teardown with signal-aware cleanup (`SIGINT`/`SIGTERM`) and best-effort force-kill fallback for `chrome-headless-shell` to prevent orphan CPU-heavy processes.
- Rejected for now: moving to a heavier custom browser harness.

## Interfaces/types added

- Browser hooks:
  - `window.render_game_to_text(): string`
  - `window.advanceTime(ms: number): void`
  - `window.__hexfallTest.hexToWorld(q, r)`
  - `window.__hexfallTest.getEndTurnButtonCenter()`
  - `window.__hexfallTest.openRestartConfirm()`
  - `window.__hexfallTest.cancelRestartConfirm()`
  - `window.__hexfallTest.confirmRestartConfirm()`
  - `window.__hexfallTest.getRestartModalState()`
  - `window.__hexfallTest.getCityResolutionModalState()`
  - `window.__hexfallTest.selectUnit(unitId)`
  - `window.__hexfallTest.moveSelected(q, r)`
  - `window.__hexfallTest.attackTarget(unitId)`
  - `window.__hexfallTest.attackCity(cityId)`
  - `window.__hexfallTest.foundCity()`
  - `window.__hexfallTest.cycleCityFocus()`
  - `window.__hexfallTest.chooseCityOutcome(choice)`
  - `window.__hexfallTest.endTurnImmediate()`
  - `window.__hexfallTest.setUnitPosition(unitId, q, r)`
  - `window.__hexfallTest.arrangeCombatSkirmish(playerUnitId, enemyUnitId)`
- E2E command:
  - `npm run test:e2e`

## Behavior and acceptance criteria

- `render_game_to_text` includes:
  - map seed/hash/spawn metadata
  - units/cities/research/economy snapshots
  - `cities[].health` and `cities[].maxHealth`
  - `pendingCityResolution`
  - contextual `uiHints` and `uiActions`
  - modal lock state (`uiModalOpen`)
- `advanceTime` remains available for deterministic stepping.
- Smoke test covers:
  - settler-only start validation
  - restart modal open/cancel behavior
  - player founding and enemy auto-founding
  - production path to player warrior
  - city assault and city-resolution modal visibility
  - deterministic `raze` resolution and domination victory
  - zero console/page errors
- Smoke runner must always close Playwright browser and Vite server on success, failure, and interrupt.
- On Windows, if graceful browser close fails, cleanup force-terminates `chrome-headless-shell.exe` as a last resort.

## Validation performed (tests/manual checks)

- `npm run test:e2e` passes and captures `tests/e2e/artifacts/smoke.png`.
- `npm test` validates hook-consumed systems through integration suites.
- Post-run process check confirms no lingering `chrome-headless-shell` process.
- Manual artifact review confirms readable HUD overlays and modal states in gameplay captures.

## Known gaps and next steps

- Add focused e2e for `capture` branch (current smoke uses `raze` branch).
- Add dedicated artifact capture for city-resolution modal state if visual regressions become common.
