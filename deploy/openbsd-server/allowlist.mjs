#!/usr/bin/env node
import { accessSync, constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { runUnixAllowlist } from "../unix-common/allowlist-core.mjs";

function executable(file) {
  try { accessSync(file, fsConstants.X_OK); return true; } catch { return false; }
}
function findPfctl(env) {
  const explicit = env.DR_PFCTL_BINARY;
  if (explicit) return executable(explicit) ? explicit : null;
  for (const candidate of ["/sbin/pfctl", "/usr/sbin/pfctl"]) if (executable(candidate)) return candidate;
  for (const dir of (env.PATH || "").split(path.delimiter)) {
    const candidate = path.join(dir, "pfctl");
    if (dir && executable(candidate)) return candidate;
  }
  return null;
}
function runPfctl(pfctl, anchor, table, ips) {
  return new Promise((resolve, reject) => {
    const child = spawn(pfctl, ["-a", anchor, "-t", table, "-T", "replace", "-f", "-"], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("pfctl failed: " + stderr.trim())));
    child.stdin.end(ips.join("\n") + (ips.length ? "\n" : ""));
  });
}
async function apply(ips) {
  const pfctl = findPfctl(process.env);
  if (!pfctl) throw new Error("pfctl was not found");
  const table = process.env.DR_PF_TABLE || "dauntless_revived_players";
  const anchor = process.env.DR_PF_ANCHOR || "dauntless-revived";
  if (!/^[a-zA-Z0-9_]{1,32}$/.test(table)) throw new Error("DR_PF_TABLE is invalid");
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(anchor)) throw new Error("DR_PF_ANCHOR is invalid");
  await runPfctl(pfctl, anchor, table, ips);
}
runUnixAllowlist({ backendName: "openbsd-pf", apply }).catch((error) => {
  process.stderr.write("OpenBSD allowlist: " + (error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(1);
});
