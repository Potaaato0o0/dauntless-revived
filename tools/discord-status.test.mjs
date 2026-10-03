import {test} from 'node:test';
import assert from 'node:assert/strict';
import {payload, Publisher, sampleBackend, webhookUrl} from './discord-status.mjs';
const url = 'https://discord.com/api/webhooks/123/test-token';
test('only aggregate status leaves the machine; timestamps are Discord-localized', () => {
  const body = payload({players: 4, uptime: 3600, ms: 12.3, ip: 'SECRET_IP', names: ['SECRET_NAME']}, 1700000000000);
  const json = JSON.stringify(body);
  assert.ok(!json.includes('SECRET'));
  assert.ok(json.includes('<t:1700000000:F>'));
  assert.ok(json.includes('<t:1699996400:R>'));
  assert.deepEqual(body.allowed_mentions, {parse: []});
  assert.ok(JSON.stringify(payload(null)).includes('Unknown'));
});
test('webhook must be exactly Discord HTTPS without extra destinations', () => {
  assert.equal(webhookUrl(url), url);
  for (const bad of ['http://discord.com/api/webhooks/123/x', `${url}?x=1`, url.replace('discord.com', 'evil.test'), url.replace('discord.com', 'discord.com@evil.test')]) assert.throws(() => webhookUrl(bad));
});
test('backend sample validates full status and never forwards private fields', async () => {
  const fetcher = async () => Response.json({online: true, limited: false, playersOnline: 2, uptimeSeconds: 300, players: [{name: 'secret'}]});
  const data = await sampleBackend('http://127.0.0.1:61000', 'test', fetcher);
  assert.deepEqual(Object.keys(data), ['players', 'uptime', 'ms']);
  assert.equal(await sampleBackend('http://127.0.0.1:61000', 'test', async () => Response.json({online: true, limited: true})), null);
  assert.equal(await sampleBackend('http://127.0.0.1:61000', 'test', async () => { throw Error('private'); }), null);
  await assert.rejects(sampleBackend('http://example.com', 'test', fetcher));
});
test('creates once, persists ID and edits after 15 seconds', async () => {
  const calls = [], saved = [];
  const p = new Publisher(url, {}, async value => saved.push({...value}), async (u, opts) => { calls.push([u, opts.method]); return Response.json({id: '1234'}); });
  await p.send(payload(null), 1000); await p.send(payload(null), 6000); await p.send(payload(null), 16000);
  assert.deepEqual(calls, [[`${url}?wait=true`, 'POST'], [`${url}/messages/1234`, 'PATCH']]);
  assert.deepEqual(saved, [{creating: true}, {id: '1234'}]);
});
test('honors 429 and exhausted bucket headers', async () => {
  let calls = 0;
  const p = new Publisher(url, {id: '1'}, async () => {}, async () => { calls++; return calls === 1 ? Response.json({retry_after: 60}, {status: 429}) : new Response('', {headers: {'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '90'}}); });
  await p.send({}, 1000); await p.send({}, 60000); assert.equal(calls, 1);
  await p.send({}, 62000); assert.equal(p.next, 153000);
});
test('uncertain initial send and missing messages cannot spam new messages', async () => {
  let calls = 0;
  const p = new Publisher(url, {}, async () => {}, async () => { calls++; throw Error('secret'); });
  await p.send({}, 1000); await p.send({}, 999999); assert.equal(calls, 1);
  assert.equal(new Publisher(url, {creating: true}, async () => {}).disabled, true);
  const deleted = new Publisher(url, {id: '1'}, async () => {}, async () => new Response('', {status: 404}));
  await deleted.send({}, 1000); assert.equal(deleted.disabled, true);
});
