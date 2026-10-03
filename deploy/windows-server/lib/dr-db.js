// Dauntless Revived - database helpers for the Windows Server kit.
//
//   node dr-db.js <command> <UndauntedMetagame folder> <database> [args]
//
//   integrity  <meta> <db>                  read-only integrity check; prints "ok, <n> users"
//   backup     <meta> <db> <dest>           SQLite online backup (safe while the metagame runs), then
//                                           checks the copy
//   add-invite <meta> <db> <code>           one-use invite code (the installer's bootstrap for the owner)
//   del-invite <meta> <db> <code>
//   make-admin <meta> <db> <userId>
//   gs-key     <meta> <db> <keyFile>        makes sure the game-server key's SHA-256 is registered
//
// better-sqlite3 is loaded from the metagame's own node_modules. Keys are read from files and never
// printed; the metagame stores only SHA-256 hashes of them.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const [command, metaDir, dbFile, ...rest] = process.argv.slice(2);

function fail(message) {
    console.error(`dr-db: ${message}`);
    process.exit(1);
}

if (!command || !metaDir || !dbFile) fail("usage: dr-db.js <command> <metagame dir> <db> [args]");

let Database;
try {
    Database = require(path.join(path.resolve(metaDir), "node_modules", "better-sqlite3"));
} catch (e) {
    fail(`better-sqlite3 not found under ${metaDir} (run npm ci there first): ${e.message}`);
}

function open(file, readonly) {
    if (!fs.existsSync(file)) fail(`no database at ${file}`);
    return new Database(file, { readonly, fileMustExist: true });
}

function check(file) {
    const db = open(file, true);
    try {
        const result = db.pragma("integrity_check", { simple: true });
        if (result !== "ok") fail(`integrity_check says: ${result}`);
        const users = db.prepare("SELECT count(*) AS n FROM users").get().n;
        return `ok, ${users} users`;
    } finally {
        db.close();
    }
}

async function main() {
    switch (command) {
        case "integrity": {
            console.log(check(dbFile));
            return;
        }
        case "backup": {
            const dest = rest[0];
            if (!dest) fail("backup needs a destination file");
            const db = open(dbFile, true);
            try {
                await db.backup(dest);
            } finally {
                db.close();
            }
            console.log(`db ${check(dest)}`);
            return;
        }
        case "add-invite":
        case "del-invite": {
            const code = rest[0];
            if (!code || !/^[A-Za-z0-9-]{4,64}$/.test(code)) fail("bad invite code");
            const db = open(dbFile, false);
            try {
                if (command === "add-invite") {
                    db.prepare("INSERT OR REPLACE INTO invitecodes (invitecode, usesRemaining, infiniteUses) VALUES (?, 1, 0)").run(code);
                } else {
                    db.prepare("DELETE FROM invitecodes WHERE invitecode = ?").run(code);
                }
            } finally {
                db.close();
            }
            console.log(command === "add-invite" ? "invite added" : "invite removed");
            return;
        }
        case "make-admin": {
            const userId = rest[0];
            if (!userId) fail("make-admin needs a user id");
            const db = open(dbFile, false);
            try {
                const r = db.prepare("UPDATE users SET isAdmin = 1 WHERE userId = ?").run(userId);
                if (r.changes !== 1) fail("no such user");
            } finally {
                db.close();
            }
            console.log("admin flag set");
            return;
        }
        case "gs-key": {
            const keyFile = rest[0];
            if (!keyFile || !fs.existsSync(keyFile)) fail("gs-key needs the key file");
            const key = fs.readFileSync(keyFile, "utf8").trim();
            if (key.length < 32) fail("the game-server key file looks empty or truncated");
            const hash = crypto.createHash("sha256").update(key, "utf8").digest("hex");
            const db = open(dbFile, false);
            try {
                const present = db.prepare("SELECT count(*) AS n FROM gameserverapikeys WHERE keyHash = ?").get(hash).n > 0;
                if (present) {
                    console.log("game-server key already registered");
                } else {
                    db.prepare("INSERT INTO gameserverapikeys (keyHash) VALUES (?)").run(hash);
                    console.log("game-server key registered");
                }
            } finally {
                db.close();
            }
            return;
        }
        default:
            fail(`unknown command ${command}`);
    }
}

main().catch((e) => fail(e.message));
