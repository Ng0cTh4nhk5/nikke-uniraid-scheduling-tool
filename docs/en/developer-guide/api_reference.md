# API Reference

The application uses Next.js App Router Route Handlers. All API endpoints reside under the `/app/api/...` directory.

> [!NOTE]
> Responses from the server always use JSON format (`application/json`). Error handling typically uses status codes 400 (Bad Request), 403 (Forbidden), 404 (Not Found), 500 (Internal Server Error).

## API Endpoints by Feature

### 1. Authentication Management (`/api/auth/...`)
The system uses server-side HTTP-Only Cookies signed with HMAC-SHA256.

- `POST /api/auth/identify`: Request body `{ "memberId": number }`. Creates a `nikke_member_id` cookie signed with HMAC to authenticate the member's identity.
- `DELETE /api/auth/identify`: Revokes the cookie, logging out the current member.
- `GET /api/auth/identify`: Returns the Member Object and an `isAdmin` (Boolean) field based on the current token. Used to determine whether to show administrative features in the UI.
- `POST /api/auth/admin`: Admin login. Request body `{ "password": "..." }`. Issues a `nikke_admin_token` cookie (HTTP-Only) signed with `ADMIN_PASSWORD` from `.env`.

### 2. Raid Season Management (`/api/raids/...`)

- `GET /api/raids`: Retrieves a summary list.
- `POST /api/raids`: Creates a new Raid structure. Requires a payload containing definitions for 5 BossSlots and flexible HP parameters for 15 checkpoints (`hpLevel1`..`3` for each boss).
- `GET /api/raids/:id`: Reads raid data with related associations (BossSlots for the season, etc.). Recommended to use Server Components for this read operation to reduce network overhead.

### 3. Member Management (`/api/members/...`)
Mutation operations require Admin authorization (`nikke_admin_token`).

- `GET /api/members`: Fetch API for SelectBox and member management UI.
- `POST /api/members`: Provide `name`, `role` to create a new player entity.
- `PUT/DELETE` routes in this directory handle toggling `isActive` status or updating Synchro Device level.

### 4. Mock Battle Profile Submission (`/api/profiles/...`)
Access is authorized by either token type: Admin token (manual intervention) or Member token.

- `GET /api/profiles`: (Supports flexible URL params for filtering by `raidId`).
- `POST /api/profiles`: Submit a team of 5 NIKKEs. Request body:
  ```json
  {
     "memberId": 12,
     "bossSlotId": 2,
     "charIds": [1, 23, 7, 5, 2],
     "damage": "400000000" 
  }
  ```
  *(Note: Damage is a String because the database stores it as BigInt.)*
- `PUT /api/profiles`: Update when a member retries and achieves higher damage. Must satisfy the submitter's authorization.
- `DELETE /api/profiles`: Cancel/delete the result.

### 5. Optimization Engine (`/api/optimize/...`)
Triggers the ILP Solver (GLPK WASM) to compute the optimal assignment schedule.

- `POST /api/optimize`: Body `{ "raidId": number }`.  
  Fetches data from the database, converts it to a combo matrix (Combo Builder) → invokes the ILP Solver → retries up to 3 times with escalating timeouts. Returns a new `Assignment` with its `AssignmentEntry` records.

- `PUT /api/assignments/:id`: Manually edit an entry (sets `isManual = true`). Allows the Admin to adjust `level1..3`, `execOrder` after the optimizer has run.
