/**
 * Database Queries for Identifying and Cleaning Up Incorrect Data
 * Source: google_sheets_daily_update
 * 
 * This script contains SQL queries to:
 * 1. Identify all races with source_file = 'google_sheets_daily_update'
 * 2. Get summary statistics and date/track combinations
 * 3. Generate deletion queries (with proper CASCADE handling)
 */

// ============================================================================
// QUERY 1: Get all races with source_file = 'google_sheets_daily_update'
// ============================================================================
// Use this to see all affected races with full details
const QUERY_GET_ALL_AFFECTED_RACES = `
SELECT 
    r.id as race_id,
    r.date,
    r.race_number,
    r.post_time,
    r.source_file,
    t.code as track_code,
    t.name as track_name,
    r.created_at,
    r.updated_at,
    COUNT(DISTINCT re.id) as entry_count,
    COUNT(DISTINCT rw.id) as has_winner
FROM races r
JOIN tracks t ON r.track_id = t.id
LEFT JOIN race_entries re ON r.id = re.race_id
LEFT JOIN race_winners rw ON r.id = rw.race_id
WHERE r.source_file = 'google_sheets_daily_update'
GROUP BY r.id, r.date, r.race_number, r.post_time, r.source_file, t.code, t.name, r.created_at, r.updated_at
ORDER BY r.date DESC, t.code, r.race_number;
`;

// ============================================================================
// QUERY 2: Get unique date/track combinations (for building re-ingestion list)
// ============================================================================
// Use this to get the list of dates and tracks that need to be re-ingested
const QUERY_GET_DATE_TRACK_COMBINATIONS = `
SELECT DISTINCT
    r.date,
    t.code as track_code,
    t.name as track_name,
    COUNT(DISTINCT r.id) as race_count,
    COUNT(DISTINCT re.id) as total_entry_count,
    MIN(r.created_at) as first_ingested,
    MAX(r.created_at) as last_ingested
FROM races r
JOIN tracks t ON r.track_id = t.id
LEFT JOIN race_entries re ON r.id = re.race_id
WHERE r.source_file = 'google_sheets_daily_update'
GROUP BY r.date, t.code, t.name
ORDER BY r.date DESC, t.code;
`;

// ============================================================================
// QUERY 3: Get summary statistics
// ============================================================================
// Use this to understand the scope of affected data
const QUERY_GET_SUMMARY_STATISTICS = `
SELECT 
    COUNT(DISTINCT r.id) as total_races,
    COUNT(DISTINCT r.date) as unique_dates,
    COUNT(DISTINCT r.track_id) as unique_tracks,
    COUNT(DISTINCT re.id) as total_entries,
    COUNT(DISTINCT rw.id) as races_with_winners,
    MIN(r.date) as earliest_date,
    MAX(r.date) as latest_date,
    MIN(r.created_at) as first_ingested,
    MAX(r.created_at) as last_ingested
FROM races r
LEFT JOIN race_entries re ON r.id = re.race_id
LEFT JOIN race_winners rw ON r.id = rw.race_id
WHERE r.source_file = 'google_sheets_daily_update';
`;

// ============================================================================
// QUERY 4: Get race IDs in CSV-friendly format
// ============================================================================
// Use this to export race IDs for deletion verification
const QUERY_EXPORT_RACE_IDS = `
SELECT 
    r.id as race_id,
    r.date,
    t.code as track_code,
    r.race_number
FROM races r
JOIN tracks t ON r.track_id = t.id
WHERE r.source_file = 'google_sheets_daily_update'
ORDER BY r.date DESC, t.code, r.race_number;
`;

// ============================================================================
// QUERY 5: Check for data quality issues
// ============================================================================
// Use this to identify races with potential data problems
const QUERY_CHECK_DATA_QUALITY = `
SELECT 
    r.id as race_id,
    r.date,
    t.code as track_code,
    r.race_number,
    COUNT(re.id) as entry_count,
    COUNT(CASE WHEN re.live_odds IS NULL THEN 1 END) as missing_live_odds,
    COUNT(CASE WHEN re.ml IS NULL THEN 1 END) as missing_ml,
    COUNT(CASE WHEN re.double IS NULL THEN 1 END) as missing_double,
    COUNT(CASE WHEN re.correct_p3 IS NULL THEN 1 END) as missing_correct_p3,
    CASE WHEN rw.id IS NULL THEN 'No Winner' ELSE 'Has Winner' END as winner_status
FROM races r
JOIN tracks t ON r.track_id = t.id
LEFT JOIN race_entries re ON r.id = re.race_id
LEFT JOIN race_winners rw ON r.id = rw.race_id
WHERE r.source_file = 'google_sheets_daily_update'
GROUP BY r.id, r.date, t.code, r.race_number, rw.id
HAVING COUNT(re.id) = 0 
    OR COUNT(CASE WHEN re.live_odds IS NULL THEN 1 END) > 0
    OR COUNT(CASE WHEN re.ml IS NULL THEN 1 END) > 0
ORDER BY r.date DESC, t.code, r.race_number;
`;

// ============================================================================
// DELETION QUERIES
// ============================================================================
// WARNING: These queries will DELETE data. Use with caution!
// Run QUERY_GET_ALL_AFFECTED_RACES first to verify what will be deleted.

// DELETE 1: Delete all race entries for affected races
// Note: This should cascade automatically due to foreign key constraints,
// but included for explicit control if needed
const DELETE_RACE_ENTRIES = `
DELETE FROM race_entries
WHERE race_id IN (
    SELECT id FROM races WHERE source_file = 'google_sheets_daily_update'
);
`;

// DELETE 2: Delete all race winners for affected races
// Note: This should cascade automatically due to foreign key constraints,
// but included for explicit control if needed
const DELETE_RACE_WINNERS = `
DELETE FROM race_winners
WHERE race_id IN (
    SELECT id FROM races WHERE source_file = 'google_sheets_daily_update'
);
`;

// DELETE 3: Delete all races with source_file = 'google_sheets_daily_update'
// This will CASCADE delete related race_entries and race_winners
// due to the foreign key constraints
const DELETE_RACES = `
DELETE FROM races
WHERE source_file = 'google_sheets_daily_update';
`;

// ============================================================================
// SAFE DELETION WITH VERIFICATION
// ============================================================================
// Use this approach to verify before deleting:

// Step 1: Create a backup/verification query
const VERIFY_BEFORE_DELETE = `
-- First, verify what will be deleted
SELECT 
    'races' as table_name,
    COUNT(*) as record_count
FROM races
WHERE source_file = 'google_sheets_daily_update'

UNION ALL

SELECT 
    'race_entries' as table_name,
    COUNT(*) as record_count
FROM race_entries
WHERE race_id IN (
    SELECT id FROM races WHERE source_file = 'google_sheets_daily_update'
)

UNION ALL

SELECT 
    'race_winners' as table_name,
    COUNT(*) as record_count
FROM race_winners
WHERE race_id IN (
    SELECT id FROM races WHERE source_file = 'google_sheets_daily_update'
);
`;

// Step 2: Delete in transaction (recommended approach)
const DELETE_IN_TRANSACTION = `
BEGIN;

-- Verify counts before deletion
SELECT COUNT(*) as races_to_delete FROM races WHERE source_file = 'google_sheets_daily_update';
SELECT COUNT(*) as entries_to_delete FROM race_entries WHERE race_id IN (SELECT id FROM races WHERE source_file = 'google_sheets_daily_update');
SELECT COUNT(*) as winners_to_delete FROM race_winners WHERE race_id IN (SELECT id FROM races WHERE source_file = 'google_sheets_daily_update');

-- Delete race_entries (explicit, though CASCADE should handle it)
DELETE FROM race_entries
WHERE race_id IN (SELECT id FROM races WHERE source_file = 'google_sheets_daily_update');

-- Delete race_winners (explicit, though CASCADE should handle it)
DELETE FROM race_winners
WHERE race_id IN (SELECT id FROM races WHERE source_file = 'google_sheets_daily_update');

-- Delete races (this will be the main deletion)
DELETE FROM races
WHERE source_file = 'google_sheets_daily_update';

-- Verify deletion
SELECT COUNT(*) as remaining_races FROM races WHERE source_file = 'google_sheets_daily_update';

-- If everything looks good, COMMIT; otherwise ROLLBACK;
-- COMMIT;
-- ROLLBACK;
`;

// ============================================================================
// QUERY 6: Get race IDs formatted for Google Sheets historical lookup
// ============================================================================
// This helps map database race IDs to the format used in Google Sheets
// Google Sheets format: "TRACK_NAME MM-DD-YY Race NN"
// Database format: "TRACKCODE_YYYYMMDD_RACENUMBER"
const QUERY_FORMAT_FOR_SHEETS_LOOKUP = `
SELECT 
    r.id as db_race_id,
    r.date,
    t.name as track_name,
    t.code as track_code,
    r.race_number,
    -- Format for Google Sheets lookup: "TRACK_NAME MM-DD-YY Race NN"
    CONCAT(
        UPPER(t.name), 
        ' ', 
        TO_CHAR(r.date, 'MM-DD-YY'), 
        ' Race ', 
        LPAD(r.race_number::TEXT, 2, '0')
    ) as sheets_race_id_format
FROM races r
JOIN tracks t ON r.track_id = t.id
WHERE r.source_file = 'google_sheets_daily_update'
ORDER BY r.date DESC, t.code, r.race_number;
`;

// ============================================================================
// USAGE INSTRUCTIONS
// ============================================================================
/*
1. FIRST: Run QUERY_GET_SUMMARY_STATISTICS to understand the scope
2. THEN: Run QUERY_GET_DATE_TRACK_COMBINATIONS to get the list for re-ingestion
3. VERIFY: Run QUERY_GET_ALL_AFFECTED_RACES to see all affected races
4. EXPORT: Run QUERY_EXPORT_RACE_IDS to get a list for your records
5. CHECK: Run QUERY_CHECK_DATA_QUALITY to identify any obvious issues
6. FORMAT: Run QUERY_FORMAT_FOR_SHEETS_LOOKUP to map DB IDs to Sheets format
7. DELETE: Use DELETE_IN_TRANSACTION in a transaction with verification
*/

