import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDashboard, scrubLog, tailLog } from './dashboard.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePerformance, readPerformance } from './dashboard-performance.mjs';
test('dashboard isolates owner data and only polls read routes', async () => {
  const routes = [];
  const key = 'test-owner-key-not-a-real-secret';
  const server = await startDashboard({key, port: 0, backend: 'http://127.0.0.1:61000', fetcher: async url => {
    routes.push(url.pathname);
    return {ok: true, json: async () => url.pathname.endsWith('GetAllUsers') ? {Users: [{UserId: 'fixture', Username: 'Tester'}]} : {players: [{name: 'Tester', where: 'city'}], instances: [], playersOnline: 1, uptimeSeconds: 60, name: 'Test'} };
  }});
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/api/status')).status, 401);
    assert.equal((await fetch(base + '/api/status', {headers: {'x-dashboard-key': key, origin: 'https://untrusted.example'}})).status, 403);
    const response = await fetch(base + '/api/status', {headers: {'x-dashboard-key': key}});
    const data = await response.json();
    assert.equal(data.sample.accounts, 1);
    assert.equal(data.sample.newAccountsObserved, 0);
    assert.equal(data.sample.players[0].name, 'Tester');
    assert.equal(JSON.stringify(data).includes(key), false);
    assert.equal((await fetch(base + '/api/log?name=../../secrets', {headers: {'x-dashboard-key': key}})).status, 404);
    assert.equal(data.sample.locations.city, 1);
    assert.equal(data.sample.locations.hunt, 0);
    assert.deepEqual(routes.sort(), ['/undaunted/api/BackendHealth', '/undaunted/api/DiscordKeyStats', '/undaunted/api/GetAllUsers', '/undaunted/api/ServerStatus']);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('redacts credential lines and caps log line count', () => {
  assert.equal(scrubLog('ready\nAuthorization: Bearer secret\nUUK_test\npassword=hello').includes('hello'), false);
  assert.equal(scrubLog(Array(200).fill('ready').join('\n')).split('\n').length, 150);
});
test('refuses an external backend', async () => {
  await assert.rejects(startDashboard({key: 'test-owner-key-long', backend: 'http://example.com'}), /loopback/);
});
test('log reader bounds large files and includes the latest complete line', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dr-dashboard-test-'));
  try {
    const path = join(dir, 'sample.log');
    await writeFile(path, 'old line\n'.repeat(10000) + 'latest line\n');
    const text = await tailLog(path);
    assert.ok(text.includes('latest line'));
    assert.ok(text.length < 32768);
    assert.ok(text.split('\n').length <= 150);
  } finally { await rm(dir, {recursive: true}); }
});
test('backend failure returns an explicit unavailable state without fabricated readings', async () => {
  const key = 'test-owner-key-not-a-real-secret';
  const server = await startDashboard({key, port: 0, backend: 'http://127.0.0.1:61000', fetcher: async () => { throw new Error('offline'); }});
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/status`, {headers: {'x-dashboard-key': key}});
    const data = await response.json();
    assert.equal(data.sample, null);
    assert.match(data.error, /unavailable/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('invites require owner authentication, same origin, bounded input and fixed server destination', async () => {
  const key = 'test-owner-key-not-a-real-secret';
  const writes = [];
  const serverConfig = {Mode: 'Public', PublicHost: '203.0.113.10', Ports: {gateway: 443}, CertFingerprint: 'a'.repeat(64), ServerName: 'Test server'};
  const server = await startDashboard({key, port: 0, backend: 'http://127.0.0.1:61000', serverConfig, fetcher: async (url, options) => {
    if (options.method === 'POST') { writes.push({url, options}); return {ok: true, json: async () => ({code: 'TEST-ONLY-1234'})}; }
    return {ok: true, json: async () => url.pathname.endsWith('GetAllUsers') ? {Users: []} : {players: [], instances: [], playersOnline: 0}};
  }});
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const send = (body, extra = {}) => fetch(base + '/api/invites', {method: 'POST', headers: {'x-dashboard-key': key, origin: base, 'content-type': 'application/json', ...extra}, body: JSON.stringify(body)});
    assert.equal((await send({uses: 1, name: ''}, {'x-dashboard-key': 'wrong'})).status, 401);
    assert.equal((await send({uses: 1, name: ''}, {origin: 'https://evil.example'})).status, 403);
    assert.equal((await send({uses: 1, name: ''}, {origin: ''})).status, 403);
    for (const uses of [0, 101, 1.5, '1']) assert.equal((await send({uses, name: ''})).status, 400);
    assert.equal((await send({uses: 1, name: 'x'.repeat(3000)})).status, 413);
    assert.equal(writes.length, 0);
    const result = await (await send({uses: 2, name: 'Friends', host: 'evil.example'})).json();
    const link = new URL(result.invite);
    assert.equal(link.searchParams.get('host'), serverConfig.PublicHost);
    assert.equal(link.searchParams.get('fp'), serverConfig.CertFingerprint);
    assert.equal(link.searchParams.get('code'), 'TEST-ONLY-1234');
    assert.equal(result.uses, 2);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].url.pathname, '/undaunted/api/CreateInvite');
    assert.deepEqual(JSON.parse(writes[0].options.body), {uses: 2, name: 'Friends'});
    assert.equal(JSON.stringify(result).includes(key), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('invite writes are never automatically retried after an ambiguous failure', async () => {
  const key = 'test-owner-key-not-a-real-secret';
  let writes = 0;
  const server = await startDashboard({key, port: 0, backend: 'http://127.0.0.1:61000', serverConfig: {Mode: 'Public', PublicHost: '203.0.113.10', Ports: {gateway: 443}, CertFingerprint: 'a'.repeat(64)}, fetcher: async (_url, options) => { if (options.method === 'POST') writes++; throw new Error('offline'); }});
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base + '/api/invites', {method: 'POST', headers: {'x-dashboard-key': key, origin: base, 'content-type': 'application/json'}, body: JSON.stringify({uses: 1, name: ''})});
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /result unknown/);
    assert.equal(writes, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('performance reads numeric kit rows with whole-host CPU and explicit staleness', async () => {
  const at = '2026-09-30T12:00:00Z';
  const host = `${at},host,,,,,,,,,2,8192,4096,82.5,2,3,1,0`;
  const game = `${at},ramsgate,123,8777,2026-09-30T11:00:00Z,0,100,1024,1200,,,,,,,,,`;
  const csv = `${host}\n${game}\n`;
  const sample = parsePerformance(csv, Date.parse(at) + 1000);
  assert.equal(sample.processes[0].cpu_host_percent, 50);
  assert.equal(sample.host.disk_free_gb, 82.5);
  assert.equal(sample.stale, false);
  assert.equal(parsePerformance(csv, Date.parse(at) + 180000).stale, true);
  assert.equal(parsePerformance(`${host}\nmalformed,row\npartial`).processes.length, 0);
  const dir = await mkdtemp(join(tmpdir(), 'dr-dashboard-perf-'));
  try {
    await writeFile(join(dir, 'performance-2026-09-30.csv'), csv);
    assert.equal((await readPerformance(dir, Date.parse('2026-10-01T00:00:01Z'))).stale, true);
  } finally { await rm(dir, {recursive: true}); }
});

test('account proxy strips unexpected fields, validates paging, and preserves unavailable health', async () => {
  const key = 'test-owner-key-not-a-real-secret';
  const server = await startDashboard({key, port: 0, backend: 'http://127.0.0.1:61000', fetcher: async url => {
    if (url.pathname.endsWith('BackendHealth')) return {ok: false};
    if (url.pathname.endsWith('DashboardAccounts')) return {ok: true, json: async () => ({accounts: [{id: 'UID-test', name: 'Tester', admin: true, keyFingerprint: 'a'.repeat(16), UUK: 'SHOULD-NOT-LEAK'}], nextOffset: null})};
    return {ok: true, json: async () => url.pathname.endsWith('GetAllUsers') ? {Users: []} : {players: [], instances: [], playersOnline: 0}};
  }});
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/api/accounts?offset=0')).status, 401);
    const headers = {'x-dashboard-key': key};
    assert.equal((await fetch(base + '/api/accounts?offset=-1', {headers})).status, 400);
    const result = await (await fetch(base + '/api/accounts?offset=0', {headers})).json();
    assert.equal(result.accounts[0].name, 'Tester');
    assert.equal(JSON.stringify(result).includes('SHOULD-NOT-LEAK'), false);
    const status = await (await fetch(base + '/api/status', {headers})).json();
    assert.equal(status.sample.requestsPerSecond, null);
    assert.match(status.sample.healthError, /BACKEND_HEALTH/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
