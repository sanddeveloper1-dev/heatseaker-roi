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
 * Daily Totals Sync Script
 * 
 * Simple daily script to sync missing dates from date-named sheets to TOTALS sheet.
 * Checks all date-named sheets (MM/dd/yy format) and appends any missing dates
 * to the TOTALS sheet with formula references.
 * 
 * Run this daily to ensure all processed sheets have corresponding rows in TOTALS.
 */

// Use centralized Config with fallback defaults
// Allows per-file customization by overriding specific properties if needed
const DailyTotalsConfig = {
	// Sheet names from central Config
	TOTALS_SHEET_NAME: Config?.TAB_TOTALS || 'TOTALS',
	TEE_SHEET_NAME: Config?.TAB_TEE || 'TEE',

	// TOTALS configuration from central Config
	TOTALS_START_ROW: Config?.DB_TRACKING?.TOTALS_START_ROW || 11,
	TIMEZONE: Config?.DB_TRACKING?.TIMEZONE || 'America/New_York',

	// Cell references in TEE sheets for totals - from central Config
	TEE_CELL_BET: Config?.DB_TRACKING?.TEE_CELLS?.BET || Config?.DB_TRACKING?.TEE_TOTAL_RANGES?.WIN_BET || 'BI2',
	TEE_CELL_COLLECT: Config?.DB_TRACKING?.TEE_CELLS?.COLLECT || Config?.DB_TRACKING?.TEE_TOTAL_RANGES?.WIN_COLLECT || 'BO1',
	TEE_CELL_BETS: Config?.DB_TRACKING?.TEE_CELLS?.BETS || Config?.DB_TRACKING?.TEE_TOTAL_RANGES?.GP || 'BM2',
	TEE_CELL_WINS: Config?.DB_TRACKING?.TEE_CELLS?.WINS || Config?.DB_TRACKING?.TEE_TOTAL_RANGES?.ROI || 'BN2',

	// TOTALS sheet column indices (0-based) - from central Config
	TOTALS_COL_DATE: Config?.DB_TRACKING?.TOTALS_COLUMNS?.DATE ?? 0,       // Column A: DATES
	TOTALS_COL_BET: Config?.DB_TRACKING?.TOTALS_COLUMNS?.BET ?? 1,         // Column B: BET
	TOTALS_COL_COLLECT: Config?.DB_TRACKING?.TOTALS_COLUMNS?.COLLECT ?? 2, // Column C: COLLECT
	TOTALS_COL_BETS: Config?.DB_TRACKING?.TOTALS_COLUMNS?.BETS ?? 3,       // Column D: BETS
	TOTALS_COL_WINS: Config?.DB_TRACKING?.TOTALS_COLUMNS?.WINS ?? 4,       // Column E: WINS
};

/**
 * Main entry point - syncs missing dates from date-named sheets to TOTALS
 * @returns {Object} Summary of processing
 */
function syncDailyTotals() {
	console.log('🚀 Starting Daily Totals Sync...');

	try {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const totalsSheet = getSheetOrThrow_(ss, DailyTotalsConfig.TOTALS_SHEET_NAME);

		// Get all date-named sheets
		const dateSheets = getDateSheets_(ss);
		console.log(`📊 Found ${dateSheets.length} date-named sheets`);

		if (dateSheets.length === 0) {
			console.log('⚠️ No date-named sheets found');
			return { success: false, error: 'No date-named sheets found' };
		}

		// Get existing dates from TOTALS sheet
		const existingDates = getExistingDates_(totalsSheet);
		console.log(`📋 Found ${existingDates.size} existing dates in TOTALS sheet`);

		// Find missing dates
		const missingDates = [];
		dateSheets.forEach(sheet => {
			const sheetName = sheet.getName();
			if (!existingDates.has(sheetName)) {
				missingDates.push(sheetName);
			}
		});

		console.log(`🔍 Found ${missingDates.length} missing dates`);

		if (missingDates.length === 0) {
			console.log('✅ All dates are already in TOTALS sheet');
			return { success: true, appended: 0, message: 'All dates already synced' };
		}

		// Append missing dates
		const summary = {
			success: true,
			totalSheets: dateSheets.length,
			existingDates: existingDates.size,
			missingDates: missingDates.length,
			appended: 0,
			errors: [],
		};

		// Sort missing dates chronologically (using string comparison)
		missingDates.sort((a, b) => {
			const sortA = sheetNameToSortable_(a);
			const sortB = sheetNameToSortable_(b);
			if (!sortA || !sortB) return 0;
			return sortA.localeCompare(sortB); // String comparison
		});

		// Append each missing date
		for (const sheetName of missingDates) {
			try {
				appendTotalsRow_(ss, totalsSheet, sheetName);
				summary.appended++;
				console.log(`✅ Appended ${sheetName}`);
			} catch (error) {
				summary.errors.push({ date: sheetName, error: error.message });
				console.error(`❌ Error appending ${sheetName}:`, error);
			}
		}

		console.log(`✅ Sync complete. Appended ${summary.appended} dates.`);
		return summary;

	} catch (error) {
		console.error('❌ Fatal error in syncDailyTotals:', error);
		return { success: false, error: error.message };
	}
}

// -----------------------------
// Helper functions
// -----------------------------

/**
 * Get all date-named sheets (MM/dd/yy format)
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Spreadsheet
 * @returns {Array<GoogleAppsScript.Spreadsheet.Sheet>} Array of date-named sheets
 */
function getDateSheets_(ss) {
	const allSheets = ss.getSheets();
	const dateSheets = [];
	const datePattern = /^\d{2}\/\d{2}\/\d{2}$/; // MM/dd/yy format

	const skipNames = [
		DailyTotalsConfig.TOTALS_SHEET_NAME,
		DailyTotalsConfig.TEE_SHEET_NAME,
		'DATABASE',
		'UTILITY',
		'TEMPLATE',
		'RATIO TEMPLATE',
	];

	allSheets.forEach(sheet => {
		const sheetName = sheet.getName();
		if (skipNames.includes(sheetName.toUpperCase())) {
			return;
		}
		if (datePattern.test(sheetName)) {
			dateSheets.push(sheet);
		}
	});

	return dateSheets;
}

/**
 * Get existing dates from TOTALS sheet column A
 * @param {GoogleAppsScript.Spreadsheet.Sheet} totalsSheet - TOTALS sheet
 * @returns {Set<string>} Set of existing date strings
 */
function getExistingDates_(totalsSheet) {
	const existingDates = new Set();
	const startRow = DailyTotalsConfig.TOTALS_START_ROW;
	const lastRow = totalsSheet.getLastRow();

	if (lastRow < startRow) {
		return existingDates;
	}

	// Get all dates from column A
	const dateRange = totalsSheet.getRange(startRow, 1, lastRow - startRow + 1, 1);
	const dateValues = dateRange.getValues();

	dateValues.forEach(row => {
		const dateValue = row[0];
		if (dateValue !== null && dateValue !== undefined && dateValue !== '') {
			let dateStr;
			if (dateValue instanceof Date) {
				dateStr = Utilities.formatDate(dateValue, DailyTotalsConfig.TIMEZONE, 'MM/dd/yy');
			} else {
				dateStr = String(dateValue).trim().replace(/-/g, '/');
			}
			existingDates.add(dateStr);
		}
	});

	return existingDates;
}

/**
 * Convert MM/dd/yy string to YYYYMMDD for sorting (pure string operation)
 * @param {string} sheetName - Sheet name in MM/dd/yy format
 * @returns {string|null} YYYYMMDD format string or null if invalid
 */
function sheetNameToSortable_(sheetName) {
	try {
		const parts = sheetName.split('/');
		if (parts.length !== 3) return null;

		const month = parts[0].padStart(2, '0');
		const day = parts[1].padStart(2, '0');
		let year = parts[2];

		// Convert 2-digit year to 4-digit (assume 2000-2099 range)
		if (year.length === 2) {
			year = '20' + year;
		} else if (year.length !== 4) {
			return null; // Invalid year format
		}

		return year + month + day; // Returns "YYYYMMDD" as string
	} catch (error) {
		return null;
	}
}

/**
 * Find the last row with data in column A only
 * @param {GoogleAppsScript.Spreadsheet.Sheet} totalsSheet - TOTALS sheet
 * @returns {number} Last row number with data in column A
 */
function findLastRowInColumnA_(totalsSheet) {
	const startRow = DailyTotalsConfig.TOTALS_START_ROW;
	const lastRow = totalsSheet.getLastRow();

	if (lastRow < startRow) {
		return startRow - 1;
	}

	// Check column A from startRow to lastRow
	const dateRange = totalsSheet.getRange(startRow, 1, lastRow - startRow + 1, 1);
	const dateValues = dateRange.getValues();

	// Find the last non-empty row in column A
	for (let i = dateValues.length - 1; i >= 0; i--) {
		const cellValue = dateValues[i][0];
		if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
			return startRow + i;
		}
	}

	return startRow - 1;
}

/**
 * Append a totals row with formulas for a specific date sheet
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Spreadsheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} totalsSheet - TOTALS sheet
 * @param {string} sheetName - Name of the date sheet (e.g., "01/01/24")
 */
function appendTotalsRow_(ss, totalsSheet, sheetName) {
	// Verify the sheet exists before creating formulas
	const dateSheet = ss.getSheetByName(sheetName);
	if (!dateSheet) {
		throw new Error(`Sheet "${sheetName}" does not exist - cannot create formula references`);
	}

	// Find next available row based on column A
	const lastDataRow = findLastRowInColumnA_(totalsSheet);
	const nextRow = Math.max(lastDataRow + 1, DailyTotalsConfig.TOTALS_START_ROW);

	// Escape sheet name for formula (wrap in single quotes)
	const escapedSheetName = `'${sheetName}'`;

	// Set Column A with date string (plain text)
	const dateCell = totalsSheet.getRange(nextRow, DailyTotalsConfig.TOTALS_COL_DATE + 1);
	dateCell.setNumberFormat('@'); // Plain text format
	dateCell.setValue(sheetName);

	// Set Columns B-E with formulas referencing the date sheet cells
	const betFormula = `=${escapedSheetName}!${DailyTotalsConfig.TEE_CELL_BET}`;
	const collectFormula = `=${escapedSheetName}!${DailyTotalsConfig.TEE_CELL_COLLECT}`;
	const betsFormula = `=${escapedSheetName}!${DailyTotalsConfig.TEE_CELL_BETS}`;
	const winsFormula = `=${escapedSheetName}!${DailyTotalsConfig.TEE_CELL_WINS}`;

	const betCell = totalsSheet.getRange(nextRow, DailyTotalsConfig.TOTALS_COL_BET + 1);
	const collectCell = totalsSheet.getRange(nextRow, DailyTotalsConfig.TOTALS_COL_COLLECT + 1);
	const betsCell = totalsSheet.getRange(nextRow, DailyTotalsConfig.TOTALS_COL_BETS + 1);
	const winsCell = totalsSheet.getRange(nextRow, DailyTotalsConfig.TOTALS_COL_WINS + 1);

	// Clear cells first to remove any existing values/formats
	betCell.clear();
	collectCell.clear();
	betsCell.clear();
	winsCell.clear();

	// Set number formats BEFORE setting formulas
	// Columns B and C (BET and COLLECT) use currency format
	betCell.setNumberFormat('$#,##0.00');
	collectCell.setNumberFormat('$#,##0.00');
	// Columns D and E (BETS and WINS) use number format
	betsCell.setNumberFormat('0');
	winsCell.setNumberFormat('0');

	// Use setValue() with formula string - Google Sheets treats values starting with "=" as formulas
	// This is more reliable than setFormula() in some edge cases
	betCell.setValue(betFormula);
	collectCell.setValue(collectFormula);
	betsCell.setValue(betsFormula);
	winsCell.setValue(winsFormula);

	// Apply formatting to columns B-E (BET, COLLECT, BETS, WINS)
	// Get range for all four columns at once for efficiency
	const formatRange = totalsSheet.getRange(
		nextRow,
		DailyTotalsConfig.TOTALS_COL_BET + 1,
		1,
		4 // 4 columns: B, C, D, E
	);

	// Apply formatting: gray background, bold font, center alignment, Arial 11
	formatRange.setBackground('#d9d9d9'); // Light gray background
	formatRange.setFontWeight('bold');
	formatRange.setHorizontalAlignment('center');
	formatRange.setFontFamily('Arial');
	formatRange.setFontSize(11);

	// Force flush to ensure writes are committed
	SpreadsheetApp.flush();

	// Verify formulas were set correctly
	const verifyBet = betCell.getFormula();
	if (!verifyBet || !verifyBet.startsWith('=')) {
		throw new Error(`Failed to set BET formula for ${sheetName}. Expected formula starting with "=", got "${verifyBet}"`);
	}

	console.log(`  ✓ Appended totals row for ${sheetName} at row ${nextRow}`);
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

