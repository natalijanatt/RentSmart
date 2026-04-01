import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services';
import { Button, InputField, ErrorMessage, LoadingOverlay } from '../../components';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import type { UserRole } from '../../store/authStore';

// Mock phone → server mock token mapping
// firebase_token is what POST /auth/verify accepts in MOCK_AUTH mode
// mockUserKey is what X-Mock-User header expects on protected routes
const MOCK_USERS: Record<string, { firebaseToken: string; mockUserKey: string; role: UserRole }> = {
  '+381641234567': {
    firebaseToken: 'mock_landlord_marko',
    mockUserKey: 'landlord_marko',
    role: 'landlord',
  },
  '+381697654321': {
    firebaseToken: 'mock_tenant_ana',
    mockUserKey: 'tenant_ana',
    role: 'tenant',
  },
};

export default function LoginScreen() {
  const [phone, setPhone] = useState('+381641234567');
  const [isOtpMode, setIsOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { setUser, setFirebaseToken, setUserRole } = useAuthStore();

  const handleRequestOtp = () => {
    const normalized = phone.trim();
    if (!normalized) {
      setError('Unesite broj telefona');
      return;
    }
    if (!MOCK_USERS[normalized]) {
      setError(
        'Testni brojevi:\n+381641234567 (stanodavac Marko)\n+381697654321 (zakupac Ana)',
      );
      return;
    }
    setIsOtpMode(true);
    setError(null);
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      setError('Unesite OTP kod');
      return;
    }

    const mock = MOCK_USERS[phone.trim()];
    if (!mock) {
      setError('Nepoznat broj telefona');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await authService.verifyAuth({
        firebase_token: mock.firebaseToken,
        device_id: mock.mockUserKey + '-device',
      });

      // Store mockUserKey as firebaseToken — used as X-Mock-User on all subsequent calls
      setFirebaseToken(mock.mockUserKey);
      setUser(response.user);

      if (!response.user.display_name) {
        router.replace('/(auth)/register-v2');
      } else {
        setUserRole(mock.role);
        router.replace('/(tabs)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prijava nije uspela');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToRegister = () => {
    router.push('/(auth)/register-v2');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerSection}>
            <Text style={[styles.title, Typography.heading1]}>RentSmart</Text>
            <Text style={[styles.subtitle, Typography.bodySmall]}>
              Transparentni ugovori o zakupu sa blockchain podrškom
            </Text>
          </View>

          <View style={styles.formSection}>
            {error && <ErrorMessage message={error} />}

            {!isOtpMode ? (
              <>
                <InputField
                  label="Broj telefona"
                  placeholder="+381 61 234 5678"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  editable={!loading}
                />
                <Button
                  label="Pošalji OTP"
                  onPress={handleRequestOtp}
                  loading={loading}
                  fullWidth
                />
              </>
            ) : (
              <>
                <Text style={[styles.otpPrompt, Typography.body]}>
                  Unesite kod poslat na {phone}
                </Text>
                <Text style={[styles.otpHint, Typography.bodySmall]}>
                  (Testni režim — unesite bilo koji kod)
                </Text>
                <InputField
                  label="Jednokratna lozinka"
                  placeholder="000000"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                />
                <Button
                  label="Potvrdi OTP"
                  onPress={handleVerifyOtp}
                  loading={loading}
                  fullWidth
                />
                <Button
                  label="Nazad"
                  onPress={() => {
                    setIsOtpMode(false);
                    setOtp('');
                    setError(null);
                  }}
                  variant="outline"
                  fullWidth
                  disabled={loading}
                />
              </>
            )}

            <View style={styles.registerSection}>
              <Text style={[styles.registerPrompt, Typography.body]}>
                Nemate nalog?
              </Text>
              <TouchableOpacity onPress={handleGoToRegister} disabled={loading}>
                <Text style={[styles.registerLink, Typography.bodySemibold]}>
                  Registrujte se
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footerSection}>
            <Text style={[styles.footerText, Typography.caption]}>
              Prijavom se slažete sa Uslovima korišćenja i Politikom privatnosti
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={loading} message="Provera..." />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
  otpPrompt: {
    marginBottom: Spacing.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  otpHint: {
    marginBottom: Spacing.lg,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  registerSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xxl,
    gap: Spacing.sm,
  },
  registerPrompt: {
    color: Colors.textSecondary,
  },
  registerLink: {
    color: Colors.primary,
  },
  footerSection: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
