import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services';
import { Button, ErrorMessage, LoadingOverlay } from '../../components';
import { Colors, Spacing, Typography } from '../../constants/theme';

const MOCK_USERS = [
  {
    label: 'Marko Petrovic (Landlord)',
    firebase_token: 'mock_landlord_marko',
    display_name: 'Marko Petrovic',
    device_id: 'mock-device-landlord',
  },
  {
    label: 'Ana Nikolic (Tenant)',
    firebase_token: 'mock_tenant_ana',
    display_name: 'Ana Nikolic',
    device_id: 'mock-device-tenant',
  },
];

export default function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { setUser, setFirebaseToken, setSolanaPubkey } = useAuthStore();

  const handleLogin = async (mockUser: typeof MOCK_USERS[number]) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authService.verifyAuth({
        firebase_token: mockUser.firebase_token,
        display_name: mockUser.display_name,
        device_id: mockUser.device_id,
      });

      setFirebaseToken(mockUser.firebase_token);
      setUser(response.user);
      setSolanaPubkey(response.user.solana_pubkey ?? '');
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerSection}>
          <Text style={[styles.title, Typography.heading1]}>RentSmart</Text>
          <Text style={[styles.subtitle, Typography.bodySmall]}>
            Transparent rental agreements with blockchain support
          </Text>
        </View>

        <View style={styles.formSection}>
          {error && <ErrorMessage message={error} />}
          <Text style={[styles.label, Typography.body]}>Log in as</Text>
          {MOCK_USERS.map((user) => (
            <Button
              key={user.firebase_token}
              label={user.label}
              onPress={() => handleLogin(user)}
              disabled={loading}
              fullWidth
              style={styles.button}
            />
          ))}
        </View>

        <View style={styles.footerSection}>
          <Button
            label="Create a real account"
            onPress={() => router.push('/(auth)/register')}
            variant="outline"
            fullWidth
            style={styles.registerButton}
          />
          <Text style={[styles.footerText, Typography.caption]}>
            Mock auth — dev only
          </Text>
        </View>
      </View>

      <LoadingOverlay visible={loading} message="Logging in..." />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'space-between',
  },
  headerSection: {
    paddingVertical: Spacing.xxxl,
    alignItems: 'center',
  },
  title: {
    color: Colors.primary,
    marginBottom: Spacing.sm,
    fontWeight: '700' as const,
  },
  subtitle: {
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 250,
  },
  formSection: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  button: {
    marginBottom: Spacing.md,
  },
  footerSection: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  registerButton: {
    marginBottom: Spacing.md,
  },
  footerText: {
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
