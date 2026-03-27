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

- Seeded `16x16` axial hex map with terrain costs and obstacles
- Three factions (`player`, `enemy`, `purple`) with settler starts and deterministic spawn spacing
- Explored-memory fog-of-war per faction (`unit sight = 2`, `city sight = 3`)
- Player dev visibility toggle (`V`) to reveal full map without disabling AI fog rules
- Unit combat with HP, attack ranges, and unit removal
- Settler-driven city founding and lightweight production queue
- Research progression with unlockable unit options
- Sequential AI phase playback (`enemy` then `purple`) with per-actor messages
- Match-end victory/defeat state with restart overlay

## Controls

- Left click unit to select
- Left click highlighted hex to move
- Left click red-highlighted hostile unit/city to attack (when visible)
- Left click `End Turn` in the bottom-right HUD
- Select a settler and press `Found City` (or key `F`)
- Use city context panel to set focus/production
- Use the right-rail `City Queue` card (when a city is selected) to reorder/remove queue slots
- Use `Research` controls in HUD to cycle/select active research
- Press `Esc` to open Pause menu (`Resume`, `Restart`) and confirm restart
- After match end, use the result overlay `Restart Match` button
- Press `V` to toggle `Dev Vision: ON/OFF`

## Loading + Bundling

- Phaser runtime is lazy-loaded from `src/main.js` using dynamic import.
- Vite chunking is configured in `vite.config.js` to separate Phaser vendor code.

## Documentation Specs

Specs for all meaningful work are in [`docs/`](./docs/README.md).
