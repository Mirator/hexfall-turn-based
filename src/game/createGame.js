import Phaser from "../core/phaserRuntime.js";
import { BASE_GAME_HEIGHT, BASE_GAME_WIDTH } from "../core/constants.js";
import { BootScene } from "../scenes/BootScene.js";
import { UIScene } from "../scenes/UIScene.js";
import { WorldScene } from "../scenes/WorldScene.js";

export function createGame() {
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

  return new Phaser.Game(config);
}

export function getWorldScene(phaserGame) {
  const scene = phaserGame.scene.getScene("WorldScene");
  return scene && scene.scene.isActive() ? scene : null;
}

export function getUIScene(phaserGame) {
  const scene = phaserGame.scene.getScene("UIScene");
  return scene && scene.scene.isActive() ? scene : null;
}
