// Deterministyczne KPI dla Raportu Klienckiego PL.
// Zasada nadrzedna (PRD 5.10 / METR-03): dzielenie bez mianownika => null (= "N/A"),
// nigdy NaN, Infinity ani zmyslone 0%. Zaokraglenia wykonuje dopiero warstwa prezentacji.

const NBSP = / /g;

// Parsuje liczbe z CSV: akceptuje separator dziesietny ',' lub '.', usuwa spacje/NBSP jako separatory tysiecy.
export function parseNumber(raw, context = 'wartosc') {
  if (typeof raw !== 'string') {
    throw new TypeError(`${context}: oczekiwano tekstu, otrzymano ${typeof raw}.`);
  }
  const cleaned = raw.replace(NBSP, '').replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') {
    throw new Error(`${context}: pole jest puste.`);
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    throw new Error(`${context}: "${raw}" nie jest poprawna liczba.`);
  }
  return value;
}

// Dzielenie odporne na N/A: null gdy mianownik jest 0, null lub nie-liczba, albo licznik jest null.
export function safeDiv(numerator, denominator) {
  if (numerator == null || denominator == null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

// Sumuje pole liczbowe po kampaniach.
function sumBy(campaigns, key) {
  return campaigns.reduce((acc, c) => acc + c[key], 0);
}

// Zamienia rekord CSV Meta na kampanie z policzonymi metrykami platformowymi.
export function toCampaign(record) {
  const spend = parseNumber(record.spend, `Wiersz ${record.__row} (spend)`);
  const impressions = parseNumber(record.impressions, `Wiersz ${record.__row} (impressions)`);
  const clicks = parseNumber(record.clicks, `Wiersz ${record.__row} (clicks)`);
  const platform_leads = parseNumber(record.platform_leads, `Wiersz ${record.__row} (platform_leads)`);
  return {
    id_kampanii: record.id_kampanii,
    nazwa: record.nazwa,
    spend,
    impressions,
    clicks,
    platform_leads,
    cpc: safeDiv(spend, clicks),
    cpl_platform: safeDiv(spend, platform_leads),
  };
}

// Status kompletnosci feedbacku klienta. Brak != 0 (PRD DATA-04).
export function feedbackStatus(feedback) {
  if (!feedback || feedback.received == null) return 'missing';
  const coverage = safeDiv(feedback.assessed, feedback.received);
  if (coverage == null) return 'missing';
  if (coverage >= 1) return 'complete';
  return 'partial';
}

// Glowna funkcja: buduje deterministyczny obiekt metryk z zatwierdzonych wejsc.
// Celowo BEZ znacznika czasu — dwukrotne uruchomienie na tych samych wejsciach daje identyczny plik.
export function computeMetrics({ campaigns, feedback, client }) {
  const spend = sumBy(campaigns, 'spend');
  const impressions = sumBy(campaigns, 'impressions');
  const clicks = sumBy(campaigns, 'clicks');
  const platform_leads = sumBy(campaigns, 'platform_leads');

  const f = feedback ?? {};
  const received = f.received ?? null;
  const assessed = f.assessed ?? null;
  const qualified = f.qualified ?? null;
  const sold = f.sold ?? null;
  const declared_revenue = f.declared_revenue ?? null;

  const coverage = safeDiv(assessed, received);
  const salesFeedback = feedbackStatus(f);

  // Koszt leada kwalifikowanego tylko przy pelnym pokryciu (coverage == 100%); inaczej N/A (PRD 5.10).
  const cost_per_qualified = coverage === 1 ? safeDiv(spend, qualified) : null;

  const discrepancies = [];
  if (platform_leads != null && received != null && platform_leads !== received) {
    discrepancies.push({
      label: 'Leady zgloszone przez Meta vs zalogowane przez klienta',
      meta: platform_leads,
      client: received,
      diff: platform_leads - received,
    });
  }

  return {
    schema_version: '1.0',
    client_id: client.client_id,
    client_name: client.client_name,
    agency_name: client.agency_name,
    goal: client.goal,
    target: client.target,
    period: client.period,
    sales_as_of: client.sales_as_of,
    currency: client.currency,
    timezone: client.timezone,
    data_status: {
      campaign: campaigns.length > 0 ? 'complete' : 'missing',
      sales_feedback: salesFeedback,
      coverage,
    },
    platform: {
      spend,
      impressions,
      clicks,
      platform_leads,
      cpc: safeDiv(spend, clicks),
      cpl_platform: safeDiv(spend, platform_leads),
    },
    client_declared: {
      received,
      assessed,
      qualified,
      sold,
      declared_revenue,
      rejection_reasons: f.rejection_reasons ?? [],
    },
    kpi: {
      coverage,
      qualification_rate: safeDiv(qualified, assessed),
      cost_per_qualified,
      sales_conversion: safeDiv(sold, qualified),
    },
    discrepancies,
    campaigns,
    definitions: client.definitions ?? {},
  };
}
