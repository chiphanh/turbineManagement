A turbine installation tracker with project management, team assignment, and scheduling that prevents overlapping bookings.

**Stack:** Next.js, TypeScript, NestJS, PostgreSQL (Neon).

## Run locally

1. Create the database using the initial schema, then run `002_features.sql`.
2. Configure the backend `.env` with your Neon connection string.
3. Run `npm ci` and `npm run dev` in both `backend/` and `frontend/`.

Open http://localhost:3000. The API runs on port 3001.
