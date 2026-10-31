// Parser CSV bez zaleznosci — automat RFC4180 (BOM, cudzyslowy, sep ';').
// Zrodlo wzorca: 07-NOTATKI/outreach/render-outreach.mjs (parseCsv).

export function parseCsv(source, delimiter = ';') {
  if (typeof source !== 'string') {
    throw new TypeError('Zrodlo CSV musi byc tekstem.');
  }
  if (typeof delimiter !== 'string' || delimiter.length !== 1) {
    throw new TypeError('Separator CSV musi byc dokladnie jednym znakiem.');
  }

  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const rows = [];
  let row = [];
  let field = '';
  let state = 'unquoted';

  const finishField = () => {
    row.push(field);
    field = '';
    state = 'unquoted';
  };

  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (state === 'quoted') {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          state = 'afterQuote';
        }
      } else {
        field += character;
      }
      continue;
    }

    if (state === 'afterQuote') {
      if (character === delimiter) {
        finishField();
      } else if (character === '\n') {
        finishRow();
      } else if (character === '\r') {
        if (text[index + 1] === '\n') {
          index += 1;
        }
        finishRow();
      } else {
        throw new Error(`Nieoczekiwany znak po zamykajacym cudzyslowie (pozycja ${index}).`);
      }
      continue;
    }

    if (character === '"') {
      if (field.length !== 0) {
        throw new Error(`Nieoczekiwany cudzyslow w polu bez cudzyslowow (pozycja ${index}).`);
      }
      state = 'quoted';
    } else if (character === delimiter) {
      finishField();
    } else if (character === '\n') {
      finishRow();
    } else if (character === '\r') {
      if (text[index + 1] === '\n') {
        index += 1;
      }
      finishRow();
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    finishRow();
  }

  // Odrzuc puste wiersze koncowe (np. dodatkowy newline na koncu pliku).
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.trim() === '')) {
    rows.pop();
  }

  return rows;
}

// Zamienia wiersze na rekordy i TWARDO waliduje naglowki wzgledem oczekiwanego schematu.
// Rzuca czytelnym bledem, gdy brakuje kolumny lub jest kolumna nadmiarowa (A-03: dodatkowe kolumny odrzucane).
export function rowsToRecords(rows, expectedHeaders) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Plik CSV jest pusty.');
  }
  const header = rows[0].map((cell) => cell.trim());
  const expected = expectedHeaders.map((cell) => cell.trim());

  const missing = expected.filter((name) => !header.includes(name));
  const extra = header.filter((name) => !expected.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    const parts = [];
    if (missing.length > 0) parts.push(`brak kolumn: ${missing.join(', ')}`);
    if (extra.length > 0) parts.push(`nieoczekiwane kolumny: ${extra.join(', ')}`);
    throw new Error(
      `Naglowek CSV nie pasuje do schematu (${parts.join('; ')}). ` +
        `Oczekiwano dokladnie: ${expected.join(', ')}.`,
    );
  }

  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    if (cells.length !== header.length) {
      throw new Error(
        `Wiersz ${i + 1}: liczba kolumn (${cells.length}) rozni sie od naglowka (${header.length}).`,
      );
    }
    const record = {};
    for (let c = 0; c < header.length; c += 1) {
      record[header[c]] = cells[c].trim();
    }
    record.__row = i + 1; // numer wiersza w pliku (1-indeks, z naglowkiem) do komunikatow bledow
    records.push(record);
  }
  return records;
}
