# File Organization Guide

## Overview

This repository is organized for Google Apps Script, where files load in **alphabetical order**. The numbering system ensures proper dependency loading.

## File Load Order

Files are loaded in this order (alphabetical):

1. **00-Config.js** - Configuration constants (loads first)
2. **01-Tracks.js** - Track metadata array (depends on Config)
3. **02-Utilities.js** - Shared utility functions
4. **03-Generator.js** - Spreadsheet generation and template management
5. **04-DataIngestion.js** - Daily data ingestion to backend
6. **05-DBRetrieval.js** - Database retrieval and tracking sheet sync
7. **06-ROIHistorical.js** - Historical ROI processing
8. **07-ROITotals.js** - ROI totals extraction
9. **08-HistoricalIngestion.js** - Historical data re-ingestion

## File Descriptions

### Core Configuration
- **00-Config.js**: Centralized configuration (Slack channels, spreadsheet tabs, column mappings, API URLs)
- **01-Tracks.js**: Track metadata (25+ tracks with IDs, codes, script IDs)

### Utilities
- **02-Utilities.js**: Shared functions for data cleaning, validation, formatting (numeric, currency, percent)

### Core Functionality
- **03-Generator.js**: Spreadsheet generation, template distribution, Apps Script updates
- **04-DataIngestion.js**: Daily race data ingestion from Google Sheets to backend API
- **05-DBRetrieval.js**: Database retrieval and synchronization with tracking sheets (DATABASE, TEE, TOTALS)

### ROI Processing
- **06-ROIHistorical.js**: Processes DATABASE entries, creates dated TEE sheet copies
- **07-ROITotals.js**: Extracts totals from date-named TEE sheets, appends to TOTALS

### Historical Data
- **08-HistoricalIngestion.js**: Historical data re-ingestion with AG2 cell marking

## Documentation Files

- **README.md**: Project overview
- **SERVICE_AGREEMENT.md**: Service agreement terms
- **TEMPLATE_GENERATOR_GUIDE.md**: Detailed guide on how the template generator works
- **DB_SCHEMA.md**: PostgreSQL database schema documentation
- **VALIDATION_RULES.md**: Data validation rules for entries/winners
- **ANALYSIS.md**: Data ingestion analysis
- **db-script.sql**: SQL queries for database operations

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
  └──> 04-DataIngestion.js (uses Config, tracks, utilities)
  └──> 05-DBRetrieval.js (uses Config)
  └──> 06-ROIHistorical.js (uses Config)
  └──> 07-ROITotals.js (uses Config)
  └──> 08-HistoricalIngestion.js (uses Config, tracks, utilities)
```

## Adding New Files

When adding new files:

1. **Determine load order**: What does it depend on?
2. **Choose number**: Use next available number in sequence
3. **Use descriptive name**: PascalCase, clear purpose
4. **Update this document**: Add to file descriptions

Example:
- If adding a new utility file that depends on Config: `09-NewUtility.js`
- If adding a new feature that depends on everything: `10-NewFeature.js`

## Google Apps Script Considerations

- **No subdirectories**: All files must be at root level
- **Alphabetical loading**: Files load in alphabetical order
- **Global scope**: All files share the same global scope
- **Function visibility**: Functions are globally accessible across files
- **Variable visibility**: Variables declared with `const`/`let` are file-scoped unless explicitly global

