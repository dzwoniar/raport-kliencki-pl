// metrics.mjs — deterministyczne KPI z zatwierdzonych wejsc do output/<client>/cycle-<period>/metrics.json.
// Uzycie: node src/metrics.mjs <katalog-wejsc>
//   katalog-wejsc zawiera: meta-current.csv, client-feedback.json, client.json

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv, rowsToRecords } from './lib/csv.js';
import { computeMetrics, toCampaign } from './lib/kpi.js';
import { META_HEADERS, checkFunnel, checkSingleAccount } from './lib/checks.js';

function fail(message) {
  console.error(`NEEDS_REVIEW: ${message}`);
  process.exitCode = 1;
  return null;
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function buildMetrics(inputDir) {
  const csvText = await readFile(path.join(inputDir, 'meta-current.csv'), 'utf8');
  const rows = parseCsv(csvText, ';');
  const records = rowsToRecords(rows, META_HEADERS);

  const accountErrors = checkSingleAccount(records);
  if (accountErrors.length > 0) {
    throw new Error(accountErrors.join(' '));
  }

  const campaigns = records.map(toCampaign);
  const feedback = await readJson(path.join(inputDir, 'client-feedback.json'));
  const client = await readJson(path.join(inputDir, 'client.json'));

  const funnelErrors = checkFunnel(feedback);
  if (funnelErrors.length > 0) {
    throw new Error(funnelErrors.join(' '));
  }

  return computeMetrics({ campaigns, feedback, client });
}

async function main() {
  const inputDir = process.argv[2];
  if (!inputDir) {
    return fail('Podaj katalog wejsc, np. `node src/metrics.mjs fixtures/klient-demo`.');
  }

  let metrics;
  try {
    metrics = await buildMetrics(inputDir);
  } catch (error) {
    return fail(error.message);
  }

  const outDir = path.join('output', metrics.client_id, `cycle-${metrics.period}`);
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'metrics.json');
  // Determinizm: brak znacznika czasu; te same wejscia => bit-identyczny plik.
  await writeFile(outPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');

  console.log(`OK: metrics.json zapisany -> ${outPath}`);
  console.log(
    `   status danych: kampania=${metrics.data_status.campaign}, ` +
      `feedback=${metrics.data_status.sales_feedback}, ` +
      `pokrycie=${metrics.data_status.coverage == null ? 'N/A' : Math.round(metrics.data_status.coverage * 100) + '%'}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('metrics.mjs')) {
  main();
}
