import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function runSupabaseTasks() {
  console.log('🚀 Running Supabase Reality Grid Tasks\n')
  
  try {
    // T1: Verify schema
    console.log('=== T1: Schema Verification ===')
    const { data: tableCheck } = await supabaseAdmin
      .from('rg_shows')
      .select('*', { count: 'exact', head: true })
    console.log(`✅ Schema exists (${tableCheck} shows in database)`)
    
    // T2: Refresh eligibility
    console.log('\n=== T2: Refreshing Eligibility ===')
    const { error: eligibilityError } = await supabaseAdmin
      .rpc('rg_derive_eligibility')
    
    if (eligibilityError) {
      throw eligibilityError
    }
    
    // Check results
    const { data: eligibleStats } = await supabaseAdmin
      .from('rg_people')
      .select('is_valid', { count: 'exact' })
    
    const eligible = eligibleStats?.filter(p => p.is_valid).length || 0
    const total = eligibleStats?.length || 0
    console.log(`✅ Eligibility updated: ${eligible}/${total} people eligible (≥3 shows)`)
    
    // T3: Check candidate shows
    console.log('\n=== T3: Candidate Show Selection ===')
    const { data: candidateShows, error: candidateError } = await supabaseAdmin
      .rpc('rg_shows_with_eligible_count')
      .limit(10)
    
    if (candidateError) {
      throw candidateError
    }
    
    console.log(`✅ Found ${candidateShows?.length} shows with eligible people:`)
    candidateShows?.slice(0, 5).forEach((show: any) => {
      console.log(`   - ${show.name}: ${show.eligible_count} eligible people`)
    })
    
    // T4: Generate daily puzzle
    console.log('\n=== T4: Daily Puzzle Generation ===')
    const { data: puzzleId, error: puzzleError } = await supabaseAdmin
      .rpc('rg_generate_daily_puzzle')
    
    if (puzzleError) {
      throw puzzleError
    }
    
    console.log(`✅ Generated puzzle: ${puzzleId}`)
    
    // Check puzzle details
    const { data: puzzle } = await supabaseAdmin
      .from('rg_daily_puzzles')
      .select('*')
      .eq('id', puzzleId)
      .single()
    
    const { data: cells } = await supabaseAdmin
      .from('rg_daily_cells')
      .select('*')
      .eq('puzzle_id', puzzleId)
      .order('row_idx')
      .order('col_idx')
    
    console.log(`   Date: ${puzzle?.date}`)
    console.log(`   Row shows: ${puzzle?.row_show_ids}`)
    console.log(`   Col shows: ${puzzle?.col_show_ids}`)
    console.log('   Cell answer counts:')
    
    // Display as 3x3 grid
    if (cells) {
      for (let r = 0; r < 3; r++) {
        const row = cells.filter(c => c.row_idx === r)
          .sort((a, b) => a.col_idx - b.col_idx)
          .map(c => c.answer_count.toString().padStart(2))
          .join(' ')
        console.log(`     ${row}`)
      }
    }
    
    // T5 & T6: Test validation and typeahead functions
    console.log('\n=== T5 & T6: Function Testing ===')
    
    // Test typeahead
    const { data: searchResults, error: searchError } = await supabaseAdmin
      .rpc('rg_people_typeahead', { q: 'and' })
    
    if (searchError) {
      throw searchError
    }
    
    console.log(`✅ Typeahead search 'and': ${searchResults?.length} results`)
    searchResults?.slice(0, 3).forEach((person: any) => {
      console.log(`   - ${person.name} (${person.show_count} shows)`)
    })
    
    // Test validation with first person and first cell
    if (searchResults && searchResults.length > 0 && puzzle) {
      const testPersonId = searchResults[0].id
      const testRowShow = puzzle.row_show_ids[0]
      const testColShow = puzzle.col_show_ids[0]
      
      const { data: isValid, error: validError } = await supabaseAdmin
        .rpc('rg_is_valid_cell_answer', {
          p_person_id: testPersonId,
          p_row_show_id: testRowShow,
          p_col_show_id: testColShow
        })
      
      if (validError) {
        throw validError
      }
      
      console.log(`✅ Validation test: ${searchResults[0].name} in cell (0,0) = ${isValid}`)
    }
    
    console.log('\n🎉 All Supabase tasks completed successfully!')
    return true
    
  } catch (error) {
    console.error('❌ Task failed:', error)
    return false
  }
}

// Run if executed directly
if (require.main === module) {
  runSupabaseTasks()
    .then(success => {
      if (success) {
        console.log('\n✅ All tasks passed! Reality Grid is ready.')
        process.exit(0)
      } else {
        console.log('\n❌ Some tasks failed.')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('Script error:', error)
      process.exit(1)
    })
}

export { runSupabaseTasks }