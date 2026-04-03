# spec-007-hud-context-panels-and-notifications

## Goal and scope

- Define authoritative gameplay HUD/UX behavior across city/unit context actions and tactical readability.
- Keep instruction surfaces contextual and compact (no persistent tutorial blocks).
- Define where economy, diplomacy, and science status are presented.
- Define the read-only technology overview entrypoint in top HUD for full-tree visibility.

## Decisions made (and alternatives rejected)

- Chosen: fixed HUD zones:
  - top-left: turn + full resource names (`Food`, `Production`, `Gold`) with value/net delta/gross delta and `Dev Vision: ON/OFF (V)`
  - top-right: persistent notification center
  - right-side middle: city queue rail card (visible only while a city is selected), under notifications and above `Attention`
  - bottom-left: selected entity card (hidden when no selection)
  - bottom-center: contextual action panel
  - bottom-right: End Turn + turn readiness assistant
- Chosen: right-column polish surfaces include turn forecast, toggleable stats panel, and minimap panel.
- Chosen: science visibility in HUD/stats:
  - top-left no longer carries science as a primary resource tile
  - stats/forecast/context surfaces carry active tech, turns remaining, boost progress, and science breakdown visibility
- Chosen: stats panel hosts diplomacy controls for met factions:
  - per-faction relation row with `Offer Peace` / `Declare War`
  - first-contact and turn-phase gating with deterministic disabled reason text
- Chosen: top HUD includes a `Tech Tree` button (adjacent to `Stats`) that opens a read-only modal overview:
  - compact summary: science per turn, base science, global modifier %, completed tech count, active tech + turns remaining
  - per-city science totals sourced from `research.cityScienceById`
  - deterministic horizontal tech graph with era lanes (`Era 1/2/3`), prerequisite connectors, and `14` node cards
  - inner horizontal scrolling within modal viewport (supports shift-wheel/trackpad and drag pan)
  - close interactions: `Tech Tree` toggle, `Esc`, backdrop click, and explicit modal `Close` button
- Chosen: city and research context surfaces expose per-city science breakdown when available:
  - population science
  - Campus adjacency science
  - science-building contribution
  - total city science
- Chosen: city mode keeps `Units|Buildings` tabs with hover details and explicit unavailable-state tags.
- Chosen: right-rail city queue card includes rush-buy action + reason state tied to queue-front and gold balance.
- Chosen: disabled actions expose deterministic reason text (inline + tooltip + hint channels).
- Chosen: notification category model includes `Research` and supports filtered view.
- Chosen: support matrix is desktop + tablet only (`>= 768px`); phone-sized viewports are blocked.
- Rejected for now: interactive tech selection inside the tech-tree modal and persistent tutorial banners.

## Interfaces/types added

- HUD/runtime payload additions used by UI:
  - `hudTopLeft.resources.food|production|gold.{current,delta,grossDelta}`
  - `research.sciencePerTurn`
  - `research.baseSciencePerTurn`
  - `research.globalModifierTotal`
  - `research.turnsRemaining`
  - `research.boostProgressByTech`
  - `research.cityScienceById`
  - `research.boostsAppliedLastTurn`
- Existing UI payload surfaces retained:
  - `selectedInfo`, `contextMenu`, `uiHints`, `uiActions`, `uiPreview`, `uiTurnAssistant`, `uiTurnForecast`, `uiContextPanel`, `uiNotifications`
- Diplomacy/action payload surfaces:
  - `uiActions.canManageDiplomacy`
  - `uiActions.diplomacyMenuReason`
  - `uiActions.diplomacyRelations[]` (status, action label, action reason)
- City queue/rush-buy payload surfaces:
  - `uiActions.cityQueueSlots`
  - `uiActions.cityProductionTab`
  - `uiActions.cityProductionChoices`
  - `uiActions.cityBuildingChoices`
  - `uiActions.cityEtaHint` (dynamic ETA hint string, growth-aware when near growth)
  - `uiActions.canRushBuyCityQueueFront`
  - `uiActions.cityRushBuyCost`
  - `uiActions.cityRushBuyReason`
- HUD polish/test payload extensions:
  - top HUD control snapshot includes `techTree*` fields (`visible`, `label`, `width`, `bounds`)
  - HUD polish snapshot includes `techTree` block (`open`, `summary`, `rows`, `graph`)
  - minimap snapshot (`bounds`, viewport frame visibility/footprint)
- Test bridge methods:
  - `toggleTechTreeModal()`
  - `getTechTreeModalState()`
  - `scrollTechTreeGraph(delta)`
  - `toggleStatsPanel()`
  - `setNotificationFilter(filter)`
  - `clickMinimapNormalized(nx, ny)`
  - `focusMinimapHex(q, r)`
  - `toggleSfxMute()`
- Notification categories:
  - `All`, `Combat`, `City`, `Research`, `System`

## Behavior and acceptance criteria

- Resource readability:
  - top-left resource card shows `Food`, `Production`, `Gold` with signed net deltas and gross deltas
  - forecast card includes projected net values for `food`, `production`, `gold`, `science`
- Science status readability:
  - stats panel shows:
    - completed tech count
    - active tech name
    - active-tech turns remaining (when computable)
    - boost progress summary (`current/target`, ready state)
- Diplomacy readability:
  - stats panel lists met factions only
  - each listed faction shows relation status and one actionable button (`Offer Peace` or `Declare War`)
  - controls are disabled with explicit reason when it is not player turn or contact is missing
- Tech overview readability:
  - top HUD `Tech Tree` button is visible and horizontally adjacent to `Stats`/`Menu` with matching chip dimensions
  - modal opens as read-only overlay and blocks non-modal gameplay controls while open
  - modal always renders all `14` tech nodes in deterministic left-to-right dependency order
  - graph visualizes era lanes (`1..3`), prerequisite connectors, node status (`Completed|Active|Available|Locked`), and compact progress/boost text
  - modal summary shows science-per-turn values and per-city science totals
  - modal closes via toggle, `Esc`, backdrop, or `Close` button
- City queue context behavior:
  - city queue rail is visible only when a player city is selected
  - queue card exposes per-slot labels/ETA/reorder/remove controls
  - dynamic ETA hint is visible in city queue rail details, expanded city context secondary metadata, and production hover tooltip text
  - rush-buy button state is deterministic and mirrors `canRushBuyCityQueueFront` + reason/cost payloads
- Notification behavior:
  - research completion and boost-trigger notifications use `Research` category
  - filters deterministically include/exclude category rows
- Layout behavior:
  - desktop/tablet layouts remain non-overlapping and readable
  - unsupported phone viewport shows blocker banner and does not initialize gameplay canvas

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/uiSurface.test.js`
  - `tests/integration/diplomacySystem.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` validates:
    - `Food/Production/Gold` top-left payloads
    - diplomacy metadata availability after first contact
    - top HUD `Tech Tree` button presence/alignment and ordering with `Stats` + `Menu`
    - read-only tech-tree modal open/close and deterministic graph payload (`nodes`, `edges`, `viewport`, `scrollX`)
    - graph scroll behavior updates `scrollX` while modal remains open
    - minimap visibility/click-focus/frame footprint
    - notification filter behavior including `Research` category
    - context/panel flows and non-overlap behavior across supported viewport sizes

## Known gaps and next steps

- Tech-tree modal uses fixed-scale horizontal graph (no zoom controls yet).
- Notification center still favors compact rows over expanded detail cards.
- Diplomacy remains stats-panel driven; no standalone diplomacy screen yet.
