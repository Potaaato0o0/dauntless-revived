import { CapacityUnavailable } from './capacity';

type Request = { GameMode: string; GameArgs: string; HuntId: string; ExpectedPlayers: string[] | undefined };
type Connection = { host: string; port: number };

export function OverflowUrl() {
    const value = process.env.OVERFLOW_DEPLOYSERVER_URL;
    if (!value) return undefined;
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
        throw new Error('OVERFLOW_DEPLOYSERVER_URL must be an HTTP loopback tunnel');
    return url;
}

export async function RemoteLaunch(url: URL, body: Request): Promise<Connection | undefined> {
    // A tunnel can accept TCP while its remote target is down. Probe without side effects
    // before POST, so that failure still permits a safe local launch.
    try {
        const probe = await fetch(new URL('/gameservers', url), {signal: AbortSignal.timeout(2000), redirect:'error'});
        const status = await probe.json() as any;
        if (!probe.ok || !Array.isArray(status.servers)) return undefined;
    } catch { return undefined; }
    let response: Response;
    try {
        response = await fetch(new URL('/api/matchmaker/handle-matchmaking-for-player', url), {
            method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body),
            signal: AbortSignal.timeout(120_000), redirect: 'error'
        });
    } catch (error) {
        // A refused connection never reached the worker. A timeout/reset might have spawned a hunt;
        // do not launch a duplicate locally when the result is ambiguous.
        if ((error as any)?.cause?.code === 'ECONNREFUSED') return undefined;
        throw error;
    }
    const result = await response.json() as any;
    if (response.status === 503 && result.error === 'capacity_unavailable') return undefined;
    if (!response.ok || typeof result.host !== 'string' || !Number.isInteger(result.port) || result.port < 1 || result.port > 65535)
        throw new Error(`Overflow launch failed (${response.status})`);
    return result;
}

export class HuntRouter {
    private pending = 0;
    constructor(private localCount: () => number, private remote = RemoteLaunch) {}
    async launch<T>(body: Request, local: () => Promise<T>): Promise<T | Connection> {
        const url = OverflowUrl();
        if (!url || body.GameMode !== 'ISLAND') return local();
        const threshold = Number(process.env.OVERFLOW_AFTER_HUNTS ?? 4);
        if (!Number.isInteger(threshold) || threshold < 0) throw new Error('Invalid OVERFLOW_AFTER_HUNTS');
        const preferRemote = this.localCount() + this.pending >= threshold;
        this.pending++;
        try {
            if (preferRemote) {
                const result = await this.remote(url, body);
                if (result) return result;
            }
            try { return await local(); }
            catch (error) {
                if (!(error instanceof CapacityUnavailable) || preferRemote) throw error;
                const result = await this.remote(url, body);
                if (result) return result;
                throw error;
            }
        } finally { this.pending--; }
    }
}

export async function DescribeOverflow(): Promise<any[]> {
    const url = OverflowUrl();
    if (!url) return [];
    try {
        const response = await fetch(new URL('/gameservers', url), {signal: AbortSignal.timeout(1500), redirect: 'error'});
        if (!response.ok) return [];
        const body = await response.json() as any;
        return Array.isArray(body.servers) ? body.servers.map((server: any) => ({...server, host: 'overflow'})) : [];
    } catch { return []; }
}
