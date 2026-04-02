import { describe, expect, it } from "vitest";
import { createInitialGameState, getTileAt } from "../../src/core/gameState.js";
import { applyTerrainDefinition } from "../../src/core/terrainData.js";
import { createUnit } from "../../src/core/unitData.js";
import {
  CITY_QUEUE_MAX,
  canRushBuyCityQueueFront,
  enqueueCityBuilding,
  enqueueCityQueue,
  foundCity,
  moveCityQueueItem,
  processTurn,
  removeCityQueueAt,
  rushBuyCityQueueFront,
} from "../../src/systems/citySystem.js";
import { beginPlayerTurn } from "../../src/systems/turnSystem.js";

describe("city system resource rework", () => {
  it("founding initializes city-local growth and production progress fields", () => {
    const gameState = createInitialGameState({ seed: 11 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }

    const result = foundCity(settler.id, gameState);
    expect(result.ok).toBe(true);
    expect(gameState.cities).toHaveLength(1);

    const city = gameState.cities[0];
    expect(city.growthProgress).toBe(0);
    expect(city.productionProgress).toBe(0);
    expect(city.yieldLastTurn).toEqual(expect.objectContaining({ food: expect.any(Number), production: expect.any(Number), gold: expect.any(Number) }));
    expect("storedFood" in city).toBe(false);
    expect("storedProduction" in city).toBe(false);
  });

  it("applies food growth locally per city (no empire food stock sharing)", () => {
    const gameState = createInitialGameState({ seed: 22 });
    gameState.units = [];
    gameState.cities = [
      createCity("player-city-1", "player", 2, 2),
      createCity("player-city-2", "player", 8, 8),
    ];
    ensureLocalPassableArea(gameState, 2, 2);
    ensureLocalPassableArea(gameState, 8, 8);
    gameState.economy.player.goldBalance = 20;

    setTerrain(gameState, 2, 2, "plains"); // food 2
    setTerrain(gameState, 8, 8, "hill"); // food 0

    processTurn(gameState, "player");

    expect(gameState.cities[0].growthProgress).toBe(2);
    expect(gameState.cities[1].growthProgress).toBe(0);
    expect("foodStock" in gameState.economy.player).toBe(false);
  });

  it("applies production progress per city and carries overflow to next queue item", () => {
    const gameState = createInitialGameState({ seed: 33 });
    gameState.units = [];
    gameState.cities = [createCity("player-city-1", "player", 2, 2)];
    const city = gameState.cities[0];
    city.population = 2;
    city.queue = [
      { kind: "unit", id: "warrior" }, // cost 6
      { kind: "unit", id: "settler" }, // cost 8
    ];
    ensureLocalPassableArea(gameState, 2, 2);
    gameState.economy.player.goldBalance = 50;

    // Force 4 production/turn: hill center (2) + one workable hill neighbor (2).
    setTerrain(gameState, 2, 2, "hill");
    setTerrain(gameState, 3, 2, "hill");
    for (const hex of [
      { q: 3, r: 1 },
      { q: 2, r: 1 },
      { q: 1, r: 2 },
      { q: 1, r: 3 },
      { q: 2, r: 3 },
    ]) {
      setTerrain(gameState, hex.q, hex.r, "water");
    }

    const turn1 = processTurn(gameState, "player");
    expect(turn1.produced).toHaveLength(0);
    expect(city.productionProgress).toBe(4);

    const turn2 = processTurn(gameState, "player");
    expect(turn2.produced).toHaveLength(1);
    expect(city.queue).toEqual([{ kind: "unit", id: "settler" }]);
    expect(city.productionProgress).toBe(2);
  });

  it("does not share production between cities (independent city bottlenecks)", () => {
    const gameState = createInitialGameState({ seed: 34 });
    gameState.units = [];
    gameState.cities = [
      createCity("player-city-1", "player", 2, 2),
      createCity("player-city-2", "player", 8, 8),
    ];
    ensureLocalPassableArea(gameState, 2, 2);
    ensureLocalPassableArea(gameState, 8, 8);
    gameState.economy.player.goldBalance = 100;

    setTerrain(gameState, 2, 2, "forest"); // prod 2
    setTerrain(gameState, 8, 8, "forest"); // prod 2

    for (let i = 0; i < 2; i += 1) {
      const result = processTurn(gameState, "player");
      expect(result.produced).toHaveLength(0);
    }

    const third = processTurn(gameState, "player");
    expect(third.produced).toHaveLength(2);
  });

  it("resets front-item production progress when queue front is removed or reordered", () => {
    const gameState = createInitialGameState({ seed: 44 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }
    const founded = foundCity(settler.id, gameState);
    expect(founded.ok).toBe(true);

    const city = gameState.cities[0];
    city.queue = [
      { kind: "unit", id: "warrior" },
      { kind: "unit", id: "settler" },
      { kind: "building", id: "granary" },
    ];
    city.productionProgress = 3;

    const removedFront = removeCityQueueAt(city.id, 0, gameState);
    expect(removedFront.ok).toBe(true);
    expect(city.productionProgress).toBe(0);

    city.queue = [
      { kind: "unit", id: "warrior" },
      { kind: "unit", id: "settler" },
      { kind: "building", id: "granary" },
    ];
    city.productionProgress = 4;
    const movedFront = moveCityQueueItem(city.id, 1, "up", gameState);
    expect(movedFront.ok).toBe(true);
    expect(city.productionProgress).toBe(0);
  });

  it("enforces queue cap and supports remove-by-index compaction", () => {
    const gameState = createInitialGameState({ seed: 45 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }
    expect(foundCity(settler.id, gameState).ok).toBe(true);
    const city = gameState.cities[0];

    city.queue = [];
    expect(enqueueCityQueue(city.id, "warrior", gameState).ok).toBe(true);
    expect(enqueueCityQueue(city.id, "settler", gameState).ok).toBe(true);
    expect(enqueueCityQueue(city.id, "warrior", gameState).ok).toBe(true);
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

  it("applies gold upkeep each turn and tracks gold income/upkeep/net", () => {
    const gameState = createInitialGameState({ seed: 55 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }
    expect(foundCity(settler.id, gameState).ok).toBe(true);
    const city = gameState.cities[0];
    setTerrain(gameState, city.q, city.r, "plains"); // +1 gold from tile

    // Add one extra upkeep source.
    gameState.units.push(
      createUnit({
        id: "player-2",
        owner: "player",
        type: "warrior",
        q: city.q + 1,
        r: city.r,
      })
    );
    gameState.economy.player.goldBalance = 5;

    processTurn(gameState, "player");

    const economy = gameState.economy.player;
    expect(economy.goldIncomeLastTurn).toBeGreaterThanOrEqual(1);
    expect(economy.goldUpkeepLastTurn).toBeGreaterThanOrEqual(1);
    expect(economy.goldNetLastTurn).toBe(economy.goldIncomeLastTurn - economy.goldUpkeepLastTurn);
    expect("productionStock" in economy).toBe(false);
    expect("foodStock" in economy).toBe(false);
  });

  it("keeps one settler active before first city so bootstrap cannot soft-lock", () => {
    const gameState = createInitialGameState({ seed: 56 });
    const playerSettler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(playerSettler).toBeTruthy();
    if (!playerSettler) {
      return;
    }

    playerSettler.hasActed = true;
    playerSettler.movementRemaining = 0;
    gameState.economy.player.goldBalance = 0;

    beginPlayerTurn(gameState);
    processTurn(gameState, "player");

    expect(gameState.economy.player.disabledUnitIds).toEqual([]);
    expect(playerSettler.disabled).toBe(false);
    expect(playerSettler.hasActed).toBe(false);
    expect(playerSettler.movementRemaining).toBe(playerSettler.maxMovement);
  });

  it("allows negative gold and disables units deterministically on deficit", () => {
    const gameState = createInitialGameState({ seed: 66 });
    const playerSettler = gameState.units.find((unit) => unit.id === "player-1");
    expect(playerSettler).toBeTruthy();
    if (!playerSettler) {
      return;
    }

    gameState.units.push(
      createUnit({
        id: "player-2",
        owner: "player",
        type: "warrior",
        q: playerSettler.q + 1,
        r: playerSettler.r,
      })
    );

    gameState.economy.player.goldBalance = 1;
    processTurn(gameState, "player");

    expect(gameState.economy.player.disabledUnitIds).toEqual(["player-2"]);
    const disabledUnit = gameState.units.find((unit) => unit.id === "player-2");
    expect(disabledUnit?.disabled).toBe(true);
    expect(disabledUnit?.hasActed).toBe(true);
    expect(disabledUnit?.movementRemaining).toBe(0);
  });

  it("auto-reactivates disabled units when gold economy recovers", () => {
    const gameState = createInitialGameState({ seed: 67 });
    const playerSettler = gameState.units.find((unit) => unit.id === "player-1");
    expect(playerSettler).toBeTruthy();
    if (!playerSettler) {
      return;
    }

    gameState.units.push(
      createUnit({
        id: "player-2",
        owner: "player",
        type: "warrior",
        q: playerSettler.q + 1,
        r: playerSettler.r,
      })
    );

    gameState.economy.player.goldBalance = 1;
    processTurn(gameState, "player");
    expect(gameState.economy.player.disabledUnitIds).toContain("player-2");

    gameState.economy.player.goldBalance = 5;
    processTurn(gameState, "player");
    expect(gameState.economy.player.disabledUnitIds).toEqual([]);
    expect(gameState.units.find((unit) => unit.id === "player-2")?.disabled).toBe(false);
  });

  it("rush-buy spends gold using remainingProduction*3 and completes front item", () => {
    const gameState = createInitialGameState({ seed: 77 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }
    expect(foundCity(settler.id, gameState).ok).toBe(true);

    const city = gameState.cities[0];
    city.queue = [{ kind: "unit", id: "warrior" }]; // cost 6
    city.productionProgress = 2; // remaining 4 => rush-buy cost 12
    ensureLocalPassableArea(gameState, city.q, city.r);
    gameState.economy.player.goldBalance = 15;

    const canRush = canRushBuyCityQueueFront(city.id, gameState);
    expect(canRush.ok).toBe(true);
    expect(canRush.goldCost).toBe(12);
    expect(canRush.remainingProduction).toBe(4);

    const result = rushBuyCityQueueFront(city.id, gameState);
    expect(result.ok).toBe(true);
    expect(result.goldCost).toBe(12);
    expect(result.produced?.length).toBe(1);
    expect(city.queue).toEqual([]);
    expect(city.productionProgress).toBe(0);
    expect(gameState.economy.player.goldBalance).toBe(3);
  });

  it("rejects rush-buy when gold is insufficient", () => {
    const gameState = createInitialGameState({ seed: 78 });
    const settler = gameState.units.find((unit) => unit.owner === "player" && unit.type === "settler");
    expect(settler).toBeTruthy();
    if (!settler) {
      return;
    }
    expect(foundCity(settler.id, gameState).ok).toBe(true);

    const city = gameState.cities[0];
    city.queue = [{ kind: "unit", id: "warrior" }];
    city.productionProgress = 0;
    gameState.economy.player.goldBalance = 5; // < 6*3

    const check = canRushBuyCityQueueFront(city.id, gameState);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("not-enough-gold");

    const rush = rushBuyCityQueueFront(city.id, gameState);
    expect(rush.ok).toBe(false);
    expect(rush.reason).toBe("not-enough-gold");
  });

  it("produces buildings and blocks duplicate building queue entries", () => {
    const gameState = createInitialGameState({ seed: 88 });
    gameState.units = [];
    gameState.cities = [createCity("player-city-1", "player", 2, 2)];
    ensureLocalPassableArea(gameState, 2, 2);
    const city = gameState.cities[0];
    city.queue = [];
    gameState.economy.player.goldBalance = 30;

    const enqueue = enqueueCityBuilding(city.id, "granary", gameState);
    expect(enqueue.ok).toBe(true);

    const duplicateQueued = enqueueCityBuilding(city.id, "granary", gameState);
    expect(duplicateQueued.ok).toBe(false);
    expect(duplicateQueued.reason).toBe("building-already-queued");
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
    yieldLastTurn: { food: 0, production: 0, gold: 0, science: 0 },
    identity: "balanced",
    specialization: "balanced",
    growthProgress: 0,
    productionProgress: 0,
    health: 12,
    maxHealth: 12,
    productionTab: "units",
    buildings: [],
    campus: {
      built: false,
      adjacency: 0,
      adjacencyBreakdown: {
        mountains: 0,
        forests: 0,
        nearbyCampuses: 0,
      },
    },
    queue: [{ kind: "unit", id: "warrior" }],
  };
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
