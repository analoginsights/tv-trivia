import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

export async function GET() {
  try {
    console.log('Setting up Supabase resources...')
    
    // 1. Create storage bucket
    console.log('Creating storage bucket "gwb"...')
    const { data: bucketData, error: bucketError } = await supabase.storage
      .createBucket('gwb', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        fileSizeLimit: 5242880 // 5MB
      })
    
    let bucketStatus = 'created'
    if (bucketError) {
      if (bucketError.message.includes('already exists')) {
        bucketStatus = 'already exists'
        console.log('Bucket already exists, continuing...')
      } else {
        console.error('Bucket creation error:', bucketError)
        return NextResponse.json({ error: 'Bucket creation failed', details: bucketError }, { status: 500 })
      }
    } else {
      console.log('Bucket created successfully:', bucketData)
    }
    
    // 2. Set up database tables
    console.log('\nSetting up database tables...')
    
    // Drop old tables
    const dropStatements = [
      'DROP TABLE IF EXISTS gwb_guesses CASCADE;',
      'DROP TABLE IF EXISTS gwb_appearances CASCADE;',
      'DROP TABLE IF EXISTS gwb_people CASCADE;',
      'DROP TABLE IF EXISTS gwb_series CASCADE;',
      'DROP TABLE IF EXISTS gwb_stats CASCADE;'
    ]
    
    for (const sql of dropStatements) {
      console.log('Executing:', sql)
      const { error } = await supabase.rpc('sql', { query: sql })
      if (error && !error.message.includes('does not exist')) {
        console.error('Drop error:', error)
      }
    }
    
    // Create new tables
    const createDaily = `CREATE TABLE IF NOT EXISTS gwb_daily (
      date_utc DATE PRIMARY KEY,
      person_tmdb_id BIGINT NOT NULL,
      person_name TEXT NOT NULL,
      image_path TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`
    
    console.log('Creating gwb_daily table...')
    const { error: dailyError } = await supabase.rpc('sql', { query: createDaily })
    if (dailyError) {
      console.error('Daily table creation error:', dailyError)
    } else {
      console.log('Daily table created successfully')
    }
    
    const createGuesses = `CREATE TABLE IF NOT EXISTS gwb_guesses (
      id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      play_date_utc DATE NOT NULL,
      client_id TEXT NOT NULL,
      guess_order SMALLINT NOT NULL CHECK (guess_order BETWEEN 1 AND 6),
      value TEXT NOT NULL,
      is_correct BOOLEAN NOT NULL,
      elapsed_ms INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`
    
    console.log('Creating gwb_guesses table...')
    const { error: guessesError } = await supabase.rpc('sql', { query: createGuesses })
    if (guessesError) {
      console.error('Guesses table creation error:', guessesError)
    } else {
      console.log('Guesses table created successfully')
    }
    
    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_gwb_daily_date ON gwb_daily(date_utc);',
      'CREATE INDEX IF NOT EXISTS idx_gwb_guesses_date_client ON gwb_guesses (play_date_utc, client_id);',
      'CREATE INDEX IF NOT EXISTS idx_gwb_guesses_date ON gwb_guesses (play_date_utc);'
    ]
    
    for (const sql of indexes) {
      console.log('Creating index...')
      const { error } = await supabase.rpc('sql', { query: sql })
      if (error && !error.message.includes('already exists')) {
        console.error('Index creation error:', error)
      } else {
        console.log('Index created successfully')
      }
    }
    
    // Enable RLS
    const rls = [
      'ALTER TABLE gwb_daily ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE gwb_guesses ENABLE ROW LEVEL SECURITY;'
    ]
    
    for (const sql of rls) {
      console.log('Enabling RLS...')
      const { error } = await supabase.rpc('sql', { query: sql })
      if (error) {
        console.error('RLS error:', error)
      }
    }
    
    // Create RLS policies
    const policies = [
      'CREATE POLICY IF NOT EXISTS "Public can read daily puzzles" ON gwb_daily FOR SELECT USING (true);',
      'CREATE POLICY IF NOT EXISTS "Users can insert guesses" ON gwb_guesses FOR INSERT WITH CHECK (true);',
      'CREATE POLICY IF NOT EXISTS "Users can read own guesses" ON gwb_guesses FOR SELECT USING (true);'
    ]
    
    for (const sql of policies) {
      console.log('Creating policy...')
      const { error } = await supabase.rpc('sql', { query: sql })
      if (error && !error.message.includes('already exists')) {
        console.error('Policy creation error:', error)
      }
    }
    
    // Test the setup
    console.log('\nTesting setup...')
    const { data, error } = await supabase.from('gwb_daily').select('*').limit(1)
    if (error) {
      console.error('Test query error:', error)
      return NextResponse.json({ error: 'Database test failed', details: error }, { status: 500 })
    }
    
    console.log('Setup completed successfully!')
    
    return NextResponse.json({
      success: true,
      message: 'Supabase setup completed',
      bucket: bucketStatus,
      tables_created: true,
      test_query_rows: data?.length || 0
    })
    
  } catch (error) {
    console.error('Setup failed:', error)
    return NextResponse.json({ error: 'Setup failed', details: error }, { status: 500 })
  }
}