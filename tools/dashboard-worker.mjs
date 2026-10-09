export async function monitorWorker(url, label, fetcher=fetch,clock=Date.now) {
  const target=url?new URL(url):null;
  if(target&&(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.username||target.password||target.pathname!=='/'||target.search||target.hash))throw new Error('Worker must use a loopback tunnel');
  let state={configured:!!target,online:false,sample:null,error:null,lastSuccess:null,failures:0},busy=false;
  const history=[];
  async function poll(){
    if(!target||busy)return;busy=true;
    try{
      const response=await fetcher(new URL('/health',target),{signal:AbortSignal.timeout(8000),redirect:'error'});
      if(!response.ok)throw new Error();
      const data=await response.json();
      if(!data.services||!Array.isArray(data.hunts)||!Number.isFinite(Date.parse(data.at)))throw new Error();
      history.push({at:data.at,workerCpuChart:data.cpu,workerRamChart:data.ramUsedMB});
      if(history.length>720)history.shift();
      state={configured:true,online:true,sample:data,history,error:null,lastSuccess:clock(),failures:0};
    }catch{state={...state,failures:state.failures+1,error:`${label} monitoring delayed; last successful sample retained.`};}
    finally{busy=false;}
  }
  await poll();const timer=setInterval(()=>void poll(),5000);timer.unref();
  return {poll,get state(){const online=state.lastSuccess!==null && clock()-state.lastSuccess<=30000;return {...state,online,status:online?(state.failures?'delayed':'online'):'unavailable',error:online?state.error:(state.configured?`${label} monitoring unavailable; game availability is unknown.`:null)};},close(){clearInterval(timer);}};
}
