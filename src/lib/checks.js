// Walidacja logiki lejka feedbacku klienta (PRD A-06 / FDBK-04).
// Zwraca liste bledow (pusta = OK). null traktujemy jako "nie wiem", NIE jako 0.

export const META_HEADERS = [
  'zrodlo',
  'id_konta',
  'id_kampanii',
  'nazwa',
  'okres',
  'timezone',
  'waluta',
  'spend',
  'impressions',
  'clicks',
  'platform_leads',
];

const CONTACT_LIKE = ['email', 'e-mail', 'mail', 'telefon', 'phone', 'imie', 'imię', 'nazwisko', 'nazwa_leada', 'adres'];

// Podpowiedz PII: nadmiarowe kolumny wygladajace na dane osobowe leada.
// (Pelny skan PII z DATA-05 jest poza zakresem demo — to tylko zyczliwa wskazowka na poziomie naglowka.)
export function contactLikeColumns(headerNames) {
  return headerNames.filter((h) =>
    CONTACT_LIKE.some((needle) => h.toLowerCase().includes(needle)),
  );
}

export function checkFunnel(feedback) {
  const errors = [];
  if (!feedback) return errors;

  const stages = [
    ['received', feedback.received],
    ['assessed', feedback.assessed],
    ['qualified', feedback.qualified],
    ['sold', feedback.sold],
  ];

  for (const [name, value] of stages) {
    if (value == null) continue;
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`Etap "${name}" musi byc nieujemna liczba calkowita (jest: ${JSON.stringify(value)}).`);
    }
  }

  let prevName = null;
  let prevValue = null;
  for (const [name, value] of stages) {
    if (value == null || !Number.isInteger(value) || value < 0) continue;
    if (prevValue != null && value > prevValue) {
      errors.push(
        `Logika lejka: "${name}" (${value}) > "${prevName}" (${prevValue}). ` +
          'Wymagane: sold <= qualified <= assessed <= received.',
      );
    }
    prevName = name;
    prevValue = value;
  }

  const revenue = feedback.declared_revenue;
  if (revenue != null && revenue > 0 && feedback.sold === 0) {
    errors.push(
      `Deklarowany przychod (${revenue}) przy sprzedazy = 0 wymaga korekty lub wyjasnienia.`,
    );
  }

  return errors;
}

// Jednorodnosc konta/okresu/waluty w pliku Meta (PRD A-03: jeden account ID, jeden okres).
export function checkSingleAccount(records) {
  const errors = [];
  const fields = ['id_konta', 'okres', 'waluta', 'timezone'];
  for (const field of fields) {
    const distinct = [...new Set(records.map((r) => r[field]))];
    if (distinct.length > 1) {
      errors.push(`Pole "${field}" ma rozne wartosci w pliku: ${distinct.join(', ')}. Wymagane jedno zrodlo.`);
    }
  }
  return errors;
}
