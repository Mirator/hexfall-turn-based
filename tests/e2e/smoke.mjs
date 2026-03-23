import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = 4173;
const URL = `http://${HOST}:${PORT}`;
const ARTIFACT_DIR = "tests/e2e/artifacts";

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the timeout expires.
    }
    await delay(300);
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
}

async function run() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const viteCliPath = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  const server = spawn(process.execPath, [viteCliPath, "--host", HOST, "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  const serverLogs = [];
  const capture = (data) => {
    const text = data.toString();
    serverLogs.push(text);
    if (serverLogs.length > 120) {
      serverLogs.shift();
    }
  };
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);

  try {
    await waitForServer(URL);

    const browser = await chromium.launch({
      headless: true,
      args: ["--use-gl=angle", "--use-angle=swiftshader"],
    });
    const page = await browser.newPage();
    const consoleErrors = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(String(error));
    });

    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
    await page.waitForTimeout(350);

    const initialState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(initialState.turn, 1, "initial turn should be 1");
    assert.equal(initialState.units.length, 1, "expected exactly one unit");

    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible" });
    const canvasBox = await canvas.boundingBox();
    assert.ok(canvasBox, "expected visible game canvas");

    const clickTargets = await page.evaluate(() => {
      const state = JSON.parse(window.render_game_to_text());
      const unit = state.units[0];
      const from = window.__hexfallTest.hexToWorld(unit.q, unit.r);
      const destination = window.__hexfallTest.hexToWorld(unit.q + 1, unit.r);
      const endTurnCenter = window.__hexfallTest.getEndTurnButtonCenter();
      return { from, destination, endTurnCenter };
    });

    assert.ok(clickTargets.from && clickTargets.destination, "expected click coordinates");
    assert.ok(clickTargets.endTurnCenter, "expected end turn button coordinates");

    await page.mouse.click(canvasBox.x + clickTargets.from.x, canvasBox.y + clickTargets.from.y);
    await page.waitForTimeout(120);
    await page.mouse.click(canvasBox.x + clickTargets.destination.x, canvasBox.y + clickTargets.destination.y);
    await page.waitForTimeout(160);

    const movedState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(movedState.units[0].q, 3, "unit q should increment after moving");
    assert.equal(movedState.units[0].r, 2, "unit r should remain unchanged for horizontal move");
    assert.equal(movedState.units[0].movementRemaining, 1, "movement points should decrement");

    await page.mouse.click(
      canvasBox.x + clickTargets.endTurnCenter.x,
      canvasBox.y + clickTargets.endTurnCenter.y
    );
    await page.waitForTimeout(140);

    const endedTurnState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(endedTurnState.turn, 2, "turn should advance after end turn");
    assert.equal(endedTurnState.selectedUnitId, null, "selection should clear on end turn");
    assert.equal(endedTurnState.units[0].movementRemaining, 2, "movement should reset on new turn");

    await canvas.screenshot({ path: `${ARTIFACT_DIR}/smoke.png` });

    assert.equal(consoleErrors.length, 0, `console errors found:\n${consoleErrors.join("\n")}`);

    await browser.close();
    console.log("E2E smoke test passed.");
  } finally {
    server.kill("SIGTERM");
    await delay(250);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
