// app.js - cienki glue web-toola. Reuse silnika (src/lib/*) 1:1 w przegladarce.
// Zasada: po zaladowaniu strony compute jest CZYSTY (zero sieci). Jedyny element
// sieciowy w flow uzytkownika to mailto w CTA. Zero AI, zero wysylki danych klienta.
//
// Rdzen buildMemo() lustruje pipeline z src/validate.mjs + src/metrics.mjs:
//   parseCsv -> (PII check) -> rowsToRecords -> checkSingleAccount -> toCampaign
//   -> checkFunnel -> computeMetrics -> renderReportHtml
// dzieki czemu odmowy sa identyczne jak w CLI (-pii => 2 bledy, -lejek => 1, demo => 0).

import { parseCsv, rowsToRecords } from '../src/lib/csv.js';
import { toCampaign, computeMetrics } from '../src/lib/kpi.js';
import {
  META_HEADERS,
  checkFunnel,
  checkSingleAccount,
  contactLikeColumns,
} from '../src/lib/checks.js';
import { renderReportHtml } from '../src/lib/reportHtml.js';

// Stopka-wzrostu darmowej wersji (mechanika freemium). White-label usuwa ten badge.
const TOOL_BADGE = 'Wygenerowano darmowym narzedziem Raport Kliencki - Jakub Dzwoniarski';

// TODO Kuba: docelowy adres B2B (np. kontakt@twojadomena.pl). Domyslnie znany adres.
const CONTACT_EMAIL = 'j.dzwoniarski5@gmail.com';

const FIXTURES = {
  'klient-demo': { label: 'Poprawny komplet - agencja + feedback klienta' },
  'klient-demo-pii': { label: 'Plik z danymi osobowymi leada -> narzedzie ODMAWIA' },
  'klient-demo-lejek': { label: 'Niemozliwy lejek (sprzedaz > kwalifikowane) -> ODMAWIA' },
};

const state = { csvText: null, csvName: null, cssText: null };
const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

// --- boot: prefetch CSS + 3 fixtures (raz, przy ladowaniu strony) ---
async function boot() {
  try {
    state.cssText = await (await fetch('../templates/report.css')).text();
    for (const name of Object.keys(FIXTURES)) {
      const [csv, client, feedback] = await Promise.all([
        fetch(`../fixtures/${name}/meta-current.csv`).then((r) => r.text()),
        fetch(`../fixtures/${name}/client.json`).then((r) => r.json()),
        fetch(`../fixtures/${name}/client-feedback.json`).then((r) => r.json()),
      ]);
      FIXTURES[name].csv = csv;
      FIXTURES[name].client = client;
      FIXTURES[name].feedback = feedback;
    }
  } catch {
    showFatal(
      'Nie udalo sie wczytac zasobow. Uruchom narzedzie przez serwer: `node web/serve.mjs`, ' +
        'a potem otworz http://localhost:8770/web/ (otwarcie pliku bezposrednio z dysku nie zadziala).',
    );
    return;
  }
  wireUi();
}

function showFatal(msg) {
  $('result').innerHTML = `<div class="refuse"><p>${escapeHtml(msg)}</p></div>`;
}

// --- rdzen: mirror validate.mjs + metrics.mjs (te same komunikaty, ta sama logika) ---
function buildMemo({ csvText, feedback, client, cssText }) {
  const errors = [];
  let campaigns = null;
  try {
    const rows = parseCsv(csvText, ';');
    if (rows.length > 0) {
      const pii = contactLikeColumns(rows[0].map((h) => h.trim()));
      if (pii.length > 0) {
        errors.push(
          `Plik Meta zawiera kolumny wygladajace na dane osobowe leada: ${pii.join(', ')}. ` +
            'Produkt przyjmuje WYLACZNIE agregaty na poziomie kampanii - usun kolumny lead-level i wyeksportuj ponownie.',
        );
      }
    }
    const records = rowsToRecords(rows, META_HEADERS);
    checkSingleAccount(records).forEach((e) => errors.push(e));
    campaigns = records.map(toCampaign);
  } catch (e) {
    errors.push(`meta-current.csv: ${e.message}`);
  }
  checkFunnel(feedback).forEach((e) => errors.push(e));
  if (errors.length > 0) return { ok: false, errors };
  const metrics = computeMetrics({ campaigns, feedback, client });
  const html = renderReportHtml(metrics, cssText, { toolBadge: TOOL_BADGE });
  return { ok: true, metrics, html };
}

// --- odczyt/zapis formularza ---
function readForm() {
  const num = (id) => {
    const v = $(id).value.trim();
    return v === '' ? null : Number(v);
  };
  const txt = (id) => $(id).value.trim();
  const defs = {};
  for (const k of ['received', 'assessed', 'qualified', 'sold']) {
    const v = $(`def_${k}`).value.trim();
    if (v) defs[k] = v;
  }
  const reasons = txt('f_reasons')
    ? txt('f_reasons').split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const client = {
    client_id:
      (txt('c_name') || 'klient').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
      'klient',
    client_name: txt('c_name') || 'Klient',
    agency_name: txt('c_agency') || 'Twoja Agencja',
    goal: txt('c_goal') || '',
    target: txt('c_target') || '',
    period: txt('c_period') || '',
    sales_as_of: txt('c_sales_as_of') || '',
    currency: txt('c_currency') || 'PLN',
    timezone: 'Europe/Warsaw',
    definitions: defs,
  };
  const feedback = {
    received: num('f_received'),
    assessed: num('f_assessed'),
    qualified: num('f_qualified'),
    sold: num('f_sold'),
    declared_revenue: num('f_revenue'),
    rejection_reasons: reasons,
  };
  return { client, feedback };
}

function fillForm(client, feedback) {
  $('c_name').value = client.client_name ?? '';
  $('c_agency').value = client.agency_name ?? '';
  $('c_goal').value = client.goal ?? '';
  $('c_target').value = client.target ?? '';
  $('c_period').value = client.period ?? '';
  $('c_sales_as_of').value = client.sales_as_of ?? '';
  $('c_currency').value = client.currency ?? 'PLN';
  const d = client.definitions ?? {};
  for (const k of ['received', 'assessed', 'qualified', 'sold']) $(`def_${k}`).value = d[k] ?? '';
  $('f_received').value = feedback.received ?? '';
  $('f_assessed').value = feedback.assessed ?? '';
  $('f_qualified').value = feedback.qualified ?? '';
  $('f_sold').value = feedback.sold ?? '';
  $('f_revenue').value = feedback.declared_revenue ?? '';
  $('f_reasons').value = (feedback.rejection_reasons ?? []).join(', ');
}

function setCsv(text, name) {
  state.csvText = text;
  state.csvName = name;
  $('csv-status').textContent = `Wczytano: ${name}`;
}

// --- akcje ---
function loadFixture(name) {
  const fx = FIXTURES[name];
  if (!fx || !fx.csv) return;
  setCsv(fx.csv, `${name}/meta-current.csv (przyklad)`);
  fillForm(fx.client, fx.feedback);
  generate(); // jeden klik na kamerze -> memo albo odmowa
}

function generate() {
  if (!state.csvText) {
    showRefuse(['Najpierw wczytaj plik CSV z Meta Ads albo wybierz przyklad.']);
    return;
  }
  const { client, feedback } = readForm();
  const res = buildMemo({ csvText: state.csvText, feedback, client, cssText: state.cssText });
  if (!res.ok) {
    showRefuse(res.errors);
    return;
  }
  showMemo(res.html);
}

function showRefuse(errors) {
  const items = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('');
  $('result').innerHTML = `
    <div class="refuse">
      <div class="refuse-head">Narzedzie odmawia wygenerowania raportu</div>
      <ul>${items}</ul>
      <p class="refuse-why">To celowe. Raport nie powstaje, gdy dane sa niespojne albo zawieraja dane osobowe - zamiast policzyc liczbe, ktora wprowadzilaby klienta w blad.</p>
    </div>`;
}

function showMemo(html) {
  $('result').innerHTML = `
    <div class="memo-actions">
      <button id="print-btn" class="btn primary">Drukuj / Zapisz PDF (A4)</button>
      <span class="memo-note">Podglad ponizej. Dane nie opuscily Twojej przegladarki.</span>
    </div>
    <iframe id="memo-frame" title="Podglad memo"></iframe>`;
  const frame = $('memo-frame');
  frame.srcdoc = html;
  $('print-btn').addEventListener('click', () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  });
}

function readCsvFile(file) {
  if (!/\.csv$/i.test(file.name)) {
    showRefuse(['Wybierz plik .csv (eksport z Menedzera reklam Meta).']);
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showRefuse(['Plik przekracza 5 MB.']);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => setCsv(String(reader.result), file.name);
  reader.onerror = () => showRefuse(['Nie udalo sie odczytac pliku.']);
  reader.readAsText(file, 'utf-8');
}

function wireUi() {
  // dropdown przykladow
  const sel = $('fixture-select');
  for (const [name, fx] of Object.entries(FIXTURES)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = fx.label;
    sel.appendChild(opt);
  }
  $('fixture-btn').addEventListener('click', () => {
    if (sel.value) loadFixture(sel.value);
  });

  // upload / drag-drop CSV
  const fileInput = $('csv-input');
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) readCsvFile(fileInput.files[0]);
  });
  const drop = $('drop-zone');
  ['dragover', 'dragenter'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('over');
    }),
  );
  drop.addEventListener('drop', (e) => {
    if (e.dataTransfer.files[0]) readCsvFile(e.dataTransfer.files[0]);
  });

  $('generate-btn').addEventListener('click', generate);

  // CTA inbound (bez DM, bez listy mailowej - profesjonalny kontakt tekstowy)
  $('cta-mail').href =
    `mailto:${CONTACT_EMAIL}` +
    `?subject=${encodeURIComponent('Raport Kliencki - automatyzacja pod moja marke')}` +
    `&body=${encodeURIComponent('Czesc Kuba,\n\nprowadze agencje i chcialbym wersje automatyczna raportu pod moja marke.\nMoja agencja: \nLiczba klientow: \n\nPozdrawiam,')}`;
}

boot();
