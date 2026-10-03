import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import http from 'node:http';
import { HuntRouter, RemoteLaunch } from '../src/controllers/overflow';
import { CapacityUnavailable } from '../src/controllers/capacity';

process.env.OVERFLOW_DEPLOYSERVER_URL = 'http://127.0.0.1:61011';
process.env.OVERFLOW_AFTER_HUNTS = '4';
after(() => { delete process.env.OVERFLOW_DEPLOYSERVER_URL; delete process.env.OVERFLOW_AFTER_HUNTS; });
const body = {GameMode: 'ISLAND', GameArgs: '', HuntId: 'pursuit', ExpectedPlayers: ['one', 'two']};
const local = {host:'main',port:8770};
const worker = {host:'worker',port:8780};

test('threshold spills whole hunt/party; persistent worlds stay local', async () => {
    let calls = 0;
    const router = new HuntRouter(() => 4, async (_url, request) => { calls++; assert.deepEqual(request, body); return worker; });
    assert.deepEqual(await router.launch(body, async () => local), worker);
    assert.deepEqual(await router.launch({...body, GameMode:'CITY'}, async () => local), local);
    assert.equal(calls, 1);
});
test('local capacity falls back remotely; explicit worker refusal falls back locally', async () => {
    const router = new HuntRouter(() => 0, async () => worker);
    assert.deepEqual(await router.launch(body, async () => { throw new CapacityUnavailable('ports'); }), worker);
    assert.deepEqual(await new HuntRouter(() => 4, async () => undefined).launch(body, async () => local), local);
});
test('ambiguous worker failure never spawns a duplicate locally', async () => {
    let localCalls = 0;
    await assert.rejects(new HuntRouter(() => 4, async () => { throw new Error('timeout'); }).launch(body, async () => { localCalls++; return local; }), /timeout/);
    assert.equal(localCalls, 0);
});
test('concurrent launches count reservations toward the threshold', async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => finish = resolve);
    const router = new HuntRouter(() => 3, async () => worker);
    const first = router.launch(body, async () => { await gate; return local; });
    assert.deepEqual(await router.launch(body, async () => local), worker);
    finish(); await first;
});
test('remote HTTP contract preserves all hunt data and recognizes capacity', async () => {
    let status = 200;
    const server = http.createServer(async (req, res) => {
        if (req.method === 'GET') { res.setHeader('connection','close'); res.end(JSON.stringify({servers:[]})); return; }
        let data = ''; for await (const chunk of req) data += chunk;
        assert.deepEqual(JSON.parse(data), body);
        res.writeHead(status, {'content-type':'application/json', connection:'close'});
        res.end(JSON.stringify(status === 200 ? worker : {error:'capacity_unavailable'}));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = new URL(`http://127.0.0.1:${(server.address() as any).port}`);
    try {
        assert.deepEqual(await RemoteLaunch(url, body), worker);
        status = 503; assert.equal(await RemoteLaunch(url, body), undefined);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    assert.equal(await RemoteLaunch(url, body), undefined);
});
