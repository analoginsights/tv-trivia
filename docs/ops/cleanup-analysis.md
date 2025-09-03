# Cleanup Analysis for TV Trivia App

## Current Architecture
- Single Next.js application (not monorepo)  
- Two main games: RealityGrid and GuessWho
- 27 app router entrypoints (pages/routes)
- 43 scripts total, 18 used in package.json

## Potentially Unused Scripts (25 files)
These scripts are not referenced in package.json and may be candidates for cleanup:

1. `analyze-foreign-key-issues.ts`
2. `check-data-integrity.ts` 
3. `check-foreign-keys.ts`
4. `clean-and-exclude-show.ts`
5. `clean-corrupted-data.ts`
6. `debug-eligibility.ts` 
7. `debug-etl-data.ts`
8. `debug-etl-distribution.ts`
9. `env-loader.ts`
10. `etl-bravo-final.ts`
11. `etl-bravo-fixed-chunked.ts`
12. `etl-bravo-fixed-excluded.ts`
13. `etl-bravo-fixed.ts`
14. `fetch-bravo-data.ts`
15. `generate-improved-puzzle.ts`
16. `generate-optimal-puzzle.ts`
17. `generate-working-puzzle.ts`
18. `investigate-database.ts`
19. `investigate-distribution-issue.ts`
20. `reconcile-data.ts`
21. `run-schema.ts`
22. `setup-supabase.ts`
23. `test-etl-fixed.ts`
24. `test-intersection-logic.ts`
25. `test-upsert.ts`

## Refactoring Opportunities

### 1. Shared Components/Utils
- `src/components/PixelatedImage.tsx` - Used by GuessWho
- `src/hooks/useRevealPixelSize.ts` - Used by GuessWho  
- `src/lib/supabase.ts` - Database client (shared)
- `src/lib/tmdb.ts` - TMDB API client (shared)
- `src/lib/puzzle-generator.ts` - Puzzle logic (shared)

### 2. Environment Variables
Currently scattered across files, should be centralized.

### 3. Static/Public Assets
- Several SVG files in public/ that may not be used

## Next Steps
1. Verify unused scripts don't have hidden dependencies
2. Check if any scripts are called by CI/cron jobs
3. Move shared utilities to organized structure
4. Archive/delete confirmed unused files