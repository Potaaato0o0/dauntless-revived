import "./setup";
import { MISSING_BINARY, RemoveDeployTestDir } from "./deployenv";
import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
    CleanupServer, GameserverStateForTests, Gameservers, GetRamsgateConnectionDetails, GetTrainingDojoConnectionDetails, ResetGameserversForTests,
    Startup, StartupAndReportFailure, StartupGameserverWithArgs, UseProcessFunctionsForTests
} from "../src/controllers/gameservers";
import { HandleMatchmakingRequest } from "../src/controllers/matchmaker";
import { RunWatchdog } from "../src/controllers/watchdog";
import { logger } from "../src/logger";
import { app } from "../src/app";

// Ramsgate and the Dojo are restarted when a player asks for them and their process is gone, through
// the one launch the watchdog uses too; a game binary that cannot be started is logged instead of
// taking the deploy server down. Ported from github.com/Harmonicrain/Undaunted 895f7c7
// (UndauntedDeployServer/src/controllers/gameservers.ts, server.ts); the shared launch, the switch and
// these tests are ours. No game process is ever started: the spawn is a stand-in, and the one test that
// uses the real spawn points at a file that does not exist.

const TUTORIAL_ARGS = "/Game/Maps/islands/1705/dia_moss_triforce?MaxPlayers=1?MonsterClass=/Game/Monsters/mcrollin/mcbeaver_tutorial_bp.mcbeaver_tutorial_bp_C?TODClass=/Game/World/atmospheres/blueprints/atmospheres/experimental/atmospheres_stormy_00_bp.atmospheres_stormy_00_bp_C?HuntID=?ZonePreset=-1";
const HUNT_POOL = [8770, 8771, 8772, 8773, 8774, 8775];

let NextPid = 41000;
const Alive = new Set<number>();
const Spawned: { Command: string, Args: string[], Pid: number | undefined }[] = [];

// A game process that starts and runs until the test "kills" it (takes its pid out of Alive)
function FakeSpawn(Command: string, Args: string[]): ChildProcess {
    const Child = new EventEmitter() as any;
    Child.pid = NextPid++;
    Child.unref = () => {};
    Alive.add(Child.pid);
    Spawned.push({ Command, Args, Pid: Child.pid });
    return Child as ChildProcess;
}

// What Node does for a binary that is not there: no pid, and an "error" event right after
function FailingSpawn(Command: string, Args: string[]): ChildProcess {
    const Child = new EventEmitter() as any;
    Child.pid = undefined;
    Child.unref = () => {};
    Spawned.push({ Command, Args, Pid: undefined });
    process.nextTick(() => Child.emit("error", Object.assign(new Error(`spawn ${Command} ENOENT`), { code: "ENOENT" })));
    return Child as ChildProcess;
}

const IsAlive = (ProcessId: number) => Alive.has(ProcessId);

// The deploy server's log lines, as "level: message"
const Logged: string[] = [];
const LoggerBackup: Record<string, unknown> = {};
for(const Level of ["fatal", "error", "warn", "info"] as const){
    LoggerBackup[Level] = (logger as any)[Level];
    (logger as any)[Level] = (Message: unknown) => { Logged.push(`${Level}: ${String(Message)}`); };
}

async function WaitFor(Condition: () => boolean){
    for(let i = 0; i < 200 && !Condition(); i++){
        await new Promise((Resolve) => setImmediate(Resolve));
    }

    assert.ok(Condition(), "timed out waiting");
}

function Kill(ProcessId: number | undefined){
    Alive.delete(ProcessId as number);
}

beforeEach(() => {
    ResetGameserversForTests();
    UseProcessFunctionsForTests({ Spawn: FakeSpawn, IsAlive });
    Alive.clear();
    Spawned.length = 0;
    Logged.length = 0;
    delete process.env.PERSISTENT_WORLD_LIVENESS;
    delete process.env.ENABLE_DOJO;
});

after(() => {
    UseProcessFunctionsForTests({});
    ResetGameserversForTests();
    Object.assign(logger, LoggerBackup);
    RemoveDeployTestDir();
});

describe("Ramsgate", () => {
    it('low memory blocks new worlds before spawn without consuming hunt ports or stopping Ramsgate', async () => {
        await Startup();
        process.env.GAMESERVER_MEMORY_GUARD = '1';
        process.env.GAMESERVER_MIN_FREE_MB = '999999999';
        try {
            assert.deepEqual(await GetRamsgateConnectionDetails(), {host: '127.0.0.1', port: 8777});
            await assert.rejects(GetTrainingDojoConnectionDetails(), /capacity unavailable: memory/);
            await assert.rejects(StartupGameserverWithArgs(TUTORIAL_ARGS), /capacity unavailable: memory/);
            assert.equal(Spawned.length, 1);
            assert.deepEqual(GameserverStateForTests().FreePorts, HUNT_POOL);
        } finally { process.env.GAMESERVER_MEMORY_GUARD = '0'; delete process.env.GAMESERVER_MIN_FREE_MB; }
    });
    it("starts once at boot and is handed out without another start while it runs", async () => {
        await Startup();

        assert.equal(Spawned.length, 1);
        assert.equal(Spawned[0].Args[1], "8777");
        assert.equal(Spawned[0].Args[2], "/Game/Maps/ramsgate/ramsgate_01_persistent");
        assert.deepEqual(GameserverStateForTests().FreePorts, HUNT_POOL);
        assert.deepEqual(await GetRamsgateConnectionDetails(), { host: "127.0.0.1", port: 8777 });
        assert.deepEqual(await HandleMatchmakingRequest("CITY", "", "ShatteredIsles_ReturnToRamsgate", undefined), { host: "127.0.0.1", port: 8777 });
        assert.equal(Spawned.length, 1);
    });

    it("stores the record of a Ramsgate the watchdog restarted, so the next check sees the new process", async () => {
        await Startup();
        const First = GameserverStateForTests().Ramsgate!;
        Kill(First.processId);

        await CleanupServer(First);

        const Second = GameserverStateForTests().Ramsgate!;
        assert.notEqual(Second.processId, First.processId);
        assert.equal(Second.port, 8777);
        assert.deepEqual(Gameservers.map((Server) => Server.processId), [Second.processId], "the dead record is gone");

        // Upstream kept the dead record: the liveness check would have started a third process here
        assert.deepEqual(await GetRamsgateConnectionDetails(), { host: "127.0.0.1", port: 8777 });
        assert.equal(Spawned.length, 2);
    });

    it("is started again when a player travels there after its process ended", async () => {
        await Startup();
        Kill(GameserverStateForTests().Ramsgate!.processId);

        assert.deepEqual(await HandleMatchmakingRequest("CITY", "", "ShatteredIsles_ReturnToRamsgate", undefined), { host: "127.0.0.1", port: 8777 });
        assert.equal(Spawned.length, 2);
        assert.ok(Logged.includes("warn: Ramsgate is not running any more: starting it again before sending anyone there"));
        assert.equal(Gameservers.length, 1);
        assert.equal(Gameservers[0].processId, Spawned[1].Pid);
    });

    it("a watchdog restart and a CITY request at the same time start one process, in either order", async () => {
        await Startup();
        Kill(GameserverStateForTests().Ramsgate!.processId);

        await RunWatchdog();
        const Many = await Promise.all([GetRamsgateConnectionDetails(), GetRamsgateConnectionDetails(), HandleMatchmakingRequest("CITY", "", "", undefined)]);
        await WaitFor(() => GameserverStateForTests().Ramsgate!.processId === Spawned[1]?.Pid);

        assert.ok(Many.every((Details) => Details.port === 8777));
        assert.equal(Spawned.length, 2);

        // The other way round: the request first, then the watchdog
        Kill(GameserverStateForTests().Ramsgate!.processId);
        const Request = GetRamsgateConnectionDetails();
        await RunWatchdog();
        await Request;

        assert.equal(Spawned.length, 3);
        assert.equal(Gameservers.length, 1);
    });

    it("a watchdog round that still holds the dead record does not start a second Ramsgate after the request did", async () => {
        await Startup();
        const Dead = GameserverStateForTests().Ramsgate!;
        Kill(Dead.processId);

        await GetRamsgateConnectionDetails();
        await CleanupServer(Dead);

        assert.equal(Spawned.length, 2);
        assert.equal(Gameservers.length, 1);
    });

    it("with PERSISTENT_WORLD_LIVENESS=0 is left to the watchdog, as before", async () => {
        process.env.PERSISTENT_WORLD_LIVENESS = "0";
        await Startup();
        const Dead = GameserverStateForTests().Ramsgate!;
        Kill(Dead.processId);

        assert.deepEqual(await GetRamsgateConnectionDetails(), { host: "127.0.0.1", port: 8777 });
        assert.equal(Spawned.length, 1, "no liveness restart");
        assert.equal(GameserverStateForTests().Ramsgate, Dead);

        await RunWatchdog();
        await WaitFor(() => GameserverStateForTests().Ramsgate !== Dead);
        assert.equal(Spawned.length, 2, "the watchdog still restarts it");
    });

    it("waits for the boot's own start instead of starting a second one", async () => {
        const Boot = Startup();
        const Request = GetRamsgateConnectionDetails();

        await Promise.all([Boot, Request]);

        assert.equal(Spawned.length, 1);
    });
});

describe("the Training Dojo", () => {
    it("starts on first use, once for requests that arrive together, and again after its process ended", async () => {
        await Startup();

        const Together = await Promise.all([GetTrainingDojoConnectionDetails(), GetTrainingDojoConnectionDetails(), HandleMatchmakingRequest("SHARED", "", "ShatteredIsles_TrainingDojo", undefined)]);
        assert.ok(Together.every((Details) => Details.port === 8776));
        assert.equal(Spawned.length, 2);
        assert.ok(Logged.includes("info: Starting the Training Dojo on demand"));

        await GetTrainingDojoConnectionDetails();
        assert.equal(Spawned.length, 2);

        Kill(GameserverStateForTests().Dojo!.processId);
        assert.equal((await GetTrainingDojoConnectionDetails()).port, 8776);
        assert.equal(Spawned.length, 3);
    });

    it("with ENABLE_DOJO=1 starts at boot, and a request during the boot waits for that start", async () => {
        process.env.ENABLE_DOJO = "1";

        const Boot = Startup();
        const Request = GetTrainingDojoConnectionDetails();
        await Promise.all([Boot, Request]);

        assert.deepEqual(Spawned.map((Launch) => Launch.Args[1]).sort(), ["8776", "8777"]);
    });
});

describe("hunts", () => {
    it("the watchdog returns a finished hunt's port to the pool", async () => {
        await Startup();

        const Hunt = await StartupGameserverWithArgs(TUTORIAL_ARGS);
        assert.ok(HUNT_POOL.includes(Hunt.port));
        assert.ok(!GameserverStateForTests().FreePorts.includes(Hunt.port));

        Kill(Gameservers.find((Server) => Server.port === Hunt.port)!.processId);
        await RunWatchdog();

        assert.deepEqual([...GameserverStateForTests().FreePorts].sort(), HUNT_POOL);
        assert.equal(Gameservers.some((Server) => Server.port === Hunt.port), false);
        assert.equal(Spawned.length, 2, "Ramsgate was not touched");
    });
});

describe("a game binary that cannot be started", () => {
    it("is logged, gives a hunt's port back and does not end the deploy server (the real spawn, a missing file)", async () => {
        await Startup();
        UseProcessFunctionsForTests({ IsAlive });

        await assert.rejects(StartupGameserverWithArgs(TUTORIAL_ARGS), /Could not start a game server on port 877\d/);
        await WaitFor(() => Logged.some((Line) => Line.startsWith("error: Game server on port")));

        assert.deepEqual(GameserverStateForTests().FreePorts, HUNT_POOL);
        assert.ok(Logged.some((Line) => Line.includes("ENOENT") && Line.includes(MISSING_BINARY)), Logged.join("\n"));
        assert.equal(Gameservers.length, 1, "only Ramsgate");
    });

    it("a failed restart of Ramsgate is an error for that request and a log line for the watchdog", async () => {
        await Startup();
        const Dead = GameserverStateForTests().Ramsgate!;
        Kill(Dead.processId);
        UseProcessFunctionsForTests({ Spawn: FailingSpawn, IsAlive });

        await assert.rejects(GetRamsgateConnectionDetails(), /Could not start a game server on port 8777/);

        // The watchdog's own restart fails the same way: logged, and nothing is left unhandled
        Gameservers.push(Dead);
        await RunWatchdog();
        await WaitFor(() => Logged.some((Line) => Line.startsWith("error: Could not restart the game server on port 8777")));

        // The next request tries again once the binary is back
        UseProcessFunctionsForTests({ Spawn: FakeSpawn, IsAlive });
        assert.equal((await GetRamsgateConnectionDetails()).port, 8777);
    });

    it("a failed startup is one fatal line and a non-zero exit code, not an unhandled rejection", async () => {
        UseProcessFunctionsForTests({ Spawn: FailingSpawn, IsAlive });

        try{
            await StartupAndReportFailure();

            assert.ok(Logged.includes("fatal: Starting the game servers failed: Could not start a game server on port 8777"), Logged.join("\n"));
            assert.equal(process.exitCode, 1);
        }
        finally{
            process.exitCode = 0;
        }
    });

    it("the matchmaking call answers 500, which the metagame reports as FAILED", async () => {
        await Startup();
        Kill(GameserverStateForTests().Ramsgate!.processId);
        UseProcessFunctionsForTests({ Spawn: FailingSpawn, IsAlive });

        const Listening = await new Promise<Server>((Resolve, Reject) => {
            const Started = app.listen(0, "127.0.0.1", (Error?: Error) => Error ? Reject(Error) : Resolve(Started));
        });

        try{
            const Port = (Listening.address() as AddressInfo).port;
            const Reply = await fetch(`http://127.0.0.1:${Port}/api/matchmaker/handle-matchmaking-for-player`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ GameMode: "CITY", GameArgs: "", HuntId: "ShatteredIsles_ReturnToRamsgate" })
            });

            assert.equal(Reply.status, 500);
            assert.deepEqual(await Reply.json(), { error: "no_game_server" });
        }
        finally{
            Listening.closeAllConnections();
            await new Promise<void>((Resolve) => Listening.close(() => Resolve()));
        }
    });
});
