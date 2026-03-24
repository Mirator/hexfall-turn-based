import { describe, expect, it } from "vitest";
import { createInitialGameState, getCityById, getUnitById } from "../../src/core/gameState.js";
import { foundCity } from "../../src/systems/citySystem.js";
import {
  canAttack,
  canAttackCity,
  resolveAttack,
  resolveCityAttack,
  resolveCityOutcome,
} from "../../src/systems/combatSystem.js";

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

    const canAttackResult = canAttack(playerSettler.id, enemySettler.id, gameState);
    expect(canAttackResult.ok).toBe(true);

    const hpBefore = enemySettler.health;
    const attackResult = resolveAttack(playerSettler.id, enemySettler.id, gameState);
    expect(attackResult.ok).toBe(true);
    expect(enemySettler.health).toBeLessThan(hpBefore);
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
    enemySettler.health = 1;

    const attackResult = resolveAttack(playerSettler.id, enemySettler.id, gameState);
    expect(attackResult.ok).toBe(true);
    expect(attackResult.targetDefeated).toBe(true);
    expect(getUnitById(gameState, enemySettler.id)).toBeNull();
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

  it("applies AI capture-first-city policy on defeated cities", () => {
    const gameState = createInitialGameState({ seed: 904 });
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
      focus: "balanced",
      workedHexes: [{ q: Math.max(0, playerCity.q - 2), r: playerCity.r }],
      yieldLastTurn: { food: 0, production: 0, science: 0 },
      identity: "balanced",
      growthProgress: 0,
      health: 12,
      maxHealth: 12,
      queue: ["warrior"],
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
