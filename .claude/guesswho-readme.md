

GuessWho — Bravo Edition

Daily, 20-second, 6-guess game to identify a Bravo personality from a progressively pixelated → revealed headshot. A single global puzzle releases daily at midnight.
	•	Timer: 20s total; 6 guesses.
	•	Guessing pauses the timer; wrong/“I don’t know” resumes it.
	•	Image reveal steps at [18, 15, 12, 9, 6, 3, 0] seconds (coarse → clear).
	•	Pixelation is implemented in the client via HTML5 Canvas using downscale→nearest-neighbor upscale (not blur).

TMDB attribution: “This product uses the TMDB API but is not endorsed or certified by TMDB.” Include the TMDB logo in Credits/About.

⸻

Daily Content Source (TMDB)

We fetch a new random eligible person from TMDB once per day and persist it so all players see the same answer.

Eligibility rule
	•	Person must appear in ≥ 1 TV series that airs on TMDB network id = 74 (Bravo).
	•	Exclude appearances on series id = 22980 from counting toward that “≥ 1” (i.e., that title does not qualify a person on its own).
	•	We store the person’s TMDB person id, name, and download their profile image into our public Supabase Storage bucket for that day’s puzzle.

Implementation options
	•	Vercel Cron (recommended) or Supabase Scheduled Function runs at 00:00 (project timezone).
	•	The job:
	1.	Use Discover TV to list Bravo shows: /discover/tv?with_networks=74&without_ids=22980 (pull several pages to widen the pool).
	2.	For a random subset of shows, fetch aggregate credits /tv/{tv_id}/aggregate_credits (or /tv/{tv_id}/credits) and collect cast members.
	3.	Pick a random person from the union of those casts.
	4.	Get person details /person/{person_id} to confirm a profile_path exists.
	5.	Download the person’s profile image from TMDB’s image CDN (e.g., w780/original) and save to Supabase Storage: public/bravo/people/{person_id}/YYYY-MM-DD.jpg.
	6.	Upsert the daily row in the DB (see schema below).

Why fetch by shows → people? TMDB’s person endpoints don’t filter by network directly; filtering via shows on network 74 is reliable.

⸻

Data Model (minimum)

We persist the chosen person per day and serve that to the client.

-- daily pick
create table if not exists gwb_daily (
  date_utc date primary key,
  person_tmdb_id bigint not null,
  person_name text not null,
  image_path text not null,   -- Supabase Storage path we saved (not remote URL)
  created_at timestamptz default now()
);

create index if not exists idx_gwb_daily_date on gwb_daily(date_utc);

If you already have gwb_daily(person_id), keep it and add person_tmdb_id, person_name, image_path columns.

⸻

Environment

TMDB_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...   # for server-side storage write
PUBLIC_STORAGE_BUCKET=gwb       # or your bucket name


⸻

Server job (Edge Function / Route Handler)

TypeScript (Node/Edge) pseudo-implementation — adjust to your router/runtime:

// /api/admin/roll-daily (protect behind secret or run via cron)
// Pseudocode: fetch Bravo shows, get casts, choose person, download image to Supabase Storage.
import { createClient } from '@supabase/supabase-js';

const TMDB = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';
const SUPABASE = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = process.env.PUBLIC_STORAGE_BUCKET || 'gwb';

async function tmdb(path: string, params: Record<string, any> = {}) {
  const url = new URL(`${TMDB}${path}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY!);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const r = await fetch(url, { next: { revalidate: 0 }});
  if (!r.ok) throw new Error(`TMDB ${path} ${r.status}`);
  return r.json();
}

async function getBravoShowIds(pages = [1,2,3]) {
  const ids: number[] = [];
  for (const page of pages) {
    const data = await tmdb('/discover/tv', { with_networks: 74, page, without_ids: 22980 });
    for (const s of data.results) ids.push(s.id);
  }
  // ensure 22980 excluded even if not honored by discover params
  return [...new Set(ids.filter(id => id !== 22980))];
}

async function getCastForShow(tvId: number) {
  // aggregate credits is richer; fall back to credits if needed
  try {
    const data = await tmdb(`/tv/${tvId}/aggregate_credits`);
    return (data.cast || []).map((c: any) => c.id).filter(Boolean);
  } catch {
    const data = await tmdb(`/tv/${tvId}/credits`);
    return (data.cast || []).map((c: any) => c.id).filter(Boolean);
  }
}

function choice<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export async function GET() {
  const today = new Date().toISOString().slice(0,10);

  // 1) candidate shows on Bravo
  const showIds = await getBravoShowIds();

  // 2) sample a few shows to keep the request count low
  const sample = showIds.sort(() => 0.5 - Math.random()).slice(0, 10);

  // 3) gather cast ids
  const allPeople = new Set<number>();
  for (const tvId of sample) {
    const castIds = await getCastForShow(tvId);
    castIds.forEach(id => allPeople.add(id));
  }
  if (!allPeople.size) return new Response('No candidates', { status: 204 });

  // 4) choose person with a profile image
  let person: any | null = null;
  for (let i = 0; i < 20; i++) {
    const candidateId = choice([...allPeople]);
    const data = await tmdb(`/person/${candidateId}`);
    if (data && data.profile_path) { person = data; break; }
  }
  if (!person) return new Response('No person with image', { status: 204 });

  // 5) download TMDB image and store in Supabase
  const imgUrl = `${IMAGE_BASE}/w780${person.profile_path}`;
  const imgRes = await fetch(imgUrl);
  if (!imgRes.ok || !imgRes.body) return new Response('Image fetch failed', { status: 502 });

  const storagePath = `bravo/people/${person.id}/${today}.jpg`;
  const { error } = await SUPABASE.storage.from(BUCKET).upload(storagePath, await imgRes.arrayBuffer(), {
    contentType: imgRes.headers.get('content-type') || 'image/jpeg',
    upsert: true
  });
  if (error) return new Response(error.message, { status: 500 });

  // 6) upsert daily row
  const { error: dberr } = await SUPABASE.from('gwb_daily').upsert({
    date_utc: today,
    person_tmdb_id: person.id,
    person_name: person.name,
    image_path: storagePath
  }, { onConflict: 'date_utc' });
  if (dberr) return new Response(dberr.message, { status: 500 });

  return Response.json({ date: today, person: { id: person.id, name: person.name }, image_path: storagePath });
}

Cron example (Vercel):

// vercel.json
{
  "crons": [
    { "path": "/api/admin/roll-daily", "schedule": "0 0 * * *" }
  ]
}


⸻

Public API (served to the client)
	•	GET /api/gwb/daily → returns today’s person: { date, person: { id, name }, imageUrl }
	•	Server should convert image_path → public URL (Supabase signed URL or public bucket URL).
	•	POST /api/gwb/guess → validates guess; pauses timer while in flight.
	•	GET /api/gwb/result → returns final result + share text.

⸻

Client: Pixelation (Canvas)

We render the stored image via Canvas and progressively reduce pixel block size. Key points:
	•	Downscale to a tiny offscreen canvas, then upscale to display size with
ctx.imageSmoothingEnabled = false (nearest-neighbor) → real pixelation.
	•	Steps: [40, 30, 22, 16, 12, 8, 4, 1] pixels per block map to seconds [20,17,14,11,8,5,3,0].
	•	Keep images Canvas-safe: either serve from your own origin (proxy) or set Storage CORS headers; set img.crossOrigin = 'anonymous' before src.

⸻

Security / Policies
	•	RLS: gwb_daily is read-only to anon; only the server job writes.
	•	Storage: objects in bravo/people/... can be public or served through a proxy with CORS headers.
	•	Attribution: Include the required TMDB credit line and logo on the site.

⸻

Notes
	•	Series 22980 is explicitly excluded from eligibility checks (does not count toward the ≥1 series rule).
	•	We keep one job per day to minimize TMDB calls and avoid client leakage of the answer.
	•	If the job fails to find a candidate, /api/gwb/daily should return 204 No Content and the UI should show “No puzzle today.”

