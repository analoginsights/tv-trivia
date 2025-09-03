import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    
    if (!query || query.trim().length < 1) {
      return NextResponse.json([])
    }
    
    // Search people by full name using text search
    const searchQuery = query.trim().toLowerCase()
    
    const { data: searchResults, error: searchError } = await supabase
      .from('gwb_people')
      .select('id, full_name, first_name, last_name, aliases')
      .eq('is_active', true)
      .or(`full_name.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%`)
      .order('full_name')
      .limit(20)
    
    if (searchError) {
      throw searchError
    }
    
    // Format results for autocomplete
    const results = (searchResults || []).map((person: {
      id: number
      full_name: string
      first_name: string | null
      last_name: string | null
      aliases: string[] | null
    }) => ({
      id: person.id,
      full_name: person.full_name,
      first_name: person.first_name,
      last_name: person.last_name,
      aliases: person.aliases || []
    }))
    
    return NextResponse.json(results)
  } catch (error) {
    console.error('Error searching people:', error)
    return NextResponse.json(
      { error: 'Failed to search people' },
      { status: 500 }
    )
  }
}