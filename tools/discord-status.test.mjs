import {test} from 'node:test';
import assert from 'node:assert/strict';
import {payload, Publisher, sampleBackend, webhookUrl} from './discord-status.mjs';
import {sampleFleet} from './discord-status.mjs';

test('four-server fleet remains visible when one monitor is stale', async () => {
 const row={online:true,cpu:50,ramUsedMB:1024,ramTotalMB:4096,hunts:2};
 const f=await sampleFleet('http://127.0.0.1:61110','test',async()=>Response.json({fleet:{rows:[row,{...row,cpu:5},{...row,online:false,cpu:null,hunts:null},row]}}));
 assert.equal(f.servers,4);assert.equal(f.online,3);assert.equal(f.hunts,null);assert.equal(f.knownHunts,6);
 assert.equal(f.meanCpu,35);assert.equal(f.ramUsedMB,3072);
 const b=payload({players:12,uptime:5,ms:1},Date.now(),f);
 const s=JSON.stringify(b);
 assert.ok(s.includes('Server #4 · Germany'));assert.ok(s.includes('6 reported · partial'));assert.ok(s.includes('35.0%'));
 assert.equal(b.embeds[0].fields[1].value,'3 / 4 hosts reporting');assert.ok(!s.includes('Server #1 · Main'));
 assert.ok(s.includes('Cloudflare'));assert.ok(s.length<6000);
});
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
  assert.deepEqual(saved.slice(0,2), [{creating: true}, {id: '1234'}]);
  assert.equal(saved.at(-1).lastSuccess, new Date(16000).toISOString());
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
  const methods=[];
  const deleted = new Publisher(url, {id: '1'}, async () => {}, async (u,opts) => {methods.push(opts.method);return new Response('', {status: 404});});
  await deleted.send({}, 1000); await deleted.send({}, 999999);
  assert.equal(deleted.disabled, false);assert.deepEqual(methods,['PATCH','PATCH']);
});
test('existing message recovers after rejection without replacement',async()=>{
  let calls=0;const methods=[];const p=new Publisher(url,{id:'1'},async()=>{},async(u,o)=>{methods.push(o.method);return new Response('',{status:++calls===1?403:200});});
  await p.send({},1000);await p.send({},999999);assert.equal(p.failures,0);assert.equal(p.state.id,'1');assert.deepEqual(methods,['PATCH','PATCH']);
});

test('fleet status projects metrics and public embed never includes host labels, addresses or secrets',async()=>{
 const {sampleFleet}=await import('./discord-status.mjs');
 const row={name:'SECRET_NAME',host:'192.0.2.44',online:true,cpu:25,ramUsedMB:1024,ramTotalMB:8192,hunts:2,token:'SECRET_TOKEN'};
 const fleet=await sampleFleet('http://127.0.0.1:61110','test',async()=>Response.json({fleet:{rows:[row,row,row]}}));
 assert.equal(fleet.hunts,6);assert.equal(fleet.online,3);
 const message=JSON.stringify(payload({players:4,uptime:30,ms:1},Date.now(),fleet));
 assert.ok(message.includes('Australia (OCE)'));assert.ok(message.includes('25.0%'));
 assert.ok(!message.includes('SECRET'));assert.ok(!message.includes('192.0.2.44'));
 assert.equal(await sampleFleet('http://127.0.0.1:61110','test',async()=>new Response('',{status:503})),null);
 await assert.rejects(sampleFleet('https://example.com','test'));
});
