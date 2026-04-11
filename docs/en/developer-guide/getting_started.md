# Getting Started

This guide covers how to set up and run the NIKKE UniRaid Calculator source code in a local (development) environment or as a basic self-hosted deployment.

## Prerequisites

- **Node.js**: Version 20.x or higher.
- **Package Manager**: `npm` (recommended — the project uses `package-lock.json`).
- An OS capable of compiling `better-sqlite3` (typically automatic via `node-gyp` if Python and C++ build tools are installed for Node.js).
- **Web Browser**: The system requires support for modern WebAssembly technologies.

## Installation Steps

### Step 1: Clone and Install

Open a terminal and run the following commands:

```bash
git clone <repository_url>
cd nikke-uniraid-calculator
npm install
```

### Step 2: Configure Environment Variables (.env)

The Next.js system requires environment variables to run core functionality. Copy from the project root:

```bash
cp .env.example .env
```

Open `.env` and set the required values:

```env
# Admin password for logging in — ALSO the Root Secret used to generate HMAC-SHA256 signature protection
ADMIN_PASSWORD=change_this_to_a_long_secure_string

# Database configuration (for SQLite)
DATABASE_URL="file:./dev.db"
```

> [!CAUTION]
> The `ADMIN_PASSWORD` variable is critical. Changing its value will invalidate all current sessions — all members and admins will need to log in again. Set a strong string and keep it safe.

### Step 3: Migrate the Database

With the high-performance `@prisma/adapter-better-sqlite3` adapter in place, push the schema to the DB with:

```bash
# Push the schema to the database to automatically create tables for the dev environment.
npm run db:push

# Generate Prisma Client typings
npm run db:generate

# Run the seed command to pre-populate all available NIKKE characters (Character Enums)
npm run db:seed
```

### Step 4: Run the Development Server

```bash
npm run dev
```

Then open a browser and navigate to http://localhost:3000. The system will prompt you to select an Identity. Choose a member from the list to start using the app, or log in as Admin with the password configured in `.env` to access administrative features.

## Database Admin (Prisma Studio)

> [!TIP]
> You can view and edit data directly using Prisma's GUI. This is useful when you need to delete junk data or debug without going through the App UI.

```bash
npm run db:studio
```
