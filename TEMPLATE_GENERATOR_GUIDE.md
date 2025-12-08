# Template Generator Guide

## Overview

The HeatSeaker template generator (`03-Generator.js`) automates the creation and management of track-specific Google Spreadsheets. It uses a master template spreadsheet to generate individual spreadsheets for each racing track.

## How It Works

### 1. Master Template Structure

The generator expects your master spreadsheet to have these sheets:

- **TEMPLATE** - The main race tracking sheet template
- **UTILITY** - Utility sheet for calculations and metadata
- **RATIO TEMPLATE** (optional) - Template for ratio-based betting
- **TOTALS** (optional) - Template for tracking totals
- **TEE** (optional) - Template for TEE tracking
- **DATABASE** (optional) - Template for database tracking

### 2. Track Configuration

Tracks are defined in `01-Tracks.js`. Each track object contains:

```javascript
{
  trackName: 'SARATOGA',        // Display name
  id: '1L07Wot8tjXr0EFG5n0NnIIrDyU2MnAvJiGoBFYjujzk',  // Spreadsheet ID
  trackCode: 'SAR',             // Short code
  betTrackCode: 'STD',          // Betting platform code
  scriptId: '1DOvDsq52KFb2akhMJQDh79WfXdJHcilTRYV54ACh6-jswvO59S7DJ_jt',  // Apps Script ID
  pickThreeValue: .5,           // Pick 3 value
  winBet: 10,                   // Win bet amount
  inactive: false              // Optional: mark as inactive
}
```

### 3. Generator Functions

#### `generateTrackSheets()`
**Purpose:** Creates brand new spreadsheets for all tracks (use sparingly)

**What it does:**
1. Loops through all tracks in `01-Tracks.js`
2. Creates a new Google Spreadsheet for each track
3. Copies the TEMPLATE and UTILITY sheets from master
4. Renames sheets appropriately
5. Sets track-specific values in key cells:
   - `E1` - Track name
   - `AB1` - Track name
   - `B1` (UTILITY) - Track name
   - `AB8` - Track code
   - `AB9` - Bet track code
   - `AB7` - Pick three value
   - `AB12` - Inactive flag (if applicable)
   - `AB13` - Double value (for Gulfstream)
6. Moves the new spreadsheet to the "HeatSeaker" Drive folder

**When to use:** Only when creating completely new track spreadsheets

**⚠️ Important:** Before running, you must update `track.id` and `track.scriptId` in `01-Tracks.js` for each new track.

#### `replaceTemplates()`
**Purpose:** Updates the main template sheet across all existing track spreadsheets

**What it does:**
1. Opens each track's existing spreadsheet (using `track.id`)
2. Deletes the old track-named sheet
3. Copies the current TEMPLATE from master
4. Renames it to the track name
5. Sets all track-specific cell values

**When to use:** When you've updated the TEMPLATE sheet design and need to push changes to all tracks

#### `replaceUtility()`
**Purpose:** Updates the UTILITY sheet across all existing track spreadsheets

**What it does:**
1. Opens each track's existing spreadsheet
2. Deletes the current UTILITY sheet
3. Copies the current UTILITY from master
4. Sets the track name in cell B1

**When to use:** When you've updated the UTILITY sheet and need to push changes

#### `pushRatioTemplateToAllTracks()`
**Purpose:** Pushes the RATIO TEMPLATE sheet to all track spreadsheets

**What it does:**
1. For each track spreadsheet:
   - Checks if RATIO TEMPLATE exists, deletes it if found
   - Copies the RATIO TEMPLATE from master
   - Renames it properly

**When to use:** When you've updated the RATIO TEMPLATE and need to distribute it

#### `pushTrackingSheetsToAllTracks()`
**Purpose:** Pushes tracking sheets (TOTALS, TEE, DATABASE) to all track spreadsheets

**What it does:**
1. For each track spreadsheet:
   - Deletes existing TOTALS, TEE, DATABASE sheets
   - Copies fresh versions from master
   - Sets the track code in DATABASE!J1 (for automation)

**When to use:** When you've updated tracking sheet templates

#### `updateAppScript()`
**Purpose:** Updates the Apps Script code in all track spreadsheets

**What it does:**
1. Uses the Apps Script API to copy code from a source script
2. Updates each track's script (using `track.scriptId`)
3. Source script ID: `'17F_5USGsbMd-dDV16gmt90NuBLv2dw2ZSLhVJs_sUPoW40-DhkKHjWTE'`

**When to use:** When you've updated the Apps Script code and need to push to all track spreadsheets

#### `updatePlaygroundScript()`
**Purpose:** Updates only the playground/test track's script

**When to use:** For testing script updates on a single track before pushing to all

## Template Sheet Requirements

### TEMPLATE Sheet Key Cells

The generator sets these cells automatically:

| Cell | Value | Description |
|------|-------|-------------|
| E1 | Track name | Display name for the track |
| AB1 | Track name | Track name (duplicate) |
| AB7 | Pick three value | From track config |
| AB8 | Track code | Short code (e.g., "SAR") |
| AB9 | Bet track code | Betting platform code (e.g., "STD") |
| AB12 | true/false | Inactive flag (if track is inactive) |
| AB13 | Number | Double value (for Gulfstream, if not 2) |

### UTILITY Sheet Key Cells

| Cell | Value | Description |
|------|-------|-------------|
| B1 | Track name | Track name for utility calculations |

### DATABASE Sheet Key Cells

| Cell | Value | Description |
|------|-------|-------------|
| J1 | Track code | Used by automation to identify track |

## Workflow for Creating a New Track

1. **Add track to `01-Tracks.js`:**
   ```javascript
   {
     trackName: 'NEW TRACK',
     id: '',  // Will be set after creation
     trackCode: 'NEW',
     betTrackCode: 'NEW',
     scriptId: '',  // Will be set after creation
     pickThreeValue: 2,
     winBet: 730,
   }
   ```

2. **Run `generateTrackSheets()`:**
   - This creates the new spreadsheet
   - Note the new spreadsheet ID from the output

3. **Update `01-Tracks.js` with the new IDs:**
   - Set `id` to the new spreadsheet ID
   - Get the script ID from the spreadsheet's Apps Script editor
   - Set `scriptId` to the script ID

4. **Run `updateAppScript()`:**
   - This copies the Apps Script code to the new spreadsheet

5. **Verify:**
   - Check that all sheets are present
   - Verify cell values are set correctly
   - Test that scripts work

## Workflow for Updating Templates

### Update TEMPLATE Sheet Design:
1. Make changes to TEMPLATE sheet in master spreadsheet
2. Run `replaceTemplates()`
3. All track spreadsheets get updated

### Update UTILITY Sheet:
1. Make changes to UTILITY sheet in master
2. Run `replaceUtility()`
3. All track spreadsheets get updated

### Update Apps Script Code:
1. Make changes to code in master Apps Script project
2. Run `updateAppScript()` (or `updatePlaygroundScript()` to test first)
3. All track spreadsheets get updated code

## Important Notes

1. **Deprecated Methods:** The `generateTrackSheets()` function uses deprecated Drive API methods (`folder.addFile()`, `DriveApp.getRootFolder().removeFile()`). These may need to be updated in the future.

2. **Script ID:** The source script ID (`'17F_5USGsbMd-dDV16gmt90NuBLv2dw2ZSLhVJs_sUPoW40-DhkKHjWTE'`) is hardcoded. This should be the master Apps Script project ID.

3. **Folder Name:** The generator looks for a folder named "HeatSeaker" in Drive. Make sure this folder exists.

4. **Permissions:** The script needs permissions to:
   - Create spreadsheets
   - Access Drive folders
   - Use Apps Script API
   - Modify spreadsheets

5. **Execution Time:** For many tracks, these operations can take time. Google Apps Script has a 6-minute execution limit.

## Troubleshooting

### "Sheet not found" errors:
- Ensure TEMPLATE and UTILITY sheets exist in master spreadsheet
- Check that sheet names match exactly (case-sensitive)

### "Folder not found" errors:
- Ensure "HeatSeaker" folder exists in Drive
- Check folder permissions

### Script update failures:
- Verify script IDs in `01-Tracks.js` are correct
- Check that source script ID is correct
- Ensure Apps Script API is enabled

### Cell value not setting:
- Check that cell references are correct
- Verify track object has the required properties
- Check for typos in cell notation (e.g., "AB1" not "AB 1")

