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
 * Utility Functions
 * Updated - 2/3/25
 * 
 * Contains shared utility functions for data cleaning, validation, and formatting
 * used across daily ingestion, historical ingestion, and other data processing scripts.
 */

/**
 * Invalid values that should be rejected during data cleaning
 */
const INVALID_VALUES = ['SC', 'N/A', '#VALUE!', '#DIV/0!', 'FALSE', ''];

function SortArray(x, y) {
    if (x.trackName < y.trackName) { return -1; }
    if (x.trackName > y.trackName) { return 1; }
    return 0;
}

function sortNumber(a, b) {
    return a - b;
}

function GetSheetName() {
    return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName();
}

function eventBetDate() {
    const date = new Date()

    return `${date.getFullYear()}-${date.getMonth() < 9 ? `0${date.getMonth() + 1}` : date.getMonth() + 1}-${date.getDate().toString().length === 1 ? `0${date.getDate()}` : date.getDate()}`

}

function parseTimeString(timeStr) {
    const [time, period] = timeStr.split(" "); // Split into time and AM/PM
    let [hours, minutes] = time.split(":").map(Number); // Extract hours and minutes

    // Convert to 24-hour format
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    // Create a Date object for today with extracted hours and minutes
    const date = new Date();
    date.setHours(hours, minutes, 0, 0); // Set hours and minutes, reset seconds/ms

    return date;
}

/**
 * Exports a selected range from a Google Sheet as a PDF.
 * This is the correct and supported way to capture a formatted range from Google Sheets.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The Google Sheets sheet object.
 * @param {string} rangeNotation - The A1 notation string representing the range (e.g., 'A1:D10').
 * @returns {Blob} - A Blob representing the exported PDF.
 */
function exportRangeAsPDF(sheet, rangeNotation) {
    const spreadsheet = sheet.getParent();
    const spreadsheetId = spreadsheet.getId();
    const sheetId = sheet.getSheetId();

    // Construct the export URL for Google Sheets
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?` +
        `format=pdf&gid=${sheetId}&range=${encodeURIComponent(rangeNotation)}&` +
        `size=letter&portrait=true&fitw=true&gridlines=false&printtitle=false`;


    // Use OAuth token to authorize request
    const token = ScriptApp.getOAuthToken();

    // Fetch the PDF blob
    const response = UrlFetchApp.fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`
        },
        muteHttpExceptions: false
    });

    if (response.getResponseCode() !== 200) {
        Logger.log(`❗ Error exporting range as PDF: ${response.getContentText()}`);
        return null;  // Safeguard to prevent proceeding with a broken PDF
    }

    return response.getBlob().setName('Bet_Report.pdf');
}

// ============================================================================
// Data Cleaning and Validation Functions
// Used by daily ingestion (04-DataIngestion.js) and ROI processing (06-ROIProcessing.js)
// ============================================================================

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
        if (INVALID_VALUES.includes(stringValue)) {
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
 * Normalise percent string format
 * @param {string} percentString - The percent string to normalise
 * @returns {string} Normalised percent string (e.g., "18.22%")
 */
function normalisePercentString(percentString) {
    const sanitised = percentString.replace(/\s+/g, '');
    const numericPart = parseFloat(sanitised.replace('%', '').replace(/,/g, ''));

    if (isNaN(numericPart) || !isFinite(numericPart)) {
        return sanitised;
    }

    return `${numericPart.toFixed(2)}%`;
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
 * Resolve candidate value from value/displayValue pair, handling invalid values
 * @param {*} value - The raw value
 * @param {*} displayValue - The formatted display value
 * @param {Object} options - Options for resolution
 * @param {Array<string>} options.allowTokens - Array of tokens to allow even if they're in INVALID_VALUES (e.g., ['FALSE'])
 * @returns {Object|null} Object with rawValue and stringValue, or null
 */
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

        if (!allowTokens.includes(stringValue) && INVALID_VALUES.includes(stringValue)) {
            continue;
        }

        return {
            rawValue: candidate,
            stringValue
        };
    }

    return null;
}

/**
 * Build raw data string from display row
 * @param {number} horseNumber - The horse number
 * @param {Array} displayRow - The display row array
 * @returns {string|null} Raw data string or null
 */
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

/**
 * Format a single token for raw data string
 * @param {*} value - The value to format
 * @returns {string} Formatted token string
 */
function formatRawDataToken(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = value.toString().trim();
    return stringValue;
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
 * Check if a row has valid entry data according to business rules
 * Uses the same validation as 04-DataIngestion.js: validates will_pay_2 and will_pay_1_p3
 * @param {Array} valueRow - The raw value row
 * @param {Array} displayRow - The formatted value row
 * @param {Object} columnMap - Optional column mapping object (for compatibility)
 * @returns {boolean} True if valid entry data exists
 */
function hasValidEntryData(valueRow, displayRow, columnMap = null) {
    try {
        // Default column indices if columnMap not provided (matches 04-DataIngestion.js structure)
        // Column 11 = will_pay_2, Column 13 = will_pay_1_p3
        const willPay2Col = columnMap?.will_pay_2 ?? 11;
        const willPay1P3Col = columnMap?.will_pay_1_p3 ?? 13;

        // Extract will_pay_2 and will_pay_1_p3 values (required fields)
        const willPay2 = cleanCurrencyValue(valueRow[willPay2Col], displayRow?.[willPay2Col]);
        const willPay1P3 = cleanCurrencyValue(valueRow[willPay1P3Col], displayRow?.[willPay1P3Col]);

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