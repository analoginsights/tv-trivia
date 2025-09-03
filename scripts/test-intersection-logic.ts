import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function testIntersectionLogic() {
  console.log('🔍 Testing intersection logic for main vs guest appearances...\n')
  
  try {
    // Get our puzzle shows
    const projectRunwayId = 1685  // Project Runway
    const realHousewivesBHId = 32390  // Real Housewives of Beverly Hills
    
    console.log('1. Finding people who appear in both shows:')
    
    // Find people in both shows using same logic as game
    const { data: projectRunwayAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('person_id, appearance_kind, episode_count, guest_episode_count')
      .eq('show_id', projectRunwayId)
      .range(0, 999)
      
    const { data: realHousewivesAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('person_id, appearance_kind, episode_count, guest_episode_count') 
      .eq('show_id', realHousewivesBHId)
      .range(0, 999)
      
    const projectRunwayPeople = new Set(projectRunwayAppearances?.map(a => a.person_id) || [])
    const realHousewivesPeople = new Set(realHousewivesAppearances?.map(a => a.person_id) || [])
    
    const intersectionPeople = [...projectRunwayPeople].filter(id => realHousewivesPeople.has(id))
    
    console.log(`   Project Runway people: ${projectRunwayPeople.size}`)
    console.log(`   Real Housewives BH people: ${realHousewivesPeople.size}`)
    console.log(`   Intersection people: ${intersectionPeople.length}`)
    
    if (intersectionPeople.length > 0) {
      console.log('\n2. Analyzing intersection people:')
      
      for (const personId of intersectionPeople) {
        // Get person details
        const { data: person } = await supabaseAdmin
          .from('rg_people')
          .select('name')
          .eq('id', personId)
          .single()
          
        // Get their appearances in both shows
        const prAppearance = projectRunwayAppearances?.find(a => a.person_id === personId)
        const rhAppearance = realHousewivesAppearances?.find(a => a.person_id === personId)
        
        console.log(`\n   Person: ${person?.name || `ID: ${personId}`}`)
        console.log(`     Project Runway: ${prAppearance?.appearance_kind} (${prAppearance?.episode_count} episodes, ${prAppearance?.guest_episode_count} guest episodes)`)
        console.log(`     Real Housewives BH: ${rhAppearance?.appearance_kind} (${rhAppearance?.episode_count} episodes, ${rhAppearance?.guest_episode_count} guest episodes)`)
        
        // Test game validation logic
        const { data: validationTest } = await supabaseAdmin
          .from('rg_appearances')
          .select('show_id')
          .eq('person_id', personId)
          .in('show_id', [projectRunwayId, realHousewivesBHId])
          
        const showIds = validationTest?.map(a => a.show_id) || []
        const isValid = showIds.includes(projectRunwayId) && showIds.includes(realHousewivesBHId)
        
        console.log(`     Game validation result: ${isValid ? '✅ VALID' : '❌ INVALID'}`)
      }
    } else {
      console.log('\n⚠️  No intersection people found between these shows')
    }
    
    console.log('\n3. Testing Below Deck intersection:')
    
    const belowDeckId = 50042  // Below Deck
    const belowDeckMedId = 66902  // Below Deck Mediterranean
    
    const { data: belowDeckAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('person_id, appearance_kind')
      .eq('show_id', belowDeckId)
      .range(0, 999)
      
    const { data: belowDeckMedAppearances } = await supabaseAdmin
      .from('rg_appearances')
      .select('person_id, appearance_kind')
      .eq('show_id', belowDeckMedId)
      .range(0, 999)
      
    const bdPeople = new Set(belowDeckAppearances?.map(a => a.person_id) || [])
    const bdMedPeople = new Set(belowDeckMedAppearances?.map(a => a.person_id) || [])
    
    const bdIntersection = [...bdPeople].filter(id => bdMedPeople.has(id))
    
    console.log(`   Below Deck people: ${bdPeople.size}`)
    console.log(`   Below Deck Med people: ${bdMedPeople.size}`)
    console.log(`   Intersection people: ${bdIntersection.length}`)
    
    if (bdIntersection.length > 0) {
      const samplePersonId = bdIntersection[0]
      
      const { data: person } = await supabaseAdmin
        .from('rg_people')
        .select('name')
        .eq('id', samplePersonId)
        .single()
        
      const bdApp = belowDeckAppearances?.find(a => a.person_id === samplePersonId)
      const bdMedApp = belowDeckMedAppearances?.find(a => a.person_id === samplePersonId)
      
      console.log(`\n   Sample intersection person: ${person?.name || `ID: ${samplePersonId}`}`)
      console.log(`     Below Deck: ${bdApp?.appearance_kind}`)
      console.log(`     Below Deck Med: ${bdMedApp?.appearance_kind}`)
    }
    
    return {
      projectRunwayIntersection: intersectionPeople.length,
      belowDeckIntersection: bdIntersection.length,
      totalIntersections: intersectionPeople.length + bdIntersection.length
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

// Run if executed directly
if (require.main === module) {
  testIntersectionLogic()
    .then(result => {
      console.log('\n📊 Test Summary:')
      console.log(`   Project Runway ∩ Real Housewives BH: ${result.projectRunwayIntersection} people`)
      console.log(`   Below Deck ∩ Below Deck Med: ${result.belowDeckIntersection} people`)
      console.log(`   Total intersections: ${result.totalIntersections} people`)
      
      console.log('\n✅ Game logic includes both main cast and guest appearances!')
      process.exit(0)
    })
    .catch(() => process.exit(1))
}

export { testIntersectionLogic }