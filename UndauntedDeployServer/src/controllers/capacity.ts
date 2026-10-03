import os from 'node:os';

export class CapacityUnavailable extends Error {
    constructor(public readonly reason: 'memory' | 'ports') { super(`Game-server capacity unavailable: ${reason}`); }
}

function setting(name: string, fallback: number) {
    const value = process.env[name];
    if (value === undefined) return fallback;
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) throw new Error(`Invalid ${name}`);
    return number;
}

// Reserve estimated startup memory synchronously before spawn: concurrent requests cannot all
// claim the same free RAM before Windows has charged the new processes for their allocations.
export class MemoryAdmission {
    private reservations = new Map<symbol, {until: number, bytes: number}>();
    constructor(private free = () => os.freemem(), private now = () => Date.now()) {}
    reserve(temporaryHunt = false) {
        if (process.env.GAMESERVER_MEMORY_GUARD === '0') return () => {};
        const floor = setting('GAMESERVER_MIN_FREE_MB', 3072) * 1048576;
        const standardMB = setting('GAMESERVER_STARTUP_MB', 1536);
        const cost = (temporaryHunt ? setting('GAMESERVER_HUNT_STARTUP_MB', standardMB) : standardMB) * 1048576;
        const hold = setting('GAMESERVER_RESERVATION_SECONDS', 60) * 1000;
        const now = this.now();
        for (const [key, reservation] of this.reservations) if (reservation.until <= now) this.reservations.delete(key);
        const available = this.free();
        const reserved = [...this.reservations.values()].reduce((sum, reservation) => sum + reservation.bytes, 0);
        if (!Number.isFinite(available) || available - reserved < floor + cost) throw new CapacityUnavailable('memory');
        const token = Symbol();
        this.reservations.set(token, {until: now + hold, bytes: cost});
        return () => { this.reservations.delete(token); };
    }
}
export const memoryAdmission = new MemoryAdmission();
