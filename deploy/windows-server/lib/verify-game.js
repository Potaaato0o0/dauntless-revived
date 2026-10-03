// Dauntless Revived - check an installed game folder against the content manifest.
//
//   node verify-game.js <manifest.json> <game folder> [--quick]
//
// <game folder> is the folder that contains Archon\. Every manifest file must exist with the listed
// size and SHA-256 (--quick: size only). Files on disk that are not in the manifest (the two server
// DLLs, logs) are ignored. Read-only. Exit code 0 only if everything matches.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const [manifestFile, gameDir] = args.filter((a) => a !== "--quick");
if (!manifestFile || !gameDir) {
    console.error("usage: verify-game.js <manifest.json> <game folder> [--quick]");
    process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    console.error("manifest has no files");
    process.exit(2);
}

function hashFile(file) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash("sha256");
        fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })
            .on("data", (d) => h.update(d))
            .on("error", reject)
            .on("end", () => resolve(h.digest("hex")));
    });
}

(async () => {
    const started = Date.now();
    let ok = 0, missing = 0, bad = 0, done = 0, bytes = 0;
    for (const f of manifest.files) {
        if (typeof f.path !== "string" || f.path.includes("..") || path.isAbsolute(f.path)) {
            console.error(`unsafe manifest path ${JSON.stringify(f.path)}`);
            process.exit(2);
        }
        const p = path.join(gameDir, ...f.path.split("/"));
        let st;
        try {
            st = fs.lstatSync(p);
        } catch {
            missing++;
            console.log(`MISSING   ${f.path}`);
            continue;
        }
        if (!st.isFile() || st.size !== f.size) {
            bad++;
            console.log(`SIZE      ${f.path} (${st.isFile() ? st.size : "not a file"}, expected ${f.size})`);
            continue;
        }
        if (!quick) {
            const h = await hashFile(p);
            if (h !== String(f.sha256).toLowerCase()) {
                bad++;
                console.log(`HASH      ${f.path}`);
                continue;
            }
        }
        ok++;
        bytes += f.size;
        done++;
        if (done % 50 === 0) console.log(`  ... ${done}/${manifest.files.length} files checked`);
    }
    const secs = Math.round((Date.now() - started) / 1000);
    console.log(`manifest files: ${manifest.files.length}  ok: ${ok}  wrong: ${bad}  missing: ${missing}  (${(bytes / 1e9).toFixed(2)} GB ${quick ? "size-checked" : "hashed"} in ${secs} s)`);
    process.exit(bad || missing ? 1 : 0);
})().catch((e) => {
    console.error(e.message);
    process.exit(2);
});
