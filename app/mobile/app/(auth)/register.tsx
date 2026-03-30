import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { Button, InputField, ErrorMessage } from '../../components';
import { Colors, Spacing, Typography } from '../../constants/theme';
import { nameSchema } from '../../utils/validation';

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user, setUser } = useAuthStore();

  const handleComplete = async () => {
    if (!displayName.trim()) {
      setError('Please enter a display name');
      return;
    }

    try {
      nameSchema.parse(displayName);
      
      setLoading(true);
      // Update user with display name
      if (user) {
        setUser({ ...user, display_name: displayName });
      }
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, Typography.heading2]}>Complete Your Profile</Text>
          <Text style={[styles.subtitle, Typography.body]}>
            Let us know your name to get started
          </Text>
        </View>

        {error && <ErrorMessage message={error} />}

        <InputField
          label="Display Name"
          placeholder="John Doe"
          value={displayName}
          onChangeText={setDisplayName}
          editable={!loading}
        />

        <View style={styles.actions}>
          <Button
            label="Continue"
            onPress={handleComplete}
            loading={loading}
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
  actions: {
    marginTop: Spacing.xl,
  },
});
