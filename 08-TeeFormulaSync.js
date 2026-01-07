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
 * TEE Formula Sync Script
 * 
 * Syncs formula changes from TEE template sheet to all dated sheets (MM/dd/yy format).
 * Only updates formulas, preserving all data values in dated sheets.
 * 
 * Features:
 * - Detects all formulas in TEE sheet
 * - Updates only formula cells in dated sheets (preserves data)
 * - Resume capability using progress tracking to handle 6-minute execution limit
 * - Batch processing for performance
 * - Skips already-synced sheets when resuming
 * - FAST column-specific sync when you know which column(s) changed
 * 
 * Usage:
 *   syncTeeFormulasColumn('Z') - Fast: Sync only column Z from TEE to all dated sheets
 *   syncTeeFormulasColumn(['Z', 'AA']) - Fast: Sync multiple columns
 *   syncTeeFormulasColumn(26) - Fast: Can also use column number (Z = 26)
 *   syncTeeFormulas() - Full sync: Sync all formulas from TEE to all dated sheets
 *   clearTeeFormulaSyncProgress() - Reset progress tracking (allows full re-sync)
 * 
 * Performance:
 * - Column sync: Very fast, typically completes in < 1 minute even with 200+ sheets
 * - Full sync: May take multiple runs with 100+ sheets; uses resume capability
 */

// Use centralized Config with fallback defaults
const TeeFormulaSyncConfig = {
	// Sheet names from central Config
	TEE_SHEET_NAME: Config?.TAB_TEE || 'TEE',

	// Progress tracking cell from central Config
	PROGRESS_CELL: Config?.DB_TRACKING?.TEE_FORMULA_SYNC_PROGRESS_CELL || 'BS1',

	// Performance settings
	MAX_EXECUTION_TIME_MS: 5.5 * 60 * 1000, // 5.5 minutes (leave buffer before 6 min limit)
	BATCH_SIZE: 50, // Number of formula cells to process in each batch
};

/**
 * Fast sync for specific column(s) - Use this when you know exactly which column changed
 * Much faster than full sync since it only processes one or a few columns
 * 
 * @param {string|number|Array<string|number>} columns - Column(s) to sync. Can be:
 *   - Column letter(s): 'A', 'B', 'C' or ['A', 'B', 'C']
 *   - Column number(s): 1, 2, 3 or [1, 2, 3]
 *   - Mixed: ['A', 2, 'C']
 * @returns {Object} Summary of processing
 */
function syncTeeFormulasColumn(columns) {
	const startTime = Date.now();
	console.log('🚀 Starting TEE Formula Sync (Column-specific)...');

	if (!columns) {
		return { success: false, error: 'No columns specified. Use syncTeeFormulas() for full sync.' };
	}

	try {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const teeSheet = getSheetOrThrow_(ss, TeeFormulaSyncConfig.TEE_SHEET_NAME);

		// Convert column(s) to column numbers
		const columnNumbers = normalizeColumns_(columns);
		console.log(`📋 Syncing column(s): ${columnNumbers.map(c => columnNumberToLetter_(c)).join(', ')}`);

		// Get all dated sheets
		const dateSheets = getDateSheets_(ss);
		console.log(`📊 Found ${dateSheets.length} dated sheets`);

		if (dateSheets.length === 0) {
			console.log('⚠️ No dated sheets found');
			return { success: false, error: 'No dated sheets found' };
		}

		// Extract formulas from specified column(s) in TEE
		console.log('📋 Extracting formulas from specified column(s) in TEE template...');
		const teeFormulas = extractFormulasFromColumns_(teeSheet, columnNumbers);
		console.log(`✓ Found ${teeFormulas.length} formula cells in specified column(s)`);

		if (teeFormulas.length === 0) {
			console.log('⚠️ No formulas found in specified column(s) in TEE sheet');
			return { success: false, error: 'No formulas found in specified column(s)' };
		}

		const summary = {
			totalSheets: dateSheets.length,
			processedSheets: 0,
			updatedCells: 0,
			errors: [],
			columns: columnNumbers.map(c => columnNumberToLetter_(c)),
		};

		// Process all sheets (column sync is fast, no need for progress tracking)
		for (const sheet of dateSheets) {
			// Check execution time limit
			const elapsed = Date.now() - startTime;
			if (elapsed >= TeeFormulaSyncConfig.MAX_EXECUTION_TIME_MS) {
				console.log(`⏱️ Time limit approaching. Processed ${summary.processedSheets} sheets. Stopping.`);
				summary.message = 'Time limit reached. Run syncTeeFormulasColumn() again to continue.';
				break;
			}

			const sheetName = sheet.getName();

			try {
				// Fast column update - single batch operation per column
				const result = updateColumnsInSheet_(sheet, teeFormulas, columnNumbers);

				summary.processedSheets++;
				summary.updatedCells += result.updated;
				console.log(`✅ Synced ${sheetName}: ${result.updated} formulas updated`);
			} catch (error) {
				summary.errors.push({ sheet: sheetName, error: error.message });
				console.error(`❌ Error syncing ${sheetName}:`, error);
			}
		}

		if (summary.processedSheets === summary.totalSheets) {
			console.log('✅ All sheets synced successfully!');
			summary.message = 'All sheets synced successfully!';
		}

		console.log(`✅ Column sync complete. Summary:`, summary);
		return summary;

	} catch (error) {
		console.error('❌ Fatal error in syncTeeFormulasColumn:', error);
		return { success: false, error: error.message };
	}
}

/**
 * Main entry point - Syncs formulas from TEE template to all dated sheets
 * Resumes from last position if interrupted by execution time limit
 * 
 * For faster sync when you know which column changed, use syncTeeFormulasColumn(column)
 * 
 * @returns {Object} Summary of processing
 */
function syncTeeFormulas() {
	const startTime = Date.now();
	console.log('🚀 Starting TEE Formula Sync...');

	try {
		const ss = SpreadsheetApp.getActiveSpreadsheet();
		const teeSheet = getSheetOrThrow_(ss, TeeFormulaSyncConfig.TEE_SHEET_NAME);

		// Get all dated sheets
		const dateSheets = getDateSheets_(ss);
		console.log(`📊 Found ${dateSheets.length} dated sheets`);

		if (dateSheets.length === 0) {
			console.log('⚠️ No dated sheets found');
			return { success: false, error: 'No dated sheets found' };
		}

		// Check if there's an ongoing sync (progress tracking)
		const progressInfo = getProgressInfo_(teeSheet);
		const isResuming = progressInfo.isInProgress;

		if (isResuming) {
			console.log(`♻️ Resuming previous sync (started at ${progressInfo.startTime})`);
		} else {
			console.log('🆕 Starting new sync');
			// Mark sync as in progress
			markSyncInProgress_(teeSheet);
		}

		// Get all formulas from TEE sheet (one-time operation)
		console.log('📋 Extracting formulas from TEE template...');
		const teeFormulas = extractFormulasFromSheet_(teeSheet);
		console.log(`✓ Found ${teeFormulas.length} formula cells in TEE sheet`);

		if (teeFormulas.length === 0) {
			console.log('⚠️ No formulas found in TEE sheet');
			clearSyncProgress_(teeSheet);
			return { success: false, error: 'No formulas found in TEE sheet' };
		}

		// Filter out sheets that were already processed (if resuming)
		const sheetsToProcess = isResuming
			? dateSheets.filter(sheet => !isSheetSynced_(sheet, progressInfo.startTime))
			: dateSheets;

		console.log(`📝 Processing ${sheetsToProcess.length} sheets (${dateSheets.length - sheetsToProcess.length} already synced)`);

		// Process sheets
		const summary = {
			totalSheets: dateSheets.length,
			processedSheets: 0,
			skippedSheets: dateSheets.length - sheetsToProcess.length,
			updatedCells: 0,
			errors: [],
		};

		for (let i = 0; i < sheetsToProcess.length; i++) {
			// Check execution time limit
			const elapsed = Date.now() - startTime;
			if (elapsed >= TeeFormulaSyncConfig.MAX_EXECUTION_TIME_MS) {
				console.log(`⏱️ Time limit approaching. Processed ${summary.processedSheets} sheets. Stopping.`);
				summary.message = 'Time limit reached. Run syncTeeFormulas() again to resume.';
				break;
			}

			const sheet = sheetsToProcess[i];
			const sheetName = sheet.getName();

			try {
				// Update formulas in this sheet (in batches for performance)
				const result = updateFormulasInSheet_(sheet, teeFormulas);

				// Mark sheet as synced
				markSheetAsSynced_(sheet, progressInfo.startTime);

				summary.processedSheets++;
				summary.updatedCells += result.updated;
				console.log(`✅ Synced ${sheetName}: ${result.updated} formulas updated`);
			} catch (error) {
				summary.errors.push({ sheet: sheetName, error: error.message });
				console.error(`❌ Error syncing ${sheetName}:`, error);
				// Don't mark as synced if there was an error (will retry on next run)
			}
		}

		// If all sheets are processed, clear progress tracking
		if (summary.processedSheets === sheetsToProcess.length) {
			clearSyncProgress_(teeSheet);
			console.log('✅ All sheets synced successfully!');
			summary.message = 'All sheets synced successfully!';
		} else {
			console.log(`⏸️ Sync paused. ${summary.processedSheets}/${sheetsToProcess.length} sheets completed.`);
		}

		console.log(`✅ Sync complete. Summary:`, summary);
		return summary;

	} catch (error) {
		console.error('❌ Fatal error in syncTeeFormulas:', error);
		return { success: false, error: error.message };
	}
}

/**
 * Clear progress tracking - allows full re-sync of all sheets
 * WARNING: This will reset progress tracking, causing all sheets to be re-processed on next sync
 */
function clearTeeFormulaSyncProgress() {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const teeSheet = getSheetOrThrow_(ss, TeeFormulaSyncConfig.TEE_SHEET_NAME);

	clearSyncProgress_(teeSheet);

	// Also clear sync flags from all dated sheets
	const dateSheets = getDateSheets_(ss);
	let clearedCount = 0;

	dateSheets.forEach(sheet => {
		try {
			clearSheetSyncFlag_(sheet);
			clearedCount++;
		} catch (error) {
			console.error(`Error clearing flag for ${sheet.getName()}:`, error);
		}
	});

	console.log(`✅ Cleared progress tracking. ${clearedCount} sheet flags cleared. Next sync will process all sheets.`);
	return { success: true, sheetsCleared: clearedCount };
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
		Config?.TAB_TOTALS || 'TOTALS',
		TeeFormulaSyncConfig.TEE_SHEET_NAME,
		Config?.TAB_DATABASE || 'DATABASE',
		Config?.TAB_UTILITY || 'UTILITY',
		Config?.TAB_TEMPLATE || 'TEMPLATE',
		Config?.TAB_RATIO_TEMPLATE || 'RATIO TEMPLATE',
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
 * Extract all formulas and their cell addresses from a sheet
 * Returns array of {row, col, formula, address} objects
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet to extract formulas from
 * @returns {Array<Object>} Array of formula objects
 */
function extractFormulasFromSheet_(sheet) {
	const formulas = [];
	const lastRow = sheet.getLastRow();
	const lastCol = sheet.getLastColumn();

	if (lastRow === 0 || lastCol === 0) {
		return formulas;
	}

	// Read all formulas at once (more efficient than cell-by-cell)
	const formulaRange = sheet.getRange(1, 1, lastRow, lastCol);
	const formulaValues = formulaRange.getFormulas();

	// Also get cell addresses for easier reference
	for (let row = 0; row < formulaValues.length; row++) {
		for (let col = 0; col < formulaValues[row].length; col++) {
			const formula = formulaValues[row][col];
			// Only include cells that have formulas (non-empty strings starting with =)
			if (formula && typeof formula === 'string' && formula.trim() !== '' && formula.startsWith('=')) {
				const cellAddress = sheet.getRange(row + 1, col + 1).getA1Notation();
				formulas.push({
					row: row + 1,
					col: col + 1,
					formula: formula,
					address: cellAddress,
				});
			}
		}
	}

	return formulas;
}

/**
 * Update formulas in a target sheet to match TEE template formulas
 * Only updates cells that have formulas in TEE (preserves data cells)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} targetSheet - Sheet to update
 * @param {Array<Object>} teeFormulas - Array of formula objects from TEE
 * @returns {Object} Result with updated count
 */
function updateFormulasInSheet_(targetSheet, teeFormulas) {
	let updated = 0;

	// Group formulas by row for more efficient batch updates
	const formulasByRow = {};
	teeFormulas.forEach(formula => {
		if (!formulasByRow[formula.row]) {
			formulasByRow[formula.row] = [];
		}
		formulasByRow[formula.row].push(formula);
	});

	// Process each row
	const rows = Object.keys(formulasByRow).map(r => parseInt(r, 10)).sort((a, b) => a - b);

	for (const row of rows) {
		const rowFormulas = formulasByRow[row].sort((a, b) => a.col - b.col);

		// Group consecutive columns for batch updates
		let i = 0;
		while (i < rowFormulas.length) {
			const startCol = rowFormulas[i].col;
			const formulasToSet = [rowFormulas[i].formula];
			let batchEnd = i;

			// Find consecutive columns with formulas
			for (let j = i + 1; j < rowFormulas.length; j++) {
				const expectedCol = startCol + (j - i);
				if (rowFormulas[j].col === expectedCol) {
					formulasToSet.push(rowFormulas[j].formula);
					batchEnd = j;
				} else {
					// Non-consecutive column, end current batch
					break;
				}
			}

			// Apply batch update
			if (formulasToSet.length === 1) {
				// Single cell update
				try {
					targetSheet.getRange(row, startCol).setFormula(formulasToSet[0]);
					updated++;
				} catch (error) {
					console.error(`Error updating cell row ${row}, col ${startCol}:`, error);
				}
			} else {
				// Multi-cell range update (more efficient)
				try {
					const range = targetSheet.getRange(row, startCol, 1, formulasToSet.length);
					// setFormulas expects a 2D array (rows x cols)
					range.setFormulas([formulasToSet]);
					updated += formulasToSet.length;
				} catch (error) {
					console.error(`Error updating range row ${row}, cols ${startCol}-${startCol + formulasToSet.length - 1}:`, error);
					// Fallback to individual updates if batch fails
					for (let k = 0; k < formulasToSet.length; k++) {
						try {
							targetSheet.getRange(row, startCol + k).setFormula(formulasToSet[k]);
							updated++;
						} catch (err) {
							console.error(`Error updating cell row ${row}, col ${startCol + k}:`, err);
						}
					}
				}
			}

			// Move to next batch
			i = batchEnd + 1;
		}
	}

	return { updated };
}

/**
 * Get progress tracking information from TEE sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} teeSheet - TEE sheet
 * @returns {Object} Progress info object
 */
function getProgressInfo_(teeSheet) {
	try {
		const progressCell = teeSheet.getRange(TeeFormulaSyncConfig.PROGRESS_CELL);
		const progressValue = progressCell.getValue();

		if (!progressValue || progressValue === '' || progressValue === false) {
			return { isInProgress: false, startTime: null };
		}

		// Progress value is a timestamp (Date object or timestamp string)
		let startTime;
		if (progressValue instanceof Date) {
			startTime = progressValue.getTime();
		} else if (typeof progressValue === 'number') {
			startTime = progressValue;
		} else if (typeof progressValue === 'string') {
			startTime = parseFloat(progressValue);
		} else {
			return { isInProgress: false, startTime: null };
		}

		return {
			isInProgress: true,
			startTime: startTime,
		};
	} catch (error) {
		// If cell doesn't exist or error, assume no progress
		return { isInProgress: false, startTime: null };
	}
}

/**
 * Mark sync as in progress in TEE sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} teeSheet - TEE sheet
 */
function markSyncInProgress_(teeSheet) {
	try {
		const progressCell = teeSheet.getRange(TeeFormulaSyncConfig.PROGRESS_CELL);
		progressCell.setValue(new Date().getTime()); // Store timestamp
	} catch (error) {
		console.error('Error marking sync in progress:', error);
	}
}

/**
 * Clear sync progress from TEE sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} teeSheet - TEE sheet
 */
function clearSyncProgress_(teeSheet) {
	try {
		const progressCell = teeSheet.getRange(TeeFormulaSyncConfig.PROGRESS_CELL);
		progressCell.clearContent();
	} catch (error) {
		console.error('Error clearing sync progress:', error);
	}
}

/**
 * Check if a sheet has been synced in the current sync session
 * Uses a sync flag cell (BS2) to track completion
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet to check
 * @param {number} syncStartTime - Timestamp when sync started
 * @returns {boolean} True if sheet is already synced
 */
function isSheetSynced_(sheet, syncStartTime) {
	try {
		const syncFlagCell = sheet.getRange('BS2'); // Use BS2 for sync flag
		const flagValue = syncFlagCell.getValue();

		if (!flagValue || flagValue === '' || flagValue === false) {
			return false;
		}

		// Check if flag matches current sync session timestamp
		let flagTime;
		if (flagValue instanceof Date) {
			flagTime = flagValue.getTime();
		} else if (typeof flagValue === 'number') {
			flagTime = flagValue;
		} else if (typeof flagValue === 'string') {
			flagTime = parseFloat(flagValue);
		} else {
			return false;
		}

		return flagTime === syncStartTime;
	} catch (error) {
		// If cell doesn't exist or error, assume not synced
		return false;
	}
}

/**
 * Mark a sheet as synced in the current sync session
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet to mark
 * @param {number} syncStartTime - Timestamp when sync started
 */
function markSheetAsSynced_(sheet, syncStartTime) {
	try {
		const syncFlagCell = sheet.getRange('BS2'); // Use BS2 for sync flag
		syncFlagCell.setValue(syncStartTime);
	} catch (error) {
		console.error(`Error marking sheet ${sheet.getName()} as synced:`, error);
	}
}

/**
 * Clear sync flag from a sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet to clear flag from
 */
function clearSheetSyncFlag_(sheet) {
	try {
		const syncFlagCell = sheet.getRange('BS2');
		syncFlagCell.clearContent();
	} catch (error) {
		console.error(`Error clearing sync flag from ${sheet.getName()}:`, error);
	}
}

/**
 * Normalize column input to array of column numbers
 * Handles: 'A', 1, ['A', 'B'], [1, 2], or mixed
 * @param {string|number|Array<string|number>} columns - Column(s) to normalize
 * @returns {Array<number>} Array of column numbers (1-based)
 */
function normalizeColumns_(columns) {
	if (!columns) {
		return [];
	}

	// Convert to array if single value
	const colsArray = Array.isArray(columns) ? columns : [columns];

	return colsArray.map(col => {
		if (typeof col === 'number') {
			return col;
		}
		if (typeof col === 'string') {
			// Convert column letter to number (A=1, B=2, ..., Z=26, AA=27, etc.)
			let result = 0;
			for (let i = 0; i < col.length; i++) {
				result = result * 26 + (col.toUpperCase().charCodeAt(i) - 64);
			}
			return result;
		}
		throw new Error(`Invalid column format: ${col}`);
	}).filter((v, i, self) => self.indexOf(v) === i); // Remove duplicates
}

/**
 * Convert column number to column letter (1 -> A, 2 -> B, ..., 27 -> AA, etc.)
 * @param {number} columnNumber - Column number (1-based)
 * @returns {string} Column letter
 */
function columnNumberToLetter_(columnNumber) {
	let result = '';
	let num = columnNumber;
	while (num > 0) {
		const remainder = (num - 1) % 26;
		result = String.fromCharCode(65 + remainder) + result;
		num = Math.floor((num - 1) / 26);
	}
	return result;
}

/**
 * Extract formulas from specific columns only (optimized for column sync)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet to extract formulas from
 * @param {Array<number>} columnNumbers - Array of column numbers (1-based) to extract
 * @returns {Array<Object>} Array of formula objects
 */
function extractFormulasFromColumns_(sheet, columnNumbers) {
	const formulas = [];
	const lastRow = sheet.getLastRow();

	if (lastRow === 0) {
		return formulas;
	}

	// Process each column
	for (const colNum of columnNumbers) {
		// Read entire column at once (much faster than cell-by-cell)
		const columnRange = sheet.getRange(1, colNum, lastRow, 1);
		const columnFormulas = columnRange.getFormulas();

		// Extract formulas from this column
		for (let row = 0; row < columnFormulas.length; row++) {
			const formula = columnFormulas[row][0];
			if (formula && typeof formula === 'string' && formula.trim() !== '' && formula.startsWith('=')) {
				const cellAddress = sheet.getRange(row + 1, colNum).getA1Notation();
				formulas.push({
					row: row + 1,
					col: colNum,
					formula: formula,
					address: cellAddress,
				});
			}
		}
	}

	return formulas;
}

/**
 * Fast column update - updates entire column(s) efficiently
 * Only updates cells that have formulas in TEE, preserving data cells
 * @param {GoogleAppsScript.Spreadsheet.Sheet} targetSheet - Sheet to update
 * @param {Array<Object>} teeFormulas - Array of formula objects from TEE (filtered to specific columns)
 * @param {Array<number>} columnNumbers - Column numbers being updated
 * @returns {Object} Result with updated count
 */
function updateColumnsInSheet_(targetSheet, teeFormulas, columnNumbers) {
	let updated = 0;

	// Group formulas by column
	const formulasByColumn = {};
	teeFormulas.forEach(formula => {
		if (!formulasByColumn[formula.col]) {
			formulasByColumn[formula.col] = [];
		}
		formulasByColumn[formula.col].push(formula);
	});

	// Update each column
	for (const colNum of columnNumbers) {
		const columnFormulas = formulasByColumn[colNum] || [];

		if (columnFormulas.length === 0) {
			continue; // No formulas in this column
		}

		// Sort by row
		columnFormulas.sort((a, b) => a.row - b.row);

		// Group consecutive rows for batch updates
		let i = 0;
		while (i < columnFormulas.length) {
			const batchStart = columnFormulas[i].row;
			const batchFormulas = [columnFormulas[i].formula];
			let batchEnd = batchStart;

			// Find consecutive rows
			for (let j = i + 1; j < columnFormulas.length; j++) {
				if (columnFormulas[j].row === batchEnd + 1) {
					batchFormulas.push(columnFormulas[j].formula);
					batchEnd = columnFormulas[j].row;
				} else {
					break;
				}
			}

			// Update this batch in one operation
			try {
				if (batchFormulas.length === 1) {
					targetSheet.getRange(batchStart, colNum).setFormula(batchFormulas[0]);
				} else {
					const batchRange = targetSheet.getRange(batchStart, colNum, batchFormulas.length, 1);
					batchRange.setFormulas(batchFormulas.map(f => [f])); // Convert to 2D array
				}
				updated += batchFormulas.length;
			} catch (error) {
				console.error(`Error updating column ${columnNumberToLetter_(colNum)} rows ${batchStart}-${batchEnd}:`, error);
				// Fallback to individual updates
				for (let k = 0; k < batchFormulas.length; k++) {
					try {
						targetSheet.getRange(batchStart + k, colNum).setFormula(batchFormulas[k]);
						updated++;
					} catch (err) {
						console.error(`Error updating cell row ${batchStart + k}, col ${colNum}:`, err);
					}
				}
			}

			// Move to next batch (skip processed rows)
			i += batchFormulas.length;
		}
	}

	return { updated };
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

