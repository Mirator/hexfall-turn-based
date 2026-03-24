export const TERRAIN = {
  plains: {
    terrainType: "plains",
    moveCost: 1,
    blocksMovement: false,
    fillColor: 0xdbc79a,
  },
  forest: {
    terrainType: "forest",
    moveCost: 2,
    blocksMovement: false,
    fillColor: 0x93b274,
  },
  hill: {
    terrainType: "hill",
    moveCost: 2,
    blocksMovement: false,
    fillColor: 0xb69365,
  },
  mountain: {
    terrainType: "mountain",
    moveCost: 99,
    blocksMovement: true,
    fillColor: 0x7b7a7a,
  },
  water: {
    terrainType: "water",
    moveCost: 99,
    blocksMovement: true,
    fillColor: 0x6ba4cf,
  },
};

/**
 * @param {number} width
 * @param {number} height
 * @returns {import("./types.js").Tile[]}
 */
export function generateTerrainTiles(width, height) {
  const forcedPlains = new Set([
    "2,2",
    "3,2",
    "3,3",
    "4,3",
    "4,2",
    "8,8",
    "7,7",
    "8,7",
  ]);

  const tiles = [];
  for (let q = 0; q < width; q += 1) {
    for (let r = 0; r < height; r += 1) {
      const key = `${q},${r}`;
      let terrainType = getGeneratedTerrainType(q, r);
      if (forcedPlains.has(key)) {
        terrainType = "plains";
      }

      const definition = TERRAIN[terrainType];
      tiles.push({
        q,
        r,
        terrainType,
        moveCost: definition.moveCost,
        blocksMovement: definition.blocksMovement,
      });
    }
  }
  return tiles;
}

/**
 * @param {number} q
 * @param {number} r
 * @returns {"plains"|"forest"|"hill"|"mountain"|"water"}
 */
export function getGeneratedTerrainType(q, r) {
  const seed = (q * 37 + r * 53 + q * r * 11) % 29;
  if (seed === 1 || seed === 17) {
    return "mountain";
  }
  if (seed === 5 || seed === 9 || seed === 21) {
    return "water";
  }
  if (seed % 5 === 0) {
    return "forest";
  }
  if (seed % 7 === 0) {
    return "hill";
  }
  return "plains";
}
