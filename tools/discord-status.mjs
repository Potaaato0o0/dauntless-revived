import {readFile, writeFile, rename, appendFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function webhookUrl(value) {
  const u = new URL(value.trim());
  if (u.protocol !== 'https:' || u.hostname !== 'discord.com' || u.port || u.username || u.password || u.search || u.hash || !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u.pathname)) throw new Error('Invalid webhook configuration');
  return u.href;
}

// A deliberate allowlist: never forward backend names, addresses, players or errors.
export function payload(sample, now = Date.now(), fleet = null) {
  const at=Math.floor(now/1000), online=sample!==null;
  const num=(v,suffix='')=>Number.isFinite(v)&&v>=0?v.toFixed(1)+suffix:'Unknown';
  const fields=[
    {name:'👥 Slayers online',value:online?String(sample.players):'Unknown',inline:true},
    {name:'🌐 Fleet availability',value:fleet?`${fleet.online} / ${fleet.servers} hosts reporting`:'Monitoring unavailable',inline:true},
    {name:'⚔️ Active hunts',value:Number.isInteger(fleet?.hunts)?String(fleet.hunts):fleet?`${fleet.knownHunts} reported · partial`:'Unknown',inline:true}
  ];
  for(const [i,name] of ['Server #1 · EU','Server #2 · EU overflow','Server #3 · Australia (OCE)','Server #4 · Germany'].entries()){
    const r=fleet?.rows?.[i];
    fields.push({name,inline:true,value:r?.online
      ? `🟢 Online\nHunts: ${Number.isInteger(r.hunts)?r.hunts:'Unknown'}\nCPU: ${num(r.cpu,'%')}\nRAM: ${num(r.ramUsedMB===null?null:r.ramUsedMB/1024)} / ${num(r.ramTotalMB===null?null:r.ramTotalMB/1024)} GB`
      : '🟠 Monitoring unavailable'});
  }
  if(fleet){
    fields.push({name:'📊 Reporting hosts combined',value:`Mean CPU: ${num(fleet.meanCpu,'%')}\nRAM: ${num(fleet.ramUsedMB/1024)} / ${num(fleet.ramTotalMB/1024)} GB\n${fleet.online}/${fleet.servers} hosts reporting; unavailable hosts excluded.`});
  }
  if(online){
    const seconds=Math.floor(sample.uptime);
    fields.push({name:'Shared backend',value:`🟢 Online · ${Math.round(sample.ms)} ms local check\nUptime: ${Math.floor(seconds/86400)}d ${Math.floor(seconds%86400/3600)}h ${Math.floor(seconds%3600/60)}m\nStarted <t:${at-seconds}:R>`});
  }
  fields.push({name:'Region guide',value:'Main is now EU. Choose EU, Germany or Australia (OCE) in launcher Settings, then relaunch. EU uses its overflow workers. Germany and OCE stay in their selected region unless joining a party led elsewhere. Parties follow their leader; invitations work across regions.'});
  fields.push({name:'📥 Launcher 0.1.31 · Developer tags',value:'Update your launcher for direct Cloudflare game downloads, resume support and verified files. Existing verified installs need no redownload. Includes the Trials, Lady Luck and Middleman DLL. [Download / release notes](https://github.com/mixutin/dauntless-revived/releases/tag/launcher-v0.1.31)'});
  fields.push({name:'Last checked',value:`<t:${at}:F> (<t:${at}:R>)`});
  return {allowed_mentions:{parse:[]},embeds:[{title:'Dauntless Revived · Live realm status',
    description:online?'**Clear skies, Slayers.** Shared accounts and progression across EU, Germany and OCE.':'The shared backend is currently unavailable. Please check again shortly.',
    color:online&&fleet?.servers>0&&fleet.online===fleet.servers?0x35bc84:0xe1a349,fields,
    footer:{text:'Host health and backend activity, not player ping or proof of hunt completion. Stale readings are unknown.'}}]};
}

export async function sampleBackend(backend, key, fetcher = fetch) {
  const url = new URL(backend);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) throw new Error('Backend must use loopback HTTP');
  const start = performance.now();
  try {
    const res = await fetcher(new URL('/undaunted/api/ServerStatus', url), {headers: {'x-undaunted-user-api-key': key}, signal: AbortSignal.timeout(8000), redirect: 'error'});
    if (!res.ok) return null;
    const data = await res.json();
    if (data.online !== true || data.limited !== false || !Number.isInteger(data.playersOnline) || data.playersOnline < 0 || !Number.isFinite(data.uptimeSeconds) || data.uptimeSeconds < 0) return null;
    return {players: data.playersOnline, uptime: data.uptimeSeconds, ms: performance.now() - start};
  } catch { return null; }
}

export class Publisher {
  constructor(url, state, save, fetcher = fetch) {
    this.url = webhookUrl(url); this.state = state; this.save = save; this.fetcher = fetcher;
    this.next = 0; this.failures = 0; this.disabled = false;
    if (state.id !== undefined && !/^\d+$/.test(state.id)) throw new Error('Invalid message ID');
    // An interrupted initial POST may have reached Discord. Never blindly duplicate it.
    if (state.creating && !state.id) this.disabled = true;
  }
  async send(body, now = Date.now()) {
    if (this.disabled || now < this.next) return;
    this.next = now + 15000;
    const editing = Boolean(this.state.id);
    if (!editing) { this.state.creating = true; await this.save(this.state); }
    let res;
    try {
      res = await this.fetcher(editing ? `${this.url}/messages/${this.state.id}` : `${this.url}?wait=true`, {
        method: editing ? 'PATCH' : 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000), redirect: 'error',
      });
    } catch {
      if (!editing) this.disabled = true;
      this.next = now + Math.min(300000, 15000 * 2 ** Math.min(++this.failures, 5));
      console.error('Discord status delivery failed; backing off. Initial delivery uncertainty requires operator review.');
      return;
    }
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const retry = Math.max(Number(data.retry_after) || 0, Number(res.headers.get('retry-after')) || 0, Number(res.headers.get('x-ratelimit-reset-after')) || 0, 15);
      this.next = now + Math.ceil(retry * 1000) + 1000;
      if (!editing) { delete this.state.creating; await this.save(this.state); }
      return;
    }
    if (!res.ok) {
      if (!editing) this.disabled = true;
      this.next = now + Math.min(300000, 15000 * 2 ** Math.min(++this.failures, 5));
      await res.body?.cancel();
      console.error(`Discord status rejected with HTTP ${res.status}; retaining message ID and backing off.`);
      return;
    }
    if (!editing) {
      const data = await res.json().catch(() => ({}));
      if (!/^\d+$/.test(data.id ?? '')) { this.disabled = true; return; }
      this.state = {id: data.id}; await this.save(this.state);
    } else { await res.body?.cancel(); }
    this.failures = 0;
    this.state.lastSuccess = new Date(now).toISOString();
    await this.save(this.state);
    if (res.headers.get('x-ratelimit-remaining') === '0') this.next = Math.max(this.next, now + (Number(res.headers.get('x-ratelimit-reset-after')) || 15) * 1000 + 1000);
  }
}

async function main() {
  if (process.env.STATUS_ERROR_FILE) {
    // Only static messages from this module; never exception objects or HTTP bodies.
    console.error = message => {
      logChain = logChain.then(async () => {
        const path = process.env.STATUS_ERROR_FILE;
        if ((await stat(path).catch(() => null))?.size > 262144) await writeFile(path, '');
        await appendFile(path, `${new Date().toISOString()} ${message}\n`, {mode: 0o600});
      }).catch(() => {});
    };
  }
  const key = (await readFile(process.env.STATUS_OWNER_KEY_FILE, 'utf8')).trim();
  const webhook = await readFile(process.env.STATUS_WEBHOOK_FILE, 'utf8');
  const stateFile = process.env.STATUS_STATE_FILE;
  let state;
  try { state = JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = {}; }
  const save = async value => { await writeFile(`${stateFile}.tmp`, JSON.stringify(value), {mode: 0o600}); await rename(`${stateFile}.tmp`, stateFile); };
  const publisher = new Publisher(webhook, state, save);
  if (publisher.disabled) console.error('Status delivery paused: review persisted initial-message state.');
  while (true) {
    try {
      const sample = await sampleBackend(process.env.STATUS_BACKEND || 'http://127.0.0.1:61000', key);
      const fleet = await sampleFleet(process.env.STATUS_DASHBOARD || 'http://127.0.0.1:61110', key);
      await publisher.send(payload(sample, Date.now(), fleet));
    } catch { console.error('Status cycle failed; retrying without creating another message.'); }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
let logChain = Promise.resolve();
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Status worker stopped: check private configuration and file permissions.'); process.exitCode = 1; });
}

// Project only numeric fleet telemetry; no addresses, player names, keys or raw errors leave the host.
export async function sampleFleet(dashboard, key, fetcher=fetch) {
  const url=new URL(dashboard);
  if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || url.username || url.password)throw new Error('Dashboard must use loopback HTTP');
  try {
    const r=await fetcher(new URL('/api/status',url),{headers:{'x-dashboard-key':key},signal:AbortSignal.timeout(8000),redirect:'error'});
    if(!r.ok)return null;
    const data=await r.json(), f=data.fleet;
    if(!Array.isArray(f?.rows) || f.rows.length<3 || f.rows.length>4)return null;
    const n=v=>Number.isFinite(v)&&v>=0?v:null;
    const rows=f.rows.map(row=>({online:row.online===true,cpu:n(row.cpu),ramUsedMB:n(row.ramUsedMB),ramTotalMB:n(row.ramTotalMB),hunts:Number.isInteger(row.hunts)&&row.hunts>=0?row.hunts:null}));
    const reporting=rows.filter(r=>r.online), cpus=reporting.filter(r=>r.cpu!==null);
    return {rows,online:reporting.length,servers:rows.length,
      knownHunts:reporting.reduce((v,r)=>v+(r.hunts??0),0),
      hunts:rows.every(r=>r.online&&r.hunts!==null)?rows.reduce((v,r)=>v+r.hunts,0):null,
      meanCpu:cpus.length?cpus.reduce((v,r)=>v+r.cpu,0)/cpus.length:null,
      ramUsedMB:reporting.reduce((v,r)=>v+(r.ramUsedMB??0),0),
      ramTotalMB:reporting.reduce((v,r)=>v+(r.ramTotalMB??0),0)};
  }catch{return null;}
}
