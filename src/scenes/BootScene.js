import Phaser from "../core/phaserRuntime.js";
import { VISUAL_ASSETS } from "../core/visualAssets.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    for (const asset of VISUAL_ASSETS) {
      if (asset.kind === "spritesheet") {
        this.load.spritesheet(asset.key, asset.url, asset.frameConfig);
      } else {
        this.load.image(asset.key, asset.url);
      }
    }
  }

  create() {
    this.scene.start("MainMenuScene");
  }
}
