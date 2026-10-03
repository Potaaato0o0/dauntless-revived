import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fleetSummary } from './dashboard-fleet.mjs';
const now=Date.now(), at=new Date(now).toISOString();
const main={at,cpu:50,logicalCpus:5,ramUsedMB:6000,ramTotalMB:12000,performance:{at,stale:false,processes:[{role:'ramsgate'},{role:'hunt'},{role:'tutorial'}]}};
const worker={configured:true,online:true,sample:{at,cpu:5,logicalCpus:2,ramUsedMB:2000,ramTotalMB:8000,hunts:[{}]}};
test('fleet totals sum RAM and hunts and label the unweighted CPU mean',()=>{
  const f=fleetSummary(main,worker,null,now);
  assert.deepEqual(f.rows.map(r=>r.hunts),[2,1]);
  assert.equal(f.totals.meanCpu,27.5); assert.equal(f.totals.hunts,3);
  assert.equal(f.totals.ramUsedMB,8000); assert.equal(f.totals.ramTotalMB,20000); assert.equal(f.totals.ramPercent,40);
});
test('offline or stale server cannot produce a misleading fleet total',()=>{
  const f=fleetSummary(main,{...worker,online:false},null,now);
  assert.equal(f.totals.meanCpu,null);assert.equal(f.totals.hunts,null);assert.equal(f.totals.ramUsedMB,null);
  assert.equal(fleetSummary(main,worker,null,now+16000).totals.online,0);
  assert.equal(fleetSummary({...main,performance:null},worker,null,now).totals.hunts,null);
});
