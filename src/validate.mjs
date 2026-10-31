// validate.mjs — sprawdza wejscia ZANIM policzymy KPI i daje czytelne komunikaty.
// Uzycie: node src/validate.mjs <katalog-wejsc>

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv, rowsToRecords } from './lib/csv.js';
import { toCampaign } from './lib/kpi.js';
import { META_HEADERS, checkFunnel, checkSingleAccount, contactLikeColumns } from './lib/checks.js';

const errors = [];
const warnings = [];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function run(inputDir) {
  // 1. CSV Meta
  let records = [];
  try {
    const csvText = await readFile(path.join(inputDir, 'meta-current.csv'), 'utf8');
    const rows = parseCsv(csvText, ';');
    if (rows.length > 0) {
      const pii = contactLikeColumns(rows[0].map((h) => h.trim()));
      if (pii.length > 0) {
        errors.push(
          `Plik Meta zawiera kolumny wygladajace na dane osobowe leada: ${pii.join(', ')}. ` +
            'Produkt przyjmuje WYLACZNIE agregaty na poziomie kampanii — usun kolumny lead-level i wyeksportuj ponownie.',
        );
      }
    }
    records = rowsToRecords(rows, META_HEADERS);
    checkSingleAccount(records).forEach((e) => errors.push(e));
    // Kontrola typow liczbowych (toCampaign rzuca przy zlej liczbie).
    records.forEach((r) => toCampaign(r));
  } catch (error) {
    errors.push(`meta-current.csv: ${error.message}`);
  }

  // 2. Feedback klienta
  try {
    const feedback = await readJson(path.join(inputDir, 'client-feedback.json'));
    checkFunnel(feedback).forEach((e) => errors.push(e));
    const nulls = ['received', 'assessed', 'qualified', 'sold', 'declared_revenue'].filter(
      (k) => feedback[k] == null,
    );
    if (nulls.length > 0) {
      warnings.push(`Feedback: pola "nie wiem" (null): ${nulls.join(', ')} — zostana pokazane jako brak, nie 0.`);
    }
  } catch (error) {
    errors.push(`client-feedback.json: ${error.message}`);
  }

  // 3. Konfiguracja klienta
  try {
    const c = await readJson(path.join(inputDir, 'client.json'));
    for (const req of ['client_id', 'client_name', 'period', 'goal', 'definitions']) {
      if (c[req] == null) errors.push(`client.json: brak wymaganego pola "${req}".`);
    }
  } catch (error) {
    errors.push(`client.json: ${error.message}`);
  }

  return records.length;
}

async function main() {
  const inputDir = process.argv[2];
  if (!inputDir) {
    console.error('Podaj katalog wejsc, np. `node src/validate.mjs fixtures/klient-demo`.');
    process.exitCode = 1;
    return;
  }

  const campaignCount = await run(inputDir);

  if (warnings.length > 0) {
    console.log('OSTRZEZENIA:');
    warnings.forEach((w) => console.log(`  ! ${w}`));
  }

  if (errors.length > 0) {
    console.error(`\nNEEDS_REVIEW — ${errors.length} blad(ow), generowanie zablokowane:`);
    errors.forEach((e) => console.error(`  x ${e}`));
    process.exitCode = 1;
    return;
  }

  console.log(`\nOK — wejscia poprawne. Kampanii: ${campaignCount}. Mozna liczyc KPI (node src/metrics.mjs ${inputDir}).`);
}

main();
