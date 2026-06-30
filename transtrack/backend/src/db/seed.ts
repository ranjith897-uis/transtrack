import { pool } from '@/db/pool';
import { hashPassword } from '@/modules/auth/auth.service';

/**
 * Seeds a realistic demo dataset: one organization, an admin, two drivers,
 * two parents, two vehicles with devices, a route with stops in a small
 * area (defaults to a sample area — see STOP_COORDS below; swap these for
 * your real depot/school coordinates), and a couple of students.
 *
 * Run with: npm run db:seed
 */

// Sample coordinates — replace with real stop locations for your routes.
const STOP_COORDS = [
  { name: 'Maple Street & 3rd Ave', lat: 17.4239, lng: 78.4738 },
  { name: 'Oakwood Apartments', lat: 17.4280, lng: 78.4800 },
  { name: 'Greenfield School', lat: 17.4330, lng: 78.4865 },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const org = (await client.query(
      `INSERT INTO organizations (name) VALUES ('Demo School Transport Co.') RETURNING id`
    )).rows[0];

    const adminPass = await hashPassword('Admin@12345');
    const admin = (await client.query(
      `INSERT INTO users (organization_id, role, full_name, email, password_hash)
       VALUES ($1, 'ADMIN', 'Fleet Admin', 'admin@demo.transtrack', $2) RETURNING id`,
      [org.id, adminPass]
    )).rows[0];

    const driverPass = await hashPassword('Driver@12345');
    const driver1 = (await client.query(
      `INSERT INTO users (organization_id, role, full_name, email, phone, password_hash)
       VALUES ($1, 'DRIVER', 'Ramesh Kumar', 'ramesh.driver@demo.transtrack', '+910000000001', $2) RETURNING id`,
      [org.id, driverPass]
    )).rows[0];

    const driver2 = (await client.query(
      `INSERT INTO users (organization_id, role, full_name, email, phone, password_hash)
       VALUES ($1, 'DRIVER', 'Suresh Reddy', 'suresh.driver@demo.transtrack', '+910000000002', $2) RETURNING id`,
      [org.id, driverPass]
    )).rows[0];

    const parentPass = await hashPassword('Parent@12345');
    const parent1 = (await client.query(
      `INSERT INTO users (organization_id, role, full_name, email, phone, password_hash)
       VALUES ($1, 'PARENT', 'Anita Sharma', 'anita.parent@demo.transtrack', '+910000000010', $2) RETURNING id`,
      [org.id, parentPass]
    )).rows[0];

    const vehicle1 = (await client.query(
      `INSERT INTO vehicles (organization_id, label, plate_number, capacity, current_driver_id)
       VALUES ($1, 'Bus 1', 'TS-09-AB-1234', 40, $2) RETURNING id`,
      [org.id, driver1.id]
    )).rows[0];

    const vehicle2 = (await client.query(
      `INSERT INTO vehicles (organization_id, label, plate_number, capacity, current_driver_id)
       VALUES ($1, 'Bus 2', 'TS-09-AB-5678', 30, $2) RETURNING id`,
      [org.id, driver2.id]
    )).rows[0];

    await client.query(
      `INSERT INTO devices (vehicle_id, external_id, protocol) VALUES ($1, 'SIM-DEVICE-001', 'SIMULATOR')`,
      [vehicle1.id]
    );
    await client.query(
      `INSERT INTO devices (vehicle_id, external_id, protocol) VALUES ($1, 'SIM-DEVICE-002', 'SIMULATOR')`,
      [vehicle2.id]
    );

    const route = (await client.query(
      `INSERT INTO routes (organization_id, name, description)
       VALUES ($1, 'Route 1 - Morning Pickup', 'Maple St through to Greenfield School') RETURNING id`,
      [org.id]
    )).rows[0];

    const stopIds: string[] = [];
    for (let i = 0; i < STOP_COORDS.length; i++) {
      const s = STOP_COORDS[i];
      const stop = (await client.query(
        `INSERT INTO stops (route_id, name, sequence, location, geofence_radius_m, scheduled_time)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, 150, $6)
         RETURNING id`,
        [route.id, s.name, i + 1, s.lat, s.lng, `0${7 + i}:${i === 0 ? '00' : '15'}:00`]
      )).rows[0];
      stopIds.push(stop.id);
    }

    const student1 = (await client.query(
      `INSERT INTO students (organization_id, full_name, grade, route_id, stop_id)
       VALUES ($1, 'Aarav Sharma', '5th Grade', $2, $3) RETURNING id`,
      [org.id, route.id, stopIds[0]]
    )).rows[0];

    await client.query(
      `INSERT INTO student_parents (student_id, parent_user_id) VALUES ($1, $2)`,
      [student1.id, parent1.id]
    );

    const trip = (await client.query(
      `INSERT INTO trips (organization_id, route_id, vehicle_id, driver_id, trip_type, status, scheduled_start)
       VALUES ($1, $2, $3, $4, 'PICKUP', 'SCHEDULED', now() + interval '1 hour') RETURNING id`,
      [org.id, route.id, vehicle1.id, driver1.id]
    )).rows[0];

    await client.query('COMMIT');

    console.log('\n✅ Seed complete!\n');
    console.log('Demo credentials:');
    console.log('  Admin   -> admin@demo.transtrack / Admin@12345');
    console.log('  Driver1 -> ramesh.driver@demo.transtrack / Driver@12345  (Bus 1, device SIM-DEVICE-001)');
    console.log('  Driver2 -> suresh.driver@demo.transtrack / Driver@12345  (Bus 2, device SIM-DEVICE-002)');
    console.log('  Parent  -> anita.parent@demo.transtrack / Parent@12345  (linked to Aarav Sharma, Route 1)');
    console.log(`\nSeeded trip id (for simulator): ${trip.id}`);
    console.log(`Seeded route id: ${route.id}`);
    console.log(`Seeded vehicle ids: ${vehicle1.id} (Bus 1), ${vehicle2.id} (Bus 2)\n`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
