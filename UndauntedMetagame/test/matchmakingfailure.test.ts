import { RemoveTestDb } from "./setup";
import "./authenv";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { SignMetagameJWTForUid } from "../src/controllers/auth";
import { GetDb } from "../src/db";
import { TUTORIAL_GAME_ARGS } from "./fakedeploy";

// A deploy server that cannot start a game server must end the player's matchmaking with FAILED,
// never with an address nothing listens on. Ported from github.com/Harmonicrain/Undaunted 895f7c7,
// test/matchmaking.test.js (its cases at lines 37, 54 with every looped failure mode, 66 and 77), run
// here on the three paths that ask the deploy server: going to Ramsgate, the tutorial from its own
// game args, and a hunt queue that fills up with 4 players. Their party case (line 87) is not ported:
// in their fork the leader's join to any destination takes the whole party along (the tutorial too)
// and a member's own join is not answered. Here a party's hunt takes the whole party, a trip back to
// Ramsgate or the Dojo takes the members on the leader's server, the tutorial is played alone, and a
// member's own trip is answered (test/party.test.ts; docs/findings/social.md).
//
// The deploy server here is a stand-in on a port the system picks; the metagame is loaded after it
// listens, because controllers/matchmaking reads DEPLOYSERVER_URL when it loads.

type Mode = { Name: string, Reply: (res: http.ServerResponse) => void };

const Json = (Status: number, Body: string) => (res: http.ServerResponse) => {
    res.writeHead(Status, { "content-type": "application/json" });
    res.end(Body);
};

const WORKING: Mode = { Name: "a working deploy server", Reply: Json(200, JSON.stringify({ host: "127.0.0.1", port: 8790 })) };

const FAILURES: Mode[] = [
    { Name: "an error status (500)", Reply: Json(500, "{}") },
    { Name: "an error status (503)", Reply: Json(503, "{}") },
    { Name: "a 200 with no host", Reply: Json(200, JSON.stringify({ host: "", port: 0 })) },
    { Name: "a 200 with the port in quotes", Reply: Json(200, JSON.stringify({ host: "127.0.0.1", port: "8790" })) },
    { Name: "a 200 that is not JSON", Reply: Json(200, "not json") },
    { Name: "a dropped connection", Reply: (res) => { res.socket?.destroy(); } }
];

let CurrentMode: Mode = WORKING;
const Calls: any[] = [];
let Deploy: http.Server | undefined;
let Api: http.Server | undefined;
let BASE = "";

// No rejection of the deploy server call may escape the matchmaking code
const Unhandled: unknown[] = [];
const OnUnhandled = (Reason: unknown) => { Unhandled.push(Reason); };

function Listen(Server: http.Server){
    return new Promise<number>((Resolve, Reject) => {
        Server.once("error", Reject);
        Server.listen(0, "127.0.0.1", () => Resolve((Server.address() as AddressInfo).port));
    });
}

before(async () => {
    process.on("unhandledRejection", OnUnhandled);

    Deploy = http.createServer((req, res) => {
        let Body = "";
        req.on("data", (Chunk) => { Body += Chunk; });
        req.on("end", () => {
            Calls.push(JSON.parse(Body || "{}"));
            CurrentMode.Reply(res);
        });
    });

    const DeployPort = await Listen(Deploy);

    process.env.MATCHMAKING_MODE = "DEPLOYSERVER";
    process.env.DEPLOYSERVER_URL = `127.0.0.1:${DeployPort}`;
    process.env.TARGET_CHANGELIST = "239827";
    process.env.LOG_REQUESTS = "0";
    process.env.LOG_BODIES = "0";
    delete process.env.MATCHMAKING_CANCEL;
    delete process.env.MISC_ROUTES;
    delete process.env.GATEWAY_SECRET;

    const { app } = await import("../src/app");
    Api = http.createServer(app);
    BASE = `http://127.0.0.1:${await Listen(Api)}`;
});

after(async () => {
    process.off("unhandledRejection", OnUnhandled);

    for(const Server of [Api, Deploy]){
        Server?.closeAllConnections();
        await new Promise<void>((Resolve) => Server ? Server.close(() => Resolve()) : Resolve());
    }

    RemoveTestDb(() => GetDb().$client.close());
});

beforeEach(() => {
    CurrentMode = WORKING;
    Calls.length = 0;
});

afterEach(() => {
    assert.deepEqual(Unhandled, [], "a rejection escaped");
});

let Counter = 0;

function NewPlayer(){
    Counter++;
    const UserId = `UID-mmfail-${Counter}`;

    return { UserId, Token: SignMetagameJWTForUid(UserId) };
}

async function Call(Method: string, Path: string, Token: string, Body?: unknown){
    const Reply = await fetch(BASE + Path, {
        method: Method,
        headers: { authorization: `bearer ${Token}`, ...(Body === undefined ? {} : { "content-type": "application/json" }) },
        body: Body === undefined ? undefined : JSON.stringify(Body)
    });
    const Text = await Reply.text();

    return { status: Reply.status, json: Text.length > 0 ? JSON.parse(Text) : undefined };
}

// The three ways a join reaches the deploy server, with the body the 1.4.4 client sends for each
type Path = { Name: string, Players: number, Join: () => unknown };

let Hunts = 0;

const PATHS: Path[] = [
    { Name: "going to Ramsgate", Players: 1, Join: () => ({ gameMode: "CITY", gameArgs: "", playerHuntId: "ShatteredIsles_ReturnToRamsgate" }) },
    { Name: "the tutorial", Players: 1, Join: () => ({ gameMode: "ISLAND", gameArgs: TUTORIAL_GAME_ARGS, playerHuntId: "" }) },
    // A new hunt each time, so every group gets a queue of its own; the fourth join starts it
    { Name: "a full hunt queue of 4", Players: 4, Join: () => ({ gameMode: "ISLAND", gameArgs: "", playerHuntId: `CR19_PlayerHunt_Failure_Test_${++Hunts}` }) }
];

// New players join along the path, all with the same body; returns them
async function JoinAll(ThePath: Path){
    const Players = Array.from({ length: ThePath.Players }, () => NewPlayer());
    const Body = ThePath.Join();

    for(const Player of Players){
        const Joined = await Call("POST", "/candidate/join", Player.Token, Body);

        assert.equal(Joined.status, 200, `${ThePath.Name}: join`);
        assert.equal(Joined.json.status, "MATCHING");
    }

    return Players;
}

describe("matchmaking when the deploy server starts no game server", () => {
    it('capacity waits retry once after ten seconds and reach the same server on every path', async () => {
        const { SetPartyClockForTests } = await import('../src/controllers/party');
        let now = Date.now();
        SetPartyClockForTests(() => now);
        try {
            for (const path of PATHS) {
                Calls.length = 0;
                CurrentMode = {Name: 'memory full', Reply: Json(503, JSON.stringify({error: 'capacity_unavailable', reason: 'memory'}))};
                const players = await JoinAll(path);
                for (const player of players) assert.equal((await Call('GET', '/candidate/status', player.Token)).json.status, 'MATCHING');
                assert.equal(Calls.length, 1);
                if (path.Players === 4) {
                    const { HandlePlayerMatchmaking } = await import('../src/controllers/matchmaking');
                    assert.equal(await HandlePlayerMatchmaking('ISLAND', '', Calls[0].HuntId, 'UID-fifth-capacity'), false);
                }
                CurrentMode = WORKING;
                now += 10001;
                for (const player of players) assert.equal((await Call('GET', '/candidate/status', player.Token)).json.status, 'IN_PROGRESS');
                assert.equal(Calls.length, 2);
            }
        } finally { SetPartyClockForTests(); }
    });
    it('a waiting solo candidate can be cancelled without launching when capacity returns', async () => {
        const { CancelMatchmaking } = await import('../src/controllers/matchmaking');
        CurrentMode = {Name: 'ports full', Reply: Json(503, JSON.stringify({error: 'capacity_unavailable', reason: 'ports'}))};
        const [player] = await JoinAll(PATHS[1]);
        CancelMatchmaking(player.UserId);
        const { CheckAndUpdateQueueStatus } = await import('../src/controllers/matchmaking');
        assert.equal(await CheckAndUpdateQueueStatus(player.UserId), undefined);
        assert.equal(Calls.length, 1);
    });
    it('capacity waiting fails after one minute on every path without another allocation', async () => {
        const { SetPartyClockForTests } = await import('../src/controllers/party');
        let now = Date.now();
        SetPartyClockForTests(() => now);
        try {
            CurrentMode = {Name: 'memory full', Reply: Json(503, JSON.stringify({error: 'capacity_unavailable', reason: 'memory'}))};
            for (const path of PATHS) {
                Calls.length = 0;
                const players = await JoinAll(path);
                now += 60001;
                for (const player of players) assert.equal((await Call('GET', '/candidate/status', player.Token)).json.status, 'FAILED');
                assert.equal(Calls.length, 1);
            }
        } finally { SetPartyClockForTests(); }
    });
    // from Harmonicrain/Undaunted test/matchmaking.test.js:37
    it("a successful start sends every player to the returned address (IN_PROGRESS)", async () => {
        for(const ThePath of PATHS){
            Calls.length = 0;
            const Players = await JoinAll(ThePath);

            assert.equal(Calls.length, 1, `${ThePath.Name}: one start for the whole group`);

            for(const Player of Players){
                const Status = await Call("GET", "/candidate/status", Player.Token);

                assert.equal(Status.json.status, "IN_PROGRESS", ThePath.Name);
                assert.equal(Status.json.statusReason, null);
                assert.deepEqual([Status.json.serverInfo.host, Status.json.serverInfo.port], ["127.0.0.1", 8790]);
            }
        }
    });

    // from Harmonicrain/Undaunted test/matchmaking.test.js:54 (its looped modes), :66 (a queue whose start
    // fails, 503) and :77 (a dropped connection), each run on all three paths
    for(const Failure of FAILURES){
        it(`${Failure.Name} is FAILED for every player, never Ready, on every path`, async () => {
            const { DecideCandidateStatus } = await import("../src/controllers/matchmaking");

            CurrentMode = Failure;

            for(const ThePath of PATHS){
                Calls.length = 0;
                const Players = await JoinAll(ThePath);

                assert.equal(Calls.length, 1, `${ThePath.Name}: asked once, no retry loop`);

                if(ThePath.Players === 4){
                    assert.deepEqual(Calls[0].ExpectedPlayers, Players.map((Player) => Player.UserId));
                }

                for(const Player of Players){
                    const Status = await Call("GET", "/candidate/status", Player.Token);

                    assert.equal(Status.status, 200, ThePath.Name);
                    assert.equal(Status.json.status, "FAILED", `${Failure.Name} on ${ThePath.Name}`);
                    assert.equal(Status.json.statusReason, null);
                    assert.equal(Status.json.serverInfo, undefined, "no address to travel to");

                    const Decision = await DecideCandidateStatus(Player.UserId);
                    assert.ok(Decision.Kind === "failed", Decision.Kind);
                    assert.equal(Decision.Entry.Ready, false);
                    assert.equal(Decision.Entry.Port, 0);
                }
            }
        });
    }
});
