# spec-007-hud-context-panels-and-notifications

## Goal and scope

- Define authoritative gameplay HUD/UX behavior across city/unit context actions and tactical readability.
- Keep instruction surfaces contextual and compact (no persistent tutorial blocks).
- Keep pause/restart and notification interaction flows consistent and deterministic.

## Decisions made (and alternatives rejected)

- Chosen: fixed HUD zones:
  - top-left: turn + full resource names with value/projected delta + `Dev Vision: ON/OFF (V)` indicator
  - top-right: persistent notification center
  - right-side middle: city queue card (visible only while a city is selected), positioned under notifications and above `Attention needed`
  - bottom-left: selected entity card (hidden when no selection)
  - bottom-center: contextual action panel
  - bottom-right: End Turn + turn readiness assistant
- Chosen: bottom contextual panel is shared for city and unit actions.
- Chosen: panel has visible expand/collapse and pin controls; auto-expands on valid selection; pin persists expanded mode across selection changes.
- Chosen: city mode supports `Units|Buildings` tabs with a horizontal production list in the bottom contextual panel and always-available production-cost/estimated-turn hover tooltip details.
- Chosen: city production choices expose explicit cost context and per-item unavailable-state tags (`Locked`, `Built`, `Queued`, `Queue Full`).
- Chosen: disabled city/unit actions expose exact unavailable reasons inline in the expanded context panel, with hover tooltip and hint text as secondary detail.
- Chosen: queue supports deterministic per-slot up/down reorder controls plus explicit remove controls in a vertical single-column layout in the right-side city queue card.
- Chosen: unit mode supports `Found City` + `Skip Unit`.
- Chosen: hover-driven action preview surfaces (`move`, `attack-unit`, `attack-city`) with no state mutation.
- Chosen: map clarity overlays include reachable/attackable emphasis and threat visualization when a player unit is selected.
- Chosen: bottom-right readiness assistant uses clickable split summary (`Units ready X`, `Empty queues Y`), where `X + Y` still drives warning state; click cycles the next attention target (unit or city), and End Turn keeps warning tint while any attention remains.
- Chosen: AI playback banner is displayed while sequential AI actions resolve (`Enemy action ...` / `Purple action ...`), centered above the map/HUD action layers.
- Chosen: gameplay commands (End Turn + context actions) are disabled while animation timeline is busy, with explicit disabled reason text.
- Chosen: support matrix is desktop + tablet only; phone-sized viewports are blocked by runtime bootstrap and do not participate in HUD acceptance.
- Chosen: restart lives in Esc pause menu (`Resume`, `Restart`, confirm step) and blocks underlying interactions while modal is open.
- Chosen: notification center supports categories (`All/Combat/City/Research/System`), filtering, unread metadata, `New this turn`/`Earlier` grouping rows, and click-to-jump focus with explicit jump affordance.
- Chosen: city notifications are high-signal; keep high-level outcomes (city founded/captured/razed, research completed, combat outcomes) plus warnings/failures, and suppress low-value city production success logs (tab switch, queue add/move/remove success).
- Chosen: notification rows with no map `focus` are rendered as non-clickable text and never emit "no target" warning on click.
- Chosen: camera recentering recovery supports keyboard pan (`Arrow`/`WASD`) and right-mouse drag panning while no modal is open.
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
  - `animationState`
  - `turnPlayback`
  - `devVisionEnabled`
  - `uiNotifications` entries with `category` and optional `focus`
  - `uiNotificationFilter`
  - `uiNotificationUnreadCount`
  - `cameraScroll`
  - `cameraFocusHex`
  - `pauseMenu`
- Key UI events:
  - `unit-action-requested`
  - `city-production-tab-set-requested`
  - `city-queue-enqueue-requested`
  - `city-queue-move-requested`
  - `city-queue-remove-requested`
  - `next-ready-unit-requested`
  - `notification-focus-requested`
  - `restart-match-requested`
  - `ui-modal-state-changed`
- Hooks/UI test interfaces:
  - `getPauseMenuState`, `openPauseMenu`, `closePauseMenu`
  - `getRestartModalState`, `getCityResolutionModalState`
  - `getCityPanelState`, `triggerUnitAction`
  - `moveCityQueue(index, direction)`
  - `getAnimationState`, `requestEndTurn`, `endTurnImmediate`
  - `getActionPreviewState`, `hoverHex`
  - `getTurnAssistantState`, `nextReadyUnit`
  - `setContextPanelPinned`
  - `getNotificationCenterState`, `setNotificationFilter`, `clickNotificationRow`, `focusNotification`

## Behavior and acceptance criteria

- HUD layout remains readable on desktop and tablet viewports (`>= 768px`).
- City/unit contextual controls appear only when relevant selection is active.
- Disabled actions expose contextual reason feedback through hint/notification paths and disabled-button hover tooltips.
- Expanded context panel shows inline blocked microcopy (`Blocked: ...`) whenever actions are unavailable.
- City production buttons show clear production cost labels in a horizontal list and always expose hover tooltip details (`production cost`, `estimated turns`, `current production stock`, `local production per turn`, unavailable reason when blocked).
- City queue renders in the right-side city queue card as a vertical 3-slot stack with per-slot status and up/down reorder + remove affordances.
- Right-side city queue card appears only for city selection and remains vertically between notifications and `Attention needed`.
- Hover preview lifecycle:
  - appears for reachable/attackable hover targets
  - shows deterministic move/combat prediction
  - clears on selection/phase/modal changes
- End-turn readiness flow:
  - one-click End Turn remains
  - readiness state still aggregates unit + city-queue attention
  - assistant text is split (`Units ready`, `Empty queues`) for clarity
  - clicking the assistant deterministically cycles next attention target (ready unit or city with empty queue)
- Playback/lock flow:
  - playback banner is visible only while `turnPlayback.active=true`
  - End Turn label reflects state (`Resolve...`, `AI...`, `Animating...` as applicable)
  - disabled gameplay commands surface explicit reason text (for example, animation-busy lock)
- Dev visibility flow:
  - player can toggle full reveal with key `V`
  - HUD indicator reflects `Dev Vision: ON/OFF`
  - dev reveal does not alter AI visibility/fog decision rules
- Notification center:
  - newest-first feed
  - filter chips by category
  - grouped sections (`New this turn`, `Earlier`) with unread count shown in panel title
  - city feed keeps high-level outcomes (city founded/captured/razed, research completed, combat outcomes) plus warnings/failures
  - city feed omits low-value tab-switch/queue-edit success spam
  - rows without `focus` are non-clickable and do not emit warnings when clicked
  - jump-to-map focus when payload has valid target
  - safe warning when focus target no longer exists
  - reset on restart/new match
- Camera controls:
  - keyboard pan (`Arrow`/`WASD`) and right-drag pan are available whenever no modal is open
  - manual camera pan clears `cameraFocusHex` previously set by notification jump

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/uiSurface.test.js`
  - `tests/integration/unitActionSystem.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` covers city/unit context actions, previews, turn assistant, playback banner state progression, pause/restart, filtering, and notification focus jump.
- Manual artifact checks:
  - `tests/e2e/artifacts/smoke.png`
  - `tests/e2e/artifacts/ui-city-panel.png`

## Known gaps and next steps

- Notification center still prioritizes compact one-line rows over expanded per-entry detail cards.
- Additional layout polish for dense tablet viewports (for example `768x1024`) can still improve readability.
- No user-facing playback speed/skip controls yet.
