import React from 'react';
import { StyleSheet, View, Text, SafeAreaView } from 'react-native';
import { Button } from '../../../components';
import { Colors, Spacing, Typography } from '../../../constants/theme';
import { useLocalSearchParams, router } from 'expo-router';

export default function CheckinScreen() {
  const { id } = useLocalSearchParams();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={[styles.title, Typography.heading2]}>Check-in Flow</Text>
        <Text style={[styles.subtitle, Typography.body]}>
          Camera and inspection flow coming soon
        </Text>
        <Button
          label="Back"
          onPress={() => router.back()}
          fullWidth
          style={styles.button}
        />
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: Colors.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  button: {
    marginTop: Spacing.xl,
  },
});
