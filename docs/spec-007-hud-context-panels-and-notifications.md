# spec-007-hud-context-panels-and-notifications

## Goal and scope

- Define authoritative gameplay HUD/UX behavior across city/unit context actions and tactical readability.
- Keep instruction surfaces contextual and compact (no persistent tutorial blocks).
- Define research/surface requirements for science-per-turn visibility, turns remaining, boosts, and city science breakdown.

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
- Chosen: city and research context surfaces expose per-city science breakdown when available:
  - population science
  - Campus adjacency science
  - science-building contribution
  - total city science
- Chosen: notification category model includes `Research` and supports filtered view.
- Chosen: city mode keeps `Units|Buildings` tabs with hover details and explicit unavailable-state tags.
- Chosen: disabled actions expose deterministic reason text (inline + tooltip + hint channels).
- Chosen: support matrix is desktop + tablet only (`>= 768px`); phone-sized viewports are blocked.
- Rejected for now: full-screen dedicated tech-tree UI and persistent tutorial banners.

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
    - notification filter behavior including `Research` category
    - context/panel flows and non-overlap behavior across supported viewport sizes

## Known gaps and next steps

- No standalone research browser with full graph visualization.
- Notification center still favors compact rows over expanded detail cards.
- No user-configurable research panel pinning independent of context-panel pin state.
