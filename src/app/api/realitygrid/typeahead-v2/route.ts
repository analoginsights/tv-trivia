import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')
    
    if (!query || query.length < 2) {
      return NextResponse.json([])
    }
    
    // Use the Supabase function for typeahead search
    const { data, error } = await supabase
      .rpc('rg_people_typeahead', { q: query })
    
    if (error) {
      throw error
    }
    
    const results = data?.map((person: { id: number; name: string; profile_path: string | null; show_count: number }) => ({
      id: person.id,
      name: person.name,
      profile_url: person.profile_path 
        ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
        : null,
      show_count: person.show_count || 0
    })) || []
    
    return NextResponse.json(results)
  } catch (error) {
    console.error('Typeahead error:', error)
    return NextResponse.json(
      { error: 'Failed to search people' },
      { status: 500 }
    )
  }
}