import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const MAX_BODY = 1024;

function intEnv(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(name + " must be " + min + "-" + max);
  return value;
}

function secretOk(given, expected) {
  if (typeof given !== "string") return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}

export function loadUnixAllowlistConfig(env = process.env) {
  const bindHost = env.ALLOWLIST_BIND || "127.0.0.1";
  if (bindHost !== "127.0.0.1" && bindHost !== "::1") throw new Error("ALLOWLIST_BIND must be loopback");
  const secret = env.ALLOWLIST_SECRET;
  if (!secret || secret.length < 32 || secret.length > 256 || /\s/.test(secret)) throw new Error("ALLOWLIST_SECRET must be 32-256 non-space characters");
  const ports = env.ALLOWLIST_PORTS || "8770-8777";
  const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(ports);
  if (!match) throw new Error("ALLOWLIST_PORTS must be a port or low-high range");
  const low = Number(match[1]);
  const high = Number(match[2] ?? match[1]);
  if (low < 1 || high > 65535 || low > high) throw new Error("ALLOWLIST_PORTS is invalid");
  const root = path.resolve(env.DR_GATEWAY_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "UndauntedGateway"));
  const require = createRequire(import.meta.url);
  const { CheckAllowlistIp } = require(path.join(root, "dist", "ip.js"));
  return {
    bindHost,
    port: intEnv(env, "ALLOWLIST_PORT", 61005, 1, 65535),
    secret,
    ports: low === high ? String(low) : String(low) + "-" + String(high),
    low,
    high,
    ttlMs: intEnv(env, "ALLOWLIST_TTL_SECONDS", 600, 1, 86400) * 1000,
    maxEntries: intEnv(env, "ALLOWLIST_MAX_ENTRIES", 256, 1, 1000),
    allowPrivate: env.ALLOWLIST_ALLOW_PRIVATE === "1",
    auditLog: path.resolve(env.ALLOWLIST_AUDIT_LOG || "allowlist-audit.log"),
    stateFile: path.resolve(env.ALLOWLIST_STATE_FILE || "allowlist-state.json"),
    dryRun: env.ALLOWLIST_DRY_RUN === "1",
    CheckAllowlistIp,
  };
}

export async function runUnixAllowlist({ backendName, apply, env = process.env }) {
  const config = loadUnixAllowlistConfig(env);
  const entries = new Map();
  let timer;
  let stopped = false;

  fs.mkdirSync(path.dirname(config.auditLog), { recursive: true });
  fs.mkdirSync(path.dirname(config.stateFile), { recursive: true });

  const audit = (event, fields = {}) => {
    const line = JSON.stringify({ t: new Date().toISOString(), event, backend: backendName, ...fields });
    fs.appendFileSync(config.auditLog, line + "\n");
  };

  const save = () => {
    const tmp = config.stateFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries: [...entries].map(([ip, expiresAt]) => ({ ip, expiresAt })) }), { mode: 0o600 });
    fs.renameSync(tmp, config.stateFile);
  };

  const live = (now = Date.now()) => {
    let changed = false;
    for (const [ip, expiresAt] of entries) {
      if (expiresAt <= now) {
        entries.delete(ip);
        audit("expired", { ip });
        changed = true;
      }
    }
    if (changed) save();
    return [...entries.keys()].sort();
  };

  const applyNow = async () => {
    const ips = live();
    if (config.dryRun) {
      audit("dry_run", { ips, ports: config.ports });
      return;
    }
    await apply(ips, config);
    audit("rule_applied", { ips, ports: config.ports });
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    if (entries.size === 0) return;
    const next = Math.min(...entries.values());
    timer = setTimeout(async () => {
      try { await applyNow(); } catch (error) { audit("rule_failed", { error: error instanceof Error ? error.message : String(error) }); }
      schedule();
    }, Math.max(10, next - Date.now() + 10));
    timer.unref();
  };

  try {
    const saved = JSON.parse(fs.readFileSync(config.stateFile, "utf8"));
    if (Array.isArray(saved?.entries)) {
      for (const item of saved.entries) {
        const check = config.CheckAllowlistIp(item?.ip, config.allowPrivate);
        if (check.ok && Number.isFinite(item?.expiresAt) && item.expiresAt > Date.now() && entries.size < config.maxEntries) {
          entries.set(check.ip.canonical, Math.min(item.expiresAt, Date.now() + config.ttlMs));
        }
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") audit("state_unreadable", { error: error instanceof Error ? error.message : String(error) });
  }

  await applyNow();
  schedule();
  audit("start", { restored: entries.size, ports: config.ports, dryRun: config.dryRun });

  if (process.argv.includes("--close-ports")) {
    entries.clear();
    save();
    await applyNow();
    return;
  }

  const server = http.createServer((req, res) => {
    if (!isLoopback(req.socket.remoteAddress)) return json(res, 403, { error: "forbidden" });
    const url = (req.url || "").split("?")[0];
    if (url !== "/allow" && url !== "/status") return json(res, 404, { error: "not_found" });
    if (!secretOk(req.headers["x-allowlist-secret"], config.secret)) return json(res, 401, { error: "unauthorized" });

    if (url === "/status") {
      if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
      return json(res, 200, {
        backend: backendName,
        dryRun: config.dryRun,
        ports: config.ports,
        ttlSeconds: config.ttlMs / 1000,
        entries: [...entries].map(([ip, expiresAt]) => ({ ip, expiresAt: new Date(expiresAt).toISOString() })),
      });
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on("end", async () => {
      if (size > MAX_BODY) return json(res, 413, { error: "body_too_large" });
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return json(res, 400, { error: "bad_request" }); }
      const check = config.CheckAllowlistIp(body?.ip, config.allowPrivate);
      if (!check.ok) return json(res, 400, { error: "invalid_ip", reason: check.reason });
      const ip = check.ip.canonical;
      const isNew = !entries.has(ip);
      if (isNew && entries.size >= config.maxEntries) return json(res, 503, { error: "allowlist_full" });
      entries.set(ip, Date.now() + config.ttlMs);
      save();
      if (isNew) {
        try {
          await applyNow();
          audit("added", { ip });
        } catch (error) {
          entries.delete(ip);
          save();
          audit("rule_failed", { ip, error: error instanceof Error ? error.message : String(error) });
          return json(res, 503, { error: "firewall_failed" });
        }
      }
      schedule();
      return json(res, 200, { ip, added: isNew, ttlSeconds: config.ttlMs / 1000 });
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.bindHost, resolve);
  });

  const stop = async (signal) => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    await new Promise((resolve) => server.close(resolve));
    entries.clear();
    save();
    try { await applyNow(); } catch (error) { audit("close_failed", { error: error instanceof Error ? error.message : String(error) }); }
    audit("stop", { signal });
  };

  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.once(signal, () => { void stop(signal).finally(() => process.exit(0)); });
  }
  audit("ready", { listen: config.bindHost + ":" + config.port });
}
