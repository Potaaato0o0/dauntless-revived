import http from 'node:http';
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const exec = promisify(execFile);
const cpuTimes = () => os.cpus().reduce((a,c) => ({idle:a.idle+c.times.idle,total:a.total+Object.values(c.times).reduce((x,y)=>x+y,0)}),{idle:0,total:0});

export function processSample(current, previous, cores) {
  const seconds = previous ? (Date.parse(current.at)-Date.parse(previous.at))/1000 : 0;
  return {at:current.at, processes:current.processes.map(p => {
    const old=previous?.processes.find(item=>item.pid===p.pid && item.startedAt===p.startedAt);
    return {...p,cpuPercent:old && seconds>0 ? Math.max(0,Math.min(100,(p.cpuSeconds-old.cpuSeconds)/seconds/cores*100)) : null,cpuSeconds:undefined};
  }), netInKbit:seconds>0 ? Math.max(0,(current.receivedBytes-previous.receivedBytes)*8/1000/seconds) : null,
    netOutKbit:seconds>0 ? Math.max(0,(current.sentBytes-previous.sentBytes)*8/1000/seconds) : null};
}

export async function startWorkerHealth({port=61111,root=process.cwd(),allowlistSecret,fetcher=fetch,collect}={}) {
  const gather=collect || (async()=> {
    const {stdout}=await exec(`${process.env.SystemRoot || 'C:/Windows'}/System32/WindowsPowerShell/v1.0/powershell.exe`,
      ['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./worker-processes.ps1',import.meta.url))],{windowsHide:true,timeout:20000,maxBuffer:65536});
    return JSON.parse(stdout.replace(/^\uFEFF/,''));
  });
  let prior=cpuTimes(), priorProcesses, processInfo=null, sample=null, busy=false, collecting=false;
  const eventLoopStart=performance.now();
  async function probe(url, headers) {
    try { const r=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(2000)}); if(!r.ok)return null; return await r.json(); }catch{return null;}
  }
  async function poll() {
    if(busy)return; busy=true;
    try {
      const [deploy,allowlist,backend,disk]=await Promise.all([
        probe('http://127.0.0.1:61001/gameservers'),
        probe('http://127.0.0.1:61005/status',{'x-allowlist-secret':allowlistSecret || ''}),
        probe('http://127.0.0.1:61000/dauntless-status'), statfs(root).catch(()=>null)]);
      const now=cpuTimes(), elapsed=now.total-prior.total;
      sample={at:new Date().toISOString(),cpu:elapsed>0 ? 100*(1-(now.idle-prior.idle)/elapsed):null,
        logicalCpus:os.cpus().length,ramUsedMB:(os.totalmem()-os.freemem())/1048576,ramTotalMB:os.totalmem()/1048576,
        diskFreeGB:disk ? disk.bavail*disk.bsize/1073741824:null,hostUptimeSeconds:os.uptime(),monitorUptimeSeconds:(performance.now()-eventLoopStart)/1000,
        services:{deploy:Array.isArray(deploy?.servers),backend:!!backend,allowlist:!!allowlist},
        firewall:allowlist ? {enabled:allowlist.lastApply?.enabled ?? false,ok:allowlist.lastApply?.ok ?? null,addresses:allowlist.entries?.length ?? 0,pending:allowlist.pending,ports:allowlist.ports}:null,
        hunts:Array.isArray(deploy?.servers) ? deploy.servers.map(s=>({id:s.id,port:s.port,kind:s.kind,map:s.map,huntId:s.huntId,expectedPlayers:s.expectedPlayers?.length ?? 0,startedAt:s.startedAt})):[],
        processes:processInfo,monitorMemoryMB:process.memoryUsage().rss/1048576};
      prior=now;
    }finally{busy=false;}
  }
  async function scan(){if(collecting)return;collecting=true;try{const current=await gather();processInfo=processSample(current,priorProcesses,os.cpus().length);priorProcesses=current;}catch{/* Keep the last timestamped sample; UI marks it stale. */}finally{collecting=false;}}
  void scan(); await poll();
  const timer=setInterval(()=>void poll(),5000), scanner=setInterval(()=>void scan(),60000);
  timer.unref();scanner.unref();
  const server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.headers['x-forwarded-for'] || req.headers.forwarded){res.writeHead(403).end();return;}
    if(req.method!=='GET' || req.url!=='/health'){res.writeHead(404).end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(sample));
  });
  server.on('close',()=>{clearInterval(timer);clearInterval(scanner);});
  server.requestTimeout=5000;server.maxConnections=16;
  await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});
  return server;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  startWorkerHealth({root:process.env.WORKER_ROOT || process.cwd(),allowlistSecret:process.env.ALLOWLIST_SECRET}).then(()=>console.log('Worker health ready')).catch(()=>{console.error('Worker health startup failed');process.exitCode=1;});
}
