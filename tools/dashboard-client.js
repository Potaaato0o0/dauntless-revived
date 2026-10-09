(() => {
  let key = '', busy = false, lastSample = null, lastWorker = null, lastAus = null, lastGermany = null, accountPage = [], accountOffset = 0, nextOffset = null, accountsBusy = false;
  const el = id => document.getElementById(id);
  const number = (n, suffix = '') => Number.isFinite(n) ? `${n.toFixed(1)}${suffix}` : '—';
  const duration = seconds => Number.isFinite(seconds) && seconds >= 0 ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m` : '—';
  const fleetHistory=[];
  const fleetCharts=['fleetCpuChart','fleetRamChart','fleetHuntChart'];
  const charts = ['cpu', 'ramUsedMB', 'players', 'backendMs', 'requestsPerSecond', 'errorPercent', 'eventLoopP95Ms', 'backendRssMB', 'backendHeapMB'];
  function table(id, rows) { el(id).replaceChildren(...rows.map(cells => { const tr = document.createElement('tr'); for (const text of cells) { const td = document.createElement('td'); td.textContent = text; tr.append(td); } return tr; })); }
  async function get(path) {
    const response = await fetch(path, {headers: {'x-dashboard-key': key}, signal: AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error(response.status === 401 ? 'Owner key rejected.' : 'Dashboard request failed.');
    return response.json();
  }
  function graph(id, history) {
    const canvas = el(id), ctx = canvas.getContext('2d');
    if (!canvas.clientWidth) return;
    canvas.width = Math.max(200, canvas.clientWidth * devicePixelRatio); canvas.height = 140 * devicePixelRatio;
    const values = history.map(row => row[id]);
    const peak = Math.max(0, ...values.filter(value => Number.isFinite(value)));
    const max = Math.max(1, peak);
    ctx.strokeStyle = '#49d4d0'; ctx.lineWidth = 2 * devicePixelRatio; ctx.beginPath();
    let gap = true;
    values.forEach((value, i) => { if (value === null) { gap = true; return; } const x = i * canvas.width / Math.max(1, values.length - 1), y = canvas.height - 20 - value / max * (canvas.height - 40); if (gap) ctx.moveTo(x, y); else ctx.lineTo(x, y); gap = false; });
    ctx.stroke(); ctx.fillStyle = '#e4eef5'; ctx.font = `${12 * devicePixelRatio}px system-ui`; ctx.fillText(`Current: ${values.at(-1) == null ? 'unavailable' : Number(values.at(-1)).toFixed(1)} · peak: ${values.some(v => v != null) ? peak.toFixed(1) : 'unavailable'}`, 4, 16 * devicePixelRatio);
  }
  function renderDiscord(stats) {
    const fields={botLinked:stats?.linkedAccounts,botIssued:stats?.bot?.issued,botUnused:stats?.bot?.unused,botRedeemed:stats?.bot?.redeemed,botPending:stats?.bot?.pending,botRevoked:stats?.bot?.revoked};
    for(const [id,value] of Object.entries(fields)) el(id).textContent=Number.isSafeInteger(value)&&value>=0 ? value : '—';
    el('botStatsStatus').textContent=stats ? `${stats.error || 'Counts from the central account database and bot claim history.'} Updated ${new Date(stats.at).toLocaleTimeString()}` : 'Bot statistics unavailable.';
  }


  function renderFleet(fleet) {
    if (!fleet) return;
    table('fleetRows',fleet.rows.map(s=>[s.name,s.online?'Online':'Unavailable / stale',s.hunts ?? '—',number(s.cpu,'%'),`${number(s.ramUsedMB===null?null:s.ramUsedMB/1024)} / ${number(s.ramTotalMB===null?null:s.ramTotalMB/1024)} GB`,s.huntSampleAt ? new Date(s.huntSampleAt).toLocaleTimeString() : '—']));
    const t=fleet.totals;
    fleetHistory.push({fleetCpuChart:t.meanCpu,fleetRamChart:t.ramUsedMB,fleetHuntChart:t.hunts});
    if(fleetHistory.length>720)fleetHistory.shift();
    for(const id of fleetCharts)graph(id,fleetHistory);
    el('fleetOnline').textContent=`${t.online} / ${t.servers}`;
    el('fleetMeanCpu').textContent=number(t.meanCpu,'%');
    el('fleetHunts').textContent=t.hunts ?? '—';
    el('fleetRam').textContent=`${number(t.ramUsedMB===null?null:t.ramUsedMB/1024)} / ${number(t.ramTotalMB===null?null:t.ramTotalMB/1024)} GB`;
    el('fleetRamPercent').textContent=`${number(t.ramPercent,'%')} of combined capacity`;
    el('fleetAvailability').textContent=`${t.online}/${t.servers} servers reporting. Totals remain unavailable when a required reading is stale.`;
  }

  function renderWorker(worker, prefix='worker') {
    if(prefix==='worker')lastWorker=worker;else if(prefix==='aus')lastAus=worker;else lastGermany=worker;
    const el=id=>document.getElementById(id.replace(/^worker/,prefix));
    const s=worker?.sample;
    el('workerConnection').textContent=!worker?.configured?'Not configured':worker.online?(worker.status==='delayed'?'Monitoring delayed · last sample retained':'Connected'):'Monitoring unavailable';
    el('workerError').textContent=worker?.error||'';
    if(!s)return;
    el('workerFreshness').textContent=`${Date.now()-Date.parse(s.at)>30000?'STALE — ':''}Sample: ${new Date(s.at).toLocaleString()}`;
    el('workerCpu').textContent=number(s.cpu,'%');el('workerCores').textContent=`${s.logicalCpus} logical processors`;
    el('workerMemory').textContent=`${number(s.ramUsedMB/1024)} / ${number(s.ramTotalMB/1024)} GB`;
    el('workerDisk').textContent=`Disk free ${number(s.diskFreeGB)} GB`;
    el('workerHunts').textContent=s.hunts.filter(h=>!['city','dojo'].includes(h.kind)).length;
    el('workerUptime').textContent=`Host uptime ${duration(s.hostUptimeSeconds)}`;
    table(prefix+'Services',[['Worker monitor',worker.online?'Up':'Unavailable'],['Hunt deployment',s.services.deploy?'Up':'Unavailable'],['Shared backend connection',s.services.backend?'Up':'Unavailable'],['Player allowlist',s.services.allowlist?'Up':'Unavailable']]);
    const f=s.firewall;
    el('workerFirewall').textContent=f?`UDP ${f.ports} · ${f.addresses} authenticated addresses · Firewall ${f.ok===false?'update failed':f.enabled?'open for allowed players':'closed'}${f.pending?' · update pending':''}`:'Firewall state unavailable';
    for(const id of ['CpuChart','RamChart'])graph(prefix+id,(worker.history||[]).map(row=>({...row,[prefix+id]:row['worker'+id]})));
    const p=s.processes;
    el('workerProcessFreshness').textContent=p?`${Date.now()-Date.parse(p.at)>150000?'STALE — ':''}Process sample: ${new Date(p.at).toLocaleString()}`:'Waiting for process sample';
    el('workerNetwork').textContent=p?`Network in ${number(p.netInKbit)} / out ${number(p.netOutKbit)} kbit/s`:'';
    table(prefix+'ProcessRows',(p?.processes||[]).map(v=>[v.role,`${v.pid} / ${v.port??'—'}`,number(v.cpuPercent,'%'),number(v.workingSetMB,' MB'),number(v.privateMB,' MB'),duration((Date.now()-Date.parse(v.startedAt))/1000)]));
    table(prefix+'HuntRows',s.hunts.map(v=>[v.huntId||v.kind,v.port,v.expectedPlayers,duration((Date.now()-Date.parse(v.startedAt))/1000)]));
  }

  function list(id, values) { el(id).replaceChildren(...values.map(text => { const item = document.createElement('li'); item.textContent = text; return item; })); }
  async function refresh() {
    if (!key || busy || document.hidden) return;
    busy = true;
    try {
      const result = await get('/api/status');
      el('error').textContent = result.error || '';
      renderDiscord(result.sample?.discord);

      renderFleet(result.fleet);

      renderWorker(result.worker);
      renderWorker(result.aus,'aus');
      renderWorker(result.germany,'germany');
      el('login').hidden = true; el('data').hidden = false;
      el('invites').hidden = !result.invitesEnabled;
      el('invitesUnavailable').hidden = result.invitesEnabled;
      el('connection').textContent = result.error ? 'Backend unavailable · stale' : 'Connected · private access';
      const s = result.sample;
      if (s) {
        lastSample = s;
        el('serverName').textContent = s.name || 'Owner dashboard';
        el('fleetPlayers').textContent=s.players.length;
        el('fleetAccounts').textContent=s.accounts ?? '—';
        el('fleetLocations').textContent=`Ramsgate ${s.locations.city ?? 0} · Hunts ${s.locations.hunt ?? 0} · Menu ${s.locations.menu ?? 0}`;
        el('onlineValue').textContent = s.players.length;
        el('cityValue').textContent = `Ramsgate ${s.locations.city} · Hunts ${s.locations.hunt}`;
        el('cpuValue').textContent = number(s.cpu, '%'); el('coresValue').textContent = `${s.logicalCpus} logical processors`;
        el('ramValue').textContent = `${number(s.ramUsedMB / 1024)} / ${number(s.ramTotalMB / 1024)} GB`;
        el('ramFreeValue').textContent = `Free ${number((s.ramTotalMB - s.ramUsedMB) / 1024)} GB`;
        el('accountValue').textContent = s.accounts; el('newValue').textContent = `${s.newAccountsObserved} observed additions since startup`;
        el('freshness').textContent = `Last successful sample: ${new Date(s.at).toLocaleString()}`;
        for (const id of charts) graph(id, s.history);
        const r = s.health?.requests;
        el('health').textContent = r ? `Last 60 seconds: ${r.completed} responses · ${r.clientErrors} client errors · ${r.serverErrors} server errors · ${r.aborted} aborted · latency upper bounds p50 ${r.latencyP50UpperMs ?? 'n/a'} ms / p95 ${r.latencyP95UpperMs ?? 'n/a'} ms` : 'Waiting for backend health readings.';
        el('healthError').textContent = s.healthError || '';
        el('locations').textContent = `Ramsgate: ${s.locations.city} · Hunts: ${s.locations.hunt} · Dojo: ${s.locations.dojo} · Tutorial: ${s.locations.tutorial} · Menu: ${s.locations.menu} · Unknown: ${s.locations.unknown}`;
        el('uptimes').textContent = `VPS uptime: ${duration(s.hostUptimeSeconds)} · Backend: ${duration(s.uptimeSeconds)} · Dashboard: ${duration(s.dashboardUptimeSeconds)}`;
        list('playerList', s.players.length ? s.players.map(player => `${player.name} — ${player.where}`) : ['No players online']);
        list('worldList', s.instances.length ? s.instances.map(world => `${world.title}: ${world.players}/${world.maxPlayers}`) : ['No registered worlds']);
        const perf = s.performance;
        el('performanceStatus').textContent = perf ? `${perf.stale || Date.now() - Date.parse(perf.at) > 150000 ? 'STALE — ' : ''}Sample: ${new Date(perf.at).toLocaleString()} · collected approximately once per minute` : 'Performance log unavailable. Configure DASHBOARD_PERFORMANCE_DIR and enable the kit sampler.';
        el('hostExtra').textContent = perf ? `Disk free ${number(perf.host.disk_free_gb)} GB · Network in ${number(perf.host.net_in_kbit_s)} / out ${number(perf.host.net_out_kbit_s)} kbit/s` : '';
        table('processRows', (perf?.processes || []).map(p => [p.role, `${p.pid ?? '—'} / ${p.udp_port ?? '—'}`, number(p.cpu_host_percent, '%'), number(p.working_set_mb, ' MB'), number(p.private_mb, ' MB'), duration((Date.now() - Date.parse(p.started_utc)) / 1000)]));
      }
      if (el('logs').options.length === 0) for (const name of result.logNames) { const option = document.createElement('option'); option.textContent = name; option.value = name; el('logs').append(option); }
    } catch (error) { el('connection').textContent = 'Disconnected · readings stale'; el('error').textContent = `${error.message} Displayed readings may be stale.`; }
    finally { busy = false; }
  }
  el('connect').onclick = () => { key = el('key').value.trim(); el('key').value = ''; refresh(); };
  el('key').onkeydown = event => { if (event.key === 'Enter') el('connect').click(); };
  el('keyFile').onchange = async () => { const file = el('keyFile').files[0]; if (!file) return; if (file.size > 4096) { el('error').textContent = 'Select the small owner.key text file, not a backup archive.'; return; } key = (await file.text()).trim(); el('keyFile').value = ''; refresh(); };
  el('logout').onclick = () => { key = ''; location.reload(); };
  for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => {
    for (const panel of document.querySelectorAll('.view')) panel.hidden = panel.id !== button.dataset.view;
    for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed', String(tab === button));
    if (lastSample) for (const id of charts) graph(id, lastSample.history);
    if (button.dataset.view === 'overview')for(const id of fleetCharts)graph(id,fleetHistory);
    if (button.dataset.view === 'people') loadAccounts();
    if (button.dataset.view === 'worker' && lastWorker) renderWorker(lastWorker);
    if (button.dataset.view === 'aus' && lastAus) renderWorker(lastAus,'aus');
    if (button.dataset.view === 'germany' && lastGermany) renderWorker(lastGermany,'germany');
  };
  function showAccounts() {
    const query = el('accountSearch').value.trim().toLowerCase();
    const visible=accountPage.filter(a => `${a.name} ${a.id} ${a.keyFingerprint || ''}`.toLowerCase().includes(query));
    table('accountRows',visible.map(a => [a.name,a.id,a.developer?'Server Developer':a.admin?'Administrator':'Player',a.keyFingerprint || 'No active key']));
    Array.from(el('accountRows').children).forEach((row,i)=>{
      if(!visible[i]?.developer)return;
      row.classList.add('developer-row');
      const role=row.children[2];role.textContent='';
      for(const [text,cls] of [['[ ','developer-bracket'],['Server Developer','developer-label'],[' ]','developer-bracket']]){
        const span=document.createElement('span');span.textContent=text;span.className=cls;role.appendChild(span);
      }
    });
  }
  let pendingAccountSearch=false, searchTimer;
  async function loadAccounts() {
    if (!key) return;
    if (accountsBusy) { pendingAccountSearch=true; return; }
    accountsBusy = true; el('refreshAccounts').disabled = true;
    try { const result = await get(`/api/accounts?offset=${accountOffset}&q=${encodeURIComponent(el('accountSearch').value.trim())}`); accountPage = result.accounts; nextOffset = result.nextOffset; showAccounts(); el('accountStatus').textContent = `Accounts ${accountOffset + (accountPage.length ? 1 : 0)}–${accountOffset + accountPage.length}. Search covers all accounts.`; }
    catch (error) { accountPage = []; nextOffset = null; showAccounts(); el('accountStatus').textContent = `${error.message} Account directory may require a backend update.`; }
    finally { accountsBusy = false; el('refreshAccounts').disabled = false; el('previousAccounts').disabled = accountOffset === 0; el('nextAccounts').disabled = nextOffset === null; if(pendingAccountSearch){pendingAccountSearch=false;void loadAccounts();} }
  }
  el('accountSearch').oninput = () => {accountOffset=0;clearTimeout(searchTimer);searchTimer=setTimeout(loadAccounts,300);};
  el('loadModeration').onclick = async () => {
    try {const info=await get(`/api/moderation?accountId=${encodeURIComponent(el('moderationAccount').value.trim())}`);el('moderationInfo').textContent=JSON.stringify(info,null,2);el('moderationStatus').textContent='Current moderation status loaded.';}
    catch(error){el('moderationStatus').textContent=error.message;}
  };
  async function moderate(active){
    const accountId=el('moderationAccount').value.trim(),reason=el('banReason').value.trim();
    if(!accountId || !reason){el('moderationStatus').textContent='Account ID and reason are required.';return;}
    el('banAccount').disabled=el('unbanAccount').disabled=true;
    try {
      const response=await fetch('/api/moderation',{method:'POST',headers:{'x-dashboard-key':key,'content-type':'application/json'},body:JSON.stringify({accountId,reason,active,address:active?el('banAddress').value.trim():null}),signal:AbortSignal.timeout(15000)});
      const result=await response.json();if(!response.ok)throw Error(result.error || 'Moderation failed');
      el('moderationInfo').textContent=JSON.stringify(result,null,2);el('moderationStatus').textContent=active?'Player banned. Reason will appear in the launcher.':'Player unbanned.';
    }catch(error){el('moderationStatus').textContent=error.message;}
    finally{el('banAccount').disabled=el('unbanAccount').disabled=false;}
  }
  el('banAccount').onclick=()=>moderate(true);
  el('unbanAccount').onclick=()=>moderate(false);
  el('refreshAccounts').onclick = loadAccounts;
  el('nextAccounts').onclick = () => { if (!accountsBusy && nextOffset !== null) { accountOffset = nextOffset; loadAccounts(); } };
  el('previousAccounts').onclick = () => { if (!accountsBusy) { accountOffset = Math.max(0, accountOffset - 100); loadAccounts(); } };
  el('identifyKey').onclick = async () => {
    const value = el('matchKey').value.trim(); el('matchKey').value = '';
    if (!value) return;
    try { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); const fingerprint = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16); el('matchResult').textContent = `Fingerprint: ${fingerprint}. Computed in this browser; the key was not sent. Compare against the account list.`; el('accountSearch').value = fingerprint; accountOffset=0; loadAccounts(); }
    catch { el('matchResult').textContent = 'Local hashing unavailable. Use the dashboard through localhost.'; }
  };
  el('createInvite').onclick = async () => {
    if (!key) return;
    el('createInvite').disabled = true; el('copyInvite').disabled = true; el('inviteLink').value = '';
    el('inviteStatus').textContent = 'Creating invite…';
    try {
      const response = await fetch('/api/invites', {method: 'POST', headers: {'x-dashboard-key': key, 'content-type': 'application/json'}, body: JSON.stringify({name: el('inviteName').value.trim(), uses: Number(el('inviteUses').value)}), signal: AbortSignal.timeout(8000)});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Invite request refused (${response.status}).`);
      el('inviteLink').value = result.invite; el('copyInvite').disabled = false;
      el('inviteStatus').textContent = `Ready: ${result.uses} account registration(s).`;
    } catch (error) { el('inviteStatus').textContent = `${error.message} A timed-out request may have created an invite; do not retry blindly.`; }
    finally { el('createInvite').disabled = false; }
  };
  el('copyInvite').onclick = async () => {
    try { await navigator.clipboard.writeText(el('inviteLink').value); el('inviteStatus').textContent = 'Link copied.'; }
    catch { el('inviteLink').select(); el('inviteStatus').textContent = 'Press Ctrl+C to copy the selected link.'; }
  };
  el('refreshLog').onclick = async () => { if (!key || !el('logs').value) return; try { el('logText').textContent = (await get(`/api/log?name=${encodeURIComponent(el('logs').value)}`)).text; } catch (error) { el('logText').textContent = error.message; } };
  setInterval(refresh, 5000);
  document.addEventListener('visibilitychange', refresh);
})();
