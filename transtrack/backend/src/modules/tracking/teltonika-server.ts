import net from 'net';
import { queryOne, query } from '@/db/pool';
import { redisPublisher, vehicleLocationChannel } from '@/modules/tracking/redis.client';
import { checkGeofences } from '@/modules/tracking/geofence.service';
import { liveVehicleStates } from '@/modules/tracking/live-state';

/**
 * TCP server for Teltonika FMB-series GPS trackers (FMB920, FMB130, and
 * compatible models), speaking Teltonika's "Codec 8" binary protocol.
 *
 * Unlike the simulator and driver-app fallback (which speak HTTP and call
 * POST /tracking/ingest directly), real hardware trackers like these open
 * a raw TCP connection and send compact binary frames — there is no "URL"
 * to configure on the device itself, only an IP address and port. This
 * server is that endpoint.
 *
 * Device configuration (done via Teltonika Configurator software, once
 * per device, when first provisioning a bus):
 *   - Server IP: this server's public IP or hostname
 *   - Server Port: whatever TELTONIKA_TCP_PORT is set to below (default 5027)
 *   - Protocol: TCP
 *
 * IMPORTANT — Render free/starter web services do not expose raw TCP
 * ports the way they expose HTTP. This server needs a host that supports
 * TCP port forwarding (a small VPS — e.g. a $4-6/month DigitalOcean or
 * Hetzner box — or Render's paid "private service" + a TCP proxy). This
 * is flagged in DEPLOYMENT.md; budget for this one piece outside the free
 * tier once real hardware is being installed on buses.
 *
 * Decoding reference: Teltonika's public Codec 8 documentation at
 * https://wiki.teltonika-gps.com/view/Codec — this implements the AVL
 * data parsing needed to extract GPS points; it does not implement the
 * full codec spec (e.g. extended I/O elements), only what's needed for
 * location, speed, heading, and timestamp.
 */

const TCP_PORT = parseInt(process.env.TELTONIKA_TCP_PORT ?? '5027', 10);

interface AvlRecord {
  timestamp: Date;
  lat: number;
  lng: number;
  speedKmh: number;
  heading: number;
}

export function startTeltonikaServer() {
  const server = net.createServer((socket) => {
    let imei: string | null = null;

    socket.on('data', async (data) => {
      try {
        if (!imei) {
          // First packet on a new connection is the IMEI handshake:
          // 2 bytes length + IMEI as ASCII digits.
          const imeiLength = data.readUInt16BE(0);
          imei = data.subarray(2, 2 + imeiLength).toString('ascii');

          const device = await queryOne<{ id: string; vehicle_id: string | null }>(
            'SELECT id, vehicle_id FROM devices WHERE external_id = $1',
            [imei]
          );

          if (!device) {
            console.warn(`[teltonika] unknown device IMEI ${imei}, rejecting connection`);
            socket.write(Buffer.from([0x00])); // reject
            socket.end();
            return;
          }

          // Accept the device.
          socket.write(Buffer.from([0x01]));
          return;
        }

        // Subsequent packets are AVL data frames (Codec 8).
        const records = parseCodec8(data);
        if (records.length === 0) return;

        const device = await queryOne<{ id: string; vehicle_id: string | null }>(
          'SELECT id, vehicle_id FROM devices WHERE external_id = $1',
          [imei]
        );
        if (!device?.vehicle_id) {
          console.warn(`[teltonika] device ${imei} has no vehicle assigned, dropping data`);
          return;
        }

        await query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [device.id]);

        const activeTrip = await queryOne<{ id: string }>(
          `SELECT id FROM trips WHERE vehicle_id = $1 AND status = 'IN_PROGRESS' LIMIT 1`,
          [device.vehicle_id]
        );

        for (const record of records) {
          await query(
            `INSERT INTO location_pings (vehicle_id, trip_id, location, speed_kmh, heading, recorded_at)
             VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, $6, $7)`,
            [device.vehicle_id, activeTrip?.id ?? null, record.lat, record.lng, record.speedKmh, record.heading, record.timestamp.toISOString()]
          );

          const liveState = {
            vehicleId: device.vehicle_id,
            tripId: activeTrip?.id ?? null,
            lat: record.lat,
            lng: record.lng,
            speedKmh: record.speedKmh,
            heading: record.heading,
            lastUpdatedAt: record.timestamp.toISOString(),
          };
          liveVehicleStates.set(device.vehicle_id, liveState);
          await redisPublisher.publish(vehicleLocationChannel(device.vehicle_id), JSON.stringify(liveState));

          if (activeTrip) {
            await checkGeofences(activeTrip.id, record.lat, record.lng);
          }
        }

        // Acknowledge: Teltonika expects a 4-byte response containing the
        // number of records accepted, so the device knows it can clear its
        // local buffer instead of re-sending the same data.
        const ack = Buffer.alloc(4);
        ack.writeUInt32BE(records.length, 0);
        socket.write(ack);
      } catch (err) {
        console.error('[teltonika] error processing packet', err);
      }
    });

    socket.on('error', (err) => {
      console.warn('[teltonika] socket error', err.message);
    });
  });

  server.listen(TCP_PORT, () => {
    console.log(`[teltonika] GPS device TCP server listening on port ${TCP_PORT}`);
  });

  return server;
}

/**
 * Minimal Codec 8 AVL data parser — extracts timestamp, lat/lng, speed,
 * and heading from each record in a frame. Does not parse I/O elements
 * (ignition, fuel, etc.) since TransTrack doesn't currently use them;
 * extend this function if those become needed later.
 */
function parseCodec8(buffer: Buffer): AvlRecord[] {
  const records: AvlRecord[] = [];

  // Frame structure: 4 bytes zero preamble, 4 bytes data length, 1 byte
  // codec ID, 1 byte record count, then N AVL records, then record count
  // again, then 4-byte CRC.
  if (buffer.length < 12) return records;

  const codecId = buffer.readUInt8(8);
  if (codecId !== 0x08) {
    console.warn(`[teltonika] unsupported codec ID 0x${codecId.toString(16)}, skipping frame`);
    return records;
  }

  const recordCount = buffer.readUInt8(9);
  let offset = 10;

  for (let i = 0; i < recordCount; i++) {
    if (offset + 24 > buffer.length) break; // malformed/truncated frame, bail safely

    const timestampMs = Number(buffer.readBigUInt64BE(offset));
    offset += 8;

    offset += 1; // priority byte, unused here

    const lngRaw = buffer.readInt32BE(offset);
    offset += 4;
    const latRaw = buffer.readInt32BE(offset);
    offset += 4;

    offset += 2; // altitude, unused here

    const heading = buffer.readUInt16BE(offset);
    offset += 2;

    offset += 1; // satellite count, unused here

    const speedKmh = buffer.readUInt16BE(offset);
    offset += 2;

    // I/O element block follows; its length varies, so we must walk it
    // even though we don't use its contents, to correctly find the next
    // record's start offset.
    offset += 1; // event IO id
    offset += 1; // total IO count (present in spec for validation; not required for parsing here)

    for (const byteWidth of [1, 2, 4, 8]) {
      if (offset >= buffer.length) break;
      const count = buffer.readUInt8(offset);
      offset += 1;
      offset += count * (1 + byteWidth); // each entry: 1-byte id + value
    }

    records.push({
      timestamp: new Date(timestampMs),
      lat: latRaw / 10_000_000,
      lng: lngRaw / 10_000_000,
      speedKmh,
      heading,
    });
  }

  return records;
}
