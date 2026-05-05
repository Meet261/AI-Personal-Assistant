# AI Personal Assistant

A self-hosted, privacy-first personal productivity dashboard powered by a **local LLM (Ollama)**. No data leaves your machine except what you store in your own Supabase project.

**Features:**
- **Dashboard** — daily stats, quick-add tasks, upcoming deadlines, activity feed
- **Tasks** — full CRUD with priority/status filters, comments, and a slide-in detail drawer
- **Projects** — project tracking with per-project task lists and progress bars
- **Journal** — daily entries with mood tracking (1–5), tags, and streak counter
- **Check-in** — Ollama-generated reflection questions tailored to your day
- **Morning & Evening Briefings** — AI-written narrative summaries of your tasks and journal
- **Pomodoro Timer** — 25/5-minute cycles linked to tasks with session logging
- **AI Agent** — streaming chat with tool use (reads your tasks, projects, journals) powered by local models
- **Cmd+K** — global command palette for instant navigation

---

## Prerequisites

Make sure you have these installed before you start:

| Tool | Version | Purpose |
|------|---------|---------|
| [Node.js](https://nodejs.org) | 18 or higher | Runs the Next.js app |
| [npm](https://npmjs.com) | included with Node | Package manager |
| [Ollama](https://ollama.com) | latest | Local LLM runtime |
| A [Supabase](https://supabase.com) account | free tier works | Database |

---

## Step 1 — Clone or Fork the Repo

**Option A — Clone directly:**
```bash
git clone https://github.com/Meet261/AI-Personal-Assistant.git
cd AI-Personal-Assistant
```

**Option B — Fork first (recommended if you want your own copy):**
1. Click **Fork** at the top-right of this page on GitHub
2. Then clone your fork:
```bash
git clone https://github.com/YOUR_USERNAME/AI-Personal-Assistant.git
cd AI-Personal-Assistant
```

---

## Step 2 — Install Dependencies

```bash
npm install
```

This installs Next.js 16, Supabase JS client, Tailwind CSS, date-fns, Lucide icons, and all other dependencies.

---

## Step 3 — Set Up Supabase

### 3a. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New project**, give it a name (e.g. `personal-assistant`), choose a region close to you, set a database password, and click **Create project**
3. Wait about a minute for the project to provision

### 3b. Run the database schema

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Copy the entire contents of [`lib/supabase-schema.sql`](lib/supabase-schema.sql) and paste it into the editor
4. Click **Run**
5. Open another **New query**, copy [`lib/schema-v2.sql`](lib/schema-v2.sql), paste and **Run**

This creates all tables: `tasks`, `projects`, `journal_entries`, `daily_briefings`, `task_comments`, `agent_sessions`, `agent_messages`, and `activity_log`.

### 3c. Disable Row Level Security (personal use)

The app uses the service-role key and does not use Supabase Auth, so RLS must be off. Run this in **SQL Editor**:

```sql
alter table projects disable row level security;
alter table tasks disable row level security;
alter table journal_entries disable row level security;
alter table daily_briefings disable row level security;
alter table task_comments disable row level security;
alter table agent_sessions disable row level security;
alter table agent_messages disable row level security;
alter table activity_log disable row level security;
```

### 3d. Get your Supabase keys

1. Go to **Project Settings → API** in your Supabase dashboard
2. Copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon / public** key
   - **service_role** key (click the eye icon to reveal it — keep this secret)

---

## Step 4 — Configure Environment Variables

In the project root, create a file called `.env.local`:

```bash
touch .env.local
```

Open `.env.local` and add your values:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here

# Ollama (no changes needed if running locally on default port)
NEXT_PUBLIC_OLLAMA_BASE=http://localhost:11434
```

> **Never commit `.env.local` to git.** It is already in `.gitignore`.

---

## Step 5 — Install and Start Ollama

### 5a. Install Ollama

Download from [ollama.com/download](https://ollama.com/download) for your OS (Mac, Linux, or Windows), install it, and open the app.

Verify it is running:
```bash
ollama --version
```

### 5b. Pull the required models

The app works with these models — pull at least the first one:

```bash
# Primary model used by the AI Agent and Check-in
ollama pull deepseek-r1:7b

# Alternative / lighter model
ollama pull llama3.2

# Optional — used for schedule generation
ollama pull mistral
```

Pulling takes a few minutes depending on your internet speed. Each model is roughly 4–8 GB.

### 5c. Confirm Ollama is serving

```bash
ollama serve
```

Or keep the Ollama desktop app open. The app expects Ollama at `http://localhost:11434`.

---

## Step 6 — Start the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

That's it — the app is running fully locally.

---

## Optional: Run with the Cron Job

The cron job auto-generates your morning and evening briefings so they're ready the moment you open the app. To run both the app and cron together:

```bash
npm run dev:all
```

Or run the cron separately:
```bash
npm run cron
```

---

## Project Structure

```
├── app/
│   ├── page.tsx              # Dashboard
│   ├── tasks/                # Tasks page
│   ├── projects/             # Projects list + [id] detail page
│   ├── journal/              # Journal page
│   ├── checkin/              # Daily check-in
│   ├── briefing/
│   │   ├── morning/          # Morning briefing
│   │   └── evening/          # Evening briefing
│   ├── timer/                # Pomodoro timer
│   ├── agent/                # AI Agent chat
│   └── api/                  # All API routes (tasks, projects, ai/*, etc.)
├── components/
│   ├── Sidebar.tsx           # Navigation sidebar with live clock
│   ├── CommandPalette.tsx    # Cmd+K global search
│   ├── TaskDrawer.tsx        # Slide-in task detail + comments panel
│   └── ConfirmDialog.tsx     # Reusable delete confirmation modal
├── lib/
│   ├── types.ts              # TypeScript interfaces
│   ├── supabase.ts           # Supabase browser client
│   ├── ollama.ts             # Ollama chat helper
│   ├── supabase-schema.sql   # Database schema (run this first)
│   └── schema-v2.sql         # Schema additions (run this second)
└── scripts/
    └── cron.mjs              # Briefing auto-generation cron job
```

---

## Available npm Scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start Next.js in development mode |
| `npm run dev:all` | Start Next.js + cron job together |
| `npm run build` | Build for production |
| `npm start` | Run the production build |
| `npm run cron` | Run only the briefing cron job |
| `npm run lint` | Run ESLint |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open command palette |

---

## Troubleshooting

**"Failed to fetch" or blank pages**
- Make sure `.env.local` exists and has the correct Supabase URL and keys
- Restart the dev server after editing `.env.local`: `Ctrl+C` then `npm run dev`

**AI features return errors or hang**
- Make sure Ollama is running: `ollama serve`
- Confirm the model is downloaded: `ollama list`
- The app expects Ollama at `http://localhost:11434`

**Supabase "permission denied" errors**
- Make sure you ran the `disable row level security` SQL block from Step 3c
- Make sure `SUPABASE_SERVICE_KEY` is the **service_role** key, not the anon key

**Port 3000 already in use**
```bash
npm run dev -- -p 3001
```

---

## Tech Stack

- **[Next.js 16](https://nextjs.org)** — React framework with App Router
- **[Supabase](https://supabase.com)** — Postgres database
- **[Ollama](https://ollama.com)** — Local LLM inference (deepseek-r1, llama3.2, mistral)
- **[Tailwind CSS v4](https://tailwindcss.com)** — Utility-first styling
- **[Lucide React](https://lucide.dev)** — Icon library
- **[date-fns](https://date-fns.org)** — Date utilities

---

## License

MIT — do whatever you want with it.
