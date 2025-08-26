import './env-loader'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

async function testEndpoints() {
  console.log('Testing Reality Grid API endpoints...\n')
  
  const results = {
    passed: 0,
    failed: 0,
    tests: [] as any[]
  }
  
  // Test 1: GET /api/realitygrid/puzzle/today
  console.log('1. Testing GET /api/realitygrid/puzzle/today...')
  try {
    const response = await fetch(`${BASE_URL}/api/realitygrid/puzzle/today`)
    const data = await response.json()
    
    const hasRequiredFields = 
      data.puzzle_id &&
      data.rows?.length === 3 &&
      data.cols?.length === 3 &&
      data.cells?.length === 9 &&
      data.rules?.max_wrong !== undefined
    
    if (response.ok && hasRequiredFields) {
      console.log('   ✅ PASSED - Puzzle structure valid')
      results.passed++
      results.tests.push({ 
        endpoint: 'GET /puzzle/today', 
        status: 'passed',
        data: { puzzle_id: data.puzzle_id, date: data.date }
      })
    } else {
      console.log('   ❌ FAILED - Invalid puzzle structure')
      results.failed++
      results.tests.push({ endpoint: 'GET /puzzle/today', status: 'failed', error: 'Invalid structure' })
    }
  } catch (error) {
    console.log('   ❌ FAILED -', error)
    results.failed++
    results.tests.push({ endpoint: 'GET /puzzle/today', status: 'failed', error: String(error) })
  }
  
  // Test 2: GET /api/realitygrid/typeahead
  console.log('2. Testing GET /api/realitygrid/typeahead?q=and...')
  try {
    const response = await fetch(`${BASE_URL}/api/realitygrid/typeahead?q=and`)
    const data = await response.json()
    
    const isValidArray = Array.isArray(data)
    const hasValidStructure = !data.length || data.every((p: any) => 
      p.id && p.name && p.show_count !== undefined
    )
    
    if (response.ok && isValidArray && hasValidStructure) {
      console.log(`   ✅ PASSED - Returned ${data.length} results`)
      results.passed++
      results.tests.push({ 
        endpoint: 'GET /typeahead', 
        status: 'passed',
        resultCount: data.length
      })
    } else {
      console.log('   ❌ FAILED - Invalid response structure')
      results.failed++
      results.tests.push({ endpoint: 'GET /typeahead', status: 'failed', error: 'Invalid structure' })
    }
  } catch (error) {
    console.log('   ❌ FAILED -', error)
    results.failed++
    results.tests.push({ endpoint: 'GET /typeahead', status: 'failed', error: String(error) })
  }
  
  // Test 3: POST /api/realitygrid/validate
  console.log('3. Testing POST /api/realitygrid/validate...')
  try {
    // First get puzzle to have valid IDs
    const puzzleRes = await fetch(`${BASE_URL}/api/realitygrid/puzzle/today`)
    const puzzle = await puzzleRes.json()
    
    if (!puzzle.puzzle_id) {
      throw new Error('No puzzle available for validation test')
    }
    
    // Test with dummy data (will likely be incorrect)
    const response = await fetch(`${BASE_URL}/api/realitygrid/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        puzzle_id: puzzle.puzzle_id,
        r: 0,
        c: 0,
        person_id: 1
      })
    })
    const data = await response.json()
    
    if (response.ok && typeof data.is_correct === 'boolean') {
      console.log(`   ✅ PASSED - Validation returned: ${data.is_correct}`)
      results.passed++
      results.tests.push({ 
        endpoint: 'POST /validate', 
        status: 'passed',
        result: data.is_correct
      })
    } else {
      console.log('   ❌ FAILED - Invalid response')
      results.failed++
      results.tests.push({ endpoint: 'POST /validate', status: 'failed', error: 'Invalid response' })
    }
  } catch (error) {
    console.log('   ❌ FAILED -', error)
    results.failed++
    results.tests.push({ endpoint: 'POST /validate', status: 'failed', error: String(error) })
  }
  
  // Summary
  console.log('\n=== API Test Summary ===')
  console.log(`✅ Passed: ${results.passed}`)
  console.log(`❌ Failed: ${results.failed}`)
  console.log(`Total: ${results.passed + results.failed}`)
  
  return results
}

// Run tests
if (require.main === module) {
  testEndpoints()
    .then(results => {
      if (results.failed === 0) {
        console.log('\n🎉 All API tests passed!')
        process.exit(0)
      } else {
        console.log('\n⚠️  Some tests failed')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('Test suite failed:', error)
      process.exit(1)
    })
}

export { testEndpoints }