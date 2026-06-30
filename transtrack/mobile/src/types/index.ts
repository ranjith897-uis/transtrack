export type UserRole = 'ADMIN' | 'DISPATCHER' | 'DRIVER' | 'PARENT';

export interface User {
  id: string;
  organization_id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
}

export interface Vehicle {
  id: string;
  label: string;
  plate_number: string;
  capacity: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  current_driver_id: string | null;
}

export interface Stop {
  id: string;
  name: string;
  sequence: number;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  scheduled_time: string | null;
}

export interface RouteDetail {
  id: string;
  name: string;
  description: string | null;
  stops: Stop[];
}

export interface Student {
  id: string;
  full_name: string;
  grade: string | null;
  route_id: string | null;
  stop_id: string | null;
  photo_url: string | null;
}

export type TripStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Trip {
  id: string;
  route_id: string;
  vehicle_id: string;
  driver_id: string;
  trip_type: string;
  status: TripStatus;
  scheduled_start: string;
  started_at: string | null;
  ended_at: string | null;
  vehicle_label?: string;
  route_name?: string;
  driver_name?: string;
}

export interface VehicleLiveState {
  vehicleId: string;
  tripId: string | null;
  lat: number;
  lng: number;
  speedKmh: number | null;
  heading: number | null;
  lastUpdatedAt: string;
}

export interface TripEvent {
  id: string;
  trip_id: string;
  event_type: string;
  stop_id: string | null;
  student_id: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  sent_at: string;
}
