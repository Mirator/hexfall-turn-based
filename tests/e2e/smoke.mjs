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
      // Keep polling.
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
    await page.waitForTimeout(700);

    const initialState = await page.evaluate(() => window.__hexfallTest.getState());
    assert.equal(initialState.turn, 1, "initial turn should be 1");
    assert.equal(initialState.match.status, "ongoing", "match should begin ongoing");

    const scenarioResult = await page.evaluate(() => {
      const getState = () => window.__hexfallTest.getState();

      const initial = getState();
      const warrior = initial.units.find((unit) => unit.owner === "player" && unit.type === "warrior");
      const settler = initial.units.find((unit) => unit.owner === "player" && unit.type === "settler");
      const enemy = initial.units.find((unit) => unit.owner === "enemy");
      if (!warrior || !settler || !enemy) {
        return { ok: false, reason: "missing-units" };
      }

      window.__hexfallTest.selectResearch("bronzeWorking");
      window.__hexfallTest.selectUnit(warrior.id);
      const moved = window.__hexfallTest.moveSelected(warrior.q + 1, warrior.r);
      const firstEndTurn = window.__hexfallTest.endTurnImmediate();
      if (!moved || !firstEndTurn) {
        return { ok: false, reason: "move-or-endturn-failed" };
      }

      window.__hexfallTest.selectUnit(warrior.id);
      const attacked = window.__hexfallTest.attackTarget(enemy.id);
      window.__hexfallTest.selectUnit(settler.id);
      const founded = window.__hexfallTest.foundCity();
      if (!attacked || !founded) {
        return { ok: false, reason: "attack-or-found-failed" };
      }

      let loops = 0;
      while (loops < 8) {
        const state = getState();
        if (state.match.status !== "ongoing") {
          break;
        }
        window.__hexfallTest.endTurnImmediate();
        loops += 1;
      }

      const finalState = getState();
      return { ok: true, loops, finalState };
    });

    assert.equal(scenarioResult.ok, true, `scenario failed: ${scenarioResult.reason}`);
    const finalState = scenarioResult.finalState;
    assert.ok(finalState, "final state should be available");
    assert.equal(finalState.match.status, "won", "scenario should end in victory");
    assert.ok(
      finalState.research.completedTechIds.includes("bronzeWorking"),
      "bronze working should complete during scenario"
    );
    assert.ok(finalState.cities.length >= 1, "city should exist after founding");
    assert.ok(
      finalState.units.some((unit) => unit.owner === "player" && !["player-1", "player-2"].includes(unit.id)),
      "city should produce at least one additional player unit"
    );

    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible" });
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
