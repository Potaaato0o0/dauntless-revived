#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function parseEnv(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    out[line.slice(0, index)] = line.slice(index + 1).replace(/^"|"$/g, "");
  }
  return out;
}
function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error("unexpected argument " + key);
    out[key.slice(2)] = argv[++i];
  }
  return out;
}
function cleanName(value) {
  const name = String(value ?? "").trim();
  if (!/^[ -~]{1,64}$/.test(name) || /[&=#]/.test(name)) throw new Error("--name must be 1-64 printable characters without &=#");
  return name;
}

const opt = args(process.argv.slice(2));
const configDir = path.resolve(opt.config || "/etc/dauntless-revived");
const conf = parseEnv(path.join(configDir, "server.conf"));
const meta = parseEnv(path.join(configDir, "metagame.env"));
const root = conf.DR_ROOT;
const data = conf.DR_DATA;
if (!root || !data || !conf.DR_MODE || !conf.DR_MY_IP) throw new Error("server.conf is incomplete");
const name = cleanName(opt.name || "Slayer");
const code = crypto.randomBytes(10).toString("hex");

execFileSync(process.execPath, [
  path.join(root, "deploy", "unix-common", "dr-db.cjs"),
  "add-invite",
  path.join(root, "UndauntedMetagame"),
  meta.DB_FILENAME,
  code,
], { stdio: ["ignore", "ignore", "inherit"] });

if (conf.DR_MODE === "public") {
  const cert = path.join(data, "tls", "gateway-cert.pem");
  const x509 = new crypto.X509Certificate(fs.readFileSync(cert));
  const fp = crypto.createHash("sha256").update(x509.raw).digest("hex");
  const port = conf.DR_GATEWAY_EXTERNAL_PORT || "443";
  const query = new URLSearchParams({
    v: "2",
    mode: "public",
    host: conf.DR_MY_IP,
    port,
    fp,
    code,
    name,
  });
  process.stdout.write("dauntless-revived://join?" + query.toString() + "\n");
} else {
  const query = new URLSearchParams({
    v: "1",
    host: conf.DR_MY_IP,
    port: "61000",
    code,
    name,
  });
  process.stdout.write("dauntless-revived://join?" + query.toString() + "\n");
}
