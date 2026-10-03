import { RemoveTestDb } from "./setup";
import "./matchmakingenv";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { CancelMatchmaking, CheckAndUpdateQueueStatus, DistinctPlayers, HandlePlayerMatchmaking } from "../src/controllers/matchmaking";
import { GetDb } from "../src/db";

// Matchmaking looks up the player's party (controllers/party.ts), which loads the database
after(() => RemoveTestDb(() => GetDb().$client.close()));

describe("CancelMatchmaking (DELETE /candidate)", () => {
    it("takes the player out of the queue, so the status poll can no longer send them to the hunt", async () => {
        assert.equal(await HandlePlayerMatchmaking("ISLAND", "", "Hunt_Test_A", "UID-a"), true);
        assert.equal(await HandlePlayerMatchmaking("ISLAND", "", "Hunt_Test_A", "UID-b"), true);

        const Cancelled = CancelMatchmaking("UID-a");
        assert.equal(Cancelled?.HuntId, "Hunt_Test_A");
        assert.equal(await CheckAndUpdateQueueStatus("UID-a"), undefined);
        assert.equal((await CheckAndUpdateQueueStatus("UID-b"))?.Ready, false);

        // The last player leaving drops the queue, so a new group can start one
        CancelMatchmaking("UID-b");
        assert.equal(await HandlePlayerMatchmaking("ISLAND", "", "Hunt_Test_A", "UID-c"), true);
        assert.equal((await CheckAndUpdateQueueStatus("UID-c"))?.HuntId, "Hunt_Test_A");
    });

    it("is a no-op for a player who is not queued", () => {
        assert.equal(CancelMatchmaking("UID-nobody"), undefined);
    });
});

describe("DistinctPlayers (the expected-player list sent to the deploy server)", () => {
    it("lists each account once, in first-seen order", () => {
        // The live list on 22 September 2026 was V, V, O: the hunt server waited for a third player
        assert.deepEqual(DistinctPlayers(["UID-v", "UID-v", "UID-o"]), ["UID-v", "UID-o"]);
        assert.deepEqual(DistinctPlayers(["UID-o", "UID-v", "UID-o", "UID-v"]), ["UID-o", "UID-v"]);
        assert.deepEqual(DistinctPlayers([]), []);
    });
});
