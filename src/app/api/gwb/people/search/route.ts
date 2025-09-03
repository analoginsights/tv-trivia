import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    
    if (!query || query.trim().length < 1) {
      return NextResponse.json([])
    }
    
    // Use the search function we created
    const { data: searchResults, error: searchError } = await supabase
      .rpc('gwb_people_search', {
        search_query: query.trim()
      })
    
    if (searchError) {
      throw searchError
    }
    
    // Format results for autocomplete
    const results = (searchResults || []).map((person: any) => ({
      id: person.id,
      full_name: person.full_name,
      first_name: person.first_name,
      last_name: person.last_name,
      aliases: person.aliases || [],
      similarity_score: person.similarity_score
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