/**
 * HeatSeaker Template - Commercial Software
 * Copyright (c) 2024 Paul Stortini
 * Software Development & Maintenance by Alexander Meyer
 *
 * ZERO LIABILITY NOTICE: Service provider assumes no liability for betting operations.
 * Client bears 100% responsibility for all business outcomes.
 *
 * This software is provided "AS IS" without warranty.
 * For complete terms, see SERVICE_AGREEMENT.md
 *
 * Daily database + tracking sheet synchronisation utilities.
 * Tasks covered:
 *  - Task 2: Populate DATABASE tab with previous day's entries.
 *  - Task 3: Move DATABASE data into TEE sheet layout (races 3-15).
 *  - Task 4: Append TEE totals into TOTALS tab.
 *  - Orchestrator to run the three tasks sequentially.
 */

const DbRetrievalConfig = Object.freeze(
  Config.DB_TRACKING || {
    TIMEZONE: 'America/New_York',
    MIN_RACE_NUMBER: 3,
    MAX_RACE_NUMBER: Config.MAX_RACES || 15,
    MAX_HORSES_PER_RACE: Config.HORSE_NUMBER_MAX || 16,
    DATABASE_TRACK_CODE_CELL: 'J1',
    TOTALS_START_ROW: 11,
    TEE_TOTAL_RANGES: {
      WIN_BET: 'BI2',
      WIN_COLLECT: 'BJ2',
      GP: 'BM2',
      ROI: 'BN2',
    },
    DATABASE_COLUMNS: 6,
  }
);

/**
 * Main entry point that performs Tasks 2, 3, and 4 in order.
 * @returns {Promise<Object>} Summary of each step.
 */
async function runDailyTrackingSync() {
  const databaseResult = await syncDatabaseSheet();
  const teeResult = await populateTeeSheetFromDatabase();
  const totalsResult = await appendTotalsFromTee();

  return {
    database: databaseResult,
    tee: teeResult,
    totals: totalsResult,
  };
}

/**
 * Task 2: Fetch previous day's entries for the current track and append to DATABASE.
 * @returns {Object} Summary of API + append actions.
 */
function syncDatabaseSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const databaseSheet = getSheetOrThrow_(ss, Config.TAB_DATABASE || 'DATABASE');
  const trackCode = getTrackCodeFromDatabaseSheet_(databaseSheet);
  const dateInfo = getPreviousEasternDateInfo_();

  const apiEntries = fetchEntriesForTrack_(dateInfo.isoDate, trackCode);
  if (!apiEntries.length) {
    console.log(`No entries returned for ${trackCode} on ${dateInfo.isoDate}.`);
    return {
      trackCode,
      date: dateInfo.isoDate,
      fetched: 0,
      appended: 0,
      skipped: 0,
      message: 'No data returned from API.',
    };
  }

  const existingKeys = buildDatabaseKeySet_(databaseSheet);
  const rowsToAppend = [];
  let skipped = 0;
  const dateToken = dateInfo.isoDate.replace(/-/g, '');

  apiEntries.forEach(entry => {
    const components = parseRaceIdComponents_(entry.race_id);
    if (!components) {
      skipped++;
      return;
    }

    if (
      components.trackCode.toUpperCase() !== trackCode.toUpperCase() ||
      components.dateToken !== dateToken ||
      components.raceNumber < DbRetrievalConfig.MIN_RACE_NUMBER ||
      components.raceNumber > DbRetrievalConfig.MAX_RACE_NUMBER
    ) {
      skipped++;
      return;
    }

    const compositeKey = `${entry.race_id}|${entry.horse_number}`;
    if (existingKeys.has(compositeKey)) {
      skipped++;
      return;
    }

    rowsToAppend.push([
      entry.race_id,
      entry.horse_number,
      entry.ml ?? '',
      entry.live_odds ?? '',
      entry.correct_p3 ?? '',
      entry.double ?? '',
    ]);
    existingKeys.add(compositeKey);
  });

  if (rowsToAppend.length) {
    const startRow = Math.max(databaseSheet.getLastRow() + 1, 2);
    databaseSheet
      .getRange(startRow, 1, rowsToAppend.length, DbRetrievalConfig.DATABASE_COLUMNS)
      .setValues(rowsToAppend);
  }

  return {
    trackCode,
    date: dateInfo.isoDate,
    fetched: apiEntries.length,
    appended: rowsToAppend.length,
    skipped,
  };
}

/**
 * Task 3: Move previous day's DATABASE rows into the TEE sheet layout (races 3-15).
 * @returns {Object} Summary per race.
 */
function populateTeeSheetFromDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const databaseSheet = getSheetOrThrow_(ss, Config.TAB_DATABASE || 'DATABASE');
  const teeSheet = getSheetOrThrow_(ss, Config.TAB_TEE || 'TEE');
  const trackCode = getTrackCodeFromDatabaseSheet_(databaseSheet);
  const dateInfo = getPreviousEasternDateInfo_();
  const targetDateToken = dateInfo.isoDate.replace(/-/g, '');

  const raceMap = buildRaceEntryMap_(databaseSheet, trackCode, targetDateToken);
  const raceHeaderRows = findRaceHeaderRows_(teeSheet, DbRetrievalConfig.MIN_RACE_NUMBER, DbRetrievalConfig.MAX_RACE_NUMBER);

  const summary = {};

  for (let race = DbRetrievalConfig.MIN_RACE_NUMBER; race <= DbRetrievalConfig.MAX_RACE_NUMBER; race++) {
    const headerRow = raceHeaderRows[race];
    if (!headerRow) {
      summary[race] = { written: 0, message: 'Header not found.' };
      continue;
    }

    const entries = (raceMap[race] || []).sort((a, b) => a.horse_number - b.horse_number);
    const values = entries.map(entry => [
      entry.horse_number,
      entry.ml ?? '',
      entry.live_odds ?? '',
      entry.correct_p3 ?? '',
      entry.double ?? '',
    ]);

    writeRaceBlockToTee_(teeSheet, headerRow, values);
    summary[race] = { written: values.length };
  }

  return {
    trackCode,
    date: dateInfo.isoDate,
    racesProcessed: summary,
  };
}

/**
 * Task 4: Append totals from TEE into TOTALS sheet for the previous day.
 * @returns {Object} Append summary.
 */
function appendTotalsFromTee() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const teeSheet = getSheetOrThrow_(ss, Config.TAB_TEE || 'TEE');
  const totalsSheet = getSheetOrThrow_(ss, Config.TAB_TOTALS || 'TOTALS');
  const dateInfo = getPreviousEasternDateInfo_();
  const dateLabel = dateInfo.displayDate;

  if (totalsDateExists_(totalsSheet, dateLabel)) {
    return {
      date: dateLabel,
      appended: false,
      message: 'Date already logged in TOTALS.',
    };
  }

  const totalsRow = [
    teeSheet.getRange(DbRetrievalConfig.TEE_TOTAL_RANGES.WIN_BET).getValue(),
    teeSheet.getRange(DbRetrievalConfig.TEE_TOTAL_RANGES.WIN_COLLECT).getValue(),
    teeSheet.getRange(DbRetrievalConfig.TEE_TOTAL_RANGES.GP).getValue(),
    teeSheet.getRange(DbRetrievalConfig.TEE_TOTAL_RANGES.ROI).getValue(),
  ];

  const appendRow = Math.max(totalsSheet.getLastRow() + 1, DbRetrievalConfig.TOTALS_START_ROW);
  totalsSheet
    .getRange(appendRow, 1, 1, 5)
    .setValues([[dateLabel, totalsRow[0], totalsRow[1], totalsRow[2], totalsRow[3]]]);

  return {
    date: dateLabel,
    appended: true,
  };
}

// -----------------------------
// Helper functions
// -----------------------------

function getSheetOrThrow_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    throw new Error(`Sheet "${name}" not found.`);
  }
  return sheet;
}

function getTrackCodeFromDatabaseSheet_(databaseSheet) {
  const value = databaseSheet.getRange(DbRetrievalConfig.DATABASE_TRACK_CODE_CELL).getDisplayValue();
  if (!value) {
    throw new Error(`Track code is missing in ${databaseSheet.getName()}!${DbRetrievalConfig.DATABASE_TRACK_CODE_CELL}`);
  }
  return value.toUpperCase().trim();
}

function getPreviousEasternDateInfo_() {
  const tz = DbRetrievalConfig.TIMEZONE;
  const now = new Date();
  const easternNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  easternNow.setDate(easternNow.getDate() - 1);

  return {
    isoDate: Utilities.formatDate(easternNow, tz, 'yyyy-MM-dd'),
    displayDate: Utilities.formatDate(easternNow, tz, 'MM-dd-yy'),
    dateObj: easternNow,
  };
}

function fetchEntriesForTrack_(date, trackCode) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!apiKey) {
    throw new Error('API_KEY is not set in Script Properties.');
  }

  const ingestionUrl = Config.DATA_INGESTION_API_URL || '';
  const baseUrl = ingestionUrl.replace(/\/api\/races\/daily\/?$/, '');
  const url = `${baseUrl}/api/races/entries/daily?date=${encodeURIComponent(date)}&trackCode=${encodeURIComponent(trackCode)}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'X-API-Key': apiKey,
    },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Entries API error (${response.getResponseCode()}): ${response.getContentText()}`);
  }

  const payload = JSON.parse(response.getContentText());
  if (!payload.success) {
    throw new Error(`Entries API responded with success=false: ${response.getContentText()}`);
  }

  return payload.entries || [];
}

function buildDatabaseKeySet_(databaseSheet) {
  const lastRow = databaseSheet.getLastRow();
  if (lastRow < 2) {
    return new Set();
  }

  const keys = new Set();
  const keyValues = databaseSheet.getRange(2, 1, lastRow - 1, 2).getValues();
  keyValues.forEach(row => {
    const raceId = row[0];
    const horseNumber = row[1];
    if (raceId && horseNumber !== '') {
      keys.add(`${raceId}|${horseNumber}`);
    }
  });
  return keys;
}

function parseRaceIdComponents_(raceId) {
  if (!raceId || typeof raceId !== 'string') {
    return null;
  }

  const match = raceId.trim().match(/^([A-Z0-9]+)_(\d{8})_(\d{1,2})$/i);
  if (!match) {
    return null;
  }

  return {
    trackCode: match[1].toUpperCase(),
    dateToken: match[2],
    raceNumber: parseInt(match[3], 10),
  };
}

function buildRaceEntryMap_(databaseSheet, trackCode, dateToken) {
  const lastRow = databaseSheet.getLastRow();
  const raceMap = {};
  if (lastRow < 2) {
    return raceMap;
  }

  const values = databaseSheet.getRange(2, 1, lastRow - 1, DbRetrievalConfig.DATABASE_COLUMNS).getValues();
  values.forEach(row => {
    const raceId = row[0];
    const horseNumber = Number(row[1]);
    if (!raceId || Number.isNaN(horseNumber)) {
      return;
    }

    const components = parseRaceIdComponents_(raceId);
    if (
      !components ||
      components.trackCode !== trackCode ||
      components.dateToken !== dateToken ||
      components.raceNumber < DbRetrievalConfig.MIN_RACE_NUMBER ||
      components.raceNumber > DbRetrievalConfig.MAX_RACE_NUMBER
    ) {
      return;
    }

    raceMap[components.raceNumber] = raceMap[components.raceNumber] || [];
    raceMap[components.raceNumber].push({
      race_id: raceId,
      horse_number: horseNumber,
      ml: row[2],
      live_odds: row[3],
      correct_p3: row[4],
      double: row[5],
    });
  });

  return raceMap;
}

function findRaceHeaderRows_(teeSheet, minRace, maxRace) {
  const headerRows = {};

  for (let race = minRace; race <= maxRace; race++) {
    const finder = teeSheet.createTextFinder(`RACE ${race}`);
    if (!finder) {
      continue;
    }
    finder.matchCase(false);
    const cell = finder.findNext();
    if (cell) {
      headerRows[race] = cell.getRow();
    }
  }

  return headerRows;
}

function writeRaceBlockToTee_(teeSheet, headerRow, values) {
  const dataStartRow = headerRow + 2; // Skip header + column titles row
  teeSheet.getRange(dataStartRow, 1, DbRetrievalConfig.MAX_HORSES_PER_RACE, 5).clearContent();

  if (!values.length) {
    return;
  }

  teeSheet.getRange(dataStartRow, 1, values.length, 5).setValues(values);
}

function totalsDateExists_(totalsSheet, dateLabel) {
  const lastRow = totalsSheet.getLastRow();
  if (lastRow < DbRetrievalConfig.TOTALS_START_ROW) {
    return false;
  }

  const range = totalsSheet.getRange(
    DbRetrievalConfig.TOTALS_START_ROW,
    1,
    lastRow - DbRetrievalConfig.TOTALS_START_ROW + 1,
    1
  );
  const values = range.getValues();
  return values.some(row => {
    const value = row[0];
    if (!value) {
      return false;
    }
    if (value instanceof Date) {
      const formatted = Utilities.formatDate(value, DbRetrievalConfig.TIMEZONE, 'MM-dd-yy');
      return formatted === dateLabel;
    }
    return value.toString() === dateLabel;
  });
}
