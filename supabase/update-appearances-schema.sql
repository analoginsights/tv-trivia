-- Update rg_appearances to track main cast vs guest stars
-- Run this in Supabase SQL Editor

-- Add new columns to track appearance types
ALTER TABLE rg_appearances 
ADD COLUMN IF NOT EXISTS appearance_kind TEXT 
CHECK (appearance_kind IN ('main', 'guest', 'both'));

ALTER TABLE rg_appearances 
ADD COLUMN IF NOT EXISTS episode_count INTEGER DEFAULT 0;

ALTER TABLE rg_appearances 
ADD COLUMN IF NOT EXISTS guest_episode_count INTEGER DEFAULT 0;

-- Create index for appearance_kind
CREATE INDEX IF NOT EXISTS rg_ap_kind_idx ON rg_appearances (appearance_kind);

-- Update existing data to default to 'main' (since we only had series-level cast before)
UPDATE rg_appearances 
SET appearance_kind = 'main', 
    episode_count = 1 
WHERE appearance_kind IS NULL;

-- Function to reconcile appearance kinds after ETL
CREATE OR REPLACE FUNCTION rg_reconcile_appearance_kinds()
RETURNS void AS $$
BEGIN
    UPDATE rg_appearances 
    SET appearance_kind = 
        CASE
            WHEN (guest_episode_count > 0) AND (episode_count > 0) THEN 'both'
            WHEN (episode_count > 0) THEN 'main'
            WHEN (guest_episode_count > 0) THEN 'guest'
            ELSE NULL
        END;
END;
$$ LANGUAGE plpgsql;

-- Enhanced eligibility function (unchanged logic, but clearer)
CREATE OR REPLACE FUNCTION rg_derive_eligibility_enhanced()
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

-- Function to get show statistics with breakdown
CREATE OR REPLACE FUNCTION rg_shows_with_appearance_breakdown()
RETURNS TABLE(
    id INTEGER, 
    name TEXT, 
    main_people BIGINT, 
    guest_people BIGINT,
    total_eligible BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.name,
        COUNT(DISTINCT CASE WHEN a.appearance_kind IN ('main','both') THEN a.person_id END) as main_people,
        COUNT(DISTINCT CASE WHEN a.appearance_kind IN ('guest','both') THEN a.person_id END) as guest_people,
        COUNT(DISTINCT CASE WHEN p.is_valid = true THEN a.person_id END) as total_eligible
    FROM rg_shows s
    JOIN rg_appearances a ON a.show_id = s.id
    LEFT JOIN rg_people p ON p.id = a.person_id
    GROUP BY s.id, s.name
    ORDER BY total_eligible DESC, main_people DESC;
END;
$$ LANGUAGE plpgsql;