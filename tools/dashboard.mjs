import http from 'node:http';
import os from 'node:os';
import { readFile, open, lstat } from 'node:fs/promises';
import { timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readPerformance } from './dashboard-performance.mjs';
import { fleetSummary } from './dashboard-fleet.mjs';

export function scrubLog(text) {
  return text.split(/\r?\n/).slice(-150).map(line => {
    // Omit whole credential-bearing lines, including structured request captures.
    if (/token|password|secret|authorization|api.?key|exchange_code|UUK_|eyJ|cookie/i.test(line)) return '[credential-bearing line omitted]';
    return line.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 2000);
  }).join('\n');
}

export async function tailLog(path) {
  if ((await lstat(path)).isSymbolicLink()) throw new Error('Log links are not supported');
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('Not a log file');
    const size = Math.min(stat.size, 32768);
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await file.read(buffer, 0, size, stat.size - size);
    let text = buffer.subarray(0, bytesRead).toString('utf8');
    if (stat.size > size) text = text.slice(text.indexOf('\n') + 1);
    return scrubLog(text);
  } finally { await file.close(); }
}

const digest = value => createHash('sha256').update(value).digest();
const cpuTimes = () => os.cpus().reduce((sum, cpu) => {
  sum.idle += cpu.times.idle;
  sum.total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
  return sum;
}, {idle: 0, total: 0});

export async function startDashboard({key, backend, port = 61110, logs = {}, serverConfig = null, performanceDir = null, workerUrl = null, fetcher = fetch}) {
  if (typeof key !== 'string' || key.length < 16) throw new Error('An owner key of at least 16 characters is required');
  const target = new URL(backend);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.username || target.password) throw new Error('Backend must be loopback HTTP');
  const page = await readFile(new URL('./dashboard.html', import.meta.url));
  if (serverConfig && (serverConfig.Mode !== 'Public' || !/^[a-z0-9.-]+$/i.test(serverConfig.PublicHost || '') || !Number.isInteger(serverConfig.Ports?.gateway) || serverConfig.Ports.gateway < 1 || serverConfig.Ports.gateway > 65535 || !/^[a-f0-9]{64}$/i.test(serverConfig.CertFingerprint || ''))) throw new Error('Invalid public server configuration');
  const workerTarget = workerUrl ? new URL(workerUrl) : null;
  if (workerTarget && (workerTarget.protocol !== 'http:' || workerTarget.hostname !== '127.0.0.1' || workerTarget.username || workerTarget.password || workerTarget.pathname !== '/' || workerTarget.search || workerTarget.hash)) throw new Error('Worker must use a loopback tunnel');
  let worker = {configured:!!workerTarget,online:false,sample:null,error:null};
  let workerPolling=false;
  const workerHistory=[];
  async function pollWorker() {
    if(!workerTarget || workerPolling)return; workerPolling=true;
    try {
      const response=await fetcher(new URL('/health',workerTarget),{signal:AbortSignal.timeout(2500),redirect:'error'});
      if(!response.ok)throw new Error();
      const data=await response.json();
      if(!data.services || !Array.isArray(data.hunts) || !Number.isFinite(Date.parse(data.at)))throw new Error();
      workerHistory.push({at:data.at,workerCpuChart:data.cpu,workerRamChart:data.ramUsedMB});
      if(workerHistory.length>720)workerHistory.shift();
      worker={configured:true,online:true,sample:data,history:workerHistory,error:null};
    }catch{worker={...worker,online:false,error:'Server #2 or its private monitoring connection is unavailable. Last readings are stale.'};}
    finally{workerPolling=false;}
  }
  await pollWorker();
  const workerTimer=setInterval(()=>void pollWorker(),5000);workerTimer.unref();

  let previous = cpuTimes(), known = null, added = 0, sample = null, failure = null, polling = false;
  const history = [];
  let performanceSample = null, performanceAt = 0;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const started = performance.now();
      const get = async route => {
        const response = await fetcher(new URL(route, target), {headers: {'x-undaunted-user-api-key': key}, signal: AbortSignal.timeout(3000), redirect: 'error'});
        if (!response.ok) throw new Error('Backend unavailable or owner key rejected');
        return response.json();
      };
      const [accounts, status] = await Promise.all([get('/undaunted/api/GetAllUsers'), get('/undaunted/api/ServerStatus')]);
      let health = null;
      let healthError = null;
      let discord = null;
      try { discord = await get('/undaunted/api/DiscordKeyStats'); } catch { /* Older backends: report unavailable, not zero. */ }
      try { health = await get('/undaunted/api/BackendHealth'); if (!health?.requests) { health = null; healthError = 'Backend returned no health metrics.'; } }
      catch { healthError = 'Backend health disabled or unavailable. Set BACKEND_HEALTH=1 and restart the metagame.'; }
      if (performanceDir && Date.now() - performanceAt >= 15000) {
        performanceAt = Date.now();
        try { performanceSample = await readPerformance(performanceDir); } catch { performanceSample = null; }
      }
      if (!Array.isArray(accounts.Users) || !Array.isArray(status.players) || !Array.isArray(status.instances)) throw new Error('Unexpected backend response');
      const ids = new Set(accounts.Users.map(user => user.UserId));
      if (known) for (const id of ids) if (!known.has(id)) added++;
      known = ids;
      const current = cpuTimes(), elapsed = current.total - previous.total;
      const cpu = elapsed > 0 ? 100 * (1 - (current.idle - previous.idle) / elapsed) : null;
      previous = current;
      const locations = {city: 0, hunt: 0, dojo: 0, tutorial: 0, menu: 0, unknown: 0};
      for (const player of status.players) locations[Object.hasOwn(locations, player.where) ? player.where : 'unknown']++;
      const point = {at: new Date().toISOString(), cpu, ramUsedMB: (os.totalmem() - os.freemem()) / 1048576, ramTotalMB: os.totalmem() / 1048576, players: status.playersOnline, accounts: ids.size, newAccountsObserved: added, backendMs: performance.now() - started,
        requestsPerSecond: health?.requests?.requestsPerSecond ?? null, errorPercent: health?.requests?.serverErrorPercent ?? null, eventLoopP95Ms: health?.eventLoop?.p95Ms ?? null,
        backendRssMB: health?.memoryMB?.rss ?? null, backendHeapMB: health?.memoryMB?.heapUsed ?? null};
      history.push(point);
      if (history.length > 720) history.shift();
      sample = { ...point, players: status.players, instances: status.instances, history, uptimeSeconds: status.uptimeSeconds, hostUptimeSeconds: os.uptime(), dashboardUptimeSeconds: process.uptime(), locations, health, healthError, discord, performance: performanceSample, logicalCpus: os.cpus().length, name: status.name };
      failure = null;
    } catch { failure = 'Backend unavailable or owner key rejected; last readings are stale.'; }
    finally { polling = false; }
  }
  await poll();
  const timer = setInterval(poll, 5000);
  timer.unref();
  let requests = 0, windowStart = Date.now(), readingLog = false, inviting = false;
  let inviteCount = 0, inviteWindow = Date.now();
  let readingAccounts = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(req.headers.host ?? '') || req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.writeHead(403).end(); return; }
    const createInvite = req.method === 'POST' && req.url === '/api/invites';
    if (req.method !== 'GET' && !createInvite) { res.writeHead(405).end(); return; }
    if (Date.now() - windowStart > 60000) { requests = 0; windowStart = Date.now(); }
    if (++requests > 300) { res.writeHead(429).end(); return; }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page); return; }
    if (req.url === '/dashboard.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(await readFile(new URL('./dashboard-client.js', import.meta.url))); return; }
    const supplied = req.headers['x-dashboard-key'];
    if (typeof supplied !== 'string' || !timingSafeEqual(digest(supplied), digest(key))) { res.writeHead(401).end(); return; }
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.startsWith('/api/accounts?')) {
      const offset = new URL(req.url, 'http://localhost').searchParams.get('offset');
      if (!/^\d{1,8}$/.test(offset || '') || Number(offset) > 10000000) { res.writeHead(400).end(); return; }
      if (readingAccounts) { res.writeHead(429).end(); return; }
      readingAccounts = true;
      try {
        const response = await fetcher(new URL(`/undaunted/api/DashboardAccounts?offset=${Number(offset)}`, target), {headers: {'x-undaunted-user-api-key': key}, signal: AbortSignal.timeout(3000), redirect: 'error'});
        if (!response.ok) throw new Error('unavailable');
        const result = await response.json();
        if (!Array.isArray(result.accounts)) throw new Error('invalid');
        // Explicit projection prevents future backend fields (especially credentials) leaking.
        res.end(JSON.stringify({accounts: result.accounts.slice(0, 100).map(a => ({id: String(a.id), name: String(a.name), admin: a.admin === true,
          keyFingerprint: /^[a-f0-9]{16}$/.test(a.keyFingerprint || '') ? a.keyFingerprint : null})),
          nextOffset: Number.isSafeInteger(result.nextOffset) && result.nextOffset > Number(offset) && result.nextOffset <= 10000000 ? result.nextOffset : null}));
      } catch { res.writeHead(503).end(JSON.stringify({error: 'Account directory unavailable. Update the metagame if this route is missing.'})); }
      finally { readingAccounts = false; }
      return;
    }
    if (createInvite) {
      if (req.headers.origin !== `http://${req.headers.host}`) { res.writeHead(403).end(); return; }
      if (!serverConfig) { res.writeHead(503).end(JSON.stringify({error: 'Invite generation is not configured.'})); return; }
      if (Date.now() - inviteWindow > 60000) { inviteCount = 0; inviteWindow = Date.now(); }
      if (inviting || inviteCount >= 10) { res.writeHead(429).end(); return; }
      if (req.headers['content-type'] !== 'application/json') { res.writeHead(415).end(); return; }
      inviting = true;
      let submitted = false;
      try {
        let text = '';
        for await (const chunk of req) { text += chunk.toString('utf8'); if (Buffer.byteLength(text) > 2048) { res.writeHead(413).end(); return; } }
        let body;
        try { body = JSON.parse(text); } catch { res.writeHead(400).end(); return; }
        if (!body || !Number.isInteger(body.uses) || body.uses < 1 || body.uses > 100 || typeof body.name !== 'string' || body.name.length > 100 || /[\x00-\x1f]/.test(body.name)) { res.writeHead(400).end(); return; }
        inviteCount++;
        submitted = true;
        const response = await fetcher(new URL('/undaunted/api/CreateInvite', target), {method: 'POST', headers: {'x-undaunted-user-api-key': key, 'content-type': 'application/json'}, body: JSON.stringify({uses: body.uses, name: body.name}), signal: AbortSignal.timeout(5000), redirect: 'error'});
        if (!response.ok) { res.writeHead(response.status === 429 ? 429 : 502).end(JSON.stringify({error: 'Backend refused invite creation.'})); return; }
        const result = await response.json();
        if (!/^[A-Za-z0-9-]{4,64}$/.test(result.code || '')) throw new Error('Invalid invite response');
        const query = new URLSearchParams({v: '2', mode: 'public', host: serverConfig.PublicHost.toLowerCase(), port: String(serverConfig.Ports.gateway), fp: serverConfig.CertFingerprint.toLowerCase(), code: result.code, name: serverConfig.ServerName || 'Dauntless Revived'});
        res.end(JSON.stringify({invite: `dauntless-revived://join?${query}`, uses: body.uses}));
      } catch { if (!res.destroyed) res.writeHead(502).end(JSON.stringify({error: submitted ? 'Invite result unknown. It may have been created; do not automatically retry.' : 'Invalid invite request.'})); }
      finally { inviting = false; }
      return;
    }
    if (req.url === '/api/status') { res.end(JSON.stringify({sample, worker, fleet:fleetSummary(sample,worker,failure), error: failure, logNames: Object.keys(logs), invitesEnabled: !!serverConfig})); return; }
    if (req.url?.startsWith('/api/log?')) {
      const name = new URL(req.url, 'http://localhost').searchParams.get('name');
      if (!name || !Object.hasOwn(logs, name)) { res.writeHead(404).end(); return; }
      if (readingLog) { res.writeHead(429).end(); return; }
      readingLog = true;
      try { res.end(JSON.stringify({text: await tailLog(logs[name])})); }
      catch { res.writeHead(503).end(JSON.stringify({error: 'Log unavailable'})); }
      finally { readingLog = false; }
      return;
    }
    res.writeHead(404).end();
  });
  server.on('close', () => { clearInterval(timer); clearInterval(workerTimer); });
  server.requestTimeout = 10000;
  try { await new Promise((yes, no) => { server.once('error', no); server.listen(port, '127.0.0.1', yes); }); }
  catch (error) { clearInterval(timer); clearInterval(workerTimer); throw error; }
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const key = (await readFile(process.env.DASHBOARD_OWNER_KEY_FILE, 'utf8')).trim();
    const logs = JSON.parse(process.env.DASHBOARD_LOG_CONFIG_FILE ? await readFile(process.env.DASHBOARD_LOG_CONFIG_FILE, 'utf8') : process.env.DASHBOARD_LOG_FILES || '{}');
    if (!logs || Array.isArray(logs) || typeof logs !== 'object' || Object.values(logs).some(path => typeof path !== 'string')) throw new Error('DASHBOARD_LOG_FILES must map labels to file paths');
    const port = Number(process.env.DASHBOARD_PORT || 61110);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid dashboard port');
    const serverConfig = process.env.DASHBOARD_SERVER_CONFIG ? JSON.parse(await readFile(process.env.DASHBOARD_SERVER_CONFIG, 'utf8')) : null;
    await startDashboard({key, backend: process.env.DASHBOARD_BACKEND || 'http://127.0.0.1:61000', port, logs, serverConfig, performanceDir: process.env.DASHBOARD_PERFORMANCE_DIR || null, workerUrl: process.env.DASHBOARD_WORKER_URL || null});
    console.log(`Owner dashboard: http://127.0.0.1:${port} (use an SSH tunnel remotely)`);
  })().catch(() => { console.error('Dashboard startup failed. Check owner key file, settings and port.'); process.exitCode = 1; });
}
