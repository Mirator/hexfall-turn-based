import "./style.css";
const gameRoot = document.getElementById("game-root");
const loadingBanner = createLoadingBanner();
gameRoot?.appendChild(loadingBanner);

let game = null;
let sceneGetters = {
  getWorldScene: () => null,
  getUIScene: () => null,
};
let gameLoadPromise = null;

window.__hexfallGame = null;
window.render_game_to_text = () => {
  const worldScene = game ? sceneGetters.getWorldScene(game) : null;
  if (!worldScene) {
    return JSON.stringify({ mode: "loading" });
  }
  return worldScene.renderGameToText();
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
  hexToWorld(q, r) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.hexToWorld(q, r) : null;
  },
  getEndTurnButtonCenter() {
    const uiScene = game ? sceneGetters.getUIScene(game) : null;
    return uiScene ? uiScene.getEndTurnButtonCenter() : null;
  },
  selectUnit(unitId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testSelectUnit(unitId) : false;
  },
  moveSelected(q, r) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testMoveSelected(q, r) : false;
  },
  attackTarget(targetId) {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testAttackTarget(targetId) : false;
  },
  foundCity() {
    const worldScene = game ? sceneGetters.getWorldScene(game) : null;
    return worldScene ? worldScene.testFoundCity() : false;
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
};

void startGame();

async function startGame() {
  if (gameLoadPromise) {
    return gameLoadPromise;
  }

  loadingBanner.textContent = "Loading Phaser engine...";
  gameLoadPromise = import("./game/createGame.js")
    .then((module) => {
      sceneGetters = {
        getWorldScene: module.getWorldScene,
        getUIScene: module.getUIScene,
      };
      game = module.createGame();
      window.__hexfallGame = game;
      return game;
    })
    .then(async (createdGame) => {
      await waitForCanvas();
      loadingBanner.remove();
      return createdGame;
    })
    .catch((error) => {
      loadingBanner.textContent = `Failed to load game: ${error instanceof Error ? error.message : "unknown error"}`;
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
  return element;
}
