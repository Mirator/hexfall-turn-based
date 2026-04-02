# Hexfall Turn Based

Lightweight civilization-like turn-based prototype in JavaScript using Phaser.

## Tech Stack

- Phaser 3
- Vite
- ESLint
- Vitest
- Playwright

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

## Supported Devices

- Desktop browsers (`>= 900px` width) are fully supported.
- Tablet browsers (`768px - 899px` width) are supported with the condensed HUD layout.
- Phone-sized viewports (`< 768px` width) are not supported and show an in-app blocker message.

## Commands

- `npm run dev` - start development server.
- `npm run build` - create production build.
- `npm run preview` - preview production build.
- `npm run lint` - run lint checks.
- `npm test` - run unit/integration tests.
- `npm run test:e2e` - run Playwright smoke scenario.

## Current Gameplay Slice

- Startup full-screen menu with `New Game` and `About` before gameplay begins
- Startup `New Game` configuration screen for map size (`16/20/24`) and AI faction count (`1..6`)
- Seeded axial hex map generation with deterministic spawn spacing and dynamic active AI roster
- Explored-memory fog-of-war per faction (`unit sight = 2`, `city sight = 3`)
- Player dev visibility toggle (`V`) to reveal full map without disabling AI fog rules
- Settler-only starts, settler-based city founding, and deterministic AI auto-founding for first-city openings
- City-local growth (`growthProgress`) and city-local production progress (`productionProgress`) with typed queue items (`unit`/`building`)
- Queue controls with fixed max length (`3`), reorder/remove actions, and per-slot ETA in the right-rail `City Queue` card
- Food/Production/Gold economy with per-turn gold upkeep, deficit-based unit disable, and one-settler bootstrap protection before first city
- Rush-buy for the front queue item at `remainingProduction * 3` gold
- Diplomacy controls in the `Stats` panel (first-contact gated `Offer Peace` / `Declare War`)
- Unit combat with ranged/counter behavior, city siege, capture/raze outcomes, and movement/pathing blocked on city-occupied tiles
- Civ-like science progression with direct per-turn research, `14` techs, era/city scaling, one-time `40%` Eureka boosts, and overflow chaining
- Campus adjacency snapshot plus science building chain (`campus`, `library`, `university`, `researchLab`) and global science modifiers
- Top-HUD `Tech Tree` button with read-only horizontal technology graph modal (era lanes, dependency links, summary, and scrollable viewport)
- Minimap focus controls, turn forecast, notification filtering, and sequential multi-faction AI playback with per-actor messages
- Match-end victory/defeat state with restart overlay

## Controls

- On startup, choose `New Game` to configure map size + AI faction count before entering a match
- On startup, `About` opens a full-screen game info panel with a back action
- Left click unit to select
- Left click highlighted hex to move (city-occupied hexes are not valid movement destinations)
- Left click red-highlighted hostile unit/city to attack (when visible and at war)
- Left click `End Turn` in the bottom-right HUD
- Select a settler and press `Found City` (or key `F`)
- Use city context panel `Units|Buildings` tabs to enqueue production
- Use the right-rail `City Queue` card (when a city is selected) to reorder/remove queue slots and `Rush Buy` front item
- Click `Stats` to open progress details and manage diplomacy (`Offer Peace` / `Declare War`) for met factions
- Click `Tech Tree` (next to `Stats`) to open the read-only horizontal technology graph modal
- Use minimap click/focus controls to jump camera
- Press `Esc` to open Pause menu (`Resume`, `New Game`, `SFX ON/OFF`)
- After match end, use the result overlay `Restart Match` button
- Press `V` to toggle `Dev Vision: ON/OFF`

## Loading + Bundling

- Phaser runtime is lazy-loaded from `src/main.js` using dynamic import.
- Vite chunking is configured in `vite.config.js` to separate Phaser vendor code.

## Documentation Specs

Specs for all meaningful work are in [`docs/`](./docs/README.md).
