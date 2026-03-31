import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '../../constants/theme';

interface ProgressBarProps {
  progress: number;
  color?: string;
  backgroundColor?: string;
  height?: number;
  style?: ViewStyle;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  color = Colors.success,
  backgroundColor = Colors.divider,
  height = 8,
  style,
}) => {
  const styles = StyleSheet.create({
    container: {
      backgroundColor,
      height,
      borderRadius: height / 2,
      overflow: 'hidden',
      width: '100%',
    },
    progress: {
      backgroundColor: color,
      height: '100%',
      width: `${Math.min(progress, 100)}%`,
      borderRadius: height / 2,
    },
  });

  return (
    <View style={[styles.container, style]}>
      <View style={styles.progress} />
    </View>
  );
};