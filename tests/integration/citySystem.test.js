import { describe, expect, it } from "vitest";
import { createInitialGameState, getTileAt } from "../../src/core/gameState.js";
import { distance } from "../../src/core/hexGrid.js";
import { applyTerrainDefinition } from "../../src/core/terrainData.js";
import {
  CITY_QUEUE_MAX,
  enqueueCityQueue,
  foundCity,
  processTurn,
  removeCityQueueAt,
  setCityFocus,
} from "../../src/systems/citySystem.js";

describe("city economy and identity", () => {
  it("founding initializes city identity fields and removes local stockpiles", () => {
    const gameState = createInitialGameState({ seed: 11 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    const result = foundCity(settler.id, gameState);
    expect(result.ok).toBe(true);
    expect(gameState.cities.length).toBe(1);

    const city = gameState.cities[0];
    expect(city.focus).toBe("balanced");
    expect(city.workedHexes.length).toBeGreaterThan(0);
    expect(city.yieldLastTurn).toEqual(expect.objectContaining({ food: expect.any(Number), production: expect.any(Number) }));
    expect(["agricultural", "industrial", "scholarly", "balanced"]).toContain(city.identity);
    expect("storedProduction" in city).toBe(false);
    expect("storedFood" in city).toBe(false);
  });

  it("assigns worked tiles deterministically by focus weights", () => {
    const gameState = createInitialGameState({ seed: 22 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }
    const found = foundCity(settler.id, gameState);
    expect(found.ok).toBe(true);
    if (!found.cityId) {
      return;
    }

    const city = gameState.cities[0];
    city.population = 2;

    const ringOne = getRingOneNeighbors(city, gameState);
    expect(ringOne.length).toBeGreaterThanOrEqual(3);
    if (ringOne.length < 3) {
      return;
    }

    const [foodHex, productionHex, scienceHex] = ringOne;
    for (const hex of ringOne) {
      setTerrain(gameState, hex.q, hex.r, "water");
    }
    setTerrain(gameState, city.q, city.r, "plains");
    setTerrain(gameState, foodHex.q, foodHex.r, "plains");
    setTerrain(gameState, productionHex.q, productionHex.r, "forest");
    setTerrain(gameState, scienceHex.q, scienceHex.r, "hill");

    setCityFocus(city.id, "food", gameState);
    expect(hasHex(city.workedHexes, foodHex)).toBe(true);

    setCityFocus(city.id, "production", gameState);
    expect(hasHex(city.workedHexes, productionHex)).toBe(true);

    setCityFocus(city.id, "science", gameState);
    expect(hasHex(city.workedHexes, scienceHex)).toBe(true);
  });

  it("uses empire food stock for growth and records last-turn yields", () => {
    const gameState = createInitialGameState({ seed: 33 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }
    const founded = foundCity(settler.id, gameState);
    expect(founded.ok).toBe(true);

    const city = gameState.cities[0];
    setTerrain(gameState, city.q, city.r, "plains");
    city.population = 1;
    city.growthProgress = 0;
    city.focus = "food";

    gameState.economy.player.foodStock = 6;
    gameState.economy.player.productionStock = 0;
    gameState.economy.player.scienceStock = 0;

    const result = processTurn(gameState, "player");
    expect(result.grew).toContain(city.id);
    expect(city.population).toBe(2);
    expect(city.growthProgress).toBe(0);
    expect(gameState.economy.player.foodStock).toBe(0);
    expect(gameState.economy.player.lastTurnIncome.food).toBeGreaterThan(0);
    expect(gameState.economy.player.lastTurnIncome.production).toBeGreaterThanOrEqual(0);
    expect(result.researchIncome).toBe(gameState.economy.player.lastTurnIncome.science);
    expect(city.identity).toBe("agricultural");
  });

  it("spends empire production in deterministic city-id order", () => {
    const gameState = createInitialGameState({ seed: 44 });
    gameState.units = [];
    gameState.cities = [
      createCity("player-city-1", "player", 2, 2),
      createCity("player-city-9", "player", 8, 8),
    ];

    ensureLocalPassableArea(gameState, 2, 2);
    ensureLocalPassableArea(gameState, 8, 8);

    gameState.economy.player.foodStock = 0;
    gameState.economy.player.productionStock = 5;
    gameState.economy.player.scienceStock = 0;

    const result = processTurn(gameState, "player");
    expect(result.produced.length).toBe(1);
    expect(gameState.economy.player.productionStock).toBe(1);

    const producedUnit = gameState.units.find((unit) => unit.owner === "player");
    expect(producedUnit).toBeTruthy();
    if (!producedUnit) {
      return;
    }
    expect(distance(producedUnit, { q: 2, r: 2 })).toBeLessThanOrEqual(1);
  });

  it("enforces queue cap and supports remove-by-index compaction", () => {
    const gameState = createInitialGameState({ seed: 444 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }
    const founded = foundCity(settler.id, gameState);
    expect(founded.ok).toBe(true);
    if (!founded.cityId) {
      return;
    }

    const city = gameState.cities.find((candidate) => candidate.id === founded.cityId);
    expect(city).toBeTruthy();
    if (!city) {
      return;
    }

    city.queue = [];
    const added1 = enqueueCityQueue(city.id, "warrior", gameState);
    const added2 = enqueueCityQueue(city.id, "settler", gameState);
    const added3 = enqueueCityQueue(city.id, "warrior", gameState);
    expect(added1.ok && added2.ok && added3.ok).toBe(true);
    expect(city.queue.length).toBe(CITY_QUEUE_MAX);

    const overfill = enqueueCityQueue(city.id, "warrior", gameState);
    expect(overfill.ok).toBe(false);
    expect(overfill.reason).toBe("queue-full");

    const removed = removeCityQueueAt(city.id, 1, gameState);
    expect(removed.ok).toBe(true);
    expect(city.queue).toEqual(["warrior", "warrior"]);
  });

  it("consumes player queue front item after successful production", () => {
    const gameState = createInitialGameState({ seed: 445 });
    gameState.units = [];
    gameState.cities = [createCity("player-city-1", "player", 2, 2)];
    gameState.cities[0].queue = ["warrior", "settler"];
    ensureLocalPassableArea(gameState, 2, 2);

    gameState.economy.player.foodStock = 0;
    gameState.economy.player.productionStock = 20;
    gameState.economy.player.scienceStock = 0;

    const firstTurn = processTurn(gameState, "player");
    expect(firstTurn.produced.length).toBe(1);
    expect(gameState.cities[0].queue).toEqual(["settler"]);

    const secondTurn = processTurn(gameState, "player");
    expect(secondTurn.produced.length).toBe(1);
    expect(gameState.cities[0].queue).toEqual([]);
  });

  it("auto-refills enemy empty queue with the cheapest unlocked unit", () => {
    const gameState = createInitialGameState({ seed: 446 });
    gameState.units = [];
    gameState.cities = [createCity("enemy-city-1", "enemy", 2, 2)];
    gameState.cities[0].queue = [];
    ensureLocalPassableArea(gameState, 2, 2);
    gameState.unlocks.units = ["warrior", "settler"];

    gameState.economy.enemy.foodStock = 0;
    gameState.economy.enemy.productionStock = 100;
    gameState.economy.enemy.scienceStock = 0;

    const result = processTurn(gameState, "enemy");
    expect(result.produced.length).toBe(1);
    expect(gameState.cities[0].queue).toEqual(["warrior"]);
  });

  it("does not spend production when a city has no valid spawn hex", () => {
    const gameState = createInitialGameState({ seed: 55 });
    gameState.units = [];
    gameState.cities = [
      createCity("player-city-1", "player", 2, 2),
      createCity("player-city-2", "player", 6, 6),
    ];

    ensureLocalPassableArea(gameState, 2, 2);
    setTerrain(gameState, 6, 6, "plains");
    for (const neighbor of [
      { q: 7, r: 6 },
      { q: 7, r: 5 },
      { q: 6, r: 5 },
      { q: 5, r: 6 },
      { q: 5, r: 7 },
      { q: 6, r: 7 },
    ]) {
      setTerrain(gameState, neighbor.q, neighbor.r, "water");
    }

    gameState.economy.player.foodStock = 0;
    gameState.economy.player.productionStock = 10;
    gameState.economy.player.scienceStock = 0;

    const result = processTurn(gameState, "player");
    expect(result.produced.length).toBe(1);
    expect(gameState.economy.player.productionStock).toBe(6);
  });
});

function createCity(id, owner, q, r) {
  return {
    id,
    owner,
    q,
    r,
    population: 1,
    focus: "balanced",
    workedHexes: [{ q, r }],
    yieldLastTurn: { food: 0, production: 0, science: 0 },
    identity: "balanced",
    growthProgress: 0,
    health: 12,
    maxHealth: 12,
    queue: ["warrior"],
  };
}

function getRingOneNeighbors(city, gameState) {
  const candidates = [
    { q: city.q + 1, r: city.r },
    { q: city.q + 1, r: city.r - 1 },
    { q: city.q, r: city.r - 1 },
    { q: city.q - 1, r: city.r },
    { q: city.q - 1, r: city.r + 1 },
    { q: city.q, r: city.r + 1 },
  ];

  return candidates.filter((hex) => !!getTileAt(gameState.map, hex.q, hex.r));
}

function setTerrain(gameState, q, r, terrainType) {
  const tile = getTileAt(gameState.map, q, r);
  if (!tile) {
    return;
  }
  applyTerrainDefinition(tile, terrainType);
}

function ensureLocalPassableArea(gameState, q, r) {
  setTerrain(gameState, q, r, "plains");
  const neighbors = [
    { q: q + 1, r },
    { q: q + 1, r: r - 1 },
    { q, r: r - 1 },
    { q: q - 1, r },
    { q: q - 1, r: r + 1 },
    { q, r: r + 1 },
  ];
  for (const neighbor of neighbors) {
    setTerrain(gameState, neighbor.q, neighbor.r, "plains");
  }
}

function hasHex(hexes, target) {
  return hexes.some((hex) => hex.q === target.q && hex.r === target.r);
}
