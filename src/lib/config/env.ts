import { z } from 'zod'

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  
  // Storage/Assets  
  NEXT_PUBLIC_SUPABASE_BUCKET: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_STORAGE_URL: z.string().url().optional(),
  
  // External APIs
  TMDB_API_KEY: z.string().min(1).optional(),
})

export const env = envSchema.parse(process.env)

export type Env = z.infer<typeof envSchema>