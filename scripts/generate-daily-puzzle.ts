import './env-loader'
import { generateDailyPuzzle } from '../src/lib/puzzle-generator'

async function main() {
  try {
    console.log('Generating daily puzzle...')
    const puzzleId = await generateDailyPuzzle()
    console.log(`✅ Successfully generated puzzle: ${puzzleId}`)
    process.exit(0)
  } catch (error) {
    console.error('❌ Failed to generate puzzle:', error)
    process.exit(1)
  }
}

main()