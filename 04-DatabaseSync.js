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
 * Daily Database Synchronization
 * 
 * Retrieves race data from backend database and synchronizes with Google Sheets.
 * 
 * Tasks:
 *  1. Populate DATABASE tab with previous day's entries from backend API
 *  2. Move DATABASE data into TEE sheet layout (races 3-15)
 * 
 * Note: TOTALS sheet appending is now handled by 07-DailyTotalsSync.js
 * 
 * Main entry point: runDailyTrackingSync()
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
  console.log('=== Starting Daily Database Sync ===');
  const databaseResult = await syncDatabaseSheet();
  const teeResult = await populateTeeSheetFromDatabase();

  // Summary log
  console.log(`=== Sync Summary ===`);
  console.log(`Database: ${databaseResult.appended} entries, ${databaseResult.racesMetadataAppended} metadata, ${databaseResult.winnersAppended} winners`);
  console.log(`TEE: ${Object.keys(teeResult.racesProcessed || {}).length} races processed`);
  console.log(`Note: TOTALS sheet appending is now handled by 07-DailyTotalsSync.js`);

  return {
    database: databaseResult,
    tee: teeResult,
  };
}

/**
 * Catch-up script: Finds the last inputted day in DATABASE and runs retrieval
 * for all days from that day up to yesterday (inclusive).
 * @returns {Promise<Object>} Summary of catch-up operations.
 */
async function runCatchUpRetrieval() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const databaseSheet = getSheetOrThrow_(ss, Config.TAB_DATABASE || 'DATABASE');
  const trackCode = getTrackCodeFromDatabaseSheet_(databaseSheet);

  // Find the last date with data in DATABASE
  const lastDate = findLastInputtedDate_(databaseSheet, trackCode);
  if (!lastDate) {
    return {
      success: false,
      message: 'No existing data found in DATABASE. Use runDailyTrackingSync() for daily updates.',
    };
  }

  // Get yesterday's date
  const yesterdayInfo = getPreviousEasternDateInfo_();
  const yesterday = new Date(yesterdayInfo.dateObj);

  // Calculate all dates from lastDate to yesterday (inclusive)
  const datesToProcess = [];
  const currentDate = new Date(lastDate);
  currentDate.setDate(currentDate.getDate() + 1); // Start from day after last inputted date

  while (currentDate <= yesterday) {
    datesToProcess.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (datesToProcess.length === 0) {
    return {
      success: true,
      message: 'Already up to date. No days to catch up.',
      datesProcessed: 0,
    };
  }

  console.log(`Found ${datesToProcess.length} days to catch up (from ${formatDateForDisplay_(lastDate)} to ${yesterdayInfo.displayDate})`);

  const results = [];
  for (const date of datesToProcess) {
    const dateInfo = {
      isoDate: Utilities.formatDate(date, DbRetrievalConfig.TIMEZONE, 'yyyy-MM-dd'),
      displayDate: Utilities.formatDate(date, DbRetrievalConfig.TIMEZONE, 'MM/dd/yy'),
      dateObj: date,
    };

    try {
      console.log(`Processing catch-up for ${dateInfo.isoDate}...`);
      const result = await syncDatabaseSheetForDate_(dateInfo, trackCode, databaseSheet);
      results.push({
        date: dateInfo.isoDate,
        success: true,
        ...result,
      });
    } catch (error) {
      console.error(`Error processing ${dateInfo.isoDate}:`, error);
      results.push({
        date: dateInfo.isoDate,
        success: false,
        error: error.message,
      });
    }
  }

  return {
    success: true,
    datesProcessed: datesToProcess.length,
    results,
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

  return syncDatabaseSheetForDate_(dateInfo, trackCode, databaseSheet);
}

/**
 * Fetch entries for a specific date and append to DATABASE.
 * Also stores race metadata (age, type, purse) in columns O-R (one row per race).
 * @param {Object} dateInfo - Date info object with isoDate, displayDate, dateObj
 * @param {string} trackCode - Track code
 * @param {GoogleAppsScript.Spreadsheet.Sheet} databaseSheet - DATABASE sheet
 * @returns {Object} Summary of API + append actions.
 */
function syncDatabaseSheetForDate_(dateInfo, trackCode, databaseSheet) {
  const apiEntries = fetchEntriesForTrack_(dateInfo.isoDate, trackCode);
  const apiWinners = fetchWinnersForTrack_(dateInfo.isoDate, trackCode);

  // Log what was fetched from API
  console.log(`[${dateInfo.isoDate}] ${trackCode}: Fetched ${apiEntries.length} entries, ${apiWinners.length} winners from API`);

  // Initialize return values
  let entriesFetched = 0;
  let entriesAppended = 0;
  let skipped = 0;
  let racesMetadataAppended = 0;
  let winnersAppended = 0;

  if (!apiEntries.length && !apiWinners.length) {
    console.log(`[${dateInfo.isoDate}] ${trackCode}: WARNING - No entries or winners returned from API`);
    return {
      trackCode,
      date: dateInfo.isoDate,
      fetched: 0,
      appended: 0,
      skipped: 0,
      racesMetadataAppended: 0,
      winnersAppended: 0,
      message: 'No data returned from API.',
    };
  }

  const existingKeys = buildDatabaseKeySet_(databaseSheet);
  const existingRaceKeys = buildRaceMetadataKeySet_(databaseSheet);
  const existingWinnerKeys = buildWinnerKeySet_(databaseSheet);
  const rowsToAppend = [];
  const raceMetadataToAppend = [];
  const winnersToAppend = [];
  const dateToken = dateInfo.isoDate.replace(/-/g, '');

  // Track unique races and their metadata
  const raceMetadataMap = {};

  // Process entries if available
  if (apiEntries.length > 0) {
    entriesFetched = apiEntries.length;

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

      // Store race metadata (age, type, purse) - one entry per race
      // Only store if at least one field has a value
      if (!raceMetadataMap[entry.race_id]) {
        const age = entry.age !== null && entry.age !== undefined ? String(entry.age) : null;
        const raceType = entry.race_type !== null && entry.race_type !== undefined ? String(entry.race_type) : null;
        const purse = entry.purse !== null && entry.purse !== undefined ? String(entry.purse) : null;

        // Only create metadata entry if at least one field has a value
        if (age || raceType || purse) {
          raceMetadataMap[entry.race_id] = {
            race_id: entry.race_id,
            age: age || '',
            race_type: raceType || '',
            purse: purse || '',
          };
        }
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
  }

  // Append entry rows
  if (rowsToAppend.length) {
    const startRow = Math.max(databaseSheet.getLastRow() + 1, 2);
    databaseSheet
      .getRange(startRow, 1, rowsToAppend.length, DbRetrievalConfig.DATABASE_COLUMNS)
      .setValues(rowsToAppend);
    entriesAppended = rowsToAppend.length;
    console.log(`[${dateInfo.isoDate}] ${trackCode}: Appended ${entriesAppended} race entries (${skipped} skipped)`);
  } else if (entriesFetched > 0) {
    console.log(`[${dateInfo.isoDate}] ${trackCode}: WARNING - ${entriesFetched} entries fetched but none appended (all duplicates or filtered)`);
  }

  // Append race metadata (columns O-R: race_id, age, type, purse)
  // Only append if race_id doesn't already exist (metadata map only contains races with at least one value)
  // Similar to winners pattern - append starting at row 2
  Object.values(raceMetadataMap).forEach(raceMeta => {
    if (!existingRaceKeys.has(raceMeta.race_id)) {
      raceMetadataToAppend.push([
        raceMeta.race_id,      // Column O
        raceMeta.age || '',    // Column P
        raceMeta.race_type || '', // Column Q
        raceMeta.purse || '',  // Column R
      ]);
      existingRaceKeys.add(raceMeta.race_id);
    }
  });

  // Process winners - store in columns L-M (race_id, winning_horse_number)
  if (apiWinners.length > 0) {
    apiWinners.forEach(winner => {
      const components = parseRaceIdComponents_(winner.race_id);
      if (!components) {
        return;
      }

      if (
        components.trackCode.toUpperCase() !== trackCode.toUpperCase() ||
        components.dateToken !== dateToken ||
        components.raceNumber < DbRetrievalConfig.MIN_RACE_NUMBER ||
        components.raceNumber > DbRetrievalConfig.MAX_RACE_NUMBER
      ) {
        return;
      }

      // Only append if race_id doesn't already exist in columns L-M
      if (!existingWinnerKeys.has(winner.race_id) && winner.winning_horse_number) {
        winnersToAppend.push([
          winner.race_id,              // Column L
          winner.winning_horse_number, // Column M
        ]);
        existingWinnerKeys.add(winner.race_id);
      }
    });
  }

  if (raceMetadataToAppend.length) {
    // Find the next available row in column O (starting from row 2, like winners)
    // Find the last row with data in column O, then append after it
    const lastRow = databaseSheet.getLastRow();
    let metadataStartRow = 2;

    if (lastRow >= 2) {
      const existingMetadata = databaseSheet.getRange(2, 15, lastRow - 1, 1).getValues();
      // Find the last non-empty row in column O
      for (let i = existingMetadata.length - 1; i >= 0; i--) {
        if (existingMetadata[i][0] && existingMetadata[i][0] !== '') {
          metadataStartRow = 2 + i + 1; // Next row after last data
          break;
        }
      }
    }

    databaseSheet
      .getRange(metadataStartRow, 15, raceMetadataToAppend.length, 4) // Columns O-R (15-18)
      .setValues(raceMetadataToAppend);
    racesMetadataAppended = raceMetadataToAppend.length;
    console.log(`[${dateInfo.isoDate}] ${trackCode}: Appended ${racesMetadataAppended} race metadata records`);
  } else if (entriesFetched > 0) {
    console.log(`[${dateInfo.isoDate}] ${trackCode}: WARNING - No race metadata appended (${Object.keys(raceMetadataMap).length} races processed but no metadata found)`);
  }

  if (winnersToAppend.length) {
    // Find the next available row in column L (starting from row 2)
    // Find the last row with data in column L, then append after it
    const lastRow = databaseSheet.getLastRow();
    let winnersStartRow = 2;

    if (lastRow >= 2) {
      const existingWinners = databaseSheet.getRange(2, 12, lastRow - 1, 1).getValues(); // Column L (12)
      // Find the last non-empty row in column L
      for (let i = existingWinners.length - 1; i >= 0; i--) {
        if (existingWinners[i][0] && existingWinners[i][0] !== '') {
          winnersStartRow = 2 + i + 1; // Next row after last data
          break;
        }
      }
    }

    databaseSheet
      .getRange(winnersStartRow, 12, winnersToAppend.length, 2) // Columns L-M (12-13)
      .setValues(winnersToAppend);
    winnersAppended = winnersToAppend.length;
    console.log(`[${dateInfo.isoDate}] ${trackCode}: Appended ${winnersAppended} winners`);
  } else if (apiWinners.length > 0) {
    console.log(`[${dateInfo.isoDate}] ${trackCode}: WARNING - ${apiWinners.length} winners fetched but none appended (all duplicates or filtered)`);
  } else {
    console.log(`[${dateInfo.isoDate}] ${trackCode}: WARNING - No winners available (races may not be completed yet)`);
  }

  // Summary log
  console.log(`[${dateInfo.isoDate}] ${trackCode}: Sync complete - Entries: ${entriesAppended}/${entriesFetched}, Metadata: ${racesMetadataAppended}, Winners: ${winnersAppended}`);

  return {
    trackCode,
    date: dateInfo.isoDate,
    fetched: entriesFetched,
    appended: entriesAppended,
    skipped,
    racesMetadataAppended,
    winnersAppended,
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

// Note: TOTALS sheet appending is now handled by 07-DailyTotalsSync.js
// This ensures sheets are fully populated before formulas are created

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
    displayDate: Utilities.formatDate(easternNow, tz, 'MM/dd/yy'),
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

  const spreadsheetUrl = getSpreadsheetUrl();

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'X-API-Key': apiKey,
      'X-Source-Spreadsheet-URL': spreadsheetUrl,
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

function fetchWinnersForTrack_(date, trackCode) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!apiKey) {
    throw new Error('API_KEY is not set in Script Properties.');
  }

  const ingestionUrl = Config.DATA_INGESTION_API_URL || '';
  const baseUrl = ingestionUrl.replace(/\/api\/races\/daily\/?$/, '');
  const url = `${baseUrl}/api/races/winners/daily?date=${encodeURIComponent(date)}&trackCode=${encodeURIComponent(trackCode)}`;

  const spreadsheetUrl = getSpreadsheetUrl();

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'X-API-Key': apiKey,
      'X-Source-Spreadsheet-URL': spreadsheetUrl,
    },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    // Don't throw error if winners endpoint fails - winners may not be available yet
    console.log(`Winners API returned ${response.getResponseCode()} for ${trackCode} on ${date}. This may be normal if races haven't completed yet.`);
    return [];
  }

  const payload = JSON.parse(response.getContentText());
  if (!payload.success) {
    console.log(`Winners API responded with success=false for ${trackCode} on ${date}.`);
    return [];
  }

  return payload.winners || [];
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

function buildRaceMetadataKeySet_(databaseSheet) {
  const lastRow = databaseSheet.getLastRow();
  if (lastRow < 2) {
    return new Set();
  }

  const keys = new Set();
  // Column O (15) contains race_id for metadata
  const raceIdValues = databaseSheet.getRange(2, 15, lastRow - 1, 1).getValues();
  raceIdValues.forEach(row => {
    const raceId = row[0];
    if (raceId && typeof raceId === 'string' && raceId.trim() !== '') {
      keys.add(raceId.trim());
    }
  });
  return keys;
}

function buildWinnerKeySet_(databaseSheet) {
  const lastRow = databaseSheet.getLastRow();
  if (lastRow < 2) {
    return new Set();
  }

  const keys = new Set();
  // Column L (12) contains race_id for winners
  const raceIdValues = databaseSheet.getRange(2, 12, lastRow - 1, 1).getValues();
  raceIdValues.forEach(row => {
    const raceId = row[0];
    if (raceId && typeof raceId === 'string' && raceId.trim() !== '') {
      keys.add(raceId.trim());
    }
  });
  return keys;
}

function findLastInputtedDate_(databaseSheet, trackCode) {
  const lastRow = databaseSheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  // Read race_id column (Column A) to find the latest date
  const raceIds = databaseSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let lastDate = null;

  raceIds.forEach(row => {
    const raceId = row[0];
    if (!raceId || typeof raceId !== 'string') {
      return;
    }

    const components = parseRaceIdComponents_(raceId);
    if (
      components &&
      components.trackCode.toUpperCase() === trackCode.toUpperCase() &&
      components.raceNumber >= DbRetrievalConfig.MIN_RACE_NUMBER &&
      components.raceNumber <= DbRetrievalConfig.MAX_RACE_NUMBER
    ) {
      // Parse date token (YYYYMMDD) to Date object
      const year = parseInt(components.dateToken.substring(0, 4), 10);
      const month = parseInt(components.dateToken.substring(4, 6), 10) - 1; // JS months are 0-indexed
      const day = parseInt(components.dateToken.substring(6, 8), 10);
      const date = new Date(year, month, day);

      if (!lastDate || date > lastDate) {
        lastDate = date;
      }
    }
  });

  return lastDate;
}

function formatDateForDisplay_(date) {
  return Utilities.formatDate(date, DbRetrievalConfig.TIMEZONE, 'MM/dd/yy');
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

