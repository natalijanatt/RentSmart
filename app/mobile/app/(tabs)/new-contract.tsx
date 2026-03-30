import React, { useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Typography } from '../../constants/theme';

export default function NewContractTab() {
  useEffect(() => {
    router.replace('/contract/new');
  }, []);

  return (
    <View style={styles.redirectContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={[styles.redirectText, Typography.body]}>Opening contract form…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  redirectContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  redirectText: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
  },
});