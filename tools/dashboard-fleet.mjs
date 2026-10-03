const finite = value => Number.isFinite(value) && value >= 0 ? value : null;
const fresh = (at, limit, now) => Number.isFinite(Date.parse(at)) && now-Date.parse(at) <= limit && Date.parse(at) <= now+60000;
export function fleetSummary(main, worker, mainError = null, now = Date.now()) {
  const mainOnline = !!main && !mainError && fresh(main.at,15000,now);
  const perf = main?.performance;
  const mainHunts = mainOnline && perf && !perf.stale && fresh(perf.at,150000,now) ? perf.processes.filter(p=>p.role==='hunt' || p.role==='tutorial').length : null;
  const row = (name, online, sample, hunts, huntSampleAt) => ({name,online,at:sample?.at ?? null,huntSampleAt,
    cpu:online ? finite(sample.cpu) : null, logicalCpus:sample?.logicalCpus ?? null,
    ramUsedMB:online ? finite(sample.ramUsedMB) : null,ramTotalMB:online ? finite(sample.ramTotalMB) : null,hunts:online ? hunts : null});
  const rows = [row('Server #1',mainOnline,main,mainHunts,perf?.at ?? null)];
  if(worker?.configured) {
    const online = worker.online && !!worker.sample && fresh(worker.sample.at,15000,now);
    rows.push(row('Server #2',online,worker.sample,Array.isArray(worker.sample?.hunts) ? worker.sample.hunts.length : null,worker.sample?.at ?? null));
  }
  const sum = field => rows.every(r=>r[field] !== null) ? rows.reduce((n,r)=>n+r[field],0) : null;
  const cpu = sum('cpu'), ramUsedMB=sum('ramUsedMB'),ramTotalMB=sum('ramTotalMB');
  return {rows,totals:{servers:rows.length,online:rows.filter(r=>r.online).length,
    meanCpu:cpu===null?null:cpu/rows.length,ramUsedMB,ramTotalMB,
    ramPercent:ramUsedMB!==null && ramTotalMB>0 ? ramUsedMB/ramTotalMB*100:null,hunts:sum('hunts')}};
}
