import { useEffect, useRef, useState, useCallback } from 'react';
import { getTokens, API_BASE_URL } from '@/lib/api';
import { VehicleLiveState, TripEvent } from '@/types';

type WsMessage =
  | { type: 'auth_ok' }
  | { type: 'watch_ok'; vehicleId: string }
  | { type: 'location'; vehicleId: string; payload: VehicleLiveState }
  | { type: 'trip_event'; tripId: string; payload: TripEvent }
  | { type: 'error'; message: string };

/**
 * Manages one WebSocket connection for the session, lets components
 * declare which vehicles they want live updates for, and exposes the
 * latest known state per vehicle. Reconnects with backoff on drop.
 */
export function useLiveTracking() {
  const [vehicles, setVehicles] = useState<Record<string, VehicleLiveState>>({});
  const [tripEvents, setTripEvents] = useState<TripEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const watchedRef = useRef<Set<string>>(new Set());
  const reconnectAttempt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket;

    function connect() {
      const tokens = getTokens();
      if (!tokens) return;

      const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + '/ws';
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token: tokens.accessToken }));
      };

      socket.onmessage = (event) => {
        const msg: WsMessage = JSON.parse(event.data);

        if (msg.type === 'auth_ok') {
          setConnected(true);
          reconnectAttempt.current = 0;
          // Re-subscribe to anything requested before/during reconnect.
          for (const vehicleId of watchedRef.current) {
            socket.send(JSON.stringify({ type: 'watch', vehicleId }));
          }
        } else if (msg.type === 'location') {
          setVehicles((prev) => ({ ...prev, [msg.vehicleId]: msg.payload }));
        } else if (msg.type === 'trip_event') {
          setTripEvents((prev) => [msg.payload, ...prev].slice(0, 100));
        } else if (msg.type === 'error') {
          console.warn('[ws] server error:', msg.message);
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        const delay = Math.min(1000 * 2 ** reconnectAttempt.current, 15000);
        reconnectAttempt.current += 1;
        setTimeout(() => {
          if (!cancelled) connect();
        }, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, []);

  const watchVehicle = useCallback((vehicleId: string) => {
    watchedRef.current.add(vehicleId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'watch', vehicleId }));
    }
  }, []);

  const unwatchVehicle = useCallback((vehicleId: string) => {
    watchedRef.current.delete(vehicleId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unwatch', vehicleId }));
    }
  }, []);

  return { vehicles, tripEvents, connected, watchVehicle, unwatchVehicle };
}
