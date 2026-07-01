import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, Pressable } from 'react-native';
import { useAuthStore } from '@/lib/auth-store';
import { api, setTokens } from '@/lib/api';
import { Button } from '@/components/Button';
import { User } from '@/types';

/**
 * Smart login screen — auto-detects phone vs email input.
 *
 * Parents (imported from Excel):
 *   - Type their 10-digit mobile number → logs in immediately, no password
 *   - Uses POST /auth/login/phone
 *
 * Drivers and admins:
 *   - Type email → password field appears → standard login
 *   - Uses POST /auth/login
 */
export function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const login = useAuthStore((s) => s.login);

  // Detect phone input: mostly digits, 8+ chars
  const digitsOnly = identifier.replace(/\D/g, '');
  const isPhone = digitsOnly.length >= 8 && /^[\d\s\-+()]*$/.test(identifier);
  const needsPassword = !isPhone;

  async function handleLogin() {
    setError(null);
    setIsSubmitting(true);
    try {
      if (isPhone) {
        const data = await api.post<{ user: User; accessToken: string; refreshToken: string }>(
          '/auth/login/phone',
          { phone: identifier.trim() }
        );
        await setTokens(data.accessToken, data.refreshToken);
        useAuthStore.setState({ user: data.user, isLoading: false });
      } else {
        await login(identifier.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>TT</Text>
            </View>
            <Text style={styles.appName}>TransTrack</Text>
          </View>

          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>
            {isPhone
              ? "Enter your mobile number to track your child's bus."
              : 'Enter your email to continue.'}
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Mobile number or email</Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              placeholder="9876543210 or you@example.com"
            />
          </View>

          {needsPassword && identifier.length > 0 && (
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
                placeholder="••••••••"
              />
            </View>
          )}

          {isPhone && (
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>
                📱 Parent login — your mobile number is your password
              </Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            label={isSubmitting ? 'Signing in…' : 'Sign in'}
            onPress={handleLogin}
            loading={isSubmitting}
            disabled={!identifier || (needsPassword && !password)}
            style={styles.button}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  logoBadge: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  logoText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  appName: { fontSize: 18, fontWeight: '700', color: '#0B1220' },
  title: { fontSize: 24, fontWeight: '700', color: '#0B1220', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748B', marginBottom: 28 },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0B1220',
  },
  hintBox: { backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, marginBottom: 16 },
  hintText: { fontSize: 13, color: '#2563EB' },
  error: { color: '#DC2626', fontSize: 13, marginBottom: 12 },
  button: { marginTop: 8 },
});
