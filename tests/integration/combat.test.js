import { describe, expect, it } from "vitest";
import { createInitialGameState, getCityById, getUnitById } from "../../src/core/gameState.js";
import { applyTerrainDefinition } from "../../src/core/terrainData.js";
import { getUnitDefinition } from "../../src/core/unitData.js";
import { foundCity } from "../../src/systems/citySystem.js";
import {
  canAttack,
  canAttackCity,
  previewAttack,
  previewCityAttack,
  resolveAttack,
  resolveCityAttack,
  resolveCityOutcome,
} from "../../src/systems/combatSystem.js";

function setTerrain(gameState, q, r, terrainType) {
  const tile = gameState.map.tiles.find((candidate) => candidate.q === q && candidate.r === r);
  expect(tile).toBeTruthy();
  if (!tile) {
    return;
  }
  applyTerrainDefinition(tile, terrainType);
}

function applyUnitType(unit, type) {
  const definition = getUnitDefinition(type);
  expect(definition).toBeTruthy();
  if (!definition) {
    return;
  }
  unit.type = type;
  unit.health = definition.maxHealth;
  unit.maxHealth = definition.maxHealth;
  unit.attack = definition.attack;
  unit.armor = definition.armor;
  unit.attackRange = definition.attackRange;
  unit.minAttackRange = definition.minAttackRange;
  unit.maxMovement = definition.maxMovement;
  unit.movementRemaining = definition.maxMovement;
  unit.role = definition.role;
  unit.hasActed = false;
}

describe("combat system", () => {
  it("allows adjacent unit attacks and reduces health", () => {
    const gameState = createInitialGameState({ seed: 901 });
    const playerSettler = gameState.units.find((unit) => unit.owner === "player");
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy");

    expect(playerSettler).toBeTruthy();
    expect(enemySettler).toBeTruthy();
    if (!playerSettler || !enemySettler) {
      return;
    }

    playerSettler.q = 3;
    playerSettler.r = 2;
    enemySettler.q = 4;
    enemySettler.r = 2;
    setTerrain(gameState, playerSettler.q, playerSettler.r, "plains");
    setTerrain(gameState, enemySettler.q, enemySettler.r, "plains");

    const canAttackResult = canAttack(playerSettler.id, enemySettler.id, gameState);
    expect(canAttackResult.ok).toBe(true);

    const hpBefore = enemySettler.health;
    const attackerHpBefore = playerSettler.health;
    const attackResult = resolveAttack(playerSettler.id, enemySettler.id, gameState);
    expect(attackResult.ok).toBe(true);
    expect(enemySettler.health).toBeLessThan(hpBefore);
    expect(attackResult.breakdown?.damage).toBe(1);
    expect(attackResult.counterattack?.triggered).toBe(true);
    expect(playerSettler.health).toBeLessThan(attackerHpBefore);
  });

  it("removes defeated units", () => {
    const gameState = createInitialGameState({ seed: 902 });
    const playerSettler = gameState.units.find((unit) => unit.owner === "player");
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy");

    expect(playerSettler).toBeTruthy();
    expect(enemySettler).toBeTruthy();
    if (!playerSettler || !enemySettler) {
      return;
    }

    playerSettler.q = 3;
    playerSettler.r = 2;
    enemySettler.q = 4;
    enemySettler.r = 2;
    setTerrain(gameState, playerSettler.q, playerSettler.r, "plains");
    setTerrain(gameState, enemySettler.q, enemySettler.r, "plains");
    enemySettler.health = 1;

    const attackResult = resolveAttack(playerSettler.id, enemySettler.id, gameState);
    expect(attackResult.ok).toBe(true);
    expect(attackResult.targetDefeated).toBe(true);
    expect(getUnitById(gameState, enemySettler.id)).toBeNull();
  });

  it("enforces min and max attack range gates", () => {
    const gameState = createInitialGameState({ seed: 905 });
    const playerSettler = gameState.units.find((unit) => unit.owner === "player");
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy");
    expect(playerSettler && enemySettler).toBeTruthy();
    if (!playerSettler || !enemySettler) {
      return;
    }

    applyUnitType(playerSettler, "archer");
    playerSettler.q = 2;
    playerSettler.r = 2;
    enemySettler.q = 3;
    enemySettler.r = 2;

    expect(canAttack(playerSettler.id, enemySettler.id, gameState)).toEqual({ ok: false, reason: "out-of-range" });

    enemySettler.q = 4;
    enemySettler.r = 2;
    expect(canAttack(playerSettler.id, enemySettler.id, gameState)).toEqual({ ok: true });
  });

  it("applies role, terrain, and armor modifiers in damage formula", () => {
    const gameState = createInitialGameState({ seed: 906 });
    const attacker = gameState.units.find((unit) => unit.owner === "player");
    const defender = gameState.units.find((unit) => unit.owner === "enemy");
    expect(attacker && defender).toBeTruthy();
    if (!attacker || !defender) {
      return;
    }

    applyUnitType(attacker, "warrior");
    applyUnitType(defender, "archer");
    attacker.q = 3;
    attacker.r = 3;
    defender.q = 4;
    defender.r = 3;
    setTerrain(gameState, attacker.q, attacker.r, "hill");
    setTerrain(gameState, defender.q, defender.r, "forest");

    const result = resolveAttack(attacker.id, defender.id, gameState);
    expect(result.ok).toBe(true);
    expect(result.breakdown).toMatchObject({
      baseAttack: 4,
      roleBonus: 1,
      terrainAttackBonus: 1,
      defenderArmor: 0,
      terrainDefenseBonus: 1,
      rawDamage: 5,
      damage: 5,
    });
    expect(result.damage).toBe(5);
    expect(result.counterattack).toMatchObject({
      triggered: false,
      reason: "out-of-range",
    });
  });

  it("applies one-step counterattack when defender can attack back", () => {
    const gameState = createInitialGameState({ seed: 907 });
    const attacker = gameState.units.find((unit) => unit.owner === "player");
    const defender = gameState.units.find((unit) => unit.owner === "enemy");
    expect(attacker && defender).toBeTruthy();
    if (!attacker || !defender) {
      return;
    }

    applyUnitType(attacker, "warrior");
    applyUnitType(defender, "spearman");
    attacker.q = 3;
    attacker.r = 3;
    defender.q = 4;
    defender.r = 3;
    setTerrain(gameState, attacker.q, attacker.r, "plains");
    setTerrain(gameState, defender.q, defender.r, "plains");

    const result = resolveAttack(attacker.id, defender.id, gameState);
    expect(result.ok).toBe(true);
    expect(result.damage).toBe(2);
    expect(defender.health).toBe(10);
    expect(result.counterattack).toMatchObject({
      triggered: true,
      damage: 5,
      attackerDefeated: false,
    });
    expect(result.counterattack?.breakdown).toMatchObject({
      baseAttack: 5,
      roleBonus: 1,
      terrainAttackBonus: 0,
      defenderArmor: 1,
      terrainDefenseBonus: 0,
      rawDamage: 5,
      damage: 5,
    });
    expect(attacker.health).toBe(5);
  });

  it("removes attacker when a counterattack defeats it", () => {
    const gameState = createInitialGameState({ seed: 908 });
    const attacker = gameState.units.find((unit) => unit.owner === "player");
    const defender = gameState.units.find((unit) => unit.owner === "enemy");
    expect(attacker && defender).toBeTruthy();
    if (!attacker || !defender) {
      return;
    }

    applyUnitType(attacker, "warrior");
    applyUnitType(defender, "spearman");
    attacker.q = 3;
    attacker.r = 3;
    defender.q = 4;
    defender.r = 3;
    setTerrain(gameState, attacker.q, attacker.r, "plains");
    setTerrain(gameState, defender.q, defender.r, "plains");
    attacker.health = 1;

    const result = resolveAttack(attacker.id, defender.id, gameState);
    expect(result.ok).toBe(true);
    expect(result.counterattack?.triggered).toBe(true);
    expect(result.attackerDefeated).toBe(true);
    expect(getUnitById(gameState, attacker.id)).toBeNull();
  });

  it("applies terrain defense bonus to cities", () => {
    const gameState = createInitialGameState({ seed: 909 });
    const playerUnit = gameState.units.find((unit) => unit.owner === "player");
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy");
    expect(playerUnit && enemySettler).toBeTruthy();
    if (!playerUnit || !enemySettler) {
      return;
    }

    const enemyFound = foundCity(enemySettler.id, gameState);
    expect(enemyFound.ok).toBe(true);
    if (!enemyFound.cityId) {
      return;
    }
    const city = getCityById(gameState, enemyFound.cityId);
    expect(city).toBeTruthy();
    if (!city) {
      return;
    }

    applyUnitType(playerUnit, "warrior");
    playerUnit.q = city.q - 1;
    playerUnit.r = city.r;
    setTerrain(gameState, playerUnit.q, playerUnit.r, "plains");
    setTerrain(gameState, city.q, city.r, "forest");

    const result = resolveCityAttack(playerUnit.id, city.id, gameState);
    expect(result.ok).toBe(true);
    expect(result.damage).toBe(3);
    expect(result.breakdown).toMatchObject({
      baseAttack: 4,
      roleBonus: 0,
      terrainAttackBonus: 0,
      defenderArmor: 0,
      terrainDefenseBonus: 1,
      rawDamage: 3,
      damage: 3,
    });
  });

  it("previewAttack matches resolver damage/counter without mutating state", () => {
    const gameState = createInitialGameState({ seed: 910 });
    const attacker = gameState.units.find((unit) => unit.owner === "player");
    const defender = gameState.units.find((unit) => unit.owner === "enemy");
    expect(attacker && defender).toBeTruthy();
    if (!attacker || !defender) {
      return;
    }

    applyUnitType(attacker, "warrior");
    applyUnitType(defender, "spearman");
    attacker.q = 3;
    attacker.r = 3;
    defender.q = 4;
    defender.r = 3;
    setTerrain(gameState, attacker.q, attacker.r, "hill");
    setTerrain(gameState, defender.q, defender.r, "forest");

    const defenderHpBefore = defender.health;
    const attackerHpBefore = attacker.health;
    const prediction = previewAttack(attacker.id, defender.id, gameState);
    expect(prediction.ok).toBe(true);
    expect(defender.health).toBe(defenderHpBefore);
    expect(attacker.health).toBe(attackerHpBefore);

    const result = resolveAttack(attacker.id, defender.id, gameState);
    expect(result.ok).toBe(true);
    expect(result.damage).toBe(prediction.damage);
    expect(result.breakdown).toEqual(prediction.breakdown);
    expect(result.counterattack?.triggered).toBe(prediction.counterattack?.triggered);
    if (result.counterattack?.triggered) {
      expect(result.counterattack?.damage).toBe(prediction.counterattack?.damage);
      expect(result.counterattack?.breakdown).toEqual(prediction.counterattack?.breakdown);
    } else {
      expect(result.counterattack?.reason).toBe(prediction.counterattack?.reason);
    }
  });

  it("previewCityAttack matches city resolver damage without mutating state", () => {
    const gameState = createInitialGameState({ seed: 911 });
    const attacker = gameState.units.find((unit) => unit.owner === "player");
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy");
    expect(attacker && enemySettler).toBeTruthy();
    if (!attacker || !enemySettler) {
      return;
    }

    const founded = foundCity(enemySettler.id, gameState);
    expect(founded.ok).toBe(true);
    if (!founded.cityId) {
      return;
    }

    const city = getCityById(gameState, founded.cityId);
    expect(city).toBeTruthy();
    if (!city) {
      return;
    }

    applyUnitType(attacker, "warrior");
    const adjacentHex =
      [
        { q: city.q - 1, r: city.r },
        { q: city.q + 1, r: city.r },
        { q: city.q, r: city.r - 1 },
        { q: city.q, r: city.r + 1 },
      ].find((hex) => gameState.map.tiles.some((tile) => tile.q === hex.q && tile.r === hex.r)) ?? null;
    expect(adjacentHex).toBeTruthy();
    if (!adjacentHex) {
      return;
    }
    attacker.q = adjacentHex.q;
    attacker.r = adjacentHex.r;
    setTerrain(gameState, attacker.q, attacker.r, "hill");
    setTerrain(gameState, city.q, city.r, "forest");

    const cityHpBefore = city.health;
    const prediction = previewCityAttack(attacker.id, city.id, gameState);
    expect(prediction.ok).toBe(true);
    expect(city.health).toBe(cityHpBefore);

    const result = resolveCityAttack(attacker.id, city.id, gameState);
    expect(result.ok).toBe(true);
    expect(result.damage).toBe(prediction.damage);
    expect(result.breakdown).toEqual(prediction.breakdown);
  });

  it("supports city assault and player capture/raze resolution", () => {
    const gameState = createInitialGameState({ seed: 903 });
    const playerSettler = gameState.units.find((unit) => unit.owner === "player");
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy");
    expect(playerSettler && enemySettler).toBeTruthy();
    if (!playerSettler || !enemySettler) {
      return;
    }

    const enemyFound = foundCity(enemySettler.id, gameState);
    expect(enemyFound.ok).toBe(true);
    if (!enemyFound.cityId) {
      return;
    }

    const city = getCityById(gameState, enemyFound.cityId);
    expect(city).toBeTruthy();
    if (!city) {
      return;
    }

    playerSettler.q = city.q - 1;
    playerSettler.r = city.r;
    playerSettler.hasActed = false;
    playerSettler.movementRemaining = playerSettler.maxMovement;
    city.health = 1;

    const canAttackResult = canAttackCity(playerSettler.id, city.id, gameState);
    expect(canAttackResult.ok).toBe(true);

    const attackResult = resolveCityAttack(playerSettler.id, city.id, gameState);
    expect(attackResult.ok).toBe(true);
    expect(attackResult.cityDefeated).toBe(true);
    expect(attackResult.pendingResolution).toBe(true);
    expect(gameState.pendingCityResolution?.cityId).toBe(city.id);

    const captureResult = resolveCityOutcome(city.id, "capture", gameState);
    expect(captureResult.ok).toBe(true);
    expect(getCityById(gameState, city.id)?.owner).toBe("player");
    expect(getCityById(gameState, city.id)?.health).toBe(getCityById(gameState, city.id)?.maxHealth);
    expect(gameState.pendingCityResolution).toBeNull();

    // Also validate raze flow against the same city id.
    gameState.pendingCityResolution = {
      cityId: city.id,
      attackerOwner: "player",
      defenderOwner: "enemy",
      choices: ["capture", "raze"],
    };
    const razeResult = resolveCityOutcome(city.id, "raze", gameState);
    expect(razeResult.ok).toBe(true);
    expect(getCityById(gameState, city.id)).toBeNull();
  });

  it("applies raider capture-first-city policy on defeated cities", () => {
    const gameState = createInitialGameState({ seed: 904, enemyPersonality: "raider" });
    const playerSettler = gameState.units.find((unit) => unit.owner === "player");
    const enemySettler = gameState.units.find((unit) => unit.owner === "enemy");
    expect(playerSettler && enemySettler).toBeTruthy();
    if (!playerSettler || !enemySettler) {
      return;
    }

    const playerFound = foundCity(playerSettler.id, gameState);
    expect(playerFound.ok).toBe(true);
    if (!playerFound.cityId) {
      return;
    }
    const playerCity = getCityById(gameState, playerFound.cityId);
    expect(playerCity).toBeTruthy();
    if (!playerCity) {
      return;
    }

    enemySettler.q = playerCity.q + 1;
    enemySettler.r = playerCity.r;
    enemySettler.hasActed = false;
    enemySettler.movementRemaining = enemySettler.maxMovement;
    playerCity.health = 1;

    const firstAttack = resolveCityAttack(enemySettler.id, playerCity.id, gameState);
    expect(firstAttack.ok).toBe(true);
    expect(firstAttack.outcomeChoice).toBe("capture");
    expect(getCityById(gameState, playerCity.id)?.owner).toBe("enemy");

    // Add a second player city and verify the next defeat is razed.
    const secondCity = {
      id: "player-city-manual",
      owner: "player",
      q: Math.max(0, playerCity.q - 2),
      r: playerCity.r,
      population: 1,
      workedHexes: [{ q: Math.max(0, playerCity.q - 2), r: playerCity.r }],
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
    gameState.cities.push(secondCity);
    enemySettler.q = secondCity.q + 1;
    enemySettler.r = secondCity.r;
    enemySettler.hasActed = false;
    enemySettler.movementRemaining = enemySettler.maxMovement;
    secondCity.health = 1;

    const secondAttack = resolveCityAttack(enemySettler.id, secondCity.id, gameState);
    expect(secondAttack.ok).toBe(true);
    expect(secondAttack.outcomeChoice).toBe("raze");
    expect(getCityById(gameState, secondCity.id)).toBeNull();
  });
});
