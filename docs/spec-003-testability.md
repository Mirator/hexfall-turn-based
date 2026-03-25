# spec-003-testability

## Goal and scope

- Keep gameplay machine-readable for deterministic automation.
- Preserve stable browser hooks while systems and UI complexity evolve.
- Validate a multi-step civ-lite scenario in Playwright with robust teardown.

## Decisions made (and alternatives rejected)

- Chosen: keep automation hooks on `window` for low-friction e2e and local debugging.
- Chosen: keep one self-contained smoke runner (`tests/e2e/smoke.mjs`) that starts Vite, drives gameplay, asserts, and captures artifacts.
- Chosen: expose UI layout/runtime surfaces in `render_game_to_text` so tests do not depend on pixel scraping.
- Chosen: harden e2e cleanup with signal-aware close and force-kill fallback for `chrome-headless-shell` on Windows.
- Rejected for now: replacing hooks with a heavier bespoke automation protocol.

## Interfaces/types added

- Browser hooks:
  - `window.render_game_to_text(): string`
  - `window.advanceTime(ms: number): void`
  - `window.__hexfallTest.getState()`
  - `window.__hexfallTest.hexToWorld(q, r)`
  - `window.__hexfallTest.getEndTurnButtonCenter()`
  - `window.__hexfallTest.openPauseMenu()`
  - `window.__hexfallTest.closePauseMenu()`
  - `window.__hexfallTest.getPauseMenuState()`
  - `window.__hexfallTest.openRestartConfirm()`
  - `window.__hexfallTest.cancelRestartConfirm()`
  - `window.__hexfallTest.confirmRestartConfirm()`
  - `window.__hexfallTest.getRestartModalState()`
  - `window.__hexfallTest.getNotificationCenterState()`
  - `window.__hexfallTest.getCityResolutionModalState()`
  - `window.__hexfallTest.getCityPanelState()`
  - `window.__hexfallTest.selectUnit(unitId)`
  - `window.__hexfallTest.selectCity(cityId)`
  - `window.__hexfallTest.moveSelected(q, r)`
  - `window.__hexfallTest.attackTarget(unitId)`
  - `window.__hexfallTest.attackCity(cityId)`
  - `window.__hexfallTest.triggerUnitAction(actionId)`
  - `window.__hexfallTest.foundCity()`
  - `window.__hexfallTest.chooseCityOutcome(choice)`
  - `window.__hexfallTest.cycleCityFocus()`
  - `window.__hexfallTest.setCityFocus(focus)`
  - `window.__hexfallTest.setCityProductionTab(tab)`
  - `window.__hexfallTest.enqueueCityProduction(unitType)`
  - `window.__hexfallTest.enqueueCityBuilding(buildingId)`
  - `window.__hexfallTest.removeCityQueueAt(index)`
  - `window.__hexfallTest.cycleResearch()`
  - `window.__hexfallTest.selectResearch(techId)`
  - `window.__hexfallTest.endTurnImmediate()`
  - `window.__hexfallTest.setUnitPosition(unitId, q, r)`
  - `window.__hexfallTest.arrangeCombatSkirmish(playerUnitId, enemyUnitId)`
  - `window.__hexfallTest.setEnemyPersonality(personality)`
  - `window.__hexfallTest.getEnemyAiState()`
  - `window.__hexfallTest.clearEnemyCityQueue(cityId?)`
- E2E command:
  - `npm run test:e2e`

## Behavior and acceptance criteria

  - `render_game_to_text` includes:
  - seed/hash/spawn metadata
  - units/cities/combat/research/economy snapshots
  - `cities[].health` + `cities[].maxHealth`
  - `pendingCityResolution`
  - top-left HUD resource payload (`current` + net `delta` + `grossDelta`)
  - selected info payload and context menu payload
  - pause/restart modal state
  - `uiNotifications` feed payload
  - `ai.enemy` runtime payload (`personality`, `lastGoal`, `lastTurnSummary`)
  - `lastCombatEvent` breakdown payload
  - city production context details for units/buildings tabs and typed queue items
  - contextual `uiHints` + `uiActions`
- `advanceTime` remains available for deterministic stepping.
- Smoke scenario validates:
  - settler-only opening assumptions
  - pause menu open/close and restart confirm/cancel path
  - unit context action (`Found City`) and invalid-action warning notification
  - city context panel visibility with direct focus and queue controls
  - unit/building tab switching and enqueue of typed queue items
  - archery research unlock flow and archer ranged combat action path
  - enemy AI personality payload presence and test override hooks
  - enemy auto-founding behavior
  - city assault and city-resolution modal path
  - no unexpected defeat during validated scenario flow
  - zero console/page errors
- Smoke runner must close Playwright browser and Vite server on success/failure/interrupt; Windows fallback kills orphaned `chrome-headless-shell` if needed.

## Validation performed (tests/manual checks)

- `npm run test:e2e` passes and captures `tests/e2e/artifacts/smoke.png`.
- `npm test` validates hook-consumed systems via integration suites.
- Post-run process checks confirm no lingering `chrome-headless-shell` process.
- Manual artifact review confirms updated HUD zones and contextual panel behavior.

## Known gaps and next steps

- Add a dedicated e2e branch for explicit full-domination finish with deterministic kill helpers.
- Add touch-driven notification scrolling coverage (currently mouse-wheel in smoke/manual checks).
- Add snapshot assertions for compact/mobile layout state payloads.
