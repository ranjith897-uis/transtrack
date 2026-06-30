export type UserRole = 'ADMIN' | 'DISPATCHER' | 'DRIVER' | 'PARENT';

export interface User {
  id: string;
  organization_id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  push_token: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuthTokenPayload {
  userId: string;
  organizationId: string;
  role: UserRole;
}

export interface Vehicle {
  id: string;
  organization_id: string;
  label: string;
  plate_number: string;
  capacity: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  current_driver_id: string | null;
}

export interface Stop {
  id: string;
  route_id: string;
  name: string;
  sequence: number;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  scheduled_time: string | null;
}

export interface Route {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  stops?: Stop[];
}

export interface Student {
  id: string;
  organization_id: string;
  full_name: string;
  grade: string | null;
  route_id: string | null;
  stop_id: string | null;
  photo_url: string | null;
}

export type TripStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TripType = 'PICKUP' | 'DROPOFF' | 'FIELD_TRIP' | 'OTHER';

export interface Trip {
  id: string;
  organization_id: string;
  route_id: string;
  vehicle_id: string;
  driver_id: string;
  trip_type: TripType;
  status: TripStatus;
  scheduled_start: string;
  started_at: string | null;
  ended_at: string | null;
}

export type TripEventType =
  | 'TRIP_STARTED'
  | 'TRIP_ENDED'
  | 'STOP_ARRIVED'
  | 'STOP_DEPARTED'
  | 'STUDENT_BOARDED'
  | 'STUDENT_DROPPED'
  | 'SOS'
  | 'DELAY_REPORTED';

export interface TripEvent {
  id: string;
  trip_id: string;
  event_type: TripEventType;
  stop_id: string | null;
  student_id: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

export interface LocationPing {
  vehicle_id: string;
  trip_id: string | null;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  heading: number | null;
  accuracy_m: number | null;
  recorded_at: string;
}

/** Live, in-memory snapshot of a vehicle's last known position (not DB row). */
export interface VehicleLiveState {
  vehicleId: string;
  tripId: string | null;
  lat: number;
  lng: number;
  speedKmh: number | null;
  heading: number | null;
  lastUpdatedAt: string;
}
