# spec-016-buildings-and-city-specialization-lite

## Goal and scope

- Add lightweight building progression and city specialization identity.
- Use one shared queue model for units and buildings.
- Keep city UI contextual with direct tabbed production control.

## Decisions made (and alternatives rejected)

- Chosen buildings:
  - `granary` (`cost=9`, default unlocked, `+1 food`)
  - `workshop` (`cost=10`, unlock `bronzeWorking`, `+1 production`)
  - `monument` (`cost=8`, unlock `masonry`, `+1 science`)
- Chosen: shared typed queue item model:
  - `{ kind: "unit"|"building", id: string }`
  - max queue length `3`.
- Chosen: queue processing consumes front item only.
- Chosen: prevent duplicate building by city (already built or already queued).
- Chosen specialization priority:
  - `scholarly > industrial > agricultural > balanced`
- Chosen: city panel tabs `Units | Buildings`; enqueue source follows active tab.
- Rejected for now: building-placement map layer, adjacency bonuses, building maintenance cost.

## Interfaces/types added

- `City` additions:
  - `buildings`
  - `productionTab`
  - `specialization`
  - typed `queue`.
- City system additions:
  - `setCityProductionTab(cityId, tab, gameState)`
  - `enqueueCityBuilding(cityId, buildingId, gameState)`
  - `enqueueCityQueueItem(cityId, queueItem, gameState)`
  - `getAvailableProductionBuildings(gameState)`
  - `getBuildingDefinition(buildingId)`
  - `isBuildingUnlocked(buildingId, gameState)`
- UI/runtime:
  - `city-production-tab-set-requested` event.
  - `uiActions.cityProductionTab`
  - `uiActions.cityBuildingChoices`
  - shared `city-queue-enqueue-requested` payload supports typed queue item.
- Test hooks:
  - `window.__hexfallTest.setCityProductionTab(tab)`
  - `window.__hexfallTest.enqueueCityBuilding(buildingId)`

## Behavior and acceptance criteria

- City queue can hold mixed unit/building items up to 3 slots.
- Building completion consumes empire production and pops queue front item.
- Units keep existing spawn-block behavior; queue does not pop on blocked spawn/insufficient production.
- Building duplicates are blocked per city.
- City specialization updates from built buildings by priority.
- Context city panel supports direct tab switch and enqueue actions for both tabs.
- `render_game_to_text` includes city building/specialization/productionTab/typed-queue details.

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/citySystem.test.js` (shared queue behavior, duplicate protection, specialization updates).
  - `tests/integration/uiSurface.test.js` (tab/action-state mapping and building choice surfaces).
- Full suite:
  - `npm run lint`
  - `npm test`
- E2E:
  - `npm run test:e2e` verifies Units/Buildings tab switching and building+unit enqueue interactions.

## Known gaps and next steps

- No building sell/demolish action yet.
- No per-building visual markers on map tiles.
- No dedicated building effects panel beyond compact city info/context panel.
