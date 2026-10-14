# TurbineOps frontend

Next.js + TypeScript dashboard for turbine-backend-v2. Requires Node.js 22+ and the v2 backend/database migration.

## Run on your Mac

1. Keep your backend running on port 3001.
2. Open another Terminal in this folder.
3. Run `npm ci`.
4. Run `cp .env.example .env.local`.
5. Run `npm run dev`.
6. Open http://localhost:3000.

The public API address is NEXT_PUBLIC_API_URL=http://localhost:3001/api. This is an address, not a database credential. Never put DATABASE_URL in this frontend. Restart development after changing .env.local.

The backend must have FRONTEND_ORIGIN=http://localhost:3000; restart it after changing that setting. Do not substitute 127.0.0.1 for localhost unless you also change the allowed origin.

## Features

Projects: creation, detail editing, notes, stages, assigned team, literal customer/address search, stage filters, ten-row pagination.
Teams: creation, renaming, activation/deactivation.
Schedule: project loading, installation booking, cancellation. Assign a team before booking. The backend handles booking conflicts.

Booking inputs use your browser's local timezone (shown in the form), converted to UTC. Bookings display in Europe/Berlin. If your browser timezone is Berlin, you enter Berlin local time. The backend may reject changes to assignments or team activity while bookings are scheduled.

No sample records are faked: cards and lists load from your API. Project count reflects current filters. Bookings retain scheduled status until cancelled; this count includes past bookings with that status.

## Verify

Run `npm run typecheck` and `npm run build`. With the real backend, test creating a project, refreshing to confirm persistence, editing notes, applying filters, creating/assigning a team, making a booking and attempting an overlap. Empty, loading and API error states are included.

## Hosting later

Import this folder into Vercel as a Next.js project. Set NEXT_PUBLIC_API_URL to the HTTPS deployed backend URL ending in /api. Set backend FRONTEND_ORIGIN to the frontend's production origin. Rebuild the frontend after changing its public environment variable. A deployed frontend cannot use your Mac's localhost backend. This is a development portfolio demo without authentication.
