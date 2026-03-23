import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create() {
    this.scene.start("WorldScene");
    this.scene.launch("UIScene");
  }
}
