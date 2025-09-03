import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

const EXCLUDED_SHOW_ID = 22980 // Watch What Happens Live with Andy Cohen

async function cleanAndExcludeShow() {
  console.log(`🧹 Cleaning database and excluding show ${EXCLUDED_SHOW_ID}...\n`)
  
  try {
    // Get current counts before cleaning
    const { data: shows } = await supabaseAdmin
      .from('rg_shows')
      .select('*', { count: 'exact' })
    
    const { data: people } = await supabaseAdmin
      .from('rg_people') 
      .select('*', { count: 'exact' })
      
    const { data: appearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('*', { count: 'exact' })
      
    console.log('Current database state:')
    console.log(`  Shows: ${shows?.length || 0}`)
    console.log(`  People: ${people?.length || 0}`) 
    console.log(`  Appearances: ${appearances?.length || 0}`)
    
    // Delete in reverse dependency order
    console.log('\n🗑️  Deleting all appearances...')
    const { error: appearancesError } = await supabaseAdmin
      .from('rg_appearances')
      .delete()
      .neq('show_id', 0) // Delete all
      
    if (appearancesError) {
      console.error('Failed to clean appearances:', appearancesError)
      throw appearancesError
    }
    console.log('✅ Appearances deleted')
    
    console.log('🗑️  Deleting all people...')
    const { error: peopleError } = await supabaseAdmin
      .from('rg_people')
      .delete()
      .neq('id', 0) // Delete all
      
    if (peopleError) {
      console.error('Failed to clean people:', peopleError)
      throw peopleError
    }
    console.log('✅ People deleted')
    
    console.log('🗑️  Deleting all shows...')
    const { error: showsError } = await supabaseAdmin
      .from('rg_shows') 
      .delete()
      .neq('id', 0) // Delete all
      
    if (showsError) {
      console.error('Failed to clean shows:', showsError)
      throw showsError
    }
    console.log('✅ Shows deleted')
    
    // Verify clean state
    const { data: finalShows } = await supabaseAdmin.from('rg_shows').select('*', { count: 'exact' })
    const { data: finalPeople } = await supabaseAdmin.from('rg_people').select('*', { count: 'exact' })
    const { data: finalAppearances } = await supabaseAdmin.from('rg_appearances').select('*', { count: 'exact' })
    
    console.log('\n📊 Final database state:')
    console.log(`  Shows: ${finalShows?.length || 0}`)
    console.log(`  People: ${finalPeople?.length || 0}`)
    console.log(`  Appearances: ${finalAppearances?.length || 0}`)
    
    console.log(`\n🎯 Database cleaned successfully!`)
    console.log(`   Show ${EXCLUDED_SHOW_ID} will be excluded from future ETL runs.`)
    
    return {
      before: {
        shows: shows?.length || 0,
        people: people?.length || 0, 
        appearances: appearances?.length || 0
      },
      after: {
        shows: finalShows?.length || 0,
        people: finalPeople?.length || 0,
        appearances: finalAppearances?.length || 0
      },
      excludedShowId: EXCLUDED_SHOW_ID
    }
    
  } catch (error) {
    console.error('❌ Failed to clean database:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  cleanAndExcludeShow()
    .then(() => {
      console.log('✅ Cleanup complete - ready for ETL without problematic show')
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { cleanAndExcludeShow }