# Raport Kliencki PL

Deterministyczny miesięczny raport dla agencji performance. Łączy wydatek **Meta Ads** z **jakością i sprzedażą leadów** zgłoszoną przez klienta i zamienia to w **1-stronicowe memo decyzyjne** — nie kolejny dashboard.

> **Status:** build pod demo YouTube (walidacja popytu), nie gotowy produkt. Świadomie okrojony do widocznego kręgosłupa happy-path. Pełny zakres (bezpieczeństwo, multi-tenant, magic-link, retencja, AI) opisuje wewnętrzny plan rozwoju (nie jest częścią tej wersji portfolio) — **nie budujemy go, dopóki film nie potwierdzi popytu.**

**[Otwórz przykładowy raport](https://dzwoniar.github.io/raport-kliencki-pl/)**. Sprawdź, jak wydatki i dane od klienta przekładają się na wnioski i proponowane działania. Dane syntetyczne.

Wedge: agencje co miesiąc pokazują kliki i koszt, ale nie odpowiadają, ile leadów było wartościowych, ile weszło w sprzedaż i co z tego wynika. Ten pipeline domyka ostatni odcinek lejka → decyzje.

---

## Jak to działa (3 skrypty, zero zależności)

```
Meta Ads CSV  +  client-feedback.json            (wejścia, agregaty)
        │
   node src/validate.mjs   → sprawdza schemat, logikę lejka, odrzuca PII
        │
   node src/metrics.mjs     → deterministyczne KPI  →  metrics.json
        │
   node src/render.mjs      → memo A4              →  report.html (+ report.pdf)
```

Node ≥ 22. Bez `npm install` — wszystko na standardowej bibliotece Node.

## Szybki start (demo)

```bash
node src/validate.mjs fixtures/klient-demo     # 1. walidacja wejść
node src/metrics.mjs  fixtures/klient-demo     # 2. KPI  -> output/klient-demo/cycle-2026-06/metrics.json
node src/render.mjs   output/klient-demo/cycle-2026-06   # 3. raport -> report.html
node --test                                    # testy silnika (13)
```

Otwórz `output/klient-demo/cycle-2026-06/report.html` w przeglądarce. PDF: przeglądarka → Drukuj → Zapisz jako PDF (A4), albo `npm i -D playwright` i `render.mjs` zrobi PDF sam.

Formularz klienta (prop): otwórz `panel/feedback-form.html` — pokazuje, co widzi klient i jak jego liczby lądują jako `client-feedback.json`.

## Zasady, których pilnuje silnik (to jest sedno, nie ozdoba)

- **Uczciwe N/A.** Dzielenie bez mianownika → `N/A`, nigdy `NaN`, `∞` ani zmyślone `0%`.
- **Meta ≠ deklaracja klienta.** Wartości platformowe i deklarowane przez klienta są w osobnych polach; rozbieżność (np. 111 vs 84 leady) jest pokazana, nie nadpisana.
- **Deklarowany przychód ≠ ROAS.** Etykieta „deklarowany przychód", zero automatycznej atrybucji.
- **Logika lejka.** Wymusza `sold ≤ qualified ≤ assessed ≤ received`; brak (`null` = „nie wiem") nie jest liczony jako 0.
- **Pokrycie < 100% → koszt leada kwalifikowanego = N/A** (bez ekstrapolacji na nieocenione leady).
- **Fakt / obserwacja / hipoteza** są rozdzielone w tekście raportu; przyczyny bez dowodu są oznaczone jako hipoteza.
- **Determinizm.** Te same wejścia → bit-identyczny `metrics.json`. Bez AI w ścieżce liczb.

---

## Struktura

```
src/
  validate.mjs         # życzliwe drzwi wejściowe: schemat + lejek + PII + czytelne błędy
  metrics.mjs          # deterministyczne KPI -> metrics.json
  render.mjs           # metrics.json -> report.html (+ opcjonalny PDF)
  lib/
    csv.js             # parser CSV RFC4180 (BOM, ; , cudzysłowy) + walidacja nagłówków
    kpi.js             # parseNumber, safeDiv (N/A), computeMetrics
    checks.js          # checkFunnel, checkSingleAccount, wykrywanie kolumn PII
    reportHtml.js      # deterministyczny HTML memo z metrics.json
templates/report.css   # A4, memo edytorskie, B/W-safe, fonty systemowe (zero żądań sieciowych)
fixtures/klient-demo/  # syntetyczny klient PL (Meta CSV + feedback + config) — ZERO realnych danych
panel/feedback-form.html  # statyczny prop formularza klienta
test/metrics.test.mjs  # 13 testów silnika: N/A, lejek, rozbieżność, brak-ROAS
docs/index.html        # przykładowy raport opublikowany w GitHub Pages
output/                # raporty generowane lokalnie
```

Schemat Meta CSV: `zrodlo;id_konta;id_kampanii;nazwa;okres;timezone;waluta;spend;impressions;clicks;platform_leads`
`client-feedback.json`: `received, assessed, qualified, sold, declared_revenue, rejection_reasons` (`null` = „nie wiem").

---

## Scenariusz nagrania (7–15 min)

North-star tego repo = film walidujący popyt. Kolejne ujęcia + narracja:

**1. Ból (30–60 s).** „Raport dla klienta agencji to często teatr: 40-stronicowy PDF pełen wykresów, z którego klient nie rozumie, za co płaci." (źródło: research #31/#44 — raportowanie klientom jako top ból agencji PL).

**2. Wejście (1–2 min).** Pokaż `fixtures/klient-demo/meta-current.csv` (eksport Meta) i otwórz `panel/feedback-form.html`. Wypełnij 4 liczby jako klient → kliknij „Pokaż, jak to trafia do systemu" → pojawia się `client-feedback.json`. Podkreśl: tylko agregaty, żadnych danych osobowych, „nie wiem" zostaje `null`.

**3. Silnik i uczciwość (2–4 min).**
- `node src/validate.mjs fixtures/klient-demo` → OK.
- Na żywo dodaj do CSV kolumnę `email` albo ustaw w feedbacku `sold` > `qualified`, uruchom ponownie → **NEEDS_REVIEW** z czytelnym błędem. „Nie zgaduje, nie udaje — odmawia."
- `node src/metrics.mjs fixtures/klient-demo` → otwórz `metrics.json`. Pokaż: Meta 111 vs klient 84 (osobno), brak pola `roas`, `cost_per_qualified` policzone tylko przy pokryciu 100%.
- `node --test` → 13/13 zielonych.

**4. Wynik (3–5 min).** `node src/render.mjs output/klient-demo/cycle-2026-06` → otwórz `report.html`. Przejdź stronę 1: banner statusu → wynik biznesowy → lejek 84→84→39→7 → tagi FAKT/OBSERWACJA/HIPOTEZA → 3 propozycje z właścicielem. Potem aneks: kampanie, definicje, rozbieżność, ograniczenia. Podkreśl: „to memo, nie dashboard — pierwsza strona sama jest decyzją."

**5. Dlaczego inne (1–2 min).** Nie kolejny Looker/AgencyAnalytics. Wedge = ostatni odcinek lejka (jakość + sprzedaż) zamieniony w decyzje. **CTA:** komentarz / DM / lista — „chcesz szablon pod swoją agencję?".

Dry-run: przejdź całość na głos raz przed nagraniem — sprawdź, czy happy-path mieści się w 7–15 min i czy tekst na ekranie jest czytelny w 1080p.

---

## Weryfikacja

```bash
node --check src/*.mjs src/lib/*.js   # składnia
node --test                           # 13 testów silnika jednostkowych
node src/metrics.mjs fixtures/klient-demo && node src/metrics.mjs fixtures/klient-demo   # 2x = identyczny metrics.json (determinizm)
```

## Poza zakresem tego buildu

Multi-tenant, auth/MFA, magic-link server, retencja/RODO, kolejka, audit, moduł AI, panel operatora, DB, auto-send, billing, connectory API, manifest/checksumy jako tamper-evidence. Wszystko w wewnętrzny plan rozwoju (nie jest częścią tej wersji portfolio) — wraca dopiero po walidacji popytu (Gate 0 z PRD: 2 płatne piloty).

## Wersja portfolio i walidacja

Repozytorium zawiera kod oraz syntetyczne zestawy demonstracyjne. Realne arkusze, raporty, cache wdrożeń, screeny i materiały klienta nie są częścią publikacji. Publiczny raport powstaje z `fixtures/klient-demo`. Aby go odtworzyć, uruchom `npm run demo` i skopiuj `output/klient-demo/cycle-2026-06/report.html` do `docs/index.html`. Licencje osadzonych fontów znajdują się w [`docs/font-licenses`](docs/font-licenses/). CI uruchamia istniejące testy na Node 24, bez zależności npm i bez sekretów. Ta publikacja kodu nie potwierdza bezpieczeństwa dowolnych zewnętrznych danych wejściowych ani gotowości produktu do wdrożenia.
