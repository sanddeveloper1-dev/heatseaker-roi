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
 * Daily ROI Processing Script
 * 
 * Processes DATABASE sheet entries and creates dated copies of TEE sheet
 * with race data populated from DATABASE entries.
 * 
 * Features:
 * - Optimized batch processing for performance
 * - Resume capability using Column G (Extracted flag) in DATABASE
 * - Winner tracking and population in TEE sheets
 * - Progress tracking via Column G flag
 * - Creates dated TEE sheets (MM/dd/yy format) for daily ROI tracking
 * 
 * Note: TOTALS sheet appending is now handled by 07-DailyTotalsSync.js
 */

const RoiHistoricalConfig = {
	DATABASE_SHEET_NAME: Config?.TAB_DATABASE || 'DATABASE',
	TEE_SHEET_NAME: Config?.TAB_TEE || 'TEE',
	MIN_RACE_NUMBER: Config?.DB_TRACKING?.MIN_RACE_NUMBER || 3,
	MAX_RACE_NUMBER: Config?.MAX_RACES || 15,
	TIMEZONE: Config?.DB_TRACKING?.TIMEZONE || 'America/New_York',

	// DATABASE column indices (0-based)
	COL_RACE_ID: 0,        // Column A: Race Date & Number
	COL_HORSE_NUM: 1,      // Column B: Horse Number
	COL_ML_ODDS: 2,        // Column C: ML Odds
	COL_LIVE_ODDS: 3,      // Column D: Live Odds
	COL_CP3_ODDS: 4,       // Column E: CP3 Odds
	COL_DOUBLE: 5,         // Column F: Double
	COL_EXTRACTED: 6,      // Column G: Extracted flag (TRUE/FALSE)
	COL_WINNER_RACE_ID: 11, // Column L: Winner Race Date & Number
	COL_WINNER_HORSE: 12,   // Column M: Winner Horse Number

	// Performance settings
	MAX_EXECUTION_TIME_MS: 5.5 * 60 * 1000, // 5.5 minutes (leave buffer before 6 min limit)
};

/**
 * Main entry point - processes all DATABASE entries
 * Skips entries where Column G (Extracted) is TRUE
 * Marks entries as TRUE in Column G after processing
 * @returns {Object} Summary of processing
 */
function processRoiHistorical() {
	const startTime = Date.now();
	console.log('🚀 Starting ROI Historical processing...');

	try {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const databaseSheet = getSheetOrThrow_(ss, RoiHistoricalConfig.DATABASE_SHEET_NAME);

		// Read all DATABASE entries in one batch
		// Read columns A-G (race data + extracted flag) and L-M (winners)
		const lastRow = databaseSheet.getLastRow();
		if (lastRow < 2) {
			console.log('⚠️ No data found in DATABASE sheet');
			return { success: false, error: 'No data found' };
		}

		// Read main data columns (A-G: rows 2 to lastRow)
		const mainDataRange = databaseSheet.getRange(2, 1, lastRow - 1, 7);
		const mainData = mainDataRange.getValues();

		// Read winner columns (L-M: rows 2 to lastRow)
		const winnerDataRange = databaseSheet.getRange(2, 12, lastRow - 1, 2);
		const winnerData = winnerDataRange.getValues();

		// Read race metadata columns (O-R: rows 2 to lastRow) - race_id, age, type, purse
		const raceMetadataRange = databaseSheet.getRange(2, 15, lastRow - 1, 4);
		const raceMetadataData = raceMetadataRange.getValues();

		console.log(`📊 Read ${mainData.length} entries from DATABASE`);

		// Build winners map: raceId -> winnerHorseNumber
		const winnersMap = buildWinnersMap_(winnerData);

		// Build race metadata map: raceId -> {age, type, purse}
		const raceMetadataMap = buildRaceMetadataMap_(raceMetadataData);

		// Parse and group entries by date, filtering out already extracted entries
		const parseResult = parseEntriesByDate_(mainData);
		const entriesByDate = parseResult.entriesByDate;
		const rowIndicesByDate = parseResult.rowIndicesByDate; // Track which rows need to be marked as extracted
		const dates = Object.keys(entriesByDate).sort();

		const skippedCount = parseResult.skippedCount;
		console.log(`📅 Found ${dates.length} unique dates (skipped ${skippedCount} already extracted entries)`);

		// Process dates
		const summary = {
			totalDates: dates.length,
			processedDates: 0,
			skippedDates: 0,
			entriesMarked: 0,
			errors: [],
		};

		for (let i = 0; i < dates.length; i++) {
			// Check execution time limit
			const elapsed = Date.now() - startTime;
			if (elapsed >= RoiHistoricalConfig.MAX_EXECUTION_TIME_MS) {
				console.log(`⏱️ Time limit approaching. Processed ${summary.processedDates} dates. Stopping.`);
				summary.message = 'Time limit reached. Run processRoiHistorical() again to resume from unprocessed entries.';
				break;
			}

			const date = dates[i];
			try {
				const dateRowIndices = rowIndicesByDate[date];
				const winnersForDate = getWinnersForDate_(winnersMap, date);
				const raceMetadataForDate = getRaceMetadataForDate_(raceMetadataMap, date);

				const result = processDate_(ss, date, entriesByDate[date], winnersForDate, raceMetadataForDate);
				summary.processedDates++;

				// Mark entries as extracted immediately after processing this date
				// Convert row indices to actual row numbers (add 2 to account for header row and 0-based indexing)
				const rowsToMark = dateRowIndices.map(rowIndex => rowIndex + 2);
				markEntriesAsExtracted_(databaseSheet, rowsToMark);
				summary.entriesMarked += dateRowIndices.length;

				console.log(`✅ Processed date ${date}: ${result.racesProcessed} races, ${dateRowIndices.length} entries marked as extracted`);
			} catch (error) {
				summary.errors.push({ date, error: error.message });
				console.error(`❌ Error processing date ${date}:`, error);
				// Don't mark entries as extracted if there was an error
			}
		}

		if (summary.processedDates === summary.totalDates) {
			summary.message = 'All dates processed successfully!';
		}

		console.log(`✅ Processing complete. Summary:`, summary);
		return summary;

	} catch (error) {
		console.error('❌ Fatal error in processRoiHistorical:', error);
		return { success: false, error: error.message };
	}
}

/**
 * Clear extraction flags - resets Column G to allow reprocessing
 * WARNING: This will clear all extraction flags in Column G
 */
function clearRoiHistoricalProgress() {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const databaseSheet = getSheetOrThrow_(ss, RoiHistoricalConfig.DATABASE_SHEET_NAME);

	const lastRow = databaseSheet.getLastRow();
	if (lastRow < 2) {
		console.log('⚠️ No data found in DATABASE sheet');
		return { success: false, error: 'No data found' };
	}

	// Clear Column G (Extracted flag) for all data rows
	const extractedRange = databaseSheet.getRange(2, 7, lastRow - 1, 1);
	extractedRange.clearContent();

	console.log(`✅ Cleared extraction flags in Column G for ${lastRow - 1} rows. Next run will process all entries.`);
	return { success: true, rowsCleared: lastRow - 1 };
}

// -----------------------------
// Helper functions
// -----------------------------

/**
 * Build winners map from winner data (columns L-M)
 * @param {Array<Array>} winnerData - Array of [raceId, winnerHorseNumber] rows
 * @returns {Object} Map of raceId -> winnerHorseNumber
 */
function buildWinnersMap_(winnerData) {
	const winnersMap = {};

	for (let i = 0; i < winnerData.length; i++) {
		const row = winnerData[i];
		const raceId = row[0]; // Column L: Race Date & Number
		const winner = row[1]; // Column M: Winner Horse Number

		if (raceId && typeof raceId === 'string' && winner !== null && winner !== undefined && winner !== '') {
			winnersMap[raceId] = winner;
		}
	}

	return winnersMap;
}

/**
 * Get winners for a specific date from winners map
 * @param {Object} winnersMap - Map of raceId -> winnerHorseNumber
 * @param {string} dateToken - Date in YYYYMMDD format
 * @returns {Object} Map of raceNumber -> winnerHorseNumber for the date
 */
function getWinnersForDate_(winnersMap, dateToken) {
	const winnersForDate = {};

	// Find all winners for races on this date
	Object.keys(winnersMap).forEach(raceId => {
		const match = raceId.trim().match(/^[A-Z0-9]+_(\d{8})_(\d+)$/i);
		if (match && match[1] === dateToken) {
			const raceNumber = parseInt(match[2], 10);
			if (raceNumber >= RoiHistoricalConfig.MIN_RACE_NUMBER &&
				raceNumber <= RoiHistoricalConfig.MAX_RACE_NUMBER) {
				winnersForDate[raceNumber] = winnersMap[raceId];
			}
		}
	});

	return winnersForDate;
}

/**
 * Build race metadata map from race metadata data (columns O-R)
 * @param {Array<Array>} raceMetadataData - Array of [raceId, age, type, purse] rows
 * @returns {Object} Map of raceId -> {age, type, purse}
 */
function buildRaceMetadataMap_(raceMetadataData) {
	const raceMetadataMap = {};

	for (let i = 0; i < raceMetadataData.length; i++) {
		const row = raceMetadataData[i];
		const raceId = row[0]; // Column O: Race ID
		const age = row[1];    // Column P: Age
		const type = row[2];    // Column Q: Type
		const purse = row[3];   // Column R: Purse

		if (raceId && typeof raceId === 'string' && raceId.trim() !== '') {
			raceMetadataMap[raceId.trim()] = {
				age: age !== null && age !== undefined && age !== '' ? String(age) : '',
				type: type !== null && type !== undefined && type !== '' ? String(type) : '',
				purse: purse !== null && purse !== undefined && purse !== '' ? String(purse) : '',
			};
		}
	}

	return raceMetadataMap;
}

/**
 * Get race metadata for a specific date from race metadata map
 * @param {Object} raceMetadataMap - Map of raceId -> {age, type, purse}
 * @param {string} dateToken - Date in YYYYMMDD format
 * @returns {Object} Map of raceNumber -> {age, type, purse} for the date
 */
function getRaceMetadataForDate_(raceMetadataMap, dateToken) {
	const raceMetadataForDate = {};

	// Find all race metadata for races on this date
	Object.keys(raceMetadataMap).forEach(raceId => {
		const match = raceId.trim().match(/^[A-Z0-9]+_(\d{8})_(\d+)$/i);
		if (match && match[1] === dateToken) {
			const raceNumber = parseInt(match[2], 10);
			if (raceNumber >= RoiHistoricalConfig.MIN_RACE_NUMBER &&
				raceNumber <= RoiHistoricalConfig.MAX_RACE_NUMBER) {
				raceMetadataForDate[raceNumber] = raceMetadataMap[raceId];
			}
		}
	});

	return raceMetadataForDate;
}

/**
 * Parse DATABASE entries and group by date
 * Filters out entries where Column G (Extracted) is TRUE
 * @param {Array<Array>} databaseData - Array of rows from DATABASE sheet (columns A-G)
 * @returns {Object} Object with entriesByDate, rowIndicesByDate, and skippedCount
 */
function parseEntriesByDate_(databaseData) {
	const entriesByDate = {};
	const rowIndicesByDate = {};
	let skippedCount = 0;

	for (let i = 0; i < databaseData.length; i++) {
		const row = databaseData[i];
		const raceId = row[RoiHistoricalConfig.COL_RACE_ID]; // Column A: Race Date & Number
		const extracted = row[RoiHistoricalConfig.COL_EXTRACTED]; // Column G: Extracted flag

		// Skip if already extracted
		if (extracted === true || extracted === 'TRUE' || extracted === 'True') {
			skippedCount++;
			continue;
		}

		if (!raceId || typeof raceId !== 'string') {
			continue;
		}

		// Parse race ID format: CODE_YYYYMMDD_racenumber (e.g., AQU_20240101_3)
		const match = raceId.trim().match(/^[A-Z0-9]+_(\d{8})_(\d+)$/i);
		if (!match) {
			continue;
		}

		const dateToken = match[1]; // YYYYMMDD
		const raceNumber = parseInt(match[2], 10);

		// Only process races 3-15
		if (raceNumber < RoiHistoricalConfig.MIN_RACE_NUMBER ||
			raceNumber > RoiHistoricalConfig.MAX_RACE_NUMBER) {
			continue;
		}

		if (!entriesByDate[dateToken]) {
			entriesByDate[dateToken] = [];
			rowIndicesByDate[dateToken] = [];
		}

		entriesByDate[dateToken].push({
			raceId,
			raceNumber,
			horseNumber: row[RoiHistoricalConfig.COL_HORSE_NUM] || '',      // Column B: Horse Number
			mlOdds: row[RoiHistoricalConfig.COL_ML_ODDS] || '',           // Column C: ML Odds
			liveOdds: row[RoiHistoricalConfig.COL_LIVE_ODDS] || '',         // Column D: Live Odds
			cp3Odds: row[RoiHistoricalConfig.COL_CP3_ODDS] || '',          // Column E: CP3 Odds
			double: row[RoiHistoricalConfig.COL_DOUBLE] || '',           // Column F: Double
		});

		rowIndicesByDate[dateToken].push(i); // Track row index for marking as extracted
	}

	return {
		entriesByDate,
		rowIndicesByDate,
		skippedCount
	};
}

/**
 * Mark entries as extracted (set Column G to TRUE) for specified rows
 * Handles non-consecutive rows by grouping consecutive ranges
 * @param {GoogleAppsScript.Spreadsheet.Sheet} databaseSheet - DATABASE sheet
 * @param {Array<number>} rowNumbers - Array of row numbers (1-based, including header row)
 */
function markEntriesAsExtracted_(databaseSheet, rowNumbers) {
	if (rowNumbers.length === 0) {
		return;
	}

	// Sort row numbers
	const sortedRows = [...rowNumbers].sort((a, b) => a - b);

	// Group consecutive rows into ranges
	const ranges = [];
	let rangeStart = sortedRows[0];
	let rangeEnd = sortedRows[0];

	for (let i = 1; i < sortedRows.length; i++) {
		if (sortedRows[i] === rangeEnd + 1) {
			// Consecutive, extend range
			rangeEnd = sortedRows[i];
		} else {
			// Gap found, save current range and start new one
			ranges.push({ start: rangeStart, end: rangeEnd, count: rangeEnd - rangeStart + 1 });
			rangeStart = sortedRows[i];
			rangeEnd = sortedRows[i];
		}
	}
	// Don't forget the last range
	ranges.push({ start: rangeStart, end: rangeEnd, count: rangeEnd - rangeStart + 1 });

	// Update each consecutive range
	ranges.forEach(range => {
		const values = Array(range.count).fill().map(() => [true]);
		const rangeObj = databaseSheet.getRange(range.start, 7, range.count, 1);
		rangeObj.setValues(values);
	});
}

/**
 * Process a single date: create TEE copy and populate race data
 * Handles both new sheets and updating existing sheets for partially extracted dates
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Active spreadsheet
 * @param {string} dateToken - Date in YYYYMMDD format
 * @param {Array<Object>} entries - Entries for this date
 * @param {Object} winnersForDate - Map of raceNumber -> winnerHorseNumber for this date
 * @param {Object} raceMetadataForDate - Map of raceNumber -> {age, type, purse} for this date
 * @returns {Object} Processing result
 */
function processDate_(ss, dateToken, entries, winnersForDate, raceMetadataForDate) {
	// Parse date token (YYYYMMDD) to Date object
	const year = parseInt(dateToken.substring(0, 4), 10);
	const month = parseInt(dateToken.substring(4, 6), 10) - 1; // JS months are 0-indexed
	const day = parseInt(dateToken.substring(6, 8), 10);
	const dateObj = new Date(year, month, day);

	// Format as MM/DD/YY for sheet name
	const sheetName = Utilities.formatDate(dateObj, RoiHistoricalConfig.TIMEZONE, 'MM/dd/yy');

	// Check if sheet exists - if it does, we'll update it instead of skipping
	let targetSheet = ss.getSheetByName(sheetName);
	const isNewSheet = !targetSheet;

	if (isNewSheet) {
		// Get TEE template sheet and create new sheet
		const teeTemplate = getSheetOrThrow_(ss, RoiHistoricalConfig.TEE_SHEET_NAME);
		targetSheet = teeTemplate.copyTo(ss);
		targetSheet.setName(sheetName);
		console.log(`📋 Created new sheet: ${sheetName}`);
	} else {
		console.log(`📋 Updating existing sheet: ${sheetName}`);
	}

	// Group entries by race number
	const entriesByRace = {};
	entries.forEach(entry => {
		if (!entriesByRace[entry.raceNumber]) {
			entriesByRace[entry.raceNumber] = [];
		}
		entriesByRace[entry.raceNumber].push(entry);
	});

	// Process each race - now works for both new and existing sheets
	let racesProcessed = 0;
	const raceNumbers = Object.keys(entriesByRace)
		.map(r => parseInt(r, 10))
		.sort((a, b) => a - b);

	for (const raceNumber of raceNumbers) {
		try {
			const raceEntries = entriesByRace[raceNumber];

			// Find race header row in TEE sheet
			const headerRow = findRaceHeaderRow_(targetSheet, raceNumber);
			if (!headerRow) {
				console.log(`⚠️ Could not find header for Race ${raceNumber} in sheet`);
				continue;
			}

			if (isNewSheet) {
				// For new sheets, write all entries (clear and write)
				writeRaceEntriesToSheet_(targetSheet, headerRow, raceEntries);
			} else {
				// For existing sheets, append/merge new entries
				appendRaceEntriesToSheet_(targetSheet, headerRow, raceEntries);
			}

			// Write winner to Column B of race header row (if available and not already set)
			if (winnersForDate && winnersForDate[raceNumber] !== undefined) {
				const winnerCell = targetSheet.getRange(headerRow, 2); // Column B
				const currentWinner = winnerCell.getValue();
				if (!currentWinner || currentWinner === '') {
					winnerCell.setValue(winnersForDate[raceNumber]);
					console.log(`  ✓ Race ${raceNumber}: ${raceEntries.length} entries, winner: ${winnersForDate[raceNumber]}`);
				} else {
					console.log(`  ✓ Race ${raceNumber}: ${raceEntries.length} entries, winner already set: ${currentWinner}`);
				}
			} else {
				console.log(`  ✓ Race ${raceNumber}: ${raceEntries.length} entries (no winner found)`);
			}

			// Write race metadata (type, age, purse) to columns D, E, F
			// Race 3: row 2 (D2, E2, F2)
			// Race 4: row 22 (D22, E22, F22)
			// Race 5: row 42 (D42, E42, F42)
			// Formula: row = 2 + (raceNumber - 3) * 20
			if (raceMetadataForDate && raceMetadataForDate[raceNumber]) {
				const metadataRow = 2 + (raceNumber - 3) * 20;
				const metadata = raceMetadataForDate[raceNumber];

				// Only write if not already set (similar to winner logic)
				const typeCell = targetSheet.getRange(metadataRow, 4); // Column D
				const ageCell = targetSheet.getRange(metadataRow, 5);  // Column E
				const purseCell = targetSheet.getRange(metadataRow, 6); // Column F

				if (!typeCell.getValue() || typeCell.getValue() === '') {
					typeCell.setValue(metadata.type || '');
				}
				if (!ageCell.getValue() || ageCell.getValue() === '') {
					ageCell.setValue(metadata.age || '');
				}
				if (!purseCell.getValue() || purseCell.getValue() === '') {
					purseCell.setValue(metadata.purse || '');
				}

				console.log(`  ✓ Race ${raceNumber}: Metadata written (type: ${metadata.type || 'N/A'}, age: ${metadata.age || 'N/A'}, purse: ${metadata.purse || 'N/A'})`);
			}

			racesProcessed++;

		} catch (error) {
			console.error(`  ✗ Error processing Race ${raceNumber}:`, error);
		}
	}

	// Note: TOTALS sheet appending is now handled by 07-DailyTotalsSync.js
	// This ensures sheets are fully populated before formulas are created

	return { racesProcessed, sheetName, isNewSheet };
}

/**
 * Find the header row for a specific race in TEE sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - TEE sheet
 * @param {number} raceNumber - Race number (3-15)
 * @returns {number|null} Row number of race header, or null if not found
 */
function findRaceHeaderRow_(sheet, raceNumber) {
	const finder = sheet.createTextFinder(`RACE ${raceNumber}`);
	finder.matchCase(false);
	finder.matchEntireCell(true);
	const cell = finder.findNext();

	if (cell) {
		return cell.getRow();
	}

	return null;
}

/**
 * Write race entries to TEE sheet starting at the race's data row
 * Clears existing data and writes all entries (for new sheets)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} headerRow - Row number of race header (e.g., row with "RACE 3")
 * @param {Array<Object>} entries - Race entries to write
 */
function writeRaceEntriesToSheet_(sheet, headerRow, entries) {
	// Data starts 2 rows after header (header row + column titles row)
	const dataStartRow = headerRow + 2;

	// Sort entries by horse number
	const sortedEntries = entries.sort((a, b) => {
		const aNum = parseInt(a.horseNumber, 10) || 0;
		const bNum = parseInt(b.horseNumber, 10) || 0;
		return aNum - bNum;
	});

	// Build data array: [Horse Number, ML ODDS, LIVE ODDS, CP3 ODDS, DOUBLE]
	const values = sortedEntries.map(entry => [
		entry.horseNumber || '',
		entry.mlOdds || '',
		entry.liveOdds || '',
		entry.cp3Odds || '',
		entry.double || '',
	]);

	// Clear existing data in race block (up to 16 horses max)
	const maxHorses = RoiHistoricalConfig.MAX_RACE_NUMBER <= 15 ? 16 : 16;
	sheet.getRange(dataStartRow, 1, maxHorses, 5).clearContent();

	// Write new data
	if (values.length > 0) {
		sheet.getRange(dataStartRow, 1, values.length, 5).setValues(values);
	}
}

/**
 * Append/merge race entries to existing race block in TEE sheet
 * Adds new entries without clearing existing ones, avoiding duplicates
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 * @param {number} headerRow - Row number of race header
 * @param {Array<Object>} newEntries - New race entries to add
 */
function appendRaceEntriesToSheet_(sheet, headerRow, newEntries) {
	const dataStartRow = headerRow + 2;

	// Read existing entries in the race block
	const maxHorses = 16;
	const existingRange = sheet.getRange(dataStartRow, 1, maxHorses, 5);
	const existingData = existingRange.getValues();

	// Find existing horse numbers to avoid duplicates
	const existingHorseNumbers = new Set();
	existingData.forEach(row => {
		if (row[0] && row[0] !== '') {
			const horseNum = parseInt(row[0], 10);
			if (!isNaN(horseNum)) {
				existingHorseNumbers.add(horseNum);
			}
		}
	});

	// Filter out entries that already exist
	const entriesToAdd = newEntries.filter(entry => {
		const horseNum = parseInt(entry.horseNumber, 10);
		return horseNum && !isNaN(horseNum) && !existingHorseNumbers.has(horseNum);
	});

	if (entriesToAdd.length === 0) {
		return; // No new entries to add
	}

	// Sort new entries by horse number
	const sortedEntries = entriesToAdd.sort((a, b) => {
		const aNum = parseInt(a.horseNumber, 10) || 0;
		const bNum = parseInt(b.horseNumber, 10) || 0;
		return aNum - bNum;
	});

	// Find first empty row in race block
	let firstEmptyRow = null;
	for (let i = 0; i < existingData.length; i++) {
		if (!existingData[i][0] || existingData[i][0] === '') {
			firstEmptyRow = dataStartRow + i;
			break;
		}
	}

	// If no empty row found, append after existing entries
	if (firstEmptyRow === null) {
		// Find last row with data
		for (let i = existingData.length - 1; i >= 0; i--) {
			if (existingData[i][0] && existingData[i][0] !== '') {
				firstEmptyRow = dataStartRow + i + 1;
				break;
			}
		}
		// If still no row found, start at dataStartRow
		if (firstEmptyRow === null) {
			firstEmptyRow = dataStartRow;
		}
	}

	// Build data array for new entries
	const values = sortedEntries.map(entry => [
		entry.horseNumber || '',
		entry.mlOdds || '',
		entry.liveOdds || '',
		entry.cp3Odds || '',
		entry.double || '',
	]);

	// Write new entries starting at first empty row (only if within race block limits)
	const maxRow = dataStartRow + maxHorses - 1;
	if (firstEmptyRow <= maxRow) {
		const rowsToWrite = Math.min(values.length, maxRow - firstEmptyRow + 1);
		if (rowsToWrite > 0) {
			sheet.getRange(firstEmptyRow, 1, rowsToWrite, 5).setValues(values.slice(0, rowsToWrite));
		}
	}
}

/**
 * Get sheet by name or throw error
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Spreadsheet
 * @param {string} name - Sheet name
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Sheet object
 */
function getSheetOrThrow_(ss, name) {
	const sheet = ss.getSheetByName(name);
	if (!sheet) {
		throw new Error(`Sheet "${name}" not found.`);
	}
	return sheet;
}

