import { mixSeed, normalizeSeed } from "./random.js";

export const TERRAIN = {
  plains: {
    terrainType: "plains",
    moveCost: 1,
    blocksMovement: false,
    fillColor: 0xdbc79a,
    yields: { food: 2, production: 1, science: 0 },
  },
  forest: {
    terrainType: "forest",
    moveCost: 2,
    blocksMovement: false,
    fillColor: 0x93b274,
    yields: { food: 1, production: 2, science: 0 },
  },
  hill: {
    terrainType: "hill",
    moveCost: 2,
    blocksMovement: false,
    fillColor: 0xb69365,
    yields: { food: 0, production: 2, science: 1 },
  },
  mountain: {
    terrainType: "mountain",
    moveCost: 99,
    blocksMovement: true,
    fillColor: 0x7b7a7a,
    yields: { food: 0, production: 0, science: 0 },
  },
  water: {
    terrainType: "water",
    moveCost: 99,
    blocksMovement: true,
    fillColor: 0x6ba4cf,
    yields: { food: 0, production: 0, science: 0 },
  },
};

/**
 * @param {number} width
 * @param {number} height
 * @param {{ seed?: number|string }} [options]
 * @returns {import("./types.js").Tile[]}
 */
export function generateTerrainTiles(width, height, options = {}) {
  const seed = normalizeSeed(options.seed ?? 1);
  const tiles = [];
  for (let q = 0; q < width; q += 1) {
    for (let r = 0; r < height; r += 1) {
      const terrainType = getGeneratedTerrainType(q, r, seed);
      const tile = { q, r, terrainType, moveCost: 0, blocksMovement: false, yields: { food: 0, production: 0, science: 0 } };
      applyTerrainDefinition(tile, terrainType);
      tiles.push(tile);
    }
  }
  return tiles;
}

/**
 * @param {number} q
 * @param {number} r
 * @param {number|string} seed
 * @returns {"plains"|"forest"|"hill"|"mountain"|"water"}
 */
export function getGeneratedTerrainType(q, r, seed) {
  const sample = sampleTileNoise(seed, q, r);
  if (sample < 0.045) {
    return "water";
  }
  if (sample < 0.105) {
    return "mountain";
  }
  if (sample < 0.33) {
    return "forest";
  }
  if (sample < 0.5) {
    return "hill";
  }
  return "plains";
}

/**
 * @param {import("./types.js").Tile} tile
 * @param {"plains"|"forest"|"hill"|"mountain"|"water"} terrainType
 * @returns {import("./types.js").Tile}
 */
export function applyTerrainDefinition(tile, terrainType) {
  const definition = TERRAIN[terrainType];
  tile.terrainType = terrainType;
  tile.moveCost = definition.moveCost;
  tile.blocksMovement = definition.blocksMovement;
  tile.yields = { ...definition.yields };
  return tile;
}

function sampleTileNoise(seed, q, r) {
  const normalized = normalizeSeed(seed);
  const primary = (mixSeed(normalized, `${q},${r}`) & 0xffff) / 0xffff;
  const secondary = (mixSeed(normalized, `${q + 19},${r - 11}`) & 0xffff) / 0xffff;
  const tertiary = (mixSeed(normalized, `${q * 3 + 7},${r * 5 - 3}`) & 0xffff) / 0xffff;
  return primary * 0.58 + secondary * 0.28 + tertiary * 0.14;
}
