// Deterministyczny generator HTML raportu z metrics.json. Bez AI, bez zadan sieciowych.
// Zaokraglenia TYLKO tutaj (warstwa prezentacji); metrics.json trzyma surowe wartosci.

const MONTHS_PL = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];

const money2 = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
const int0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('pl-PL', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// null => "N/A" (nie zmyslamy liczby). W tabeli dodaje klase .na.
function na(value, formatter, { cell = false } = {}) {
  if (value == null) return cell ? '<span class="na">N/A</span>' : '<span class="na">N/A</span>';
  return esc(formatter.format(value));
}

function fmtDate(iso) {
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return esc(iso);
  return `${d}.${m}.${y}`;
}

function fmtPeriod(period) {
  const [y, m] = String(period).split('-');
  const name = MONTHS_PL[Number(m) - 1];
  return name ? `${name} ${y}` : esc(period);
}

function statusBanner(m) {
  const s = m.data_status.sales_feedback;
  if (s === 'complete') {
    return { mark: '●', label: 'Dane kompletne', detail: 'Dane kampanii i feedback klienta kompletne. Wszystkie KPI policzone.' };
  }
  if (s === 'partial') {
    const cov = m.data_status.coverage == null ? '' : ` (pokrycie ${pct1.format(m.data_status.coverage)})`;
    return { mark: '◐', label: 'Dane częściowe', detail: `Feedback klienta częściowy${cov}. Wyniki jakości i sprzedaży tylko wśród ocenionych leadów; koszt leada kwalifikowanego = N/A.` };
  }
  return { mark: '○', label: 'Brak feedbacku klienta', detail: 'Raport pokazuje wyłącznie dane platformowe. Brak wniosków o jakości i sprzedaży — nie estymujemy lejka.' };
}

function figures(m) {
  const hasFeedback = m.data_status.sales_feedback !== 'missing';
  const k = m.kpi;
  const c = m.client_declared;
  if (!hasFeedback) {
    return [
      { num: money0.format(m.platform.spend), cap: 'Wydatek Meta', note: 'dane platformowe' },
      { num: na(m.platform.cpl_platform, money2), cap: 'CPL platformowy', note: 'spend / leady Meta' },
      { num: na(m.platform.platform_leads, int0), cap: 'Leady (Meta)', note: 'wg raportu Meta' },
      { num: na(m.platform.cpc, money2), cap: 'CPC', note: 'spend / kliknięcia' },
    ];
  }
  return [
    { num: na(c.sold, int0), cap: `Sprzedaż (kohorta ${MONTHS_PL[Number(m.period.split('-')[1]) - 1] ?? ''})`, note: k.sales_conversion == null ? 'konwersja: N/A' : `konwersja z kwalifik.: ${pct1.format(k.sales_conversion)}` },
    { num: na(c.declared_revenue, money0), cap: 'Deklarowany przychód', note: 'deklaracja klienta — nie ROAS' },
    { num: na(k.cost_per_qualified, money0), cap: 'Koszt leada kwalifik.', note: k.cost_per_qualified == null ? 'pokrycie < 100% → N/A' : 'spend / kwalifikowane (pokrycie 100%)' },
    { num: na(c.qualified, int0), cap: 'Leady kwalifikowane', note: k.qualification_rate == null ? '' : `${pct1.format(k.qualification_rate)} z ocenionych` },
  ];
}

function funnelRows(m) {
  const c = m.client_declared;
  if (c.received == null) return '';
  const base = c.received || 0;
  const rows = [
    ['Otrzymane', c.received],
    ['Ocenione', c.assessed],
    ['Kwalifikowane', c.qualified],
    ['Sprzedane', c.sold],
  ];
  const html = rows
    .map(([label, v]) => {
      const width = v != null && base > 0 ? Math.round((v / base) * 100) : 0;
      const val = v == null ? '<span class="na">N/A</span>' : int0.format(v);
      return `<div class="funnel-row"><span class="flabel">${label}</span><span class="funnel-bar"><span class="funnel-fill" style="width:${width}%"></span></span><span class="fval">${val}</span></div>`;
    })
    .join('');
  return `<div class="funnel">${html}</div>`;
}

function claims(m) {
  const out = [];
  const p = m.platform;
  out.push({
    tag: 'fakt',
    body: `Wydatek ${esc(money0.format(p.spend))}, ${esc(int0.format(p.platform_leads))} leadów zgłoszonych przez Meta (CPL platformowy ${na(p.cpl_platform, money2)}). ${esc(int0.format(p.clicks))} kliknięć, CPC ${na(p.cpc, money2)}.`,
  });

  const c = m.client_declared;
  if (m.data_status.sales_feedback !== 'missing' && c.received != null) {
    out.push({
      tag: 'fakt',
      body: `Klient zalogował ${esc(int0.format(c.received))} leadów; ${na(c.qualified, int0)} kwalifikowanych${m.kpi.qualification_rate == null ? '' : ` (${esc(pct1.format(m.kpi.qualification_rate))} z ocenionych)`}, ${na(c.sold, int0)} zakończonych sprzedażą.`,
    });
  }

  if (m.discrepancies.length > 0) {
    const d = m.discrepancies[0];
    out.push({
      tag: 'obserwacja',
      body: `Meta raportuje ${esc(int0.format(d.meta))} leadów, klient zalogował ${esc(int0.format(d.client))} — różnica ${esc(int0.format(d.diff))}. Nie rozstrzygamy, która liczba jest właściwa (patrz aneks).`,
    });
  }

  const ranked = [...m.campaigns].filter((x) => x.cpl_platform != null).sort((a, b) => b.cpl_platform - a.cpl_platform);
  if (ranked.length >= 2) {
    const hi = ranked[0];
    const lo = ranked[ranked.length - 1];
    out.push({
      tag: 'hipoteza',
      body: `Kampania „${esc(hi.nazwa)}" ma najwyższy CPL platformowy (${esc(money2.format(hi.cpl_platform))}) wobec „${esc(lo.nazwa)}" (${esc(money2.format(lo.cpl_platform))}). Możliwa przyczyna: szersza lub słabiej dopasowana grupa odbiorców. Wymaga testu — nie jest to potwierdzone.`,
    });
  }
  return out;
}

function actions(m) {
  const out = [];
  const ranked = [...m.campaigns].filter((x) => x.cpl_platform != null).sort((a, b) => b.cpl_platform - a.cpl_platform);
  if (ranked.length >= 2) {
    const hi = ranked[0];
    const lo = ranked[ranked.length - 1];
    out.push({
      owner: 'Do decyzji z klientem',
      body: `Przenieść część budżetu z „${esc(hi.nazwa)}" (CPL ${esc(money2.format(hi.cpl_platform))}) do „${esc(lo.nazwa)}" (CPL ${esc(money2.format(lo.cpl_platform))}) i zmierzyć jakość leadów w kolejnym cyklu.`,
    });
  }
  if (m.discrepancies.length > 0) {
    const d = m.discrepancies[0];
    out.push({
      owner: 'Do wyjaśnienia (klient)',
      body: `Ustalić, dlaczego ${esc(int0.format(d.diff))} leadów z Meta nie trafiło do oceny klienta — utrata w przekazaniu, duplikaty czy inne źródło.`,
    });
  }
  if (ranked.length >= 1) {
    out.push({
      owner: 'Test agencji',
      body: `Przetestować nową kreację dla „${esc(ranked[0].nazwa)}" z węższym targetowaniem i dowodem społecznym; ocenić po 2 tygodniach.`,
    });
  }
  return out.slice(0, 3);
}

function campaignTable(m) {
  const rows = m.campaigns
    .map(
      (c) => `<tr>
        <td>${esc(c.nazwa)}</td>
        <td>${esc(money2.format(c.spend))}</td>
        <td>${esc(int0.format(c.clicks))}</td>
        <td>${na(c.cpc, money2, { cell: true })}</td>
        <td>${esc(int0.format(c.platform_leads))}</td>
        <td>${na(c.cpl_platform, money2, { cell: true })}</td>
      </tr>`,
    )
    .join('');
  const p = m.platform;
  return `<table>
    <thead><tr><th>Kampania</th><th>Wydatek</th><th>Kliknięcia</th><th>CPC</th><th>Leady (Meta)</th><th>CPL platf.</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td>Razem konto</td>
      <td>${esc(money2.format(p.spend))}</td>
      <td>${esc(int0.format(p.clicks))}</td>
      <td>${na(p.cpc, money2, { cell: true })}</td>
      <td>${esc(int0.format(p.platform_leads))}</td>
      <td>${na(p.cpl_platform, money2, { cell: true })}</td>
    </tr></tfoot>
  </table>`;
}

function definitionsBlock(m) {
  const d = m.definitions ?? {};
  const stageDefs = [
    ['Lead otrzymany', d.received],
    ['Lead oceniony', d.assessed],
    ['Lead kwalifikowany', d.qualified],
    ['Sprzedaż', d.sold],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join('');

  const formulas = [
    ['CPC', 'wydatek / kliknięcia'],
    ['CPL platformowy', 'wydatek / leady zgłoszone przez Meta'],
    ['Pokrycie feedbackiem', 'ocenione / otrzymane'],
    ['Koszt leada kwalifikowanego', 'wydatek / kwalifikowane — tylko przy pokryciu 100%'],
    ['Konwersja kwalifikowany → sprzedaż', 'sprzedane / kwalifikowane'],
  ]
    .map(([k, v]) => `<dt>${esc(k)} <span class="formula">= ${esc(v)}</span></dt>`)
    .join('');

  return `<dl class="defs">${stageDefs}${formulas}</dl>`;
}

function discrepancyBlock(m) {
  if (m.discrepancies.length === 0) return '<p class="disclaimer">Brak istotnych rozbieżności między danymi Meta a deklaracją klienta.</p>';
  const rows = m.discrepancies
    .map(
      (d) => `<tr><td>${esc(d.label)}</td><td>${esc(int0.format(d.meta))}</td><td>${esc(int0.format(d.client))}</td><td>${esc(int0.format(d.diff))}</td></tr>`,
    )
    .join('');
  return `<table>
    <thead><tr><th>Pozycja</th><th>Meta</th><th>Klient</th><th>Różnica</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function renderReportHtml(m, css, opts = {}) {
  const banner = statusBanner(m);
  const figHtml = figures(m)
    .map(
      (f) => `<div class="figure"><div class="num ${String(f.num).includes('N/A') ? 'na' : ''}">${f.num}</div><div class="cap">${esc(f.cap)}</div><div class="note">${esc(f.note)}</div></div>`,
    )
    .join('');
  const claimsHtml = claims(m)
    .map((c) => `<div class="claim"><span class="tag ${c.tag}">${c.tag}</span><span class="body">${c.body}</span></div>`)
    .join('');
  const actionsHtml = actions(m)
    .map((a) => `<li><span class="owner">${esc(a.owner)}</span><br>${a.body}</li>`)
    .join('');

  const footerLeft = `Raport Kliencki PL · ${esc(m.agency_name ?? '')}`;
  const footerMid = `${esc(m.client_name)} · ${fmtPeriod(m.period)}`;
  // Stopka-wzrostu darmowej wersji (freemium). Pusta przy 2-argumentowym wywolaniu (CLI) => output bez zmian.
  // White-label (platny backend) NIE przekazuje toolBadge => stopka znika, zostaje marka agencji.
  const toolBadge = opts.toolBadge
    ? `<br><span class="tool-badge">${esc(opts.toolBadge)}</span>`
    : '';

  const page1 = `<section class="sheet">
    <div class="eyebrow">${esc(m.agency_name ?? 'Raport miesięczny')} · raport miesięczny</div>
    <h1>${esc(m.client_name)}</h1>
    <div class="meta-line">Okres: ${fmtPeriod(m.period)} · Stan sprzedaży na ${fmtDate(m.sales_as_of)} · ${esc(m.currency)}</div>
    <div class="rule"></div>

    <div class="status">
      <span class="mark">${banner.mark}</span>
      <span class="label">${esc(banner.label)}</span>
      <span class="detail">${esc(banner.detail)}</span>
    </div>

    <h2>Cel</h2>
    <p class="goal">${esc(m.goal)}<span class="target">Cel okresu: ${esc(m.target)}</span></p>

    <h2>Wynik biznesowy</h2>
    <div class="figures">${figHtml}</div>
    ${funnelRows(m)}

    <h2>Co wiemy</h2>
    ${claimsHtml}

    <h2>Proponowane działania</h2>
    <ol class="actions">${actionsHtml}</ol>
    <p class="disclaimer">To są propozycje do rozmowy, nie uzgodnione decyzje. Decyzje z właścicielem i terminem zapisujemy osobno po spotkaniu.</p>

    <div class="footer"><span>${footerLeft}${toolBadge}</span><span>${footerMid} · str. 1/2</span></div>
  </section>`;

  const page2 = `<section class="sheet">
    <div class="eyebrow">Aneks</div>
    <h1 style="font-size:15pt">Dane źródłowe i definicje</h1>
    <hr class="rule-thin">

    <h2>Kampanie (dane platformowe Meta)</h2>
    ${campaignTable(m)}

    <h2>Definicje etapów i wzory KPI</h2>
    ${definitionsBlock(m)}

    <h2>Rozbieżności danych</h2>
    ${discrepancyBlock(m)}

    <h2>Ograniczenia i atrybucja</h2>
    <ul class="limits">
      <li>Deklarowany przychód to deklaracja klienta na dzień ${fmtDate(m.sales_as_of)} — nie jest przychodem przypisanym do kampanii ani wskaźnikiem ROAS.</li>
      <li>Kohorta = leady utworzone w okresie ${fmtPeriod(m.period)}; sprzedaż i przychód liczone na jeden stan (${fmtDate(m.sales_as_of)}). Późniejsze zmiany nie modyfikują tego raportu.</li>
      <li>Jakość i sprzedaż to agregat klient–okres dla źródła Meta Ads; nie przypisujemy ich do pojedynczej kampanii.</li>
      <li>Raport nie zawiera danych osobowych pojedynczych leadów.</li>
    </ul>

    <div class="footer"><span>${footerLeft}${toolBadge}</span><span>${footerMid} · str. 2/2</span></div>
  </section>`;

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Raport ${esc(m.client_name)} — ${fmtPeriod(m.period)}</title>
<style>${css}</style>
</head>
<body>
${page1}
${page2}
</body>
</html>
`;
}
