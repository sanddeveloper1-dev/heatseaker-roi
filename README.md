# HeatSeaker ROI - Google Apps Script Project

Google Apps Script project for managing ROI tracking and processing across multiple horse racing track spreadsheets.

## Overview

This repository contains Google Apps Script code that:
- Distributes Apps Script code from a template spreadsheet to all track spreadsheets
- Synchronizes race data from backend database to Google Sheets
- Processes ROI data and creates dated tracking sheets
- Extracts and aggregates ROI totals

## Project Structure

### Core Files (Load Order)

1. **00-Config.js** - Centralized configuration (Slack channels, spreadsheet tabs, API URLs, template IDs)
2. **01-Tracks.js** - Track metadata (10 tracks with spreadsheet IDs, script IDs, track codes)
3. **02-Utilities.js** - Shared utility functions (data cleaning, validation, formatting)
4. **03-Generator.js** - Apps Script code distribution from template to all track spreadsheets
4. **04-DatabaseSync.js** - Daily database retrieval and tracking sheet synchronization
5. **05-ROIProcessing.js** - Daily ROI processing (creates dated TEE sheets from DATABASE entries)
6. **06-ROITotals.js** - ROI totals extraction (appends totals from date-named TEE sheets to TOTALS)

### Documentation

- **FILE_ORGANIZATION.md** - File organization and load order guide
- **VALIDATION_RULES.md** - Data validation rules for entries/winners
- **VALIDATION_VERIFICATION_PROMPT.md** - Prompt for verifying utility functions match other repository
- **DB_SCHEMA.md** - PostgreSQL database schema documentation
- **SERVICE_AGREEMENT.md** - Service agreement terms
- **ANALYSIS.md** - Data ingestion analysis

## Daily Workflow

1. **04-DatabaseSync.js** - `runDailyTrackingSync()`
   - Retrieves data from backend database
   - Populates DATABASE sheet
   - Syncs to TEE sheet
   - Appends to TOTALS sheet

2. **05-ROIProcessing.js** - `processRoiHistorical()`
   - Processes DATABASE entries
   - Creates dated TEE sheet copies (MM/dd/yy format)
   - Populates race data

3. **06-ROITotals.js** - `extractRoiTotals()`
   - Extracts totals from date-named TEE sheets
   - Appends to TOTALS sheet

**Note:** Daily data ingestion to the backend API occurs in a separate repository.

## Setup

1. Install `clasp` (Google Apps Script CLI):
   ```bash
   npm install -g @google/clasp
   ```

2. Login to Google:
   ```bash
   clasp login
   ```

3. Configure `.clasp.json` with your Apps Script project ID

4. Push code to Apps Script:
   ```bash
   clasp push
   ```

## Template Spreadsheet

- **Template ID**: `1sQZylzdKOs9lrhU9-Ru5pGygKl9XT4slYLepreV7BEY`
- **Template Name**: `Template-ROI`
- **Script ID**: `1948DumhjvI_dGKi0-zQUuTe01astuS8kqJOa7EdWY1koqKJ6sUMIhlYv`

The `03-Generator.js` script distributes Apps Script code from the template to all track spreadsheets.

## Tracks

Currently configured for 10 tracks:
- Aqueduct
- Belmont
- Churchill Downs
- Delmar
- Gulfstream
- Monmouth
- Parx
- Santa Anita
- Saratoga
- Woodbine

Track IDs and script IDs are configured in `01-Tracks.js`.

## Data Validation

Utility functions in `02-Utilities.js` handle:
- Numeric value cleaning and validation
- Currency formatting
- Percent value normalization
- Entry data validation
- Data sanitization

These functions must match the equivalent functions in the daily ingestion repository. See `VALIDATION_VERIFICATION_PROMPT.md` for verification instructions.

## License

Commercial Software - Copyright (c) 2024 Paul Stortini
Software Development & Maintenance by Alexander Meyer

See `SERVICE_AGREEMENT.md` for complete terms.
