import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useAuthStore } from '@/lib/auth-store';
import { usePushNotificationRegistration } from '@/hooks/usePushNotificationRegistration';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { DriverNavigator } from '@/navigation/DriverNavigator';
import { ParentNavigator } from '@/navigation/ParentNavigator';

export function RootNavigator() {
  const { user, isLoading, loadCurrentUser } = useAuthStore();

  useEffect(() => {
    loadCurrentUser();
  }, [loadCurrentUser]);

  usePushNotificationRegistration(Boolean(user));

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <LoginScreen />
      ) : user.role === 'DRIVER' ? (
        <DriverNavigator />
      ) : user.role === 'PARENT' ? (
        <ParentNavigator />
      ) : (
        <UnsupportedRoleScreen role={user.role} />
      )}
    </NavigationContainer>
  );
}

/**
 * ADMIN/DISPATCHER accounts are meant for the web console, not this app —
 * shown if someone signs in to the mobile app with admin credentials by
 * mistake, rather than silently failing or crashing.
 */
function UnsupportedRoleScreen({ role }: { role: string }) {
  return (
    <SafeAreaView style={styles.loadingContainer}>
      <View style={{ paddingHorizontal: 32 }}>
        <Text style={styles.loadingText}>
          This app is for drivers and parents. Your account role ({role}) should use the TransTrack web console instead.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  loadingText: { color: '#64748B', fontSize: 14, textAlign: 'center' },
});
