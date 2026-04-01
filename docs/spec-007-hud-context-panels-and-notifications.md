# spec-007-hud-context-panels-and-notifications

## Goal and scope

- Define authoritative gameplay HUD/UX behavior across city/unit context actions and tactical readability.
- Keep instruction surfaces contextual and compact (no persistent tutorial blocks).
- Define research/surface requirements for science-per-turn visibility, turns remaining, boosts, and city science breakdown.
- Define a read-only technology overview entrypoint in top HUD for full-tree science visibility.

## Decisions made (and alternatives rejected)

- Chosen: fixed HUD zones:
  - top-left: turn + full resource names with value/projected delta + `Dev Vision: ON/OFF (V)`
  - top-right: persistent notification center
  - right-side middle: city queue card (visible only while a city is selected), under notifications and above `Attention needed`
  - bottom-left: selected entity card (hidden when no selection)
  - bottom-center: contextual action panel
  - bottom-right: End Turn + turn readiness assistant
- Chosen: right-column polish surfaces include turn forecast, toggleable progress stats panel, and minimap panel.
- Chosen: research visibility in HUD/stats:
  - top-left science readout uses `Science/Turn`
  - stats panel shows active tech, turns remaining, and active-tech boost progress summary
- Chosen: top HUD includes a `Tech Tree` button (adjacent to `Stats`) that opens a read-only modal overview:
  - compact summary: science per turn, base science, global modifier %, completed tech count, active tech + turns remaining
  - per-city science totals sourced from `research.cityScienceById`
  - deterministic full `14`-tech list (all rows) with status/progress/boost/unlocks
  - two-column layout on wide viewports, one compact column otherwise
  - close interactions: `Tech Tree` toggle, `Esc`, backdrop click, and explicit modal `Close` button
- Chosen: city and research context surfaces expose per-city science breakdown when available:
  - population science
  - Campus adjacency science
  - science-building contribution
  - total city science
- Chosen: notification category model includes `Research` and supports filtered view.
- Chosen: city mode keeps `Units|Buildings` tabs with hover details and explicit unavailable-state tags.
- Chosen: disabled actions expose deterministic reason text (inline + tooltip + hint channels).
- Chosen: support matrix is desktop + tablet only (`>= 768px`); phone-sized viewports are blocked.
- Rejected for now: interactive tech selection in the tech-tree modal and persistent tutorial banners.

## Interfaces/types added

- HUD/runtime payload additions used by UI:
  - `research.sciencePerTurn`
  - `research.baseSciencePerTurn`
  - `research.globalModifierTotal`
  - `research.turnsRemaining`
  - `research.boostProgressByTech`
  - `research.cityScienceById`
  - `research.boostsAppliedLastTurn`
- Existing UI payload surfaces retained:
  - `hudTopLeft`, `selectedInfo`, `contextMenu`, `uiHints`, `uiActions`, `uiPreview`, `uiTurnAssistant`, `uiTurnForecast`, `uiContextPanel`, `uiNotifications`
- HUD polish/test payload extensions:
  - top HUD control snapshot now includes `techTree*` fields (`visible`, `label`, `width`, `bounds`)
  - HUD polish snapshot includes `techTree` block (`open`, `summary`, `rows`)
- Test bridge methods:
  - `toggleTechTreeModal()`
  - `getTechTreeModalState()`
- Notification categories:
  - `All`, `Combat`, `City`, `Research`, `System`

## Behavior and acceptance criteria

- HUD science readability:
  - top-left resource card shows `Science/Turn` (not stockpile)
  - forecast card includes projected science delta
- Research status readability:
  - stats panel shows:
    - completed tech count
    - active tech name
    - active-tech turns remaining (when computable)
    - boost progress summary (`current/target`, ready state)
- Tech overview readability:
  - top HUD `Tech Tree` button is visible and horizontally adjacent to `Stats`/`Menu` with matching chip dimensions
  - modal opens as read-only overlay and blocks non-modal gameplay controls while open
  - modal always renders all `14` tech rows in `TECH_ORDER`
  - each row shows: status (`Completed|Active|Available|Locked`), era, progress/cost, boost progress, unlock summary
  - modal summary shows science-per-turn values and per-city science totals
  - modal closes via toggle, `Esc`, backdrop, or `Close` button
- City science transparency:
  - city context and/or right-rail details include local science and science breakdown details when payload is present
- Notification behavior:
  - research completion and boost-trigger notifications use `Research` category
  - filters deterministically include/exclude `Research` rows
- Context/action behavior:
  - city/unit controls only appear for relevant player selection and command state
  - blocked reasons are deterministic and inspectable via tooltip/hints
- Layout behavior:
  - desktop/tablet layouts remain non-overlapping and readable
  - unsupported phone viewport shows blocker banner and does not initialize gameplay canvas

## Validation performed (tests/manual checks)

- Integration:
  - `tests/integration/uiSurface.test.js`
- E2E:
  - `tests/e2e/smoke.mjs` validates:
    - research payload presence (`sciencePerTurn`, `turnsRemaining`, `boostProgressByTech`, `cityScienceById`)
    - top HUD `Tech Tree` button presence/alignment and ordering with `Stats` + `Menu`
    - read-only tech-tree modal open/close and deterministic `14`-row payload
    - modal gameplay gating while tech-tree overlay is open
    - notification filter behavior including `Research` category
    - context/panel flows and non-overlap behavior across supported viewport sizes

## Known gaps and next steps

- Tech-tree modal is compact text-based overview (no node-link graph visualization).
- Notification center still favors compact rows over expanded detail cards.
- No user-configurable research panel pinning independent of context-panel pin state.
