import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Button, Card, InputField, Divider } from '../../components';
import { Colors, Spacing, Typography } from '../../constants/theme';

export default function NewContractTab() {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoinContract = () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Error', 'Please enter an invite code');
      return;
    }
    router.push(`/invite/${code}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={[styles.title, Typography.heading2]}>New Contract</Text>

        <Card style={styles.card}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Join as Tenant</Text>
          <Divider />
          <Text style={[styles.description, Typography.body]}>
            Enter the invite code your landlord shared with you.
          </Text>
          <InputField
            label="Invite Code"
            placeholder="e.g. RSMART001"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="characters"
            editable={!loading}
          />
          <Button
            label="Join Contract"
            onPress={handleJoinContract}
            fullWidth
            disabled={loading}
          />
        </Card>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={[styles.orText, Typography.caption]}>OR</Text>
          <View style={styles.orLine} />
        </View>

        <Card style={styles.card}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Create as Landlord</Text>
          <Divider />
          <Text style={[styles.description, Typography.body]}>
            Create a new rental contract and invite your tenant.
          </Text>
          <Button
            label="Create Contract"
            onPress={() => router.push('/contract/new')}
            variant="outline"
            fullWidth
            disabled={loading}
          />
        </Card>
      </View>

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
    paddingVertical: Spacing.lg,
  },
  title: {
    color: Colors.text,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  card: {
    padding: Spacing.lg,
  },
  cardTitle: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  description: {
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.xl,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  orText: {
    color: Colors.textSecondary,
    marginHorizontal: Spacing.md,
  },
});
