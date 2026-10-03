import "./setup";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { DescribeGameservers, Gameserver, Gameservers, KindOfGameserver } from "../src/controllers/gameservers";
import { IsLoopbackAddress } from "../src/routes/gameservers";
import { app } from "../src/app";

// A spare port for this test only (61010-61029 and 62000-62099 are the test ranges)
const TEST_PORT = 62013;

function Fake(Overrides: Partial<Gameserver>): Gameserver {
    return {
        id: "00000000-0000-4000-8000-000000000000",
        port: 8770,
        map: "/Game/Maps/islands/1702/cora_jamima",
        behemoth: undefined,
        matchmakerHuntId: undefined,
        expectedPlayers: undefined,
        isRamsgate: false,
        isTrainingDojo: false,
        processId: process.pid,
        startTime: new Date("2026-09-21T12:00:00.000Z"),
        ...Overrides
    };
}

const Ramsgate = Fake({ id: "11111111-1111-4111-8111-111111111111", port: 8777, map: "/Game/Maps/ramsgate/ramsgate_01_persistent", isRamsgate: true });
const Dojo = Fake({ id: "22222222-2222-4222-8222-222222222222", port: 8776, map: "/Game/Maps/islands/dojo/training_dojo_persistent", isTrainingDojo: true });
const Tutorial = Fake({
    id: "33333333-3333-4333-8333-333333333333", port: 8775,
    map: "/Game/Maps/islands/1705/dia_moss_triforce",
    behemoth: "/Game/Monsters/mcrollin/mcbeaver_tutorial_bp.mcbeaver_tutorial_bp_C"
});
const Hunt = Fake({
    id: "44444444-4444-4444-8444-444444444444", port: 8774,
    map: "/Game/Maps/islands/1705/dia_moss_triforce_2?game=/Game/Blueprints/GameMode/Some_GameMode.Some_GameMode_C",
    behemoth: "/Game/Monsters/lerawr/lerawr_beta_bp.lerawr_beta_bp_C",
    matchmakerHuntId: "CR19_MatchmakerHunt_Lerawr_Beta",
    expectedPlayers: [
        { playerUid: "UID-a", playerHuntId: "CR19_PlayerHunt_FTUE_Pursuit_Beta_LeRawr" },
        { playerUid: "UID-b", playerHuntId: "CR19_PlayerHunt_FTUE_Pursuit_Beta_LeRawr" }
    ]
});

describe("KindOfGameserver", () => {
    it("tells Ramsgate, the Dojo, the tutorial and hunts apart", () => {
        assert.equal(KindOfGameserver(Ramsgate), "city");
        assert.equal(KindOfGameserver(Dojo), "dojo");
        assert.equal(KindOfGameserver(Tutorial), "tutorial");
        assert.equal(KindOfGameserver(Hunt), "hunt");
    });

    it("does not take dia_moss_triforce_2 (a regular hunt map) for the tutorial island", () => {
        assert.equal(KindOfGameserver(Fake({ map: "/Game/Maps/islands/1705/dia_moss_triforce_2", behemoth: "/Game/Monsters/lerawr/lerawr_normal_bp.lerawr_normal_bp_C" })), "hunt");
        assert.equal(KindOfGameserver(Fake({ map: "/Game/Maps/islands/1705/dia_moss_triforce", behemoth: undefined })), "tutorial");
    });
});

describe("DescribeGameservers", () => {
    it("reports each server's port, kind, map, behemoth, hunt, expected players, limit and start", () => {
        const [City, Training, Solo, Group] = DescribeGameservers([Ramsgate, Dojo, Tutorial, Hunt], () => true);

        assert.deepEqual(City, {
            id: Ramsgate.id, port: 8777, kind: "city", map: "/Game/Maps/ramsgate/ramsgate_01_persistent", gameMode: null,
            behemoth: null, huntId: null, matchmakerHuntId: null, expectedPlayers: [], maxPlayers: null, startedAt: "2026-09-21T12:00:00.000Z"
        });
        assert.equal(Training.kind, "dojo");
        assert.equal(Training.maxPlayers, 12);
        assert.equal(Solo.kind, "tutorial");
        assert.equal(Solo.maxPlayers, 1);
        assert.equal(Solo.behemoth, "/Game/Monsters/mcrollin/mcbeaver_tutorial_bp.mcbeaver_tutorial_bp_C");
        assert.deepEqual(Group, {
            id: Hunt.id, port: 8774, kind: "hunt", map: "/Game/Maps/islands/1705/dia_moss_triforce_2",
            gameMode: "/Game/Blueprints/GameMode/Some_GameMode.Some_GameMode_C",
            behemoth: "/Game/Monsters/lerawr/lerawr_beta_bp.lerawr_beta_bp_C",
            huntId: "CR19_PlayerHunt_FTUE_Pursuit_Beta_LeRawr", matchmakerHuntId: "CR19_MatchmakerHunt_Lerawr_Beta",
            expectedPlayers: ["UID-a", "UID-b"], maxPlayers: 4, startedAt: "2026-09-21T12:00:00.000Z"
        });
    });

    it("leaves out a server whose process has exited", () => {
        const Listed = DescribeGameservers([Ramsgate, Hunt], (ProcessId) => ProcessId !== 999999 && ProcessId === process.pid);
        assert.equal(Listed.length, 2);
        assert.deepEqual(DescribeGameservers([Ramsgate, Fake({ processId: 999999 })], (ProcessId) => ProcessId === process.pid).map((Server) => Server.port), [8777]);
    });

    it("reads a trials hunt's limit from the trials tables and has no limit for an unknown hunt", () => {
        assert.equal(DescribeGameservers([Fake({ matchmakerHuntId: "Arena_MatchmakerHunt_Hard_001" })], () => true)[0].maxPlayers, 4);
        assert.equal(DescribeGameservers([Fake({ matchmakerHuntId: "No_Such_Hunt" })], () => true)[0].maxPlayers, null);
    });
});

describe("GET /gameservers", () => {
    let Listening: Server | undefined;

    after(() => {
        Listening?.close();
        Gameservers.length = 0;
    });

    it("answers the running servers to a loopback caller", async () => {
        Gameservers.push(Ramsgate, Hunt);
        Listening = await new Promise<Server>((Resolve, Reject) => {
            const Started = app.listen(TEST_PORT, "127.0.0.1", (Error?: Error) => Error ? Reject(Error) : Resolve(Started));
        });

        const Reply = await fetch(`http://127.0.0.1:${TEST_PORT}/gameservers`);
        assert.equal(Reply.status, 200);
        const Body: any = await Reply.json();
        assert.deepEqual(Body.servers.map((Server: any) => [Server.port, Server.kind, Server.huntId]), [[8777, "city", null], [8774, "hunt", "CR19_PlayerHunt_FTUE_Pursuit_Beta_LeRawr"]]);
    });

    it("refuses anyone not on loopback", () => {
        for(const Address of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"]){
            assert.equal(IsLoopbackAddress(Address), true, Address);
        }

        for(const Address of ["100.64.0.7", "192.168.1.20", "::ffff:100.101.102.103", "fe80::1", "0.0.0.0", "", undefined]){
            assert.equal(IsLoopbackAddress(Address), false, String(Address));
        }
    });
});
