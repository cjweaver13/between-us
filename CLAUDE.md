# Between Us — Project Context for Claude

## What This Is
A private couples counseling web app for Collin and Megan. Two users. No accounts or passwords — just pick your name. The AI counselor (Claude Sonnet) knows both of them by name and context and responds as a neutral therapist.

## Live URL
https://between-us-cm.netlify.app

## Stack
- **Frontend:** Plain HTML/CSS/JS — no framework. Files in `public/`
- **Local backend:** Node.js + Express (`server.js`) — runs on localhost:3000
- **Cloud backend:** Netlify serverless functions (`netlify/functions/`) — auto-deployed
- **Database:** Supabase (cloud) / `public/data.json` (local dev only)
- **AI:** Anthropic API — `claude-sonnet-4-6`, prompt caching on system prompt

## How to Run Locally
```
npm run dev
```
Opens at http://localhost:3000. Requires `.env` with `ANTHROPIC_API_KEY`.

## How to Deploy
Push to GitHub — Netlify auto-deploys within ~60 seconds:
```
git add .
git commit -m "your message"
git push
```
SSH is configured via `github-personal` alias. No tokens needed. The remote is `git@github-personal:cjweaver13/between-us.git`.

## Environment Variables
### Local (`.env`)
- `ANTHROPIC_API_KEY`

### Netlify (set in dashboard → Site configuration → Environment variables)
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL` → `https://jidwfixfuymntlnpdulm.supabase.co`
- `SUPABASE_ANON_KEY` → Supabase secret key

## File Structure
```
between-us/
  server.js                        # Local Express server
  public/
    index.html                     # App shell — user select, 3 tabs
    style.css                      # Dark theme, Collin=purple, Megan=pink, AI=teal
    app.js                         # All frontend logic
    data.json                      # Local-only data store (gitignored)
  netlify/
    functions/
      analyze.js                   # Anthropic API call (Netlify)
      data.js                      # Supabase CRUD (Netlify)
  netlify.toml                     # Redirects /api/* to functions
```

## App Features
**Three tabs:**
1. **Write** — Private entry with mood chips, prompt starters. Two modes:
   - *Check-In*: AI analyzes this entry in isolation
   - *Live Thread*: AI reads full conversation history before responding
2. **Thread** — Full async journal view, all entries from both users, inline replies, session summary
3. **Session** — Live chat interface. Collin on right (purple), Megan on left (pink), counselor response full-width (teal) after every message. Auto-refreshes every 10s so both see each other's messages in near real-time. Enter to send, Shift+Enter for new line. Always uses full thread context.

## AI System Prompts
Two prompts in `server.js` and `netlify/functions/analyze.js`:
- `CHECKIN_PROMPT` — analyzes a single entry independently
- `LIVE_PROMPT` — reads the full thread, responds as a live counselor, directs questions at specific person by name

### What the AI knows about them
- **Collin:** Introverted, analytical, systems-oriented, values unstructured mental freedom and autonomy. Neurodivergent (ADHD).
- **Megan:** RSD (rejection sensitive dysphoria), people-pleasing tendencies, anxiety, finds purpose through external experiences and family connection. Neurodivergent (ADHD).
- They have two rescue dogs with complex needs (Callie and Daisy).

## Supabase Table Schema
```sql
CREATE TABLE entries (
  id text PRIMARY KEY,
  user_name text NOT NULL,
  text text NOT NULL,
  moods text[] DEFAULT '{}',
  analysis text,
  created_at timestamptz DEFAULT now(),
  entry_type text DEFAULT 'entry',
  mode text DEFAULT 'checkin',
  replies jsonb DEFAULT '[]'::jsonb
);
```
RLS is disabled — this is intentional (private two-person app, keys are server-side only).

## Data Flow
- **Local dev:** POST /api/data → server.js → writes to `public/data.json`
- **Netlify:** POST /api/data → `netlify/functions/data.js` → writes to Supabase
- **Both:** POST /api/analyze → analyze function → Anthropic API

## Known Notes
- The GitHub repo (`cjweaver13/between-us`) is separate from the work GitHub account (`cweaverswanyamerica`). SSH is configured with a `github-personal` host alias in `~/.ssh/config` using key `~/.ssh/id_ed25519_personal` to keep them separate.
- `data.json` is gitignored — never commit it.
- `.env` is gitignored — never commit it.
