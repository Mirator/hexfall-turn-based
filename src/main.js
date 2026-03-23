import Phaser from "phaser";
import { BASE_GAME_HEIGHT, BASE_GAME_WIDTH } from "./core/constants.js";
import "./style.css";
import { BootScene } from "./scenes/BootScene.js";
import { UIScene } from "./scenes/UIScene.js";
import { WorldScene } from "./scenes/WorldScene.js";

const config = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: BASE_GAME_WIDTH,
  height: BASE_GAME_HEIGHT,
  scene: [BootScene, WorldScene, UIScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: BASE_GAME_WIDTH,
    height: BASE_GAME_HEIGHT,
  },
};

const game = new Phaser.Game(config);

window.__hexfallGame = game;
window.render_game_to_text = () => {
  const worldScene = getWorldScene(game);
  if (!worldScene) {
    return JSON.stringify({ mode: "booting" });
  }
  return worldScene.renderGameToText();
};

window.advanceTime = (ms) => {
  const worldScene = getWorldScene(game);
  if (!worldScene) {
    return;
  }
  worldScene.manualAdvanceTime(ms);
};

window.__hexfallTest = {
  hexToWorld(q, r) {
    const worldScene = getWorldScene(game);
    if (!worldScene) {
      return null;
    }
    return worldScene.hexToWorld(q, r);
  },
  getEndTurnButtonCenter() {
    const uiScene = getUIScene(game);
    if (!uiScene) {
      return null;
    }
    return uiScene.getEndTurnButtonCenter();
  },
};

function getWorldScene(phaserGame) {
  const scene = phaserGame.scene.getScene("WorldScene");
  return scene && scene.scene.isActive() ? scene : null;
}

function getUIScene(phaserGame) {
  const scene = phaserGame.scene.getScene("UIScene");
  return scene && scene.scene.isActive() ? scene : null;
}
