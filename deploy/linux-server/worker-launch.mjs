#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { decodeWorkerPayload, runWineGame } from "../unix-common/game-runner.mjs";

function loadWorkerEnv(file = process.env.DR_WORKER_ENV || "/etc/dauntless-revived-worker.env") {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    let value = line.slice(index + 1);
    if (value.startsWith('"') && value.endsWith('"')) { try { value = JSON.parse(value); } catch {} }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadWorkerEnv();

try {
  const args = decodeWorkerPayload(process.argv[2]);
  process.exitCode = await runWineGame(args);
} catch (error) {
  process.stderr.write("dauntless linux worker: " + (error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 127;
}
