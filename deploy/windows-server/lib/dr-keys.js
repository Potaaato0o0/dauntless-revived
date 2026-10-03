// Dauntless Revived - fresh token-signing keys for the metagame.
//
//   node dr-keys.js signing <out file>
//
// Writes an RSA-2048 key pair (PKCS#8 / SPKI PEM, base64, as the metagame's AUTH_SIGNING_PRIVKEY_B64 and
// AUTH_SIGNING_PUBKEY_B64 expect) to <out file> as two .env lines. Nothing is printed. The caller merges
// the lines into the protected metagame.env and deletes the file.
"use strict";
const fs = require("fs");
const crypto = require("crypto");

const [command, outFile] = process.argv.slice(2);
if (command !== "signing" || !outFile) {
    console.error("usage: dr-keys.js signing <out file>");
    process.exit(1);
}

const pair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
});

// Round trip: sign and verify once so a broken pair is never written.
const probe = Buffer.from("dauntless-revived");
const signature = crypto.sign("sha256", probe, pair.privateKey);
if (!crypto.verify("sha256", probe, pair.publicKey, signature)) {
    console.error("dr-keys: generated key pair does not verify");
    process.exit(1);
}

fs.writeFileSync(outFile,
    "AUTH_SIGNING_PRIVKEY_B64=" + Buffer.from(pair.privateKey).toString("base64") + "\n" +
    "AUTH_SIGNING_PUBKEY_B64=" + Buffer.from(pair.publicKey).toString("base64") + "\n",
    { mode: 0o600 });
console.log("signing keys written");
