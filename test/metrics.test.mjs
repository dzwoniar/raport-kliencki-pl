// Testy jednostkowe silnika metryk. Zero zaleznosci: node --test.
// Uruchom: npm test  (albo: node --test)

import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDiv, parseNumber, computeMetrics, feedbackStatus } from '../src/lib/kpi.js';
import { checkFunnel, checkSingleAccount, contactLikeColumns } from '../src/lib/checks.js';

const client = {
  client_id: 'test',
  client_name: 'Test',
  agency_name: 'A',
  goal: 'g',
  target: 't',
  period: '2026-06',
  sales_as_of: '2026-07-10',
  currency: 'PLN',
  timezone: 'Europe/Warsaw',
  definitions: {},
};

const campaigns = [
  { id_kampanii: '1', nazwa: 'K1', spend: 6000, impressions: 100000, clicks: 5000, platform_leads: 80, cpc: 1.2, cpl_platform: 75 },
];

test('safeDiv: dzielenie przez zero => null (N/A), nie NaN/Infinity', () => {
  assert.equal(safeDiv(10, 0), null);
  assert.equal(safeDiv(10, null), null);
  assert.equal(safeDiv(null, 5), null);
  assert.equal(safeDiv(9, 3), 3);
});

test('parseNumber: akceptuje przecinek i spacje jako separatory', () => {
  assert.equal(parseNumber('4200,00'), 4200);
  assert.equal(parseNumber('1 200,50'), 1200.5);
  assert.equal(parseNumber('77'), 77);
  assert.throws(() => parseNumber('abc'));
  assert.throws(() => parseNumber(''));
});

test('computeMetrics: KPI licza sie poprawnie przy pelnym pokryciu', () => {
  const feedback = { received: 80, assessed: 80, qualified: 40, sold: 8, declared_revenue: 50000, rejection_reasons: [] };
  const m = computeMetrics({ campaigns, feedback, client });
  assert.equal(m.platform.spend, 6000);
  assert.equal(m.kpi.coverage, 1);
  assert.equal(m.kpi.qualification_rate, 0.5);
  assert.equal(m.kpi.cost_per_qualified, 150); // 6000/40, coverage 100%
  assert.equal(m.kpi.sales_conversion, 0.2); // 8/40
  assert.equal(m.data_status.sales_feedback, 'complete');
});

test('computeMetrics: pokrycie <100% => koszt leada kwalifikowanego = N/A', () => {
  const feedback = { received: 80, assessed: 50, qualified: 20, sold: 4, declared_revenue: 30000, rejection_reasons: [] };
  const m = computeMetrics({ campaigns, feedback, client });
  assert.equal(m.kpi.cost_per_qualified, null); // coverage 50% -> N/A
  assert.equal(m.data_status.sales_feedback, 'partial');
});

test('computeMetrics: brak feedbacku => downstream N/A, status missing', () => {
  const feedback = { received: null, assessed: null, qualified: null, sold: null, declared_revenue: null, rejection_reasons: [] };
  const m = computeMetrics({ campaigns, feedback, client });
  assert.equal(m.kpi.coverage, null);
  assert.equal(m.kpi.qualification_rate, null);
  assert.equal(m.kpi.sales_conversion, null);
  assert.equal(m.data_status.sales_feedback, 'missing');
});

test('computeMetrics: przychod NIE jest nazywany ROAS (brak takiego pola)', () => {
  const feedback = { received: 80, assessed: 80, qualified: 40, sold: 8, declared_revenue: 50000, rejection_reasons: [] };
  const m = computeMetrics({ campaigns, feedback, client });
  const json = JSON.stringify(m).toLowerCase();
  assert.ok(!json.includes('roas'));
  assert.equal(m.client_declared.declared_revenue, 50000);
});

test('computeMetrics: rozbieznosc Meta vs klient jest zachowana, nie nadpisana', () => {
  const feedback = { received: 70, assessed: 70, qualified: 30, sold: 5, declared_revenue: 40000, rejection_reasons: [] };
  const m = computeMetrics({ campaigns, feedback, client }); // platform_leads = 80
  assert.equal(m.discrepancies.length, 1);
  assert.deepEqual(m.discrepancies[0], {
    label: 'Leady zgloszone przez Meta vs zalogowane przez klienta',
    meta: 80,
    client: 70,
    diff: 10,
  });
});

test('checkFunnel: wymusza sold <= qualified <= assessed <= received', () => {
  assert.equal(checkFunnel({ received: 80, assessed: 80, qualified: 40, sold: 8 }).length, 0);
  assert.ok(checkFunnel({ received: 80, assessed: 80, qualified: 40, sold: 50 }).length > 0); // sold > qualified
  assert.ok(checkFunnel({ received: 30, assessed: 80, qualified: 40, sold: 8 }).length > 0); // assessed > received
});

test('checkFunnel: przychod przy sold=0 wymaga korekty', () => {
  assert.ok(checkFunnel({ received: 80, assessed: 80, qualified: 40, sold: 0, declared_revenue: 10000 }).length > 0);
});

test('checkFunnel: null (nie wiem) nie jest traktowane jak 0', () => {
  // received=80, assessed=null (nie wiem), qualified=10 -> brak bledu (nie porownujemy z null)
  assert.equal(checkFunnel({ received: 80, assessed: null, qualified: 10, sold: 2 }).length, 0);
});

test('checkSingleAccount: wykrywa mieszane konta/okresy', () => {
  const recs = [
    { id_konta: 'a', okres: '2026-06', waluta: 'PLN', timezone: 'Europe/Warsaw' },
    { id_konta: 'b', okres: '2026-06', waluta: 'PLN', timezone: 'Europe/Warsaw' },
  ];
  assert.ok(checkSingleAccount(recs).length > 0);
});

test('contactLikeColumns: wykrywa kolumny wygladajace na PII leada', () => {
  assert.deepEqual(contactLikeColumns(['spend', 'email', 'telefon', 'clicks']), ['email', 'telefon']);
  assert.deepEqual(contactLikeColumns(['spend', 'clicks']), []);
});

test('feedbackStatus: kompletne / czesciowe / brak', () => {
  assert.equal(feedbackStatus({ received: 80, assessed: 80 }), 'complete');
  assert.equal(feedbackStatus({ received: 80, assessed: 40 }), 'partial');
  assert.equal(feedbackStatus({ received: null }), 'missing');
});
