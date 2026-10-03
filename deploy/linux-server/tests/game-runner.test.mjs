import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWineLaunch, decodeWorkerPayload } from "../../unix-common/game-runner.mjs";
import { buildSshLaunch } from "../../openbsd-server/launch-gameserver.mjs";

function exe(file) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "#!/bin/sh\nexit 0\n");
  chmodSync(file, 0o755);
  return file;
}

test("Linux runner keeps deploy arguments and forces native dxgi", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dr-unix-runner-"));
  try {
    const game = exe(path.join(root, "game", "Dauntless-Win64-Shipping.exe"));
    const wine = exe(path.join(root, "bin", "wine64"));
    const spec = buildWineLaunch(["secret", "8777", "/Game/Maps/ramsgate/ramsgate_01_persistent"], {
      PATH: path.dirname(wine),
      DISPLAY: ":99",
      DR_GAME_EXE: game,
      DR_WINEPREFIX: path.join(root, "prefix"),
      WINEDLLOVERRIDES: "foo=n",
    });
    assert.equal(spec.command, wine);
    assert.deepEqual(spec.args.slice(0, 4), [game, "secret", "8777", "/Game/Maps/ramsgate/ramsgate_01_persistent"]);
    assert.match(spec.env.WINEDLLOVERRIDES, /dxgi=n,b/);
    assert.match(spec.env.WINEDLLOVERRIDES, /foo=n/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit Proton takes priority and receives its own compat-data path", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dr-unix-proton-"));
  try {
    const game = exe(path.join(root, "game", "Dauntless-Win64-Shipping.exe"));
    const proton = exe(path.join(root, "Steam", "compatibilitytools.d", "GE-Proton10-1", "proton"));
    const compat = path.join(root, "compat");
    const spec = buildWineLaunch(["x","1","m","b","h","p","a","-server"], {
      PATH: "",
      DISPLAY: ":99",
      HOME: root,
      DR_GAME_EXE: game,
      DR_PROTON_BINARY: proton,
      DR_PROTON_COMPAT_DATA: compat,
      DR_WINE_BINARY: "/does/not/exist",
    });
    assert.equal(spec.command, proton);
    assert.deepEqual(spec.args.slice(0, 2), ["run", game]);
    assert.equal(spec.env.STEAM_COMPAT_DATA_PATH, compat);
    assert.equal(spec.env.STEAM_COMPAT_CLIENT_INSTALL_PATH, path.join(root, "Steam"));
    assert.match(spec.env.WINEDLLOVERRIDES, /dxgi=n,b/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Linux runner uses Xvfb when a server has no display", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dr-unix-xvfb-"));
  try {
    const game = exe(path.join(root, "game", "Dauntless-Win64-Shipping.exe"));
    const wine = exe(path.join(root, "bin", "wine"));
    const xvfb = exe(path.join(root, "bin", "xvfb-run"));
    const spec = buildWineLaunch(["x","1","m","b","h","p","a","-server"], {
      PATH: path.dirname(wine),
      DR_GAME_EXE: game,
      DR_WINEPREFIX: path.join(root, "prefix"),
    });
    assert.equal(spec.command, xvfb);
    assert.ok(spec.args.includes(wine));
    assert.ok(spec.args.includes(game));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("worker payload round trips", () => {
  const args = ["a".repeat(48), "8777", "/Game/Map", "NO_BEHEMOTH", "NO_MM_HUNTID", "NO_EXPECTED_PLAYERS", "203.0.113.2:8777", "-server"];
  const payload = Buffer.from(JSON.stringify(args)).toString("base64url");
  assert.deepEqual(decodeWorkerPayload(payload), args);
});

test("OpenBSD launcher sends one encoded payload over batch SSH", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dr-openbsd-link-"));
  try {
    const ssh = exe(path.join(root, "bin", "ssh"));
    const args = ["k".repeat(48), "8777", "/Game/Map", "NO_BEHEMOTH", "NO_MM_HUNTID", "NO_EXPECTED_PLAYERS", "198.51.100.5:8777", "-server"];
    const spec = buildSshLaunch(args, {
      PATH: path.dirname(ssh),
      DR_WORKER_HOST: "10.0.0.2",
      DR_WORKER_USER: "dauntless",
      DR_WORKER_COMMAND: "dr-game-worker",
    });
    assert.equal(spec.command, ssh);
    assert.ok(spec.args.includes("dauntless@10.0.0.2"));
    assert.deepEqual(decodeWorkerPayload(spec.payload), args);
    assert.equal(spec.args.filter((v) => v === args[0]).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
