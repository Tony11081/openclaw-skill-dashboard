# Cloud Skills API — Design Spec

## Purpose
A cloud-hosted skill repository that serves OpenClaw skill metadata and SKILL.md content via REST API. Other machines' agents (Codex, Claude Code, etc.) can query and read skills without downloading them locally.

## Architecture
- **API Server**: Node.js + Express, deployed on Dokploy (23.94.38.181)
- **Data Sync**: Local iMac pushes skill data to API server via Tailscale
- **Frontend**: Upgraded dashboard with mobile-first responsive design + skill content viewer
- **Auth**: API key based, simple bearer token for now (our own use)

## API Endpoints

### Public (with API key)
```
GET  /api/skills                    — List all skills (name, description, source, tags)
GET  /api/skills/:name              — Get skill detail (full SKILL.md content)
GET  /api/skills/:name/raw          — Get raw SKILL.md markdown
GET  /api/skills/search?q=keyword   — Search skills by name/description
GET  /api/stats                     — Skill counts by source/status
```

### Sync (internal, requires sync secret)
```
POST /api/sync                      — Push full skill data from local machine
POST /api/sync/incremental          — Push only changed skills
```

## Data Model
Each skill record:
```json
{
  "name": "weather",
  "description": "Get current weather...",
  "source": "bundled",
  "content": "# Weather Skill\n\n...(full SKILL.md)...",
  "homepage": "https://wttr.in",
  "path": "/original/local/path",
  "updatedAt": "2026-03-15T00:00:00Z",
  "tags": ["weather", "forecast", "cli"]
}
```

## Storage
- SQLite database (single file, zero config, perfect for this scale)
- ~500 skills × ~5KB avg content = ~2.5MB total, trivial

## Frontend Requirements
- Mobile-first responsive (works great on iPhone)
- Apple minimalist design (keep existing aesthetic)
- Skill cards with tap-to-expand full SKILL.md content
- Rendered markdown in detail view
- Search + filter (same as current but improved)
- Copy button to copy SKILL.md content (for pasting into agent context)
- API docs page showing endpoints and usage examples

## Sync Script (runs on iMac)
- Cron job or pm2 process
- Scans all skill directories, reads SKILL.md files
- Computes hash of each SKILL.md
- POSTs only changed skills to API server
- Runs every 5 minutes

## Security
- API key auth (X-API-Key header)
- Rate limiting (100 req/min per key)
- Tailscale for sync endpoint (only accessible from Tailscale network)
- CORS configured for dashboard domain

## Tech Stack
- Runtime: Node.js 22
- Framework: Express (minimal)
- Database: better-sqlite3
- Markdown rendering: marked (frontend)
- Deployment: Docker on Dokploy

## File Structure
```
skill-api/
├── Dockerfile
├── package.json
├── src/
│   ├── index.js          # Express server entry
│   ├── db.js             # SQLite setup + queries
│   ├── routes/
│   │   ├── skills.js     # Skill CRUD endpoints
│   │   ├── sync.js       # Sync endpoints
│   │   └── stats.js      # Stats endpoint
│   ├── middleware/
│   │   ├── auth.js       # API key validation
│   │   └── rateLimit.js  # Rate limiting
│   └── public/
│       └── index.html    # Dashboard SPA
├── sync/
│   └── push-skills.mjs   # Local sync script for iMac
└── data/
    └── skills.db          # SQLite database (created at runtime)
```
