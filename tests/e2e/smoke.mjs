import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
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
  let browser = null;
  let cleanedUp = false;

  const forceKillPid = (pid) => {
    if (!pid) {
      return;
    }
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(pid, "SIGKILL");
      }
    } catch {
      // Best-effort cleanup only.
    }
  };

  const forceKillHeadlessBrowsers = () => {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/IM", "chrome-headless-shell.exe", "/T", "/F"], { stdio: "ignore" });
        return;
      }
      spawnSync("pkill", ["-f", "chrome-headless-shell"], { stdio: "ignore" });
    } catch {
      // Best-effort cleanup only.
    }
  };

  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Best-effort cleanup only.
      } finally {
        browser = null;
      }
    }
    forceKillHeadlessBrowsers();

    if (server.pid) {
      try {
        server.kill("SIGTERM");
      } catch {
        // Best-effort cleanup only.
      }
      await delay(250);
      if (!server.killed) {
        forceKillPid(server.pid);
      }
    }
  };

  const onSignal = (signal) => {
    cleanup()
      .catch(() => {
        // Best-effort cleanup only.
      })
      .finally(() => {
        process.exit(signal === "SIGINT" ? 130 : 143);
      });
  };
  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));

  try {
    await waitForServer(URL);

    browser = await chromium.launch({
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
    assert.equal(initialState.uiActions.canRestart, true, "restart should be available during gameplay");
    const initialPlayerSettlers = initialState.units.filter((unit) => unit.owner === "player" && unit.type === "settler");
    const initialEnemySettlers = initialState.units.filter((unit) => unit.owner === "enemy" && unit.type === "settler");
    assert.equal(initialPlayerSettlers.length, 1, "player should start with one settler");
    assert.equal(initialEnemySettlers.length, 1, "enemy should start with one settler");
    assert.equal(initialState.units.some((unit) => unit.type === "warrior"), false, "no warriors at match start");
    assert.equal(initialState.cityPanel?.visible, false, "city panel should be hidden before city selection");

    const scenarioResult = await page.evaluate(() => {
      const getState = () => window.__hexfallTest.getState();
      const getUnit = (state, owner, type) => state.units.find((unit) => unit.owner === owner && unit.type === type);

      const initial = getState();
      const playerSettler = getUnit(initial, "player", "settler");
      if (!playerSettler) {
        return { ok: false, reason: "missing-player-settler" };
      }

      // Restart modal sanity check.
      const openedConfirm = window.__hexfallTest.openRestartConfirm();
      const restartModal = window.__hexfallTest.getRestartModalState();
      if (
        !openedConfirm ||
        !restartModal?.open ||
        !restartModal?.confirmVisible ||
        !restartModal?.cancelVisible ||
        restartModal.confirmDepth <= restartModal.panelDepth
      ) {
        return { ok: false, reason: "restart-modal-broken" };
      }
      window.__hexfallTest.cancelRestartConfirm();
      if (window.__hexfallTest.getRestartModalState()?.open) {
        return { ok: false, reason: "restart-modal-did-not-close" };
      }

      // Found player city.
      window.__hexfallTest.selectUnit(playerSettler.id);
      const founded = window.__hexfallTest.foundCity();
      if (!founded) {
        return { ok: false, reason: "player-founding-failed" };
      }
      if (getState().cities.filter((city) => city.owner === "player").length !== 1) {
        return { ok: false, reason: "player-city-missing" };
      }
      const cityPanel = window.__hexfallTest.getCityPanelState();
      if (!cityPanel?.visible || cityPanel.focusButtons.filter((button) => button.visible).length !== 4) {
        return { ok: false, reason: "city-panel-not-visible-after-founding" };
      }

      // Direct focus set + queue add/remove flow.
      const focusResult = window.__hexfallTest.setCityFocus("production");
      if (focusResult !== "production") {
        return { ok: false, reason: "direct-focus-set-failed" };
      }
      const focusedCity = getState().cities.find((city) => city.owner === "player");
      if (!focusedCity || focusedCity.focus !== "production") {
        return { ok: false, reason: "focus-not-updated" };
      }

      const queueAfterFirstAdd = window.__hexfallTest.enqueueCityProduction("settler");
      if (!Array.isArray(queueAfterFirstAdd) || queueAfterFirstAdd.length !== 2) {
        return { ok: false, reason: "queue-first-enqueue-failed" };
      }
      const queueAfterSecondAdd = window.__hexfallTest.enqueueCityProduction("warrior");
      if (!Array.isArray(queueAfterSecondAdd) || queueAfterSecondAdd.length !== 3) {
        return { ok: false, reason: "queue-second-enqueue-failed" };
      }
      const overfillAttempt = window.__hexfallTest.enqueueCityProduction("warrior");
      if (overfillAttempt !== false) {
        return { ok: false, reason: "queue-overfill-should-fail" };
      }
      const queueAfterRemove = window.__hexfallTest.removeCityQueueAt(1);
      if (!Array.isArray(queueAfterRemove) || queueAfterRemove.length !== 2) {
        return { ok: false, reason: "queue-remove-failed" };
      }

      // AI should auto-found on enemy phase.
      const advanced = window.__hexfallTest.endTurnImmediate();
      if (!advanced) {
        return { ok: false, reason: "end-turn-failed-after-found" };
      }
      const afterEnemyOpen = getState();
      if (afterEnemyOpen.cities.filter((city) => city.owner === "enemy").length < 1) {
        return { ok: false, reason: "enemy-did-not-auto-found" };
      }
      if (afterEnemyOpen.units.some((unit) => unit.owner === "enemy" && unit.type === "settler")) {
        return { ok: false, reason: "enemy-settler-should-be-consumed" };
      }

      // Advance until player gets a warrior from city production.
      let turnLoops = 0;
      while (turnLoops < 10) {
        const state = getState();
        const playerWarrior = getUnit(state, "player", "warrior");
        if (playerWarrior) {
          break;
        }
        if (!window.__hexfallTest.endTurnImmediate()) {
          return { ok: false, reason: "failed-to-advance-for-player-warrior" };
        }
        turnLoops += 1;
      }

      const withWarrior = getState();
      const playerWarrior = getUnit(withWarrior, "player", "warrior");
      const enemyCity = withWarrior.cities.find((city) => city.owner === "enemy");
      if (!playerWarrior || !enemyCity) {
        return { ok: false, reason: "missing-warrior-or-enemy-city" };
      }

      // Attack enemy city until resolution is pending.
      let pendingLoops = 0;
      while (pendingLoops < 7) {
        const state = getState();
        const attacker = getUnit(state, "player", "warrior");
        const targetCity = state.cities.find((city) => city.id === enemyCity.id);
        if (!attacker || !targetCity) {
          return { ok: false, reason: "attacker-or-city-missing-before-resolution" };
        }
        if (state.pendingCityResolution) {
          break;
        }
        if (attacker.hasActed || attacker.movementRemaining <= 0) {
          if (!window.__hexfallTest.endTurnImmediate()) {
            return { ok: false, reason: "failed-to-refresh-warrior-before-city-attack" };
          }
          pendingLoops += 1;
          continue;
        }

        const candidateHexes = [
          { q: targetCity.q + 1, r: targetCity.r },
          { q: targetCity.q + 1, r: targetCity.r - 1 },
          { q: targetCity.q, r: targetCity.r - 1 },
          { q: targetCity.q - 1, r: targetCity.r },
          { q: targetCity.q - 1, r: targetCity.r + 1 },
          { q: targetCity.q, r: targetCity.r + 1 },
        ];
        let positioned = false;
        for (const hex of candidateHexes) {
          if (window.__hexfallTest.setUnitPosition(attacker.id, hex.q, hex.r)) {
            positioned = true;
            break;
          }
        }
        if (!positioned) {
          return { ok: false, reason: "failed-to-position-warrior-for-city-attack" };
        }

        window.__hexfallTest.selectUnit(attacker.id);
        const attackedCity = window.__hexfallTest.attackCity(targetCity.id);
        if (!attackedCity) {
          return { ok: false, reason: "city-attack-failed" };
        }

        const postAttack = getState();
        if (postAttack.pendingCityResolution) {
          break;
        }
        if (!window.__hexfallTest.endTurnImmediate()) {
          return { ok: false, reason: "failed-to-refresh-turn-between-city-attacks" };
        }
        pendingLoops += 1;
      }

      const withPending = getState();
      if (!withPending.pendingCityResolution) {
        return { ok: false, reason: "city-resolution-never-opened" };
      }
      const cityModal = window.__hexfallTest.getCityResolutionModalState();
      if (
        !cityModal?.open ||
        !cityModal.captureVisible ||
        !cityModal.razeVisible ||
        cityModal.captureDepth <= cityModal.panelDepth
      ) {
        return { ok: false, reason: "city-resolution-modal-not-visible" };
      }

      // Resolve by razing the city.
      const resolved = window.__hexfallTest.chooseCityOutcome("raze");
      if (!resolved) {
        return { ok: false, reason: "city-resolution-raze-failed" };
      }
      const afterResolution = getState();
      if (afterResolution.pendingCityResolution) {
        return { ok: false, reason: "city-resolution-did-not-close" };
      }
      if (afterResolution.cities.some((city) => city.id === enemyCity.id)) {
        return { ok: false, reason: "enemy-city-was-not-removed" };
      }

      // Finish domination if enemy units remain.
      let combatLoops = 0;
      while (combatLoops < 30) {
        const state = getState();
        if (state.match.status !== "ongoing") {
          break;
        }
        const enemyUnits = state.units.filter((unit) => unit.owner === "enemy");
        if (enemyUnits.length === 0) {
          break;
        }

        const attacker = [...state.units]
          .filter((unit) => unit.owner === "player")
          .sort((a, b) => b.attack - a.attack || b.health - a.health)[0];
        if (!attacker) {
          if (!window.__hexfallTest.endTurnImmediate()) {
            return { ok: false, reason: "no-player-attacker-and-cannot-advance" };
          }
          combatLoops += 1;
          continue;
        }

        const arranged = window.__hexfallTest.arrangeCombatSkirmish(attacker.id, enemyUnits[0].id);
        if (!arranged) {
          return { ok: false, reason: "failed-to-arrange-unit-combat" };
        }
        window.__hexfallTest.selectUnit(attacker.id);
        const attacked = window.__hexfallTest.attackTarget(enemyUnits[0].id);
        if (!attacked) {
          return { ok: false, reason: "failed-to-attack-enemy-unit" };
        }

        if (getState().match.status === "ongoing") {
          if (!window.__hexfallTest.endTurnImmediate()) {
            return { ok: false, reason: "failed-to-advance-between-unit-combat" };
          }
        }
        combatLoops += 1;
      }

      const finalState = getState();
      if (finalState.match.status !== "won" || finalState.match.reason !== "elimination") {
        return { ok: false, reason: "final-state-not-domination-win", finalState };
      }

      return { ok: true, finalState };
    });

    assert.equal(scenarioResult.ok, true, `scenario failed: ${scenarioResult.reason}`);
    const finalState = scenarioResult.finalState;
    assert.ok(finalState, "final state should be available");
    assert.equal(finalState.match.status, "won", "scenario should end in victory");
    assert.equal(finalState.match.reason, "elimination", "victory should be domination-only");

    const canvas = page.locator("canvas");
    await canvas.waitFor({ state: "visible" });
    await canvas.screenshot({ path: `${ARTIFACT_DIR}/smoke.png` });

    assert.equal(consoleErrors.length, 0, `console errors found:\n${consoleErrors.join("\n")}`);

    console.log("E2E smoke test passed.");
  } finally {
    await cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
