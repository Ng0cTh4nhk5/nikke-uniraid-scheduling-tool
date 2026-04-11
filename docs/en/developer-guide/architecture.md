# System Architecture

The NIKKE UniRaid Calculator project adopts a Fullstack architecture built on **Next.js 16** with the **App Router**. Below is an overview of the system architecture.

## 1. Tech Stack

- **Core Framework**: Next.js 16.2.2 (with React 19.2.4).
- **Language**: TypeScript 5.
- **Routing**: Next.js App Router (using the `app/` directory).
- **Database ORM**: Prisma v7.6.0 combined with the `@prisma/adapter-better-sqlite3` adapter.
- **Database Engine**: Better-SQLite3 (local database, high-performance — suitable for standalone deployment).
- **Styling**: Vanilla CSS via `globals.css`.
- **Optimization Engine**: The `glpk.js` library (GLPK WASM) for solving Integer Linear Programming (ILP) problems.

## 2. Directory Structure

```text
nikke-uniraid-calculator/
├── app/
│   ├── (main)/       # Client UI including navigation pages (Raids, Members, Characters)
│   ├── api/          # RESTful Route Handlers forming the Backend Controllers
│   ├── globals.css   # Utility classes and design system tokens
│   └── layout.tsx    # Outer wrapper layout for the Client-Side Root
├── components/       # Shared React Components (UI components, Modals)
├── contexts/         # React Contexts managing internal state
├── docs/
│   └── developer-guide/  # Directory containing system documentation
├── engine/           # Optimization Engine (ILP WASM solver — GLPK.js)
├── lib/              # Shared utilities such as auth.ts, constants.ts, prisma.ts
└── prisma/           # Database Schema definition, config, and TypeScript Seed scripts
```

## 3. General Flow

The system revolves around managing Raid season information (Bosses) and recording Mock Battle results (Profiles).

1. The user accesses the platform through the Frontend and selects their Identity.
2. Form submissions send payloads as POST requests to `app/api/profiles/route.ts`.
3. The Backend Server receives the request, validates the Token/Cookie, then calls the `Prisma Client` to interact with the database.
4. **Attack Schedule Optimization (Optimize) Workflow**:
   - The Admin triggers the Optimizer from the Raid Management UI area (`/api/optimize`).
   - The server extracts all `Profiles` for the current season and passes them as a data matrix to the Engine (`engine/combo_builder.ts`).
   - **GLPK** WASM computes the highest-damage team combinations, adhering to the NIKKE game's character uniqueness rules.
   - Returns to the Frontend as a JSON Assignment; the client re-renders the DOM to update the attack schedule, and the user saves it (Publish).

## 4. Middleware & Access Control

Access is controlled at two layers: edge middleware (`middleware.ts`) and route handlers (`lib/auth.ts`).

- **Cookie Signing**: Uses HMAC-SHA256 (Node.js `crypto` module) to sign and validate cookies.
- **Identity Access Control**: The `nikke_member_id` cookie is signed as `[ID].[Signature]`. The server uses `ADMIN_PASSWORD` from `.env` as the secret key to verify the signature.
- **Admin Access Control**: Administrative operations (deleting Raids, managing members, etc.) require a verified `nikke_admin_token` (HTTP-Only) cookie. Middleware blocks unauthorized access to sensitive routes.

> [!CAUTION]
> The HMAC signature depends on the value of `ADMIN_PASSWORD`. If this value is changed in `.env`, **all current member and admin sessions will be invalidated** because the signatures will no longer match.

## 5. UI and Data Fetching

The project follows the React Server Components (RSC) model philosophy:
- Data is fetched directly using Prisma logic within directory pages (e.g., `page.tsx`). Thanks to SQLite's exceptional speed, this approach eliminates loading waterfalls.
- Complex Form Actions or Mutations (or operations requiring the Context API) trigger fetch requests via `next/navigation` or `SWR` calling back to `app/api/...`.
- The backend Route Handler directory structure is organized into very specific modules (`/api/raids`, `/api/members`, `/api/profiles`, `/api/optimize`, `/api/auth/identify`).
