# spec-012-city-bottom-command-panel-and-queue-ui

## Goal and scope

- Move city-specific controls to a contextual bottom command panel.
- Replace focus cycling with direct focus selection buttons.
- Replace single-item city production selection with a 3-slot queue using add/remove interactions.

## Decisions made (and alternatives rejected)

- Chosen: panel appears only when a player city is selected and match is ongoing.
- Chosen: two-row compact panel (`focus row` + `queue row`) to keep city commands visible but lightweight.
- Chosen: queue length fixed at 3, duplicates allowed, and remove-by-slot interaction.
- Chosen: player queues are not auto-refilled; enemy queues auto-refill with cheapest unlocked unit.
- Rejected for now: building queue, drag reordering, and always-visible city panel.

## Interfaces/types added

- City system APIs:
  - `CitySystem.setCityFocus(cityId, focus, gameState)`
  - `CitySystem.enqueueCityQueue(cityId, unitType, gameState)`
  - `CitySystem.removeCityQueueAt(cityId, index, gameState)`
  - `CITY_QUEUE_MAX`
- UI events:
  - `city-focus-set-requested`
  - `city-queue-enqueue-requested`
  - `city-queue-remove-requested`
- UI surface additions:
  - `uiActions.canSetCityFocus`
  - `uiActions.canQueueProduction`
  - `uiActions.cityQueueMax`
  - `uiActions.cityQueueReason`
  - `uiActions.cityProductionChoices[]` (`type`, `cost`, `unlocked`, `affordable`)
- Test hooks:
  - `window.__hexfallTest.setCityFocus(focus)`
  - `window.__hexfallTest.enqueueCityProduction(unitType)`
  - `window.__hexfallTest.removeCityQueueAt(index)`
  - `window.__hexfallTest.getCityPanelState()`

## Behavior and acceptance criteria

- City panel is hidden by default and shown only for selected player city.
- Focus buttons set the exact focus mode directly and highlight the active focus.
- Queue buttons:
  - enqueue into first free slot,
  - block enqueue when queue is full,
  - remove clicked queue slot and compact left.
- Production consumes `queue[0]` and pops on successful spawn; queue remains unchanged if blocked or unaffordable.
- Enemy city queue refills to cheapest unlocked unit when empty to keep AI production pressure.
- Modal lock behavior remains consistent: restart/city-resolution modals block underlying panel actions.

## Validation performed (tests/manual checks)

- Integration: `tests/integration/citySystem.test.js` (focus set API, queue cap, remove compaction, queue consumption, enemy auto-refill).
- Integration: `tests/integration/uiSurface.test.js` (queue/focus action state and queue-full reason mapping).
- E2E: `tests/e2e/smoke.mjs` covers panel visibility, direct focus set, queue add/remove/full behavior, and regression flow to domination victory.

## Known gaps and next steps

- No building production options yet.
- No queue drag-reorder controls (remove-only for this milestone).
- No dedicated city detail popup beyond compact chip + bottom panel.
