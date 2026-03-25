# spec-013-hud-layout-context-actions-and-notification-center

## Goal and scope

- Rework HUD layout so strategic info, selection info, commands, and turn controls live in predictable screen zones.
- Unify city and unit commands in one contextual bottom-center action panel.
- Move restart behind an Esc pause menu flow with explicit confirmation.
- Replace transient toasts with a persistent top-right notification center feed.

## Decisions made (and alternatives rejected)

- Chosen: top-left shows `Turn` plus full resource names (`Food`, `Production`, `Science`) with `current (+delta)` where `delta` is projected net stock change after automatic spending.
- Chosen: selected unit/city details moved to a dedicated bottom-left card.
- Chosen: bottom-center panel is contextual (`city` controls or `unit` controls) rather than always showing both.
- Chosen: `End Turn` stays always available in bottom-right during active play.
- Chosen: restart removed from always-visible HUD and placed in Esc pause menu (`Resume`, `Restart`, confirm step).
- Chosen: notification center is persistent, newest-first, scrollable, and reset per match.
- Chosen: compact/mobile-specific layout rules to prevent control overlap on narrow viewports.
- Rejected for now: always-on tutorial text and separate dedicated side panels for unit actions.

## Interfaces/types added

- Runtime UI payload:
  - `uiNotifications: Array<{ id: string, level: "info"|"warning", message: string, createdAtMs: number }>`
  - `pauseMenu: { open: boolean, restartConfirmOpen: boolean }`
  - `selectedInfo` summary payload (`unit` / `city` / `none`)
  - `contextMenu` payload (`city` / `unit` / `none`)
  - `hudTopLeft.resources.{food,production,science}.{current,delta,grossDelta}`
- UI surface additions:
  - `uiActions.contextMenuType`
  - `uiActions.canSkipUnit`
  - `uiActions.skipUnitReason`
- New system API:
  - `UnitActionSystem.canSkipUnit(unitId, gameState)`
  - `UnitActionSystem.skipUnit(unitId, gameState)`
  - `UnitActionSystem.getSkipUnitReasonText(reason)`
- New/extended test hooks:
  - `window.__hexfallTest.getPauseMenuState()`
  - `window.__hexfallTest.openPauseMenu()`
  - `window.__hexfallTest.closePauseMenu()`
  - `window.__hexfallTest.getNotificationCenterState()`
  - `window.__hexfallTest.triggerUnitAction(actionId)`

## Behavior and acceptance criteria

- HUD placement:
  - top-left: turn + full resource labels with projected deltas
  - resource delta text is rendered with slightly smaller font; positive values are green, negative values are red
  - bottom-left: selected entity details (hidden when nothing is selected)
  - bottom-center: contextual action panel
  - bottom-right: End Turn button
  - top-right: persistent notification feed
- Context panel behavior:
  - player city selected: focus tabs + queue controls
  - player unit selected: `Found City` + `Skip Unit`
  - no valid selection/phase: panel hidden
- Pause and restart:
  - Esc toggles pause menu
  - pause menu blocks underlying world actions
  - restart requires confirm/cancel step
- Notifications:
  - all `ui-toast-requested` events are persisted into notification center entries
  - ordering is newest-first
  - feed is scrollable and resets on restart/new match
  - when feed is empty, panel collapses to compact header height (no filler "empty" row)

## Validation performed (tests/manual checks)

- `npm run lint`
- `npm test` (includes updated UI-surface integration coverage and unit action integration tests)
- `npm run test:e2e` (smoke flow verifies pause/restart path, unit context action path, city context panel path, notification feed path, and no-defeat regression)
- Visual checks:
  - desktop city-panel screenshot: `tests/e2e/artifacts/ui-city-panel.png`
  - mobile city-panel screenshot: `tests/e2e/artifacts/ui-city-panel-mobile.png`
  - smoke screenshot: `tests/e2e/artifacts/smoke.png`

## Known gaps and next steps

- Notification center currently supports scroll-wheel input; touch drag/scroll support can be added later.
- Compact/mobile mode prioritizes readability over map area and may benefit from collapsible panels.
- No notification filtering/search yet (single chronological stream only).
