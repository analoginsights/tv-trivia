# Reality Grid Setup Instructions

## Step 1: Database Setup

First, you need to create the database schema in Supabase. 

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/mogxzirfhrukvdpemnel
2. Navigate to the SQL Editor
3. Copy and paste the entire contents of `/supabase/realitygrid-schema.sql` into the editor
4. Click "Run" to execute the SQL

This will create:
- The `realitygrid` schema
- All necessary tables (shows, people, appearances, daily_puzzles, daily_cells)
- Views and functions for eligibility calculations
- Row Level Security policies

## Step 2: Run the ETL Pipeline

After the database schema is created, run these commands in order:

```bash
# 1. Fetch and cache Bravo shows/cast from TMDB (takes ~5 minutes)
npm run etl:bravo

# 2. Calculate eligibility (people who appear in ≥3 shows)
npm run etl:eligibility  

# 3. Check data quality
npm run etl:quality

# 4. Generate today's puzzle
npm run etl:generate-puzzle
```

Or run all at once:
```bash
npm run etl:all && npm run etl:generate-puzzle
```

## Step 3: Test the API

```bash
# In one terminal, start the dev server:
npm run dev

# In another terminal, test the endpoints:
npm run test:api
```

## Expected Results

After successful setup, you should have:
- ✅ 60 Bravo shows cached
- ✅ 3000+ people in the database
- ✅ 4000+ appearances recorded
- ✅ 200+ eligible people (appeared in ≥3 shows)
- ✅ A daily puzzle generated with valid intersections
- ✅ All API endpoints returning data

## Troubleshooting

### "Could not find the table" error
- Make sure you ran the SQL schema in Supabase first
- Check that the schema name is `realitygrid` (not `public`)

### No eligible people found
- Run the eligibility derivation: `npm run etl:eligibility`
- Check that the ETL completed successfully

### Puzzle generation fails
- Ensure you have enough data (run ETL first)
- Check that eligibility was calculated
- Verify the eligible_appearances_view exists

## Next Steps

Once all tests pass, the UI can be built using these stable API endpoints:
- `/api/realitygrid/puzzle/today` - Get daily puzzle
- `/api/realitygrid/typeahead?q=...` - Search people
- `/api/realitygrid/validate` - Check answers