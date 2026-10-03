import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const metrics = ['cpu_core_percent', 'working_set_mb', 'players', 'host_cpu_percent', 'ram_free_mb', 'players_online'];
const roles = new Set(['host', 'metagame', 'content', 'gateway', 'deploy', 'allowlist', 'ramsgate', 'dojo', 'hunt', 'tutorial', 'unknown']);

// The kit writes unquoted, comma-separated numeric fields with a fixed header.
export function parseSamples(csv) {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) throw new Error('Empty performance CSV');
  const header = lines.shift().split(',');
  for (const name of ['timestamp_utc', 'role', ...metrics]) {
    if (!header.includes(name)) throw new Error(`Missing column: ${name}`);
  }
  if (new Set(header).size !== header.length) throw new Error('Duplicate CSV column');
  return lines.map((line, index) => {
    const fields = line.split(',');
    if (fields.length !== header.length) throw new Error(`Invalid CSV row ${index + 2}`);
    const row = Object.fromEntries(header.map((name, i) => [name, fields[i]]));
    if (!Number.isFinite(Date.parse(row.timestamp_utc)) || !roles.has(row.role)) {
      throw new Error(`Invalid timestamp or role at row ${index + 2}`);
    }
    for (const name of metrics) {
      const value = row[name].trim();
      row[name] = value === '' ? null : Number(value);
      if (value !== '' && (!Number.isFinite(row[name]) || row[name] < 0)) {
        throw new Error(`Invalid ${name} at row ${index + 2}`);
      }
    }
    return row;
  });
}

export function statistics(values) {
  const sorted = values.filter(value => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return { samples: 0, median: null, p95: null, max: null };
  const quantile = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return { samples: sorted.length, median: quantile(0.5), p95: quantile(0.95), max: sorted.at(-1) };
}

export function summarize(rows) {
  if (!rows.length) throw new Error('No performance samples');
  let first = Infinity;
  let last = -Infinity;
  for (const row of rows) {
    const time = Date.parse(row.timestamp_utc);
    first = Math.min(first, time);
    last = Math.max(last, time);
  }
  const groups = {};
  for (const role of roles) {
    const selected = rows.filter(row => row.role === role);
    if (!selected.length) continue;
    groups[role] = Object.fromEntries(metrics.map(name => [name, statistics(selected.map(row => row[name]))]));
  }
  return {
    from: new Date(first).toISOString(),
    to: new Date(last).toISOString(),
    rows: rows.length,
    groups,
    notes: [
      'Percentiles use nearest rank and weight each process sample equally; missing readings are excluded.',
      'Process CPU is percent of one core; host CPU is percent of the whole machine.',
      'Hunt memory and CPU describe one sampled hunt process, not the sum of simultaneous hunts.',
      'Ramsgate includes fixed world overhead: dividing by players does not measure the cost of an additional player.',
      'These observations do not establish a safe player capacity. Compare sessions at different player counts first.'
    ]
  };
}

async function main(paths) {
  if (!paths.length) throw new Error('Usage: node tools/summarize-performance.mjs <performance.csv> [more.csv ...]');
  const rows = [];
  const seen = new Set();
  for (const path of paths) {
    const absolute = resolve(path);
    if (seen.has(absolute)) throw new Error('The same input file was supplied twice');
    seen.add(absolute);
    for (const row of parseSamples(await readFile(absolute, 'utf8'))) rows.push(row);
  }
  process.stdout.write(JSON.stringify(summarize(rows), null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  });
}
