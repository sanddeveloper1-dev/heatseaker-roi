# Data Validation & Cleaning Functions Verification Prompt

## Task

Verify that the data validation and cleaning utility functions in this repository (`02-Utilities.js`) match the equivalent functions in the other repository that handles daily API ingestion. Ensure consistency in data cleaning, validation, and formatting logic.

## Context

This repository (`heatseaker-roi`) contains utility functions for data cleaning and validation that are used for ROI processing within Google Sheets. The daily API ingestion happens in a separate repository, and both should use identical validation/cleaning logic to ensure data consistency.

## Functions to Verify

The following functions in `02-Utilities.js` must match the other repository:

### Core Validation Functions

1. **`isSafeNumber(value, options)`**
   - Validates that a value is a safe JavaScript number (finite, not NaN, within bounds)
   - Should check: `typeof === 'number'`, `Number.isFinite()`, not NaN, not Infinity
   - Should validate against `MAX_SAFE_INTEGER` and reasonable bounds (default: 1e15)
   - Returns: `boolean`

2. **`isValidWillPayValue(willPayValue)`**
   - Validates will_pay values according to business rules
   - Must exist (not null, undefined, or empty)
   - Must not be in invalid values list: `['SC', 'N/A', '#VALUE!', '#DIV/0!', '']`
   - Case-insensitive check
   - Returns: `boolean`

3. **`hasValidEntryData(valueRow, displayRow, columnMap)`**
   - Validates that a row has valid entry data
   - Validates `will_pay_2` (column 11) and `will_pay_1_p3` (column 13)
   - Uses `isValidWillPayValue()` for validation
   - Returns: `boolean`

### Data Cleaning Functions

4. **`cleanNumericValue(value, displayValue)`**
   - Cleans and normalizes numeric values
   - Handles null/undefined/empty → returns `null`
   - Validates against `INVALID_VALUES`: `['SC', 'N/A', '#VALUE!', '#DIV/0!', 'FALSE', '']`
   - Parses strings, removes currency symbols and commas
   - Rounds to 2 decimal places
   - Validates against reasonable bounds (max 1e10 for racing data)
   - Returns: `number|null` (never NaN or undefined)

5. **`cleanCurrencyValue(value, displayValue)`**
   - Cleans currency values with proper formatting
   - Prefers `displayValue` if formatted as currency
   - Normalizes to "$X,XXX.XX" format using `Intl.NumberFormat`
   - Returns: `string|null` (formatted as "$X,XXX.XX")

6. **`cleanPercentValue(value, displayValue)`**
   - Cleans percent values, preserving percent string representation
   - Handles both decimal (0.1822) and percentage (18.22%) formats
   - Normalizes to "XX.XX%" format with 2 decimal places
   - Returns: `string|null` (e.g., "18.22%")

7. **`cleanP3Value(value, displayValue)`**
   - Cleans P3 value with special handling for 'FALSE'
   - Allows 'FALSE' as valid value (not in INVALID_VALUES for this field)
   - Parses numeric values, rounds to 2 decimal places
   - Truncates strings longer than 20 characters
   - Returns: `string|null` (numeric string or 'FALSE')

8. **`cleanVetoRating(value, displayValue)`**
   - Cleans veto_rating value and formats as string with 1 decimal place
   - Returns: `string|null` (e.g., "3.6" or "4.2")

### Helper Functions

9. **`resolveCandidateValue(value, displayValue, options)`**
   - Resolves candidate value from value/displayValue pair
   - Handles invalid values
   - Supports `allowTokens` option (e.g., ['FALSE'] for P3)
   - Returns: `Object|null` with `rawValue` and `stringValue`

10. **`buildRawDataString(horseNumber, displayRow)`**
    - Builds raw data string from display row
    - Format: "horseNumber | token1 | token2 | ... | token16"
    - Returns: `string|null`

11. **`formatRawDataToken(value)`**
    - Formats a single token for raw data string
    - Returns: `string` (empty string if null/undefined)

12. **`formatCurrencyString(num)`**
    - Formats a number as currency string in "$X,XXX.XX" format
    - Uses `Intl.NumberFormat` with USD currency
    - Returns: `string`

13. **`normalisePercentString(percentString)`**
    - Normalizes percent string format
    - Returns: `string` (e.g., "18.22%")

14. **`formatDateForAPI(date)`**
    - Formats date for API (MM-DD-YY format)
    - Returns: `string|null`

### Sanitization Functions

15. **`sanitizeEntry(entry)`**
    - Sanitizes entry object to remove unsafe numeric values
    - Only includes numeric fields if they're safe numbers
    - Includes string and currency fields if they exist
    - Returns: `Object` (sanitized entry)

16. **`sanitizeRaces(races)`**
    - Sanitizes race data to ensure all entries have safe numbers only
    - Maps over races and sanitizes each entry
    - Returns: `Array` (sanitized races)

### Constants

17. **`INVALID_VALUES`**
    - Array: `['SC', 'N/A', '#VALUE!', '#DIV/0!', 'FALSE', '']`
    - Used across all cleaning functions

## Validation Rules Reference

See `VALIDATION_RULES.md` in this repository for complete business rules:
- Horse number validation (1-16)
- Will pay validation (required fields, invalid values)
- Race number filtering (races 3-15 for entries)
- Minimum horses per race (3)
- Data type requirements (numeric, string, currency formats)

## Expected Behavior

All functions should:
1. **Never return NaN or undefined** - return `null` instead
2. **Handle null/undefined/empty gracefully** - return `null` or appropriate default
3. **Validate against INVALID_VALUES** - reject values in the list
4. **Use consistent formatting** - currency as "$X,XXX.XX", percent as "XX.XX%"
5. **Validate number safety** - check for finite, not NaN, within bounds
6. **Preserve special values** - 'FALSE' for P3 field is valid

## Verification Checklist

For each function in the other repository:

- [ ] Function signature matches (parameters, return type)
- [ ] Logic matches (same validation rules, same edge case handling)
- [ ] Error handling matches (returns null on invalid, never NaN/undefined)
- [ ] Formatting matches (currency format, percent format, decimal places)
- [ ] Constants match (`INVALID_VALUES` array)
- [ ] Special cases handled the same (e.g., 'FALSE' for P3, zero values)

## Key Differences to Watch For

1. **Zero values**: Should they be omitted or included? (Check `cleanNumericValue` behavior)
2. **Negative numbers**: Should they be allowed? (Check `isSafeNumber` and `cleanNumericValue`)
3. **Large numbers**: What's the max bound? (Should be 1e10 for racing data, 1e15 for general)
4. **P3 'FALSE'**: Must be allowed as valid value (not rejected by INVALID_VALUES)
5. **Currency formatting**: Must use `Intl.NumberFormat` for "$X,XXX.XX" format
6. **Percent handling**: Must handle both decimal (0.1822) and percentage (18.22%) formats

## Files to Compare

**This Repository:**
- `02-Utilities.js` - Contains all utility functions

**Other Repository:**
- Find equivalent utility/validation file(s)
- Compare function-by-function
- Document any differences found

## Output Required

1. **Match Report**: List all functions that match exactly
2. **Difference Report**: List any functions with differences, including:
   - Function name
   - Specific differences found
   - Impact assessment (critical/non-critical)
   - Recommendation (align to this repo's version or vice versa)
3. **Missing Functions**: List any functions in this repo that are missing in the other
4. **Extra Functions**: List any functions in the other repo that aren't in this repo

## Critical Functions (Must Match Exactly)

These functions are critical for data integrity and must match exactly:
- `isSafeNumber()`
- `cleanNumericValue()`
- `cleanCurrencyValue()`
- `isValidWillPayValue()`
- `hasValidEntryData()`
- `sanitizeEntry()`
- `sanitizeRaces()`

Any differences in these functions could cause data validation failures or incorrect data ingestion.

