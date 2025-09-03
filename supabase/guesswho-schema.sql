-- GuessWho Bravo Edition Database Schema
-- Run this entire script in Supabase SQL Editor

-- ============================================
-- EXTENSIONS
-- ============================================

-- Enable trigram extension for better text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- TABLES
-- ============================================

-- People table
CREATE TABLE IF NOT EXISTS gwb_people (
    id BIGINT PRIMARY KEY,
    full_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    aliases TEXT[], -- Array of alternative names/nicknames
    image_url TEXT, -- URL to main headshot
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Series table (Bravo shows)
CREATE TABLE IF NOT EXISTS gwb_series (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    franchise TEXT, -- e.g., "Real Housewives", "Vanderpump Rules"
    network TEXT DEFAULT 'Bravo',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appearances table (linking people to shows)
CREATE TABLE IF NOT EXISTS gwb_appearances (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    person_id BIGINT NOT NULL REFERENCES gwb_people(id),
    series_id BIGINT NOT NULL REFERENCES gwb_series(id),
    role TEXT CHECK (role IN ('main', 'guest', 'friend')) DEFAULT 'main',
    first_air_date DATE,
    seasons INTEGER[], -- Array of season numbers they appeared in
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(person_id, series_id)
);

-- Daily puzzle selection table
CREATE TABLE IF NOT EXISTS gwb_daily (
    date_utc DATE PRIMARY KEY,
    person_id BIGINT NOT NULL REFERENCES gwb_people(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User guesses tracking table
CREATE TABLE IF NOT EXISTS gwb_guesses (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    play_date_utc DATE NOT NULL,
    client_id TEXT NOT NULL, -- Anonymous device/user identifier
    guess_order SMALLINT NOT NULL CHECK (guess_order BETWEEN 1 AND 6),
    value TEXT NOT NULL, -- Raw guess input
    is_correct BOOLEAN NOT NULL,
    elapsed_ms INTEGER NOT NULL, -- Time elapsed when guess was made
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: Aggregate stats table
CREATE TABLE IF NOT EXISTS gwb_stats (
    play_date_utc DATE PRIMARY KEY,
    total_plays INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    avg_time_ms INTEGER,
    avg_guesses DECIMAL(3,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- People indexes
CREATE INDEX IF NOT EXISTS idx_gwb_people_full_name ON gwb_people (lower(full_name));
CREATE INDEX IF NOT EXISTS idx_gwb_people_trgm ON gwb_people USING gin(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_gwb_people_aliases ON gwb_people USING gin(aliases);
CREATE INDEX IF NOT EXISTS idx_gwb_people_active ON gwb_people (is_active) WHERE is_active = true;

-- Appearances indexes
CREATE INDEX IF NOT EXISTS idx_gwb_appearances_person ON gwb_appearances (person_id);
CREATE INDEX IF NOT EXISTS idx_gwb_appearances_series ON gwb_appearances (series_id);

-- Daily puzzle indexes
CREATE INDEX IF NOT EXISTS idx_gwb_daily_date ON gwb_daily (date_utc);
CREATE INDEX IF NOT EXISTS idx_gwb_daily_person ON gwb_daily (person_id);

-- Guesses indexes
CREATE INDEX IF NOT EXISTS idx_gwb_guesses_date_client ON gwb_guesses (play_date_utc, client_id);
CREATE INDEX IF NOT EXISTS idx_gwb_guesses_date ON gwb_guesses (play_date_utc);

-- ============================================
-- VIEWS
-- ============================================

-- Eligible people view (≥2 distinct series and has image)
CREATE OR REPLACE VIEW gwb_people_eligible AS
SELECT p.id, p.full_name, p.first_name, p.last_name, p.aliases, p.image_url
FROM gwb_people p
JOIN (
    SELECT person_id, COUNT(DISTINCT series_id) as series_count
    FROM gwb_appearances
    GROUP BY person_id
) a ON a.person_id = p.id
WHERE p.is_active = true
    AND COALESCE(NULLIF(TRIM(p.image_url), ''), '') <> ''
    AND a.series_count >= 2;

-- People not used recently (60-day cooldown)
CREATE OR REPLACE VIEW gwb_people_not_recent AS
SELECT e.id, e.full_name, e.image_url
FROM gwb_people_eligible e
LEFT JOIN gwb_daily d ON d.person_id = e.id
    AND d.date_utc >= (CURRENT_DATE - INTERVAL '60 days')
WHERE d.person_id IS NULL;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Deterministic daily person picker with cooldown
CREATE OR REPLACE FUNCTION gwb_pick_daily_person(v_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (date_utc DATE, person_id BIGINT) LANGUAGE plpgsql AS $$
DECLARE
    candidate_id BIGINT;
BEGIN
    -- Try eligible & not recent first
    SELECT id INTO candidate_id
    FROM gwb_people_not_recent
    ORDER BY (id * 1103515245 + EXTRACT(epoch FROM v_date)::BIGINT) -- Simple LCG-style shuffle
    LIMIT 1;

    -- If no non-recent candidates, use any eligible
    IF candidate_id IS NULL THEN
        SELECT id INTO candidate_id
        FROM gwb_people_eligible
        ORDER BY (id * 1103515245 + EXTRACT(epoch FROM v_date)::BIGINT)
        LIMIT 1;
    END IF;

    -- If still no candidates, return empty
    IF candidate_id IS NULL THEN
        RETURN;
    END IF;

    -- Insert or update daily pick
    INSERT INTO gwb_daily (date_utc, person_id)
    VALUES (v_date, candidate_id)
    ON CONFLICT (date_utc) DO UPDATE 
    SET person_id = EXCLUDED.person_id
    RETURNING gwb_daily.date_utc, gwb_daily.person_id 
    INTO date_utc, person_id;

    RETURN NEXT;
END $$;

-- People search for autocomplete
CREATE OR REPLACE FUNCTION gwb_people_search(search_query TEXT)
RETURNS TABLE (
    id BIGINT,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    aliases TEXT[],
    similarity_score REAL
) LANGUAGE plpgsql STABLE AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        p.first_name,
        p.last_name,
        p.aliases,
        GREATEST(
            SIMILARITY(LOWER(p.full_name), LOWER(search_query)),
            (SELECT MAX(SIMILARITY(LOWER(alias), LOWER(search_query))) 
             FROM UNNEST(p.aliases) AS alias)
        ) as similarity_score
    FROM gwb_people_eligible p
    WHERE 
        LOWER(p.full_name) ILIKE '%' || LOWER(search_query) || '%'
        OR EXISTS (
            SELECT 1 FROM UNNEST(p.aliases) AS alias 
            WHERE LOWER(alias) ILIKE '%' || LOWER(search_query) || '%'
        )
    ORDER BY similarity_score DESC, p.full_name ASC
    LIMIT 10;
END $$;

-- Validate guess function
CREATE OR REPLACE FUNCTION gwb_validate_guess(
    guess_text TEXT,
    correct_person_id BIGINT
)
RETURNS TABLE (
    is_correct BOOLEAN,
    matched_name TEXT,
    confidence REAL
) LANGUAGE plpgsql STABLE AS $$
DECLARE
    person_record gwb_people_eligible%ROWTYPE;
    normalized_guess TEXT;
    alias_text TEXT;
    max_similarity REAL := 0;
    best_match TEXT;
    similarity_threshold REAL := 0.6;
BEGIN
    -- Get the correct person
    SELECT * INTO person_record 
    FROM gwb_people_eligible p 
    WHERE p.id = correct_person_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::TEXT, 0::REAL;
        RETURN;
    END IF;

    normalized_guess := LOWER(TRIM(guess_text));
    
    -- Check exact match on full name
    IF normalized_guess = LOWER(person_record.full_name) THEN
        RETURN QUERY SELECT true, person_record.full_name, 1.0::REAL;
        RETURN;
    END IF;
    
    -- Check similarity with full name
    max_similarity := SIMILARITY(normalized_guess, LOWER(person_record.full_name));
    best_match := person_record.full_name;
    
    -- Check aliases if they exist
    IF person_record.aliases IS NOT NULL THEN
        FOREACH alias_text IN ARRAY person_record.aliases LOOP
            DECLARE
                alias_similarity REAL;
            BEGIN
                -- Exact alias match
                IF normalized_guess = LOWER(alias_text) THEN
                    RETURN QUERY SELECT true, alias_text, 1.0::REAL;
                    RETURN;
                END IF;
                
                -- Similarity check for aliases
                alias_similarity := SIMILARITY(normalized_guess, LOWER(alias_text));
                IF alias_similarity > max_similarity THEN
                    max_similarity := alias_similarity;
                    best_match := alias_text;
                END IF;
            END;
        END LOOP;
    END IF;
    
    -- Return result based on similarity threshold
    RETURN QUERY SELECT 
        (max_similarity >= similarity_threshold),
        best_match,
        max_similarity;
END $$;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE gwb_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE gwb_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE gwb_appearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE gwb_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE gwb_guesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE gwb_stats ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public can read people" ON gwb_people FOR SELECT USING (true);
CREATE POLICY "Public can read series" ON gwb_series FOR SELECT USING (true);
CREATE POLICY "Public can read appearances" ON gwb_appearances FOR SELECT USING (true);
CREATE POLICY "Public can read daily puzzles" ON gwb_daily FOR SELECT USING (true);
CREATE POLICY "Public can read stats" ON gwb_stats FOR SELECT USING (true);

-- Guesses: users can insert their own and read aggregate data
CREATE POLICY "Users can insert guesses" ON gwb_guesses FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can read own guesses" ON gwb_guesses FOR SELECT USING (true);

-- ============================================
-- SAMPLE DATA INSERTION (for testing)
-- ============================================

-- Sample series
INSERT INTO gwb_series (id, name, franchise) VALUES 
(1, 'The Real Housewives of Atlanta', 'Real Housewives'),
(2, 'The Real Housewives of Beverly Hills', 'Real Housewives'),
(3, 'Vanderpump Rules', 'Vanderpump'),
(4, 'Below Deck', 'Below Deck'),
(5, 'The Real Housewives of New York City', 'Real Housewives')
ON CONFLICT (id) DO NOTHING;

-- Sample people (placeholder data)
INSERT INTO gwb_people (id, full_name, first_name, last_name, aliases, image_url) VALUES 
(1, 'Teresa Giudice', 'Teresa', 'Giudice', ARRAY['Teresa', 'Tre'], 'https://example.com/teresa.jpg'),
(2, 'Lisa Vanderpump', 'Lisa', 'Vanderpump', ARRAY['Lisa', 'LVP'], 'https://example.com/lisa.jpg'),
(3, 'NeNe Leakes', 'NeNe', 'Leakes', ARRAY['NeNe'], 'https://example.com/nene.jpg'),
(4, 'Kyle Richards', 'Kyle', 'Richards', ARRAY['Kyle'], 'https://example.com/kyle.jpg'),
(5, 'Tom Schwartz', 'Tom', 'Schwartz', ARRAY['Schwartz'], 'https://example.com/schwartz.jpg')
ON CONFLICT (id) DO NOTHING;

-- Sample appearances
INSERT INTO gwb_appearances (person_id, series_id, role) VALUES 
(1, 1, 'main'), -- Teresa on RHOA
(1, 2, 'guest'), -- Teresa on RHOBH
(2, 2, 'main'), -- Lisa on RHOBH
(2, 3, 'main'), -- Lisa on Vanderpump Rules
(3, 1, 'main'), -- NeNe on RHOA
(4, 2, 'main'), -- Kyle on RHOBH
(5, 3, 'main'), -- Schwartz on Vanderpump Rules
(5, 4, 'guest') -- Schwartz on Below Deck
ON CONFLICT (person_id, series_id) DO NOTHING;