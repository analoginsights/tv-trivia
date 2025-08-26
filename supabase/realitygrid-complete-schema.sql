-- Reality Grid Complete Database Schema
-- Run this entire script in Supabase SQL Editor

-- ============================================
-- TABLES
-- ============================================

-- Shows table
CREATE TABLE IF NOT EXISTS rg_shows (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    poster_path TEXT,
    popularity_rank INTEGER
);

-- People table
CREATE TABLE IF NOT EXISTS rg_people (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    profile_path TEXT,
    show_count INTEGER DEFAULT 0,
    is_valid BOOLEAN DEFAULT FALSE
);

-- Appearances table
CREATE TABLE IF NOT EXISTS rg_appearances (
    show_id INTEGER REFERENCES rg_shows(id),
    person_id INTEGER REFERENCES rg_people(id),
    PRIMARY KEY (show_id, person_id)
);

-- Daily puzzles table
CREATE TABLE IF NOT EXISTS rg_daily_puzzles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE UNIQUE NOT NULL,
    row_show_ids INTEGER[] NOT NULL,
    col_show_ids INTEGER[] NOT NULL,
    seed TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Daily cells table
CREATE TABLE IF NOT EXISTS rg_daily_cells (
    puzzle_id UUID REFERENCES rg_daily_puzzles(id) ON DELETE CASCADE,
    row_idx INTEGER NOT NULL CHECK (row_idx >= 0 AND row_idx < 3),
    col_idx INTEGER NOT NULL CHECK (col_idx >= 0 AND col_idx < 3),
    answer_count INTEGER NOT NULL,
    PRIMARY KEY (puzzle_id, row_idx, col_idx)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_rg_appearances_show ON rg_appearances(show_id);
CREATE INDEX IF NOT EXISTS idx_rg_appearances_person ON rg_appearances(person_id);
CREATE INDEX IF NOT EXISTS idx_rg_people_valid ON rg_people(is_valid) WHERE is_valid = true;
CREATE INDEX IF NOT EXISTS idx_rg_people_name ON rg_people(name);
CREATE INDEX IF NOT EXISTS idx_rg_people_name_trgm ON rg_people USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rg_daily_puzzles_date ON rg_daily_puzzles(date);

-- ============================================
-- VIEWS
-- ============================================

-- Create view for eligible appearances
CREATE OR REPLACE VIEW rg_eligible_appearances AS
SELECT a.show_id, a.person_id
FROM rg_appearances a
JOIN rg_people p ON p.id = a.person_id
WHERE p.is_valid = true;

-- ============================================
-- FUNCTIONS
-- ============================================

-- T2: Function to derive eligibility
CREATE OR REPLACE FUNCTION rg_derive_eligibility()
RETURNS void AS $$
BEGIN
    UPDATE rg_people p
    SET 
        show_count = sub.cnt,
        is_valid = (sub.cnt >= 3)
    FROM (
        SELECT person_id, COUNT(DISTINCT show_id) as cnt
        FROM rg_appearances
        GROUP BY person_id
    ) sub
    WHERE p.id = sub.person_id;
END;
$$ LANGUAGE plpgsql;

-- T3: Function to get shows with eligible count
CREATE OR REPLACE FUNCTION rg_shows_with_eligible_count()
RETURNS TABLE(id INTEGER, name TEXT, eligible_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        COUNT(DISTINCT ea.person_id) as eligible_count
    FROM rg_shows s
    JOIN rg_eligible_appearances ea ON ea.show_id = s.id
    GROUP BY s.id, s.name
    HAVING COUNT(DISTINCT ea.person_id) > 0
    ORDER BY eligible_count DESC;
END;
$$ LANGUAGE plpgsql;

-- T4: Function to get intersection count
CREATE OR REPLACE FUNCTION rg_show_intersection_count(show_id_1 INTEGER, show_id_2 INTEGER)
RETURNS INTEGER AS $$
DECLARE
    intersection_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO intersection_count
    FROM (
        SELECT person_id 
        FROM rg_eligible_appearances 
        WHERE show_id = show_id_1
        INTERSECT
        SELECT person_id 
        FROM rg_eligible_appearances 
        WHERE show_id = show_id_2
    ) AS intersection;
    
    RETURN intersection_count;
END;
$$ LANGUAGE plpgsql;

-- T5: Function to validate cell answers
CREATE OR REPLACE FUNCTION rg_is_valid_cell_answer(
    p_person_id INTEGER, 
    p_row_show_id INTEGER, 
    p_col_show_id INTEGER
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT 
            EXISTS(
                SELECT 1 FROM rg_appearances a 
                WHERE a.person_id = p_person_id AND a.show_id = p_row_show_id
            ) AND
            EXISTS(
                SELECT 1 FROM rg_appearances a 
                WHERE a.person_id = p_person_id AND a.show_id = p_col_show_id
            ) AND
            EXISTS(
                SELECT 1 FROM rg_people p 
                WHERE p.id = p_person_id AND p.is_valid = true
            )
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- T6: Function for typeahead search
CREATE OR REPLACE FUNCTION rg_people_typeahead(q TEXT)
RETURNS TABLE(
    id INTEGER, 
    name TEXT, 
    profile_path TEXT, 
    show_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id, 
        p.name, 
        p.profile_path, 
        p.show_count
    FROM rg_people p
    WHERE p.is_valid = true 
    AND p.name ILIKE '%' || q || '%'
    ORDER BY p.show_count DESC, p.name ASC
    LIMIT 8;
END;
$$ LANGUAGE plpgsql STABLE;

-- T4: Enhanced puzzle generation function
CREATE OR REPLACE FUNCTION rg_generate_daily_puzzle(puzzle_date DATE DEFAULT CURRENT_DATE)
RETURNS UUID AS $$
DECLARE
    candidate_shows INTEGER[];
    row_shows INTEGER[];
    col_shows INTEGER[];
    puzzle_id UUID;
    i INTEGER;
    j INTEGER;
    intersection_count INTEGER;
    all_valid BOOLEAN := true;
BEGIN
    -- Get candidate shows with eligible people
    SELECT ARRAY_AGG(id ORDER BY random()) 
    INTO candidate_shows
    FROM (
        SELECT s.id
        FROM rg_shows s
        JOIN rg_eligible_appearances ea ON s.id = ea.show_id
        GROUP BY s.id
        HAVING COUNT(DISTINCT ea.person_id) >= 3
    ) cs;
    
    -- Need at least 6 shows
    IF array_length(candidate_shows, 1) < 6 THEN
        RAISE EXCEPTION 'Not enough candidate shows with eligible people';
    END IF;
    
    -- Select 3 row shows and 3 column shows
    row_shows := candidate_shows[1:3];
    col_shows := candidate_shows[4:6];
    
    -- Validate all intersections have at least 1 person
    FOR i IN 1..3 LOOP
        FOR j IN 1..3 LOOP
            SELECT rg_show_intersection_count(row_shows[i], col_shows[j])
            INTO intersection_count;
            
            IF intersection_count = 0 THEN
                all_valid := false;
                EXIT;
            END IF;
        END LOOP;
        
        IF NOT all_valid THEN
            EXIT;
        END IF;
    END LOOP;
    
    -- If not valid, try different selection (simplified for now)
    IF NOT all_valid THEN
        RAISE EXCEPTION 'Could not find valid puzzle combination';
    END IF;
    
    -- Generate puzzle ID
    puzzle_id := gen_random_uuid();
    
    -- Insert puzzle
    INSERT INTO rg_daily_puzzles (id, date, row_show_ids, col_show_ids, seed)
    VALUES (puzzle_id, puzzle_date, row_shows, col_shows, puzzle_date::TEXT)
    ON CONFLICT (date) DO UPDATE SET
        id = EXCLUDED.id,
        row_show_ids = EXCLUDED.row_show_ids,
        col_show_ids = EXCLUDED.col_show_ids,
        seed = EXCLUDED.seed;
    
    -- Clear existing cells for this date
    DELETE FROM rg_daily_cells WHERE puzzle_id IN (
        SELECT id FROM rg_daily_puzzles WHERE date = puzzle_date
    );
    
    -- Insert cells with answer counts
    FOR i IN 1..3 LOOP
        FOR j IN 1..3 LOOP
            SELECT rg_show_intersection_count(row_shows[i], col_shows[j])
            INTO intersection_count;
            
            INSERT INTO rg_daily_cells (puzzle_id, row_idx, col_idx, answer_count)
            VALUES (puzzle_id, i-1, j-1, intersection_count);
        END LOOP;
    END LOOP;
    
    RETURN puzzle_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE rg_shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE rg_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE rg_appearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE rg_daily_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rg_daily_cells ENABLE ROW LEVEL SECURITY;

-- Public SELECT policies
DROP POLICY IF EXISTS "Public can read shows" ON rg_shows;
DROP POLICY IF EXISTS "Public can read people" ON rg_people;
DROP POLICY IF EXISTS "Public can read appearances" ON rg_appearances;
DROP POLICY IF EXISTS "Public can read puzzles" ON rg_daily_puzzles;
DROP POLICY IF EXISTS "Public can read cells" ON rg_daily_cells;

CREATE POLICY "Public can read shows" ON rg_shows FOR SELECT USING (true);
CREATE POLICY "Public can read people" ON rg_people FOR SELECT USING (true);
CREATE POLICY "Public can read appearances" ON rg_appearances FOR SELECT USING (true);
CREATE POLICY "Public can read puzzles" ON rg_daily_puzzles FOR SELECT USING (true);
CREATE POLICY "Public can read cells" ON rg_daily_cells FOR SELECT USING (true);

-- ============================================
-- EXTENSIONS (if not already enabled)
-- ============================================

-- Enable trigram extension for better text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;