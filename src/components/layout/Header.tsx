import Link from 'next/link'

export default function Header() {
  return (
    <header className="bg-gray-900 text-white">
      <div className="max-w-screen-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold hover:text-gray-300 transition-colors">
            TV Trivia
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/" className="hover:text-gray-300 transition-colors">
              Home
            </Link>
            <Link href="/realitygrid" className="hover:text-gray-300 transition-colors">
              Reality Grid
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}