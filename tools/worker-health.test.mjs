import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processSample,startWorkerHealth} from './worker-health.mjs';
import {startDashboard} from './dashboard.mjs';

test('worker process CPU uses whole-host percentage and excludes reused PIDs',()=>{
  const old={at:'2026-01-01T00:00:00Z',receivedBytes:1000,sentBytes:1000,processes:[{pid:7,startedAt:'old',cpuSeconds:10}]};
  const current={at:'2026-01-01T00:01:00Z',receivedBytes:8500,sentBytes:16000,processes:[{pid:7,startedAt:'old',cpuSeconds:40},{pid:8,startedAt:'new',cpuSeconds:50}]};
  const value=processSample(current,old,2);
  assert.equal(value.processes[0].cpuPercent,25);assert.equal(value.processes[1].cpuPercent,null);
  assert.equal(value.netInKbit,1);assert.equal(value.netOutKbit,2);
});
test('worker reports independent service health without forwarding secrets or player IPs',async()=>{
  const server=await startWorkerHealth({port:0,allowlistSecret:'private-secret',collect:async()=>({at:new Date().toISOString(),processes:[],receivedBytes:0,sentBytes:0}),fetcher:async(url,options)=>{
    if(url.endsWith('/status')) {assert.equal(options.headers['x-allowlist-secret'],'private-secret');return new Response(JSON.stringify({entries:[{ip:'1.2.3.4'}],lastApply:{ok:true,enabled:true},ports:'8758-8760'}));}
    if(url.endsWith('/gameservers'))return new Response(JSON.stringify({servers:[{id:'world',expectedPlayers:['UID-private'],port:8760}]}));
    return new Response('{}',{status:503});
  }});
  try{
    const url=`http://127.0.0.1:${server.address().port}/health`;
    assert.equal((await fetch(url,{headers:{'x-forwarded-for':'1.2.3.4'}})).status,403);
    const body=await (await fetch(url)).json();
    assert.deepEqual(body.services,{deploy:true,allowlist:true,backend:false});
    assert.equal(body.hunts[0].expectedPlayers,1);assert.equal(body.firewall.addresses,1);
    assert.ok(!JSON.stringify(body).includes('private'));assert.ok(!JSON.stringify(body).includes('1.2.3.4'));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('main dashboard exposes worker health only behind owner authentication and never sends owner key to worker',async()=>{
  const key='private-owner-key-for-test';
  const server=await startDashboard({key,port:0,backend:'http://127.0.0.1:61000',workerUrl:'http://127.0.0.1:61112',fetcher:async(url,options)=>{
    if(url.pathname==='/health'){assert.equal(options.headers,undefined);return new Response(JSON.stringify({at:new Date().toISOString(),services:{deploy:true},hunts:[],cpu:20}));}
    return new Response(JSON.stringify(url.pathname.endsWith('GetAllUsers')?{Users:[]}:{players:[],instances:[],playersOnline:0}));
  }});
  try{
    const url=`http://127.0.0.1:${server.address().port}/api/status`;
    assert.equal((await fetch(url)).status,401);
    const result=await(await fetch(url,{headers:{'x-dashboard-key':key}})).json();
    assert.equal(result.worker.online,true);assert.equal(result.worker.sample.cpu,20);
    assert.ok(!JSON.stringify(result).includes(key));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('main dashboard rejects remote worker URLs',async()=>{
  await assert.rejects(startDashboard({key:'owner-key-long-enough',port:0,backend:'http://127.0.0.1:61000',workerUrl:'https://example.com'}),/loopback tunnel/);
});
