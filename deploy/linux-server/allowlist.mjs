#!/usr/bin/env node
import { accessSync, constants as fsConstants } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { runUnixAllowlist } from "../unix-common/allowlist-core.mjs";

function executable(file) {
  try { accessSync(file, fsConstants.X_OK); return true; } catch { return false; }
}
function findNft(env) {
  const explicit = env.DR_NFT_BINARY;
  if (explicit) return executable(explicit) ? explicit : null;
  for (const dir of (env.PATH || "").split(path.delimiter)) {
    const candidate = path.join(dir, "nft");
    if (dir && executable(candidate)) return candidate;
  }
  for (const candidate of ["/usr/sbin/nft", "/sbin/nft"]) if (executable(candidate)) return candidate;
  return null;
}
function runNft(nft, script) {
  return new Promise((resolve, reject) => {
    const child = spawn(nft, ["-f", "-"], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("nft failed: " + stderr.trim())));
    child.stdin.end(script);
  });
}
let preparedKey = null;

async function ensureTable(nft, config) {
  const table = process.env.DR_NFT_TABLE || "dauntless_revived";
  if (!/^[a-zA-Z0-9_]{1,32}$/.test(table)) throw new Error("DR_NFT_TABLE is invalid");
  const iface = process.env.DR_FIREWALL_INTERFACE;
  if (iface && !/^[A-Za-z0-9_.:@-]{1,32}$/.test(iface)) throw new Error("DR_FIREWALL_INTERFACE is invalid");
  const iif = iface ? 'iifname "' + iface + '" ' : "";
  const key = [table, iface ?? "", config.low, config.high].join(":");
  if (preparedKey === key) return table;
  const exists = spawnSync(nft, ["list", "table", "inet", table], { stdio: "ignore" }).status === 0;
  if (exists) await runNft(nft, "delete table inet " + table + "\n");
  const script =
    "add table inet " + table + "\n" +
    "add set inet " + table + " players4 { type ipv4_addr; }\n" +
    "add set inet " + table + " players6 { type ipv6_addr; }\n" +
    "add chain inet " + table + " input { type filter hook input priority -5; policy accept; }\n" +
    "add rule inet " + table + " input " + iif + "ip saddr @players4 udp dport " + config.low + "-" + config.high + " accept\n" +
    "add rule inet " + table + " input " + iif + "ip6 saddr @players6 udp dport " + config.low + "-" + config.high + " accept\n" +
    "add rule inet " + table + " input " + iif + "udp dport " + config.low + "-" + config.high + " drop\n";
  await runNft(nft, script);
  preparedKey = key;
  return table;
}
async function apply(ips, config) {
  const nft = findNft(process.env);
  if (!nft) throw new Error("nft was not found");
  const table = await ensureTable(nft, config);
  const v4 = ips.filter((ip) => net.isIP(ip) === 4);
  const v6 = ips.filter((ip) => net.isIP(ip) === 6);
  let script = "flush set inet " + table + " players4\nflush set inet " + table + " players6\n";
  if (v4.length) script += "add element inet " + table + " players4 { " + v4.join(", ") + " }\n";
  if (v6.length) script += "add element inet " + table + " players6 { " + v6.join(", ") + " }\n";
  await runNft(nft, script);
}
runUnixAllowlist({ backendName: "linux-nftables", apply }).catch((error) => {
  process.stderr.write("linux allowlist: " + (error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(1);
});
