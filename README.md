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

- 12x12 axial hex map
- One player unit with movement points
- Click to select unit
- Click highlighted tile to move
- End turn button resets movement and advances turn

## Controls

- Left click unit to select
- Left click highlighted hex to move
- Left click `End Turn` in top-right UI

## Documentation Specs

Specs for all meaningful work are in [`docs/`](./docs/README.md).
