-- Reality Grid Testing Queries
-- Run these in Supabase SQL Editor to test your implementation

-- ============================================
-- T1: Schema Verification
-- ============================================

-- Check all tables exist and row counts
SELECT 
    'rg_shows' as table_name, 
    COUNT(*) as row_count 
FROM rg_shows
UNION ALL
SELECT 
    'rg_people' as table_name, 
    COUNT(*) as row_count 
FROM rg_people
UNION ALL
SELECT 
    'rg_appearances' as table_name, 
    COUNT(*) as row_count 
FROM rg_appearances
UNION ALL
SELECT 
    'rg_daily_puzzles' as table_name, 
    COUNT(*) as row_count 
FROM rg_daily_puzzles
UNION ALL
SELECT 
    'rg_daily_cells' as table_name, 
    COUNT(*) as row_count 
FROM rg_daily_cells;

-- ============================================
-- T2: Eligibility Check
-- ============================================

-- Run eligibility refresh
SELECT rg_derive_eligibility();

-- Check eligibility results
SELECT 
    is_valid,
    COUNT(*) as people_count,
    AVG(show_count) as avg_show_count
FROM rg_people 
GROUP BY is_valid;

-- Top eligible people
SELECT name, show_count 
FROM rg_people 
WHERE is_valid = true 
ORDER BY show_count DESC 
LIMIT 10;

-- ============================================
-- T3: Candidate Show Analysis
-- ============================================

-- Get shows with eligible people
SELECT * FROM rg_shows_with_eligible_count() LIMIT 10;

-- Check intersection counts for top shows
WITH top_shows AS (
    SELECT id, name FROM rg_shows_with_eligible_count() LIMIT 5
)
SELECT 
    s1.name as show1,
    s2.name as show2,
    rg_show_intersection_count(s1.id, s2.id) as intersection_count
FROM top_shows s1
CROSS JOIN top_shows s2
WHERE s1.id < s2.id
ORDER BY intersection_count DESC;

-- ============================================
-- T4: Puzzle Generation Test
-- ============================================

-- Generate puzzle for today
SELECT rg_generate_daily_puzzle();

-- Check latest puzzle
SELECT 
    dp.*,
    array_length(row_show_ids, 1) as row_count,
    array_length(col_show_ids, 1) as col_count
FROM rg_daily_puzzles dp
ORDER BY date DESC 
LIMIT 1;

-- Check puzzle cells (should be 3x3 grid)
WITH latest_puzzle AS (
    SELECT id FROM rg_daily_puzzles ORDER BY date DESC LIMIT 1
)
SELECT 
    row_idx,
    col_idx,
    answer_count
FROM rg_daily_cells dc
JOIN latest_puzzle lp ON dc.puzzle_id = lp.id
ORDER BY row_idx, col_idx;

-- Display puzzle grid nicely
WITH latest_puzzle AS (
    SELECT id FROM rg_daily_puzzles ORDER BY date DESC LIMIT 1
),
grid_data AS (
    SELECT 
        row_idx,
        string_agg(answer_count::text, ' | ' ORDER BY col_idx) as row_data
    FROM rg_daily_cells dc
    JOIN latest_puzzle lp ON dc.puzzle_id = lp.id
    GROUP BY row_idx
)
SELECT 
    'Row ' || row_idx || ': ' || row_data as puzzle_grid
FROM grid_data
ORDER BY row_idx;

-- ============================================
-- T5: Validation Testing
-- ============================================

-- Get a test person and shows
WITH test_data AS (
    SELECT 
        p.id as person_id,
        p.name,
        dp.row_show_ids[1] as test_row_show,
        dp.col_show_ids[1] as test_col_show
    FROM rg_people p
    JOIN rg_daily_puzzles dp ON dp.date = CURRENT_DATE
    WHERE p.is_valid = true
    LIMIT 1
)
SELECT 
    td.*,
    rg_is_valid_cell_answer(td.person_id, td.test_row_show, td.test_col_show) as is_valid_answer
FROM test_data td;

-- Test validation with known good/bad answers
SELECT 
    'Test validation function' as test,
    rg_is_valid_cell_answer(999999, 1, 2) as should_be_false,
    rg_is_valid_cell_answer(
        (SELECT id FROM rg_people WHERE is_valid = true LIMIT 1),
        (SELECT id FROM rg_shows LIMIT 1),
        (SELECT id FROM rg_shows OFFSET 1 LIMIT 1)
    ) as might_be_true;

-- ============================================
-- T6: Typeahead Testing
-- ============================================

-- Test typeahead search
SELECT * FROM rg_people_typeahead('and');
SELECT * FROM rg_people_typeahead('lis');
SELECT * FROM rg_people_typeahead('kim');

-- ============================================
-- T8: Final Validation
-- ============================================

-- Today's puzzle summary
SELECT 
    'Today''s Puzzle' as info,
    date,
    id,
    row_show_ids,
    col_show_ids
FROM rg_daily_puzzles 
WHERE date = CURRENT_DATE;

-- Show names for today's puzzle
WITH today_puzzle AS (
    SELECT row_show_ids, col_show_ids 
    FROM rg_daily_puzzles 
    WHERE date = CURRENT_DATE 
    LIMIT 1
)
SELECT 
    'Row Shows' as category,
    s.name
FROM today_puzzle tp
JOIN rg_shows s ON s.id = ANY(tp.row_show_ids)
UNION ALL
SELECT 
    'Col Shows' as category,
    s.name
FROM today_puzzle tp
JOIN rg_shows s ON s.id = ANY(tp.col_show_ids);

-- Cell answer counts for today
WITH today_puzzle AS (
    SELECT id FROM rg_daily_puzzles WHERE date = CURRENT_DATE LIMIT 1
)
SELECT 
    'Cell (' || row_idx || ',' || col_idx || ')' as cell,
    answer_count
FROM rg_daily_cells dc
JOIN today_puzzle tp ON dc.puzzle_id = tp.id
ORDER BY row_idx, col_idx;

-- Overall health check
SELECT 
    'Health Check' as status,
    COUNT(CASE WHEN is_valid THEN 1 END) as eligible_people,
    COUNT(*) as total_people,
    (SELECT COUNT(*) FROM rg_shows) as total_shows,
    (SELECT COUNT(*) FROM rg_appearances) as total_appearances,
    (SELECT COUNT(*) FROM rg_daily_puzzles) as total_puzzles
FROM rg_people;