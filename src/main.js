import "./style.css";

const MIN_SUPPORTED_VIEWPORT_WIDTH = 768;

const gameRoot = document.getElementById("game-root");
const loadingBanner = createLoadingBanner();
const unsupportedViewportBanner = createUnsupportedViewportBanner();
gameRoot?.appendChild(loadingBanner);
gameRoot?.appendChild(unsupportedViewportBanner);

let game = null;
let sceneGetters = {
  getWorldScene: () => null,
  getUIScene: () => null,
  getMainMenuScene: () => null,
  getNewGameScene: () => null,
  getAboutScene: () => null,
  getBootstrapState: () => null,
};
let gameLoadPromise = null;
let viewportSupported = false;

window.__hexfallGame = null;
window.render_game_to_text = () => {
  const worldScene = game ? sceneGetters.getWorldScene(game) : null;
  if (worldScene) {
    return worldScene.renderGameToText();
  }
  if (!isViewportSupported()) {
    return JSON.stringify({
      mode: "unsupported",
      viewportWidth: getViewportWidth(),
      minSupportedViewportWidth: MIN_SUPPORTED_VIEWPORT_WIDTH,
    });
  }
  const bootstrapState = game ? sceneGetters.getBootstrapState(game) : null;
  if (bootstrapState) {
    return JSON.stringify(bootstrapState);
  }
  return JSON.stringify({ mode: "loading" });
};

window.advanceTime = (ms) => {
  const worldScene = game ? sceneGetters.getWorldScene(game) : null;
  if (!worldScene) {
    return;
  }
  worldScene.manualAdvanceTime(ms);
};

window.__hexfallTest = {
  getState() {
    return JSON.parse(window.render_game_to_text());
  },
  getPerfStats() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene && typeof worldScene.testGetPerfStats === "function" ? worldScene.testGetPerfStats() : null;
  },
  getBootstrapState() {
    const state = game ? sceneGetters.getBootstrapState(game) : null;
    return state ? structuredClone(state) : null;
  },
  openMainMenuNewGame() {
    const menuScene = game ? sceneGetters.getMainMenuScene(game) : null;
    return menuScene ? menuScene.testOpenNewGame() : false;
  },
  openMainMenuAbout() {
    const menuScene = game ? sceneGetters.getMainMenuScene(game) : null;
    return menuScene ? menuScene.testOpenAbout() : false;
  },
  closeAboutToMainMenu() {
    const aboutScene = game ? sceneGetters.getAboutScene(game) : null;
    return aboutScene ? aboutScene.testBackToMenu() : false;
  },
  setStartupNewGameMapSize(size) {
    const newGameScene = game ? sceneGetters.getNewGameScene(game) : null;
    return newGameScene ? newGameScene.testSetMapSize(size) : false;
  },
  setStartupNewGameAiFactionCount(count) {
    const newGameScene = game ? sceneGetters.getNewGameScene(game) : null;
    return newGameScene ? newGameScene.testSetAiFactionCount(count) : false;
  },
  startStartupNewGame() {
    const newGameScene = game ? sceneGetters.getNewGameScene(game) : null;
    return newGameScene ? newGameScene.testStartMatch() : false;
  },
  backFromStartupNewGame() {
    const newGameScene = game ? sceneGetters.getNewGameScene(game) : null;
    return newGameScene ? newGameScene.testBackToMenu() : false;
  },
  getStartupNewGameState() {
    const newGameScene = game ? sceneGetters.getNewGameScene(game) : null;
    return newGameScene ? newGameScene.testGetBootstrapState() : null;
  },
  hexToWorld(q, r) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.hexToWorld(q, r) : null;
  },
  getEndTurnButtonCenter() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.getEndTurnButtonCenter() : null;
  },
  openRestartConfirm() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testOpenRestartConfirm() : false;
  },
  cancelRestartConfirm() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testCancelRestartConfirm() : false;
  },
  confirmRestartConfirm() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testConfirmRestartConfirm() : false;
  },
  setNewGameMapSize(size) {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testSetNewGameMapSize(size) : false;
  },
  setNewGameAiFactionCount(count) {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testSetNewGameAiFactionCount(count) : false;
  },
  getRestartModalState() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testGetRestartModalState() : null;
  },
  getCityResolutionModalState() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testGetCityResolutionModalState() : null;
  },
  getCityPanelState() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testGetCityPanelState() : null;
  },
  showCityActionTooltip(actionId) {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testShowActionTooltip(actionId) : false;
  },
  hideCityActionTooltip() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testHideActionTooltip() : false;
  },
  getPauseMenuState() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testGetPauseMenuState() : null;
  },
  openPauseMenu() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testOpenPauseMenu() : false;
  },
  closePauseMenu() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testClosePauseMenu() : false;
  },
  getNotificationCenterState() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testGetNotificationCenterState() : null;
  },
  getActionPreviewState() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testGetActionPreviewState() : null;
  },
  getAnimationState() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testGetAnimationState() : null;
  },
  getSpriteLayerCounts() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testGetSpriteLayerCounts() : null;
  },
  hoverHex(q, r) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testHoverHex(q, r) : false;
  },
  getTurnAssistantState() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testGetTurnAssistantState() : null;
  },
  nextReadyUnit() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testNextReadyUnit() : false;
  },
  setContextPanelPinned(value) {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testSetContextPanelPinned(value) : false;
  },
  setNotificationFilter(filter) {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testSetNotificationFilter(filter) : false;
  },
  clickNotificationRow(index) {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testClickNotificationRow(index) : false;
  },
  focusNotification(index) {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testFocusNotification(index) : false;
  },
  focusAttention(kind) {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testFocusAttention(kind) : false;
  },
  getHudPolishState() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testGetHudPolishState() : null;
  },
  toggleStatsPanel() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testToggleStatsPanel() : false;
  },
  clickMinimapNormalized(nx, ny) {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testClickMinimapNormalized(nx, ny) : false;
  },
  focusMinimapHex(q, r) {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testFocusMinimapHex(q, r) : false;
  },
  toggleSfxMute() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testToggleSfxMute() : false;
  },
  getSfxState() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.testGetSfxState() : null;
  },
  selectUnit(unitId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testSelectUnit(unitId) : false;
  },
  selectCity(cityId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testSelectCity(cityId) : false;
  },
  moveSelected(q, r) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testMoveSelected(q, r) : false;
  },
  attackTarget(targetId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testAttackTarget(targetId) : false;
  },
  attackCity(cityId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testAttackCity(cityId) : false;
  },
  triggerUnitAction(actionId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testTriggerUnitAction(actionId) : false;
  },
  foundCity() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testFoundCity() : false;
  },
  chooseCityOutcome(choice) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testChooseCityOutcome(choice) : false;
  },
  setCityProductionTab(tab) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testSetCityProductionTab(tab) : null;
  },
  enqueueCityProduction(unitType) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testEnqueueCityProduction(unitType) : false;
  },
  enqueueCityBuilding(buildingId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testEnqueueCityBuilding(buildingId) : false;
  },
  removeCityQueueAt(index) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testRemoveCityQueueAt(index) : false;
  },
  moveCityQueue(index, direction) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testMoveCityQueue(index, direction) : false;
  },
  cycleResearch() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testCycleResearch() : null;
  },
  selectResearch(techId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testSelectResearch(techId) : false;
  },
  endTurnImmediate() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testEndTurnImmediate() : false;
  },
  focusHex(q, r) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testFocusHex(q, r) : false;
  },
  requestEndTurn() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testRequestEndTurn() : false;
  },
  setUnitPosition(unitId, q, r) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testSetUnitPosition(unitId, q, r) : false;
  },
  arrangeCombatSkirmish(playerUnitId, enemyUnitId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testArrangeCombatSkirmish(playerUnitId, enemyUnitId) : false;
  },
  setEnemyPersonality(personality) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testSetEnemyPersonality(personality) : false;
  },
  setAiPersonality(owner, personality) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testSetAiPersonality(owner, personality) : false;
  },
  getEnemyAiState() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testGetEnemyAiState() : null;
  },
  getAiState(owner) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testGetAiState(owner) : null;
  },
  clearEnemyCityQueue(cityId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testClearEnemyCityQueue(cityId) : false;
  },
  clearAiCityQueue(owner, cityId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testClearAiCityQueue(owner, cityId) : false;
  },
  toggleDevVision() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testToggleDevVision() : false;
  },
  setDevVision(enabled) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testSetDevVision(enabled) : false;
  },
};

window.addEventListener("resize", refreshViewportSupportState);
window.addEventListener("orientationchange", refreshViewportSupportState);
void refreshViewportSupportState();

function getViewportWidth() {
  const documentWidth = document.documentElement?.clientWidth ?? 0;
  return Math.max(window.innerWidth ?? 0, documentWidth);
}

function isViewportSupported() {
  return getViewportWidth() >= MIN_SUPPORTED_VIEWPORT_WIDTH;
}

function setUnsupportedViewportVisible(visible) {
  if (!gameRoot) {
    return;
  }
  gameRoot.classList.toggle("viewport-unsupported", visible);
  unsupportedViewportBanner.hidden = !visible;
  unsupportedViewportBanner.setAttribute("aria-hidden", String(!visible));
}

function showLoadingBanner(message) {
  loadingBanner.textContent = message;
  loadingBanner.hidden = false;
  loadingBanner.setAttribute("aria-hidden", "false");
}

function hideLoadingBanner() {
  loadingBanner.hidden = true;
  loadingBanner.setAttribute("aria-hidden", "true");
}

function refreshViewportSupportState() {
  viewportSupported = isViewportSupported();
  setUnsupportedViewportVisible(!viewportSupported);

  if (!viewportSupported) {
    hideLoadingBanner();
    return;
  }

  if (game) {
    hideLoadingBanner();
    return;
  }

  void startGame();
}

async function startGame() {
  if (!isViewportSupported()) {
    return null;
  }
  if (gameLoadPromise) {
    return gameLoadPromise;
  }

  showLoadingBanner("Loading Phaser engine...");
  gameLoadPromise = import("./game/createGame.js")
    .then((module) => {
      sceneGetters = {
        getWorldScene: module.getWorldScene,
        getUIScene: module.getUIScene,
        getMainMenuScene: module.getMainMenuScene,
        getNewGameScene: module.getNewGameScene,
        getAboutScene: module.getAboutScene,
        getBootstrapState: module.getBootstrapState,
      };
      game = module.createGame();
      window.__hexfallGame = game;
      return game;
    })
    .then(async (createdGame) => {
      await waitForCanvas();
      hideLoadingBanner();
      return createdGame;
    })
    .catch((error) => {
      showLoadingBanner(`Failed to load game: ${error instanceof Error ? error.message : "unknown error"}`);
      throw error;
    });

  return gameLoadPromise;
}

async function waitForCanvas() {
  for (let i = 0; i < 100; i += 1) {
    if (document.querySelector("canvas")) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

function createLoadingBanner() {
  const element = document.createElement("div");
  element.id = "loading-banner";
  element.textContent = "Preparing Hexfall...";
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  return element;
}

function createUnsupportedViewportBanner() {
  const element = document.createElement("section");
  element.id = "unsupported-viewport-banner";
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;

  const title = document.createElement("h2");
  title.textContent = "Desktop + Tablet Only";

  const lineOne = document.createElement("p");
  lineOne.textContent = `Hexfall currently supports screens at least ${MIN_SUPPORTED_VIEWPORT_WIDTH}px wide.`;

  const lineTwo = document.createElement("p");
  lineTwo.textContent = "Resize your browser window or use a larger device to play.";

  element.appendChild(title);
  element.appendChild(lineOne);
  element.appendChild(lineTwo);
  return element;
}
