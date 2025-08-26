import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// Verify required environment variables
const requiredVars = [
  'TMDB_READ_TOKEN',
  'NEXT_PUBLIC_SUPABASE_URL', 
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE'
]

const missing = requiredVars.filter(v => !process.env[v])

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:')
  missing.forEach(v => console.error(`   - ${v}`))
  console.error('\nPlease add these to your .env.local file')
  process.exit(1)
}

console.log('✅ Environment variables loaded successfully')