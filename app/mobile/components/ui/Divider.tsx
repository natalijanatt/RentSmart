import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing } from '../../constants/theme';

interface DividerProps {
  style?: ViewStyle;
  vertical?: boolean;
}

export const Divider: React.FC<DividerProps> = ({ style, vertical = false }) => {
  const styles = StyleSheet.create({
    divider: {
      backgroundColor: Colors.divider,
      height: vertical ? '100%' : 1,
      width: vertical ? 1 : '100%',
      marginVertical: !vertical ? Spacing.md : 0,
      marginHorizontal: vertical ? Spacing.md : 0,
    },
  });

  return <View style={[styles.divider, style]} />;
};