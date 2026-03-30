import React from 'react';
import { StyleSheet, View, Text, SafeAreaView, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { Button, Card, Divider } from '../../components';
import { Colors, Spacing, Typography } from '../../constants/theme';
import { getInitials } from '../../utils/formatters';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.replace('/(auth)/login');
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
                {user?.display_name || 'User'}
              </Text>
              <Text style={[styles.userPhone, Typography.body]}>
                {user?.phone || 'N/A'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Account Information */}
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, Typography.heading4]}>Account Information</Text>
          <Divider />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, Typography.body]}>User ID</Text>
            <Text style={[styles.infoValue, Typography.caption]}>
              {user?.id?.substring(0, 8)}...
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, Typography.body]}>Device ID</Text>
            <Text style={[styles.infoValue, Typography.caption]}>
              {user?.device_id?.substring(0, 8)}...
            </Text>
          </View>
          {user?.solana_pubkey && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, Typography.body]}>Solana Wallet</Text>
              <Text style={[styles.infoValue, Typography.caption]}>
                {user.solana_pubkey.substring(0, 8)}...
              </Text>
            </View>
          )}
        </Card>

        {/* Preferences */}
        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, Typography.heading4]}>Preferences</Text>
          <Divider />
          <Text style={[styles.preferenceHint, Typography.body]}>
            More settings coming soon
          </Text>
        </Card>

        {/* Logout */}
        <View style={styles.actions}>
          <Button
            label="Logout"
            onPress={handleLogout}
            variant="danger"
            fullWidth
          />
        </View>
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
    width: 60,
    height: 60,
    borderRadius: 30,
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
  },
  userName: {
    color: Colors.text,
  },
  userPhone: {
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
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
    fontSize: 12,
  },
  preferenceHint: {
    color: Colors.textSecondary,
    paddingVertical: Spacing.sm,
  },
  actions: {
    marginTop: Spacing.xl,
  },
});