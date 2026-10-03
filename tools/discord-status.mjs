import {readFile, writeFile, rename, appendFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function webhookUrl(value) {
  const u = new URL(value.trim());
  if (u.protocol !== 'https:' || u.hostname !== 'discord.com' || u.port || u.username || u.password || u.search || u.hash || !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u.pathname)) throw new Error('Invalid webhook configuration');
  return u.href;
}

// A deliberate allowlist: never forward backend names, addresses, players or errors.
export function payload(sample, now = Date.now()) {
  const at = Math.floor(now / 1000);
  const online = sample !== null;
  const fields = [
    {name: 'Status', value: online ? 'Online' : 'Unavailable', inline: true},
    {name: 'Players', value: online ? String(sample.players) : 'Unknown', inline: true},
    {name: 'Backend response (local)', value: online ? `${Math.round(sample.ms)} ms` : 'Unavailable', inline: true},
  ];
  if (online) {
    const seconds = Math.floor(sample.uptime);
    fields.push({name: 'Backend uptime', value: `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`});
    fields.push({name: 'Backend started', value: `<t:${at - seconds}:F> (<t:${at - seconds}:R>)`});
  }
  fields.push({name: 'Last checked', value: `<t:${at}:F> (<t:${at}:R>)`});
  return {allowed_mentions: {parse: []}, embeds: [{title: 'Dauntless server status', color: online ? 0x35bc84 : 0xe1a349, fields,
    footer: {text: 'Local backend check, not player ping. A stale timestamp means monitoring may be offline.'}}]};
}

export async function sampleBackend(backend, key, fetcher = fetch) {
  const url = new URL(backend);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) throw new Error('Backend must use loopback HTTP');
  const start = performance.now();
  try {
    const res = await fetcher(new URL('/undaunted/api/ServerStatus', url), {headers: {'x-undaunted-user-api-key': key}, signal: AbortSignal.timeout(3000), redirect: 'error'});
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
      if (!editing || [401, 403, 404].includes(res.status)) this.disabled = true;
      this.next = now + Math.min(300000, 15000 * 2 ** Math.min(++this.failures, 5));
      await res.body?.cancel();
      console.error('Discord status rejected; check webhook permissions/message existence. No response details logged.');
      return;
    }
    if (!editing) {
      const data = await res.json().catch(() => ({}));
      if (!/^\d+$/.test(data.id ?? '')) { this.disabled = true; return; }
      this.state = {id: data.id}; await this.save(this.state);
    } else { await res.body?.cancel(); }
    this.failures = 0;
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
    const sample = await sampleBackend(process.env.STATUS_BACKEND || 'http://127.0.0.1:61000', key);
    await publisher.send(payload(sample));
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
let logChain = Promise.resolve();
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Status worker stopped: check private configuration and file permissions.'); process.exitCode = 1; });
}
