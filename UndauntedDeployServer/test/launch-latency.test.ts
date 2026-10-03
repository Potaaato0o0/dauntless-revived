import "./setup";
import { RemoveDeployTestDir } from "./deployenv";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { after, test } from "node:test";

process.env.SECONDS_TO_WAIT_BETWEEN_GAMESERVER_STARTUP = "0.3";
const game = require("../src/controllers/gameservers") as typeof import("../src/controllers/gameservers");
const args = "/Game/Test?MaxPlayers=1?MonsterClass=test";
let pid = 50000;
const children: EventEmitter[] = [];
const spawn = () => {
    const child = Object.assign(new EventEmitter(), { pid: pid++, unref() {} });
    children.push(child);
    return child as unknown as ChildProcess;
};
after(RemoveDeployTestDir);

test("failed spawns do not add cooldowns, successful launches remain spaced", async () => {
    game.ResetGameserversForTests();
    game.UseProcessFunctionsForTests({ Spawn: () => { throw new Error("test failure"); } });
    const started = Date.now();
    for (let i = 0; i < 3; i++) await assert.rejects(game.Startup(), /Could not start/);
    assert.ok(Date.now() - started < 500, "failed spawns accumulated cooldowns");
    game.ResetGameserversForTests();
    game.UseProcessFunctionsForTests({ Spawn: spawn, IsAlive: () => true });
    await game.Startup();
    const launched = Date.now();
    await game.StartupGameserverWithArgs(args);
    assert.ok(Date.now() - launched >= 250, "successful launches were not spaced");
});

test("hunt exit frees its port immediately and watchdog cleanup cannot duplicate it", async () => {
    game.ResetGameserversForTests();
    game.UseProcessFunctionsForTests({ Spawn: spawn, IsAlive: () => true });
    await game.Startup();
    await game.StartupGameserverWithArgs(args);
    const hunt = game.Gameservers.find(server => !server.isRamsgate)!;
    children.at(-1)!.emit("exit", 0, null);
    assert.ok(!game.Gameservers.includes(hunt));
    assert.equal(game.GameserverStateForTests().FreePorts.filter(port => port === hunt.port).length, 1);
    await game.CleanupServer(hunt);
    assert.equal(game.GameserverStateForTests().FreePorts.filter(port => port === hunt.port).length, 1);
});


test("hunt startup failure during readiness grace is rejected and returns its port", async () => {
    game.ResetGameserversForTests();
    game.UseProcessFunctionsForTests({ Spawn: spawn, IsAlive: () => true });
    await game.Startup();
    const before = game.GameserverStateForTests().FreePorts.length;
    process.env.GAMESERVER_STARTUP_GRACE_MS = "50";
    game.UseProcessFunctionsForTests({ Spawn: () => {
        const child = Object.assign(new EventEmitter(), { pid: pid++, unref() {} });
        setTimeout(() => child.emit("exit", 1, null), 10);
        return child as unknown as ChildProcess;
    }, IsAlive: () => true });
    try {
        await assert.rejects(game.StartupGameserverWithArgs(args), /exited during startup/);
        assert.equal(game.GameserverStateForTests().FreePorts.length, before);
    } finally {
        process.env.GAMESERVER_STARTUP_GRACE_MS = "0";
    }
});
