import Phaser from "../core/phaserRuntime.js";
import { BASE_GAME_HEIGHT, BASE_GAME_WIDTH } from "../core/constants.js";
import { AboutScene } from "../scenes/AboutScene.js";
import { BootScene } from "../scenes/BootScene.js";
import { MainMenuScene } from "../scenes/MainMenuScene.js";
import { NewGameScene } from "../scenes/NewGameScene.js";
import { UIScene } from "../scenes/UIScene.js";
import { WorldScene } from "../scenes/WorldScene.js";

export function createGame() {
  const config = {
    type: Phaser.AUTO,
    parent: "game-root",
    width: BASE_GAME_WIDTH,
    height: BASE_GAME_HEIGHT,
    scene: [BootScene, MainMenuScene, NewGameScene, AboutScene, WorldScene, UIScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: BASE_GAME_WIDTH,
      height: BASE_GAME_HEIGHT,
    },
  };

  return new Phaser.Game(config);
}

export function getWorldScene(phaserGame) {
  return getSceneIfActive(phaserGame, "WorldScene");
}

export function getUIScene(phaserGame) {
  return getSceneIfActive(phaserGame, "UIScene");
}

export function getMainMenuScene(phaserGame) {
  return getSceneIfActive(phaserGame, "MainMenuScene");
}

export function getNewGameScene(phaserGame) {
  return getSceneIfActive(phaserGame, "NewGameScene");
}

export function getAboutScene(phaserGame) {
  return getSceneIfActive(phaserGame, "AboutScene");
}

export function getBootstrapState(phaserGame) {
  const sceneChecks = [
    { scene: getNewGameScene(phaserGame), fallbackMode: "new-game" },
    { scene: getAboutScene(phaserGame), fallbackMode: "about" },
    { scene: getMainMenuScene(phaserGame), fallbackMode: "menu" },
  ];

  for (const check of sceneChecks) {
    if (!check.scene) {
      continue;
    }
    const payload =
      typeof check.scene.testGetBootstrapState === "function"
        ? check.scene.testGetBootstrapState()
        : { mode: check.fallbackMode };
    if (payload && typeof payload === "object") {
      return payload;
    }
    return { mode: check.fallbackMode };
  }

  return null;
}

function getSceneIfActive(phaserGame, key) {
  if (!phaserGame?.scene) {
    return null;
  }
  let scene = null;
  try {
    scene = phaserGame.scene.getScene(key);
  } catch {
    scene = null;
  }
  return scene && scene.scene.isActive() ? scene : null;
}
