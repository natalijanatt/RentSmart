import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore, UserRole } from '../../store/authStore';
import { authService } from '../../services';
import { Button, InputField, Card, ErrorMessage, LoadingOverlay } from '../../components';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { nameSchema } from '../../utils/validation';

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user, firebaseToken, setUser, setUserRole } = useAuthStore();

  const handleComplete = async () => {
    if (!displayName.trim()) {
      setError('Unesite vaše ime');
      return;
    }

    if (!selectedRole) {
      setError('Izaberite tip korisnika');
      return;
    }

    try {
      nameSchema.parse(displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validacija nije uspela');
      return;
    }

    // No token means user came here without going through login/OTP first
    if (!user && !firebaseToken) {
      router.replace('/(auth)/login-v2');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (user) {
        // User already verified via login — just update display name locally
        setUser({ ...user, display_name: displayName });
      } else if (firebaseToken) {
        // firebaseToken holds the mockUserKey (e.g. "landlord_marko")
        // Derive the firebase_token the server expects: "mock_landlord_marko"
        const response = await authService.verifyAuth({
          firebase_token: `mock_${firebaseToken}`,
          display_name: displayName,
          device_id: `${firebaseToken}-device`,
        });
        setUser(response.user);
      }

      setUserRole(selectedRole);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registracija nije uspela');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, Typography.heading2]}>Kreirajte profil</Text>
          <Text style={[styles.subtitle, Typography.body]}>
            Unesite vaše podatke da biste započeli
          </Text>
        </View>

        {error && <ErrorMessage message={error} />}

        <InputField
          label="Ime i prezime"
          placeholder="Marko Marković"
          value={displayName}
          onChangeText={setDisplayName}
          editable={!loading}
        />

        <View style={styles.roleSection}>
          <Text style={[styles.roleLabel, Typography.bodySemibold]}>Ja sam:</Text>

          <TouchableOpacity
            style={[
              styles.roleCard,
              selectedRole === 'landlord' && styles.roleCardSelected,
            ]}
            onPress={() => setSelectedRole('landlord')}
            disabled={loading}
          >
            <View style={styles.roleIconContainer}>
              <Text style={styles.roleIcon}>🏠</Text>
            </View>
            <View style={styles.roleTextContainer}>
              <Text style={[styles.roleName, Typography.heading4,
                selectedRole === 'landlord' && styles.roleNameSelected]}>
                Stanodavac
              </Text>
              <Text style={[styles.roleDescription, Typography.bodySmall,
                selectedRole === 'landlord' && styles.roleDescSelected]}>
                Izdajem nekretninu i kreiram ugovore
              </Text>
            </View>
            {selectedRole === 'landlord' && (
              <View style={styles.checkmark}>
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.roleCard,
              selectedRole === 'tenant' && styles.roleCardSelected,
            ]}
            onPress={() => setSelectedRole('tenant')}
            disabled={loading}
          >
            <View style={styles.roleIconContainer}>
              <Text style={styles.roleIcon}>🔑</Text>
            </View>
            <View style={styles.roleTextContainer}>
              <Text style={[styles.roleName, Typography.heading4,
                selectedRole === 'tenant' && styles.roleNameSelected]}>
                Zakupac
              </Text>
              <Text style={[styles.roleDescription, Typography.bodySmall,
                selectedRole === 'tenant' && styles.roleDescSelected]}>
                Iznajmljujem nekretninu i prihvatam ugovore
              </Text>
            </View>
            {selectedRole === 'tenant' && (
              <View style={styles.checkmark}>
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <Button
            label="Nastavi"
            onPress={handleComplete}
            loading={loading}
            fullWidth
            disabled={!displayName.trim() || !selectedRole}
          />
          <Button
            label="Nazad na prijavu"
            onPress={() => router.back()}
            variant="outline"
            fullWidth
            disabled={loading}
            style={styles.backButton}
          />
        </View>
      </ScrollView>
      <LoadingOverlay visible={loading} message="Kreiranje profila..." />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xxxl,
  },
  title: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textSecondary,
  },
  roleSection: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  roleLabel: {
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  roleCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.backgroundSecondary,
  },
  roleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  roleIcon: {
    fontSize: 24,
  },
  roleTextContainer: {
    flex: 1,
  },
  roleName: {
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  roleNameSelected: {
    color: Colors.primary,
  },
  roleDescription: {
    color: Colors.textSecondary,
  },
  roleDescSelected: {
    color: Colors.textSecondary,
  },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
  checkmarkText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  actions: {
    marginTop: Spacing.xl,
  },
  backButton: {
    marginTop: Spacing.md,
  },
});
