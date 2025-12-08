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
 * Apps Script Distribution
 * Pushes Apps Script code from the template/master spreadsheet to all track spreadsheets.
 * Updated - 2/9/25
 */

/**
 * Updates Apps Script code in all track spreadsheets.
 * Copies code from the source script (template/master) to each track's script.
 * 
 * Usage: After updating code in the master/template Apps Script project, run this
 * to push the changes to all track spreadsheets.
 */
function updateAppScript() {
  const sourceScriptId = Config.TEMPLATE_SCRIPT_ID;
  let sortedTracks = tracks.sort(SortArray);

  console.log(`🚀 Starting Apps Script update from template: ${Config.TEMPLATE_SPREADSHEET_NAME}`);
  console.log(`📋 Source Script ID: ${sourceScriptId}`);
  console.log(`📊 Updating ${sortedTracks.length} track spreadsheets...\n`);

  let successCount = 0;
  let failureCount = 0;
  const failures = [];

  sortedTracks.forEach((track, index) => {
    console.log(`[${index + 1}/${sortedTracks.length}] Updating ${track.trackName}...`);

    if (!track.scriptId) {
      console.error(`  ❌ No scriptId found for ${track.trackName}`);
      failureCount++;
      failures.push({ track: track.trackName, error: 'Missing scriptId' });
      return;
    }

    const success = shareMacro_(sourceScriptId, track.scriptId);

    if (success) {
      successCount++;
      console.log(`  ✅ Successfully updated ${track.trackName}\n`);
    } else {
      failureCount++;
      failures.push({ track: track.trackName, error: 'Update failed' });
      console.log(`  ❌ Failed to update ${track.trackName}\n`);
    }
  });

  // Summary
  console.log('\n📊 Update Summary:');
  console.log(`  ✅ Successful: ${successCount}`);
  console.log(`  ❌ Failed: ${failureCount}`);

  if (failures.length > 0) {
    console.log('\n❌ Failed Tracks:');
    failures.forEach(f => {
      console.log(`  - ${f.track}: ${f.error}`);
    });
  }

  return {
    total: sortedTracks.length,
    success: successCount,
    failed: failureCount,
    failures: failures
  };
}

/**
 * Uses Apps Script API to copy source Apps Script project 
 * to destination Google Spreadsheet container.
 * 
 * @param {string} sourceScriptId - Script ID of the source project (template/master).
 * @param {string} targetScriptId - Script ID of the target spreadsheet's Apps Script project.
 * @return {boolean} True if successful, false otherwise.
 */
function shareMacro_(sourceScriptId, targetScriptId) {
  // Gets the source project content using the Apps Script API.
  const sourceFiles = APPS_SCRIPT_API.getContent(sourceScriptId);

  if (!sourceFiles) {
    console.error(`  ❌ Failed to get content from source script ${sourceScriptId}`);
    return false;
  }

  // Updates the Apps Script project with the source project content.
  const success = APPS_SCRIPT_API.updateContent(targetScriptId, sourceFiles);

  if (!success) {
    console.error(`  ❌ Failed to update script ${targetScriptId}`);
  }

  return success;
}

/**
 * Encapsulates Apps Script API project manipulation.
 * Provides methods to get and update Apps Script project content.
 */
const APPS_SCRIPT_API = {
  accessToken: ScriptApp.getOAuthToken(),

  /**
   * Gets Apps Script source project details.
   * @param {string} scriptId - Script ID of the source project.
   * @return {Object|false} JSON representation of source project, or false on error.
   */
  get: function (scriptId) {
    const url = ('https://script.googleapis.com/v1/projects/' + scriptId);
    const options = {
      "method": 'get',
      "headers": {
        "Authorization": "Bearer " + this.accessToken
      },
      "muteHttpExceptions": true,
    };
    const res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() == 200) {
      return JSON.parse(res);
    } else {
      console.error('❌ Error getting project details');
      console.error('Response code:', res.getResponseCode());
      console.error('Response:', res.getContentText());
      return false;
    }
  },

  /**
   * Gets the content of the source Apps Script project.
   * @param {string} scriptId - Script ID of the source project.
   * @return {Object|false} JSON representation of Apps Script project content (files array), or false on error.
   */
  getContent: function (scriptId) {
    const url = "https://script.googleapis.com/v1/projects/" + scriptId + "/content";
    const options = {
      "method": 'get',
      "headers": {
        "Authorization": "Bearer " + this.accessToken
      },
      "muteHttpExceptions": true,
    };
    let res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() == 200) {
      res = JSON.parse(res);
      return res['files'];
    } else {
      console.error('❌ Error obtaining content from source script');
      console.error('Response code:', res.getResponseCode());
      console.error('Response:', res.getContentText());
      return false;
    }
  },

  /**
   * Updates (copies) content from source to target Apps Script project.
   * @param {string} scriptId - Script ID of the target project.
   * @param {Object} files - JSON representation of Apps Script project content (files array).
   * @return {boolean} True if successful, false otherwise.
   */
  updateContent: function (scriptId, files) {
    const url = "https://script.googleapis.com/v1/projects/" + scriptId + "/content";
    const options = {
      "method": 'put',
      "headers": {
        "Authorization": "Bearer " + this.accessToken
      },
      "contentType": "application/json",
      "payload": JSON.stringify({ "files": files }),
      "muteHttpExceptions": true,
    };
    let res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() == 200) {
      return true;
    } else {
      console.error(`❌ Error updating content of script ${scriptId}`);
      console.error('Response code:', res.getResponseCode());
      console.error('Response:', res.getContentText());
      return false;
    }
  }
}
