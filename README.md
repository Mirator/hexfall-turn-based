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

## Commands

- `npm run dev` - start development server.
- `npm run build` - create production build.
- `npm run preview` - preview production build.
- `npm run lint` - run lint checks.
- `npm test` - run unit/integration tests.
- `npm run test:e2e` - run Playwright smoke scenario.

## Current Gameplay Slice

- 12x12 axial hex map with terrain costs and obstacles
- Unit combat with HP, attack ranges, and unit removal
- Settler-driven city founding and lightweight production queue
- Research progression with unlockable unit options
- Enemy turn behavior with movement and counter-attacks
- Match-end victory/defeat state with restart overlay

## Controls

- Left click unit to select
- Left click highlighted hex to move
- Left click red-highlighted enemy to attack
- Left click `End Turn` in top-right UI
- Select a settler and press `Found City` button
- Use `Research` label to cycle active research
- Use `Cycle Queue` on selected city to switch production target

## Loading + Bundling

- Phaser runtime is lazy-loaded from `src/main.js` using dynamic import.
- Vite chunking is configured in `vite.config.js` to separate Phaser vendor code.

## Documentation Specs

Specs for all meaningful work are in [`docs/`](./docs/README.md).
