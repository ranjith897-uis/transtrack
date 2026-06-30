# TransTrack — Fleet & School Bus Tracking Platform
### System Architecture Document v1.0

---

## 1. What this system is

A production-grade fleet tracking platform for a small transportation operator (1–10 vehicles to start, designed to scale past that without rework). Three faces, one backend:

| Surface | Who uses it | Form factor |
|---|---|---|
| **Admin Console** | You / dispatchers | Web app (responsive, desktop-first) |
| **Driver App** | Bus/vehicle drivers | Native mobile (iOS + Android, React Native) |
| **Parent App** | Parents/guardians | Native mobile (iOS + Android, React Native) |

All three talk to a single backend API and a single real-time location service. There is one source of truth for vehicle position, trip state, and roster data.

---

## 2. Core entities (data model)

```
Organization (single-tenant: there is exactly one row, but modeling it
              this way means multi-tenant SaaS later is a migration,
              not a rewrite)
  └── Users (role: ADMIN | DISPATCHER | DRIVER | PARENT)
  └── Vehicles (bus/van — plate, capacity, GPS device ID)
  └── Drivers (linked to a User, linked to a Vehicle assignment)
  └── Routes (named, ordered list of Stops)
       └── Stops (lat/lng, name, sequence, scheduled time)
  └── Students (linked to Parent User(s), linked to a Route + Stop)
  └── Trips (a single run of a Route on a specific date/time —
             AM pickup, PM drop-off, field trip, etc.)
       └── TripEvents (stop arrival, student boarded/dropped,
                        trip started/ended, SOS, geofence breach)
  └── LocationPings (raw GPS stream: lat, lng, speed, heading,
                      timestamp, vehicle_id, accuracy)
  └── Notifications (push/SMS log: "bus 5 min away", "arrived at school")
  └── Devices (hardware GPS tracker registry — IMEI, protocol, vehicle_id)
```

**Why this shape:**
- `LocationPings` is an append-only time-series table — it will be the highest-volume table by far, so it's modeled separately from everything else and is the one table designed with partitioning/TTL in mind from day one.
- `Trips` (not `Routes`) is what drivers/parents actually track in real time. A `Route` is a template; a `Trip` is "Route 3, today, 7:15 AM, this specific run." This separation is what lets you show "Bus 5 is 8 minutes from your stop" instead of just "Bus 5 exists."
- `TripEvents` is an audit trail — useful for parent trust ("when exactly did the bus leave school"), dispute resolution, and is also what drives push notifications.

---

## 3. High-level architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Admin Console│     │  Driver App  │     │  Parent App  │
│   (React)    │     │ (React Native)│    │ (React Native)│
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │  HTTPS REST + WSS  │                     │
       └──────────┬──────────┴─────────┬──────────┘
                   │                    │
            ┌──────▼────────────────────▼──────┐
            │         API Gateway / Backend      │
            │   Node.js + TypeScript (Express)   │
            │  ┌───────────┐  ┌───────────────┐  │
            │  │ REST API  │  │ WebSocket Hub │  │
            │  │(CRUD, auth)│ │(live location, │  │
            │  │           │  │ trip events)   │  │
            │  └───────────┘  └───────────────┘  │
            └──────┬─────────────────┬───────────┘
                   │                 │
        ┌──────────▼──────┐   ┌──────▼───────────┐
        │   PostgreSQL     │   │  Redis           │
        │ (+ PostGIS for   │   │ (pub/sub for live │
        │  geofencing)     │   │  location fanout, │
        │                  │   │  session cache)    │
        └──────────────────┘   └────────────────────┘
                   ▲
                   │ ingest (HTTP/TCP/MQTT depending on device)
        ┌──────────┴──────────────┐
        │  GPS Ingestion Service   │
        │  (normalizes protocols   │
        │   from whatever hardware │
        │   trackers you procure)  │
        └──────────┬───────────────┘
                   │
         ┌─────────▼─────────┐       ┌─────────────────────┐
         │ Hardware GPS units  │  OR  │ Driver phone GPS     │
         │ (procured later)    │      │ (fallback/day-1 path)│
         └────────────────────┘       └──────────────────────┘
```

### Why these choices, specifically for your scale (1–10 vehicles)

- **PostgreSQL + PostGIS**, not a specialized time-series DB (e.g. TimescaleDB/InfluxDB) — *yet*. At 10 vehicles pinging every 5–10 seconds, you're generating ~100K–200K rows/day. Postgres handles that trivially for years. PostGIS gives you geofencing (arrival detection, "near stop" triggers) without extra infrastructure. The schema is written so migrating the `location_pings` table to Timescale later is additive, not a rewrite.
- **Redis pub/sub**, not Kafka/RabbitMQ. At this scale a message queue is overhead with no payoff. Redis pub/sub is enough to fan out "vehicle X moved" to every connected WebSocket client watching that vehicle. If you ever resell this as multi-tenant SaaS at hundreds of vehicles, that's the point to introduce a real queue — not before.
- **One Node/TypeScript backend**, not microservices. Three faces, one team (you), low scale. Microservices would add deployment and debugging overhead with no real benefit yet. The codebase is structured in clear modules (auth, fleet, trips, tracking, notifications) so it *could* split later, but there's no reason to pay that tax today.
- **WebSockets for live tracking, REST for everything else.** Live position needs push, not poll. Polling every 5s from 3 apps × N users is wasteful and laggy; a WebSocket per active "watch this vehicle" session is the standard, correct approach here (this is exactly how Neo Track / Zonar / Bus Pirate–type systems do it).
- **GPS ingestion is a separate, swappable module.** This is the most important decision given you haven't procured hardware yet: the ingestion service exposes a normalized internal interface (`reportLocation(deviceId, lat, lng, speed, heading, timestamp)`). Whatever hardware you buy — most commodity school-bus trackers (Concox/Coban-type GT06 protocol devices, Teltonika, or anything that supports MQTT/HTTP webhook reporting) — gets adapted to that one interface. Until then, the **GPS Simulator** (built below) drives the exact same interface, so the entire rest of the system is fully testable today and requires zero code changes when real hardware arrives — only a new adapter.

---

## 4. Real-time tracking flow (the heart of the system)

1. GPS device (or simulator, or driver phone) sends a position update.
2. **Ingestion Service** normalizes it → writes to `location_pings` → publishes to Redis channel `vehicle:{id}:location`.
3. **Geofence Engine** (runs inside the backend, subscribes to the same stream) checks: did this vehicle just enter/exit a stop radius? → if yes, writes a `TripEvent` and triggers **Notification Service**.
4. **WebSocket Hub** is also subscribed to Redis → pushes the new position to every connected client currently watching that vehicle (parent watching their kid's bus, admin watching the fleet map, driver app confirming its own trip).
5. **Notification Service** sends push notifications (e.g., "Bus is 5 minutes from your stop", "Student boarded", "Bus arrived at school") via Firebase Cloud Messaging (covers both iOS and Android from one service).

This is precisely the pattern Neo Track and comparable commercial school-bus trackers use: hardware → ingestion → live geofencing → push to parent app, plus a fleet-wide live map for the operator.

---

## 5. Security & safety-critical considerations

Because this involves children's location data and live whereabouts of minors, this is treated as sensitive PII throughout:

- **Role-based access control (RBAC)** enforced at the API layer: a parent can only ever query trips/locations for *their own* linked student's vehicle — never the whole fleet. Admins see everything; drivers see only their assigned vehicle/trip.
- **JWT-based auth** with short-lived access tokens + refresh tokens; passwords hashed with bcrypt.
- **No student PII in push notification payloads** beyond what's necessary (no full address, etc.) — notifications reference trip/stop, not home location.
- **Audit trail** (`TripEvents`) is immutable/append-only — useful both for parent trust and for any incident review.
- **Driver SOS / panic button** is a first-class event type, not an afterthought — it bypasses normal notification batching and immediately alerts admin.
- All of this is designed to make it straightforward to comply with whatever local regulations apply to student transportation data (this varies by country/state — when you're ready to launch for real, this is the one area worth a compliance/legal pass before going live with actual children's data, separate from anything I can verify here).

---

## 6. What "production-ready" means here vs. what's simulated today

To be transparent about the gap between this build and a real launch:

**Built and working in this session:**
- Full backend (auth, fleet/route/trip CRUD, real-time location ingestion + broadcast, geofencing, notifications log)
- Web admin console (live fleet map, routes, students, drivers, trip history)
- Driver app (start/end trip, live location push, stop check-in, SOS)
- Parent app (live map of child's bus, ETA, notifications)
- GPS simulator that drives vehicles along real routes, standing in for hardware

**Still needed before a real-world launch (cannot be fully completed in this session — flagged honestly rather than glossed over):**
- Actual GPS hardware procurement + writing the specific protocol adapter for whatever device you buy (I've designed the seam for this — it's a contained, ~1-day task per device type once you have one in hand)
- Production hosting setup (the code is cloud-ready; deploying it to e.g. Render/Railway/AWS, configuring a managed Postgres, domain, SSL is an infra task, not a code one)
- Push notification credentials (Firebase project + Apple Push certificates — these require your Apple Developer / Google Play accounts)
- App Store / Play Store submission (requires your developer accounts, store listings, screenshots, review)
- Load testing at your real vehicle count
- A legal/compliance review for handling minors' location data in your jurisdiction
- SMS gateway integration if you want SMS in addition to push (e.g. Twilio) — straightforward to add, just needs an account + API key

---

## 7. Tech stack summary

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + TypeScript + Express | Single language across backend/web/mobile, huge ecosystem, fast to build and hire for |
| Database | PostgreSQL + PostGIS | Relational integrity for fleet/people data + native geo queries for geofencing |
| Real-time | WebSocket (ws) + Redis pub/sub | Push-based live tracking, minimal infra |
| Web Admin | React + Vite + TypeScript + Tailwind | Fast dev, modern DX, easy to theme |
| Mobile | React Native (Expo) | One codebase → iOS + Android, native feel, fastest path to app-store-ready |
| Maps | Leaflet/MapLibre (web), `react-native-maps` (mobile) | Open-source friendly, swappable for Google Maps if preferred later |
| Auth | JWT (access + refresh) | Stateless, works identically across web + mobile |
| Push notifications | Firebase Cloud Messaging | One service, both platforms |

---

## 8. Repository layout

```
transtrack/
├── backend/          # Node/TS API + WebSocket + geofencing + simulator-fed ingestion
├── web/              # React admin console
├── mobile/           # React Native app (driver + parent, role-based)
├── gps-simulator/    # Standalone script simulating hardware trackers
└── docs/             # This document + API reference
```
