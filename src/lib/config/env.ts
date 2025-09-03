// Environment configuration with optional validation
// Note: We don't enforce validation here to avoid runtime crashes
// The actual environment variables are accessed directly in the files that need them

export const envConfig = {
  // Helper to check if running in browser
  isClient: typeof window !== 'undefined',
  
  // Helper to safely get env vars
  get: (key: string): string | undefined => {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key]
    }
    return undefined
  },
  
  // List of expected environment variables for documentation
  expected: {
    client: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_BUCKET',
      'NEXT_PUBLIC_SUPABASE_STORAGE_URL',
    ],
    server: [
      'SUPABASE_SERVICE_ROLE_KEY',
      'TMDB_API_KEY',
    ]
  }
}