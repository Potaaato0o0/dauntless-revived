#!/usr/bin/env node
import { accessSync, constants as fsConstants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

function executable(file) {
  try { accessSync(file, fsConstants.X_OK); return true; } catch { return false; }
}

function findOnPath(name, env) {
  if (name.includes("/")) return executable(name) ? path.resolve(name) : null;
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, name);
    if (executable(file)) return file;
  }
  return null;
}

function required(env, name, pattern) {
  const value = env[name];
  if (!value || !pattern.test(value)) throw new Error(name + " is missing or invalid");
  return value;
}

export function buildSshLaunch(gameArgs, env = process.env) {
  if (!Array.isArray(gameArgs) || gameArgs.length < 8 || !gameArgs.every((v) => typeof v === "string" && v.length <= 4096 && !v.includes("\0"))) {
    throw new Error("invalid game-server arguments");
  }
  const ssh = findOnPath(env.DR_WORKER_SSH ?? "ssh", env);
  if (!ssh) throw new Error("ssh was not found");
  const host = required(env, "DR_WORKER_HOST", /^[A-Za-z0-9_.:-]{1,255}$/);
  const user = required(env, "DR_WORKER_USER", /^[A-Za-z0-9_.-]{1,64}$/);
  const remoteCommand = env.DR_WORKER_COMMAND || "dr-game-worker";
  if (!/^[A-Za-z0-9_./-]{1,255}$/.test(remoteCommand)) throw new Error("DR_WORKER_COMMAND is invalid");
  const payload = Buffer.from(JSON.stringify(gameArgs), "utf8").toString("base64url");
  const args = [
    "-T",
    "-o", "BatchMode=yes",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=3",
  ];
  const key = env.DR_WORKER_KEY;
  if (key) {
    if (!path.isAbsolute(key)) throw new Error("DR_WORKER_KEY must be an absolute path");
    args.push("-i", key);
  }
  args.push(user + "@" + host, remoteCommand, payload);
  return { command: ssh, args, payload };
}

async function main() {
  const spec = buildSshLaunch(process.argv.slice(2));
  const child = spawn(spec.command, spec.args, { stdio: "inherit" });
  const forward = (signal) => {
    if (!child.killed) {
      try { child.kill(signal); } catch {}
    }
  };
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, () => forward(signal));
  child.once("error", (error) => {
    process.stderr.write("dauntless OpenBSD worker link: " + error.message + "\n");
    process.exitCode = 127;
  });
  child.once("exit", (code, signal) => {
    if (signal) process.stderr.write("dauntless OpenBSD worker link exited on " + signal + "\n");
    process.exitCode = code ?? 1;
  });
}

if (import.meta.url === new URL("file://" + process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write("dauntless OpenBSD game launcher: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 127;
  });
}
