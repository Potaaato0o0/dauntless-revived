const finite = value => Number.isFinite(value) && value >= 0 ? value : null;
const fresh = (at, limit, now) => Number.isFinite(Date.parse(at)) && now-Date.parse(at) <= limit && Date.parse(at) <= now+60000;
export function fleetSummary(main, worker, mainError = null, now = Date.now(), aus = null, germany = null) {
  const mainOnline = !!main && !mainError && fresh(main.at,30000,now);
  const perf = main?.performance;
  const mainHunts = mainOnline && perf && !perf.stale && fresh(perf.at,150000,now) ? perf.processes.filter(p=>p.role==='hunt' || p.role==='tutorial').length : null;
  const row = (name, online, sample, hunts, huntSampleAt) => ({name,online,at:sample?.at ?? null,huntSampleAt,
    cpu:online ? finite(sample.cpu) : null, logicalCpus:sample?.logicalCpus ?? null,
    ramUsedMB:online ? finite(sample.ramUsedMB) : null,ramTotalMB:online ? finite(sample.ramTotalMB) : null,hunts:online ? hunts : null});
  const rows = [row('Server #1',mainOnline,main,mainHunts,perf?.at ?? null)];
  for (const [name,node] of [['Server #2 · EU overflow',worker],['Server #3 · Australia',aus],['Server #4 · Germany',germany]]) {
    if(!node?.configured)continue;
    const online = node.online && !!node.sample && fresh(node.sample.at,30000,now);
    rows.push(row(name,online,node.sample,Array.isArray(node.sample?.hunts) ? node.sample.hunts.filter(h=>!['city','dojo'].includes(h.kind)).length : null,node.sample?.at ?? null));
  }
  const sum = field => rows.every(r=>r[field] !== null) ? rows.reduce((n,r)=>n+r[field],0) : null;
  const cpu = sum('cpu'), ramUsedMB=sum('ramUsedMB'),ramTotalMB=sum('ramTotalMB');
  return {rows,totals:{servers:rows.length,online:rows.filter(r=>r.online).length,
    meanCpu:cpu===null?null:cpu/rows.length,ramUsedMB,ramTotalMB,
    ramPercent:ramUsedMB!==null && ramTotalMB>0 ? ramUsedMB/ramTotalMB*100:null,hunts:sum('hunts')}};
}
