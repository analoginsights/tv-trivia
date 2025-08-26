import Link from 'next/link'

export default function Home() {
  return (
    <div className="max-w-screen-lg mx-auto px-4 py-16">
      <div className="text-center space-y-8">
        <h1 className="text-5xl font-bold text-gray-900">
          Welcome to TV Trivia
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Test your knowledge of television shows with our collection of fun and challenging trivia games!
        </p>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mt-12">
          <Link 
            href="/realitygrid"
            className="group bg-white border-2 border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-lg transition-all"
          >
            <h2 className="text-2xl font-semibold mb-3 group-hover:text-blue-600">
              Reality Grid
            </h2>
            <p className="text-gray-600">
              Challenge yourself with our reality TV grid puzzle game. Can you connect the shows?
            </p>
            <div className="mt-4 text-blue-600 font-medium group-hover:underline">
              Play Now →
            </div>
          </Link>
          
          <div className="bg-gray-100 border-2 border-gray-200 rounded-lg p-6 opacity-60">
            <h2 className="text-2xl font-semibold mb-3 text-gray-500">
              More Games
            </h2>
            <p className="text-gray-500">
              Coming soon! More exciting TV trivia games are on the way.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}