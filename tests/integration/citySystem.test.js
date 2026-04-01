import { describe, expect, it } from "vitest";
import { createInitialGameState, getTileAt } from "../../src/core/gameState.js";
import { distance } from "../../src/core/hexGrid.js";
import { applyTerrainDefinition } from "../../src/core/terrainData.js";
import {
  CITY_QUEUE_MAX,
  enqueueCityBuilding,
  enqueueCityQueue,
  foundCity,
  moveCityQueueItem,
  processTurn,
  removeCityQueueAt,
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
    expect(city.workedHexes.length).toBeGreaterThan(0);
    expect(city.yieldLastTurn).toEqual(expect.objectContaining({ food: expect.any(Number), production: expect.any(Number) }));
    expect(["agricultural", "industrial", "scholarly", "balanced"]).toContain(city.identity);
    expect(city.specialization).toBe("balanced");
    expect(city.queue).toEqual([]);
    expect("storedProduction" in city).toBe(false);
    expect("storedFood" in city).toBe(false);
  });

  it("assigns worked tiles deterministically by balanced yield priority", () => {
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

    processTurn(gameState, "player");
    expect(hasHex(city.workedHexes, foodHex)).toBe(true);
    expect(hasHex(city.workedHexes, productionHex)).toBe(false);
    expect(hasHex(city.workedHexes, scienceHex)).toBe(false);
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
    gameState.economy.player.foodStock = 6;
    gameState.economy.player.productionStock = 0;
    gameState.economy.player.sciencePerTurn = 0;

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

  it("resolves growth order deterministically by city id", () => {
    const gameState = createInitialGameState({ seed: 331 });
    gameState.units = [];
    gameState.cities = [
      createCity("player-city-1", "player", 2, 2),
      createCity("player-city-2", "player", 8, 8),
    ];
    ensureLocalPassableArea(gameState, 2, 2);
    ensureLocalPassableArea(gameState, 8, 8);

    const cityA = gameState.cities[0];
    const cityB = gameState.cities[1];
    cityA.population = 1;
    cityB.population = 1;
    cityA.growthProgress = 0;
    cityB.growthProgress = 0;
    setTerrain(gameState, cityA.q, cityA.r, "plains");
    setTerrain(gameState, cityB.q, cityB.r, "plains");

    gameState.economy.player.foodStock = 3;
    gameState.economy.player.productionStock = 0;
    gameState.economy.player.sciencePerTurn = 0;

    processTurn(gameState, "player");

    expect(cityA.growthProgress).toBe(7);
    expect(cityB.growthProgress).toBe(0);
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
    gameState.economy.player.sciencePerTurn = 0;

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
    expect(city.queue).toEqual([
      { kind: "unit", id: "warrior" },
      { kind: "unit", id: "warrior" },
    ]);
  });

  it("supports deterministic queue reordering via move up/down", () => {
    const gameState = createInitialGameState({ seed: 449 });
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

    city.queue = [
      { kind: "unit", id: "warrior" },
      { kind: "unit", id: "settler" },
      { kind: "building", id: "granary" },
    ];

    const moveUp = moveCityQueueItem(city.id, 2, "up", gameState);
    expect(moveUp.ok).toBe(true);
    expect(city.queue).toEqual([
      { kind: "unit", id: "warrior" },
      { kind: "building", id: "granary" },
      { kind: "unit", id: "settler" },
    ]);

    const moveDown = moveCityQueueItem(city.id, 0, "down", gameState);
    expect(moveDown.ok).toBe(true);
    expect(city.queue).toEqual([
      { kind: "building", id: "granary" },
      { kind: "unit", id: "warrior" },
      { kind: "unit", id: "settler" },
    ]);

    const cannotMovePastTop = moveCityQueueItem(city.id, 0, "up", gameState);
    expect(cannotMovePastTop.ok).toBe(false);
    expect(cannotMovePastTop.reason).toBe("queue-move-out-of-range");
  });

  it("consumes player queue front item after successful production", () => {
    const gameState = createInitialGameState({ seed: 445 });
    gameState.units = [];
    gameState.cities = [createCity("player-city-1", "player", 2, 2)];
    gameState.cities[0].queue = [
      { kind: "unit", id: "warrior" },
      { kind: "unit", id: "settler" },
    ];
    ensureLocalPassableArea(gameState, 2, 2);

    gameState.economy.player.foodStock = 0;
    gameState.economy.player.productionStock = 20;
    gameState.economy.player.sciencePerTurn = 0;

    const firstTurn = processTurn(gameState, "player");
    expect(firstTurn.produced.length).toBe(1);
    expect(gameState.cities[0].queue).toEqual([{ kind: "unit", id: "settler" }]);

    const secondTurn = processTurn(gameState, "player");
    expect(secondTurn.produced.length).toBe(1);
    expect(gameState.cities[0].queue).toEqual([]);
  });

  it("does not auto-refill enemy empty queues inside city turn processing", () => {
    const gameState = createInitialGameState({ seed: 446 });
    gameState.units = [];
    gameState.cities = [createCity("enemy-city-1", "enemy", 2, 2)];
    gameState.cities[0].queue = [];
    ensureLocalPassableArea(gameState, 2, 2);
    gameState.unlocks.units = ["warrior", "settler"];

    gameState.economy.enemy.foodStock = 0;
    gameState.economy.enemy.productionStock = 100;
    gameState.economy.enemy.sciencePerTurn = 0;

    const result = processTurn(gameState, "enemy");
    expect(result.produced.length).toBe(0);
    expect(gameState.cities[0].queue).toEqual([]);
  });

  it("processes city economy for arbitrary AI owners in expanded rosters", () => {
    const gameState = createInitialGameState({ seed: 18446, aiFactionCount: 5, mapWidth: 24, mapHeight: 24 });
    const dynamicAiOwner = gameState.factions.aiOwners.find((owner) => owner !== "enemy" && owner !== "purple");
    expect(dynamicAiOwner).toBeTruthy();
    if (!dynamicAiOwner) {
      return;
    }
    const dynamicSettler = gameState.units.find((unit) => unit.owner === dynamicAiOwner && unit.type === "settler");
    expect(dynamicSettler).toBeTruthy();
    if (!dynamicSettler) {
      return;
    }

    const founded = foundCity(dynamicSettler.id, gameState);
    expect(founded.ok).toBe(true);
    const city = gameState.cities.find((candidate) => candidate.id === founded.cityId);
    expect(city).toBeTruthy();
    if (!city) {
      return;
    }
    city.queue = [{ kind: "unit", id: "warrior" }];
    gameState.economy[dynamicAiOwner].foodStock = 0;
    gameState.economy[dynamicAiOwner].productionStock = 12;
    gameState.economy[dynamicAiOwner].sciencePerTurn = 0;

    for (const owner of gameState.factions.allOwners) {
      expect(gameState.economy[owner]).toBeTruthy();
    }

    const result = processTurn(gameState, dynamicAiOwner);
    expect(result.produced.length).toBeGreaterThan(0);
    expect(gameState.units.some((unit) => unit.owner === dynamicAiOwner && unit.type === "warrior")).toBe(true);
    expect(gameState.economy[dynamicAiOwner].productionStock).toBeLessThan(12);
  });

  it("produces buildings from the shared queue and blocks duplicates per city", () => {
    const gameState = createInitialGameState({ seed: 447 });
    gameState.units = [];
    gameState.cities = [createCity("player-city-1", "player", 2, 2)];
    ensureLocalPassableArea(gameState, 2, 2);
    gameState.cities[0].queue = [];

    const enqueue = enqueueCityBuilding("player-city-1", "granary", gameState);
    expect(enqueue.ok).toBe(true);

    const duplicateQueued = enqueueCityBuilding("player-city-1", "granary", gameState);
    expect(duplicateQueued.ok).toBe(false);
    expect(duplicateQueued.reason).toBe("building-already-queued");

    gameState.economy.player.foodStock = 0;
    gameState.economy.player.productionStock = 20;
    gameState.economy.player.sciencePerTurn = 0;

    const result = processTurn(gameState, "player");
    expect(result.produced.some((entry) => entry.includes("building:granary"))).toBe(true);

    const city = gameState.cities[0];
    expect(city.buildings).toContain("granary");
    expect(city.specialization).toBe("agricultural");
    expect(city.yieldLastTurn.food).toBeGreaterThanOrEqual(3);

    const duplicateBuilt = enqueueCityBuilding("player-city-1", "granary", gameState);
    expect(duplicateBuilt.ok).toBe(false);
    expect(duplicateBuilt.reason).toBe("building-already-built");
  });

  it("derives specialization from building priority (scholarly > industrial > agricultural)", () => {
    const gameState = createInitialGameState({ seed: 448 });
    gameState.units = [];
    gameState.cities = [createCity("player-city-1", "player", 2, 2)];
    ensureLocalPassableArea(gameState, 2, 2);
    const city = gameState.cities[0];
    city.buildings = ["granary"];

    processTurn(gameState, "player");
    expect(city.specialization).toBe("agricultural");

    city.buildings.push("workshop");
    processTurn(gameState, "player");
    expect(city.specialization).toBe("industrial");

    city.buildings.push("monument");
    processTurn(gameState, "player");
    expect(city.specialization).toBe("scholarly");
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
    gameState.economy.player.sciencePerTurn = 0;

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
    workedHexes: [{ q, r }],
    yieldLastTurn: { food: 0, production: 0, science: 0 },
    identity: "balanced",
    specialization: "balanced",
    growthProgress: 0,
    health: 12,
    maxHealth: 12,
    productionTab: "units",
    buildings: [],
    queue: [{ kind: "unit", id: "warrior" }],
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
