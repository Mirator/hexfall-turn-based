# spec-012-city-bottom-command-panel-and-queue-ui

## Goal and scope

- Move city-specific controls to a contextual bottom command panel.
- Replace focus cycling with direct focus selection buttons.
- Use a 3-slot typed city queue with add/remove interactions for units/buildings.
- Align this panel with shared contextual-command behavior used for unit actions.

## Decisions made (and alternatives rejected)

- Chosen: bottom-center panel is contextual and appears only when a player-controlled city or unit is selected.
- Chosen: city mode uses compact rows (`focus`, `enqueue`, `queue`), with deterministic queue operations.
- Chosen: city mode includes direct `Units | Buildings` tabs for enqueue source.
- Chosen: unit mode reuses the same panel zone and exposes `Found City` + `Skip Unit`.
- Chosen: queue length fixed at 3, duplicates allowed, remove-by-slot compaction.
- Chosen: player queues are manual only; enemy refill behavior is delegated to AI personality planning (`spec-014`).
- Rejected for now: separate building-only queue, drag reordering, always-visible city panel, and separate unit action side panel.

## Interfaces/types added

- City system APIs:
  - `CitySystem.setCityFocus(cityId, focus, gameState)`
  - `CitySystem.enqueueCityQueue(cityId, unitType, gameState)`
  - `CitySystem.setCityProductionTab(cityId, tab, gameState)`
  - `CitySystem.enqueueCityBuilding(cityId, buildingId, gameState)`
  - `CitySystem.enqueueCityQueueItem(cityId, queueItem, gameState)`
  - `CitySystem.removeCityQueueAt(cityId, index, gameState)`
  - `CITY_QUEUE_MAX`
- Unit action APIs:
  - `UnitActionSystem.canSkipUnit(unitId, gameState)`
  - `UnitActionSystem.skipUnit(unitId, gameState)`
- UI events:
  - `city-focus-set-requested`
  - `city-production-tab-set-requested`
  - `city-queue-enqueue-requested`
  - `city-queue-remove-requested`
  - `unit-action-requested`
- UI surface additions:
  - `uiActions.contextMenuType`
  - `uiActions.canSetCityFocus`
  - `uiActions.canQueueProduction`
  - `uiActions.cityQueueMax`
  - `uiActions.cityQueueReason`
  - `uiActions.canSkipUnit`
  - `uiActions.skipUnitReason`
  - `uiActions.cityProductionChoices[]` (`type`, `cost`, `unlocked`, `affordable`)
  - `uiActions.cityProductionTab` (`units`/`buildings`)
  - `uiActions.cityBuildingChoices[]` (`id`, `cost`, `unlocked`, `affordable`, `alreadyBuilt`, `alreadyQueued`)
- Test hooks:
  - `window.__hexfallTest.setCityFocus(focus)`
  - `window.__hexfallTest.setCityProductionTab(tab)`
  - `window.__hexfallTest.enqueueCityProduction(unitType)`
  - `window.__hexfallTest.enqueueCityBuilding(buildingId)`
  - `window.__hexfallTest.removeCityQueueAt(index)`
  - `window.__hexfallTest.getCityPanelState()`
  - `window.__hexfallTest.triggerUnitAction(actionId)`

## Behavior and acceptance criteria

- Context panel visibility:
  - hidden with no valid player selection
  - city mode for selected player city
  - unit mode for selected player unit
- City mode:
  - focus buttons set exact mode and highlight active focus
  - enqueue fills first empty slot
  - enqueue blocked when queue is full
  - remove slot compacts queue left
- Unit mode:
  - `Found City` obeys shared founding validators/reasons
  - `Skip Unit` consumes unit action (`hasActed=true`, movement `0`)
- Production behavior:
  - shared queue consumes `queue[0]` on successful completion (unit spawn or building completion)
  - no queue pop on blocked spawn or insufficient production stock
  - enemy queue refills are personality-aware and deterministic (see `spec-014`)
- Modal lock behavior remains consistent: pause/restart/city-resolution modals block panel actions.

## Validation performed (tests/manual checks)

- Integration: `tests/integration/citySystem.test.js` (focus/queue APIs, queue cap/compaction, consumption ordering, enemy auto-refill).
- Integration: `tests/integration/uiSurface.test.js` (context mode mapping, queue/focus/tab state, queue-full and building reasons).
- Integration: `tests/integration/unitActionSystem.test.js` (skip action validation and state mutation).
- E2E: `tests/e2e/smoke.mjs` (city panel visibility, focus/queue flow, unit context actions, notification path).
- Manual artifacts: `tests/e2e/artifacts/ui-city-panel.png`, `tests/e2e/artifacts/ui-city-panel-mobile.png`.

## Known gaps and next steps

- Building production options are now active (`granary`, `workshop`, `monument`) via shared queue model.
- No queue drag-reorder controls (remove-only for this milestone).
- No persistent city detail sheet beyond compact selected card + contextual panel.
