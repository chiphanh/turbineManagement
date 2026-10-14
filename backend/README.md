# Turbine Projects API

A small NestJS + PostgreSQL backend for local development against Neon. Requires Node.js 22+.

## Setup

1. Open a terminal in this folder and run `npm ci`.
2. Copy `.env.example` to `.env` (`cp .env.example .env` on macOS/Linux).
3. Replace DATABASE_URL with your full pooled Neon connection string, keeping its SSL parameters.
4. Ensure your Neon projects table uses `rated_power_kw`.
   - New database: run schema.sql in Neon's SQL Editor once.
   - Existing solar table: run `ALTER TABLE projects RENAME COLUMN system_size_kwp TO rated_power_kw;` only if that column still exists. Then run `ALTER TABLE projects ALTER COLUMN rated_power_kw TYPE NUMERIC(10,2);` to support the API's capacity range.
   - Do not recreate a table that already exists. Your previous timestamp trigger can stay.
5. Run `npm run build`, then `npm start`.
6. Visit http://localhost:3001/api/health and http://localhost:3001/api/projects.

Use `npm run dev` to rebuild and restart automatically during development. It deliberately runs the TypeScript compiler so NestJS decorator metadata is preserved.

## Routes

- GET /api/health: process health only; does not query PostgreSQL
- GET /api/projects: newest 100 projects
- GET /api/projects/:id: one project by UUID
- POST /api/projects: create
- PATCH /api/projects/:id: update selected fields

Example creation (macOS/Linux terminal):

```bash
curl -i http://localhost:3001/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"customerName":"Anna Weber","address":"Sample Street 12, Aachen","ratedPowerKw":15.5}'
```

Copy the returned id to update a project:

```bash
curl -i -X PATCH http://localhost:3001/api/projects/REPLACE_WITH_UUID \
  -H 'Content-Type: application/json' \
  -d '{"stage":"planning"}'
```

JSON uses camelCase; database columns use snake_case. Stage values are inspection, planning, installation, completed. Capacity must be a positive JSON number with at most two decimal places. All valid stage changes are allowed in this version; workflow approval rules come later.

Validation failures return 400; missing projects return 404. Unexpected database failures return 500. Inspect backend logs locally to diagnose database errors. No secrets belong in Git or frontend code.

## Checks and limitations

`npm test` checks input validation and parameterized update behavior using a stub database; `npm run build` checks TypeScript. Live Neon connectivity must be checked with your own credentials. No authentication, bookings, teams, pagination beyond the 100-record limit, or AI is included yet. Use fictional records for this development/demo API; configure authentication before using it with real customer information.

## Version 2: notes, filtering, teams and scheduling

### Upgrade your existing local app

1. Stop the old backend with Ctrl+C. Extract this archive into a new folder; copy your old `.env` into it (keep your original folder as a backup).
2. Run `migrations/002_features.sql` ONCE in Neon's SQL Editor against your existing database. Do not run schema.sql again. The migration preserves projects and adds notes, teams, assignment and bookings. It requires PostgreSQL's btree_gist extension. If you see an error, fix it before starting the new API; do not remove the overlap constraint.
3. Run `npm ci`, `npm test`, then `npm run dev`.

For a completely new database, run schema.sql first, then migrations/002_features.sql.

### New routes

| Method | Route | Input |
|---|---|---|
| GET | /api/projects?search=Anna&stage=planning&page=1&pageSize=20 | All filters optional; search matches customer/address as literal substrings |
| POST/PATCH | Existing project routes | Additional `notes` string, up to 10,000 characters; empty string clears it |
| GET | /api/teams | List teams |
| POST | /api/teams | `{"name":"Team West"}` |
| PATCH | /api/teams/:id | `{"name":"Team Berlin","active":true}` |
| PATCH | /api/projects/:id/team | `{"teamId":"TEAM_UUID"}` or `{"teamId":null}` to unassign |
| GET | /api/bookings | List bookings |
| POST | /api/bookings | projectId, teamId, startsAt, endsAt |
| POST | /api/bookings/:id/cancel | Cancel a booking (repeat cancellation is safe) |

GET /api/projects now returns `{ "data": [], "total": 0, "page": 1, "pageSize": 20 }`, replacing the previous array response. Read `.data` in the frontend.

Example booking JSON:

```json
{"projectId":"PROJECT_UUID","teamId":"TEAM_UUID","startsAt":"2026-10-12T09:00:00+02:00","endsAt":"2026-10-12T12:00:00+02:00"}
```

Create a team, assign it to a project, then book. Timestamps must include Z or an explicit UTC offset; PostgreSQL stores instants. Display in Europe/Berlin on the frontend. End must be after start. Adjacent bookings are allowed. Overlapping bookings for the same team and multiple scheduled bookings for the same project return 409. Cancel before changing assignment or deactivating a booked team. To reschedule, cancel and create a new booking; atomic rescheduling is not implemented. Scheduled bookings stay reserved until cancelled, even after their end time; completed-booking lifecycle comes later.

No inspection prerequisite checks, automatic stage changes, AI, or authentication yet. Tests cover validation, pagination inputs, intervals, and parameterization. Actual overlap/concurrent-request enforcement relies on the SQL constraints and must be verified against PostgreSQL after the migration.

### Manual verification against Neon

- PATCH a project's notes, then GET it and confirm notes persist.
- Create two projects assigned to the same team. Book 09:00–12:00 for the first; 11:00–13:00 for the second should return 409.
- Book 12:00–14:00 for the second instead: should succeed.
- Cancel the first booking: its time becomes available.
- Submit two concurrent overlapping requests for different assigned projects: only one should succeed.
