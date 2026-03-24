import Phaser from "../core/phaserRuntime.js";
import { COLORS, HEX_SIZE } from "../core/constants.js";
import { gameEvents } from "../core/eventBus.js";
import { cloneGameState, createInitialGameState, getCityAt, getUnitAt, getUnitById, isInsideMap } from "../core/gameState.js";
import { axialKey, axialToWorld, worldToAxial } from "../core/hexGrid.js";
import { TERRAIN } from "../core/terrainData.js";
import { foundCity } from "../systems/citySystem.js";
import { getAttackableTargets, resolveAttack } from "../systems/combatSystem.js";
import { runEnemyTurn } from "../systems/enemyTurnSystem.js";
import { getReachable, moveUnit } from "../systems/movementSystem.js";
import { advanceResearch, cycleResearch, selectResearch } from "../systems/researchSystem.js";
import { beginEnemyTurn, beginPlayerTurn } from "../systems/turnSystem.js";
import { evaluateMatchState } from "../systems/victorySystem.js";
import { cycleCityQueue, processTurn as processCityTurn } from "../systems/citySystem.js";

const SQRT_3 = Math.sqrt(3);

export class WorldScene extends Phaser.Scene {
  constructor() {
    super("WorldScene");

    this.gameState = createInitialGameState();
    this.reachableHexes = [];
    this.reachableLookup = new Set();
    this.attackableTargets = [];
    this.attackableLookup = new Set();
    this.mapOrigin = { x: 0, y: 0 };
    this.manualTimeMs = 0;
    this.enemyTurnTimer = null;
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.worldBackground);

    this.mapGraphics = this.add.graphics();
    this.reachableGraphics = this.add.graphics();
    this.attackableGraphics = this.add.graphics();
    this.selectionGraphics = this.add.graphics();
    this.cityGraphics = this.add.graphics();
    this.unitGraphics = this.add.graphics();

    this.input.on("pointerdown", this.handlePointerDown, this);
    this.scale.on("resize", this.handleResize, this);
    gameEvents.on("end-turn-requested", this.handleEndTurnRequested, this);
    gameEvents.on("found-city-requested", this.handleFoundCityRequested, this);
    gameEvents.on("research-cycle-requested", this.handleResearchCycleRequested, this);
    gameEvents.on("city-queue-cycle-requested", this.handleCityQueueCycleRequested, this);
    gameEvents.on("restart-match-requested", this.handleRestartRequested, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.handlePointerDown, this);
      this.scale.off("resize", this.handleResize, this);
      gameEvents.off("end-turn-requested", this.handleEndTurnRequested, this);
      gameEvents.off("found-city-requested", this.handleFoundCityRequested, this);
      gameEvents.off("research-cycle-requested", this.handleResearchCycleRequested, this);
      gameEvents.off("city-queue-cycle-requested", this.handleCityQueueCycleRequested, this);
      gameEvents.off("restart-match-requested", this.handleRestartRequested, this);
      if (this.enemyTurnTimer) {
        this.enemyTurnTimer.remove(false);
        this.enemyTurnTimer = null;
      }
    });

    this.recalculateOrigin();
    this.evaluateAndPublish();
  }

  handleResize(gameSize) {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.recalculateOrigin();
    this.renderAll();
  }

  handlePointerDown(pointer) {
    if (!this.canAcceptPlayerCommands()) {
      return;
    }

    const worldPoint = pointer.positionToCamera(this.cameras.main);
    const clickedHex = worldToAxial(worldPoint.x, worldPoint.y, HEX_SIZE, this.mapOrigin.x, this.mapOrigin.y);
    if (!isInsideMap(this.gameState.map, clickedHex.q, clickedHex.r)) {
      this.clearSelection();
      return;
    }

    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    const clickedUnit = getUnitAt(this.gameState, clickedHex.q, clickedHex.r);
    const clickedCity = getCityAt(this.gameState, clickedHex.q, clickedHex.r);

    if (selectedUnit && clickedUnit && clickedUnit.owner !== selectedUnit.owner) {
      const attackResult = resolveAttack(selectedUnit.id, clickedUnit.id, this.gameState);
      if (attackResult.ok) {
        this.evaluateAndPublish();
      }
      return;
    }

    if (selectedUnit && this.reachableLookup.has(axialKey(clickedHex))) {
      const moveResult = moveUnit(selectedUnit.id, clickedHex, this.gameState);
      if (moveResult.ok) {
        this.evaluateAndPublish();
      }
      return;
    }

    if (clickedUnit && clickedUnit.owner === "player") {
      this.selectUnit(clickedUnit.id);
      return;
    }

    if (clickedCity && clickedCity.owner === "player") {
      this.selectCity(clickedCity.id);
      return;
    }

    this.clearSelection();
  }

  handleEndTurnRequested = () => {
    if (!this.canAcceptPlayerCommands() || this.enemyTurnTimer) {
      return;
    }

    this.enterEnemyPhase();
  };

  handleFoundCityRequested = () => {
    if (!this.canAcceptPlayerCommands()) {
      return;
    }
    const selectedUnitId = this.gameState.selectedUnitId;
    if (!selectedUnitId) {
      return;
    }
    const result = foundCity(selectedUnitId, this.gameState);
    if (result.ok) {
      this.evaluateAndPublish();
    }
  };

  handleResearchCycleRequested = () => {
    if (this.gameState.match.status !== "ongoing") {
      return;
    }
    cycleResearch(this.gameState);
    this.evaluateAndPublish();
  };

  handleCityQueueCycleRequested = () => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }
    const result = cycleCityQueue(this.gameState.selectedCityId, this.gameState);
    if (result.ok) {
      this.evaluateAndPublish();
    }
  };

  handleRestartRequested = () => {
    if (this.enemyTurnTimer) {
      this.enemyTurnTimer.remove(false);
      this.enemyTurnTimer = null;
    }
    this.gameState = createInitialGameState();
    this.manualTimeMs = 0;
    this.evaluateAndPublish();
  };

  enterEnemyPhase() {
    beginEnemyTurn(this.gameState);
    this.evaluateAndPublish();

    this.enemyTurnTimer = this.time.delayedCall(320, () => {
      this.resolveEnemyAndAdvanceTurn();
      this.enemyTurnTimer = null;
    });
  }

  resolveEnemyAndAdvanceTurn() {
    runEnemyTurn(this.gameState);
    beginPlayerTurn(this.gameState);
    processCityTurn(this.gameState, "player");

    const playerCities = this.gameState.cities.filter((city) => city.owner === "player");
    const researchIncome = 1 + playerCities.length;
    advanceResearch(this.gameState, researchIncome);

    evaluateMatchState(this.gameState);
    this.evaluateAndPublish();
  }

  canAcceptPlayerCommands() {
    return this.gameState.turnState.phase === "player" && this.gameState.match.status === "ongoing";
  }

  selectUnit(unitId) {
    this.gameState.selectedUnitId = unitId;
    this.gameState.selectedCityId = null;
    this.evaluateAndPublish();
  }

  selectCity(cityId) {
    this.gameState.selectedCityId = cityId;
    this.gameState.selectedUnitId = null;
    this.evaluateAndPublish();
  }

  clearSelection() {
    if (!this.gameState.selectedUnitId && !this.gameState.selectedCityId) {
      return;
    }
    this.gameState.selectedUnitId = null;
    this.gameState.selectedCityId = null;
    this.evaluateAndPublish();
  }

  refreshActionHints() {
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (!selectedUnit || !this.canAcceptPlayerCommands() || selectedUnit.owner !== "player") {
      this.reachableHexes = [];
      this.reachableLookup = new Set();
      this.attackableTargets = [];
      this.attackableLookup = new Set();
      return;
    }

    this.reachableHexes = getReachable(selectedUnit.id, this.gameState);
    this.reachableLookup = new Set(this.reachableHexes.map((hex) => axialKey(hex)));
    this.attackableTargets = getAttackableTargets(selectedUnit.id, this.gameState);
    this.attackableLookup = new Set(this.attackableTargets.map((unit) => axialKey(unit)));
  }

  evaluateAndPublish() {
    evaluateMatchState(this.gameState);
    this.refreshActionHints();
    this.renderAll();
    this.publishState();
  }

  publishState() {
    gameEvents.emit("state-changed", this.getGameStateSnapshot());
  }

  getGameStateSnapshot() {
    return cloneGameState(this.gameState);
  }

  recalculateOrigin() {
    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;
    const hexWidth = SQRT_3 * HEX_SIZE;
    const mapWidth = hexWidth * this.gameState.map.width + hexWidth * 0.5 * (this.gameState.map.height - 1);
    const mapHeight = HEX_SIZE * 1.5 * (this.gameState.map.height - 1) + HEX_SIZE * 2;

    this.mapOrigin.x = (viewportWidth - mapWidth) / 2 + hexWidth / 2;
    this.mapOrigin.y = (viewportHeight - mapHeight) / 2 + HEX_SIZE;
  }

  hexToWorld(q, r) {
    return axialToWorld({ q, r }, HEX_SIZE, this.mapOrigin.x, this.mapOrigin.y);
  }

  renderAll() {
    this.renderMap();
    this.renderReachable();
    this.renderAttackable();
    this.renderSelection();
    this.renderCities();
    this.renderUnits();
  }

  renderMap() {
    this.mapGraphics.clear();

    for (const tile of this.gameState.map.tiles) {
      const center = this.hexToWorld(tile.q, tile.r);
      const terrainDefinition = TERRAIN[tile.terrainType];
      drawHex(this.mapGraphics, center.x, center.y, HEX_SIZE, terrainDefinition.fillColor, 1, COLORS.tileStroke, 1.2);
    }
  }

  renderReachable() {
    this.reachableGraphics.clear();
    for (const hex of this.reachableHexes) {
      const center = this.hexToWorld(hex.q, hex.r);
      drawHex(
        this.reachableGraphics,
        center.x,
        center.y,
        HEX_SIZE * 0.93,
        COLORS.reachableFill,
        0.42,
        COLORS.reachableStroke,
        1
      );
    }
  }

  renderAttackable() {
    this.attackableGraphics.clear();
    for (const unit of this.attackableTargets) {
      const center = this.hexToWorld(unit.q, unit.r);
      drawHex(
        this.attackableGraphics,
        center.x,
        center.y,
        HEX_SIZE * 0.92,
        COLORS.attackableFill,
        0.44,
        COLORS.attackableStroke,
        1.4
      );
    }
  }

  renderSelection() {
    this.selectionGraphics.clear();

    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (selectedUnit) {
      const unitCenter = this.hexToWorld(selectedUnit.q, selectedUnit.r);
      drawHex(this.selectionGraphics, unitCenter.x, unitCenter.y, HEX_SIZE * 1.02, undefined, 0, COLORS.selectedStroke, 3);
    }

    const selectedCity = this.gameState.cities.find((city) => city.id === this.gameState.selectedCityId);
    if (selectedCity) {
      const cityCenter = this.hexToWorld(selectedCity.q, selectedCity.r);
      this.selectionGraphics.lineStyle(3, COLORS.selectedStroke, 1);
      this.selectionGraphics.strokeRect(cityCenter.x - 18, cityCenter.y - 18, 36, 36);
    }
  }

  renderCities() {
    this.cityGraphics.clear();
    for (const city of this.gameState.cities) {
      const center = this.hexToWorld(city.q, city.r);
      const fillColor = city.owner === "enemy" ? COLORS.cityEnemy : COLORS.cityPlayer;
      this.cityGraphics.fillStyle(fillColor, 0.95);
      this.cityGraphics.fillRect(center.x - 13, center.y - 13, 26, 26);
      this.cityGraphics.lineStyle(2, COLORS.cityStroke, 1);
      this.cityGraphics.strokeRect(center.x - 13, center.y - 13, 26, 26);
    }
  }

  renderUnits() {
    this.unitGraphics.clear();
    for (const unit of this.gameState.units) {
      const center = this.hexToWorld(unit.q, unit.r);
      const fillColor = unit.owner === "enemy" ? COLORS.enemyUnit : COLORS.playerUnit;
      const strokeColor = unit.owner === "enemy" ? COLORS.enemyUnitStroke : COLORS.playerUnitStroke;
      this.unitGraphics.fillStyle(fillColor, 1);
      this.unitGraphics.fillCircle(center.x, center.y, HEX_SIZE * 0.4);
      this.unitGraphics.lineStyle(2, strokeColor, 1);
      this.unitGraphics.strokeCircle(center.x, center.y, HEX_SIZE * 0.4);

      const hpRatio = Math.max(0, unit.health / unit.maxHealth);
      this.unitGraphics.fillStyle(0x202020, 0.7);
      this.unitGraphics.fillRect(center.x - 14, center.y + HEX_SIZE * 0.47, 28, 4);
      this.unitGraphics.fillStyle(0x8dd575, 1);
      this.unitGraphics.fillRect(center.x - 14, center.y + HEX_SIZE * 0.47, 28 * hpRatio, 4);
    }
  }

  manualAdvanceTime(ms) {
    this.manualTimeMs += Math.max(0, ms);
  }

  renderGameToText() {
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    const terrainSummary = this.gameState.map.tiles.reduce(
      (summary, tile) => {
        summary[tile.terrainType] = (summary[tile.terrainType] ?? 0) + 1;
        return summary;
      },
      /** @type {Record<string, number>} */ ({})
    );

    const payload = {
      coordinateSystem: "Axial coordinates: q increases down-right, r increases down.",
      turn: this.gameState.turnState.turn,
      phase: this.gameState.turnState.phase,
      map: {
        width: this.gameState.map.width,
        height: this.gameState.map.height,
        terrainSummary,
      },
      match: {
        status: this.gameState.match.status,
        reason: this.gameState.match.reason,
        holdTurnsTarget: this.gameState.match.holdTurnsTarget,
      },
      selectedUnitId: this.gameState.selectedUnitId,
      selectedCityId: this.gameState.selectedCityId,
      selectedUnitMovementRemaining: selectedUnit ? selectedUnit.movementRemaining : null,
      selectedUnitHasActed: selectedUnit ? selectedUnit.hasActed : null,
      reachableHexes: this.reachableHexes.map((hex) => ({ q: hex.q, r: hex.r, cost: hex.cost })),
      attackableTargets: this.attackableTargets.map((unit) => ({ id: unit.id, q: unit.q, r: unit.r })),
      units: this.gameState.units.map((unit) => ({
        id: unit.id,
        owner: unit.owner,
        type: unit.type,
        q: unit.q,
        r: unit.r,
        health: unit.health,
        maxHealth: unit.maxHealth,
        attack: unit.attack,
        attackRange: unit.attackRange,
        movementRemaining: unit.movementRemaining,
        maxMovement: unit.maxMovement,
        hasActed: unit.hasActed,
      })),
      cities: this.gameState.cities.map((city) => ({
        id: city.id,
        owner: city.owner,
        q: city.q,
        r: city.r,
        population: city.population,
        productionPerTurn: city.productionPerTurn,
        storedProduction: city.storedProduction,
        queue: [...city.queue],
      })),
      research: {
        activeTechId: this.gameState.research.activeTechId,
        progress: this.gameState.research.progress,
        completedTechIds: [...this.gameState.research.completedTechIds],
      },
      unlocks: {
        units: [...this.gameState.unlocks.units],
      },
      simulatedTimeMs: this.manualTimeMs,
    };
    return JSON.stringify(payload);
  }

  // Test-oriented helpers used through window.__hexfallTest
  testSelectUnit(unitId) {
    if (!getUnitById(this.gameState, unitId)) {
      return false;
    }
    this.selectUnit(unitId);
    return true;
  }

  testMoveSelected(q, r) {
    const unitId = this.gameState.selectedUnitId;
    if (!unitId) {
      return false;
    }
    const result = moveUnit(unitId, { q, r }, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return true;
  }

  testAttackTarget(targetId) {
    const unitId = this.gameState.selectedUnitId;
    if (!unitId) {
      return false;
    }
    const result = resolveAttack(unitId, targetId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return true;
  }

  testFoundCity() {
    const selectedUnitId = this.gameState.selectedUnitId;
    if (!selectedUnitId) {
      return false;
    }
    const result = foundCity(selectedUnitId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return true;
  }

  testCycleResearch() {
    cycleResearch(this.gameState);
    this.evaluateAndPublish();
    return this.gameState.research.activeTechId;
  }

  testSelectResearch(techId) {
    const result = selectResearch(techId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return true;
  }

  testEndTurnImmediate() {
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }
    beginEnemyTurn(this.gameState);
    this.evaluateAndPublish();
    this.resolveEnemyAndAdvanceTurn();
    return true;
  }
}

function drawHex(graphics, x, y, size, fillColor, fillAlpha, strokeColor, strokeWidth) {
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = Phaser.Math.DegToRad(60 * i - 30);
    points.push(new Phaser.Math.Vector2(x + size * Math.cos(angle), y + size * Math.sin(angle)));
  }

  graphics.lineStyle(strokeWidth, strokeColor, 1);
  if (typeof fillColor === "number" && fillAlpha > 0) {
    graphics.fillStyle(fillColor, fillAlpha);
    graphics.fillPoints(points, true);
  }
  graphics.strokePoints(points, true);
}
