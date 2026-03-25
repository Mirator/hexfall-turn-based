# spec-012-hud-context-panels-and-notifications

## Goal and scope

- Define authoritative gameplay HUD/UX behavior across city/unit context actions and tactical readability.
- Keep instruction surfaces contextual and compact (no persistent tutorial blocks).
- Keep pause/restart and notification interaction flows consistent and deterministic.

## Decisions made (and alternatives rejected)

- Chosen: fixed HUD zones:
  - top-left: turn + full resource names with value and projected delta
  - top-right: persistent notification center
  - bottom-left: selected entity card (hidden when no selection)
  - bottom-center: contextual action panel
  - bottom-right: End Turn + turn readiness assistant
- Chosen: bottom contextual panel is shared for city and unit actions.
- Chosen: panel has visible expand/collapse and pin controls; auto-expands on valid selection; pin persists expanded mode across selection changes.
- Chosen: city mode supports direct focus tabs, `Units|Buildings` tabbed production, and 3-slot queue management.
- Chosen: unit mode supports `Found City` + `Skip Unit`.
- Chosen: hover-driven action preview surfaces (`move`, `attack-unit`, `attack-city`) with no state mutation.
- Chosen: map clarity overlays include reachable/attackable emphasis and threat visualization when a player unit is selected.
- Chosen: turn-readiness assistant shows `Units ready: N`, supports `Next Unit`, and keeps End Turn one-click with warning tint when units remain.
- Chosen: restart lives in Esc pause menu (`Resume`, `Restart`, confirm step) and blocks underlying interactions while modal is open.
- Chosen: notification center v2 supports categories (`All/Combat/City/Research/System`), filtering, and click-to-jump focus.
- Rejected for now: persistent tutorial text, separate sidebars for unit actions, and full notification search.

## Interfaces/types added

- UI/runtime payloads:
  - `hudTopLeft.resources.{food,production,science}.{current,delta,grossDelta}`
  - `selectedInfo`
  - `contextMenu`
  - `uiHints`, `uiActions`
  - `uiPreview`
  - `uiTurnAssistant`
  - `uiContextPanel`
  - `uiNotifications` entries with `category` and optional `focus`
  - `uiNotificationFilter`
  - `cameraFocusHex`
  - `pauseMenu`
- Key UI events:
  - `unit-action-requested`
  - `city-focus-set-requested`
  - `city-production-tab-set-requested`
  - `city-queue-enqueue-requested`
  - `city-queue-remove-requested`
  - `next-ready-unit-requested`
  - `notification-focus-requested`
  - `restart-match-requested`
  - `ui-modal-state-changed`
- Hooks/UI test interfaces:
  - `getPauseMenuState`, `openPauseMenu`, `closePauseMenu`
  - `getRestartModalState`, `getCityResolutionModalState`
  - `getCityPanelState`, `triggerUnitAction`
  - `getActionPreviewState`, `hoverHex`
  - `getTurnAssistantState`, `nextReadyUnit`
  - `setContextPanelPinned`
  - `getNotificationCenterState`, `setNotificationFilter`, `focusNotification`

## Behavior and acceptance criteria

- HUD layout remains readable on desktop and compact/mobile viewports.
- City/unit contextual controls appear only when relevant selection is active.
- Disabled actions expose contextual reason feedback through hint/notification paths.
- Hover preview lifecycle:
  - appears for reachable/attackable hover targets
  - shows deterministic move/combat prediction
  - clears on selection/phase/modal changes
- End-turn readiness flow:
  - one-click End Turn remains
  - readiness count and next-ready action are visible
  - deterministic next-unit cycling (`Tab` parity)
- Notification center:
  - newest-first feed
  - filter chips by category
  - jump-to-map focus when payload has valid target
  - safe warning when focus target no longer exists
  - reset on restart/new match

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/uiSurface.test.js`
  - `tests/integration/unitActionSystem.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` covers city/unit context actions, previews, turn assistant, pause/restart, filtering, and notification focus jump.
- Manual artifact checks:
  - `tests/e2e/artifacts/smoke.png`
  - `tests/e2e/artifacts/ui-city-panel.png`
  - `tests/e2e/artifacts/ui-city-panel-mobile.png`

## Known gaps and next steps

- Notification center currently prioritizes compact single-line rows over expanded per-entry detail.
- Touch-first scrolling/interaction tuning in notification center can be improved further.
- Additional panel section collapsing for very small viewports may still improve readability.
