import Phaser from "../core/phaserRuntime.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create() {
    this.scene.start("WorldScene");
    this.scene.launch("UIScene");
  }
}
