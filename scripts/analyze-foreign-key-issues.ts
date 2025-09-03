import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function analyzeForeignKeyIssues() {
  console.log('🔍 Analyzing Foreign Key Issues...\n')
  
  try {
    // Step 1: Get current counts
    console.log('=== Current Database State ===')
    
    const { data: shows } = await supabaseAdmin
      .from('rg_shows')
      .select('*', { count: 'exact' })
    
    const { data: people } = await supabaseAdmin
      .from('rg_people')
      .select('*', { count: 'exact' })
    
    const { data: appearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('*', { count: 'exact' })
    
    console.log(`Shows: ${shows?.length || 0}`)
    console.log(`People: ${people?.length || 0}`)
    console.log(`Appearances: ${appearances?.length || 0}`)
    
    // Step 2: Check for orphaned appearances
    console.log('\n=== Orphaned Appearances Analysis ===')
    
    const { data: orphanedAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('person_id, show_id')
      .not('person_id', 'in', `(SELECT id FROM rg_people)`)
    
    console.log(`Orphaned appearances (missing person): ${orphanedAppearances?.length || 0}`)
    
    if (orphanedAppearances && orphanedAppearances.length > 0) {
      const uniqueOrphanedPeople = new Set(orphanedAppearances.map(a => a.person_id))
      console.log(`Unique missing person IDs: ${uniqueOrphanedPeople.size}`)
      console.log('Sample missing person IDs:', Array.from(uniqueOrphanedPeople).slice(0, 10))
    }
    
    // Step 3: Check for orphaned people (people with no appearances)
    console.log('\n=== Orphaned People Analysis ===')
    
    const { data: peopleWithoutAppearances } = await supabaseAdmin
      .from('rg_people')
      .select('id, name')
      .not('id', 'in', `(SELECT DISTINCT person_id FROM rg_appearances WHERE person_id IS NOT NULL)`)
    
    console.log(`People without appearances: ${peopleWithoutAppearances?.length || 0}`)
    
    // Step 4: Show distribution analysis
    console.log('\n=== Show Distribution Analysis ===')
    
    const showCounts = new Map()
    appearances?.forEach(app => {
      showCounts.set(app.show_id, (showCounts.get(app.show_id) || 0) + 1)
    })
    
    const sortedShows = Array.from(showCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    
    console.log('Top 10 shows by appearance count:')
    for (const [showId, count] of sortedShows) {
      const show = shows?.find(s => s.id === showId)
      console.log(`  ${show?.name || `Show ${showId}`}: ${count} appearances`)
    }
    
    // Step 5: Data integrity check
    console.log('\n=== Data Integrity Check ===')
    
    const allPersonIds = new Set(people?.map(p => p.id) || [])
    const allShowIds = new Set(shows?.map(s => s.id) || [])
    const appearancePersonIds = new Set(appearances?.map(a => a.person_id) || [])
    const appearanceShowIds = new Set(appearances?.map(a => a.show_id) || [])
    
    const invalidPersonRefs = Array.from(appearancePersonIds).filter(id => !allPersonIds.has(id))
    const invalidShowRefs = Array.from(appearanceShowIds).filter(id => !allShowIds.has(id))
    
    console.log(`Invalid person references in appearances: ${invalidPersonRefs.length}`)
    console.log(`Invalid show references in appearances: ${invalidShowRefs.length}`)
    
    if (invalidPersonRefs.length > 0) {
      console.log('Sample invalid person IDs:', invalidPersonRefs.slice(0, 10))
    }
    
    // Step 6: Eligibility analysis
    console.log('\n=== Eligibility Analysis ===')
    
    const { data: eligiblePeople } = await supabaseAdmin
      .from('rg_people')
      .select('id', { count: 'exact' })
      .eq('is_valid', true)
    
    console.log(`Currently marked as eligible: ${eligiblePeople?.length || 0}`)
    
    // Manual calculation of actual eligibility
    const personShowCounts = new Map()
    appearances?.forEach(app => {
      if (!personShowCounts.has(app.person_id)) {
        personShowCounts.set(app.person_id, new Set())
      }
      personShowCounts.get(app.person_id).add(app.show_id)
    })
    
    let actuallyEligible = 0
    personShowCounts.forEach(shows => {
      if (shows.size >= 3) actuallyEligible++
    })
    
    console.log(`Actually eligible (≥3 shows): ${actuallyEligible}`)
    console.log(`Eligibility calculation gap: ${(eligiblePeople?.length || 0) - actuallyEligible}`)
    
    return {
      shows: shows?.length || 0,
      people: people?.length || 0,
      appearances: appearances?.length || 0,
      orphanedAppearances: orphanedAppearances?.length || 0,
      orphanedPeople: peopleWithoutAppearances?.length || 0,
      invalidPersonRefs: invalidPersonRefs.length,
      invalidShowRefs: invalidShowRefs.length,
      markedEligible: eligiblePeople?.length || 0,
      actuallyEligible
    }
    
  } catch (error) {
    console.error('❌ Analysis failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  analyzeForeignKeyIssues()
    .then((stats) => {
      console.log('\n📊 Analysis Summary:')
      console.log(`  Database has ${stats.invalidPersonRefs} invalid person references`)
      console.log(`  Database has ${stats.orphanedAppearances} orphaned appearances`)
      console.log(`  Eligibility gap: ${stats.markedEligible - stats.actuallyEligible}`)
      
      if (stats.invalidPersonRefs > 0) {
        console.log('\n⚠️  Foreign key constraint violations detected!')
        console.log('   ETL process needs fixing to prevent data loss.')
      }
      
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { analyzeForeignKeyIssues }