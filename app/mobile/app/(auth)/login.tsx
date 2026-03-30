import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { authService } from '../../services';
import { Button, InputField, ErrorMessage, LoadingOverlay } from '../../components';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';

export default function LoginScreen() {
  const [phone, setPhone] = useState('+38161234567');
  const [displayName, setDisplayName] = useState('');
  const [isOtpMode, setIsOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { setUser, setFirebaseToken } = useAuthStore();

  const handleRequestOtp = async () => {
    if (!phone) {
      setError('Please enter a phone number');
      return;
    }
    // In a real app, Firebase would send OTP
    setIsOtpMode(true);
    setError(null);
  };

  const handleVerifyOtp = async () => {
    if (!otp) {
      setError('Please enter the OTP');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Mock Firebase token
      const mockToken = 'firebase-token-' + Math.random().toString(36).substring(2);
      
      const response = await authService.verifyAuth({
        firebase_token: mockToken,
        display_name: displayName,
        device_id: 'device-' + Math.random().toString(36).substring(7),
      });

      setFirebaseToken(mockToken);
      setUser(response.user);

      // Navigate to home or profile if name is missing
      if (!response.user.display_name) {
        router.replace('/(auth)/register');
      } else {
        router.replace('/(tabs)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
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
              Transparent rental agreements with blockchain support
            </Text>
          </View>

          <View style={styles.formSection}>
            {error && <ErrorMessage message={error} />}

            {!isOtpMode ? (
              <>
                <InputField
                  label="Phone Number"
                  placeholder="+381 61 234 5678"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  editable={!loading}
                />
                <InputField
                  label="Display Name (Optional)"
                  placeholder="Your name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  editable={!loading}
                />
                <Button
                  label="Send OTP"
                  onPress={handleRequestOtp}
                  loading={loading}
                  fullWidth
                />
              </>
            ) : (
              <>
                <Text style={[styles.otpPrompt, Typography.body]}>
                  Enter the 6-digit code sent to {phone}
                </Text>
                <InputField
                  label="One-Time Password"
                  placeholder="000000"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                />
                <Button
                  label="Verify OTP"
                  onPress={handleVerifyOtp}
                  loading={loading}
                  fullWidth
                />
                <Button
                  label="Back"
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
          </View>

          <View style={styles.footerSection}>
            <Text style={[styles.footerText, Typography.caption]}>
              By logging in, you agree to our Terms of Service and Privacy Policy
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={loading} message="Verifying..." />
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
    marginBottom: Spacing.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
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
