# 🎯 NIKKE UniRaid Scheduling Tool

> 🇻🇳 **Bản tiếng Việt:** [`README.md`](../../README.md)

A tool for optimizing **Union Raid** attack assignments in the game **NIKKE: Goddess of Victory**. Uses **Integer Linear Programming (ILP)** to compute the optimal assignment schedule, helping your Union maximize total effective damage.

## ✨ Key Features

- **Mock Battle Collection** — Members submit their profiles (5-character team + damage) for each boss
- **Automatic Optimization (ILP Solver)** — GLPK WASM engine solves the optimal assignment problem in seconds
- **Level Gate** — Automatically enforces level progression constraints (must clear L1 → L2 → L3)
- **Overkill Prevention** — Minimizes wasted damage on already-defeated bosses
- **Result Sharing** — Export the assignment schedule as a public link to share on Discord
- **Easy Administration** — Admin configures bosses, manages members, and runs the optimizer via the web interface

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router, React 19) |
| **Database** | SQLite via Prisma v7 + `better-sqlite3` |
| **ILP Solver** | GLPK.js (WASM, server-side) |
| **Auth** | HMAC-SHA256 signed cookies (`httpOnly`, `secure`) |
| **Styling** | Vanilla CSS (dark theme, glassmorphism) |

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+
- **npm** (recommended — project uses `package-lock.json`)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/Ng0cTh4nhk5/nikke-uniraid-scheduling-tool.git
cd nikke-uniraid-scheduling-tool

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env
# Edit ADMIN_PASSWORD in .env

# 4. Initialize the database
npm run db:generate
npm run db:push
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — select your identity → start using.

## ⚙️ Environment Variables

| Name | Required | Description |
|------|----------|-------------|
| `DATABASE_URL` | ✅ | SQLite path. Dev: `file:./dev.db`, Prod: `file:/absolute/path/prod.db` |
| `ADMIN_PASSWORD` | ✅ | Admin password + secret used to generate HMAC-SHA256 signatures |
| `NODE_ENV` | ⬚ | Set to `production` to enable secure cookies |

## 📁 Project Structure

```
app/
├── (main)/               # Main UI (sidebar + auth gate)
│   ├── raids/            # Raid season management, boss config, profiles, assignments
│   ├── members/          # Member management (admin)
│   └── characters/       # NIKKE character list (admin)
├── api/                  # REST API routes
│   ├── auth/             # Admin login + member authentication
│   ├── raids/            # CRUD raids + boss slots
│   ├── profiles/         # Submit / edit / delete profiles
│   ├── optimize/         # Run ILP optimizer
│   └── assignments/      # Manage assignment results
├── share/                # Public share page (no login required)
└── globals.css           # Design system

engine/                   # Optimization engine (ILP)
├── index.ts              # Orchestrator (4-phase pipeline)
├── combo_builder.ts      # Generate valid combo sets (3 profiles, 15 distinct characters)
├── ilp_solver.ts         # GLPK WASM solver (retry + level gate constraints)
└── types.ts              # Engine types

prisma/
├── schema.prisma         # Database schema (6 models)
├── seed.ts               # Initial data seeding script
└── seed-data/            # Seed data (separated from logic)
    ├── nikke_characters.json   # 185+ NIKKE characters
    ├── members.ts         # 32 Union members
    ├── bosses.ts          # 5 boss configurations (HP × 3 levels)
    ├── profiles.ts        # Sample damage matrix (32 members × 5 bosses)
    └── raids.ts           # Initial raid configuration

lib/                      # Shared utilities
├── auth.ts               # HMAC cookie signing, admin/member guards
├── prisma.ts             # Prisma client singleton
├── serialize.ts          # BigInt → string serialization
├── constants.ts          # Game constants (elements, classes, etc.)
├── format.ts             # Damage formatting helpers
└── types.ts              # API response types
```

## 🧠 Optimization Algorithm

The engine operates as a **4-phase** pipeline:

1. **Phase 0 — Feasibility Analysis**: Estimates which level the Union can clear up to
2. **Phase 1 — Combo Builder**: Generates valid 3-profile combinations (15 non-duplicate characters) for each member
3. **Phase 2 — ILP Solver (GLPK WASM)**: Solves the optimization problem — maximizes total effective damage while satisfying level gate + overkill cap constraints
4. **Phase 3 — Post-processing**: Validates results, computes statistics, and generates warnings

> Full details: see [`docs/en/assignment-algorithm.md`](assignment-algorithm.md) and [`docs/en/ba/03_Solution_Design.md`](ba/03_Solution_Design.md)

## 🌐 VPS Deployment

The project supports a **pay-per-hour VPS** model — spin up quickly at the start of a Raid season, then back up the DB and terminate the VPS when the season ends.

> Full step-by-step guide: see [`docs/en/developer-guide/vps_deployment_guide.md`](developer-guide/vps_deployment_guide.md)

```bash
# Summary
npm install
npm run db:generate && npm run db:push && npm run db:seed
rm -rf .next && npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
pm2 start .next/standalone/server.js --name "nikke-raid"
```

## 📚 Documentation

| Document | Content |
|----------|---------|
| [`docs/en/ba/01_Business_Context.md`](ba/01_Business_Context.md) | Union Raid problem context |
| [`docs/en/ba/02_Problem_Formulation.md`](ba/02_Problem_Formulation.md) | ILP mathematical model |
| [`docs/en/ba/03_Solution_Design.md`](ba/03_Solution_Design.md) | 4-phase solution design |
| [`docs/en/ba/04_Database_Design.md`](ba/04_Database_Design.md) | Database design (6 models, ERD) |
| [`docs/en/assignment-algorithm.md`](assignment-algorithm.md) | Detailed assignment algorithm |
| [`docs/en/developer-guide/`](developer-guide/) | Dev guide, API reference, VPS deployment |

## 📄 License

Private project — Internal use only.
