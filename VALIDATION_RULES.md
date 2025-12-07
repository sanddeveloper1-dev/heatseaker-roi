# Validation Rules for Entries/Winners Data

This document provides comprehensive validation rules for horse racing entries and winners data before database ingestion. Use these rules to reproduce the validation logic in any script.

## Table of Contents
1. [Entry (Horse) Validation](#entry-horse-validation)
2. [Winner Validation](#winner-validation)
3. [Data Type Requirements](#data-type-requirements)
4. [Invalid/Empty Horse Detection](#invalidempty-horse-detection)
5. [Race-Level Validation](#race-level-validation)
6. [Field-Specific Validation](#field-specific-validation)
7. [Python Implementation Reference](#python-implementation-reference)

---

## Entry (Horse) Validation

### Required Fields
Each horse entry MUST have:
- `horse_number` (integer, required)
- `will_pay_2` (string, required for validation)
- `will_pay_1_p3` (string, required for validation)

### Validation Rules

#### 1. Horse Number Validation
- **Type:** Integer
- **Range:** Must be between 1 and 16 (inclusive)
- **Invalid:** `None`, `null`, non-integer values, values < 1, values > 16

```python
def is_valid_horse_number(horse_number):
    try:
        horse_num = int(horse_number)
        return 1 <= horse_num <= 16
    except (ValueError, TypeError):
        return False
```

#### 2. Will Pay 2 Validation
- **Type:** String (stored as VARCHAR(50) in database)
- **Required:** Must be present and non-empty
- **Invalid Values:** Case-insensitive check against:
  - `'SC'` (Scratched)
  - `'N/A'`
  - `'#VALUE!'`
  - `'#DIV/0!'`
  - `''` (empty string)
  - `None` or `null`

```python
INVALID_HORSE_VALUES = ['SC', 'N/A', '#VALUE!', '#DIV/0!', '']

def is_valid_will_pay_2(will_pay_2):
    if not will_pay_2:
        return False
    will_pay_2_upper = str(will_pay_2).upper().strip()
    return will_pay_2_upper not in INVALID_HORSE_VALUES
```

#### 3. Will Pay 1 P3 Validation
- **Type:** String (stored as VARCHAR(50) in database)
- **Required:** Must be present and non-empty
- **Invalid Values:** Same as `will_pay_2` (case-insensitive):
  - `'SC'`, `'N/A'`, `'#VALUE!'`, `'#DIV/0!'`, `''`, `None`

```python
def is_valid_will_pay_1_p3(will_pay_1_p3):
    if not will_pay_1_p3:
        return False
    will_pay_1_p3_upper = str(will_pay_1_p3).upper().strip()
    return will_pay_1_p3_upper not in INVALID_HORSE_VALUES
```

### Complete Horse Validation Function

```python
def validate_horse_data(horse_number, will_pay_2, will_pay_1_p3):
    """
    Validate individual horse data according to business rules.
    
    Returns True if horse is valid, False if scratched/invalid.
    """
    # Validate horse number
    if not is_valid_horse_number(horse_number):
        return False
    
    # Validate will_pay_2
    if not is_valid_will_pay_2(will_pay_2):
        return False
    
    # Validate will_pay_1_p3
    if not is_valid_will_pay_1_p3(will_pay_1_p3):
        return False
    
    return True
```

---

## Winner Validation

### Required Fields
Each race winner MUST have:
- `race_id` (string/text, required)
- `winning_horse_number` (integer, required)
- `winning_payout_2_dollar` (numeric, optional but recommended)
- `winning_payout_1_p3` (numeric, optional)

### Validation Rules

#### 1. Race ID Validation
- **Type:** String/Text
- **Format:** `TRACKCODE_YYYYMMDD_RACENUMBER` (e.g., `AQU_20250427_3`)
- **Required:** Must exist and be non-empty
- **Note:** Race must exist in database before winner can be stored

#### 2. Winning Horse Number Validation
- **Type:** Integer
- **Range:** Must be between 1 and 16 (inclusive)
- **Same validation as entry horse_number**

#### 3. Winning Payout Validation
- **Type:** Numeric (NUMERIC(10,2) in database)
- **Optional:** Can be `None` or missing
- **If present:** Must be convertible to float/decimal
- **Invalid:** Non-numeric strings, `'SC'`, `'N/A'`, etc.

```python
def safe_numeric(value):
    """Safely convert value to numeric, returning None for invalid values"""
    if value is None or value == '':
        return None
    
    try:
        # Handle percentage strings
        if isinstance(value, str) and '%' in value:
            return float(value.replace('%', ''))
        return float(value)
    except (ValueError, TypeError):
        return None
```

---

## Data Type Requirements

### Numeric Fields (NUMERIC(10,2) in database)
These fields should be converted to `float` or `Decimal`:
- `double`
- `constant`
- `correct_p3`
- `ml` (Morning Line)
- `live_odds`
- `action`
- `double_delta`
- `p3_delta`
- `x_figure`
- `winning_payout_2_dollar`
- `winning_payout_1_p3`

**Conversion Rules:**
- `None` → `None` (NULL in database)
- Empty string `''` → `None`
- Invalid values (`'SC'`, `'N/A'`, etc.) → `None`
- Percentage strings (e.g., `'107.44%'`) → Remove `%` and convert to float
- Valid numbers → Convert to float

### String Fields (VARCHAR in database)
These fields remain as strings:
- `p3` (VARCHAR(20)) - Can contain `'FALSE'` as valid value
- `sharp_percent` (VARCHAR(20)) - Can contain percentage strings like `"107.44%"`
- `will_pay_2` (VARCHAR(50))
- `will_pay` (VARCHAR(50))
- `will_pay_1_p3` (VARCHAR(50))
- `win_pool` (VARCHAR(50))
- `veto_rating` (VARCHAR(20))

**Special Cases:**
- `p3` field: Can be `'FALSE'` (string) or numeric value
- `sharp_percent`: Often contains percentage sign (e.g., `"107.44%"`)

### Integer Fields
- `horse_number` (1-16)
- `race_number` (1-15)
- `winning_horse_number` (1-16)

---

## Invalid/Empty Horse Detection

### How to Determine if a Horse is Invalid

A horse is considered **INVALID** and should be **SKIPPED** if ANY of the following are true:

1. **Horse number is invalid:**
   - Not an integer
   - Less than 1
   - Greater than 16

2. **will_pay_2 is invalid:**
   - Missing/None
   - Empty string
   - One of: `'SC'`, `'N/A'`, `'#VALUE!'`, `'#DIV/0!'` (case-insensitive)

3. **will_pay_1_p3 is invalid:**
   - Missing/None
   - Empty string
   - One of: `'SC'`, `'N/A'`, `'#VALUE!'`, `'#DIV/0!'` (case-insensitive)

### Implementation

```python
def is_horse_invalid(horse_data):
    """
    Determine if a horse should be skipped during ingestion.
    
    Returns True if horse is invalid (should be skipped), False if valid.
    """
    horse_number = horse_data.get('horse_number')
    will_pay_2 = horse_data.get('will_pay_2', '')
    will_pay_1_p3 = horse_data.get('will_pay_1_p3', '')
    
    # Use validation function (returns False for invalid horses)
    return not validate_horse_data(horse_number, will_pay_2, will_pay_1_p3)
```

---

## Race-Level Validation

### Race Number Filtering
- **Races 1-2:** Horse entries are **NOT processed** (skipped entirely)
- **Races 3-15:** Horse entries are processed
- **Note:** Race records themselves may be created for races 1-2, but no horse entries

```python
def should_process_race_entries(race_number):
    """Determine if horse entries should be processed for a race"""
    try:
        race_num = int(race_number)
        return race_num >= 3  # Only process races 3 and higher
    except (ValueError, TypeError):
        return False
```

### Minimum Horses Per Race
- **Rule:** Each race must have at least 3 valid horses
- **Validation:** After filtering invalid horses, if count < 3, race should be excluded

```python
MINIMUM_HORSES_PER_RACE = 3

def validate_race_block(race_block, min_horses=None):
    """
    Validate that a race block has enough valid horses.
    
    Args:
        race_block: List of horse data dictionaries
        min_horses: Minimum number of horses required (defaults to 3)
    """
    if min_horses is None:
        min_horses = MINIMUM_HORSES_PER_RACE
    
    # Filter out None/invalid horses
    valid_horses = [horse for horse in race_block if horse is not None]
    
    # Check each horse passes validation
    validated_horses = []
    for horse in valid_horses:
        if validate_horse_data(
            horse.get('horse_number'),
            horse.get('will_pay_2', ''),
            horse.get('will_pay_1_p3', '')
        ):
            validated_horses.append(horse)
    
    return len(validated_horses) >= min_horses
```

---

## Field-Specific Validation

### Numeric Field Normalization

```python
def normalize_numeric_field(value):
    """
    Normalize a numeric field value for database storage.
    
    Returns None for invalid values, float for valid numbers.
    """
    if value is None or value == '':
        return None
    
    # Check for invalid string values
    if isinstance(value, str):
        value_upper = value.upper().strip()
        invalid_values = ['SC', 'N/A', '#VALUE!', '#DIV/0!', 'FALSE', '']
        if value_upper in invalid_values:
            return None
        
        # Handle percentage strings
        if '%' in value:
            try:
                return float(value.replace('%', ''))
            except ValueError:
                return None
    
    # Try to convert to float
    try:
        return float(value)
    except (ValueError, TypeError):
        return None
```

### String Field Normalization

```python
def normalize_string_field(value):
    """
    Normalize a string field value for database storage.
    
    Returns None for invalid values, string for valid values.
    """
    if value is None:
        return None
    
    if isinstance(value, str):
        value_upper = value.upper().strip()
        invalid_values = ['SC', 'N/A', '#VALUE!', '#DIV/0!', '']
        
        # Empty string or invalid value
        if value_upper in invalid_values:
            return None
        
        # Return trimmed string
        return value.strip()
    
    # Convert to string if not already
    return str(value) if value is not None else None
```

### Special Field: `p3`
- **Type:** VARCHAR(20)
- **Can contain:** `'FALSE'` (as a string) or numeric values
- **Validation:** Don't reject `'FALSE'` - it's a valid value for this field

```python
def normalize_p3_field(value):
    """Normalize p3 field - allows 'FALSE' as valid value"""
    if value is None or value == '':
        return None
    
    if isinstance(value, str):
        value_upper = value.upper().strip()
        # 'FALSE' is valid for p3 field
        if value_upper == 'FALSE':
            return 'FALSE'
        
        # Other invalid values
        invalid_values = ['SC', 'N/A', '#VALUE!', '#DIV/0!']
        if value_upper in invalid_values:
            return None
        
        return value.strip()
    
    return str(value) if value is not None else None
```

---

## Python Implementation Reference

### Complete Validation Module

```python
#!/usr/bin/env python3
"""
Complete validation module for horse racing data.
Reproduces all validation logic from ingestion pipeline.
"""

# Configuration constants
MINIMUM_HORSES_PER_RACE = 3
MAX_HORSE_NUMBER = 16
INVALID_HORSE_VALUES = ['SC', 'N/A', '#VALUE!', '#DIV/0!', '']

def is_valid_horse_number(horse_number):
    """Check if horse number is valid (1-16)"""
    try:
        horse_num = int(horse_number)
        return 1 <= horse_num <= MAX_HORSE_NUMBER
    except (ValueError, TypeError):
        return False

def is_valid_will_pay_2(will_pay_2):
    """Check if will_pay_2 is valid"""
    if not will_pay_2:
        return False
    will_pay_2_upper = str(will_pay_2).upper().strip()
    return will_pay_2_upper not in INVALID_HORSE_VALUES

def is_valid_will_pay_1_p3(will_pay_1_p3):
    """Check if will_pay_1_p3 is valid"""
    if not will_pay_1_p3:
        return False
    will_pay_1_p3_upper = str(will_pay_1_p3).upper().strip()
    return will_pay_1_p3_upper not in INVALID_HORSE_VALUES

def validate_horse_data(horse_number, will_pay_2, will_pay_1_p3):
    """
    Validate individual horse data according to business rules.
    
    Returns True if horse data is valid, False otherwise.
    """
    # Validate horse number
    if not is_valid_horse_number(horse_number):
        return False
    
    # Validate will_pay_2
    if not is_valid_will_pay_2(will_pay_2):
        return False
    
    # Validate will_pay_1_p3
    if not is_valid_will_pay_1_p3(will_pay_1_p3):
        return False
    
    return True

def should_process_race_entries(race_number):
    """Determine if horse entries should be processed for a race"""
    try:
        race_num = int(race_number)
        return race_num >= 3  # Only process races 3 and higher
    except (ValueError, TypeError):
        return False

def validate_race_block(race_block, min_horses=None):
    """
    Validate that a race block has enough valid horses.
    
    Args:
        race_block: List of horse data dictionaries
        min_horses: Minimum number of horses required (defaults to 3)
    """
    if min_horses is None:
        min_horses = MINIMUM_HORSES_PER_RACE
    
    valid_horses = [horse for horse in race_block if horse is not None]
    
    if len(valid_horses) < min_horses:
        return False
    
    return True

def safe_numeric(value):
    """Safely convert value to numeric, returning None for invalid values"""
    if value is None or value == '':
        return None
    
    try:
        # Handle percentage strings
        if isinstance(value, str) and '%' in value:
            return float(value.replace('%', ''))
        return float(value)
    except (ValueError, TypeError):
        return None

def normalize_string_field(value):
    """Normalize a string field value for database storage"""
    if value is None:
        return None
    
    if isinstance(value, str):
        value_upper = value.upper().strip()
        invalid_values = ['SC', 'N/A', '#VALUE!', '#DIV/0!', '']
        
        if value_upper in invalid_values:
            return None
        
        return value.strip()
    
    return str(value) if value is not None else None

def normalize_p3_field(value):
    """Normalize p3 field - allows 'FALSE' as valid value"""
    if value is None or value == '':
        return None
    
    if isinstance(value, str):
        value_upper = value.upper().strip()
        if value_upper == 'FALSE':
            return 'FALSE'
        
        invalid_values = ['SC', 'N/A', '#VALUE!', '#DIV/0!']
        if value_upper in invalid_values:
            return None
        
        return value.strip()
    
    return str(value) if value is not None else None
```

### Usage Example

```python
# Example: Validate and filter horses before ingestion
def process_horses_for_race(race_number, horses):
    """Process horses for a race, filtering invalid ones"""
    
    # Skip races 1-2
    if not should_process_race_entries(race_number):
        return []
    
    # Filter valid horses
    valid_horses = []
    for horse in horses:
        horse_number = horse.get('horse_number')
        will_pay_2 = horse.get('will_pay_2', '')
        will_pay_1_p3 = horse.get('will_pay_1_p3', '')
        
        if validate_horse_data(horse_number, will_pay_2, will_pay_1_p3):
            valid_horses.append(horse)
    
    # Check minimum horses requirement
    if len(valid_horses) < MINIMUM_HORSES_PER_RACE:
        return []  # Skip race if not enough valid horses
    
    return valid_horses
```

---

## Summary Checklist

Before ingesting any horse entry, verify:

- [ ] **Horse number:** Integer between 1-16
- [ ] **will_pay_2:** Present, non-empty, not in invalid values list
- [ ] **will_pay_1_p3:** Present, non-empty, not in invalid values list
- [ ] **Race number:** >= 3 (for horse entries)
- [ ] **Race has minimum horses:** At least 3 valid horses after filtering

### Invalid Values (Case-Insensitive)
- `'SC'` (Scratched)
- `'N/A'`
- `'#VALUE!'`
- `'#DIV/0!'`
- `''` (empty string)
- `None` / `null`

### Data Type Mapping
- **Numeric fields:** Convert to float, use `None` for invalid values
- **String fields:** Keep as string, use `None` for invalid values
- **p3 field:** Special case - `'FALSE'` is valid
- **Percentage fields:** Remove `%` sign before converting to numeric

---

## Reference Files

- **Validation Logic:** `shared/validators/horse_validator.py`
- **Configuration:** `shared/config.py`
- **Ingestion Logic:** `ingestion/core/ingest_race_data.py`
- **Data Conversion:** `ingestion/utilities/data_converter.py`
- **Database Schema:** `ingestion/database/schema.sql`
- **Models:** `ingestion/database/models.py`

