# spec-003-testability

## Goal and scope

- Keep gameplay machine-readable for deterministic automation.
- Preserve stable browser hooks while systems and UI complexity evolve.
- Validate a multi-step civ-lite scenario in Playwright with robust teardown.

## Decisions made (and alternatives rejected)

- Chosen: keep automation hooks on `window` for low-friction e2e and local debugging.
- Chosen: keep one self-contained smoke runner (`tests/e2e/smoke.mjs`) that starts Vite, drives gameplay, asserts, and captures artifacts.
- Chosen: expose UI/runtime surfaces in `render_game_to_text` so tests do not depend on pixel scraping.
- Chosen: harden e2e cleanup with signal-aware close and force-kill fallback for `chrome-headless-shell` on Windows.
- Chosen: centralize testability as cross-spec authority for payload/hook contract, with gameplay authority remaining in domain specs (`spec-002`, `spec-004`, `spec-005`, `spec-006`, `spec-007`, `spec-008`, `spec-009`).
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
  - `window.__hexfallTest.setNotificationFilter(filter)`
  - `window.__hexfallTest.clickNotificationRow(index)`
  - `window.__hexfallTest.focusNotification(index)`
  - `window.__hexfallTest.getActionPreviewState()`
  - `window.__hexfallTest.hoverHex(q, r)`
  - `window.__hexfallTest.getTurnAssistantState()`
  - `window.__hexfallTest.nextReadyUnit()`
  - `window.__hexfallTest.setContextPanelPinned(bool)`
  - `window.__hexfallTest.getCityResolutionModalState()`
  - `window.__hexfallTest.getCityPanelState()`
  - `window.__hexfallTest.showCityActionTooltip(actionId)`
  - `window.__hexfallTest.hideCityActionTooltip()`
  - `window.__hexfallTest.selectUnit(unitId)`
  - `window.__hexfallTest.selectCity(cityId)`
  - `window.__hexfallTest.moveSelected(q, r)`
  - `window.__hexfallTest.attackTarget(unitId)`
  - `window.__hexfallTest.attackCity(cityId)`
  - `window.__hexfallTest.triggerUnitAction(actionId)`
  - `window.__hexfallTest.foundCity()`
  - `window.__hexfallTest.chooseCityOutcome(choice)`
  - `window.__hexfallTest.setCityProductionTab(tab)`
  - `window.__hexfallTest.enqueueCityProduction(unitType)`
  - `window.__hexfallTest.enqueueCityBuilding(buildingId)`
  - `window.__hexfallTest.removeCityQueueAt(index)`
  - `window.__hexfallTest.moveCityQueue(index, direction)`
  - `window.__hexfallTest.cycleResearch()`
  - `window.__hexfallTest.selectResearch(techId)`
  - `window.__hexfallTest.getAnimationState()`
  - `window.__hexfallTest.endTurnImmediate()`
  - `window.__hexfallTest.requestEndTurn()`
  - `window.__hexfallTest.setUnitPosition(unitId, q, r)`
  - `window.__hexfallTest.arrangeCombatSkirmish(playerUnitId, enemyUnitId)`
  - `window.__hexfallTest.setEnemyPersonality(personality)`
  - `window.__hexfallTest.setAiPersonality(owner, personality)`
  - `window.__hexfallTest.getEnemyAiState()`
  - `window.__hexfallTest.getAiState(owner)`
  - `window.__hexfallTest.clearEnemyCityQueue(cityId?)`
  - `window.__hexfallTest.clearAiCityQueue(owner, cityId?)`
  - `window.__hexfallTest.toggleDevVision()`
  - `window.__hexfallTest.setDevVision(enabled)`
- E2E command:
  - `npm run test:e2e`

## Behavior and acceptance criteria

- `render_game_to_text` includes:
  - seed/hash/spawn metadata
  - units/cities/combat/research/economy snapshots
  - `uiPreview`, `uiTurnAssistant`, `uiContextPanel`, `uiNotificationFilter`
  - `animationState` (`busy`, `kind`, `queueLength`)
  - `turnPlayback` (`active`, `actor`, `stepIndex`, `totalSteps`, `message`)
  - `uiTurnAssistant.emptyQueueCityCount` (player cities with empty queues)
  - `threatHexes`
  - `cities[].health` + `cities[].maxHealth`
  - `pendingCityResolution`
  - top-left HUD resource payload (`current` + net `delta` + `grossDelta`)
  - selected info payload and context menu payload
  - pause/restart modal state
  - `uiNotifications` feed payload with `category` and optional `focus`
  - `cameraScroll` payload (`{ x, y }`) for deterministic camera movement assertions
  - `cameraFocusHex` for notification jump verification
  - `ai.enemy`, `ai.purple`, and `ai.byOwner` runtime payloads (`personality`, `lastGoal`, `lastTurnSummary`)
  - `visibility` payload (per-owner `visibleHexes`, `exploredHexes`, `seenOwners`)
  - `devVisionEnabled` payload for player debug reveal mode
  - `lastCombatEvent` breakdown payload
  - city production context details for units/buildings tabs, per-item disabled reasons, queue slot metadata, and typed queue items
  - city panel runtime hook payload includes right-rail city queue card visibility/details/position plus production-button coordinates for layout assertions
  - contextual `uiHints` + `uiActions`
- `advanceTime` remains available for deterministic stepping.
- `endTurnImmediate()` remains unchanged as deterministic fast-path bypass for smoke/integration flows that do not need playback assertions.
- Smoke scenario validates:
  - hover move and city-attack previews
  - turn readiness assistant and deterministic attention-cycle path (ready units + cities with empty queues)
  - context panel expanded/pinned behavior
  - notification filtering and notification-focus camera jump
  - non-focus notification row click returns `false` without adding warning notification
  - keyboard camera pan (`Arrow`/`WASD`) and right-drag camera pan both move `cameraScroll`
  - manual pan clears prior `cameraFocusHex`
  - real End Turn enters AI playback (`turnPlayback.active=true`), both AI actors (`enemy`,`purple`) produce summaries, and phase returns to player phase
  - fog-of-war payload assertions (`visible` subset of map, hostile concealment) and keyboard `V` dev-vision toggle behavior
  - founding, queue management (including queue reorder and unavailable-reason payload checks), research, combat, city resolution, restart/pause flows
  - city production hover text uses full-word labels (`Production Cost`, `Estimated Turns`)
  - city production list renders as a vertical single-column stack
  - right-rail city queue card stays between notifications and `Attention needed` when city is selected
  - low-value city production success notifications are suppressed (`Production tab`, queue add/move/remove success)
  - no unexpected defeat during validated scenario flow
  - zero console/page errors
- Smoke runner closes Playwright/browser/server reliably on success/failure/interrupt; Windows cleanup handles orphaned headless browser processes.

## Validation performed (tests/manual checks)

- `npm run test:e2e` passes and captures `tests/e2e/artifacts/smoke.png`.
- `npm test` validates hook-consumed systems via unit/integration suites.
- Post-run process checks confirm no lingering `chrome-headless-shell` process.
- Manual artifact review confirms HUD/context panel/notification interaction surfaces are visible and aligned.

## Known gaps and next steps

- Add a dedicated deterministic e2e branch for guaranteed full-domination finish.
- Add touch-driven notification scrolling coverage.
- Add more compact/mobile screenshot assertions in automated checks.
