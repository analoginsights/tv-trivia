-- Reality Grid Database Schema
-- Uses public schema with rg_ prefix for all tables

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rg_appearances_show ON rg_appearances(show_id);
CREATE INDEX IF NOT EXISTS idx_rg_appearances_person ON rg_appearances(person_id);
CREATE INDEX IF NOT EXISTS idx_rg_people_valid ON rg_people(is_valid) WHERE is_valid = true;
CREATE INDEX IF NOT EXISTS idx_rg_people_name ON rg_people(name);
CREATE INDEX IF NOT EXISTS idx_rg_daily_puzzles_date ON rg_daily_puzzles(date);

-- Create view for eligible appearances
CREATE OR REPLACE VIEW rg_eligible_appearances AS
SELECT a.show_id, a.person_id
FROM rg_appearances a
JOIN rg_people p ON p.id = a.person_id
WHERE p.is_valid = true;

-- Function to derive eligibility
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

-- Function to get shows with eligible count
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
    ORDER BY eligible_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get intersection count
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

-- RLS Policies
ALTER TABLE rg_shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE rg_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE rg_appearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE rg_daily_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rg_daily_cells ENABLE ROW LEVEL SECURITY;

-- Public SELECT policies
CREATE POLICY "Public can read shows" ON rg_shows FOR SELECT USING (true);
CREATE POLICY "Public can read people" ON rg_people FOR SELECT USING (true);
CREATE POLICY "Public can read appearances" ON rg_appearances FOR SELECT USING (true);
CREATE POLICY "Public can read puzzles" ON rg_daily_puzzles FOR SELECT USING (true);
CREATE POLICY "Public can read cells" ON rg_daily_cells FOR SELECT USING (true);