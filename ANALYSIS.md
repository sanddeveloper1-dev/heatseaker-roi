# Data Ingestion Analysis - Race[8] Validation Errors

## Problem Summary

The backend is rejecting data with errors like:
```
"races[8].entries[1].correct_p3" must be a safe number
"races[8].entries[2].correct_p3" must be a safe number
...
```

But the logs show these fields are being **omitted** (undefined), not sent with invalid values.

## Key Findings

### 1. **Database Snapshot Analysis**

The JSON data you provided shows entries that were **successfully inserted** into the database:
- **Race IDs**: `GP_20250905_03`, `GP_20250905_04`, `GP_20250905_05` ✅
- **Track**: GULFSTREAM ✅
- **Date**: September 5, 2025 ✅
- **Race Numbers**: 3, 4, 5 ✅

**However, there are data quality issues:**

1. **String vs Number Types**: Many fields are stored as **strings** in the DB:
   - `correct_p3: "0.00"` (should be number `0` or omitted)
   - `p3_delta: "1.00"` (should be number `1` or omitted)
   - This suggests the backend is converting numbers to strings during storage

2. **Invalid Data Patterns**:
   - Many entries have `p3: "FALSE"` when they should have numeric values or be omitted
   - Many entries have `correct_p3: "0.00"` when the actual value should be null/omitted
   - Entries 5-16 in Race 3 have mostly null values except `constant` and `correct_p3: "0.00"`

### 2. **Code Flow Analysis**

**Current Logic:**
1. `extractRaceEntries()` calls `cleanNumericValue()` for each numeric field
2. `cleanNumericValue()` returns `null` for invalid values
3. Fields are only added to entry object if `value !== null && isSafeNumber(value)`
4. `sanitizeEntry()` performs a final pass to remove unsafe numbers

**The Problem:**
- The debug logs show raw values like `-0.6062178134994145` which should clean to `-0.61`
- But `cleanNumericValue()` is returning `null` for these values
- This suggests `cleanNumericValue()` is incorrectly rejecting valid negative numbers

### 3. **Root Cause Hypothesis**

Looking at the debug output:
```
Column E (index 4 - CORRECT P3): -0.6062178134994145 | -0.6
After cleanNumericValue: correct_p3: undefined (omitted)
```

**Possible Issues:**

1. **`resolveCandidateValue()` Issue**: May not be handling negative numbers correctly
2. **Rounding Issue**: `Number(-0.6062178134994145.toFixed(2))` should work, but maybe there's an edge case
3. **Type Coercion Issue**: The value might be coming through as a string `"-0.6"` and not being parsed correctly
4. **Backend Validation Mismatch**: The backend might be receiving these fields with `0` or `"0"` values that we're not seeing in the logs

### 4. **The Real Issue: Zero Values**

Looking at the database data, I see many entries with:
- `correct_p3: "0.00"` 
- `p3_delta: "1.00"`

**Hypothesis**: When `cleanNumericValue()` receives `0` (zero), it might be:
1. Correctly returning `0` (which is a valid safe number)
2. But the backend validation might reject `0` for certain fields
3. OR, we're sending `0` when we should be omitting the field entirely

### 5. **Backend Error Interpretation**

The error says fields "must be a safe number" - this could mean:
1. The field is present but has an invalid value (NaN, Infinity, string, etc.)
2. The field is present with `0` and backend rejects `0` for optional fields
3. The field is being sent as a string `"0.00"` instead of number `0`

## Recommended Fixes

### Fix 1: Handle Zero Values Explicitly

If `0` is not a valid value for certain fields (like `correct_p3`, `action`, `p3_delta`, `x_figure`), we should omit them:

```javascript
const correctP3 = cleanNumericValue(valueRow[4], displayRow[4]);
if (correctP3 !== null && isSafeNumber(correctP3) && correctP3 !== 0) {
    entry.correct_p3 = correctP3;
}
```

### Fix 2: Add Debug Logging for Zero Values

Add logging to see if zero values are slipping through:

```javascript
if (correctP3 === 0) {
    console.warn(`⚠️ Zero value detected for correct_p3 in race[${raceIndex}], horse ${horseNumber}`);
}
```

### Fix 3: Verify `resolveCandidateValue()` Handles Negatives

Check that negative numbers are properly handled in `resolveCandidateValue()`.

### Fix 4: Add Pre-Send Validation

Before sending to backend, log the exact payload structure to see what's actually being sent:

```javascript
// In sendDataToBackend, before sanitization
console.log('📋 RAW PAYLOAD (before sanitization):');
console.log(JSON.stringify(requestData.races[8]?.entries[1], null, 2));
```

## Next Steps

1. **Add comprehensive logging** to see what values are being sent to the backend
2. **Check if zero values should be omitted** for optional numeric fields
3. **Verify negative number handling** in `cleanNumericValue()`
4. **Test with a single race** to isolate the issue





