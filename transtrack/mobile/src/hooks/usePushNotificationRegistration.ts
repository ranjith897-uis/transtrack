import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from '@/lib/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests notification permission and registers the resulting push token
 * with the backend (POST /auth/push-token), so the notifications service
 * (backend/src/modules/notifications/notifications.service.ts) can reach
 * this device. No-ops gracefully on simulators, which don't support push.
 */
export function usePushNotificationRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function register() {
      if (!Device.isDevice) {
        console.log('[push] running on simulator — push tokens are unavailable here');
        return;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted' || cancelled) return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }

      try {
        const tokenResponse = await Notifications.getExpoPushTokenAsync();
        if (!cancelled) {
          await api.post('/auth/push-token', { pushToken: tokenResponse.data });
        }
      } catch (err) {
        console.warn('[push] failed to register token', err);
      }
    }

    register();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
