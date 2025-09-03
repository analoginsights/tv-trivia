import './env-loader'
import { supabaseAdmin } from '../src/lib/supabase'

async function createTodaysPuzzle() {
  try {
    // Get today's date in UTC
    const today = new Date()
    const dateUtc = today.toISOString().split('T')[0]
    
    console.log(`Creating puzzle for date: ${dateUtc}`)
    
    // First, check if a puzzle already exists for today
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('gwb_daily')
      .select('*')
      .eq('date_utc', dateUtc)
      .single()
    
    if (existing) {
      console.log('A puzzle already exists for today:', existing)
      return existing
    }
    
    // Get all available people from gwb_people
    const { data: people, error: peopleError } = await supabaseAdmin
      .from('gwb_people')
      .select('id, full_name')
      .eq('is_active', true)
    
    if (peopleError) {
      console.error('Error fetching people:', peopleError)
      return
    }
    
    if (!people || people.length === 0) {
      console.error('No active people found in gwb_people table')
      
      // Let's check if the table exists and has any data at all
      const { data: allPeople, error: allError } = await supabaseAdmin
        .from('gwb_people')
        .select('id, full_name')
        .limit(5)
      
      if (allError) {
        console.error('Error checking gwb_people table:', allError)
      } else {
        console.log(`Found ${allPeople?.length || 0} total people (showing first 5):`, allPeople)
      }
      
      // If no people exist, let's create some sample data
      if (!allPeople || allPeople.length === 0) {
        console.log('Creating sample people data...')
        const samplePeople = [
          { full_name: 'Teresa Giudice', is_active: true },
          { full_name: 'Kyle Richards', is_active: true },
          { full_name: 'Lisa Vanderpump', is_active: true },
          { full_name: 'Bethenny Frankel', is_active: true },
          { full_name: 'NeNe Leakes', is_active: true },
        ]
        
        const { data: created, error: createError } = await supabaseAdmin
          .from('gwb_people')
          .insert(samplePeople)
          .select()
        
        if (createError) {
          console.error('Error creating sample people:', createError)
          return
        }
        
        console.log('Created sample people:', created)
        
        // Use the first created person for today's puzzle
        if (created && created.length > 0) {
          const selectedPerson = created[0]
          const { data: newPuzzle, error: insertError } = await supabaseAdmin
            .from('gwb_daily')
            .insert({
              date_utc: dateUtc,
              person_id: selectedPerson.id
            })
            .select()
            .single()
          
          if (insertError) {
            console.error('Error creating daily puzzle:', insertError)
            return
          }
          
          console.log('Successfully created daily puzzle with sample data:', newPuzzle)
          return newPuzzle
        }
      }
      return
    }
    
    console.log(`Found ${people.length} active people`)
    
    // Select a random person for today's puzzle
    const randomIndex = Math.floor(Math.random() * people.length)
    const selectedPerson = people[randomIndex]
    
    console.log(`Selected person: ${selectedPerson.full_name} (ID: ${selectedPerson.id})`)
    
    // Insert the new daily puzzle
    const { data: newPuzzle, error: insertError } = await supabaseAdmin
      .from('gwb_daily')
      .insert({
        date_utc: dateUtc,
        person_id: selectedPerson.id
      })
      .select()
      .single()
    
    if (insertError) {
      console.error('Error creating daily puzzle:', insertError)
      return
    }
    
    console.log('Successfully created daily puzzle:', newPuzzle)
    return newPuzzle
    
  } catch (error) {
    console.error('Unexpected error:', error)
  } finally {
    process.exit(0)
  }
}

createTodaysPuzzle()