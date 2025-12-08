# Apps Script Distribution Guide

## Overview

The Apps Script distributor (`03-Generator.js`) automates pushing Apps Script code from the template/master spreadsheet to all track spreadsheets. This ensures all track spreadsheets have the latest code updates.

## How It Works

### 1. Source Script

The distributor copies code from a source Apps Script project (the template/master) to all track spreadsheets. The source script ID is hardcoded in the file:

```javascript
const sourceScriptId = '17F_5USGsbMd-dDV16gmt90NuBLv2dw2ZSLhVJs_sUPoW40-DhkKHjWTE';
```

**⚠️ Important:** This should be the Apps Script project ID of your template/master spreadsheet.

### 2. Track Configuration

Tracks are defined in `01-Tracks.js`. Each track object must have a `scriptId` property:

```javascript
{
  trackName: 'SARATOGA',
  id: '1L07Wot8tjXr0EFG5n0NnIIrDyU2MnAvJiGoBFYjujzk',  // Spreadsheet ID
  trackCode: 'SAR',
  betTrackCode: 'STD',
  scriptId: '1DOvDsq52KFb2akhMJQDh79WfXdJHcilTRYV54ACh6-jswvO59S7DJ_jt',  // Apps Script ID (required)
  pickThreeValue: .5,
  winBet: 10,
}
```

The `scriptId` is the Apps Script project ID associated with each track's spreadsheet. You can find this ID in the Apps Script editor URL:
- URL format: `https://script.google.com/home/projects/{SCRIPT_ID}/edit`
- The `SCRIPT_ID` is what you need for `scriptId`

### 3. Distribution Functions

#### `updateAppScript()`
**Purpose:** Updates Apps Script code in all track spreadsheets

**What it does:**
1. Gets the source script content using Apps Script API
2. Loops through all tracks in `01-Tracks.js`
3. Updates each track's Apps Script project with the source code
4. Logs progress for each track

**When to use:** After updating code in the master/template Apps Script project and you want to push changes to all tracks

**Usage:**
```javascript
updateAppScript();
```

#### `updatePlaygroundScript()`
**Purpose:** Updates Apps Script code in only the playground/test track (first track in the array)

**What it does:**
1. Gets the source script content
2. Updates only the first track's script (typically the playground/test track)
3. Useful for testing before pushing to all tracks

**When to use:** For testing script updates on a single track before pushing to all

**Usage:**
```javascript
updatePlaygroundScript();
```

## Workflow for Updating Apps Script Code

### Standard Workflow:

1. **Make code changes in master/template Apps Script project:**
   - Open the template/master spreadsheet
   - Go to Extensions → Apps Script
   - Make your code changes
   - Save the project

2. **Test on playground track (recommended):**
   ```javascript
   updatePlaygroundScript();
   ```
   - This updates only the playground track
   - Test the changes to ensure they work correctly

3. **Push to all tracks:**
   ```javascript
   updateAppScript();
   ```
   - This updates all track spreadsheets
   - Monitor the console for any errors

4. **Verify:**
   - Check a few track spreadsheets to ensure code was updated
   - Test functionality on a couple of tracks

### Quick Update (skip testing):

If you're confident in your changes, you can skip step 2 and go directly to `updateAppScript()`.

## How the Distribution Works

### Technical Process:

1. **Get Source Content:**
   - Uses Apps Script API to fetch all files from the source script
   - Retrieves the complete project structure

2. **Update Target Scripts:**
   - For each track, uses Apps Script API to update the target script
   - Replaces all files in the target script with source files
   - This is a complete replacement, not a merge

3. **Error Handling:**
   - Logs success/failure for each track
   - Continues processing even if one track fails
   - Provides detailed error messages in console

### API Methods Used:

- `APPS_SCRIPT_API.getContent(scriptId)` - Gets all files from a script project
- `APPS_SCRIPT_API.updateContent(scriptId, files)` - Updates a script project with new files

## Important Notes

1. **Source Script ID:** The source script ID is hardcoded in the file. If you need to change it, update the `sourceScriptId` constant in both `updateAppScript()` and `updatePlaygroundScript()` functions.

2. **Permissions:** The script needs permissions to:
   - Use Apps Script API
   - Access OAuth tokens via `ScriptApp.getOAuthToken()`

3. **Execution Time:** For many tracks, this operation can take time. Google Apps Script has a 6-minute execution limit. If you have many tracks, you may need to run it in batches.

4. **Complete Replacement:** The update process completely replaces the target script's content. Any custom code in track spreadsheets will be overwritten.

5. **Track Script IDs:** Ensure all tracks in `01-Tracks.js` have valid `scriptId` values. Missing or incorrect IDs will cause failures.

## Troubleshooting

### "Failed to get content from source script" error:
- **Check source script ID:** Verify the hardcoded source script ID is correct
- **Check permissions:** Ensure the script has Apps Script API access
- **Check source script exists:** Verify the source script project exists and is accessible

### "Failed to update script" error for specific tracks:
- **Verify script ID:** Check that the track's `scriptId` in `01-Tracks.js` is correct
- **Check script exists:** Ensure the target script project exists
- **Check permissions:** Verify you have edit access to the target spreadsheet
- **Check API access:** Ensure Apps Script API is enabled

### Script updates but code doesn't work:
- **Check dependencies:** Ensure all required files are in the source script
- **Check load order:** Verify file naming follows the load order (00-Config.js loads first, etc.)
- **Check for errors:** Look for runtime errors in the target script's execution log

### Only some tracks update successfully:
- **Check console logs:** Review which tracks failed and why
- **Verify script IDs:** Ensure all track `scriptId` values are correct
- **Retry failed tracks:** You may need to manually update failed tracks or fix their script IDs

## Finding Script IDs

### For Source Script (Template/Master):
1. Open the template/master spreadsheet
2. Go to Extensions → Apps Script
3. Look at the URL: `https://script.google.com/home/projects/{SCRIPT_ID}/edit`
4. Copy the `SCRIPT_ID` part

### For Track Scripts:
1. Open the track spreadsheet
2. Go to Extensions → Apps Script
3. Look at the URL: `https://script.google.com/home/projects/{SCRIPT_ID}/edit`
4. Copy the `SCRIPT_ID` part
5. Update `01-Tracks.js` with this ID in the track's `scriptId` property

## Best Practices

1. **Always test first:** Use `updatePlaygroundScript()` before pushing to all tracks
2. **Version control:** Keep track of code changes in your source script
3. **Monitor logs:** Watch the console output during distribution
4. **Verify after update:** Check a few track spreadsheets after updating
5. **Backup important changes:** If track spreadsheets have custom code, back it up before updating
