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
 * Daily Data Ingestion System
 * Updated - 1/15/25
 * 
 * Handles daily race data ingestion from Google Sheets to backend API
 */

/**
 * @typedef {Object} DailyRaceDataRequest
 * @property {string} source - Source identifier
 * @property {RaceData[]} races - Array of race data
 * @property {Object.<string, RaceWinnerData>} race_winners - Object with race_id as key and winner data as value
 */

/**
 * @typedef {Object} RaceData
 * @property {string} race_id - Format: "TRACK_NAME MM-DD-YY Race N"
 * @property {string} track - Track name
 * @property {string} date - Format: "MM-DD-YY"
 * @property {string|number} race_number - 1-15
 * @property {string} [post_time] - Format: "1:13:00 PM"
 * @property {RaceEntryData[]} entries - Array of race entries
 */

/**
 * @typedef {Object} RaceEntryData
 * @property {number} horse_number - 1-16
 * @property {number|null} [double] - Double value
 * @property {number|null} [constant] - Constant value
 * @property {string|null} [p3] - Can be 'FALSE' or numeric string
 * @property {number|null} [correct_p3] - Numeric value
 * @property {number|null} [ml] - Morning line odds
 * @property {number|null} [live_odds] - Live odds
 * @property {string|null} [sharp_percent] - e.g., "103.60%"
 * @property {number|string|null} [action] - Action value (can be 'FALSE')
 * @property {number|null} [double_delta] - Double delta
 * @property {number|null} [p3_delta] - P3 delta
 * @property {number|null} [x_figure] - X figure
 * @property {string|null} [will_pay_2] - $2 Will Pay (formatted as "$X,XXX.XX")
 * @property {string|null} [will_pay] - Additional Will Pay (formatted as "$X,XXX.XX")
 * @property {string|null} [will_pay_1_p3] - $1 P3 Will Pay (formatted as "$X,XXX.XX")
 * @property {string|null} [win_pool] - Win pool total (formatted as "$X,XXX.XX")
 * @property {string|null} [veto_rating] - Veto rating / lift (formatted as "X.X")
 * @property {string|null} [raw_data] - Raw data string
 */

/**
 * @typedef {Object} RaceWinnerData
 * @property {string} race_id - Format: "TRACK_NAME MM-DD-YY Race N"
 * @property {number} winning_horse_number - 1-16
 * @property {number} winning_payout_2_dollar - $2 payout amount (NUMERIC)
 * @property {number} [winning_payout_1_p3] - $1 P3 payout amount (NUMERIC, optional)
 * @property {string} [extraction_method] - Method: 'simple_correct', 'header', 'summary', 'cross_reference'
 * @property {string} [extraction_confidence] - Confidence: 'high', 'medium', 'low'
 */

// Configuration
const DataIngestionConfig = {
	API_URL: Config.DATA_INGESTION_API_URL,
	SOURCE_IDENTIFIER: Config.DATA_INGESTION_SOURCE,
	INVALID_VALUES: ['SC', 'N/A', '#VALUE!', '#DIV/0!', 'FALSE', ''],
	RACE_NUMBER_MIN: Config.RACE_NUMBER_MIN,
	RACE_NUMBER_MAX: Config.RACE_NUMBER_MAX,
	HORSE_NUMBER_MIN: Config.HORSE_NUMBER_MIN,
	HORSE_NUMBER_MAX: Config.HORSE_NUMBER_MAX,
	MIN_ENTRIES: Config.MIN_ENTRIES_PER_RACE,
	RACE_ROWS: [48, 71, 94, 117, 140, 163, 186, 209, 232, 255, 278, 301, 324],
	DATA_ROWS: [50, 73, 96, 119, 142, 165, 188, 211, 234, 257, 280, 303, 326],
	// Column mappings for entry fields (0-indexed)
	ENTRY_COLUMNS: {
		double: 1,        // B
		constant: 2,      // C
		p3: 3,            // D
		correct_p3: 4,    // E
		live_odds: 5,    // F
		sharp_action: 6, // G
		ml: 7,           // H
		double_delta: 8, // I
		p3_delta: 9,     // J
		x_figure: 10,   // K
		will_pay_2: 11,  // L
		will_pay: 12,    // M
		will_pay_1_p3: 13, // N
		win_pool: 15,    // P
		veto_rating: 16  // Q
	}
};

// Error values that should be preserved as strings (kept for backward compatibility)
// Note: Main data cleaning now uses utility functions with INVALID_VALUES constant
const ERROR_VALUES = ['#DIV/0!', '#VALUE!', '#N/A', '#REF!', '#NAME?', '#NUM!'];

/**
 * Main function to ingest daily race data from all active sheets
 */
function ingestDailyRaceData() {
	console.log('🚀 Starting daily race data ingestion...');

	try {
		const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
		const allRacesData = [];
		const allRaceIds = [];

		for (const sheet of sheets) {
			const sheetName = sheet.getName();

			// Skip utility and template sheets
			if (['UTILITY', 'TEMPLATE', 'RATIO TEMPLATE'].includes(sheetName)) {
				console.log(`⏭️ Skipping template/utility sheet: ${sheetName}`);
				continue;
			}

			console.log(`📊 Processing sheet: ${sheetName}`);
			const result = extractRaceDataFromSheet(sheet);

			if (result?.races?.length > 0) {
				allRacesData.push(...result.races);
				allRaceIds.push(...result.raceIds);
				console.log(`✅ Extracted ${result.races.length} races from ${sheetName}`);
			} else {
				console.log(`⚠️ No valid race data found in ${sheetName}`);
			}
		}

		if (allRacesData.length === 0) {
			console.log('❌ No race data found to ingest');
			return { success: false, error: 'No race data found' };
		}

		console.log('🏆 Extracting race winners...');
		const raceWinners = extractRaceWinnersFromAllSheets(sheets, allRaceIds);

		const requestData = {
			source: DataIngestionConfig.SOURCE_IDENTIFIER,
			races: allRacesData,
			race_winners: raceWinners
		};

		console.log(`📤 Sending ${allRacesData.length} races and ${Object.keys(raceWinners).length} winners to backend...`);
		return sendDataToBackend(requestData);

	} catch (error) {
		console.error('❌ Error during data ingestion:', error);
		return { success: false, error: error.message };
	}
}

/**
 * Extract race data from a single sheet
 */
function extractRaceDataFromSheet(sheet) {
	const races = [];
	const raceIds = [];

	try {
		// Check if this sheet has valid race data for today
		const eventDate = sheet.getRange(2, 28).getValue();
		const todaysDate = sheet.getRange(3, 28).getValue();

		if (!eventDate || eventDate === '' ||
			eventDate.toLocaleString('en-US', { timeZone: 'America/New_York' }).slice(0, 10) !==
			todaysDate.toLocaleString('en-US', { timeZone: 'America/New_York' }).slice(0, 10)) {
			console.log(`⚠️ Skipping sheet ${sheet.getName()} - no race today`);
			return { races, raceIds };
		}

		const trackName = sheet.getRange("E1").getValue();
		if (!trackName) {
			console.log('⚠️ No track name found in sheet');
			return { races, raceIds };
		}

		const formattedDate = formatDateForAPI(eventDate);
		if (!formattedDate) {
			console.log('⚠️ Could not format event date');
			return { races, raceIds };
		}

		// Process each race
		for (let i = 0; i < DataIngestionConfig.RACE_ROWS.length; i++) {
			const raceRow = DataIngestionConfig.RACE_ROWS[i];
			const raceNumber = sheet.getRange(raceRow, 1).getValue();

			if (!raceNumber?.toString().includes('RACE')) continue;

			const raceNum = raceNumber.toString().replace('RACE ', '').trim();
			const raceNumInt = parseInt(raceNum);

			if (isNaN(raceNumInt) || raceNumInt < DataIngestionConfig.RACE_NUMBER_MIN ||
				raceNumInt > DataIngestionConfig.RACE_NUMBER_MAX) {
				console.log(`⚠️ Invalid race number: ${raceNum}`);
				continue;
			}

			const postTimeStr = sheet.getRange(raceRow, 10).getDisplayValue();
			const postTime = postTimeStr || null;

			const entries = extractRaceEntries(sheet, DataIngestionConfig.DATA_ROWS[i]);
			if (entries.length < DataIngestionConfig.MIN_ENTRIES) {
				console.log(`⚠️ Race ${raceNum} has insufficient entries: ${entries.length}`);
				continue;
			}

			const raceId = `${trackName} ${formattedDate} Race ${raceNum.padStart(2, '0')}`;
			races.push({
				race_id: raceId,
				track: trackName,
				date: formattedDate,
				race_number: raceNum,
				post_time: postTime,
				entries: entries
			});
			raceIds.push(raceId);
			console.log(`✅ Processed Race ${raceNum} with ${entries.length} entries`);
		}

	} catch (error) {
		console.error(`❌ Error extracting data from sheet ${sheet.getName()}:`, error);
	}

	return { races, raceIds };
}

/**
 * Extract race entries from a specific data row
 * Uses robust data cleaning functions from utility functions
 */
function extractRaceEntries(sheet, dataRow) {
	const entries = [];

	try {
		const entriesRange = sheet.getRange(dataRow, 1, 16, 20);
		const entryValues = entriesRange.getValues();
		const entryDisplayValues = entriesRange.getDisplayValues();
		const cols = DataIngestionConfig.ENTRY_COLUMNS;

		for (let i = 0; i < entryValues.length; i++) {
			const valueRow = entryValues[i];
			const displayRow = entryDisplayValues[i];

			// Use robust validation from utility functions (validates will_pay_2 and will_pay_1_p3)
			// This matches the validation logic in 08-HistoricalIngestion.js
			const columnMap = {
				will_pay_2: cols.will_pay_2,
				will_pay_1_p3: cols.will_pay_1_p3
			};
			// Call utility function for robust validation
			if (!hasValidEntryData(valueRow, displayRow, columnMap)) continue;

			const horseNumber = i + 1;

			// Build entry object, only including non-null numeric values
			// Backend requires safe numbers, not null values for numeric fields
			const entry = {
				horse_number: horseNumber,
				raw_data: buildRawDataString(horseNumber, displayRow)
			};

			// Only add numeric fields if they're safe numbers (backend requires safe numbers, not null)
			const double = cleanNumericValue(valueRow[cols.double], displayRow[cols.double]);
			if (double !== null && isSafeNumber(double)) {
				entry.double = double;
			}

			const constant = cleanNumericValue(valueRow[cols.constant], displayRow[cols.constant]);
			if (constant !== null && isSafeNumber(constant)) {
				entry.constant = constant;
			}

			const correctP3 = cleanNumericValue(valueRow[cols.correct_p3], displayRow[cols.correct_p3]);
			if (correctP3 !== null && isSafeNumber(correctP3)) {
				entry.correct_p3 = correctP3;
			}

			const ml = cleanNumericValue(valueRow[cols.ml], displayRow[cols.ml]);
			if (ml !== null && isSafeNumber(ml)) {
				entry.ml = ml;
			}

			const liveOdds = cleanNumericValue(valueRow[cols.live_odds], displayRow[cols.live_odds]);
			if (liveOdds !== null && isSafeNumber(liveOdds)) {
				entry.live_odds = liveOdds;
			}

			const action = cleanNumericValue(valueRow[cols.sharp_action], displayRow[cols.sharp_action]);
			if (action !== null && isSafeNumber(action)) {
				entry.action = action;
			}

			const doubleDelta = cleanNumericValue(valueRow[cols.double_delta], displayRow[cols.double_delta]);
			if (doubleDelta !== null && isSafeNumber(doubleDelta)) {
				entry.double_delta = doubleDelta;
			}

			const p3Delta = cleanNumericValue(valueRow[cols.p3_delta], displayRow[cols.p3_delta]);
			if (p3Delta !== null && isSafeNumber(p3Delta)) {
				entry.p3_delta = p3Delta;
			}

			const xFigure = cleanNumericValue(valueRow[cols.x_figure], displayRow[cols.x_figure]);
			if (xFigure !== null && isSafeNumber(xFigure)) {
				entry.x_figure = xFigure;
			}

			// Handle string fields (can be null)
			const p3 = cleanP3Value(valueRow[cols.p3], displayRow[cols.p3]);
			if (p3 !== null) entry.p3 = p3;

			const sharpPercent = cleanPercentValue(valueRow[cols.sharp_action], displayRow[cols.sharp_action]);
			if (sharpPercent !== null) entry.sharp_percent = sharpPercent;

			// Handle currency fields (can be null)
			const willPay2 = cleanCurrencyValue(valueRow[cols.will_pay_2], displayRow[cols.will_pay_2]);
			if (willPay2 !== null) entry.will_pay_2 = willPay2;

			const willPay = cleanCurrencyValue(valueRow[cols.will_pay], displayRow[cols.will_pay]);
			if (willPay !== null) entry.will_pay = willPay;

			const willPay1P3 = cleanCurrencyValue(valueRow[cols.will_pay_1_p3], displayRow[cols.will_pay_1_p3]);
			if (willPay1P3 !== null) entry.will_pay_1_p3 = willPay1P3;

			const winPool = cleanCurrencyValue(valueRow[cols.win_pool], displayRow[cols.win_pool]);
			if (winPool !== null) entry.win_pool = winPool;

			const vetoRating = cleanVetoRating(valueRow[cols.veto_rating], displayRow[cols.veto_rating]);
			if (vetoRating !== null) entry.veto_rating = vetoRating;

			entries.push(entry);
		}

	} catch (error) {
		console.error(`❌ Error extracting entries from row ${dataRow}:`, error);
	}

	return entries;
}

/**
 * Check if a row has valid entry data
 * Uses robust validation from utility functions (validates will_pay_2 and will_pay_1_p3)
 * This matches the validation logic in 08-HistoricalIngestion.js
 * 
 * Note: This function delegates to the utility function with proper column mapping.
 * The utility function hasValidEntryData() validates will_pay_2 and will_pay_1_p3 fields.
 */
// This function is now defined in utility functions - removing local definition to avoid conflicts
// The extractRaceEntries function calls the utility version directly with column map

/**
 * Note: Data cleaning functions have been moved to 02-Utilities.js
 * All functions (cleanNumericValue, cleanCurrencyValue, cleanPercentValue, etc.)
 * are now centralized in utility functions for consistency across daily and historical ingestion.
 */

/**
 * Format date for API (MM-DD-YY format)
 * Note: This function is also available in 02-Utilities.js
 * Keeping local version for now to avoid breaking changes
 */
// formatDateForAPI is now available in utility functions - can use utility version if needed

/**
 * Extract race winners from UTILITY sheet
 */
function extractRaceWinnersFromAllSheets(sheets, allRaceIds) {
	const utilitySheet = sheets.find(s => s.getName() === 'UTILITY');
	if (!utilitySheet) {
		console.log('⚠️ UTILITY sheet not found - no winners will be extracted');
		return {};
	}

	console.log('📊 Extracting winners from UTILITY sheet...');
	const winners = extractRaceWinnersFromUtilitySheet(utilitySheet, allRaceIds);
	console.log(`✅ Extracted ${Object.keys(winners).length} winners from UTILITY sheet`);
	return winners;
}

/**
 * Extract race winners from UTILITY sheet
 */
function extractRaceWinnersFromUtilitySheet(utilitySheet, allRaceIds) {
	const winners = {};

	try {
		const horseNumbers = utilitySheet.getRange('D277:D291').getValues();
		const winnings = utilitySheet.getRange('C277:C291').getValues();

		for (const raceId of allRaceIds) {
			const match = raceId.match(/Race (\d+)$/);
			if (!match) continue;

			const raceNumber = parseInt(match[1]);
			const index = raceNumber - 1;

			if (index < 0 || index >= horseNumbers.length) continue;

			const horseNumber = horseNumbers[index][0];
			const winningAmount = winnings[index][0];

			if (!horseNumber || horseNumber === '' || horseNumber === '#N/A' ||
				!winningAmount || winningAmount === '' || winningAmount === '#N/A') {
				continue;
			}

			const horseNumInt = parseInt(horseNumber);
			const winningAmountNum = parseFloat(winningAmount);

			if (isNaN(horseNumInt) || horseNumInt < 1 || horseNumInt > 16 ||
				isNaN(winningAmountNum) || winningAmountNum <= 0) {
				continue;
			}

			winners[raceId] = {
				race_id: raceId,
				winning_horse_number: horseNumInt,
				winning_payout_2_dollar: winningAmountNum,
				extraction_method: 'simple_correct',
				extraction_confidence: 'high'
			};

			console.log(`🏆 Race ID ${raceId}: Horse ${horseNumInt}, Payout $${winningAmountNum}`);
		}

	} catch (error) {
		console.error('❌ Error extracting winners from UTILITY sheet:', error);
	}

	return winners;
}

/**
 * Send data to backend API
 * Uses sanitization from utility functions to ensure safe numbers only
 */
function sendDataToBackend(requestData) {
	try {
		const apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY");
		if (!apiKey) {
			console.error('❌ API Key is missing! Set it in Script Properties.');
			return { success: false, error: 'Missing API Key' };
		}

		// Sanitize the payload to ensure no unsafe numbers are sent
		// This matches the sanitization logic in 08-HistoricalIngestion.js
		const sanitizedData = {
			source: requestData.source,
			races: sanitizeRaces(requestData.races),
			race_winners: requestData.race_winners || {}
		};

		// PERFORMANCE: Optimized validation - only check for unsafe numbers, minimal logging
		console.log(`\n🔍 Validating payload: ${sanitizedData.races.length} races`);

		let unsafeCount = 0;
		const numericFields = ['double', 'constant', 'correct_p3', 'ml', 'live_odds', 'action',
			'double_delta', 'p3_delta', 'x_figure'];

		// Fast validation pass - remove unsafe numbers
		for (let r = 0; r < sanitizedData.races.length; r++) {
			const race = sanitizedData.races[r];
			for (let e = 0; e < race.entries.length; e++) {
				const entry = race.entries[e];
				for (let f = 0; f < numericFields.length; f++) {
					const field = numericFields[f];
					if (entry[field] !== undefined && !isSafeNumber(entry[field])) {
						unsafeCount++;
						delete entry[field];
					}
				}
			}
		}

		if (unsafeCount > 0) {
			console.log(`⚠️ Removed ${unsafeCount} unsafe numeric values`);
		} else {
			console.log(`✅ All numeric values are safe`);
		}

		const options = {
			method: 'POST',
			contentType: 'application/json',
			headers: {
				'X-API-Key': apiKey
			},
			payload: JSON.stringify(sanitizedData),
			muteHttpExceptions: true  // This allows you to see the full error response
		};

		const payloadSize = JSON.stringify(sanitizedData).length;
		const winnersCount = Object.keys(sanitizedData.race_winners || {}).length;
		console.log(`📤 Sending request to backend (${payloadSize} chars, ${sanitizedData.races.length} races, ${winnersCount} winners)...`);

		const response = UrlFetchApp.fetch(DataIngestionConfig.API_URL, options);
		const responseText = response.getContentText();

		console.log('📥 Backend response:', responseText);

		if (response.getResponseCode() === 200) {
			console.log('✅ Data successfully sent to backend');
			try {
				const responseData = JSON.parse(responseText);
				return {
					success: true,
					data: responseData,
					racesProcessed: responseData.statistics?.races_processed || sanitizedData.races.length,
					entriesProcessed: responseData.statistics?.entries_processed || 0,
					processedRaces: responseData.processed_races || []
				};
			} catch (parseError) {
				console.error('❌ Error parsing backend response:', parseError);
				return {
					success: false,
					error: 'Invalid JSON response from backend'
				};
			}
		} else {
			console.error('❌ Backend returned error:', responseText);
			try {
				const errorData = JSON.parse(responseText);
				return {
					success: false,
					error: errorData.message || `Backend error: ${response.getResponseCode()}`,
					errors: errorData.errors || [],
					statistics: errorData.statistics || null
				};
			} catch (parseError) {
				return {
					success: false,
					error: `Backend error: ${response.getResponseCode()} - ${responseText}`
				};
			}
		}

	} catch (error) {
		console.error('❌ Error sending data to backend:', error);
		return { success: false, error: error.message };
	}
}

/**
 * Manual trigger for data ingestion
 */
function manualDataIngestion() {
	console.log('🔧 Manual data ingestion triggered');
	return ingestDailyRaceData();
}

/**
 * Create a custom menu in Google Sheets for data ingestion
 */
function onOpen() {
	const ui = SpreadsheetApp.getUi();
	ui.createMenu('HeatSeaker Data')
		.addItem('Ingest Daily Race Data', 'manualDataIngestion')
		.addToUi();
}
