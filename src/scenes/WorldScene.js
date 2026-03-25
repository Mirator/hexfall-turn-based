import Phaser from "../core/phaserRuntime.js";
import { COLORS, HEX_SIZE } from "../core/constants.js";
import { gameEvents } from "../core/eventBus.js";
import {
  cloneGameState,
  createInitialGameState,
  DEFAULT_MIN_FACTION_DISTANCE,
  getCityAt,
  getTileAt,
  getUnitAt,
  getUnitById,
  isInsideMap,
} from "../core/gameState.js";
import { axialKey, axialToWorld, neighbors, worldToAxial } from "../core/hexGrid.js";
import { TERRAIN } from "../core/terrainData.js";
import {
  CITY_QUEUE_MAX,
  computeCityYield,
  enqueueCityBuilding,
  enqueueCityQueue,
  enqueueCityQueueItem,
  foundCity,
  getFoundCityReasonText,
  removeCityQueueAt,
  setCityFocus,
  setCityProductionTab,
  processTurn as processCityTurn,
} from "../systems/citySystem.js";
import {
  getAttackableCities,
  getAttackableTargets,
  resolveAttack,
  resolveCityAttack,
  resolveCityOutcome,
} from "../systems/combatSystem.js";
import { ensureEnemyAiState, normalizeEnemyPersonality, runEnemyTurn } from "../systems/enemyTurnSystem.js";
import { getReachable, moveUnit } from "../systems/movementSystem.js";
import { consumeScienceStock, cycleResearch, selectResearch } from "../systems/researchSystem.js";
import { beginEnemyTurn, beginPlayerTurn } from "../systems/turnSystem.js";
import { deriveUiSurface } from "../systems/uiSurfaceSystem.js";
import { getSkipUnitReasonText, skipUnit } from "../systems/unitActionSystem.js";
import { evaluateMatchState } from "../systems/victorySystem.js";

const SQRT_3 = Math.sqrt(3);
const RESTART_MIN_FACTION_DISTANCE = DEFAULT_MIN_FACTION_DISTANCE;

export class WorldScene extends Phaser.Scene {
  constructor() {
    super("WorldScene");

    this.gameState = createInitialGameState({ seed: 1, minFactionDistance: RESTART_MIN_FACTION_DISTANCE });
    this.reachableHexes = [];
    this.reachableLookup = new Set();
    this.attackableTargets = [];
    this.attackableLookup = new Set();
    this.attackableCities = [];
    this.attackableCityLookup = new Set();
    this.mapOrigin = { x: 0, y: 0 };
    this.manualTimeMs = 0;
    this.enemyTurnTimer = null;
    this.foundCityKeyBinding = null;
    this.uiModalOpen = false;
    this.runtimeSeedCounter = 0;
    this.lastCombatEvent = null;
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.worldBackground);
    this.startNewMatch();

    this.mapGraphics = this.add.graphics();
    this.reachableGraphics = this.add.graphics();
    this.attackableGraphics = this.add.graphics();
    this.selectionGraphics = this.add.graphics();
    this.cityGraphics = this.add.graphics();
    this.unitGraphics = this.add.graphics();

    this.input.on("pointerdown", this.handlePointerDown, this);
    this.foundCityKeyBinding = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.F) ?? null;
    this.foundCityKeyBinding?.on("down", this.handleFoundCityRequested, this);
    this.scale.on("resize", this.handleResize, this);
    gameEvents.on("end-turn-requested", this.handleEndTurnRequested, this);
    gameEvents.on("found-city-requested", this.handleFoundCityRequested, this);
    gameEvents.on("research-cycle-requested", this.handleResearchCycleRequested, this);
    gameEvents.on("unit-action-requested", this.handleUnitActionRequested, this);
    gameEvents.on("city-focus-set-requested", this.handleCityFocusSetRequested, this);
    gameEvents.on("city-production-tab-set-requested", this.handleCityProductionTabSetRequested, this);
    gameEvents.on("city-queue-enqueue-requested", this.handleCityQueueEnqueueRequested, this);
    gameEvents.on("city-queue-remove-requested", this.handleCityQueueRemoveRequested, this);
    gameEvents.on("city-outcome-requested", this.handleCityOutcomeRequested, this);
    gameEvents.on("restart-match-requested", this.handleRestartRequested, this);
    gameEvents.on("ui-modal-state-changed", this.handleUiModalStateChanged, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.handlePointerDown, this);
      this.foundCityKeyBinding?.off("down", this.handleFoundCityRequested, this);
      this.scale.off("resize", this.handleResize, this);
      gameEvents.off("end-turn-requested", this.handleEndTurnRequested, this);
      gameEvents.off("found-city-requested", this.handleFoundCityRequested, this);
      gameEvents.off("research-cycle-requested", this.handleResearchCycleRequested, this);
      gameEvents.off("unit-action-requested", this.handleUnitActionRequested, this);
      gameEvents.off("city-focus-set-requested", this.handleCityFocusSetRequested, this);
      gameEvents.off("city-production-tab-set-requested", this.handleCityProductionTabSetRequested, this);
      gameEvents.off("city-queue-enqueue-requested", this.handleCityQueueEnqueueRequested, this);
      gameEvents.off("city-queue-remove-requested", this.handleCityQueueRemoveRequested, this);
      gameEvents.off("city-outcome-requested", this.handleCityOutcomeRequested, this);
      gameEvents.off("restart-match-requested", this.handleRestartRequested, this);
      gameEvents.off("ui-modal-state-changed", this.handleUiModalStateChanged, this);
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
        this.handleUnitAttackResult(selectedUnit, clickedUnit, attackResult);
        this.evaluateAndPublish();
      }
      return;
    }

    if (selectedUnit && clickedCity && clickedCity.owner !== selectedUnit.owner) {
      if (!this.attackableCityLookup.has(clickedCity.id)) {
        return;
      }
      const cityAttackResult = resolveCityAttack(selectedUnit.id, clickedCity.id, this.gameState);
      if (cityAttackResult.ok) {
        this.recordCityAttackEvent(selectedUnit, clickedCity, cityAttackResult);
        this.handleCityAttackResult(cityAttackResult);
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
      return false;
    }
    const selectedUnitId = this.gameState.selectedUnitId;
    if (!selectedUnitId) {
      gameEvents.emit("ui-toast-requested", {
        message: getFoundCityReasonText("unit-not-found"),
        level: "warning",
      });
      return false;
    }
    const result = foundCity(selectedUnitId, this.gameState);
    if (result.ok) {
      this.evaluateAndPublish();
      gameEvents.emit("ui-toast-requested", {
        message: "City founded.",
        level: "info",
      });
      return true;
    }
    gameEvents.emit("ui-toast-requested", {
      message: getFoundCityReasonText(result.reason),
      level: "warning",
    });
    return false;
  };

  handleResearchCycleRequested = () => {
    if (this.gameState.match.status !== "ongoing") {
      return;
    }
    cycleResearch(this.gameState);
    this.evaluateAndPublish();
  };

  handleUnitActionRequested = (payload) => {
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }
    const actionId = payload?.actionId;
    if (actionId === "foundCity") {
      return this.handleFoundCityRequested();
    }
    if (actionId === "skipUnit") {
      const selectedUnitId = this.gameState.selectedUnitId;
      if (!selectedUnitId) {
        gameEvents.emit("ui-toast-requested", {
          message: getSkipUnitReasonText("unit-not-found"),
          level: "warning",
        });
        return false;
      }
      const result = skipUnit(selectedUnitId, this.gameState);
      if (!result.ok) {
        gameEvents.emit("ui-toast-requested", {
          message: getSkipUnitReasonText(result.reason),
          level: "warning",
        });
        return false;
      }
      this.evaluateAndPublish();
      gameEvents.emit("ui-toast-requested", {
        message: "Unit is waiting this turn.",
        level: "info",
      });
      return true;
    }
    return false;
  };

  handleCityFocusSetRequested = (payload) => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }

    const focus = payload?.focus;
    if (focus !== "balanced" && focus !== "food" && focus !== "production" && focus !== "science") {
      return;
    }

    const result = setCityFocus(this.gameState.selectedCityId, focus, this.gameState);
    if (result.ok) {
      this.evaluateAndPublish();
      gameEvents.emit("ui-toast-requested", {
        message: `City focus: ${result.focus}.`,
        level: "info",
      });
      return;
    }
    gameEvents.emit("ui-toast-requested", {
      message: "Could not set city focus.",
      level: "warning",
    });
  };

  handleCityProductionTabSetRequested = (payload) => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }

    const tab = payload?.tab;
    if (tab !== "units" && tab !== "buildings") {
      return;
    }

    const result = setCityProductionTab(this.gameState.selectedCityId, tab, this.gameState);
    if (result.ok) {
      this.evaluateAndPublish();
      gameEvents.emit("ui-toast-requested", {
        message: `Production tab: ${tab}.`,
        level: "info",
      });
      return;
    }

    gameEvents.emit("ui-toast-requested", {
      message: "Could not switch production tab.",
      level: "warning",
    });
  };

  handleCityQueueEnqueueRequested = (payload) => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }

    const queueItem = normalizeIncomingQueueItem(payload);
    if (!queueItem) {
      return;
    }

    const result = enqueueCityQueueItem(this.gameState.selectedCityId, queueItem, this.gameState);
    if (!result.ok) {
      const message = this.getQueueFailureMessage(result.reason);
      gameEvents.emit("ui-toast-requested", {
        message,
        level: "warning",
      });
      this.evaluateAndPublish();
      return;
    }

    this.evaluateAndPublish();
    const queuedLabel =
      queueItem.kind === "building" ? `${capitalizeLabel(queueItem.id)} building` : `${capitalizeLabel(queueItem.id)} unit`;
    gameEvents.emit("ui-toast-requested", {
      message: `${queuedLabel} added to queue (${result.queue?.length ?? 0}/${CITY_QUEUE_MAX}).`,
      level: "info",
    });
  };

  handleCityQueueRemoveRequested = (payload) => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }

    const slotIndex = Number(payload?.index);
    const result = removeCityQueueAt(this.gameState.selectedCityId, slotIndex, this.gameState);
    if (!result.ok) {
      gameEvents.emit("ui-toast-requested", {
        message: "Could not remove queue item.",
        level: "warning",
      });
      return;
    }

    this.evaluateAndPublish();
    gameEvents.emit("ui-toast-requested", {
      message: "Queue item removed.",
      level: "info",
    });
  };

  handleCityOutcomeRequested = (payload) => {
    const cityId = this.gameState.pendingCityResolution?.cityId;
    if (!cityId) {
      return;
    }

    const choice = payload?.choice;
    if (choice !== "capture" && choice !== "raze") {
      return;
    }

    const result = resolveCityOutcome(cityId, choice, this.gameState);
    if (!result.ok) {
      gameEvents.emit("ui-toast-requested", {
        message: "Could not resolve city outcome.",
        level: "warning",
      });
      this.evaluateAndPublish();
      return;
    }

    const message = choice === "capture" ? "City captured." : "City razed.";
    gameEvents.emit("ui-toast-requested", {
      message,
      level: "info",
    });
    this.evaluateAndPublish();
  };

  handleRestartRequested = () => {
    if (this.enemyTurnTimer) {
      this.enemyTurnTimer.remove(false);
      this.enemyTurnTimer = null;
    }
    const previousLayout = this.captureLayoutFingerprint(this.gameState);
    this.startNewMatch(previousLayout);
    this.evaluateAndPublish();
    gameEvents.emit("ui-notifications-reset-requested");
    gameEvents.emit("ui-toast-requested", {
      message: "Match restarted.",
      level: "info",
    });
  };

  handleUiModalStateChanged = (isOpen) => {
    this.uiModalOpen = !!isOpen;
    this.publishState();
  };

  getQueueFailureMessage(reason) {
    if (reason === "queue-full") {
      return `Queue is full (${CITY_QUEUE_MAX}/${CITY_QUEUE_MAX}). Remove one item first.`;
    }
    if (reason === "unit-not-unlocked") {
      return "That unit is not unlocked yet.";
    }
    if (reason === "building-not-unlocked") {
      return "That building is not unlocked yet.";
    }
    if (reason === "building-already-built") {
      return "This building already exists in the city.";
    }
    if (reason === "building-already-queued") {
      return "This building is already queued.";
    }
    if (reason === "invalid-unit-type" || reason === "invalid-building-id" || reason === "invalid-queue-item") {
      return "That queue item is not valid.";
    }
    if (reason === "city-not-found") {
      return "Select a city first.";
    }
    return "Could not add item to queue.";
  }

  startNewMatch(previousLayout = null) {
    let nextState = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const seed = this.generateRuntimeSeed();
      const candidate = createInitialGameState({
        seed,
        minFactionDistance: RESTART_MIN_FACTION_DISTANCE,
      });
      if (!previousLayout || !this.matchesLayout(candidate, previousLayout)) {
        nextState = candidate;
        break;
      }
    }

    this.gameState =
      nextState ??
      createInitialGameState({
        seed: this.generateRuntimeSeed(),
        minFactionDistance: RESTART_MIN_FACTION_DISTANCE,
      });
    ensureEnemyAiState(this.gameState);
    this.uiModalOpen = false;
    this.manualTimeMs = 0;
    this.lastCombatEvent = null;
  }

  generateRuntimeSeed() {
    this.runtimeSeedCounter += 1;
    const randomBits = Math.floor(Math.random() * 0xffffffff);
    const value = (Date.now() ^ randomBits ^ Math.imul(this.runtimeSeedCounter, 0x9e3779b1)) >>> 0;
    return value === 0 ? 1 : value;
  }

  captureLayoutFingerprint(gameState) {
    const unitPositions = gameState.units
      .map((unit) => `${unit.id}:${unit.q},${unit.r}`)
      .sort()
      .join("|");

    return {
      seed: gameState.map.seed,
      terrainHash: this.computeTerrainHash(gameState.map.tiles),
      unitPositions,
    };
  }

  matchesLayout(nextState, previousLayout) {
    const nextUnitPositions = nextState.units
      .map((unit) => `${unit.id}:${unit.q},${unit.r}`)
      .sort()
      .join("|");

    return (
      nextState.map.seed === previousLayout.seed &&
      this.computeTerrainHash(nextState.map.tiles) === previousLayout.terrainHash &&
      nextUnitPositions === previousLayout.unitPositions
    );
  }

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
    processCityTurn(this.gameState, "enemy");
    beginPlayerTurn(this.gameState);
    const cityTurnResult = processCityTurn(this.gameState, "player");
    consumeScienceStock(this.gameState, "player", 1);
    this.gameState.economy.researchIncomeThisTurn = 1 + cityTurnResult.researchIncome;

    evaluateMatchState(this.gameState);
    this.evaluateAndPublish();
  }

  handleUnitAttackResult(attacker, target, attackResult) {
    if (!attackResult.ok) {
      return;
    }

    this.lastCombatEvent = {
      type: "unit",
      attackerId: attacker.id,
      targetId: target.id,
      damage: attackResult.damage ?? 0,
      targetDefeated: !!attackResult.targetDefeated,
      attackerDefeated: !!attackResult.attackerDefeated,
      breakdown: attackResult.breakdown ?? null,
      counterattack: attackResult.counterattack ?? null,
      turn: this.gameState.turnState.turn,
      phase: this.gameState.turnState.phase,
    };

    const summary = formatCombatBreakdownSummary(attackResult.breakdown);
    const counterSummary = formatCounterattackSummary(attackResult.counterattack);
    const message =
      `Hit ${target.id} for ${attackResult.damage ?? 0}${summary}.` +
      `${attackResult.targetDefeated ? " Target defeated." : ""}${counterSummary}`;
    gameEvents.emit("ui-toast-requested", {
      message,
      level: "info",
    });
  }

  recordCityAttackEvent(attacker, city, attackResult) {
    this.lastCombatEvent = {
      type: "city",
      attackerId: attacker.id,
      targetId: city.id,
      damage: attackResult.damage ?? 0,
      cityDefeated: !!attackResult.cityDefeated,
      breakdown: attackResult.breakdown ?? null,
      outcomeChoice: attackResult.outcomeChoice ?? null,
      turn: this.gameState.turnState.turn,
      phase: this.gameState.turnState.phase,
    };

    const summary = formatCombatBreakdownSummary(attackResult.breakdown);
    gameEvents.emit("ui-toast-requested", {
      message: `City attack dealt ${attackResult.damage ?? 0}${summary}.`,
      level: "info",
    });
  }

  handleCityAttackResult(attackResult) {
    if (!attackResult.cityDefeated) {
      return;
    }

    if (attackResult.pendingResolution) {
      gameEvents.emit("ui-toast-requested", {
        message: "City defenses broken. Choose Capture or Raze.",
        level: "info",
      });
      return;
    }

    if (attackResult.outcomeChoice === "capture") {
      gameEvents.emit("ui-toast-requested", {
        message: "Enemy captured a city.",
        level: "warning",
      });
      return;
    }

    if (attackResult.outcomeChoice === "raze") {
      gameEvents.emit("ui-toast-requested", {
        message: "Enemy razed a city.",
        level: "warning",
      });
    }
  }

  canAcceptPlayerCommands() {
    return (
      this.gameState.turnState.phase === "player" &&
      this.gameState.match.status === "ongoing" &&
      !this.uiModalOpen &&
      !this.gameState.pendingCityResolution
    );
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
      this.attackableCities = [];
      this.attackableCityLookup = new Set();
      return;
    }

    this.reachableHexes = getReachable(selectedUnit.id, this.gameState);
    this.reachableLookup = new Set(this.reachableHexes.map((hex) => axialKey(hex)));
    this.attackableTargets = getAttackableTargets(selectedUnit.id, this.gameState);
    this.attackableLookup = new Set(this.attackableTargets.map((unit) => axialKey(unit)));
    this.attackableCities = getAttackableCities(selectedUnit.id, this.gameState);
    this.attackableCityLookup = new Set(this.attackableCities.map((city) => city.id));
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
    const snapshot = cloneGameState(this.gameState);
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    const selectedCity = this.gameState.cities.find((city) => city.id === this.gameState.selectedCityId) ?? null;
    const projectedIncome = this.getProjectedPlayerIncome();
    const projectedNetIncome = this.getProjectedPlayerNetIncome();
    const uiSurface = deriveUiSurface(
      this.gameState,
      selectedUnit,
      selectedCity,
      this.attackableTargets,
      this.attackableCities,
      {
      restartConfirmOpen: this.uiModalOpen,
      pendingCityResolution: this.gameState.pendingCityResolution,
    }
    );
    const uiRuntime = this.getUiRuntimeState();
    return {
      ...snapshot,
      projectedIncome,
      projectedNetIncome,
      selectedInfo: this.buildSelectedInfo(selectedUnit, selectedCity),
      contextMenu: this.buildContextMenuPayload(uiSurface, selectedUnit, selectedCity),
      uiHints: uiSurface.uiHints,
      uiActions: uiSurface.uiActions,
      uiModalOpen: this.uiModalOpen,
      pauseMenu: {
        open: uiRuntime.pauseMenuOpen,
        restartConfirmOpen: uiRuntime.restartConfirmOpen,
      },
      uiNotifications: uiRuntime.notifications,
      lastCombatEvent: this.lastCombatEvent,
    };
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

    for (const city of this.attackableCities) {
      const center = this.hexToWorld(city.q, city.r);
      drawHex(
        this.attackableGraphics,
        center.x,
        center.y,
        HEX_SIZE * 0.9,
        COLORS.attackableFill,
        0.24,
        COLORS.attackableStroke,
        1.8
      );
      this.attackableGraphics.lineStyle(2, COLORS.attackableStroke, 1);
      this.attackableGraphics.strokeRect(center.x - 16, center.y - 16, 32, 32);
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

      const hpRatio = Math.max(0, city.health / city.maxHealth);
      this.cityGraphics.fillStyle(0x202020, 0.72);
      this.cityGraphics.fillRect(center.x - 14, center.y + 17, 28, 4);
      this.cityGraphics.fillStyle(0xb8df8f, 1);
      this.cityGraphics.fillRect(center.x - 14, center.y + 17, 28 * hpRatio, 4);
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
    const selectedCity = this.gameState.cities.find((city) => city.id === this.gameState.selectedCityId) ?? null;
    const projectedIncome = this.getProjectedPlayerIncome();
    const projectedNetIncome = this.getProjectedPlayerNetIncome();
    const uiSurface = deriveUiSurface(
      this.gameState,
      selectedUnit,
      selectedCity,
      this.attackableTargets,
      this.attackableCities,
      {
        restartConfirmOpen: this.uiModalOpen,
        pendingCityResolution: this.gameState.pendingCityResolution,
      }
    );
    const terrainSummary = this.gameState.map.tiles.reduce(
      (summary, tile) => {
        summary[tile.terrainType] = (summary[tile.terrainType] ?? 0) + 1;
        return summary;
      },
      /** @type {Record<string, number>} */ ({})
    );
    const uiRuntime = this.getUiRuntimeState();
    const playerEconomy = this.gameState.economy.player;

    const payload = {
      coordinateSystem: "Axial coordinates: q increases down-right, r increases down.",
      turn: this.gameState.turnState.turn,
      phase: this.gameState.turnState.phase,
      map: {
        width: this.gameState.map.width,
        height: this.gameState.map.height,
        seed: this.gameState.map.seed,
        terrainHash: this.computeTerrainHash(this.gameState.map.tiles),
        terrainSummary,
        spawnMetadata: this.gameState.map.spawnMetadata,
      },
      match: {
        status: this.gameState.match.status,
        reason: this.gameState.match.reason,
      },
      selectedUnitId: this.gameState.selectedUnitId,
      selectedCityId: this.gameState.selectedCityId,
      selectedUnitMovementRemaining: selectedUnit ? selectedUnit.movementRemaining : null,
      selectedUnitHasActed: selectedUnit ? selectedUnit.hasActed : null,
      reachableHexes: this.reachableHexes.map((hex) => ({ q: hex.q, r: hex.r, cost: hex.cost })),
      attackableTargets: this.attackableTargets.map((unit) => ({ id: unit.id, q: unit.q, r: unit.r })),
      attackableCities: this.attackableCities.map((city) => ({ id: city.id, q: city.q, r: city.r })),
      units: this.gameState.units.map((unit) => ({
        id: unit.id,
        owner: unit.owner,
        type: unit.type,
        q: unit.q,
        r: unit.r,
        health: unit.health,
        maxHealth: unit.maxHealth,
        attack: unit.attack,
        armor: unit.armor,
        attackRange: unit.attackRange,
        minAttackRange: unit.minAttackRange,
        role: unit.role,
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
        focus: city.focus,
        identity: city.identity,
        specialization: city.specialization,
        growthProgress: city.growthProgress,
        health: city.health,
        maxHealth: city.maxHealth,
        productionTab: city.productionTab,
        buildings: [...(city.buildings ?? [])],
        yieldLastTurn: city.yieldLastTurn,
        workedHexes: city.workedHexes.map((hex) => ({ q: hex.q, r: hex.r })),
        queue: city.queue.map((item) =>
          typeof item === "string" ? { kind: "unit", id: item } : { kind: item.kind, id: item.id }
        ),
      })),
      pendingCityResolution: this.gameState.pendingCityResolution
        ? {
            cityId: this.gameState.pendingCityResolution.cityId,
            attackerOwner: this.gameState.pendingCityResolution.attackerOwner,
            defenderOwner: this.gameState.pendingCityResolution.defenderOwner,
            choices: [...this.gameState.pendingCityResolution.choices],
          }
        : null,
      research: {
        activeTechId: this.gameState.research.activeTechId,
        progress: this.gameState.research.progress,
        completedTechIds: [...this.gameState.research.completedTechIds],
      },
      economy: {
        researchIncomeThisTurn: this.gameState.economy.researchIncomeThisTurn,
        player: this.gameState.economy.player,
        enemy: this.gameState.economy.enemy,
      },
      ai: {
        enemy: {
          personality: this.gameState.ai?.enemy?.personality ?? null,
          lastGoal: this.gameState.ai?.enemy?.lastGoal ?? null,
          lastTurnSummary: this.gameState.ai?.enemy?.lastTurnSummary ?? null,
        },
      },
      hudTopLeft: {
        turnLabel: `Turn ${this.gameState.turnState.turn} - ${this.gameState.turnState.phase === "enemy" ? "Enemy" : "Player"}`,
        resources: {
          food: { current: playerEconomy.foodStock, delta: projectedNetIncome.food, grossDelta: projectedIncome.food },
          production: {
            current: playerEconomy.productionStock,
            delta: projectedNetIncome.production,
            grossDelta: projectedIncome.production,
          },
          science: { current: playerEconomy.scienceStock, delta: projectedNetIncome.science, grossDelta: projectedIncome.science },
        },
      },
      selectedInfo: this.buildSelectedInfo(selectedUnit, selectedCity),
      contextMenu: this.buildContextMenuPayload(uiSurface, selectedUnit, selectedCity),
      pauseMenu: {
        open: uiRuntime.pauseMenuOpen,
        restartConfirmOpen: uiRuntime.restartConfirmOpen,
      },
      uiNotifications: uiRuntime.notifications,
      unlocks: {
        units: [...this.gameState.unlocks.units],
      },
      uiHints: uiSurface.uiHints,
      uiActions: uiSurface.uiActions,
      uiModalOpen: this.uiModalOpen,
      simulatedTimeMs: this.manualTimeMs,
      lastCombatEvent: this.lastCombatEvent,
    };
    return JSON.stringify(payload);
  }

  getProjectedPlayerIncome() {
    const projected = {
      food: 0,
      production: 0,
      science: 1,
    };
    for (const city of this.gameState.cities) {
      if (city.owner !== "player") {
        continue;
      }
      const cityYield = computeCityYield(city.id, this.gameState);
      projected.food += cityYield.food;
      projected.production += cityYield.production;
      projected.science += cityYield.science;
    }
    return projected;
  }

  getProjectedPlayerNetIncome() {
    const simulation = cloneGameState(this.gameState);
    const before = simulation.economy.player;
    const beforeFood = before.foodStock;
    const beforeProduction = before.productionStock;
    const beforeScience = before.scienceStock;

    processCityTurn(simulation, "player");
    consumeScienceStock(simulation, "player", 1);

    const after = simulation.economy.player;
    return {
      food: after.foodStock - beforeFood,
      production: after.productionStock - beforeProduction,
      science: after.scienceStock - beforeScience,
    };
  }

  buildSelectedInfo(selectedUnit, selectedCity) {
    if (selectedUnit) {
      return {
        kind: "unit",
        id: selectedUnit.id,
        type: selectedUnit.type,
        health: selectedUnit.health,
        maxHealth: selectedUnit.maxHealth,
        movementRemaining: selectedUnit.movementRemaining,
        maxMovement: selectedUnit.maxMovement,
        hasActed: selectedUnit.hasActed,
        attack: selectedUnit.attack,
        armor: selectedUnit.armor,
        minAttackRange: selectedUnit.minAttackRange,
        attackRange: selectedUnit.attackRange,
        role: selectedUnit.role,
      };
    }
    if (selectedCity) {
      return {
        kind: "city",
        id: selectedCity.id,
        owner: selectedCity.owner,
        population: selectedCity.population,
        health: selectedCity.health,
        maxHealth: selectedCity.maxHealth,
        focus: selectedCity.focus,
        identity: selectedCity.identity,
        specialization: selectedCity.specialization,
        productionTab: selectedCity.productionTab,
        buildings: [...(selectedCity.buildings ?? [])],
        yieldLastTurn: selectedCity.yieldLastTurn,
        queue: selectedCity.queue.map((item) =>
          typeof item === "string" ? { kind: "unit", id: item } : { kind: item.kind, id: item.id }
        ),
      };
    }
    return { kind: "none" };
  }

  buildContextMenuPayload(uiSurface, selectedUnit, selectedCity) {
    const menuType = uiSurface.uiActions.contextMenuType;
    if (menuType === "city" && selectedCity) {
      return {
        type: "city",
        cityId: selectedCity.id,
        queueMax: uiSurface.uiActions.cityQueueMax,
        queue: selectedCity.queue.map((item) =>
          typeof item === "string" ? { kind: "unit", id: item } : { kind: item.kind, id: item.id }
        ),
        cityProductionTab: uiSurface.uiActions.cityProductionTab,
        canSetCityFocus: uiSurface.uiActions.canSetCityFocus,
        canSetCityProductionTab: uiSurface.uiActions.canSetCityProductionTab,
        canQueueProduction: uiSurface.uiActions.canQueueProduction,
        cityQueueReason: uiSurface.uiActions.cityQueueReason,
        cityProductionChoices: uiSurface.uiActions.cityProductionChoices,
        cityBuildingChoices: uiSurface.uiActions.cityBuildingChoices,
      };
    }
    if (menuType === "unit" && selectedUnit) {
      return {
        type: "unit",
        unitId: selectedUnit.id,
        canFoundCity: uiSurface.uiActions.canFoundCity,
        foundCityReason: uiSurface.uiActions.foundCityReason,
        canSkipUnit: uiSurface.uiActions.canSkipUnit,
        skipUnitReason: uiSurface.uiActions.skipUnitReason,
      };
    }
    return { type: "none" };
  }

  getUiRuntimeState() {
    const defaults = {
      pauseMenuOpen: false,
      restartConfirmOpen: false,
      notifications: [],
    };
    if (!this.scene.isActive("UIScene")) {
      return defaults;
    }
    const uiScene = this.scene.get("UIScene");
    if (!uiScene || typeof uiScene.getRuntimeUiState !== "function") {
      return defaults;
    }
    return uiScene.getRuntimeUiState();
  }

  computeTerrainHash(tiles) {
    let hash = 2166136261;
    for (const tile of tiles) {
      const token = `${tile.q},${tile.r}:${tile.terrainType};`;
      for (let i = 0; i < token.length; i += 1) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    }
    return (hash >>> 0).toString(16);
  }

  // Test-oriented helpers used through window.__hexfallTest
  testSelectUnit(unitId) {
    if (!getUnitById(this.gameState, unitId)) {
      return false;
    }
    this.selectUnit(unitId);
    return true;
  }

  testSelectCity(cityId) {
    if (!this.gameState.cities.find((city) => city.id === cityId)) {
      return false;
    }
    this.selectCity(cityId);
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
    const attacker = getUnitById(this.gameState, unitId);
    const target = getUnitById(this.gameState, targetId);
    if (!attacker || !target) {
      return false;
    }
    const result = resolveAttack(unitId, targetId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.handleUnitAttackResult(attacker, target, result);
    this.evaluateAndPublish();
    return true;
  }

  testAttackCity(cityId) {
    const unitId = this.gameState.selectedUnitId;
    if (!unitId) {
      return false;
    }
    const attacker = getUnitById(this.gameState, unitId);
    const city = this.gameState.cities.find((candidate) => candidate.id === cityId);
    if (!attacker || !city) {
      return false;
    }
    const result = resolveCityAttack(unitId, cityId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.recordCityAttackEvent(attacker, city, result);
    this.handleCityAttackResult(result);
    this.evaluateAndPublish();
    return true;
  }

  testChooseCityOutcome(choice) {
    const cityId = this.gameState.pendingCityResolution?.cityId;
    if (!cityId || (choice !== "capture" && choice !== "raze")) {
      return false;
    }
    const result = resolveCityOutcome(cityId, choice, this.gameState);
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

  testCycleCityFocus() {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    const city = this.gameState.cities.find((candidate) => candidate.id === cityId);
    if (!city) {
      return false;
    }
    const focusOrder = ["balanced", "food", "production", "science"];
    const currentIndex = focusOrder.indexOf(city.focus);
    const nextFocus = focusOrder[(currentIndex + 1 + focusOrder.length) % focusOrder.length];
    const result = setCityFocus(
      cityId,
      /** @type {"balanced"|"food"|"production"|"science"} */ (nextFocus),
      this.gameState
    );
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return result.focus;
  }

  testSetCityFocus(focus) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    if (focus !== "balanced" && focus !== "food" && focus !== "production" && focus !== "science") {
      return false;
    }
    const result = setCityFocus(cityId, focus, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return result.focus;
  }

  testEnqueueCityProduction(unitType) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    if (unitType !== "warrior" && unitType !== "settler" && unitType !== "spearman" && unitType !== "archer") {
      return false;
    }
    const result = enqueueCityQueue(cityId, unitType, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return (result.queue ?? []).map((item) => ({ kind: item.kind, id: item.id }));
  }

  testEnqueueCityBuilding(buildingId) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    if (buildingId !== "granary" && buildingId !== "workshop" && buildingId !== "monument") {
      return false;
    }
    const result = enqueueCityBuilding(cityId, buildingId, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return (result.queue ?? []).map((item) => ({ kind: item.kind, id: item.id }));
  }

  testSetCityProductionTab(tab) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    if (tab !== "units" && tab !== "buildings") {
      return false;
    }
    const result = setCityProductionTab(cityId, tab, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return result.tab;
  }

  testRemoveCityQueueAt(index) {
    const cityId = this.gameState.selectedCityId;
    if (!cityId) {
      return false;
    }
    const result = removeCityQueueAt(cityId, index, this.gameState);
    if (!result.ok) {
      return false;
    }
    this.evaluateAndPublish();
    return [...(result.queue ?? [])];
  }

  testCycleResearch() {
    cycleResearch(this.gameState);
    this.evaluateAndPublish();
    return this.gameState.research.activeTechId;
  }

  testTriggerUnitAction(actionId) {
    return this.handleUnitActionRequested({ actionId });
  }

  testSetEnemyPersonality(personality) {
    if (personality !== "raider" && personality !== "expansionist" && personality !== "guardian") {
      return false;
    }
    const aiState = ensureEnemyAiState(this.gameState);
    aiState.personality = normalizeEnemyPersonality(personality, this.gameState.map.seed);
    this.evaluateAndPublish();
    return aiState.personality;
  }

  testGetEnemyAiState() {
    return structuredClone(ensureEnemyAiState(this.gameState));
  }

  testClearEnemyCityQueue(cityId) {
    const targetCity =
      (cityId ? this.gameState.cities.find((city) => city.id === cityId) : this.gameState.cities.find((city) => city.owner === "enemy")) ??
      null;
    if (!targetCity || targetCity.owner !== "enemy") {
      return false;
    }
    targetCity.queue = [];
    this.evaluateAndPublish();
    return true;
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

  testSetUnitPosition(unitId, q, r) {
    const unit = getUnitById(this.gameState, unitId);
    if (!unit || !isInsideMap(this.gameState.map, q, r)) {
      return false;
    }

    const tile = getTileAt(this.gameState.map, q, r);
    if (!tile || tile.blocksMovement || getCityAt(this.gameState, q, r)) {
      return false;
    }

    const occupant = getUnitAt(this.gameState, q, r);
    if (occupant && occupant.id !== unitId) {
      return false;
    }

    unit.q = q;
    unit.r = r;
    this.evaluateAndPublish();
    return true;
  }

  testArrangeCombatSkirmish(playerUnitId, enemyUnitId) {
    const playerUnit = getUnitById(this.gameState, playerUnitId);
    const enemyUnit = getUnitById(this.gameState, enemyUnitId);
    if (!playerUnit || !enemyUnit) {
      return false;
    }

    const ignoredUnits = new Set([playerUnitId, enemyUnitId]);
    for (const tile of this.gameState.map.tiles) {
      if (tile.blocksMovement || getCityAt(this.gameState, tile.q, tile.r)) {
        continue;
      }

      const firstOccupant = getUnitAt(this.gameState, tile.q, tile.r);
      if (firstOccupant && !ignoredUnits.has(firstOccupant.id)) {
        continue;
      }

      for (const adjacent of neighbors(tile)) {
        if (!isInsideMap(this.gameState.map, adjacent.q, adjacent.r)) {
          continue;
        }

        const adjacentTile = getTileAt(this.gameState.map, adjacent.q, adjacent.r);
        if (!adjacentTile || adjacentTile.blocksMovement || getCityAt(this.gameState, adjacent.q, adjacent.r)) {
          continue;
        }

        const secondOccupant = getUnitAt(this.gameState, adjacent.q, adjacent.r);
        if (secondOccupant && !ignoredUnits.has(secondOccupant.id)) {
          continue;
        }

        playerUnit.q = tile.q;
        playerUnit.r = tile.r;
        enemyUnit.q = adjacent.q;
        enemyUnit.r = adjacent.r;
        playerUnit.hasActed = false;
        if (playerUnit.movementRemaining < playerUnit.maxMovement) {
          playerUnit.movementRemaining = playerUnit.maxMovement;
        }

        this.evaluateAndPublish();
        return true;
      }
    }

    return false;
  }
}

function normalizeIncomingQueueItem(payload) {
  if (payload?.queueItem && typeof payload.queueItem === "object") {
    const kind = payload.queueItem.kind;
    const id = payload.queueItem.id;
    if ((kind === "unit" || kind === "building") && typeof id === "string" && id) {
      return { kind, id };
    }
  }

  if (typeof payload?.unitType === "string") {
    return { kind: "unit", id: payload.unitType };
  }

  if (typeof payload?.buildingId === "string") {
    return { kind: "building", id: payload.buildingId };
  }

  return null;
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

function formatCombatBreakdownSummary(breakdown) {
  if (!breakdown) {
    return "";
  }
  const parts = [
    `base ${breakdown.baseAttack}`,
    `role ${formatSignedNumber(breakdown.roleBonus)}`,
    `terrain atk ${formatSignedNumber(breakdown.terrainAttackBonus)}`,
    `armor -${breakdown.defenderArmor}`,
    `terrain def -${breakdown.terrainDefenseBonus}`,
  ];
  return ` (${parts.join(", ")})`;
}

function formatCounterattackSummary(counterattack) {
  if (!counterattack) {
    return "";
  }
  if (!counterattack.triggered) {
    if (counterattack.reason === "out-of-range") {
      return " No counterattack (out of range).";
    }
    if (counterattack.reason === "target-defeated") {
      return " No counterattack (target defeated).";
    }
    return "";
  }
  return ` Counterattack for ${counterattack.damage ?? 0}.`;
}

function formatSignedNumber(value) {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function capitalizeLabel(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
