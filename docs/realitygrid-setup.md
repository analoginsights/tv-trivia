# Reality Grid - Data-First Setup Guide

## Overview
Reality Grid is a game where players identify reality TV personalities who appeared in both a row show and column show. This guide covers the data-first validation approach before UI implementation.

## Prerequisites

### Environment Variables
Add these to your `.env.local`:
```
TMDB_READ_TOKEN=<your_bearer_token>
TMDB_LANG=en-US
NEXT_PUBLIC_SUPABASE_URL=<your_supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_anon_key>
SUPABASE_SERVICE_ROLE=<your_service_role_key>
```

### Database Setup
1. Run the schema setup SQL in your Supabase project:
```bash
# Execute supabase/realitygrid-schema.sql in your Supabase SQL editor
```

## Step-by-Step Data Validation

### 1. Extract and Cache Bravo Data
```bash
npm run etl:bravo
```
This fetches Bravo shows and cast from TMDB and caches them in Supabase.

### 2. Derive Eligibility
```bash
npm run etl:eligibility
```
Marks people as eligible if they appear in ≥3 Bravo series.

### 3. Run Data Quality Checks
```bash
npm run etl:quality
```
Verifies data sufficiency for puzzle generation.

### 4. Generate Daily Puzzle
```bash
npm run etl:generate-puzzle
```
Creates today's 3×3 grid puzzle with valid intersections.

### 5. Test API Endpoints
```bash
npm run dev  # In one terminal
npm run test:api  # In another terminal
```

## API Endpoints

### GET /api/realitygrid/puzzle/today
Returns the daily puzzle with show information and cell counts.

### GET /api/realitygrid/typeahead?q={query}
Search for eligible people (autocomplete).

### POST /api/realitygrid/validate
Validates a guess for a specific cell.
```json
{
  "puzzle_id": "uuid",
  "r": 0,
  "c": 1,
  "person_id": 12345
}
```

## Acceptance Criteria

✅ **Data Requirements**
- [ ] At least 50 shows cached
- [ ] At least 2,000 appearances
- [ ] At least 200 eligible people
- [ ] Valid 3×3 grids can be generated

✅ **API Requirements**
- [ ] No TMDB calls during gameplay
- [ ] All data served from Supabase
- [ ] Puzzle identical for all users per UTC day
- [ ] Typeahead only returns eligible people

## Troubleshooting

### Low Eligible People Count
- Run ETL with more pages: Modify `ETL_PAGES` in `scripts/etl-bravo-data.ts`
- Re-run eligibility derivation after new data

### Empty Intersections
- Increase dataset size
- Verify eligibility was derived correctly
- Check that eligible_appearances_view exists

### Missing Images
- Handle null poster_path/profile_path with placeholders
- Use TMDB image base: `https://image.tmdb.org/t/p/w185`

## Next Steps After Validation

1. Implement UI components (grid, typeahead, validation)
2. Add edge caching for puzzle endpoint
3. Implement user session tracking
4. Add game statistics and leaderboards