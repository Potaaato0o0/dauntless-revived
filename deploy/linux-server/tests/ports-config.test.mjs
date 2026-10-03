import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repo = path.resolve(import.meta.dirname, "..", "..", "..");
const generator = path.join(repo, "deploy", "unix-common", "generate-config.mjs");
const pf = path.join(repo, "deploy", "openbsd-server", "configure-pf.ksh");

function envFile(file) {
  const out = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!raw || raw.startsWith("#") || !raw.includes("=")) continue;
    const i = raw.indexOf("=");
    let value = raw.slice(i + 1);
    if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch {}
    }
    out[raw.slice(0, i)] = value;
  }
  return out;
}

function runGenerator(platform, root, extra = []) {
  const data = path.join(root, "data");
  const config = path.join(root, "config");
  const game = path.join(root, "game");
  mkdirSync(game, { recursive: true });
  const args = [
    generator,
    "--platform", platform,
    "--root", repo,
    "--data", data,
    "--config", config,
    "--game-dir", game,
    "--my-ip", platform === "linux" ? "127.0.0.1" : "203.0.113.10",
    "--mode", platform === "linux" ? "private" : "public",
    ...extra,
  ];
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return { data, config };
}

test("Linux config uses the Linux game wrapper and no worker SSH settings", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dr-linux-config-"));
  try {
    const { config } = runGenerator("linux", root, ["--xvfb", "0"]);
    const deploy = envFile(path.join(config, "deployserver.env"));
    const content = envFile(path.join(config, "content.env"));
    assert.match(deploy.GAMESERVER_BINARY_PATH, /deploy\/linux-server\/launch-gameserver\.mjs$/);
    assert.equal(deploy.DR_GAME_EXE, path.join(root, "game", "Archon", "Binaries", "Win64", "Dauntless-Win64-Shipping.exe"));
    assert.equal(deploy.DR_XVFB, "0");
    assert.equal(deploy.DR_PROTON_COMPAT_DATA, path.join(root, "data", "proton"));
    assert.equal(deploy.DR_WORKER_HOST, undefined);
    assert.equal(content.BIND_HOST, "127.0.0.1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("OpenBSD config keeps gateway unprivileged and launches games through SSH worker", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dr-openbsd-config-"));
  try {
    const key = path.join(root, "worker.key");
    writeFileSync(key, "test\n");
    const { config } = runGenerator("openbsd", root, [
      "--worker-host", "10.0.0.2",
      "--worker-user", "dauntless",
      "--worker-key", key,
      "--worker-command", "dr-game-worker",
    ]);
    const deploy = envFile(path.join(config, "deployserver.env"));
    const gateway = envFile(path.join(config, "gateway.env"));
    const allowlist = envFile(path.join(config, "allowlist.env"));
    assert.match(deploy.GAMESERVER_BINARY_PATH, /deploy\/openbsd-server\/launch-gameserver\.mjs$/);
    assert.equal(deploy.DR_WORKER_HOST, "10.0.0.2");
    assert.equal(deploy.DR_WORKER_COMMAND, "dr-game-worker");
    assert.equal(gateway.GATEWAY_BIND, "127.0.0.1");
    assert.equal(gateway.GATEWAY_PORT, "61443");
    assert.equal(allowlist.DR_PF_ANCHOR, "dauntless-revived");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("OpenBSD PF config redirects TLS and source-NATs allowed game UDP to the Linux worker", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dr-pf-config-"));
  try {
    const out = path.join(root, "pf.conf");
    const result = spawnSync("bash", [
      pf,
      "--mode", "public",
      "--interface", "em0",
      "--worker-interface", "vether0",
      "--worker-ip", "10.0.0.2",
      "--gateway-port", "443",
      "--udp-begin", "8770",
      "--udp-end", "8777",
      "--output", out,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const rules = readFileSync(out, "utf8");
    assert.match(rules, /table <dauntless_revived_players> persist/);
    assert.match(rules, /port 443 rdr-to 127\.0\.0\.1 port 61443/);
    assert.match(rules, /from <dauntless_revived_players>.*8770:8777 rdr-to 10\.0\.0\.2/);
    assert.match(rules, /received-on em0 nat-to \(vether0\)/);
    assert.match(rules, /block in quick.*8770:8777/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
