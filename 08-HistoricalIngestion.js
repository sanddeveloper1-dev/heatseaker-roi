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
 * Historical Data Ingestion System
 * Updated - 1/15/25
 * 
 * Handles historical race data re-ingestion from Google Sheets to backend API
 * with AG2 cell marking to prevent duplicate ingestion.
 */

/**
 * TypeScript-style interfaces for data structure validation
 * (Converted to JSDoc for Google Apps Script compatibility)
 */

/**
 * @typedef {Object} DailyRaceDataRequest
 * @property {string} source - Source identifier
 * @property {RaceData[]} races - Array of race data
 */

/**
 * @typedef {Object} RaceData
 * @property {string} race_id - Format: "TRACK_NAME MM-DD-YY Race N"
 * @property {string} track - Track name (e.g., "SARATOGA")
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
 * @property {number|null} [action] - Action value
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
 * Get track code from track name using the tracks array
 * @param {string} trackName - Track name (e.g., "GULFSTREAM")
 * @returns {string|null} Track code (e.g., "GP") or null if not found
 */
function getTrackCodeFromTrackName(trackName) {
	if (!trackName) return null;

	const trackNameUpper = trackName.toUpperCase().trim();

	// Search through tracks array to find matching track
	for (let i = 0; i < tracks.length; i++) {
		if (tracks[i].trackName.toUpperCase() === trackNameUpper) {
			return tracks[i].trackCode;
		}
	}

	return null;
}

/**
 * Convert external race_id format to internal backend format
 * External: "GULFSTREAM 09-05-25 Race 03"
 * Internal: "GP_20250905_03"
 * @param {string} externalRaceId - Race ID in external format
 * @returns {string|null} Race ID in internal format, or null if conversion fails
 */
function convertRaceIdToInternalFormat(externalRaceId) {
	try {
		// Parse: "GULFSTREAM 09-05-25 Race 03"
		const match = externalRaceId.match(/^([A-Z\s]+?)\s+(\d{2})-(\d{2})-(\d{2})\s+Race\s+(\d+)$/i);
		if (!match) {
			console.warn(`⚠️ Could not parse race_id format: ${externalRaceId}`);
			return null;
		}

		const trackName = match[1].trim();
		const month = match[2];
		const day = match[3];
		const year = match[4]; // YY format
		const raceNumber = match[5].padStart(2, '0');

		// Get track code
		const trackCode = getTrackCodeFromTrackName(trackName);
		if (!trackCode) {
			console.warn(`⚠️ Could not find track code for: ${trackName}`);
			return null;
		}

		// Convert YY to YYYY (assume 2000s)
		const fullYear = `20${year}`;

		// Build internal format: "GP_20250905_03"
		const internalRaceId = `${trackCode}_${fullYear}${month}${day}_${raceNumber}`;

		return internalRaceId;
	} catch (error) {
		console.error(`❌ Error converting race_id ${externalRaceId}:`, error);
		return null;
	}
}

/**
 * Convert race_winners object to use internal race_id format
 * @param {Object} raceWinners - Object with external race_id as keys
 * @returns {Object} Object with internal race_id as keys
 */
function convertRaceWinnersToInternalFormat(raceWinners) {
	const converted = {};

	for (const externalRaceId in raceWinners) {
		if (!raceWinners.hasOwnProperty(externalRaceId)) continue;

		const internalRaceId = convertRaceIdToInternalFormat(externalRaceId);
		if (internalRaceId) {
			const winner = raceWinners[externalRaceId];
			// Update the race_id in the winner object to match
			converted[internalRaceId] = {
				...winner,
				race_id: internalRaceId
			};
		} else {
			console.warn(`⚠️ Skipping winner with unconvertible race_id: ${externalRaceId}`);
		}
	}

	return converted;
}


/**
 * Extract race entries from a specific data row
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet
 * @param {number} dataRow - The row containing entry data
 * @returns {RaceEntryData[]} Array of race entries
 */
function extractRaceEntries(sheet, dataRow, raceIndex = null) {
	const entries = [];

	try {
		// Get all entry data (16 horses max)
		const entriesRange = sheet.getRange(dataRow, 1, 16, 20);
		const entryValues = entriesRange.getValues();
		const entryDisplayValues = entriesRange.getDisplayValues();
		const sourceFile = resolveSourceFile(sheet);

		for (let i = 0; i < entryValues.length; i++) {
			const horseNumber = i + 1;
			const valueRow = entryValues[i];
			const displayRow = entryDisplayValues[i];

			// Skip if no valid data for this horse
			if (!hasValidEntryData(valueRow, displayRow)) {
				continue;
			}

			// PERFORMANCE: Removed debug logging

			// Build entry object, only including non-null numeric values
			// Backend requires safe numbers, not null values for numeric fields
			const entry = {
				horse_number: horseNumber,
				raw_data: buildRawDataString(horseNumber, displayRow)
			};

			// Only add numeric fields if they're safe numbers (backend requires safe numbers, not null or invalid)
			// IMPORTANT: Only include if value is a valid safe number, otherwise omit entirely
			const double = cleanNumericValue(valueRow[1], displayRow[1]);
			if (double !== null && isSafeNumber(double)) {
				entry.double = double;
			}

			const constant = cleanNumericValue(valueRow[2], displayRow[2]);
			if (constant !== null && isSafeNumber(constant)) {
				entry.constant = constant;
			}

			const correctP3 = cleanNumericValue(valueRow[4], displayRow[4]);
			if (correctP3 !== null && isSafeNumber(correctP3)) {
				entry.correct_p3 = correctP3;
			}

			const ml = cleanNumericValue(valueRow[7], displayRow[7]);
			if (ml !== null && isSafeNumber(ml)) {
				entry.ml = ml;
			}

			const liveOdds = cleanNumericValue(valueRow[5], displayRow[5]);
			if (liveOdds !== null && isSafeNumber(liveOdds)) {
				entry.live_odds = liveOdds;
			}

			const action = cleanNumericValue(valueRow[6], displayRow[6]);
			if (action !== null && isSafeNumber(action)) {
				entry.action = action;
			}

			const doubleDelta = cleanNumericValue(valueRow[8], displayRow[8]);
			if (doubleDelta !== null && isSafeNumber(doubleDelta)) {
				entry.double_delta = doubleDelta;
			}

			const p3Delta = cleanNumericValue(valueRow[9], displayRow[9]);
			if (p3Delta !== null && isSafeNumber(p3Delta)) {
				entry.p3_delta = p3Delta;
			}

			const xFigure = cleanNumericValue(valueRow[10], displayRow[10]);
			if (xFigure !== null && isSafeNumber(xFigure)) {
				entry.x_figure = xFigure;
			}

			// Handle string fields (can be null)
			const p3 = cleanP3Value(valueRow[3], displayRow[3]);
			if (p3 !== null) entry.p3 = p3;

			const sharpPercent = cleanPercentValue(valueRow[6], displayRow[6]);
			if (sharpPercent !== null) entry.sharp_percent = sharpPercent;

			// Handle currency fields (can be null)
			const willPay2 = cleanCurrencyValue(valueRow[11], displayRow[11]);
			if (willPay2 !== null) entry.will_pay_2 = willPay2;

			const willPay = cleanCurrencyValue(valueRow[12], displayRow[12]);
			if (willPay !== null) entry.will_pay = willPay;

			const willPay1P3 = cleanCurrencyValue(valueRow[13], displayRow[13]);
			if (willPay1P3 !== null) entry.will_pay_1_p3 = willPay1P3;

			const winPool = cleanCurrencyValue(valueRow[15], displayRow[15]);
			if (winPool !== null) entry.win_pool = winPool;

			const vetoRating = cleanVetoRating(valueRow[16], displayRow[16]);
			if (vetoRating !== null) entry.veto_rating = vetoRating;

			entries.push(entry);
		}

	} catch (error) {
		console.error(`❌ Error extracting entries from row ${dataRow}:`, error);
	}

	return entries;
}

/**
 * Check if a row has valid entry data according to business rules
 * @param {Array} valueRow - The raw value row
 * @param {Array} displayRow - The formatted value row
 * @returns {boolean} True if valid entry data exists
 */
function hasValidEntryData(valueRow, displayRow) {
	try {
		// Extract will_pay_2 and will_pay_1_p3 values (required fields)
		const willPay2 = cleanCurrencyValue(valueRow[11], displayRow?.[11]);
		const willPay1P3 = cleanCurrencyValue(valueRow[13], displayRow?.[13]);

		// Validate will_pay_2: must exist and not be in invalid values
		if (!isValidWillPayValue(willPay2)) {
			return false;
		}

		// Validate will_pay_1_p3: must exist and not be in invalid values
		if (!isValidWillPayValue(willPay1P3)) {
			return false;
		}

		// All required validations passed
		return true;
	} catch (error) {
		console.error('❌ Error validating entry row:', error);
		return false;
	}
}

/**
 * Validate will_pay value according to business rules
 * Must exist (not null, undefined, or empty) and not be in invalid values list
 * @param {string|null} willPayValue - The will_pay value to validate
 * @returns {boolean} True if valid
 */
function isValidWillPayValue(willPayValue) {
	// Must exist (not null, undefined, or empty string)
	if (!willPayValue || willPayValue === '') {
		return false;
	}

	// Check against invalid values (case-insensitive)
	const invalidValues = ['SC', 'N/A', '#VALUE!', '#DIV/0!', ''];
	const upperValue = String(willPayValue).toUpperCase().trim();

	if (invalidValues.includes(upperValue)) {
		return false;
	}

	return true;
}

/**
 * Check if a value is a safe number (finite, not NaN, actual number type)
 * Also validates that the number is within reasonable bounds for racing data
 * @param {*} value - The value to check
 * @param {Object} options - Optional validation options
 * @param {number} options.maxAbsValue - Maximum absolute value allowed (default: 1e15)
 * @returns {boolean} True if value is a safe number
 */
function isSafeNumber(value, options = {}) {
	if (typeof value !== 'number') {
		return false;
	}

	if (!Number.isFinite(value) || isNaN(value) || value === Infinity || value === -Infinity) {
		return false;
	}

	// Check if number is within safe integer range (JavaScript's MAX_SAFE_INTEGER)
	// Also check for unreasonably large numbers that indicate data corruption
	const maxAbsValue = options.maxAbsValue || 1e15; // 1 quadrillion - way beyond any reasonable racing data
	if (Math.abs(value) > maxAbsValue) {
		return false;
	}

	// Additional check: if the number is larger than MAX_SAFE_INTEGER, it may lose precision
	// For racing data (odds, deltas, etc.), we shouldn't have numbers this large
	if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
		return false;
	}

	return true;
}

/**
 * Clean and normalise numeric values - ensures safe number or null (never NaN)
 * Based on backend Joi validation: "safe number" = valid JS number, finite, not NaN
 * @param {*} value - The raw value to clean
 * @param {*} displayValue - The formatted value to use as fallback
 * @returns {number|null} Cleaned numeric value or null (never NaN or undefined)
 */
function cleanNumericValue(value, displayValue) {
	try {
		// Handle null/undefined/empty upfront
		if (value === null || value === undefined || value === '') {
			return null;
		}

		// If it's already a number, validate it
		if (typeof value === 'number') {
			if (Number.isFinite(value) && !isNaN(value)) {
				// Round to 2 decimal places and ensure it's still valid
				const rounded = Number(value.toFixed(2));
				if (Number.isFinite(rounded) && !isNaN(rounded)) {
					return rounded;
				}
			}
			return null; // Invalid number (NaN, Infinity, etc.)
		}

		// Try to get candidate value from displayValue or value
		const candidate = resolveCandidateValue(value, displayValue);
		if (!candidate) {
			return null;
		}

		// Check for invalid string values
		const stringValue = candidate.stringValue.trim().toUpperCase();
		if (DataIngestionConfig.INVALID_VALUES.includes(stringValue)) {
			return null;
		}

		// Clean and parse the numeric string
		const numericString = candidate.stringValue.replace(/[$,\s]/g, '');
		const parsed = parseFloat(numericString);

		// Validate parsed result - must be finite and not NaN
		if (!Number.isFinite(parsed) || isNaN(parsed)) {
			return null;
		}

		// Round to 2 decimal places
		const rounded = Number(parsed.toFixed(2));

		// Final validation - ensure the rounded value is still safe
		if (!Number.isFinite(rounded) || isNaN(rounded)) {
			return null;
		}

		// Check if number is within reasonable bounds for racing data
		// Numbers like -82235729195785230 indicate data corruption/overflow
		// Use stricter validation - max 10 billion (way beyond any reasonable racing value)
		if (Math.abs(rounded) > 1e10) {
			console.warn(`⚠️ Rejecting unreasonably large number: ${rounded} (likely data corruption)`);
			return null;
		}

		// Also check against MAX_SAFE_INTEGER to ensure precision
		if (Math.abs(rounded) > Number.MAX_SAFE_INTEGER) {
			console.warn(`⚠️ Rejecting number beyond safe integer range: ${rounded}`);
			return null;
		}

		return rounded;
	} catch (error) {
		console.error('❌ Error in cleanNumericValue for input:', value, displayValue, 'Error:', error);
		return null; // Always return null on error, never NaN
	}
}

/**
 * Clean currency values with proper formatting
 * @param {*} value - The currency value to clean
 * @param {*} displayValue - The formatted currency value
 * @returns {string|null} Cleaned currency value as formatted string (e.g., "$35.50" or "$19,722.00")
 */
function cleanCurrencyValue(value, displayValue) {
	try {
		// Prefer displayValue if it's already formatted as currency
		if (displayValue !== null && displayValue !== undefined) {
			const displayStr = displayValue.toString().trim();
			if (displayStr && (displayStr.includes('$') || /^\$?\d+[.,]?\d*$/.test(displayStr))) {
				// Normalize to "$X,XXX.XX" format
				const numStr = displayStr.replace(/[$,\s]/g, '');
				const num = parseFloat(numStr);
				if (!isNaN(num) && isFinite(num)) {
					return formatCurrencyString(num);
				}
			}
		}

		// Fallback to value
		const candidate = resolveCandidateValue(value, displayValue);
		if (!candidate) {
			return null;
		}

		const numericString = candidate.stringValue.replace(/[$,]/g, '');
		const numValue = parseFloat(numericString);

		if (isNaN(numValue) || !isFinite(numValue)) {
			return null;
		}

		return formatCurrencyString(numValue);
	} catch (error) {
		console.error('❌ Error in cleanCurrencyValue for input:', value, displayValue, 'Error:', error);
		return null;
	}
}

/**
 * Format a number as a currency string in "$X,XXX.XX" format
 * @param {number} num - The number to format
 * @returns {string} Formatted currency string
 */
function formatCurrencyString(num) {
	// Use Intl.NumberFormat for consistent formatting
	// This ensures proper comma separators and 2 decimal places
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(num);
}

/**
 * Clean percent values, preserving the percent string representation
 * @param {*} value - The raw percent value
 * @param {*} displayValue - The formatted percent value
 * @returns {string|null} Percent string (e.g., "18.22%")
 */
function cleanPercentValue(value, displayValue) {
	try {
		const displayCandidate = resolveCandidateValue(displayValue, displayValue, { allowTokens: [] });
		if (displayCandidate && displayCandidate.stringValue.includes('%')) {
			return normalisePercentString(displayCandidate.stringValue);
		}

		const candidate = resolveCandidateValue(value, displayValue, { allowTokens: [] });
		if (!candidate) {
			return null;
		}

		let numValue = parseFloat(candidate.stringValue.replace(/,/g, ''));
		if (isNaN(numValue) || !isFinite(numValue)) {
			return null;
		}

		// If the sheet stores the percent as a decimal (e.g., 0.1822), convert to percentage
		if (Math.abs(numValue) <= 1 && !candidate.stringValue.includes('%')) {
			numValue = numValue * 100;
		}

		return `${numValue.toFixed(2)}%`;
	} catch (error) {
		console.error('❌ Error in cleanPercentValue for input:', value, displayValue, 'Error:', error);
		return null;
	}
}

/**
 * Clean P3 value with special handling for 'FALSE'
 * @param {*} value - The P3 value to clean
 * @param {*} displayValue - The formatted P3 value
 * @returns {string|null} Cleaned P3 value
 */
function cleanP3Value(value, displayValue) {
	try {
		const candidate = resolveCandidateValue(value, displayValue, { allowTokens: ['FALSE'] });
		if (!candidate) {
			return null;
		}

		const { stringValue } = candidate;

		if (stringValue === 'FALSE') {
			return 'FALSE';
		}

		const numericValue = parseFloat(stringValue.replace(/,/g, ''));
		if (!isNaN(numericValue) && isFinite(numericValue)) {
			return numericValue.toFixed(2);
		}

		if (stringValue.length > 20) {
			console.warn(`⚠️ Truncating P3 value longer than 20 characters: "${stringValue}" -> "${stringValue.substring(0, 20)}"`);
			return stringValue.substring(0, 20);
		}

		return stringValue;
	} catch (error) {
		console.error('❌ Error in cleanP3Value for input:', value, displayValue, 'Error:', error);
		return null;
	}
}

function resolveCandidateValue(value, displayValue, options = {}) {
	const allowTokens = options.allowTokens || [];
	const candidates = [value, displayValue];

	for (let i = 0; i < candidates.length; i++) {
		const candidate = candidates[i];
		if (candidate === null || candidate === undefined) {
			continue;
		}

		const stringValue = candidate.toString().trim();
		if (stringValue === '') {
			continue;
		}

		if (!allowTokens.includes(stringValue) && DataIngestionConfig.INVALID_VALUES.includes(stringValue)) {
			continue;
		}

		return {
			rawValue: candidate,
			stringValue
		};
	}

	return null;
}

function normalisePercentString(percentString) {
	const sanitised = percentString.replace(/\s+/g, '');
	const numericPart = parseFloat(sanitised.replace('%', '').replace(/,/g, ''));

	if (isNaN(numericPart) || !isFinite(numericPart)) {
		return sanitised;
	}

	return `${numericPart.toFixed(2)}%`;
}

function buildRawDataString(horseNumber, displayRow) {
	try {
		if (!displayRow) {
			return horseNumber !== undefined && horseNumber !== null ? horseNumber.toString() : null;
		}

		const tokens = [horseNumber !== undefined && horseNumber !== null ? horseNumber.toString() : ''];

		for (let i = 1; i <= 16; i++) {
			tokens.push(formatRawDataToken(displayRow[i]));
		}

		return tokens.join(' | ');
	} catch (error) {
		console.error('❌ Error building raw data string:', error);
		return null;
	}
}

function formatRawDataToken(value) {
	if (value === null || value === undefined) {
		return '';
	}

	const stringValue = value.toString().trim();
	return stringValue;
}

/**
 * Clean veto_rating value and format as string with 1 decimal place
 * @param {*} value - The raw value to clean
 * @param {*} displayValue - The formatted value to use as fallback
 * @returns {string|null} Cleaned veto_rating as string (e.g., "3.6" or "4.2")
 */
function cleanVetoRating(value, displayValue) {
	try {
		const candidate = resolveCandidateValue(value, displayValue);
		if (!candidate) {
			return null;
		}

		const numericString = candidate.stringValue.replace(/,/g, '');
		const numValue = parseFloat(numericString);

		if (isNaN(numValue) || !isFinite(numValue)) {
			return null;
		}

		// Format with 1 decimal place to match backend examples
		return numValue.toFixed(1);
	} catch (error) {
		console.error('❌ Error in cleanVetoRating for input:', value, displayValue, 'Error:', error);
		return null;
	}
}

/**
 * Resolve source file path (currently not used - backend sets this server-side)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} _sheet - The sheet (unused for now)
 * @returns {null} Always returns null - backend handles source_file internally
 */
function resolveSourceFile(_sheet) {
	// Currently not accepted by backend - set server-side during ingestion
	// Keep this function for potential future API changes
	return null;
}

/**
 * Format date for API (MM-DD-YY format)
 * @param {Date} date - The date to format
 * @returns {string|null} Formatted date string
 */
function formatDateForAPI(date) {
	try {
		if (!date) return null;

		const d = new Date(date);
		const month = (d.getMonth() + 1).toString().padStart(2, '0');
		const day = d.getDate().toString().padStart(2, '0');
		const year = d.getFullYear().toString().slice(-2);

		return `${month}-${day}-${year}`;
	} catch (error) {
		console.error('❌ Error formatting date:', error);
		return null;
	}
}

/**
 * Sanitize entry object to remove any unsafe numeric values
 * @param {Object} entry - The entry object to sanitize
 * @returns {Object} Sanitized entry with only safe numbers
 */
function sanitizeEntry(entry) {
	const sanitized = {
		horse_number: entry.horse_number,
		raw_data: entry.raw_data
	};

	// List of numeric fields that must be safe numbers or omitted
	const numericFields = ['double', 'constant', 'correct_p3', 'ml', 'live_odds', 'action',
		'double_delta', 'p3_delta', 'x_figure'];

	// Only include numeric fields if they're safe numbers
	for (let i = 0; i < numericFields.length; i++) {
		const field = numericFields[i];
		const value = entry[field];
		if (value !== undefined && value !== null && isSafeNumber(value)) {
			sanitized[field] = value;
		}
		// If value exists but is not safe, omit it (don't include)
	}

	// Include string fields if they exist
	if (entry.p3 !== undefined && entry.p3 !== null) sanitized.p3 = entry.p3;
	if (entry.sharp_percent !== undefined && entry.sharp_percent !== null) sanitized.sharp_percent = entry.sharp_percent;

	// Include currency fields if they exist
	if (entry.will_pay_2 !== undefined && entry.will_pay_2 !== null) sanitized.will_pay_2 = entry.will_pay_2;
	if (entry.will_pay !== undefined && entry.will_pay !== null) sanitized.will_pay = entry.will_pay;
	if (entry.will_pay_1_p3 !== undefined && entry.will_pay_1_p3 !== null) sanitized.will_pay_1_p3 = entry.will_pay_1_p3;
	if (entry.win_pool !== undefined && entry.win_pool !== null) sanitized.win_pool = entry.win_pool;
	if (entry.veto_rating !== undefined && entry.veto_rating !== null) sanitized.veto_rating = entry.veto_rating;

	return sanitized;
}

/**
 * Sanitize race data to ensure all entries have safe numbers only
 * @param {Array} races - Array of race data
 * @returns {Array} Sanitized races
 */
function sanitizeRaces(races) {
	return races.map(race => ({
		...race,
		entries: race.entries.map(entry => sanitizeEntry(entry))
	}));
}

/**
 * Send data to backend API
 * @param {DailyRaceDataRequest} requestData - The data to send
 * @returns {Object} API response
 */
function sendDataToBackend(requestData) {
	try {
		const apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY");

		if (!apiKey) {
			console.error('❌ API Key is missing! Set it in Script Properties.');
			return { success: false, error: 'Missing API Key' };
		}

		// Convert race_winners to internal format before sending
		const convertedWinners = convertRaceWinnersToInternalFormat(requestData.race_winners || {});
		const originalWinnersCount = Object.keys(requestData.race_winners || {}).length;
		const convertedWinnersCount = Object.keys(convertedWinners).length;

		if (originalWinnersCount > 0) {
			console.log(`🔄 Converted ${originalWinnersCount} winners to internal format (${convertedWinnersCount} successful)`);
			if (originalWinnersCount !== convertedWinnersCount) {
				console.warn(`⚠️ ${originalWinnersCount - convertedWinnersCount} winners could not be converted to internal format`);
			}
		}

		// Sanitize the payload to ensure no unsafe numbers are sent
		const sanitizedData = {
			source: requestData.source,
			races: sanitizeRaces(requestData.races),
			race_winners: convertedWinners
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

		if (winnersCount > 0) {
			console.log(`🔍 [WINNER DEBUG] Race winners being sent:`);
			const winnerKeys = Object.keys(sanitizedData.race_winners);
			for (let i = 0; i < Math.min(winnerKeys.length, 3); i++) {
				const raceId = winnerKeys[i];
				const winner = sanitizedData.race_winners[raceId];
				console.log(`   Winner ${i + 1}: race_id="${raceId}", horse=${winner.winning_horse_number}, payout=$${winner.winning_payout_2_dollar}`);
			}
			if (winnerKeys.length > 3) {
				console.log(`   ... and ${winnerKeys.length - 3} more winners`);
			}

			// Also log the race IDs from races to compare
			console.log(`🔍 [WINNER DEBUG] Race IDs from races array:`);
			for (let i = 0; i < Math.min(sanitizedData.races.length, 3); i++) {
				console.log(`   Race ${i + 1}: race_id="${sanitizedData.races[i].race_id}"`);
			}
		}

		// PERFORMANCE: Chunk large payloads if needed (backend may have size limits)
		const MAX_PAYLOAD_SIZE = 1000000; // 1MB limit
		if (payloadSize > MAX_PAYLOAD_SIZE) {
			console.log(`⚠️ Large payload detected (${payloadSize} chars). Consider chunking.`);
		}

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
		return {
			success: false,
			error: error.message
		};
	}
}


/**
 * Extract race winners from sheets (UTILITY sheet if available, otherwise from race sheets themselves)
 * @param {Array} sheets - Array of all sheets
 * @param {Array} allRaceIds - Array of race IDs from race processing
 * @returns {Object} Object with race_id as key and winner data as value
 */
function extractRaceWinnersFromAllSheets(sheets, allRaceIds) {
	const allWinners = {};

	if (!allRaceIds || allRaceIds.length === 0) {
		console.log('⚠️ No race IDs provided for winner extraction');
		return allWinners;
	}

	// Find the UTILITY sheet
	let utilitySheet = null;
	for (let i = 0; i < sheets.length; i++) {
		if (sheets[i].getName() === 'UTILITY') {
			utilitySheet = sheets[i];
			break;
		}
	}

	// Try UTILITY sheet first (for daily ingestion)
	if (utilitySheet) {
		console.log('📊 Extracting winners from UTILITY sheet...');
		const winnerData = extractRaceWinnersFromUtilitySheet(utilitySheet, allRaceIds);
		Object.assign(allWinners, winnerData);
		console.log(`✅ Extracted ${Object.keys(winnerData).length} winners from UTILITY sheet`);
	}

	// If no UTILITY sheet or not all winners found, extract from race sheets themselves (for historical)
	// This is needed for historical sheets which don't have UTILITY sheets
	if (!utilitySheet || Object.keys(allWinners).length < allRaceIds.length) {
		console.log('📊 Extracting winners from race sheets themselves (historical mode)...');

		// Extract winners from each sheet by matching race IDs to the sheet's track/date
		for (let i = 0; i < sheets.length; i++) {
			const sheet = sheets[i];
			const sheetName = sheet.getName();

			// Skip UTILITY and template sheets
			if (sheetName === 'UTILITY' || sheetName === 'TEMPLATE' || sheetName === 'RATIO TEMPLATE') {
				continue;
			}

			// Get track name and date from sheet to match race IDs
			const trackName = sheet.getRange("E1").getValue();
			const eventDateValue = sheet.getRange(2, 28).getValue();

			if (!trackName || !eventDateValue) {
				continue;
			}

			const formattedDate = formatDateForAPI(eventDateValue);
			if (!formattedDate) {
				continue;
			}

			// Find race IDs that match this sheet's track and date
			const raceIdsForSheet = [];
			const trackNameUpper = trackName.toUpperCase().trim();
			const isGulfstream = trackNameUpper.includes('GULFSTREAM');

			// Enhanced logging for Gulfstream debugging
			if (isGulfstream) {
				console.log(`🔍 [GULFSTREAM DEBUG] Processing sheet: ${sheetName}`);
				console.log(`   Track name from E1: "${trackName}" (normalized: "${trackNameUpper}")`);
				console.log(`   Formatted date: "${formattedDate}"`);
				console.log(`   Total race IDs to match: ${allRaceIds.length}`);
			}

			for (let j = 0; j < allRaceIds.length; j++) {
				const raceId = allRaceIds[j];
				// Check if race ID contains the track name and formatted date
				// Race ID format: "GULFSTREAM 09-05-25 Race 03"
				// We need to match track name and date
				const raceIdUpper = raceId.toUpperCase();

				// Check if track name appears in race ID (handle cases like "GULFSTREAM - 9/5/2025" sheet name)
				const trackMatches = raceIdUpper.includes(trackNameUpper);
				const dateMatches = raceIdUpper.includes(formattedDate);

				// Enhanced logging for Gulfstream
				if (isGulfstream && j < 5) { // Log first 5 race IDs for debugging
					console.log(`   Race ID ${j + 1}: "${raceId}"`);
					console.log(`     Track match: ${trackMatches} (looking for "${trackNameUpper}" in "${raceIdUpper}")`);
					console.log(`     Date match: ${dateMatches} (looking for "${formattedDate}" in "${raceIdUpper}")`);
				}

				if (trackMatches && dateMatches) {
					raceIdsForSheet.push(raceId);
					if (isGulfstream) {
						console.log(`   ✅ Matched race ID: ${raceId}`);
					}
				}
			}

			if (raceIdsForSheet.length === 0) {
				if (isGulfstream) {
					console.log(`   ❌ [GULFSTREAM DEBUG] No matching race IDs found for ${sheetName}!`);
					console.log(`   Sample race IDs: ${allRaceIds.slice(0, 3).join(', ')}`);
				}
				continue;
			}

			if (isGulfstream) {
				console.log(`   ✅ [GULFSTREAM DEBUG] Found ${raceIdsForSheet.length} matching race IDs`);
			}

			console.log(`📊 Extracting winners from ${sheetName} sheet for ${raceIdsForSheet.length} races (track: ${trackName}, date: ${formattedDate})...`);
			const sheetWinners = extractRaceWinnersFromSheet(sheet, raceIdsForSheet);

			// Only add winners that weren't already found in UTILITY sheet
			for (const raceId in sheetWinners) {
				if (!allWinners[raceId]) {
					allWinners[raceId] = sheetWinners[raceId];
				}
			}
		}
	}

	console.log(`✅ Total winners extracted: ${Object.keys(allWinners).length} out of ${allRaceIds.length} races`);
	return allWinners;
}

/**
 * Extract race winners from UTILITY sheet using the new approach
 * @param {GoogleAppsScript.Spreadsheet.Sheet} utilitySheet - The UTILITY sheet
 * @param {Array} allRaceIds - Array of race IDs from race processing
 * @returns {Object} Object with race_id as key and winner data as value
 */
function extractRaceWinnersFromUtilitySheet(utilitySheet, allRaceIds) {
	const winners = {};

	try {
		// Extract winner data from UTILITY sheet
		// D277:D291 = Horse numbers (Race 1-15)
		// C277:C291 = Winnings (Race 1-15)
		const horseNumbers = utilitySheet.getRange('D277:D291').getValues();
		const winnings = utilitySheet.getRange('C277:C291').getValues();

		console.log(`📊 Extracting winners for ${allRaceIds.length} race IDs from UTILITY sheet`);

		// Process each race using the provided race IDs
		for (let i = 0; i < allRaceIds.length; i++) {
			const raceId = allRaceIds[i];

			// Extract race number from race ID (e.g., "WOODBINE 09-14-25 Race 06" -> "06")
			// Also handle format like "WOODBINE 09-14-25 Race 6" (without leading zero)
			const raceNumberMatch = raceId.match(/Race\s+(\d+)$/i);
			if (!raceNumberMatch) {
				console.warn(`⚠️ Could not extract race number from race ID: ${raceId}`);
				continue;
			}

			const raceNumber = parseInt(raceNumberMatch[1]);

			// Map race number to UTILITY sheet array index
			// UTILITY sheet rows: 277=Race 1, 278=Race 2, ..., 291=Race 15
			// Array indices: [0]=Race 1, [1]=Race 2, ..., [14]=Race 15
			const utilityRowIndex = raceNumber - 1; // Race 1 = index 0, Race 15 = index 14

			// Validate row index is within bounds
			if (utilityRowIndex < 0 || utilityRowIndex >= horseNumbers.length) {
				console.warn(`⚠️ Race number ${raceNumber} out of bounds for UTILITY sheet (max: ${horseNumbers.length})`);
				continue;
			}

			const horseNumber = horseNumbers[utilityRowIndex][0];
			const winningAmount = winnings[utilityRowIndex][0];

			// Skip if no valid data for this race
			if (!horseNumber || horseNumber === '' || horseNumber === '#N/A' ||
				!winningAmount || winningAmount === '' || winningAmount === '#N/A') {
				console.log(`⏭️ Skipping race ${raceId} - no winner data in UTILITY sheet (row ${utilityRowIndex + 277})`);
				continue;
			}

			// Validate horse number (1-16)
			const horseNumInt = parseInt(horseNumber);
			if (isNaN(horseNumInt) || horseNumInt < 1 || horseNumInt > 16) {
				console.warn(`⚠️ Invalid horse number for race ${raceId}: ${horseNumber}`);
				continue;
			}

			// Validate winning amount - handle currency strings
			let winningAmountNum;
			if (typeof winningAmount === 'string') {
				// Remove currency symbols and commas
				const cleanedAmount = winningAmount.replace(/[$,\s]/g, '');
				winningAmountNum = parseFloat(cleanedAmount);
			} else {
				winningAmountNum = parseFloat(winningAmount);
			}

			if (isNaN(winningAmountNum) || winningAmountNum <= 0) {
				console.warn(`⚠️ Invalid winning amount for race ${raceId}: ${winningAmount}`);
				continue;
			}

			// Store the winner using the exact race ID from race processing
			// Omit winning_payout_1_p3 if null (backend validation requires number if present)
			// extraction_method must be one of: simple_correct, header, summary, cross_reference
			const winnerData = {
				race_id: raceId,
				winning_horse_number: horseNumInt,
				winning_payout_2_dollar: winningAmountNum,
				extraction_method: 'simple_correct',
				extraction_confidence: 'high'
			};
			// Only include winning_payout_1_p3 if we have a value (currently always null, so omit)
			winners[raceId] = winnerData;
			console.log(`✅ Extracted winner for ${raceId}: Horse ${horseNumInt}, Payout $${winningAmountNum.toFixed(2)}`);
		}

		console.log(`📊 Successfully extracted ${Object.keys(winners).length} winners from UTILITY sheet`);

	} catch (error) {
		console.error('❌ Error extracting winners from UTILITY sheet:', error);
	}

	return winners;
}

/**
 * Extract race winners directly from a race sheet (for historical sheets without UTILITY)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The race sheet
 * @param {Array} raceIds - Array of race IDs to extract winners for
 * @returns {Object} Object with race_id as key and winner data as value
 */
function extractRaceWinnersFromSheet(sheet, raceIds) {
	const winners = {};

	try {
		// Get track name and date from sheet to match race IDs
		const trackName = sheet.getRange("E1").getValue();
		const eventDateValue = sheet.getRange(2, 28).getValue();
		const isGulfstream = trackName && trackName.toUpperCase().includes('GULFSTREAM');

		if (!trackName || !eventDateValue) {
			console.log(`⚠️ Cannot extract winners from ${sheet.getName()}: missing track name or date`);
			return winners;
		}

		const formattedDate = formatDateForAPI(eventDateValue);
		if (!formattedDate) {
			console.log(`⚠️ Cannot extract winners from ${sheet.getName()}: could not format date`);
			return winners;
		}

		if (isGulfstream) {
			console.log(`🔍 [GULFSTREAM DEBUG] Starting winner extraction from ${sheet.getName()}`);
			console.log(`   Track: "${trackName}", Date: "${formattedDate}"`);
			console.log(`   Race IDs to extract: ${raceIds.length}`);
		}

		// Race header rows and corresponding data rows
		const raceRows = [48, 71, 94, 117, 140, 163, 186, 209, 232, 255, 278, 301, 324];
		const dataRows = [50, 73, 96, 119, 142, 165, 188, 211, 234, 257, 280, 303, 326];

		// Process each race
		for (let i = 0; i < raceRows.length; i++) {
			const raceNumber = sheet.getRange(raceRows[i], 1).getValue();
			if (!raceNumber || !raceNumber.toString().includes('RACE')) {
				continue;
			}

			const raceNum = raceNumber.toString().replace('RACE ', '').trim();
			const raceNumInt = parseInt(raceNum);

			// Skip races 1 and 2
			if (raceNumInt < Config.RACE_NUMBER_PROCESSING_MIN) {
				continue;
			}

			const raceId = `${trackName} ${formattedDate} Race ${raceNum.padStart(2, '0')}`;

			// Check if this race ID is in our list
			if (!raceIds.includes(raceId)) {
				if (isGulfstream) {
					console.log(`   ⚠️ [GULFSTREAM DEBUG] Race ID "${raceId}" not in provided list`);
					console.log(`     Looking for: "${raceId}"`);
					console.log(`     Available IDs: ${raceIds.slice(0, 3).join(', ')}${raceIds.length > 3 ? '...' : ''}`);
				}
				continue;
			}

			// Extract winner number from race header (column C = column 3)
			// Winner number is in column C of the race header row (e.g., C48 for Race 3, C71 for Race 4)
			const winnerNumber = sheet.getRange(raceRows[i], 3).getValue(); // Column C
			if (!winnerNumber || winnerNumber === '' || isNaN(parseInt(winnerNumber))) {
				if (isGulfstream) {
					console.log(`   ⚠️ [GULFSTREAM DEBUG] No winner number found for ${raceId}`);
					console.log(`     Cell: Column C, Row ${raceRows[i]}`);
					console.log(`     Value: "${winnerNumber}" (type: ${typeof winnerNumber})`);
				} else {
					console.log(`⏭️ No winner number found for ${raceId} in column C, row ${raceRows[i]} (value: ${winnerNumber})`);
				}
				continue;
			}

			if (isGulfstream) {
				console.log(`   ✅ [GULFSTREAM DEBUG] Found winner number for ${raceId}: ${winnerNumber}`);
			}

			const horseNumInt = parseInt(winnerNumber);
			if (horseNumInt < 1 || horseNumInt > 16) {
				console.log(`⚠️ Invalid winner number for ${raceId}: ${horseNumInt}`);
				continue;
			}

			// Extract payout amount
			// Payout is in column B, exactly 43 rows down from the race header row
			// For Race 3 (row 48), payout is in B91 (48 + 43 = 91)
			// For Race 4 (row 71), payout is in B114 (71 + 43 = 114)
			let payoutAmount = null;
			const payoutRow = raceRows[i] + 43;

			try {
				const payoutValue = sheet.getRange(payoutRow, 2).getValue(); // Column B
				if (payoutValue !== null && payoutValue !== '' && !isNaN(parseFloat(payoutValue)) && parseFloat(payoutValue) > 0) {
					payoutAmount = parseFloat(payoutValue);
				} else {
					console.log(`⏭️ No valid payout found for ${raceId} in column B, row ${payoutRow} (value: ${payoutValue})`);
				}
			} catch (e) {
				console.log(`⚠️ Error reading payout for ${raceId} from row ${payoutRow}, column B: ${e.message}`);
			}

			// Create winner data (payout is optional)
			// extraction_method must be one of: simple_correct, header, summary, cross_reference
			// Using 'header' since we extract winner number from race header row (column C)
			const winnerData = {
				race_id: raceId,
				winning_horse_number: horseNumInt,
				extraction_method: 'header',
				extraction_confidence: payoutAmount ? 'high' : 'medium'
			};

			if (payoutAmount && payoutAmount > 0) {
				winnerData.winning_payout_2_dollar = payoutAmount;
			}

			winners[raceId] = winnerData;
			console.log(`✅ Extracted winner for ${raceId}: Horse ${horseNumInt}${payoutAmount ? `, Payout $${payoutAmount.toFixed(2)}` : ' (no payout found)'}`);
		}

		const winnersCount = Object.keys(winners).length;

		if (isGulfstream) {
			console.log(`📊 [GULFSTREAM SUMMARY] Extracted ${winnersCount} winners from ${sheet.getName()} sheet`);
			console.log(`   Expected ${raceIds.length} winners, got ${winnersCount}`);
			if (winnersCount === 0) {
				console.log(`   ❌ [GULFSTREAM DEBUG] NO WINNERS EXTRACTED - Check logs above for details`);
			}
		} else {
			console.log(`📊 Extracted ${winnersCount} winners from ${sheet.getName()} sheet`);
		}

	} catch (error) {
		console.error(`❌ Error extracting winners from sheet ${sheet.getName()}:`, error);
	}

	return winners;
}

/**
 * Extract race data from a sheet for historical re-ingestion (removes "today" check)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to extract data from
 * @returns {Object} Object with races array and raceIds array
 */
function extractRaceDataFromHistoricalSheet(sheet) {
	const races = [];
	const raceIds = [];

	try {
		// Get event date (no "today" check for historical data)
		const eventDateValue = sheet.getRange(2, 28).getValue();
		if (!eventDateValue || eventDateValue === '') {
			console.log(`⚠️ Sheet ${sheet.getName()}: No event date found`);
			return { races, raceIds };
		}

		const eventDate = eventDateValue.toLocaleString('en-US', { timeZone: 'America/New_York' }).slice(0, 10);

		// Get track information
		const trackName = sheet.getRange("E1").getValue();
		if (!trackName || trackName === '') {
			console.log(`⚠️ Sheet ${sheet.getName()}: No track name found`);
			return { races, raceIds };
		}

		const formattedDate = formatDateForAPI(eventDateValue);
		if (!formattedDate) {
			console.log(`⚠️ Sheet ${sheet.getName()}: Could not format event date`);
			return { races, raceIds };
		}

		// Process each race (rows 48, 71, 94, 117, 140, 163, 186, 209, 232, 255, 278, 301, 324)
		const raceRows = [48, 71, 94, 117, 140, 163, 186, 209, 232, 255, 278, 301, 324];
		const dataRows = [50, 73, 96, 119, 142, 165, 188, 211, 234, 257, 280, 303, 326];

		// PERFORMANCE: Batch read all race headers and post times in one operation
		// Read from first race row (48) to last race row (324), covering all race blocks
		const firstRaceRow = Math.min(...raceRows);
		const lastRaceRow = Math.max(...raceRows);
		const numRows = lastRaceRow - firstRaceRow + 1;
		const batchHeaderValues = sheet.getRange(firstRaceRow, 1, numRows, 10).getValues();
		const batchHeaderDisplayValues = sheet.getRange(firstRaceRow, 1, numRows, 10).getDisplayValues();

		for (let i = 0; i < raceRows.length; i++) {
			// Map race row to batch array index (raceRows[i] - firstRaceRow)
			const batchIndex = raceRows[i] - firstRaceRow;
			const raceNumber = batchHeaderValues[batchIndex][0];
			if (!raceNumber || !raceNumber.toString().includes('RACE')) {
				continue;
			}

			const raceNum = raceNumber.toString().replace('RACE ', '').trim();
			const raceNumInt = parseInt(raceNum);

			// Validate race number (1-15)
			if (isNaN(raceNumInt) || raceNumInt < DataIngestionConfig.RACE_NUMBER_MIN || raceNumInt > DataIngestionConfig.RACE_NUMBER_MAX) {
				continue;
			}

			// Skip races 1 and 2 - only process races >= 3
			if (raceNumInt < Config.RACE_NUMBER_PROCESSING_MIN) {
				continue;
			}

			// Get post time from batched data (column 10 = index 9)
			const postTimeStr = batchHeaderDisplayValues[batchIndex][9];
			const postTime = postTimeStr && postTimeStr !== '' ? postTimeStr : null;

			// Extract entries for this race
			// Pass race index for debugging
			const entries = extractRaceEntries(sheet, dataRows[i], i);

			// Validate minimum entries
			if (entries.length < DataIngestionConfig.MIN_ENTRIES) {
				continue;
			}

			const raceId = `${trackName} ${formattedDate} Race ${raceNum.padStart(2, '0')}`;

			const raceData = {
				race_id: raceId,
				track: trackName,
				date: formattedDate,
				race_number: raceNum,
				post_time: postTime,
				entries: entries
			};

			races.push(raceData);
			raceIds.push(raceId);
		}

	} catch (error) {
		console.error(`❌ Error extracting data from historical sheet ${sheet.getName()}:`, error);
	}

	return { races, raceIds };
}


/**
 * Check if a sheet has been marked as ingested (AG2 = TRUE)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to check
 * @returns {boolean} True if sheet is marked as ingested
 */
function isSheetIngested(sheet) {
	try {
		const ag2Value = sheet.getRange('AG2').getValue();
		return ag2Value === true || ag2Value === 'TRUE' || ag2Value === 'True';
	} catch (error) {
		return false;
	}
}

/**
 * Mark a sheet as ingested by setting AG2 to TRUE
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to mark
 */
function markSheetAsIngested(sheet) {
	try {
		sheet.getRange('AG2').setValue(true);
	} catch (error) {
		console.error(`⚠️ Could not mark sheet ${sheet.getName()} as ingested:`, error);
	}
}

/**
 * Clear ingestion marker from a sheet (set AG2 to FALSE or empty)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to clear
 */
function clearSheetIngestionMarker(sheet) {
	try {
		sheet.getRange('AG2').setValue(false);
	} catch (error) {
		console.error(`⚠️ Could not clear ingestion marker for sheet ${sheet.getName()}:`, error);
	}
}

/**
 * Ingest race data for a single sheet (historical version - no "today" check)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to ingest
 * @returns {Object} Result object with success status and details
 */
function ingestHistoricalSheetData(sheet) {
	const sheetName = sheet.getName();

	try {
		// Extract race data using historical extraction (no "today" check)
		const result = extractRaceDataFromHistoricalSheet(sheet);

		if (!result || !result.races || result.races.length === 0) {
			return { success: false, error: `No race data found in ${sheetName}` };
		}

		// Extract race winners
		const allSheets = [sheet];
		const raceWinners = extractRaceWinnersFromAllSheets(allSheets, result.raceIds);

		console.log(`📊 Extracted ${Object.keys(raceWinners).length} winners for ${result.raceIds.length} races from ${sheetName}`);

		const requestData = {
			source: DataIngestionConfig.SOURCE_IDENTIFIER,
			races: result.races,
			race_winners: raceWinners
		};

		// Log summary before sending
		console.log(`📤 Preparing to send: ${result.races.length} races, ${Object.keys(raceWinners).length} winners`);

		const apiResult = sendDataToBackend(requestData);

		// Mark sheet as ingested only on successful API response
		if (apiResult.success) {
			markSheetAsIngested(sheet);
		}

		return apiResult;

	} catch (error) {
		console.error(`❌ Error ingesting historical data from ${sheetName}:`, error);
		return { success: false, error: error.message };
	}
}

/**
 * Ingest all historical sheets in the spreadsheet with AG2 cell marking and time tracking
 * @param {Object} options - Options for processing
 * @param {Array<string>} options.sheetNames - Optional array of specific sheet names to process. If null, processes all non-utility sheets
 * @param {number} options.batchSize - Number of sheets to process before pausing (default: 5)
 * @param {number} options.delayMs - Delay in milliseconds between batches (default: 500)
 * @param {number} options.maxExecutionTimeMs - Maximum execution time in milliseconds before stopping (default: 330000 = 5.5 minutes)
 * @param {boolean} options.forceReingest - If true, re-ingest sheets even if AG2 is TRUE (default: false)
 * @returns {Object} Summary of results
 */
function ingestAllHistoricalSheets(options = {}) {
	const sheetNames = options.sheetNames || null;
	const batchSize = options.batchSize || 5;
	const delayMs = options.delayMs || 500;
	const maxExecutionTimeMs = options.maxExecutionTimeMs || 330000; // 5.5 minutes (safety margin for 6 min limit)
	const forceReingest = options.forceReingest || false;

	const startTime = new Date().getTime();
	console.log('🚀 Starting historical re-ingestion for all sheets...');
	console.log(`⏱️ Max execution time: ${maxExecutionTimeMs / 1000}s`);
	if (forceReingest) {
		console.log('⚠️ Force re-ingest enabled - will process all sheets regardless of AG2 marker');
	}

	const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
	const allSheets = spreadsheet.getSheets();

	const results = {
		total_sheets: 0,
		processed: 0,
		success: 0,
		failed: 0,
		skipped: 0,
		already_ingested: 0,
		errors: [],
		processed_sheets: [],
		stoppedEarly: false,
		lastProcessedSheet: null
	};

	// Filter sheets to process
	const sheetsToProcess = [];
	for (let i = 0; i < allSheets.length; i++) {
		const sheet = allSheets[i];
		const sheetName = sheet.getName();

		// Skip utility and template sheets
		if (sheetName === 'UTILITY' || sheetName === 'TEMPLATE' || sheetName === 'RATIO TEMPLATE') {
			results.skipped++;
			continue;
		}

		// If specific sheets requested, only process those
		if (sheetNames && !sheetNames.includes(sheetName)) {
			results.skipped++;
			continue;
		}

		// Check AG2 marker (skip if already ingested, unless force re-ingest)
		if (!forceReingest && isSheetIngested(sheet)) {
			results.already_ingested++;
			continue;
		}

		results.total_sheets++;
		sheetsToProcess.push({ sheet, sheetName, index: i });
	}

	console.log(`📊 Found ${sheetsToProcess.length} sheets to process (${results.already_ingested} already ingested)`);

	// Process sheets in batches
	for (let batchIndex = 0; batchIndex < sheetsToProcess.length; batchIndex++) {
		const { sheet, sheetName } = sheetsToProcess[batchIndex];

		// Check execution time before processing each sheet
		const elapsedTime = new Date().getTime() - startTime;
		if (elapsedTime > maxExecutionTimeMs) {
			console.log(`\n⏰ Approaching execution time limit (${elapsedTime / 1000}s elapsed). Stopping early.`);
			console.log(`📋 Last processed sheet: ${results.lastProcessedSheet || 'none'}`);
			results.stoppedEarly = true;
			break;
		}

		console.log(`[${results.processed + 1}/${sheetsToProcess.length}] ${sheetName} (${Math.round(elapsedTime / 1000)}s)`);

		try {
			const result = ingestHistoricalSheetData(sheet);

			if (result.success) {
				results.success++;
				results.processed_sheets.push({
					sheet_name: sheetName,
					races_processed: result.racesProcessed || 0,
					entries_processed: result.entriesProcessed || 0,
					status: 'ingested'
				});
				results.lastProcessedSheet = sheetName;
			} else {
				results.failed++;
				results.errors.push({ sheet_name: sheetName, error: result.error });
			}

			results.processed++;

			// Pause between batches to avoid rate limiting
			if (results.processed % batchSize === 0 && batchIndex < sheetsToProcess.length - 1) {
				Utilities.sleep(delayMs);
			}

		} catch (error) {
			results.failed++;
			results.errors.push({ sheet_name: sheetName, error: error.message });
			console.error(`❌ Error processing ${sheetName}:`, error);
		}

		// Check time after each sheet
		const currentElapsed = new Date().getTime() - startTime;
		if (currentElapsed > maxExecutionTimeMs) {
			console.log(`\n⏰ Execution time limit reached. Last processed: ${results.lastProcessedSheet || 'none'}`);
			results.stoppedEarly = true;
			break;
		}
	}

	const totalTime = (new Date().getTime() - startTime) / 1000;
	console.log(`\n📊 Summary: ${results.success} success, ${results.failed} failed, ${results.already_ingested} skipped (already ingested), ${totalTime.toFixed(1)}s`);
	if (results.stoppedEarly) {
		console.log(`⚠️ Stopped early. Last processed: ${results.lastProcessedSheet || 'none'}`);
		console.log(`💡 Re-run to continue from remaining sheets (already ingested sheets will be skipped)`);
	}

	return results;
}

/**
 * Test ingestion on a single sheet
 * @param {string} sheetName - Name of the sheet to test
 */
function testIngestSheet(sheetName) {
	console.log(`🧪 Testing ingestion for sheet: ${sheetName}`);
	const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
	const sheet = spreadsheet.getSheetByName(sheetName);

	if (!sheet) {
		console.log(`❌ Sheet not found: ${sheetName}`);
		return;
	}

	const result = ingestHistoricalSheetData(sheet);
	console.log('🧪 Ingestion result:', result);
	return result;
}

/**
 * Clear AG2 ingestion markers from all sheets (useful for re-ingesting everything)
 * @param {Array<string>} sheetNames - Optional array of specific sheet names. If null, clears all non-utility sheets
 */
function clearAllIngestionMarkers(sheetNames = null) {
	const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
	const allSheets = spreadsheet.getSheets();
	let cleared = 0;

	for (let i = 0; i < allSheets.length; i++) {
		const sheet = allSheets[i];
		const sheetName = sheet.getName();

		// Skip utility and template sheets
		if (sheetName === 'UTILITY' || sheetName === 'TEMPLATE' || sheetName === 'RATIO TEMPLATE') {
			continue;
		}

		// If specific sheets requested, only clear those
		if (sheetNames && !sheetNames.includes(sheetName)) {
			continue;
		}

		clearSheetIngestionMarker(sheet);
		cleared++;
	}

	console.log(`✅ Cleared AG2 markers from ${cleared} sheets`);
	return cleared;
}

/**
 * Clear AG2 ingestion markers from all Gulfstream sheets
 * @returns {number} Number of sheets cleared
 */
function clearGulfstreamIngestionMarkers() {
	const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
	const allSheets = spreadsheet.getSheets();
	let cleared = 0;

	for (let i = 0; i < allSheets.length; i++) {
		const sheet = allSheets[i];
		const sheetName = sheet.getName();

		// Skip utility and template sheets
		if (sheetName === 'UTILITY' || sheetName === 'TEMPLATE' || sheetName === 'RATIO TEMPLATE') {
			continue;
		}

		// Check if this is a Gulfstream sheet
		const trackName = sheet.getRange("E1").getValue();
		if (trackName && trackName.toUpperCase().includes('GULFSTREAM')) {
			clearSheetIngestionMarker(sheet);
			cleared++;
			console.log(`✅ Cleared AG2 marker from ${sheetName} (track: ${trackName})`);
		}
	}

	console.log(`✅ Cleared AG2 markers from ${cleared} Gulfstream sheets`);
	return cleared;
}

/**
 * Force re-ingest all sheets (ignores AG2 markers)
 * Convenience wrapper for ingestAllHistoricalSheets with forceReingest: true
 * @param {Object} options - Options for processing (same as ingestAllHistoricalSheets)
 * @returns {Object} Summary of results
 */
function forceReingestAllSheets(options = {}) {
	return ingestAllHistoricalSheets({
		...options,
		forceReingest: true
	});
}