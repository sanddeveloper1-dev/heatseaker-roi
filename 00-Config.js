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
 * Centralized configuration for HeatSeaker Template project.
 * Stores all magic numbers, channel IDs, column indexes, spreadsheet tab names, and other constants.
 *
 * Each config item is documented with its usage (file(s) + tab(s)).
 * All values are additive and backwards compatible.
 */

const Config = {
	// --- Slack Channels & Webhooks ---
	SLACK_CHANNEL_ID: 'C08FMT4SJP6', // Main channel (SlackBet - V2.js, etc.)
	SLACK_CHANNEL_ID_PLAYGROUND: 'C08DGTT40FR', // Playground/test channel (SlackBet - V2.js, etc.)
	SLACK_ERROR_CHANNEL_ID: 'C08E3GV9Z43', // Error-specific channel (NotificationService.js)
	SLACK_WEBHOOK_URL_ERRORS: '', // (OFFLINE) Slack.js
	SLACK_WEBHOOK_URL_ALERTS: '', // (OFFLINE) Slack.js

	// --- Spreadsheet Tab Names ---
	TAB_RATIO_TEMPLATE: 'RATIO TEMPLATE', // Manual Bet (Ratio).js
	TAB_TEMPLATE: 'TEMPLATE', // Generator.js
	TAB_UTILITY: 'UTILITY', // Generator.js, SlackBet - V2.js
	TAB_TOTALS: 'TOTALS', // 04-DatabaseSync.js, 06-ROITotals.js
	TAB_TEE: 'TEE', // 04-DatabaseSync.js, 05-ROIProcessing.js
	TAB_DATABASE: 'DATABASE', // 04-DatabaseSync.js, 05-ROIProcessing.js
	// Add more as needed for other tabs

	// --- DB Tracking / Daily Retrieval ---
	DB_TRACKING: {
		TIMEZONE: 'America/New_York',
		MIN_RACE_NUMBER: 3,
		DATABASE_TRACK_CODE_CELL: 'J1',
		TOTALS_START_ROW: 11,
		TEE_TOTAL_RANGES: {
			WIN_BET: 'BI2',
			WIN_COLLECT: 'BJ2',
			GP: 'BM2',
			ROI: 'BN2',
		},
		DATABASE_COLUMNS: 6,
	},

	// --- Ratio Template Tab Layout (Manual Bet (Ratio).js) ---
	COLUMN_HORSE_NUMBER_RATIO: 1, // Column A
	COLUMN_BET_AMOUNT_RATIO: 5,   // Column E
	RACE_BLOCK_START_ROW_RATIO: 5, // First race block starts at row 5
	RACE_BLOCK_OFFSET_RATIO: 12,   // Each race block is 12 rows apart
	NUM_HORSE_ROWS_RATIO: 5,       // 5 horses per race block

	// --- Utility Tab Layout (SlackBet - V2.js) ---
	ALERT_COLUMN_UTILITY: 10, // Column J for alert status
	ROW_BASE_NUMBERS_UTILITY: [40, 58, 76, 94, 112, 130, 148, 166, 184, 202, 220, 238, 256], // Utility row bases

	// --- Bet Amount Columns by Bet Type/Tab ---
	// Used in: A Bets - All Tracks V2.js, (OFFLINE) A Bets - All Tracks.js, etc.
	COLUMN_BET_AMOUNT_A: 'AB15', // A Bets - All Tracks V2.js, (OFFLINE) A Bets - All Tracks.js
	COLUMN_BET_AMOUNT_B: 'AC15', // B Bets - All Tracks.js
	COLUMN_BET_AMOUNT_C: 'AD15', // C Bets - NYRA Only.js
	COLUMN_BET_AMOUNT_D: 'AE15', // D Bets - Gulfstream Only.js
	COLUMN_BET_AMOUNT_E: 'AF15', // E Bets - Gulfstream Only V2.js
	COLUMN_BET_AMOUNT_F: 'AG15', // F Bets - NYRA Only.js
	// Add more as needed for other bet types/tabs

	// --- General/Other Magic Numbers ---
	MAX_RACES: 15, // Used in: Manual Bet (Ratio).js, etc.
	MAX_BETS_PER_RACE: 5, // Used in: Manual Bet (Ratio).js, etc.

	// --- Data Ingestion Configuration ---
	DATA_INGESTION_API_URL: 'https://www.heatseakerbet.com/api/races/daily',
	DATA_INGESTION_SOURCE: 'google_sheets_daily_update',
	RACE_NUMBER_MIN: 1,
	RACE_NUMBER_MAX: 15,
	HORSE_NUMBER_MIN: 1,
	HORSE_NUMBER_MAX: 16,
	MIN_ENTRIES_PER_RACE: 1,
	// Add more as needed

	// --- Template/Master Spreadsheet Configuration ---
	TEMPLATE_SPREADSHEET_ID: '1sQZylzdKOs9lrhU9-Ru5pGygKl9XT4slYLepreV7BEY', // Template-ROI spreadsheet ID
	TEMPLATE_SPREADSHEET_NAME: 'Template-ROI', // Template spreadsheet name
	TEMPLATE_SCRIPT_ID: '1948DumhjvI_dGKi0-zQUuTe01astuS8kqJOa7EdWY1koqKJ6sUMIhlYv', // Template Apps Script project ID

	// --- Track Metadata (Tracks.js) ---
	// Track metadata is stored in the tracks array in Tracks.js
	// If you need to reference a specific property, add here as needed

	// --- Miscellaneous ---
	// Add any other constants, magic numbers, or config items here
};

Config.DB_TRACKING.MAX_RACE_NUMBER = Config.MAX_RACES;
Config.DB_TRACKING.MAX_HORSES_PER_RACE = Config.HORSE_NUMBER_MAX;

// Export for use in other scripts (Apps Script global)
// global.Config = Config; 