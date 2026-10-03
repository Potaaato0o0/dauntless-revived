"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const [command, metaDir, dbFile, ...rest] = process.argv.slice(2);
function fail(message) {
  console.error("dr-db: " + message);
  process.exit(1);
}
if (!command || !metaDir || !dbFile) fail("usage: dr-db.cjs <command> <metagame dir> <db> [args]");

let Database;
try {
  Database = require(path.join(path.resolve(metaDir), "node_modules", "better-sqlite3"));
} catch (error) {
  fail("better-sqlite3 not found under metagame node_modules: " + error.message);
}
function open(file, readonly) {
  if (!fs.existsSync(file)) fail("no database at " + file);
  return new Database(file, { readonly, fileMustExist: true });
}
function check(file) {
  const db = open(file, true);
  try {
    const result = db.pragma("integrity_check", { simple: true });
    if (result !== "ok") fail("integrity_check says: " + result);
    const users = db.prepare("SELECT count(*) AS n FROM users").get().n;
    return "ok, " + users + " users";
  } finally { db.close(); }
}

async function main() {
  if (command === "integrity") {
    console.log(check(dbFile));
    return;
  }
  if (command === "add-invite" || command === "del-invite") {
    const code = rest[0];
    if (!code || !/^[A-Za-z0-9-]{4,64}$/.test(code)) fail("bad invite code");
    const db = open(dbFile, false);
    try {
      if (command === "add-invite") {
        db.prepare("INSERT OR REPLACE INTO invitecodes (invitecode, usesRemaining, infiniteUses) VALUES (?, 1, 0)").run(code);
      } else {
        db.prepare("DELETE FROM invitecodes WHERE invitecode = ?").run(code);
      }
    } finally { db.close(); }
    console.log(command === "add-invite" ? "invite added" : "invite removed");
    return;
  }
  if (command === "make-admin") {
    const userId = rest[0];
    if (!userId) fail("make-admin needs a user id");
    const db = open(dbFile, false);
    try {
      const result = db.prepare("UPDATE users SET isAdmin = 1 WHERE userId = ?").run(userId);
      if (result.changes !== 1) fail("no such user");
    } finally { db.close(); }
    console.log("admin flag set");
    return;
  }
  if (command === "gs-key") {
    const keyFile = rest[0];
    if (!keyFile || !fs.existsSync(keyFile)) fail("gs-key needs the key file");
    const key = fs.readFileSync(keyFile, "utf8").trim();
    if (key.length < 32) fail("game-server key file looks empty or truncated");
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const db = open(dbFile, false);
    let present = false;
    try {
      present = db.prepare("SELECT count(*) AS n FROM gameserverapikeys WHERE keyHash = ?").get(hash).n > 0;
      if (!present) db.prepare("INSERT INTO gameserverapikeys (keyHash) VALUES (?)").run(hash);
    } finally { db.close(); }
    console.log(present ? "game-server key already registered" : "game-server key registered");
    return;
  }
  if (command === "backup") {
    const dest = rest[0];
    if (!dest) fail("backup needs a destination");
    const db = open(dbFile, true);
    try { await db.backup(dest); } finally { db.close(); }
    console.log("db " + check(dest));
    return;
  }
  fail("unknown command " + command);
}
main().catch((error) => fail(error.message));
