import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error("unexpected argument " + key);
    const name = key.slice(2);
    const value = argv[++i];
    if (value === undefined) throw new Error("missing value for " + key);
    out[name] = value;
  }
  return out;
}
function required(args, name) {
  const value = args[name];
  if (!value) throw new Error("--" + name + " is required");
  return value;
}
function readEnv(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index);
      let value = line.slice(index + 1);
      if (value.startsWith('"') && value.endsWith('"')) {
        try { value = JSON.parse(value); } catch {}
      }
      out[key] = value;
    }
  } catch {}
  return out;
}
function line(key, value) {
  if (value === undefined || value === null) return null;
  const text = String(value);
  if (text.includes("\n") || text.includes("\r")) throw new Error("env value contains a newline: " + key);
  const safe = /^[A-Za-z0-9_./:@,+-]*$/.test(text);
  return key + "=" + (safe ? text : JSON.stringify(text));
}
function writeEnv(file, values) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = Object.entries(values).map(([k,v]) => line(k,v)).filter(Boolean).join("\n") + "\n";
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}
function secretFile(file, bytes) {
  try {
    const value = fs.readFileSync(file, "utf8").trim();
    if (value.length >= bytes * 2) return value;
  } catch {}
  const value = crypto.randomBytes(bytes).toString("hex");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value + "\n", { mode: 0o600 });
  return value;
}
function signing(existing) {
  if (existing.AUTH_SIGNING_PRIVKEY_B64 && existing.AUTH_SIGNING_PUBKEY_B64) {
    return [existing.AUTH_SIGNING_PRIVKEY_B64, existing.AUTH_SIGNING_PUBKEY_B64];
  }
  const pair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return [Buffer.from(pair.privateKey).toString("base64"), Buffer.from(pair.publicKey).toString("base64")];
}

const args = parseArgs(process.argv.slice(2));
const platform = required(args, "platform");
if (platform !== "linux" && platform !== "openbsd") throw new Error("--platform must be linux or openbsd");
const mode = args.mode || "private";
if (mode !== "private" && mode !== "public") throw new Error("--mode must be private or public");
const root = path.resolve(required(args, "root"));
const data = path.resolve(required(args, "data"));
const config = path.resolve(required(args, "config"));
const game = path.resolve(required(args, "game-dir"));
const myIp = required(args, "my-ip");
const serverName = args["server-name"] || "Dauntless Revived";
const externalGatewayPort = Number(args["gateway-port"] || 443);
if (!Number.isInteger(externalGatewayPort) || externalGatewayPort < 1 || externalGatewayPort > 65535) throw new Error("bad gateway port");
const udpBegin = Number(args["udp-begin"] || 8770);
const udpEnd = Number(args["udp-end"] || 8777);
if (!Number.isInteger(udpBegin) || !Number.isInteger(udpEnd) || udpBegin < 1 || udpEnd > 65535 || udpBegin > udpEnd - 2) throw new Error("bad UDP range");

fs.mkdirSync(data, { recursive: true, mode: 0o700 });
fs.mkdirSync(config, { recursive: true, mode: 0o700 });
fs.mkdirSync(path.join(data, "logs"), { recursive: true });
fs.mkdirSync(path.join(data, "branding"), { recursive: true });
fs.mkdirSync(path.join(data, "tls"), { recursive: true });
if (!fs.existsSync(path.join(data, "news.json"))) fs.writeFileSync(path.join(data, "news.json"), '{ "items": [] }\n');

let commit = "unknown";
try { commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch {}

const metaFile = path.join(config, "metagame.env");
const oldMeta = readEnv(metaFile);
const [priv, pub] = signing(oldMeta);
const gsKey = secretFile(path.join(data, "gameserver.key"), 24);
const gatewaySecret = secretFile(path.join(data, "gateway.secret"), 32);
const allowlistSecret = secretFile(path.join(data, "allowlist.secret"), 32);

const metagame = {
  PORT: 61000,
  BIND_HOST: mode === "public" ? "127.0.0.1" : myIp,
  NODE_ENV: "production",
  AUTH_MODE: "APIKEY",
  AUTH_SIGNING_PRIVKEY_B64: priv,
  AUTH_SIGNING_PUBKEY_B64: pub,
  REGISTRATION_MODE: "INVITECODE",
  DB_FILENAME: path.join(data, "undaunted.db"),
  MATCHMAKING_MODE: "DEPLOYSERVER",
  DEPLOYSERVER_URL: "127.0.0.1:61001",
  QOS_TARGET_URL: mode === "public" ? "http://127.0.0.1:61000/QoS" : "http://" + myIp + ":61000/QoS",
  TARGET_CHANGELIST: 239827,
  SERVER_NAME: serverName,
  SOURCE_URL: "https://github.com/mixutin/dauntless-revived",
  GIT_COMMIT: commit,
  CONTENT_PORT: 61002,
  BODY_LOG_FILE: path.join(data, "logs", "bodies.log"),
  LOG_BODIES: 0,
  CHAT: 1,
  CHAT_PORT: 61099,
  CHAT_BIND_HOST: mode === "public" ? "127.0.0.1" : myIp,
  ...(mode === "public" ? { GATEWAY_SECRET: gatewaySecret } : {}),
};
writeEnv(metaFile, metagame);

const deploy = {
  PORT: 61001,
  BIND_HOST: "127.0.0.1",
  MY_IP: myIp,
  PORT_RANGE_BEGIN: udpBegin,
  PORT_RANGE_END: udpEnd,
  GAMESERVER_BINARY_PATH: platform === "linux"
    ? path.join(root, "deploy", "linux-server", "launch-gameserver.mjs")
    : path.join(root, "deploy", "openbsd-server", "launch-gameserver.mjs"),
  METAGAME_API_KEY: gsKey,
  SECONDS_TO_WAIT_BETWEEN_GAMESERVER_STARTUP: args["startup-gap"] || 10,
  ENABLE_DOJO: args["enable-dojo"] || 0,
  NODE_ENV: "production",
};
if (platform === "linux") {
  deploy.DR_GAME_EXE = path.join(game, "Archon", "Binaries", "Win64", "Dauntless-Win64-Shipping.exe");
  deploy.DR_WINEPREFIX = path.join(data, "wineprefix");
  deploy.DR_PROTON_COMPAT_DATA = args["proton-data"] ? path.resolve(args["proton-data"]) : path.join(data, "proton");
  deploy.DR_XVFB = args.xvfb || 1;
  if (args.proton) deploy.DR_PROTON_BINARY = args.proton;
  if (args.wine) deploy.DR_WINE_BINARY = args.wine;
} else {
  deploy.DR_WORKER_HOST = required(args, "worker-host");
  deploy.DR_WORKER_USER = args["worker-user"] || "dauntless";
  deploy.DR_WORKER_KEY = path.resolve(required(args, "worker-key"));
  deploy.DR_WORKER_COMMAND = args["worker-command"] || "dr-game-worker";
}
writeEnv(path.join(config, "deployserver.env"), deploy);

const localMetaUrl = mode === "public" ? "http://127.0.0.1:61000" : "http://" + myIp + ":61000";
writeEnv(path.join(config, "content.env"), {
  PORT: 61002,
  BIND_HOST: mode === "public" || myIp === "127.0.0.1" ? "127.0.0.1" : "127.0.0.1," + myIp,
  METAGAME_URL: localMetaUrl,
  CONTENT_GAME_DIR: game,
  CONTENT_BRANDING_DIR: path.join(data, "branding"),
  CONTENT_NEWS_FILE: path.join(data, "news.json"),
  NODE_ENV: "production",
});

if (mode === "public") {
  const internalGatewayPort = platform === "openbsd" ? 61443 : externalGatewayPort;
  writeEnv(path.join(config, "gateway.env"), {
    GATEWAY_BIND: platform === "openbsd" ? "127.0.0.1" : "0.0.0.0",
    GATEWAY_PORT: internalGatewayPort,
    GATEWAY_CERT: path.join(data, "tls", "gateway-cert.pem"),
    GATEWAY_KEY: path.join(data, "tls", "gateway-key.pem"),
    GATEWAY_SECRET: gatewaySecret,
    GATEWAY_METAGAME_URL: "http://127.0.0.1:61000",
    GATEWAY_CONTENT_URL: "http://127.0.0.1:61002",
    GATEWAY_WS_URL: "http://127.0.0.1:61099",
    ALLOWLIST_URL: "http://127.0.0.1:61005",
    ALLOWLIST_SECRET: allowlistSecret,
    NODE_ENV: "production",
  });
  writeEnv(path.join(config, "allowlist.env"), {
    ALLOWLIST_BIND: "127.0.0.1",
    ALLOWLIST_PORT: 61005,
    ALLOWLIST_SECRET: allowlistSecret,
    ALLOWLIST_PORTS: String(udpBegin) + "-" + String(udpEnd),
    ALLOWLIST_TTL_SECONDS: 600,
    ALLOWLIST_MAX_ENTRIES: 256,
    ALLOWLIST_DRY_RUN: 0,
    ALLOWLIST_AUDIT_LOG: path.join(data, "logs", "allowlist-audit.log"),
    ALLOWLIST_STATE_FILE: path.join(data, "allowlist-state.json"),
    DR_GATEWAY_DIR: path.join(root, "UndauntedGateway"),
    ...(platform === "linux" ? {
      DR_NFT_TABLE: "dauntless_revived",
      ...(args["firewall-interface"] ? { DR_FIREWALL_INTERFACE: args["firewall-interface"] } : {}),
    } : {
      DR_PF_TABLE: "dauntless_revived_players",
      DR_PF_ANCHOR: "dauntless-revived",
    }),
  });
}
fs.writeFileSync(path.join(config, "server.conf"), [
  "DR_PLATFORM=" + platform,
  "DR_MODE=" + mode,
  "DR_ROOT=" + root,
  "DR_DATA=" + data,
  "DR_CONFIG=" + config,
  "DR_GAME_DIR=" + game,
  "DR_MY_IP=" + myIp,
  "DR_GATEWAY_EXTERNAL_PORT=" + externalGatewayPort,
  "DR_UDP_BEGIN=" + udpBegin,
  "DR_UDP_END=" + udpEnd,
].join("\n") + "\n", { mode: 0o600 });

process.stdout.write("configuration written to " + config + "\n");
