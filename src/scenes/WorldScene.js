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
import { axialKey, axialToWorld, distance, neighbors, worldToAxial } from "../core/hexGrid.js";
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
  previewAttack,
  previewCityAttack,
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
const CAMERA_KEYBOARD_PAN_SPEED = 700;

export class WorldScene extends Phaser.Scene {
  constructor() {
    super("WorldScene");

    this.gameState = createInitialGameState({ seed: 1, minFactionDistance: RESTART_MIN_FACTION_DISTANCE });
    this.reachableHexes = [];
    this.reachableLookup = new Set();
    this.reachableCostByKey = new Map();
    this.attackableTargets = [];
    this.attackableLookup = new Set();
    this.attackableCities = [];
    this.attackableCityLookup = new Set();
    this.threatHexes = [];
    this.threatLookup = new Set();
    this.uiPreview = null;
    this.mapOrigin = { x: 0, y: 0 };
    this.manualTimeMs = 0;
    this.enemyTurnTimer = null;
    this.foundCityKeyBinding = null;
    this.nextUnitKeyBinding = null;
    this.cameraPanKeys = null;
    this.uiModalOpen = false;
    this.runtimeSeedCounter = 0;
    this.lastCombatEvent = null;
    this.cameraFocusHex = null;
    this.isRightDraggingCamera = false;
    this.cameraDragLastScreenPos = null;
    this.preventContextMenuHandler = null;
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.worldBackground);
    this.startNewMatch();

    this.mapGraphics = this.add.graphics();
    this.threatGraphics = this.add.graphics();
    this.reachableGraphics = this.add.graphics();
    this.attackableGraphics = this.add.graphics();
    this.previewGraphics = this.add.graphics();
    this.selectionGraphics = this.add.graphics();
    this.cityGraphics = this.add.graphics();
    this.unitGraphics = this.add.graphics();

    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.on("pointermove", this.handlePointerMove, this);
    this.input.on("pointerup", this.handlePointerUp, this);
    this.foundCityKeyBinding = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.F) ?? null;
    this.nextUnitKeyBinding = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.TAB) ?? null;
    this.cameraPanKeys =
      this.input.keyboard?.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        w: Phaser.Input.Keyboard.KeyCodes.W,
        a: Phaser.Input.Keyboard.KeyCodes.A,
        s: Phaser.Input.Keyboard.KeyCodes.S,
        d: Phaser.Input.Keyboard.KeyCodes.D,
      }) ?? null;
    this.foundCityKeyBinding?.on("down", this.handleFoundCityRequested, this);
    this.nextUnitKeyBinding?.on("down", this.handleNextReadyUnitRequested, this);
    if (this.game.canvas) {
      this.preventContextMenuHandler = (event) => event.preventDefault();
      this.game.canvas.addEventListener("contextmenu", this.preventContextMenuHandler);
    }
    this.scale.on("resize", this.handleResize, this);
    gameEvents.on("end-turn-requested", this.handleEndTurnRequested, this);
    gameEvents.on("next-ready-unit-requested", this.handleNextReadyUnitRequested, this);
    gameEvents.on("found-city-requested", this.handleFoundCityRequested, this);
    gameEvents.on("research-cycle-requested", this.handleResearchCycleRequested, this);
    gameEvents.on("unit-action-requested", this.handleUnitActionRequested, this);
    gameEvents.on("city-focus-set-requested", this.handleCityFocusSetRequested, this);
    gameEvents.on("city-production-tab-set-requested", this.handleCityProductionTabSetRequested, this);
    gameEvents.on("city-queue-enqueue-requested", this.handleCityQueueEnqueueRequested, this);
    gameEvents.on("city-queue-remove-requested", this.handleCityQueueRemoveRequested, this);
    gameEvents.on("city-outcome-requested", this.handleCityOutcomeRequested, this);
    gameEvents.on("restart-match-requested", this.handleRestartRequested, this);
    gameEvents.on("notification-focus-requested", this.handleNotificationFocusRequested, this);
    gameEvents.on("ui-modal-state-changed", this.handleUiModalStateChanged, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.handlePointerDown, this);
      this.input.off("pointermove", this.handlePointerMove, this);
      this.input.off("pointerup", this.handlePointerUp, this);
      this.foundCityKeyBinding?.off("down", this.handleFoundCityRequested, this);
      this.nextUnitKeyBinding?.off("down", this.handleNextReadyUnitRequested, this);
      this.scale.off("resize", this.handleResize, this);
      gameEvents.off("end-turn-requested", this.handleEndTurnRequested, this);
      gameEvents.off("next-ready-unit-requested", this.handleNextReadyUnitRequested, this);
      gameEvents.off("found-city-requested", this.handleFoundCityRequested, this);
      gameEvents.off("research-cycle-requested", this.handleResearchCycleRequested, this);
      gameEvents.off("unit-action-requested", this.handleUnitActionRequested, this);
      gameEvents.off("city-focus-set-requested", this.handleCityFocusSetRequested, this);
      gameEvents.off("city-production-tab-set-requested", this.handleCityProductionTabSetRequested, this);
      gameEvents.off("city-queue-enqueue-requested", this.handleCityQueueEnqueueRequested, this);
      gameEvents.off("city-queue-remove-requested", this.handleCityQueueRemoveRequested, this);
      gameEvents.off("city-outcome-requested", this.handleCityOutcomeRequested, this);
      gameEvents.off("restart-match-requested", this.handleRestartRequested, this);
      gameEvents.off("notification-focus-requested", this.handleNotificationFocusRequested, this);
      gameEvents.off("ui-modal-state-changed", this.handleUiModalStateChanged, this);
      if (this.enemyTurnTimer) {
        this.enemyTurnTimer.remove(false);
        this.enemyTurnTimer = null;
      }
      if (this.game.canvas && this.preventContextMenuHandler) {
        this.game.canvas.removeEventListener("contextmenu", this.preventContextMenuHandler);
      }
      this.preventContextMenuHandler = null;
      this.endCameraDrag();
    });

    this.recalculateOrigin();
    this.evaluateAndPublish();
  }

  update(_time, delta) {
    const moved = this.updateKeyboardCameraPan(delta);
    if (moved) {
      this.publishState();
    }
  }

  handleResize(gameSize) {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.recalculateOrigin();
    this.cameras.main.setScroll(0, 0);
    this.cameraFocusHex = null;
    this.endCameraDrag();
    this.renderAll();
  }

  handlePointerDown(pointer) {
    const rightClick = pointer.button === 2 || pointer.rightButtonDown();
    if (rightClick) {
      if (this.canPanCamera()) {
        this.beginCameraDrag(pointer);
      }
      return;
    }
    if (this.isRightDraggingCamera) {
      return;
    }
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
        this.setUiPreview(null);
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
        this.setUiPreview(null);
        this.evaluateAndPublish();
      }
      return;
    }

    if (selectedUnit && this.reachableLookup.has(axialKey(clickedHex))) {
      const moveResult = moveUnit(selectedUnit.id, clickedHex, this.gameState);
      if (moveResult.ok) {
        this.setUiPreview(null);
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

  handlePointerUp(pointer) {
    if (!this.isRightDraggingCamera) {
      return;
    }
    if (pointer.button === 2 || !pointer.rightButtonDown()) {
      this.endCameraDrag();
    }
  }

  handlePointerMove(pointer) {
    if (this.isRightDraggingCamera || pointer.rightButtonDown()) {
      if (!this.canPanCamera()) {
        this.endCameraDrag();
        return;
      }
      if (!this.isRightDraggingCamera) {
        this.beginCameraDrag(pointer);
      }
      const moved = this.updateCameraDrag(pointer);
      if (moved) {
        this.publishState();
      }
      return;
    }

    if (!this.canAcceptPlayerCommands()) {
      if (this.setUiPreview(null)) {
        this.renderAll();
        this.publishState();
      }
      return;
    }

    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (!selectedUnit || selectedUnit.owner !== "player") {
      if (this.setUiPreview(null)) {
        this.renderAll();
        this.publishState();
      }
      return;
    }

    const worldPoint = pointer.positionToCamera(this.cameras.main);
    const hoveredHex = worldToAxial(worldPoint.x, worldPoint.y, HEX_SIZE, this.mapOrigin.x, this.mapOrigin.y);
    if (!isInsideMap(this.gameState.map, hoveredHex.q, hoveredHex.r)) {
      if (this.setUiPreview(null)) {
        this.renderAll();
        this.publishState();
      }
      return;
    }

    const nextPreview = this.buildHoverPreview(selectedUnit, hoveredHex);
    if (this.setUiPreview(nextPreview)) {
      this.renderAll();
      this.publishState();
    }
  }

  handleEndTurnRequested = () => {
    if (!this.canAcceptPlayerCommands() || this.enemyTurnTimer) {
      return;
    }

    this.enterEnemyPhase();
  };

  handleNextReadyUnitRequested = (event) => {
    event?.preventDefault?.();
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }
    const nextReadyUnitId = this.getNextReadyUnitId();
    if (!nextReadyUnitId) {
      this.emitNotification("No ready units available.", {
        level: "warning",
        category: "System",
      });
      return false;
    }

    this.selectUnit(nextReadyUnitId);
    return true;
  };

  handleNotificationFocusRequested = (payload) => {
    const focus = payload?.focus ?? payload;
    const resolved = this.resolveNotificationFocus(focus);
    if (!resolved) {
      this.emitNotification("Cannot focus this notification target anymore.", {
        level: "warning",
        category: "System",
      });
      return false;
    }

    this.focusCameraOnHex(resolved.q, resolved.r);
    this.cameraFocusHex = { q: resolved.q, r: resolved.r };
    this.renderAll();
    this.publishState();
    return true;
  };

  handleFoundCityRequested = () => {
    if (!this.canAcceptPlayerCommands()) {
      return false;
    }
    const selectedUnitId = this.gameState.selectedUnitId;
    if (!selectedUnitId) {
      this.emitNotification(getFoundCityReasonText("unit-not-found"), {
        level: "warning",
        category: "City",
      });
      return false;
    }
    const result = foundCity(selectedUnitId, this.gameState);
    if (result.ok) {
      this.evaluateAndPublish();
      const foundedCity = result.cityId ? this.gameState.cities.find((city) => city.id === result.cityId) : null;
      this.emitNotification("City founded.", {
        level: "info",
        category: "City",
        focus: foundedCity ? { cityId: foundedCity.id, q: foundedCity.q, r: foundedCity.r } : null,
      });
      return true;
    }
    this.emitNotification(getFoundCityReasonText(result.reason), {
      level: "warning",
      category: "City",
      focus: this.buildSelectionFocusPayload(),
    });
    return false;
  };

  handleResearchCycleRequested = () => {
    if (this.gameState.match.status !== "ongoing") {
      return;
    }
    const result = cycleResearch(this.gameState);
    this.evaluateAndPublish();
    if (result.selected) {
      this.emitNotification(`Research selected: ${capitalizeLabel(result.selected)}.`, {
        level: "info",
        category: "Research",
      });
    } else {
      this.emitNotification("No available research right now.", {
        level: "warning",
        category: "Research",
      });
    }
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
        this.emitNotification(getSkipUnitReasonText("unit-not-found"), {
          level: "warning",
          category: "System",
        });
        return false;
      }
      const result = skipUnit(selectedUnitId, this.gameState);
      if (!result.ok) {
        this.emitNotification(getSkipUnitReasonText(result.reason), {
          level: "warning",
          category: "System",
          focus: this.buildSelectionFocusPayload(),
        });
        return false;
      }
      this.evaluateAndPublish();
      this.emitNotification("Unit is waiting this turn.", {
        level: "info",
        category: "System",
        focus: this.buildSelectionFocusPayload(),
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
      const city = this.gameState.cities.find((candidate) => candidate.id === this.gameState.selectedCityId) ?? null;
      this.emitNotification(`City focus: ${result.focus}.`, {
        level: "info",
        category: "City",
        focus: city ? { cityId: city.id, q: city.q, r: city.r } : null,
      });
      return;
    }
    this.emitNotification("Could not set city focus.", {
      level: "warning",
      category: "City",
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
      this.emitNotification(`Production tab: ${tab}.`, {
        level: "info",
        category: "City",
        focus: this.buildSelectionFocusPayload(),
      });
      return;
    }

    this.emitNotification("Could not switch production tab.", {
      level: "warning",
      category: "City",
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
      this.emitNotification(message, {
        level: "warning",
        category: "City",
        focus: this.buildSelectionFocusPayload(),
      });
      this.evaluateAndPublish();
      return;
    }

    this.evaluateAndPublish();
    const queuedLabel =
      queueItem.kind === "building" ? `${capitalizeLabel(queueItem.id)} building` : `${capitalizeLabel(queueItem.id)} unit`;
    this.emitNotification(`${queuedLabel} added to queue (${result.queue?.length ?? 0}/${CITY_QUEUE_MAX}).`, {
      level: "info",
      category: "City",
      focus: this.buildSelectionFocusPayload(),
    });
  };

  handleCityQueueRemoveRequested = (payload) => {
    if (!this.canAcceptPlayerCommands() || !this.gameState.selectedCityId) {
      return;
    }

    const slotIndex = Number(payload?.index);
    const result = removeCityQueueAt(this.gameState.selectedCityId, slotIndex, this.gameState);
    if (!result.ok) {
      this.emitNotification("Could not remove queue item.", {
        level: "warning",
        category: "City",
      });
      return;
    }

    this.evaluateAndPublish();
    this.emitNotification("Queue item removed.", {
      level: "info",
      category: "City",
      focus: this.buildSelectionFocusPayload(),
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
      this.emitNotification("Could not resolve city outcome.", {
        level: "warning",
        category: "Combat",
      });
      this.evaluateAndPublish();
      return;
    }

    const message = choice === "capture" ? "City captured." : "City razed.";
    this.emitNotification(message, {
      level: "info",
      category: "Combat",
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
    this.emitNotification("Match restarted.", {
      level: "info",
      category: "System",
    });
  };

  handleUiModalStateChanged = (isOpen) => {
    this.uiModalOpen = !!isOpen;
    if (isOpen) {
      this.endCameraDrag();
    }
    const previewCleared = isOpen ? this.setUiPreview(null) : false;
    if (previewCleared) {
      this.renderAll();
    }
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
    this.threatHexes = [];
    this.threatLookup = new Set();
    this.setUiPreview(null);
    this.cameraFocusHex = null;
    this.cameras?.main?.setScroll(0, 0);
    this.endCameraDrag();
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
    this.setUiPreview(null);
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
    const researchResult = consumeScienceStock(this.gameState, "player", 1);
    this.gameState.economy.researchIncomeThisTurn = 1 + cityTurnResult.researchIncome;
    if (researchResult.completedTechIds.length > 0) {
      for (const techId of researchResult.completedTechIds) {
        this.emitNotification(`Research completed: ${capitalizeLabel(techId)}.`, {
          level: "info",
          category: "Research",
        });
      }
    }

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
    this.emitNotification(message, {
      level: "info",
      category: "Combat",
      focus: { unitId: target.id, q: target.q, r: target.r },
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
    this.emitNotification(`City attack dealt ${attackResult.damage ?? 0}${summary}.`, {
      level: "info",
      category: "Combat",
      focus: { cityId: city.id, q: city.q, r: city.r },
    });
  }

  handleCityAttackResult(attackResult) {
    if (!attackResult.cityDefeated) {
      return;
    }

    if (attackResult.pendingResolution) {
      this.emitNotification("City defenses broken. Choose Capture or Raze.", {
        level: "info",
        category: "Combat",
        focus: this.gameState.pendingCityResolution ? { cityId: this.gameState.pendingCityResolution.cityId } : null,
      });
      return;
    }

    if (attackResult.outcomeChoice === "capture") {
      this.emitNotification("Enemy captured a city.", {
        level: "warning",
        category: "Combat",
      });
      return;
    }

    if (attackResult.outcomeChoice === "raze") {
      this.emitNotification("Enemy razed a city.", {
        level: "warning",
        category: "Combat",
      });
    }
  }

  canPanCamera() {
    return !this.uiModalOpen;
  }

  updateKeyboardCameraPan(deltaMs) {
    if (!this.canPanCamera() || !this.cameraPanKeys || !this.cameras?.main) {
      return false;
    }
    const left = this.cameraPanKeys.left?.isDown || this.cameraPanKeys.a?.isDown;
    const right = this.cameraPanKeys.right?.isDown || this.cameraPanKeys.d?.isDown;
    const up = this.cameraPanKeys.up?.isDown || this.cameraPanKeys.w?.isDown;
    const down = this.cameraPanKeys.down?.isDown || this.cameraPanKeys.s?.isDown;
    const horizontal = (right ? 1 : 0) - (left ? 1 : 0);
    const vertical = (down ? 1 : 0) - (up ? 1 : 0);
    if (horizontal === 0 && vertical === 0) {
      return false;
    }
    const directionLength = Math.hypot(horizontal, vertical);
    if (!directionLength) {
      return false;
    }
    const step = (Math.max(0, deltaMs) / 1000) * CAMERA_KEYBOARD_PAN_SPEED;
    if (step <= 0) {
      return false;
    }
    this.cameras.main.scrollX += (horizontal / directionLength) * step;
    this.cameras.main.scrollY += (vertical / directionLength) * step;
    this.clearCameraFocusFromManualPan();
    return true;
  }

  beginCameraDrag(pointer) {
    this.isRightDraggingCamera = true;
    this.cameraDragLastScreenPos = { x: pointer.x, y: pointer.y };
  }

  endCameraDrag() {
    this.isRightDraggingCamera = false;
    this.cameraDragLastScreenPos = null;
  }

  updateCameraDrag(pointer) {
    if (!this.isRightDraggingCamera || !this.cameras?.main) {
      return false;
    }
    if (!this.cameraDragLastScreenPos) {
      this.cameraDragLastScreenPos = { x: pointer.x, y: pointer.y };
      return false;
    }
    const deltaX = pointer.x - this.cameraDragLastScreenPos.x;
    const deltaY = pointer.y - this.cameraDragLastScreenPos.y;
    this.cameraDragLastScreenPos = { x: pointer.x, y: pointer.y };
    if (deltaX === 0 && deltaY === 0) {
      return false;
    }
    this.cameras.main.scrollX -= deltaX;
    this.cameras.main.scrollY -= deltaY;
    this.clearCameraFocusFromManualPan();
    return true;
  }

  clearCameraFocusFromManualPan() {
    if (this.cameraFocusHex) {
      this.cameraFocusHex = null;
    }
  }

  getCameraScrollPayload() {
    return {
      x: this.cameras?.main?.scrollX ?? 0,
      y: this.cameras?.main?.scrollY ?? 0,
    };
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
    this.setUiPreview(null);
    this.evaluateAndPublish();
  }

  selectCity(cityId) {
    this.gameState.selectedCityId = cityId;
    this.gameState.selectedUnitId = null;
    this.setUiPreview(null);
    this.evaluateAndPublish();
  }

  clearSelection() {
    if (!this.gameState.selectedUnitId && !this.gameState.selectedCityId) {
      return;
    }
    this.gameState.selectedUnitId = null;
    this.gameState.selectedCityId = null;
    this.setUiPreview(null);
    this.evaluateAndPublish();
  }

  refreshActionHints() {
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (!selectedUnit || !this.canAcceptPlayerCommands() || selectedUnit.owner !== "player") {
      this.reachableHexes = [];
      this.reachableLookup = new Set();
      this.reachableCostByKey = new Map();
      this.attackableTargets = [];
      this.attackableLookup = new Set();
      this.attackableCities = [];
      this.attackableCityLookup = new Set();
      this.threatHexes = [];
      this.threatLookup = new Set();
      this.setUiPreview(null);
      return;
    }

    this.reachableHexes = getReachable(selectedUnit.id, this.gameState);
    this.reachableLookup = new Set(this.reachableHexes.map((hex) => axialKey(hex)));
    this.reachableCostByKey = new Map(this.reachableHexes.map((hex) => [axialKey(hex), hex.cost]));
    this.attackableTargets = getAttackableTargets(selectedUnit.id, this.gameState);
    this.attackableLookup = new Set(this.attackableTargets.map((unit) => unit.id));
    this.attackableCities = getAttackableCities(selectedUnit.id, this.gameState);
    this.attackableCityLookup = new Set(this.attackableCities.map((city) => city.id));
    this.refreshThreatOverlay(selectedUnit);
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
    const uiTurnAssistant = this.getTurnAssistantState();
    const uiContextPanel = {
      expanded: !!uiRuntime.contextPanelExpanded,
      pinned: !!uiRuntime.contextPanelPinned,
    };
    return {
      ...snapshot,
      projectedIncome,
      projectedNetIncome,
      selectedInfo: this.buildSelectedInfo(selectedUnit, selectedCity),
      contextMenu: this.buildContextMenuPayload(uiSurface, selectedUnit, selectedCity),
      uiPreview: this.buildUiPreviewPayload(),
      uiTurnAssistant,
      uiContextPanel,
      uiNotificationFilter: uiRuntime.notificationFilter ?? "All",
      uiHints: uiSurface.uiHints,
      uiActions: uiSurface.uiActions,
      uiModalOpen: this.uiModalOpen,
      pauseMenu: {
        open: uiRuntime.pauseMenuOpen,
        restartConfirmOpen: uiRuntime.restartConfirmOpen,
      },
      uiNotifications: uiRuntime.notifications,
      cameraScroll: this.getCameraScrollPayload(),
      cameraFocusHex: this.cameraFocusHex,
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
    this.renderThreat();
    this.renderReachable();
    this.renderAttackable();
    this.renderPreview();
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
        0.48,
        COLORS.reachableStroke,
        1.4
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
        0.52,
        COLORS.attackableStroke,
        2
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
        0.32,
        COLORS.attackableStroke,
        2.2
      );
      this.attackableGraphics.lineStyle(2, COLORS.attackableStroke, 1);
      this.attackableGraphics.strokeRect(center.x - 16, center.y - 16, 32, 32);
    }
  }

  renderThreat() {
    this.threatGraphics.clear();
    for (const hex of this.threatHexes) {
      const center = this.hexToWorld(hex.q, hex.r);
      drawHex(this.threatGraphics, center.x, center.y, HEX_SIZE * 0.84, 0xd36f63, 0.2, 0x9a3a2b, 1);
    }
  }

  renderPreview() {
    this.previewGraphics.clear();
    const preview = this.uiPreview;
    if (!preview || !preview.mode) {
      return;
    }

    if (preview.mode === "move" && typeof preview.q === "number" && typeof preview.r === "number") {
      const center = this.hexToWorld(preview.q, preview.r);
      drawHex(this.previewGraphics, center.x, center.y, HEX_SIZE * 0.97, 0x7ac6db, 0.48, 0x276f86, 2.8);
      return;
    }

    if (
      (preview.mode === "attack-unit" || preview.mode === "attack-city") &&
      typeof preview.q === "number" &&
      typeof preview.r === "number"
    ) {
      const center = this.hexToWorld(preview.q, preview.r);
      drawHex(this.previewGraphics, center.x, center.y, HEX_SIZE * 0.97, 0xf1998f, 0.4, 0xa03e32, 2.8);
      const attacker = getUnitById(this.gameState, preview.attackerId ?? null);
      if (attacker) {
        const attackerCenter = this.hexToWorld(attacker.q, attacker.r);
        this.previewGraphics.lineStyle(2, 0xa03e32, 0.9);
        this.previewGraphics.lineBetween(attackerCenter.x, attackerCenter.y, center.x, center.y);
      }
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
      threatHexes: this.threatHexes.map((hex) => ({ q: hex.q, r: hex.r })),
      uiPreview: this.buildUiPreviewPayload(),
      uiTurnAssistant: this.getTurnAssistantState(),
      uiContextPanel: {
        expanded: !!uiRuntime.contextPanelExpanded,
        pinned: !!uiRuntime.contextPanelPinned,
      },
      uiNotificationFilter: uiRuntime.notificationFilter ?? "All",
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
      cameraScroll: this.getCameraScrollPayload(),
      cameraFocusHex: this.cameraFocusHex,
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
      contextPanelExpanded: true,
      contextPanelPinned: false,
      notificationFilter: "All",
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

  emitNotification(message, options = {}) {
    if (!message) {
      return;
    }
    gameEvents.emit("ui-toast-requested", {
      message,
      level: options.level ?? "info",
      category: options.category ?? "System",
      focus: options.focus ?? null,
    });
  }

  buildSelectionFocusPayload() {
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (selectedUnit) {
      return {
        unitId: selectedUnit.id,
        q: selectedUnit.q,
        r: selectedUnit.r,
      };
    }
    const selectedCity = this.gameState.cities.find((city) => city.id === this.gameState.selectedCityId) ?? null;
    if (selectedCity) {
      return {
        cityId: selectedCity.id,
        q: selectedCity.q,
        r: selectedCity.r,
      };
    }
    return null;
  }

  setUiPreview(nextPreview) {
    const normalized = nextPreview && nextPreview.mode && nextPreview.mode !== "none" ? sanitizePreview(nextPreview) : null;
    if (arePreviewsEqual(this.uiPreview, normalized)) {
      return false;
    }
    this.uiPreview = normalized;
    return true;
  }

  buildUiPreviewPayload() {
    return this.uiPreview ? structuredClone(this.uiPreview) : { mode: "none" };
  }

  buildHoverPreview(selectedUnit, hoveredHex) {
    const hoveredUnit = getUnitAt(this.gameState, hoveredHex.q, hoveredHex.r);
    if (hoveredUnit && hoveredUnit.owner !== selectedUnit.owner && this.attackableLookup.has(hoveredUnit.id)) {
      const prediction = previewAttack(selectedUnit.id, hoveredUnit.id, this.gameState);
      if (!prediction.ok) {
        return null;
      }
      return {
        mode: "attack-unit",
        attackerId: selectedUnit.id,
        targetId: hoveredUnit.id,
        q: hoveredUnit.q,
        r: hoveredUnit.r,
        damage: prediction.damage ?? 0,
        targetRemainingHealth: prediction.targetRemainingHealth ?? hoveredUnit.health,
        counterattack: prediction.counterattack ?? null,
        breakdown: prediction.breakdown ?? null,
      };
    }

    const hoveredCity = getCityAt(this.gameState, hoveredHex.q, hoveredHex.r);
    if (hoveredCity && hoveredCity.owner !== selectedUnit.owner && this.attackableCityLookup.has(hoveredCity.id)) {
      const prediction = previewCityAttack(selectedUnit.id, hoveredCity.id, this.gameState);
      if (!prediction.ok) {
        return null;
      }
      return {
        mode: "attack-city",
        attackerId: selectedUnit.id,
        cityId: hoveredCity.id,
        q: hoveredCity.q,
        r: hoveredCity.r,
        damage: prediction.damage ?? 0,
        cityRemainingHealth: prediction.cityRemainingHealth ?? hoveredCity.health,
        breakdown: prediction.breakdown ?? null,
      };
    }

    const hoveredKey = axialKey(hoveredHex);
    if (this.reachableLookup.has(hoveredKey)) {
      const moveCost = this.reachableCostByKey.get(hoveredKey) ?? 0;
      return {
        mode: "move",
        unitId: selectedUnit.id,
        q: hoveredHex.q,
        r: hoveredHex.r,
        moveCost,
        movementRemainingAfter: Math.max(0, selectedUnit.movementRemaining - moveCost),
      };
    }

    return null;
  }

  getReadyPlayerUnits() {
    return this.gameState.units
      .filter((unit) => unit.owner === "player" && unit.health > 0 && !unit.hasActed && unit.movementRemaining > 0)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  getPlayerCitiesWithEmptyQueue() {
    return this.gameState.cities
      .filter((city) => city.owner === "player")
      .filter((city) => (city.queue?.length ?? 0) === 0)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  getNextReadyUnitId() {
    const readyUnits = this.getReadyPlayerUnits();
    if (readyUnits.length === 0) {
      return null;
    }

    const currentId = this.gameState.selectedUnitId;
    const currentIndex = readyUnits.findIndex((unit) => unit.id === currentId);
    if (currentIndex === -1) {
      return readyUnits[0].id;
    }

    const nextIndex = (currentIndex + 1) % readyUnits.length;
    return readyUnits[nextIndex].id;
  }

  getTurnAssistantState() {
    if (
      this.gameState.match.status !== "ongoing" ||
      this.gameState.turnState.phase !== "player" ||
      !!this.gameState.pendingCityResolution
    ) {
      return {
        readyCount: 0,
        nextReadyUnitId: null,
        emptyQueueCityCount: 0,
      };
    }
    const readyUnits = this.getReadyPlayerUnits();
    const idleQueueCities = this.getPlayerCitiesWithEmptyQueue();
    return {
      readyCount: readyUnits.length,
      nextReadyUnitId: this.getNextReadyUnitId(),
      emptyQueueCityCount: idleQueueCities.length,
    };
  }

  refreshThreatOverlay(selectedUnit) {
    const candidateHexes = new Map();
    candidateHexes.set(axialKey(selectedUnit), { q: selectedUnit.q, r: selectedUnit.r });
    for (const hex of this.reachableHexes) {
      candidateHexes.set(axialKey(hex), { q: hex.q, r: hex.r });
    }

    const threatHexes = [];
    const threatLookup = new Set();
    for (const candidate of candidateHexes.values()) {
      if (this.isHexThreatenedByEnemy(candidate)) {
        threatHexes.push(candidate);
        threatLookup.add(axialKey(candidate));
      }
    }
    this.threatHexes = threatHexes;
    this.threatLookup = threatLookup;
  }

  isHexThreatenedByEnemy(hex) {
    for (const enemyUnit of this.gameState.units) {
      if (enemyUnit.owner !== "enemy" || enemyUnit.health <= 0) {
        continue;
      }
      const minRange = Math.max(1, enemyUnit.minAttackRange ?? 1);
      const maxRange = Math.max(minRange, enemyUnit.attackRange ?? 1);
      const distanceToHex = distance(enemyUnit, hex);
      if (distanceToHex >= minRange && distanceToHex <= maxRange) {
        return true;
      }
    }
    return false;
  }

  resolveNotificationFocus(focus) {
    if (!focus || typeof focus !== "object") {
      return null;
    }
    if (typeof focus.unitId === "string") {
      const targetUnit = getUnitById(this.gameState, focus.unitId);
      if (targetUnit) {
        return { q: targetUnit.q, r: targetUnit.r };
      }
    }
    if (typeof focus.cityId === "string") {
      const targetCity = this.gameState.cities.find((city) => city.id === focus.cityId) ?? null;
      if (targetCity) {
        return { q: targetCity.q, r: targetCity.r };
      }
    }
    if (Number.isFinite(focus.q) && Number.isFinite(focus.r)) {
      const q = Math.round(focus.q);
      const r = Math.round(focus.r);
      if (isInsideMap(this.gameState.map, q, r)) {
        return { q, r };
      }
    }
    return null;
  }

  focusCameraOnHex(q, r) {
    const center = this.hexToWorld(q, r);
    this.cameras.main.centerOn(center.x, center.y);
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
  testGetActionPreviewState() {
    return this.buildUiPreviewPayload();
  }

  testHoverHex(q, r) {
    if (!isInsideMap(this.gameState.map, q, r)) {
      return false;
    }
    const selectedUnit = getUnitById(this.gameState, this.gameState.selectedUnitId);
    if (!selectedUnit || selectedUnit.owner !== "player" || !this.canAcceptPlayerCommands()) {
      return false;
    }
    const nextPreview = this.buildHoverPreview(selectedUnit, { q, r });
    this.setUiPreview(nextPreview);
    this.renderAll();
    this.publishState();
    return true;
  }

  testGetTurnAssistantState() {
    return this.getTurnAssistantState();
  }

  testNextReadyUnit() {
    return this.handleNextReadyUnitRequested();
  }

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
    this.handleResearchCycleRequested();
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

function sanitizePreview(preview) {
  return structuredClone(preview);
}

function arePreviewsEqual(a, b) {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
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
