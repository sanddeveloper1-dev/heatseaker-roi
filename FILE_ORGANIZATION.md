# File Organization Guide

## Overview

This repository is organized for Google Apps Script, where files load in **alphabetical order**. The numbering system ensures proper dependency loading.

## File Load Order

Files are loaded in this order (alphabetical):

1. **00-Config.js** - Configuration constants (loads first)
2. **01-Tracks.js** - Track metadata array (depends on Config)
3. **02-Utilities.js** - Shared utility functions
4. **03-Generator.js** - Apps Script code distribution
5. **04-DatabaseSync.js** - Daily database retrieval and tracking sheet sync
6. **05-ROIProcessing.js** - Daily ROI processing (creates dated TEE sheets)
7. **06-ROITotals.js** - ROI totals extraction (appends to TOTALS sheet)

## File Descriptions

### Core Configuration
- **00-Config.js**: Centralized configuration (Slack channels, spreadsheet tabs, column mappings, API URLs, template IDs)
- **01-Tracks.js**: Track metadata (10 tracks with IDs, codes, script IDs)

### Utilities
- **02-Utilities.js**: Shared functions for data cleaning, validation, formatting (numeric, currency, percent)

### Core Functionality
- **03-Generator.js**: Apps Script code distribution from template to all track spreadsheets

### Daily Database & ROI Processing
- **04-DatabaseSync.js**: Daily database retrieval and synchronization
  - Calls backend database API
  - Populates DATABASE sheet with previous day's entries
  - Moves DATABASE data into TEE sheet layout
  - Appends TEE totals to TOTALS tab
- **05-ROIProcessing.js**: Daily ROI processing
  - Processes DATABASE sheet entries
  - Creates dated copies of TEE sheet (MM/dd/yy format)
  - Populates race data from DATABASE entries
  - Tracks progress using Column G (Extracted flag)
- **06-ROITotals.js**: ROI totals extraction
  - Extracts totals from all date-named TEE sheets
  - Appends BET, COLLECT, BETS, WINS to TOTALS sheet
  - Skips duplicates (dates already in TOTALS)

## Documentation Files

- **README.md**: Project overview
- **SERVICE_AGREEMENT.md**: Service agreement terms
- **DB_SCHEMA.md**: PostgreSQL database schema documentation
- **VALIDATION_RULES.md**: Data validation rules for entries/winners
- **ANALYSIS.md**: Data ingestion analysis
- **db-script.sql**: SQL queries for database operations
- **FILE_ORGANIZATION.md**: This file

## Naming Convention

Files use a `NN-DescriptiveName.js` format where:
- `NN` = Two-digit number (00-99) controlling load order
- `DescriptiveName` = PascalCase descriptive name
- `.js` = JavaScript extension

This ensures:
1. Proper load order (alphabetical = numerical)
2. Easy identification of file purpose
3. Grouping of related functionality

## Dependencies

```
00-Config.js
  └──> 01-Tracks.js (uses Config)
  └──> 02-Utilities.js (uses Config)
  └──> 03-Generator.js (uses Config, tracks)
  └──> 04-DatabaseSync.js (uses Config)
  └──> 05-ROIProcessing.js (uses Config)
  └──> 06-ROITotals.js (uses Config)
```

## Daily Workflow

The typical daily workflow uses these files in sequence:

1. **04-DatabaseSync.js** - `runDailyTrackingSync()`
   - Retrieves data from backend database
   - Populates DATABASE sheet
   - Syncs to TEE sheet
   - Appends to TOTALS sheet

2. **05-ROIProcessing.js** - `processRoiHistorical()`
   - Processes DATABASE entries
   - Creates dated TEE sheet copies
   - Populates race data

3. **06-ROITotals.js** - `extractRoiTotals()`
   - Extracts totals from date-named TEE sheets
   - Appends to TOTALS sheet

Note: Daily data ingestion to the backend API occurs in a separate repository.

## Adding New Files

When adding new files:

1. **Determine load order**: What does it depend on?
2. **Choose number**: Use next available number in sequence
3. **Use descriptive name**: PascalCase, clear purpose
4. **Update this document**: Add to file descriptions

Example:
- If adding a new utility file that depends on Config: `08-NewUtility.js`
- If adding a new feature that depends on everything: `09-NewFeature.js`

## Google Apps Script Considerations

- **No subdirectories**: All files must be at root level
- **Alphabetical loading**: Files load in alphabetical order
- **Global scope**: All files share the same global scope
- **Function visibility**: Functions are globally accessible across files
- **Variable visibility**: Variables declared with `const`/`let` are file-scoped unless explicitly global
