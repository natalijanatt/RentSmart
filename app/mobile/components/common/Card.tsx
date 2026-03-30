import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Shadows } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  shadow?: 'small' | 'medium' | 'large';
  padding?: number;
  style?: ViewStyle;
}

export const Card: React.FC<CardProps> = ({
  children,
  shadow = 'medium',
  padding = Spacing.lg,
  style,
}) => {
  const getShadow = () => {
    switch (shadow) {
      case 'small':
        return Shadows.small;
      case 'medium':
        return Shadows.medium;
      case 'large':
        return Shadows.large;
      default:
        return Shadows.medium;
    }
  };

  const styles = StyleSheet.create({
    card: {
      backgroundColor: Colors.surface,
      borderRadius: 12,
      padding,
      ...getShadow(),
    },
  });

  return <View style={[styles.card, style]}>{children}</View>;
};