# TransTrack

A production-grade fleet & school bus tracking platform: real-time GPS tracking, a web admin console, and driver/parent mobile apps — built for a single small transport operator (1–10 vehicles to start).

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system design, data model, and the honest list of what's built vs. what a real launch still needs.

## Repository layout

```
transtrack/
├── backend/          Node/TypeScript API + WebSocket hub + geofencing engine
├── web/               React admin console (live map, fleet, routes, students, trips)
├── mobile/            React Native app — driver + parent (role-based), Expo
├── gps-simulator/     Stands in for hardware GPS trackers until you procure them
└── docs/              Architecture document
```

## Quick start (local development)

### Prerequisites
- Node.js 20+
- PostgreSQL 15+ with the **PostGIS** extension available
- Redis 6+

### 1. Backend

```bash
cd backend
cp .env.example .env        # edit DATABASE_URL / REDIS_URL if needed
npm install
npm run db:migrate          # creates schema + PostGIS extensions
npm run db:seed             # creates demo org, users, vehicles, route, trip
npm run dev                 # starts API on :4000, WS on /ws
```

The seed script prints demo login credentials and a `route_id`/`trip_id` you'll use below.

### 2. Web admin console

```bash
cd web
cp .env.example .env        # point at your backend if not localhost:4000
npm install
npm run dev                 # http://localhost:5173
```

Log in with the admin credentials printed by the seed script.

### 3. GPS simulator (stands in for hardware)

```bash
cd gps-simulator
cp .env.example .env
# set DEVICE_INGEST_KEY to match backend's .env
# set ROUTE_ID to the route id printed by db:seed, and ADMIN_BEARER_TOKEN
# to an access token from POST /auth/login (admin), if you want it to
# follow your real seeded route — otherwise it uses a hardcoded fallback path
npm install
npm run dev
```

Open the web console's Live Map — you should see a bus icon moving along the route in real time, with a pulsing ring confirming live signal.

### 4. Mobile app (driver + parent)

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (iOS/Android) or run on a simulator. Log in as a driver or parent using the seeded demo accounts.

## What's real vs. simulated right now

Everything in this repo runs end-to-end today: auth, fleet/route/student management, trip lifecycle, live GPS ingestion, geofencing-driven events, and live map/notifications across all three apps. The one thing standing in for reality is the **GPS source** — until hardware trackers are procured, the simulator (or the driver app's own phone GPS) feeds the exact same ingestion endpoint real hardware will use, so nothing downstream needs to change when that swap happens.

Full detail on this boundary, plus what's still needed before a real-world launch (push credentials, app store submission, hosting, compliance review), is in [`docs/ARCHITECTURE.md` §6](docs/ARCHITECTURE.md#6-what-production-ready-means-here-vs-what-is-simulated-today).
