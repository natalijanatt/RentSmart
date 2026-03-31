import React from 'react';
import { StyleSheet, View, Text, SafeAreaView, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useContractsStore } from '../../store/contractsStore';
import { Button, Card, Badge, Divider } from '../../components';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { getInitials } from '../../utils/formatters';

export default function ProfileScreen() {
  const { user, userRole, setUserRole, logout } = useAuthStore();
  const { reset: resetContracts } = useContractsStore();

  const handleLogout = () => {
    Alert.alert('Odjava', 'Da li ste sigurni da želite da se odjavite?', [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Odjavi se',
        style: 'destructive',
        onPress: () => {
          logout();
          resetContracts();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleSwitchRole = () => {
    const newRole = userRole === 'landlord' ? 'tenant' : 'landlord';
    Alert.alert(
      'Promeni tip korisnika',
      `Da li želite da se prebacite na ${newRole === 'landlord' ? 'stanodavca' : 'zakupca'}?`,
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Promeni',
          onPress: () => setUserRole(newRole),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <Card style={styles.profileCard}>
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user ? getInitials(user.display_name) : 'RS'}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, Typography.heading3]}>
                {user?.display_name || 'Korisnik'}
              </Text>
              <Text style={[styles.userPhone, Typography.body]}>
                {user?.phone || 'N/A'}
              </Text>
              <Badge
                label={userRole === 'landlord' ? 'Stanodavac' : 'Zakupac'}
                variant={userRole === 'landlord' ? 'info' : 'primary'}
                size="small"
              />
            </View>
          </View>
        </Card>

        {/* Account Information */}
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, Typography.heading4]}>Informacije o nalogu</Text>
          <Divider />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, Typography.body]}>Tip korisnika</Text>
            <Text style={[styles.infoValue, Typography.body]}>
              {userRole === 'landlord' ? 'Stanodavac' : 'Zakupac'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, Typography.body]}>ID korisnika</Text>
            <Text style={[styles.infoValue, Typography.caption]}>
              {user?.id?.substring(0, 12)}...
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, Typography.body]}>ID uređaja</Text>
            <Text style={[styles.infoValue, Typography.caption]}>
              {user?.device_id?.substring(0, 12)}...
            </Text>
          </View>
          {user?.solana_pubkey && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, Typography.body]}>Solana novčanik</Text>
              <Text style={[styles.infoValue, Typography.caption]}>
                {user.solana_pubkey.substring(0, 12)}...
              </Text>
            </View>
          )}
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            label={`Prebaci na ${userRole === 'landlord' ? 'zakupca' : 'stanodavca'}`}
            onPress={handleSwitchRole}
            variant="outline"
            fullWidth
          />
          <Button
            label="Odjavi se"
            onPress={handleLogout}
            variant="danger"
            fullWidth
            style={styles.logoutButton}
          />
        </View>

        <Text style={[styles.versionText, Typography.captionSmall]}>
          RentSmart v1.0.0 (MVP)
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  profileCard: {
    marginBottom: Spacing.md,
  },
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    color: Colors.surface,
    fontSize: 24,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  userName: {
    color: Colors.text,
  },
  userPhone: {
    color: Colors.textSecondary,
  },
  card: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  infoLabel: {
    color: Colors.text,
    flex: 1,
  },
  infoValue: {
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  actions: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  logoutButton: {
    marginTop: Spacing.sm,
  },
  versionText: {
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },
});
