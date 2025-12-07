# Database Schema Documentation

This document provides the complete database schema for the HeatSeaker Backend application.

**Database System:** PostgreSQL

---

## Table: `tracks`

Stores information about horse racing tracks.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing track ID |
| `code` | VARCHAR(10) | UNIQUE, NOT NULL | Unique track code (e.g., 'AQU', 'BEL') |
| `name` | VARCHAR(255) | NOT NULL | Full track name (e.g., 'AQUEDUCT', 'BELMONT') |
| `location` | VARCHAR(255) | NULLABLE | Optional location information |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record update timestamp |

### Indexes
- Primary key index on `id`
- Unique index on `code`

---

## Table: `races`

Stores information about individual races.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR(50) | PRIMARY KEY | Race ID (format: TRACKCODE_YYYYMMDD_RACENUMBER) |
| `track_id` | INTEGER | FOREIGN KEY → tracks(id) | Reference to tracks table |
| `date` | DATE | NOT NULL | Race date (YYYY-MM-DD format) |
| `race_number` | INTEGER | NOT NULL | Race number (typically 3-15) |
| `post_time` | TIME | NULLABLE | Race post time |
| `source_file` | VARCHAR(255) | NULLABLE | Original source identifier |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record update timestamp |

### Indexes
- Primary key index on `id`
- Foreign key index on `track_id`

### Relationships
- `track_id` → `tracks.id`

---

## Table: `race_entries`

Stores detailed information about each horse entry in a race.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing entry ID |
| `race_id` | VARCHAR(50) | FOREIGN KEY → races(id) | Reference to races table |
| `horse_number` | INTEGER | NOT NULL | Horse number (1-16) |
| `double` | DECIMAL(5,2) | NULLABLE | Double odds |
| `constant` | DECIMAL(5,2) | NULLABLE | Constant value |
| `p3` | VARCHAR | NULLABLE | Pick 3 value (string to handle 'FALSE' values) |
| `correct_p3` | DECIMAL | NULLABLE | Correct P3 value |
| `ml` | DECIMAL(5,2) | NULLABLE | Morning line odds |
| `live_odds` | DECIMAL(5,2) | NULLABLE | Live odds |
| `sharp_percent` | VARCHAR(20) | NULLABLE | Sharp action percentage |
| `action` | DECIMAL(5,2) | NULLABLE | Action value |
| `double_delta` | DECIMAL(5,2) | NULLABLE | Double delta |
| `p3_delta` | DECIMAL(5,2) | NULLABLE | P3 delta |
| `x_figure` | DECIMAL(5,2) | NULLABLE | X figure |
| `will_pay_2` | VARCHAR(50) | NULLABLE | $2 Will Pay amount |
| `will_pay` | VARCHAR | NULLABLE | Will Pay amount (general) |
| `will_pay_1_p3` | VARCHAR(50) | NULLABLE | $1 P3 Will Pay amount |
| `win_pool` | VARCHAR(50) | NULLABLE | Win pool amount |
| `veto_rating` | VARCHAR(50) | NULLABLE | Veto rating |
| `raw_data` | TEXT | NULLABLE | Raw extracted data |
| `source_file` | VARCHAR(255) | NULLABLE | Original source identifier |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record update timestamp |

### Indexes
- Primary key index on `id`
- Foreign key index on `race_id`
- Composite index recommended on (`race_id`, `horse_number`) for lookups

### Relationships
- `race_id` → `races.id`

### Notes
- Unique constraint implied by application logic: (`race_id`, `horse_number`)

---

## Table: `race_winners`

Stores information about race winners with extraction metadata.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing winner ID |
| `race_id` | TEXT | FOREIGN KEY → races(id), UNIQUE, NOT NULL | Reference to races table (one winner per race) |
| `winning_horse_number` | INTEGER | NOT NULL, CHECK (1-16) | Horse number that won the race |
| `winning_payout_2_dollar` | NUMERIC(10,2) | NULLABLE | $2 payout for the winner |
| `winning_payout_1_p3` | NUMERIC(10,2) | NULLABLE | $1 P3 payout for the winner (optional) |
| `extraction_method` | VARCHAR(50) | NULLABLE | Method: 'simple_correct', 'header', 'summary', 'cross_reference' |
| `extraction_confidence` | VARCHAR(20) | NULLABLE | Confidence: 'high', 'medium', 'low' |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record update timestamp |

### Indexes
- Primary key index on `id`
- Unique index on `race_id` (enforced by UNIQUE constraint)
- Index on `race_id` (`idx_race_winners_race_id`)
- Index on `winning_horse_number` (`idx_race_winners_horse_number`)
- Index on `extraction_method` (`idx_race_winners_extraction_method`)
- Index on `extraction_confidence` (`idx_race_winners_confidence`)
- Index on `created_at` (`idx_race_winners_created_at`)

### Constraints
- `winning_horse_number_valid`: CHECK (winning_horse_number >= 1 AND winning_horse_number <= 16)
- `unique_winner_per_race`: UNIQUE (race_id)
- Foreign key constraint: `race_id` → `races(id)` ON DELETE CASCADE

### Relationships
- `race_id` → `races.id` (CASCADE DELETE)

---

## Table: `migrations`

Tracks applied database migrations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing migration ID |
| `version` | VARCHAR(50) | UNIQUE, NOT NULL | Migration version identifier |
| `description` | TEXT | NOT NULL | Migration description |
| `applied_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | When migration was applied |
| `checksum` | VARCHAR(64) | NOT NULL | Migration file checksum |
| `execution_time_ms` | INTEGER | NULLABLE | Migration execution time in milliseconds |
| `status` | VARCHAR(20) | DEFAULT 'success' | Migration status |

### Indexes
- Primary key index on `id`
- Unique index on `version`

---

## Entity Relationship Diagram (Text Representation)

```
tracks (1) ──< (many) races
                │
                │ (1)
                │
                ├──< (many) race_entries
                │
                │ (1)
                │
                └──< (1) race_winners
```

### Relationship Details:
- **tracks → races**: One-to-Many (one track has many races)
- **races → race_entries**: One-to-Many (one race has many entries/horses)
- **races → race_winners**: One-to-One (one race has one winner)

---

## Common Query Patterns

### Get all races for a track
```sql
SELECT r.*, t.name as track_name 
FROM races r 
JOIN tracks t ON r.track_id = t.id 
WHERE t.code = 'AQU'
ORDER BY r.date DESC, r.race_number;
```

### Get all entries for a race
```sql
SELECT * FROM race_entries 
WHERE race_id = 'AQU_20240115_5'
ORDER BY horse_number;
```

### Get race with winner information
```sql
SELECT r.*, rw.winning_horse_number, rw.winning_payout_2_dollar
FROM races r
LEFT JOIN race_winners rw ON r.id = rw.race_id
WHERE r.id = 'AQU_20240115_5';
```

### Get races by date range with entries
```sql
SELECT r.*, re.horse_number, re.ml, re.live_odds
FROM races r
JOIN race_entries re ON r.id = re.race_id
WHERE r.date BETWEEN '2024-01-01' AND '2024-01-31'
ORDER BY r.date, r.race_number, re.horse_number;
```

