# spec-003-testability

## Goal and scope

- Keep gameplay machine-readable for deterministic automation.
- Preserve stable browser hooks while startup flow, HUD systems, and AI roster complexity evolve.
- Validate a full Playwright smoke flow (including perf probe) with robust teardown.

## Decisions made (and alternatives rejected)

- Chosen: keep automation hooks on `window` for low-friction e2e and local debugging.
- Chosen: keep one self-contained smoke runner (`tests/e2e/smoke.mjs`) that starts Vite, drives gameplay, asserts runtime payloads, and captures artifacts.
- Chosen: keep `render_game_to_text` as the authoritative test payload surface for game + UI state.
- Chosen: enforce viewport support policy at bootstrap (`>= 768px`) with explicit unsupported payload/DOM contract.
- Chosen: expose perf telemetry (`getPerfStats`) for non-visual performance assertions during smoke runs.
- Chosen: harden e2e cleanup with signal-aware close and force-kill fallback for `chrome-headless-shell` on Windows.
- Rejected for now: replacing browser hooks with a separate external automation protocol.

## Interfaces/types added

- Browser globals:
  - `window.render_game_to_text(): string`
  - `window.advanceTime(ms: number): void`
  - `window.__hexfallGame`
- Core test hooks:
  - `window.__hexfallTest.getState()`
  - `window.__hexfallTest.getPerfStats()`
  - `window.__hexfallTest.getBootstrapState()`
- Startup-scene hooks:
  - `openMainMenuNewGame`, `openMainMenuAbout`, `closeAboutToMainMenu`
  - `setStartupNewGameMapSize`, `setStartupNewGameAiFactionCount`
  - `startStartupNewGame`, `backFromStartupNewGame`, `getStartupNewGameState`
- World/camera hooks:
  - `hexToWorld`, `focusHex`, `setUnitPosition`, `arrangeCombatSkirmish`
  - `requestEndTurn`, `endTurnImmediate`
- Gameplay action hooks:
  - `selectUnit`, `selectCity`, `moveSelected`
  - `attackTarget`, `attackCity`, `chooseCityOutcome`
  - `triggerUnitAction`, `foundCity`
  - `cycleResearch`, `selectResearch`
  - `setCityProductionTab`, `enqueueCityProduction`, `enqueueCityBuilding`
  - `removeCityQueueAt`, `moveCityQueue`
- Pause/new-game modal hooks:
  - `getPauseMenuState`, `openPauseMenu`, `closePauseMenu`, `openHudMenu`
  - `openRestartConfirm`, `cancelRestartConfirm`, `confirmRestartConfirm`
  - `setNewGameMapSize`, `setNewGameAiFactionCount`
  - `getRestartModalState`, `getCityResolutionModalState`, `getTopHudControlsState`
- HUD/notifications/polish hooks:
  - `getCityPanelState`, `showCityActionTooltip`, `hideCityActionTooltip`
  - `getNotificationCenterState`, `setNotificationFilter`, `clickNotificationRow`, `focusNotification`
  - `getActionPreviewState`, `hoverHex`
  - `getTurnAssistantState`, `nextReadyUnit`, `focusAttention`
  - `setContextPanelPinned`
  - `getHudPolishState`, `toggleStatsPanel`
  - `clickMinimapNormalized`, `focusMinimapHex`
  - `toggleSfxMute`, `getSfxState`
- Animation/sprite diagnostics:
  - `getAnimationState`, `getSpriteLayerCounts`
- AI/personality hooks:
  - `setEnemyPersonality`, `setAiPersonality`
  - `getEnemyAiState`, `getAiState`
  - `clearEnemyCityQueue`, `clearAiCityQueue`
- Visibility hooks:
  - `toggleDevVision`, `setDevVision`
- Runtime DOM contract:
  - `#unsupported-viewport-banner` is visible for unsupported viewports (`< 768px`) and hidden otherwise.
- E2E command:
  - `npm run test:e2e`

## Behavior and acceptance criteria

- `render_game_to_text` includes:
  - unsupported bootstrap payload (`mode="unsupported"`, `viewportWidth`, `minSupportedViewportWidth`) when runtime is blocked
  - startup-scene payloads (`mode="menu"`, `mode="new-game"`, `mode="about"`)
  - gameplay payload fields including:
  - `matchConfig`
  - `factions`
  - `map` (`seed`, `terrainHash`, `terrainSummary`, `spawnMetadata`)
  - `economy.byOwner` plus compatibility `economy.player|enemy|purple`
  - `ai.byOwner` plus compatibility `ai.enemy|ai.purple`
  - `visibility.byOwner` for active owners
  - `uiPreview`, `uiTurnAssistant`, `uiTurnForecast`, `uiContextPanel`
  - `uiNotificationFilter`, `uiNotificationUnreadCount`, `uiNotifications`
  - `uiStatsPanelOpen`, `uiStats`, `uiSfxMuted`
  - `animationState`, `spriteLayers`, `turnPlayback`
  - `cameraScroll`, `cameraViewportWorld`, `mapWorldBounds`, `cameraFocusHex`
  - `lastCombatEvent`, `pendingCityResolution`, `devVisionEnabled`
- `getPerfStats()` returns deterministic perf telemetry:
  - sample count
  - frame metrics (`avg`, `p50`, `p95`, `max`)
  - long-frame counters (`>18ms`, `>40ms`)
  - publish counters (`state`, `camera`, `preview`)
  - current map metadata (`width`, `height`, `aiFactionCount`)
- `advanceTime` remains available for deterministic stepping.
- `endTurnImmediate()` remains available as deterministic fast path for tests that do not need playback assertions.
- Smoke scenario validates:
  - phone viewport bootstrap block (`390x844`) and no gameplay canvas init
  - tablet startup path (`768x1024`) and deterministic startup menu/new-game/about transitions
  - default gameplay start (`16x16`, `2` AI factions)
  - expanded roster restart path (`24x24`, `6` AI factions) and reset back to defaults
  - HUD/context/preview/notification interactions
  - turn assistant split controls (`ready`, `queue`) and focus helpers
  - minimap visibility, click-focus behavior, and viewport-frame footprint constraints
  - stats drawer toggle and forecast presence
  - pause SFX mute toggle state contract
  - AI playback lifecycle and return-to-player transition
  - fog-of-war + dev vision behavior
  - no unexpected defeat during validated scenario
  - zero console/page errors
  - perf probe output persisted to `tests/e2e/artifacts/perf.json`
- Smoke runner closes Playwright/browser/server reliably on success/failure/interrupt; Windows cleanup handles orphaned headless browser processes.

## Validation performed (tests/manual checks)

- `npm run test:e2e` (smoke flow + perf artifact generation + screenshots).
- `npm test` validates hook-consumed systems through unit/integration suites.
- Artifact outputs include:
  - `tests/e2e/artifacts/smoke.png`
  - `tests/e2e/artifacts/smoke-tablet.png`
  - `tests/e2e/artifacts/perf.json`

## Known gaps and next steps

- Add a dedicated deterministic e2e branch for guaranteed full-domination finish.
- Consider splitting smoke into focused suites (bootstrap/ui/perf) if runtime budget grows.
