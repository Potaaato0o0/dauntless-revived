import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdmission, CapacityUnavailable } from '../src/controllers/capacity';

test('memory floor, startup reservations, release and expiry', () => {
    process.env.GAMESERVER_MEMORY_GUARD = '1';
    let free = 4608 * 1048576, now = 0;
    const admission = new MemoryAdmission(() => free, () => now);
    const release = admission.reserve();
    assert.throws(() => admission.reserve(), CapacityUnavailable);
    release();
    admission.reserve();
    now = 60000;
    admission.reserve();
    now = 120000;
    free--;
    assert.throws(() => admission.reserve(), CapacityUnavailable);
    process.env.GAMESERVER_MIN_FREE_MB = 'invalid';
    assert.throws(() => admission.reserve(), /Invalid/);
    delete process.env.GAMESERVER_MIN_FREE_MB;
    process.env.GAMESERVER_MEMORY_GUARD = '0';
    admission.reserve();
});

test('hunt estimates keep the full floor and correctly sum mixed reservations', () => {
    process.env.GAMESERVER_MEMORY_GUARD = '1';
    process.env.GAMESERVER_MIN_FREE_MB = '1536';
    process.env.GAMESERVER_HUNT_STARTUP_MB = '1024';
    let free = 2800 * 1048576;
    try {
        const admission = new MemoryAdmission(() => free, () => 0);
        assert.throws(() => admission.reserve(), CapacityUnavailable, 'persistent worlds still require 3072 MiB');
        const releaseHunt = admission.reserve(true);
        assert.throws(() => admission.reserve(true), CapacityUnavailable, 'a concurrent hunt cannot spend the same RAM');
        releaseHunt();
        free = 4096 * 1048576;
        const releasePersistent = admission.reserve();
        const releaseSmall = admission.reserve(true);
        assert.throws(() => admission.reserve(true), CapacityUnavailable);
        releasePersistent(); releaseSmall();
        free = 2559 * 1048576;
        assert.throws(() => admission.reserve(true), CapacityUnavailable, 'headroom is never waived');
        process.env.GAMESERVER_HUNT_STARTUP_MB = 'invalid';
        assert.throws(() => admission.reserve(true), /Invalid/);
    } finally {
        delete process.env.GAMESERVER_MIN_FREE_MB;
        delete process.env.GAMESERVER_HUNT_STARTUP_MB;
        delete process.env.GAMESERVER_MEMORY_GUARD;
    }
});
