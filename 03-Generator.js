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
 * Spreadsheet and Script Auto-Update Functionality
 * Used in Spreadsheet triggers
 * Updated - 2/9/25
 */

// Replace logic for rule changes to effect triggers on individual track spreadsheets
function updatePlaygroundScript() {
  console.log('UPDATING PLAYROUND')
  shareMacro_('17F_5USGsbMd-dDV16gmt90NuBLv2dw2ZSLhVJs_sUPoW40-DhkKHjWTE', tracks[0].scriptId)
}

function updateAppScript() {
  let sortedTracks = tracks.sort(SortArray);

  sortedTracks.forEach(track => {
    console.log(track.trackName)
    shareMacro_('17F_5USGsbMd-dDV16gmt90NuBLv2dw2ZSLhVJs_sUPoW40-DhkKHjWTE', track.scriptId)
  })
}

// Replace sheets on individual track spreadsheets
const replaceSheets = async () => {
  await replaceTemplates()
  replaceUtility()
}

// Generator function - note only use to create new spreadsheets.
// Requires all new spreadsheetId and scriptId changes in track on each use
function generateTrackSheets() {
  let sortedTracks = tracks.sort(SortArray);

  sortedTracks.forEach(track => {
    console.log(track.trackName)

    // Create Sheet
    const template = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("TEMPLATE");
    const utility = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("UTILITY");
    var file = SpreadsheetApp.create(track.trackName);

    // Copy template and clean up
    template.copyTo(file)
    utility.copyTo(file)
    var sheet = file.getSheetByName('Sheet1');
    file.deleteSheet(sheet);
    file.getSheetByName('Copy of TEMPLATE').setName(`${track.trackName}`)
    file.getSheetByName('Copy of UTILITY').setName('UTILITY')

    // Set cell values
    file.getSheetByName(`${track.trackName}`).getRange("E1").setValue(track.trackName)
    file.getSheetByName(`${track.trackName}`).getRange("AB1").setValue(track.trackName)
    file.getSheetByName('UTILITY').getRange("B1").setValue(track.trackName)
    file.getSheetByName(`${track.trackName}`).getRange("AB8").setValue(track.trackCode)
    file.getSheetByName(`${track.trackName}`).getRange("AB9").setValue(track.betTrackCode)
    file.getSheetByName(`${track.trackName}`).getRange("AB7").setValue(track.pickThreeValue)
    // file.getSheetByName(`${track.trackName}`).getRange("AB11").setValue(track.betTrackCode)
    if (track?.inactive) file.getSheetByName(`${track.trackName}`).getRange("AB12").setValue(track.inactive)

    // Move to alerts folder
    var folder = DriveApp.getFoldersByName("HeatSeaker").next(); //gets first folder with the given foldername
    var copyFile = DriveApp.getFileById(file.getId());

    // NOTE - these methods are deprecated, may need to be replaced if this generateTrackSheets is needed in the future.
    folder.addFile(copyFile);
    DriveApp.getRootFolder().removeFile(copyFile);

  })
}

function replaceTemplates() {
  let sortedTracks = tracks.sort(SortArray);

  console.log(sortedTracks)

  sortedTracks.forEach(track => {
    console.log(track.trackName, ' - TEMPLATE')

    // Copy template and clean up
    const template = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("TEMPLATE");
    var file = SpreadsheetApp.openById(`${track.id}`);

    var oldSheet = file.getSheetByName(`${track.trackName}`)
    file.deleteSheet(oldSheet)
    template.copyTo(file)
    file.getSheetByName('Copy of TEMPLATE').setName(`${track.trackName}`)

    // Set cell values
    file.getSheetByName(`${track.trackName}`).getRange("E1").setValue(track.trackName)
    file.getSheetByName(`${track.trackName}`).getRange("AB1").setValue(track.trackName)
    file.getSheetByName('UTILITY').getRange("B1").setValue(track.trackName)
    file.getSheetByName(`${track.trackName}`).getRange("AB8").setValue(track.trackCode)
    file.getSheetByName(`${track.trackName}`).getRange("AB9").setValue(track.betTrackCode)
    file.getSheetByName(`${track.trackName}`).getRange("AB7").setValue(track.pickThreeValue)
    // file.getSheetByName(`${track.trackName}`).getRange("AB11").setValue(track.betTrackCode)
    if (track?.inactive) file.getSheetByName(`${track.trackName}`).getRange("AB12").setValue(track.inactive)

    // Double Value for Gulfstream
    if (track?.doubleValue !== 2) {
      file.getSheetByName(`${track.trackName}`).getRange("AB13").setValue(track.doubleValue)
    }

  })

}

function replaceUtility() {
  let sortedTracks = tracks.sort(SortArray);

  sortedTracks.forEach(track => {
    console.log(track.trackName, '- UTILITY')

    // Copy template and clean up
    const utility = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("UTILITY");
    var file = SpreadsheetApp.openById(`${track.id}`);

    file.deleteActiveSheet()
    utility.copyTo(file)
    file.getSheetByName('Copy of UTILITY').setName('UTILITY')
    file.getSheetByName(`UTILITY`).getRange("B1").setValue(track.trackName)
  })
}

/**
 * Copies the RATIO TEMPLATE sheet to every track spreadsheet.
 * Non-destructive: does not delete any existing sheets, just adds or replaces the RATIO TEMPLATE.
 * Uses Config.TAB_RATIO_TEMPLATE for the template sheet name.
 *
 * Usage: Call pushRatioTemplateToAllTracks() to update all track spreadsheets with the latest RATIO TEMPLATE.
 */
function pushRatioTemplateToAllTracks() {
  let sortedTracks = tracks.sort(SortArray);

  sortedTracks.forEach(track => {
    console.log(track.trackName, '- RATIO TEMPLATE')

    // Copy RATIO TEMPLATE and clean up
    const ratioTemplate = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(Config.TAB_RATIO_TEMPLATE || 'RATIO TEMPLATE');
    var file = SpreadsheetApp.openById(`${track.id}`);

    // If a RATIO TEMPLATE already exists, delete it (non-destructive to other sheets)
    var oldRatioTemplate = file.getSheetByName(Config.TAB_RATIO_TEMPLATE || 'RATIO TEMPLATE');
    if (oldRatioTemplate) {
      file.deleteSheet(oldRatioTemplate);
    }
    ratioTemplate.copyTo(file);
    file.getSheetByName('Copy of ' + (Config.TAB_RATIO_TEMPLATE || 'RATIO TEMPLATE')).setName(Config.TAB_RATIO_TEMPLATE || 'RATIO TEMPLATE');
  })
}

/**
 * Copies the tracking tabs (TOTALS, TEE, DATABASE) from the master template
 * spreadsheet into every individual track spreadsheet. Existing versions of
 * these tabs on the destination file are removed before the fresh copy is added.
 *
 * DATABASE!J1 is updated with the track's trackCode so downstream automation
 * can determine which track-specific data to load.
 *
 * Usage: Call pushTrackingSheetsToAllTracks() whenever the template versions of
 * these tabs change and need to be redistributed.
 */
function pushTrackingSheetsToAllTracks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabsToPush = [
    { name: Config.TAB_TOTALS || 'TOTALS' },
    { name: Config.TAB_TEE || 'TEE' },
    { name: Config.TAB_DATABASE || 'DATABASE', trackCodeCell: 'J1' },
  ];

  tabsToPush.forEach(tab => {
    if (!ss.getSheetByName(tab.name)) {
      throw new Error(`Template sheet "${tab.name}" is missing from the master spreadsheet.`);
    }
  });

  let sortedTracks = tracks.sort(SortArray);

  sortedTracks.forEach(track => {
    console.log(`${track.trackName} - Tracking Tabs`);
    const file = SpreadsheetApp.openById(`${track.id}`);

    tabsToPush.forEach(tab => {
      const templateSheet = ss.getSheetByName(tab.name);
      if (!templateSheet) {
        console.warn(`Skipping ${tab.name} for ${track.trackName}: template not found.`);
        return;
      }

      const existingSheet = file.getSheetByName(tab.name);
      if (existingSheet) {
        file.deleteSheet(existingSheet);
      }

      const newSheet = templateSheet.copyTo(file);
      newSheet.setName(tab.name);

      if (tab.trackCodeCell && track.trackCode) {
        newSheet.getRange(tab.trackCodeCell).setValue(track.trackCode);
      }
    });
  });
}

/**
 * Uses Apps Script API to copy source Apps Script project 
 * to destination Google Spreadsheet container.
 * 
 * @param {string} sourceScriptId - Script ID of the source project.
 * @param {string} targetSpreadsheetUrl - URL if the target spreadsheet.
 * @return {Card[]} - Card indicating successful copy.
 */
function shareMacro_(sourceScriptId, targetScriptId) {

  // Gets the source project content using the Apps Script API.
  const sourceFiles = APPS_SCRIPT_API.getContent(sourceScriptId);

  // Updates the Apps Script project with the source project content.
  APPS_SCRIPT_API.updateContent(targetScriptId, sourceFiles);

}

/**
 * Function that encapsulates Apps Script API project manipulation. 
*/
const APPS_SCRIPT_API = {
  accessToken: ScriptApp.getOAuthToken(),

  /* APPS_SCRIPT_API.get
   * Gets Apps Script source project.
   * @param {string} scriptId - Script ID of the source project.
   * @return {Object} - JSON representation of source project.
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
      console.log('An error occurred gettting the project details');
      console.log(res.getResponseCode());
      console.log(res.getContentText());
      console.log(res);
      return false;
    }
  },

  /* APPS_SCRIPT_API.create
   * Creates new Apps Script project in the target spreadsheet.
   * @param {string} title - Name of Apps Script project.
   * @param {string} parentId - Internal ID of target spreadsheet.
   * @return {Object} - JSON representation completed project creation.
   */
  create: function (title, parentId) {
    const url = 'https://script.googleapis.com/v1/projects';
    const options = {
      "headers": {
        "Authorization": "Bearer " + this.accessToken,
        "Content-Type": "application/json"
      },
      "muteHttpExceptions": true,
      "method": "POST",
      "payload": { "title": title }
    }
    if (parentId) {
      options.payload.parentId = parentId;
    }
    options.payload = JSON.stringify(options.payload);
    let res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() == 200) {
      res = JSON.parse(res);
      return res;
    } else {
      console.log("An error occurred while creating the project");
      console.log(res.getResponseCode());
      console.log(res.getContentText());
      console.log(res);
      return false;
    }
  },
  /* APPS_SCRIPT_API.getContent
  * Gets the content of the source Apps Script project.
  * @param {string} scriptId - Script ID of the source project.
  * @return {Object} - JSON representation of Apps Script project content.
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
      console.log('An error occurred obtaining the content from the source script');
      console.log(res.getResponseCode());
      console.log(res.getContentText());
      console.log(res);
      return false;
    }
  },

  /* APPS_SCRIPT_API.updateContent
   * Updates (copies) content from source to target Apps Script project.
   * @param {string} scriptId - Script ID of the source project.
   * @param {Object} files - JSON representation of Apps Script project content.
   * @return {boolean} - Result status of the function.
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
      console.log(`An error occurred updating content of script ${scriptId}`);
      console.log(res.getResponseCode());
      console.log(res.getContentText());
      console.log(res);
      return false;
    }
  }
}
