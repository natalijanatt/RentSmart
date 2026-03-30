import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  onPress,
  style,
}) => {
  const styles = StyleSheet.create({
    chip: {
      backgroundColor: selected ? Colors.primary : Colors.surface,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: selected ? Colors.primary : Colors.border,
      marginRight: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    text: {
      fontSize: Typography.body.fontSize,
      color: selected ? Colors.surface : Colors.text,
      fontWeight: selected ? '600' : '400',
    },
  });

  return (
    <TouchableOpacity style={[styles.chip, style]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
};