# TV Trivia

A Next.js application featuring TV-themed trivia games, starting with Reality Grid - a puzzle game about reality TV show connections.

## 🎮 Games

### Reality Grid
A 3×3 grid puzzle where players identify reality TV personalities who appeared in both the row show and column show. Think of it as the intersection of reality TV knowledge!

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Supabase account
- TMDB API access (for data fetching)

### Environment Setup
1. Copy `.env.local.example` to `.env.local`
2. Fill in your API keys and Supabase credentials

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to see the app.

## 📊 Reality Grid Data Setup

Reality Grid requires a data-first validation approach before UI work. Follow these steps:

### 1. Database Setup
Execute the schema SQL in your Supabase project:
```sql
-- See supabase/realitygrid-schema.sql
```

### 2. Data Pipeline
```bash
# Extract and cache Bravo shows/cast from TMDB
npm run etl:bravo

# Derive eligibility (≥3 Bravo series appearances)
npm run etl:eligibility

# Run data quality checks
npm run etl:quality

# Generate today's puzzle
npm run etl:generate-puzzle

# Or run all ETL steps
npm run etl:all
```

### 3. API Testing
```bash
# Start dev server
npm run dev

# In another terminal, test endpoints
npm run test:api
```

## 🔌 API Endpoints

### Reality Grid APIs

#### GET /api/realitygrid/puzzle/today
Returns the daily puzzle with shows and cell information.

#### GET /api/realitygrid/typeahead?q={query}
Search for eligible reality TV personalities.

#### POST /api/realitygrid/validate
Validate a guess for a specific cell.

## 📁 Project Structure

```
tv-trivia/
├── src/
│   ├── app/                 # Next.js app router
│   │   ├── api/             # API routes
│   │   │   └── realitygrid/ # Reality Grid endpoints
│   │   ├── realitygrid/     # Reality Grid game page
│   │   └── page.tsx         # Homepage
│   ├── components/
│   │   └── layout/          # Header/Footer components
│   └── lib/                 # Utilities
│       ├── supabase.ts      # Database client
│       ├── tmdb.ts          # TMDB API wrapper
│       └── puzzle-generator.ts
├── scripts/                 # ETL and testing scripts
├── supabase/               # Database schemas
└── docs/                   # Documentation
```

## 🧪 Testing

### Data Quality Checks
```bash
npm run etl:quality
```

### API Endpoint Tests
```bash
npm run test:api
```

## 📝 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run etl:bravo` - Fetch Bravo data from TMDB
- `npm run etl:eligibility` - Calculate person eligibility
- `npm run etl:quality` - Run data quality checks
- `npm run etl:generate-puzzle` - Generate daily puzzle
- `npm run etl:all` - Run complete ETL pipeline
- `npm run test:api` - Test API endpoints

## 🎯 Acceptance Criteria

### Data Requirements
- ✅ At least 50 Bravo shows cached
- ✅ At least 2,000 appearances recorded
- ✅ At least 200 eligible people (≥3 shows)
- ✅ Valid 3×3 grids can be generated

### Technical Requirements
- ✅ No TMDB calls during gameplay
- ✅ All data served from Supabase
- ✅ Daily puzzle identical for all users
- ✅ RLS policies for read-only public access

## 🚧 Troubleshooting

### Low Eligible People Count
- Increase `ETL_PAGES` in `scripts/etl-bravo-data.ts`
- Re-run eligibility derivation after new data

### Empty Grid Intersections
- Expand dataset with more shows
- Verify eligibility calculation completed
- Check materialized views are refreshed

### Missing Images
- Handle null paths with placeholders
- Use TMDB image base URL: `https://image.tmdb.org/t/p/w185`

## 🔮 Future Enhancements
- Additional trivia games beyond Reality Grid
- User accounts and score tracking
- Multiplayer challenges
- Daily/weekly leaderboards
- Social sharing features

## 📚 Documentation
See `/docs` folder for detailed documentation:
- `realitygrid-setup.md` - Complete Reality Grid setup guide

## 🤝 Contributing
Contributions are welcome! Please ensure all data validation tests pass before submitting PRs.

## 📄 License
[MIT](LICENSE)