# First Run Checklist

This wasn't executed in the build environment (no network access there), so before relying on it, walk through this once on your machine. Each step should take a minute or two.

1. **Postgres + PostGIS**: `createdb transtrack`, then confirm `CREATE EXTENSION postgis;` succeeds in `psql transtrack`. If it fails, install the `postgresql-*-postgis-3` package for your Postgres version first.
2. **Redis**: `redis-cli ping` → should return `PONG`.
3. **Backend**: `cd backend && npm install && npm run db:migrate && npm run db:seed && npm run dev`. Watch for `[server] TransTrack backend listening on :4000`. Hit `curl http://localhost:4000/health` → `{"ok":true,...}`.
4. **Web**: `cd web && npm install && npm run dev`. Open `http://localhost:5173`, log in with the seeded admin credentials (printed by `db:seed`). You should land on the Live Map with an empty "0 vehicles live" badge — that's expected until the simulator runs.
5. **Simulator**: `cd gps-simulator && npm install`. Get an admin access token (`curl -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" -d '{"email":"admin@demo.transtrack","password":"Admin@12345"}'` → copy `accessToken`), put it plus the seeded `ROUTE_ID` into `.env`, then `npm run dev`. Within a few seconds the web Live Map should show a moving bus marker with a pulsing ring.
6. **Mobile**: `cd mobile && npm install && npx expo start`. Open in Expo Go. Log in as the seeded driver (`ramesh.driver@demo.transtrack` / `Driver@12345`), open the scheduled trip, tap "Start trip" — grant location permission when prompted. Then log in as the seeded parent on a second device/simulator (`anita.parent@demo.transtrack` / `Parent@12345`) and confirm the live bus tracking screen shows movement.

If any step fails, the error message plus which step it failed on is the fastest way to get unstuck — most likely culprits are a missing PostGIS extension, a `.env` not copied from `.env.example`, or a stale access token in the simulator's config.
