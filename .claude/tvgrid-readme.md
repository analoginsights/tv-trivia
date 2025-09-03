PRD: TV Grid

Overview

TV Grid is a daily puzzle game inspired by “Immaculate Grid” and “Movie Grid,” where players must identify TV shows that satisfy the intersection of a row clue (actor/character) and a column clue (category/condition). The goal is to correctly fill in the 3x3 grid using only 9 guesses.

The game is designed for quick, daily play (~2–5 minutes), built for replayability with new grids each day.

⸻

Objectives
	1.	Create a fun, repeatable trivia game focused on TV knowledge.
	2.	Encourage players to think across actors, series, and categories.
	3.	Optimize for shareability (users can post their grid results).
	4.	Ensure clean UX: easy input, instant validation, visual feedback.

⸻

Gameplay Rules
	1.	Grid Structure
	•	3x3 grid (9 cells).
	•	Rows = actors/characters.
	•	Columns = categories (e.g., “More than 2 seasons,” “Pilot Released 2000–2025”).
	2.	Guesses
	•	Players have 9 guesses total to fill all 9 cells.
	•	Each guess (correct or incorrect) consumes 1 attempt.
	•	A show cannot be reused across multiple cells.
	3.	Correct Answer
	•	If a correct show is entered, display its poster image in the cell.
	•	Show remains locked in place.
	4.	Incorrect Answer
	•	Deduct 1 guess.
	•	Show error feedback (red border or shake animation).
	5.	Input Mechanics
	•	Click an empty cell to open a searchable dropdown of shows.
	•	Results pulled from TMDB API (or pre-curated Supabase dataset), ordered by popularity.
	•	Input must exactly match show title (including punctuation).
	6.	Additional Rules
	•	Hyphenated words count as one word (e.g., “Knock-Off” = 1 word).
	•	Actor clues are acting credits only (not directing).
	•	Each show may only be used once per grid.
	7.	Win Condition
	•	Game ends when either:
	•	All 9 cells are filled correctly, OR
	•	Player runs out of 9 guesses.
	•	Show summary screen: correct grid, guess count, success/fail message.

⸻

UI/UX
	1.	Grid Layout
	•	Left side = row headers (actors).
	•	Top side = column headers (categories).
	•	Center = 9 empty cells.
	2.	Interactions
	•	Hover/click on actor name → display headshot popup.
	•	Hover/click on category → display expanded description.
	•	Filled cell shows poster thumbnail with hover tooltip = show title.
	3.	Feedback
	•	Correct = cell fills with poster.
	•	Incorrect = flash red, consume guess.
	•	Guesses left = counter on right.
	4.	Mobile UX
	•	Grid remains square but scrolls vertically.
	•	Actor/category labels fixed/sticky for clarity.

⸻

Scoring & Social
	•	Share button generates emoji-based grid summary (green = correct, red = wrong, gray = skipped).
	•	Example share:

TV Grid #12
🟩🟩🟩
🟩🟥⬜
🟩🟩🟩
Guesses: 8/9



⸻

Data & Content
	1.	Source of Truth
	•	Use TMDB API for shows, cast, posters.
	•	Supabase stores:
	•	Daily grid config (actors + categories).
	•	Player submissions & results.
	2.	Validation
	•	For each grid cell, valid answers = intersection of actor’s credited shows and category filters.
	3.	Supabase Tables (example)
	•	tv_grid_days (id, date, row_actors, column_categories, created_at)
	•	tv_grid_answers (day_id, actor_id, category_id, valid_show_ids[])
	•	tv_grid_submissions (user_id, day_id, guesses, result_grid)

⸻



⸻

{
“title”: “CLAUDE PLAN: Build ‘TV Grid’ Daily Game (Immaculate-Grid-style for TV)”,
“where_to_build”: {
“repo_folder”: “/apps/tv-grid”,
“reason”: “Keep this app isolated from other games (Timeline, Guess Who, etc.) while sharing common libs if needed (/packages).”
},
“goals”: [
“Ship a 3x3 daily TV Grid game: rows are people (actors), columns are SQL-inferable category clues, each cell requires a TV series that satisfies both.”,
“Use TMDB data mirrored into Supabase. Validation runs ONLY on DB-side facts (no external calls during play).”,
“Provide shareable results, exact-title search UX, and strict guess limits (9 total).”,
“Create schema, data loaders, generated columns, and indexes to make validation fast.”
],
“stack”: {
“frontend”: “Next.js 14 (app router) + TypeScript + Tailwind + shadcn/ui”,
“backend”: “Next.js API routes (server actions) + Supabase JS client (RLS-safe)”,
“db”: “Supabase Postgres + SQL functions + generated columns + partial indexes”,
“auth”: “Supabase Auth (anonymous session OK for play, optional user accounts for streaks)”,
“images”: “TMDB image CDN for posters/headshots (never re-host)”
},
“env_vars”: {
“NEXT_PUBLIC_SUPABASE_URL”: “”,
“NEXT_PUBLIC_SUPABASE_ANON_KEY”: “”,
“TMDB_API_KEY”: “<server-side only if you create offline ETL; runtime play does NOT call TMDB>”,
“SITE_URL”: “http://localhost:3000”
},
“file_boundaries”: {
“safe_to_edit”: [
“/apps/tv-grid/app/”,
“/apps/tv-grid/pages/”,
“/apps/tv-grid/src/”,
“/apps/tv-grid/scripts/”,
“/apps/tv-grid/docs/”
],
“do_not_touch”: [
“/node_modules/”,
“/.next/”,
“/.vercel/”,
“/apps//public/3rdparty/**”
]
},
“database”: {
“notes”: [
“This schema targets TV series only (not movies) because column categories rely on series fields like first_air_date, number_of_seasons, status, genres, etc.”,
“Hyphenated words count as one word for title word-count logic.”,
“Genres use TMDB IDs and names provided by user.”
],
“sql_setup”: {
“ddl”: “– ===============================\n– CORE CONTENT TABLES (TMDB mirror)\n– ===============================\ncreate table if not exists public.tv_series (\n  id bigint primary key,                  – TMDB series id\n  name text not null,\n  first_air_date date,\n  status text,                            – e.g., ‘Ended’, ‘Returning Series’, ‘In Production’\n  number_of_seasons int,\n  number_of_episodes int,\n  original_language text,\n  origin_country text[] default ‘{}’,\n  poster_path text,                       – store TMDB poster path; render via TMDB base URL\n  popularity numeric,\n  updated_at timestamptz default now()\n);\n\ncreate table if not exists public.genres (\n  id int primary key,                     – TMDB genre id\n  name text not null\n);\n\ncreate table if not exists public.series_genres (\n  series_id bigint references public.tv_series(id) on delete cascade,\n  genre_id int references public.genres(id) on delete cascade,\n  primary key (series_id, genre_id)\n);\n\n– People and credits (for row clues)\ncreate table if not exists public.people (\n  id bigint primary key,                  – TMDB person id\n  name text not null,\n  profile_path text\n);\n\n– Acting credits only (exclude ‘Directing’ dept for grid validation)\ncreate table if not exists public.tv_credits (\n  person_id bigint references public.people(id) on delete cascade,\n  series_id bigint references public.tv_series(id) on delete cascade,\n  job text,                               – null for acting, else specific crew job\n  department text,                        – e.g., ‘Acting’, ‘Directing’, ‘Writing’\n  character text,\n  primary key(person_id, series_id, coalesce(job, ‘acting’))\n);\n\n– ===============================\n– GENERATED COLUMNS & HELPERS\n– ===============================\ncreate or replace function public.tvgrid_word_count(title text)\nreturns int language sql immutable as $$\n  select coalesce(\n    cardinality(\n      regexp_split_to_array(\n        regexp_replace(btrim(title), ‘([[:alnum:]]+)-([[:alnum:]]+)’, ‘\1\2’, ‘g’),\n        ‘\\s+’\n      )\n    ), 0\n  );\n$$;\n\nalter table public.tv_series\n  add column if not exists title_word_count int\n    generated always as (public.tvgrid_word_count(name)) stored,\n  add column if not exists first_air_year int\n    generated always as (extract(year from first_air_date)::int) stored,\n\n  – word buckets\n  add column if not exists is_1_word_title boolean generated always as (title_word_count = 1) stored,\n  add column if not exists is_2_word_title boolean generated always as (title_word_count = 2) stored,\n  add column if not exists is_3_word_title boolean generated always as (title_word_count >= 3) stored,\n\n  – decades\n  add column if not exists is_1980s boolean generated always as (first_air_year between 1980 and 1989) stored,\n  add column if not exists is_1990s boolean generated always as (first_air_year between 1990 and 1999) stored,\n  add column if not exists is_2000s boolean generated always as (first_air_year between 2000 and 2009) stored,\n  add column if not exists is_2010s boolean generated always as (first_air_year between 2010 and 2019) stored,\n  add column if not exists is_2020s boolean generated always as (first_air_year between 2020 and 2029) stored,\n\n  – season thresholds + ended\n  add column if not exists is_ended boolean generated always as (status = ‘Ended’) stored,\n  add column if not exists has_gt_2_seasons boolean generated always as (number_of_seasons > 2) stored,\n  add column if not exists has_gt_5_seasons boolean generated always as (number_of_seasons > 5) stored,\n  add column if not exists has_gt_10_seasons boolean generated always as (number_of_seasons > 10) stored;\n\n– ===============================\n– PARTIAL INDEXES FOR CATEGORIES\n– ===============================\ncreate index if not exists tv_idx_title_1_word  on public.tv_series (id) where is_1_word_title;\ncreate index if not exists tv_idx_title_2_word  on public.tv_series (id) where is_2_word_title;\ncreate index if not exists tv_idx_title_3_word  on public.tv_series (id) where is_3_word_title;\n\ncreate index if not exists tv_idx_1980s on public.tv_series (id) where is_1980s;\ncreate index if not exists tv_idx_1990s on public.tv_series (id) where is_1990s;\ncreate index if not exists tv_idx_2000s on public.tv_series (id) where is_2000s;\ncreate index if not exists tv_idx_2010s on public.tv_series (id) where is_2010s;\ncreate index if not exists tv_idx_2020s on public.tv_series (id) where is_2020s;\n\ncreate index if not exists tv_idx_ended      on public.tv_series (id) where is_ended;\ncreate index if not exists tv_idx_gt2season  on public.tv_series (id) where has_gt_2_seasons;\ncreate index if not exists tv_idx_gt5season  on public.tv_series (id) where has_gt_5_seasons;\ncreate index if not exists tv_idx_gt10season on public.tv_series (id) where has_gt_10_seasons;\n\n– Genres fast path\ncreate index if not exists series_genres_genre_series_idx on public.series_genres (genre_id, series_id);\n\n– ===============================\n– DAILY GRID TABLES\n– ===============================\n– rows = 3 people, cols = 3 category keys\ncreate table if not exists public.tvgrid_days (\n  id bigint generated by default as identity primary key,\n  grid_date date unique not null,\n  row_person_ids bigint[3] not null,          – TMDB person ids\n  col_category_keys text[3] not null,         – e.g., [‘is_3_word_title’,‘is_2010s’,‘has_gt_5_seasons’]\n  created_at timestamptz default now()\n);\n\n– optional pre-materialized valid answers per cell to speed gameplay (can be built offline)\ncreate table if not exists public.tvgrid_cell_answers (\n  day_id bigint references public.tvgrid_days(id) on delete cascade,\n  row_index smallint check (row_index between 1 and 3),\n  col_index smallint check (col_index between 1 and 3),\n  series_id bigint references public.tv_series(id) on delete cascade,\n  primary key(day_id, row_index, col_index, series_id)\n);\n\n– user attempts/submissions\ncreate table if not exists public.tvgrid_attempts (\n  id bigint generated by default as identity primary key,\n  day_id bigint references public.tvgrid_days(id) on delete cascade,\n  session_id uuid not null,                   – anonymous or user session\n  row_index smallint not null,\n  col_index smallint not null,\n  series_id bigint not null,                  – what player chose\n  correct boolean not null,\n  created_at timestamptz default now()\n);\n\ncreate table if not exists public.tvgrid_sessions (\n  id uuid primary key,\n  day_id bigint references public.tvgrid_days(id) on delete cascade,\n  guesses_used smallint default 0,\n  grid_state text default ‘’                  – JSON string snapshot of 3x3 selections\n);\n”,
“seed_genres”: “insert into public.genres (id, name) values\n  (10759,‘Action & Adventure’), (16,‘Animation’), (35,‘Comedy’), (80,‘Crime’), (99,‘Documentary’),\n  (18,‘Drama’), (10751,‘Family’), (10762,‘Kids’), (9648,‘Mystery’), (10763,‘News’), (10764,‘Reality’),\n  (10765,‘Sci-Fi & Fantasy’), (10766,‘Soap’), (10767,‘Talk’), (10768,‘War & Politics’), (37,‘Western’)\non conflict (id) do nothing;”
],
“rls”: {
“policy”: “Enable RLS on tvgrid_ tables if needed; allow read for anon, insert to attempts/sessions with session_id = auth.uid() OR a generated anonymous UUID stored in cookie. Content tables (tv_series/people/genres/series_genres) can remain public read-only.”
}
},
“category_dictionary”: {
“explanation”: “These string keys are stored in tvgrid_days.col_category_keys and mapped to SQL predicates in the API.”,
“keys”: [
“is_1_word_title”,
“is_2_word_title”,
“is_3_word_title”,
“is_1980s”,
“is_1990s”,
“is_2000s”,
“is_2010s”,
“is_2020s”,
“is_ended”,
“has_gt_2_seasons”,
“has_gt_5_seasons”,
“has_gt_10_seasons”,
“is_genre_10759”,
“is_genre_16”,
“is_genre_35”,
“is_genre_80”,
“is_genre_99”,
“is_genre_18”,
“is_genre_10751”,
“is_genre_10762”,
“is_genre_9648”,
“is_genre_10763”,
“is_genre_10764”,
“is_genre_10765”,
“is_genre_10766”,
“is_genre_10767”,
“is_genre_10768”,
“is_genre_37”
],
“sql_predicates_contract”: “Given a series row alias s, AND category_key, resolve to SQL WHERE snippet.\n\n– examples:\n– is_1_word_title        => s.is_1_word_title\n– is_2010s               => s.is_2010s\n– has_gt_5_seasons       => s.has_gt_5_seasons\n– is_genre_35            => exists (select 1 from series_genres sg where sg.series_id = s.id and sg.genre_id = 35)”
},
“gameplay_rules”: {
“grid”: “3x3 = 9 cells. Rows are 3 people (actors). Columns are 3 category clues from dictionary.”,
“input”: “Click a cell -> searchable dropdown of TV series (ordered by popularity). Title must match exactly (case-insensitive, punctuation must be included).”,
“validation”: [
“Series must satisfy column predicate (SQL) and must be a credited acting appearance for the row’s person (tv_credits.department = ‘Acting’ AND job is null OR department = ‘Acting’).”,
“A series can be used only once per grid/session.”,
“Each guess (correct/incorrect) consumes 1 of 9 guesses.”
],
“feedback”: “Correct -> show poster thumbnail via TMDB path, lock cell. Incorrect -> shake/red border and decrement guess.”,
“end_conditions”: “Win when all 9 cells are correct before running out of 9 guesses. Otherwise loss.”,
“share”: “Build an emoji grid summary with counts and guesses used.”
},
“api_contract”: {
“routes”: [
{
“path”: “/api/grid/today”,
“method”: “GET”,
“returns”: “{ gridDate, rows: [{personId,name,headshotUrl}], cols: [{key,label,description}], guessesLeft, existingGridState }”
},
{
“path”: “/api/grid/search-series”,
“method”: “GET”,
“query”: “q=”,
“returns”: “Top N series by popularity (id, name, first_air_year, poster_path). Use LIKE ILIKE with trigram optional; no external API calls.”
},
{
“path”: “/api/grid/validate”,
“method”: “POST”,
“body”: “{ dayId, rowIndex, colIndex, seriesId }”,
“validates”: [
“Series meets column category predicate”,
“Series is credited acting appearance for the row’s person”,
“Series not used elsewhere in this session”
],
“returns”: “{ correct: boolean, guessesUsed, cell: { rowIndex, colIndex, seriesId, posterUrl } }”
}
],
“predicate_resolution_pseudocode”: “switch(categoryKey){ case ‘is_1_word_title’: return ‘s.is_1_word_title’; case ‘is_genre_35’: return ‘exists (select 1 from series_genres sg where sg.series_id = s.id and sg.genre_id = 35)’; … }”
},
“frontend_tasks”: [
“Create /app/page.tsx with the grid layout, sticky row/col labels, guesses counter, and Give Up button.”,
“Cell component: click to open CommandPalette-style searchable list (series). Debounce query to /api/grid/search-series.”,
“When selecting a series, POST to /api/grid/validate and update state: poster fills cell if correct; disable the same series in other cells for this session.”,
“Headshot popover: clicking a person name shows TMDB headshot (from profile_path).”,
“Category tooltip: clicking a category key shows definition (e.g., ‘3+ Word Title = title_word_count >= 3; hyphen counts as one’).”,
“Share modal: print emoji grid + guesses used.”,
“Mobile: grid scrolls vertically; row/col headers remain visible; tap-to-open search.”
},
“server_tasks”: [
“Implement SQL builder for category predicates (strict allowlist only).”,
“Implement /api/grid/search-series: ILIKE on s.name plus popularity sort; optionally add pg_trgm index on name for speed.”,
“Implement /api/grid/validate: single SQL transaction to (a) ensure not used already, (b) check predicate, (c) check acting credit, (d) insert attempt, (e) update session guesses.”,
“Create a daily job (script) to insert tvgrid_days with three people and three category keys, and optionally precompute tvgrid_cell_answers.”
},
“performance_indexes_optional”: {
“name_trigram”: “create extension if not exists pg_trgm; create index if not exists tv_series_name_trgm on public.tv_series using gin (name gin_trgm_ops);”,
“credits_indexes”: [
“create index if not exists tv_credits_person_series on public.tv_credits (person_id, series_id) where department = ‘Acting’;”,
“create index if not exists tv_credits_series_person on public.tv_credits (series_id, person_id) where department = ‘Acting’;”
]
},
“etl_notes”: {
“people_seed”: “Load 1k–5k popular people (actors) with profile_path.”,
“series_seed”: “Load popular + long-running series to improve match density.”,
“credits_seed”: “Load acting credits (department=‘Acting’); exclude directing jobs for rule parity with game spec.”,
“posters”: “Never download. Render with TMDB base URL: https://image.tmdb.org/t/p/w300{poster_path}”
},
“acceptance_tests”: [
“Selecting a correct series that fits row person AND column predicate fills the cell with poster and decrements guesses by 1.”,
“Selecting an incorrect series decrements guesses and displays error animation.”,
“Same series cannot be reused in any other cell.”,
“Row name click opens headshot; column header click shows rule description.”,
“All category keys listed in dictionary resolve to correct SQL.”,
“Grid completes within 9 guesses for solvable days; share text is accurate.”
},
“commit_conventions”: {
“rules”: [
“feat(tv-grid): ”,
“fix(tv-grid): ”,
“chore(tv-grid): ”,
“db(tv-grid): ”
],
“example”: “db(tv-grid): add generated columns + partial indexes for decade + word-count”
},
“implementation_order”: [
“Step 1: Run the provided SQL DDL + genre seed in Supabase.”,
“Step 2: Import a small seed of tv_series, people, series_genres, and acting tv_credits.”,
“Step 3: Add optional name trigram index if search feels slow.”,
“Step 4: Implement predicate resolver and /api/grid/search-series, /api/grid/validate.”,
“Step 5: Build the grid UI with search and poster rendering; wire to API.”,
“Step 6: Add daily job to generate tvgrid_days with 3 person ids + 3 category keys.”,
“Step 7: QA: verify every category works via SQL filters and matches UI rules.”,
“Step 8: Ship share modal and polish animations.”
],
“labels_for_categories”: {
“mapping_examples”: [
{ “key”: “is_1_word_title”, “label”: “One Word Title” },
{ “key”: “is_2_word_title”, “label”: “Two Word Title” },
{ “key”: “is_3_word_title”, “label”: “3+ Word Title” },
{ “key”: “is_1980s”, “label”: “Pilot Released: 1980s” },
{ “key”: “is_1990s”, “label”: “Pilot Released: 1990s” },
{ “key”: “is_2000s”, “label”: “Pilot Released: 2000s” },
{ “key”: “is_2010s”, “label”: “Pilot Released: 2010s” },
{ “key”: “is_2020s”, “label”: “Pilot Released: 2020s” },
{ “key”: “is_ended”, “label”: “Ended Series” },
{ “key”: “has_gt_2_seasons”, “label”: “More Than 2 Seasons” },
{ “key”: “has_gt_5_seasons”, “label”: “More Than 5 Seasons” },
{ “key”: “has_gt_10_seasons”, “label”: “More Than 10 Seasons” },
{ “key”: “is_genre_35”, “label”: “Comedy” },
{ “key”: “is_genre_18”, “label”: “Drama” },
{ “key”: “is_genre_10764”, “label”: “Reality” }
]
}
}
