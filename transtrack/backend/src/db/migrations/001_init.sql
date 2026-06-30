-- TransTrack core schema
-- Single-tenant today, but `organizations` is modeled so multi-tenant
-- is a migration (add org_id everywhere it's missing) rather than a rewrite.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────
-- Organization & Users
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE user_role AS ENUM ('ADMIN', 'DISPATCHER', 'DRIVER', 'PARENT');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  push_token TEXT,                  -- FCM device token, nullable until app registers
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_role ON users(role);

-- ─────────────────────────────────────────────────────────────────
-- Vehicles & GPS Devices
-- ─────────────────────────────────────────────────────────────────

CREATE TYPE vehicle_status AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,              -- e.g. "Bus 5"
  plate_number TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 0,
  status vehicle_status NOT NULL DEFAULT 'ACTIVE',
  current_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_org ON vehicles(organization_id);

-- A device is the physical GPS hardware tracker. Kept separate from
-- vehicles so swapping hardware on a vehicle doesn't touch history.
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  external_id TEXT UNIQUE NOT NULL,  -- IMEI or simulator-assigned ID
  protocol TEXT NOT NULL DEFAULT 'SIMULATOR', -- e.g. GT06, JT808, SIMULATOR
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_vehicle ON devices(vehicle_id);

-- ─────────────────────────────────────────────────────────────────
-- Routes & Stops
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,               -- e.g. "Route 3 - Morning"
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_routes_org ON routes(organization_id);

CREATE TABLE stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence INT NOT NULL,            -- order along the route
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  geofence_radius_m INT NOT NULL DEFAULT 150, -- "arrived" trigger radius
  scheduled_time TIME,              -- expected arrival time at this stop
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stops_route ON stops(route_id);
CREATE INDEX idx_stops_location ON stops USING GIST(location);

-- ─────────────────────────────────────────────────────────────────
-- Students (linked to parents and a route/stop)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  grade TEXT,
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
  stop_id UUID REFERENCES stops(id) ON DELETE SET NULL,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_students_org ON students(organization_id);
CREATE INDEX idx_students_route ON students(route_id);

-- Many-to-many: a student can have multiple parents/guardians,
-- a parent can have multiple students.
CREATE TABLE student_parents (
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, parent_user_id)
);

-- ─────────────────────────────────────────────────────────────────
-- Trips (a single run of a Route, on a specific date)
-- ─────────────────────────────────────────────────────────────────

CREATE TYPE trip_status AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE trip_type AS ENUM ('PICKUP', 'DROPOFF', 'FIELD_TRIP', 'OTHER');

CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_type trip_type NOT NULL DEFAULT 'PICKUP',
  status trip_status NOT NULL DEFAULT 'SCHEDULED',
  scheduled_start TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trips_org ON trips(organization_id);
CREATE INDEX idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_scheduled ON trips(scheduled_start);

-- Audit trail / event log for a trip. Drives notifications + history.
CREATE TYPE trip_event_type AS ENUM (
  'TRIP_STARTED', 'TRIP_ENDED', 'STOP_ARRIVED', 'STOP_DEPARTED',
  'STUDENT_BOARDED', 'STUDENT_DROPPED', 'SOS', 'DELAY_REPORTED'
);

CREATE TABLE trip_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  event_type trip_event_type NOT NULL,
  stop_id UUID REFERENCES stops(id) ON DELETE SET NULL,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_events_trip ON trip_events(trip_id);
CREATE INDEX idx_trip_events_type ON trip_events(event_type);

-- ─────────────────────────────────────────────────────────────────
-- Location Pings — highest-volume table, append-only time series.
-- Modeled separately so it can later be moved to TimescaleDB /
-- partitioned by month without touching any other table.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE location_pings (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  speed_kmh REAL,
  heading REAL,
  accuracy_m REAL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pings_vehicle_time ON location_pings(vehicle_id, recorded_at DESC);
CREATE INDEX idx_pings_trip ON location_pings(trip_id);
CREATE INDEX idx_pings_location ON location_pings USING GIST(location);

-- ─────────────────────────────────────────────────────────────────
-- Notifications log
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, sent_at DESC);
