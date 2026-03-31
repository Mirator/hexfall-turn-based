# spec-007-hud-context-panels-and-notifications

## Goal and scope

- Define authoritative gameplay HUD/UX behavior across city/unit context actions and tactical readability.
- Keep instruction surfaces contextual and compact (no persistent tutorial blocks).
- Keep pause/restart/new-game and notification interaction flows deterministic and automation-friendly.

## Decisions made (and alternatives rejected)

- Chosen: fixed HUD zones:
  - top-left: turn + full resource names with value/projected delta + `Dev Vision: ON/OFF (V)`
  - top-right: persistent notification center
  - right-side middle: city queue card (visible only while a city is selected), positioned under notifications and above `Attention needed`
  - bottom-left: selected entity card (hidden when no selection)
  - bottom-center: contextual action panel
  - bottom-right: End Turn + turn readiness assistant
- Chosen: right-column polish surfaces include:
  - turn forecast card
  - toggleable progress stats panel
  - minimap panel with camera viewport outline and click-to-focus
- Chosen: bottom contextual panel is shared for city and unit actions.
- Chosen: panel has visible expand/collapse and pin controls; auto-expands on valid selection; pin persists expanded mode across selection changes.
- Chosen: city mode supports `Units|Buildings` tabs with a horizontal production list in the bottom contextual panel and always-available production hover details.
- Chosen: city production choices expose explicit cost context and unavailable-state tags (`Locked`, `Built`, `Queued`, `Queue Full`).
- Chosen: disabled city/unit actions expose exact unavailable reasons inline + tooltip.
- Chosen: queue supports deterministic per-slot up/down reorder controls plus explicit remove controls in a vertical single-column right-rail layout.
- Chosen: unit mode supports `Found City` + `Skip Unit`.
- Chosen: hover-driven action preview surfaces (`move`, `attack-unit`, `attack-city`) with no state mutation.
- Chosen: map clarity overlays include reachable/attackable emphasis and threat visualization when a player unit is selected.
- Chosen: bottom-right readiness assistant uses split controls (`Units ready X`, `Empty queues Y`), with direct focus actions.
- Chosen: AI playback banner is displayed while sequential AI actions resolve, using active owner labels.
- Chosen: gameplay commands are disabled while animation timeline is busy, with explicit disabled-reason microcopy.
- Chosen: support matrix is desktop + tablet only; phone-sized viewports are blocked by runtime bootstrap.
- Chosen: pause menu contains restart/new-game flow and SFX toggle (`SFX ON/OFF`), and blocks underlying interactions while modal is open.
- Chosen: notification center supports categories (`All/Combat/City/Research/System`), filtering, unread metadata, grouped sections, and click-to-jump focus with safe fallback behavior.
- Chosen: city notifications are high-signal; major outcomes + warnings/failures are kept, low-value queue-operation success spam is suppressed.
- Chosen: keyboard pan (`Arrow`/`WASD`) and right-mouse drag panning are available while no modal is open.
- Rejected for now: persistent tutorial text, separate unit-action sidebars, full notification search, and minimap zoom controls.

## Interfaces/types added

- UI/runtime payloads:
  - `hudTopLeft.resources.{food,production,science}.{current,delta,grossDelta}`
  - `selectedInfo`
  - `contextMenu`
  - `uiHints`, `uiActions`
  - `uiPreview`
  - `uiTurnAssistant`
  - `uiTurnForecast`
  - `uiContextPanel`
  - `uiStatsPanelOpen`, `uiStats`
  - `uiSfxMuted`
  - `animationState`
  - `turnPlayback`
  - `devVisionEnabled`
  - `uiNotifications` entries with `category` and optional `focus`
  - `uiNotificationFilter`
  - `uiNotificationUnreadCount`
  - `cameraScroll`
  - `cameraViewportWorld`
  - `mapWorldBounds`
  - `cameraFocusHex`
  - `pauseMenu`
- Key UI events:
  - `unit-action-requested`
  - `city-production-tab-set-requested`
  - `city-queue-enqueue-requested`
  - `city-queue-move-requested`
  - `city-queue-remove-requested`
  - `next-ready-unit-requested`
  - `attention-ready-unit-requested`
  - `attention-empty-queue-requested`
  - `notification-focus-requested`
  - `minimap-focus-requested`
  - `restart-match-requested`
  - `ui-modal-state-changed`
- Hooks/UI test interfaces:
  - pause/new-game: `getPauseMenuState`, `openPauseMenu`, `closePauseMenu`, `openRestartConfirm`, `confirmRestartConfirm`, `setNewGameMapSize`, `setNewGameAiFactionCount`
  - panel/action: `getCityPanelState`, `triggerUnitAction`, `setContextPanelPinned`, `showCityActionTooltip`, `hideCityActionTooltip`
  - queue: `moveCityQueue(index, direction)`, `removeCityQueueAt(index)`
  - turn flow: `getAnimationState`, `requestEndTurn`, `endTurnImmediate`, `focusAttention(kind)`
  - preview/readiness: `getActionPreviewState`, `hoverHex`, `getTurnAssistantState`, `nextReadyUnit`
  - notifications: `getNotificationCenterState`, `setNotificationFilter`, `clickNotificationRow`, `focusNotification`
  - polish: `getHudPolishState`, `toggleStatsPanel`, `clickMinimapNormalized`, `focusMinimapHex`, `toggleSfxMute`, `getSfxState`

## Behavior and acceptance criteria

- HUD layout remains readable on desktop and tablet viewports (`>= 768px`).
- City/unit contextual controls appear only when relevant selection is active.
- Disabled actions expose deterministic reason feedback (inline + tooltip + hint pathways).
- Expanded context panel shows inline blocked microcopy (`Blocked: ...`) whenever actions are unavailable.
- City production buttons show clear cost labels and hover details (`Production Cost`, `Estimated Turns`, `Current Production Stock`, `Local Production Per Turn`, optional blocked reason).
- City queue renders as a vertical 3-slot stack in right-rail card with slot status + reorder/remove affordances.
- Right-rail city queue card appears only for city selection and remains vertically between notifications and turn assistant.
- Hover preview lifecycle:
  - appears for reachable/attackable hover targets
  - shows deterministic move/combat prediction
  - clears on selection/phase/modal changes
- End-turn readiness flow:
  - one-click End Turn remains
  - readiness state aggregates unit + empty-queue attention
  - split summary controls are available (`Units ready`, `Empty queues`)
  - focus actions deterministically target the next relevant unit/city
- Playback/lock flow:
  - playback banner is visible only while `turnPlayback.active=true`
  - End Turn label reflects state (`Resolve...`, `AI...`, `Animating...` as applicable)
  - disabled gameplay commands surface explicit reason text
- Forecast/stats/minimap polish flow:
  - forecast card always shows next-turn net resource outlook
  - stats panel toggles open/closed deterministically
  - minimap remains visible, includes viewport boundary frame, and supports click/focus targeting
  - manual camera pan clears previous `cameraFocusHex`
- Dev visibility flow:
  - player can toggle full reveal with key `V`
  - HUD indicator reflects `Dev Vision: ON/OFF`
  - player dev reveal does not mutate AI visibility/fog calculations
- Notification center:
  - newest-first feed
  - filter chips by category
  - grouped sections (`New this turn`, `Earlier`) with unread count
  - city feed keeps high-level outcomes + warnings/failures
  - city feed omits low-value queue-edit success spam
  - rows without `focus` are non-clickable and do not emit warnings on click
  - click/focus jumps camera when target exists; safe warning when target is invalid
  - reset on restart/new match
- Pause flow:
  - Esc opens pause menu
  - restart/new-game confirm path is modal and blocks world input
  - SFX toggle state is reflected in runtime payload (`uiSfxMuted`)

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/uiSurface.test.js`
  - `tests/integration/unitActionSystem.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` covers context actions, previews, turn assistant focus actions, playback banner progression, pause/restart config flow, notifications, forecast/stats/minimap behavior, and SFX toggle state.
- Manual artifact checks:
  - `tests/e2e/artifacts/smoke.png`
  - `tests/e2e/artifacts/ui-city-panel.png`
  - `tests/e2e/artifacts/smoke-tablet.png`

## Known gaps and next steps

- Notification center still prioritizes compact rows over expanded per-entry detail cards.
- No user-facing playback speed/skip controls yet.
- Minimap currently emphasizes navigation/awareness and does not include strategic overlays (for example threat heatmap layers).
