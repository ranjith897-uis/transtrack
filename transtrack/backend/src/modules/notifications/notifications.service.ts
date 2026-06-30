import { query, queryOne } from '@/db/pool';
import { TripEventType } from '@/types';

interface NotifiableUser {
  id: string;
  push_token: string | null;
}

/**
 * Builds a human-readable notification for a trip event, then logs it
 * and (if the recipient has a push token registered) sends it via FCM.
 *
 * FCM integration is stubbed behind `sendPush` below — wire in a real
 * Firebase Admin SDK call once you have a Firebase project + credentials
 * (see ARCHITECTURE.md §6). Everything upstream of that call — who to
 * notify and what to say — is fully implemented and correct today.
 */
export async function sendNotificationToTripParents(
  tripId: string,
  eventType: TripEventType,
  metadata: Record<string, unknown>
) {
  const { title, body } = describeEvent(eventType, metadata);
  if (!title) return; // Some event types (e.g. SOS handled separately) might not notify parents directly

  const trip = await queryOne<{ route_id: string; organization_id: string }>(
    'SELECT route_id, organization_id FROM trips WHERE id = $1',
    [tripId]
  );
  if (!trip) return;

  // Notify parents of students on this route — and if the event references
  // a specific student, narrow to just that student's parents.
  const studentId = metadata.studentId as string | undefined;
  const recipients = await query<NotifiableUser>(
    studentId
      ? `SELECT u.id, u.push_token FROM users u
         JOIN student_parents sp ON sp.parent_user_id = u.id
         WHERE sp.student_id = $1`
      : `SELECT DISTINCT u.id, u.push_token FROM users u
         JOIN student_parents sp ON sp.parent_user_id = u.id
         JOIN students s ON s.id = sp.student_id
         WHERE s.route_id = $1`,
    [studentId ?? trip.route_id]
  );

  for (const recipient of recipients) {
    await query(
      `INSERT INTO notifications (user_id, title, body, data) VALUES ($1, $2, $3, $4)`,
      [recipient.id, title, body, JSON.stringify({ tripId, eventType, ...metadata })]
    );
    if (recipient.push_token) {
      await sendPush(recipient.push_token, title, body);
    }
  }

  // Also notify admins/dispatchers on safety-critical events.
  if (eventType === 'SOS' || eventType === 'DELAY_REPORTED') {
    const staff = await query<NotifiableUser>(
      `SELECT id, push_token FROM users WHERE organization_id = $1 AND role IN ('ADMIN','DISPATCHER')`,
      [trip.organization_id]
    );
    for (const s of staff) {
      await query(`INSERT INTO notifications (user_id, title, body, data) VALUES ($1, $2, $3, $4)`, [
        s.id,
        `⚠ ${title}`,
        body,
        JSON.stringify({ tripId, eventType, ...metadata }),
      ]);
      if (s.push_token) await sendPush(s.push_token, `⚠ ${title}`, body);
    }
  }
}

function describeEvent(eventType: TripEventType, metadata: Record<string, unknown>): { title: string; body: string } {
  switch (eventType) {
    case 'TRIP_STARTED':
      return { title: 'Trip started', body: 'The bus has started its route.' };
    case 'TRIP_ENDED':
      return { title: 'Trip ended', body: 'The bus has completed its route.' };
    case 'STOP_ARRIVED':
      return { title: 'Bus arriving', body: `The bus has arrived at ${metadata.stopName ?? 'a stop'}.` };
    case 'STOP_DEPARTED':
      return { title: 'Bus departed', body: `The bus has left ${metadata.stopName ?? 'a stop'}.` };
    case 'STUDENT_BOARDED':
      return { title: 'Student boarded', body: 'Your child has boarded the bus.' };
    case 'STUDENT_DROPPED':
      return { title: 'Student dropped off', body: 'Your child has been dropped off.' };
    case 'SOS':
      return { title: 'SOS raised', body: 'The driver has raised an emergency alert.' };
    case 'DELAY_REPORTED':
      return { title: 'Delay reported', body: 'The driver has reported a delay on this trip.' };
    default:
      return { title: '', body: '' };
  }
}

/**
 * STUB — replace with a real Firebase Cloud Messaging call.
 * Example with firebase-admin once you have a service account:
 *
 *   import { getMessaging } from 'firebase-admin/messaging';
 *   await getMessaging().send({ token, notification: { title, body } });
 *
 * Left as a logged no-op so the rest of the system is fully testable
 * without requiring Firebase credentials during development.
 */
async function sendPush(pushToken: string, title: string, body: string) {
  console.log(`[push:stub] -> ${pushToken.slice(0, 12)}... | ${title}: ${body}`);
}
