import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'primary' | 'default';
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'default',
  size = 'medium',
  style,
}) => {
  const getBackgroundColor = () => {
    switch (variant) {
      case 'success':
        return Colors.success + '20';
      case 'warning':
        return Colors.warning + '20';
      case 'error':
        return Colors.error + '20';
      case 'info':
        return Colors.info + '20';
      case 'primary':
        return Colors.primary + '20';
      default:
        return Colors.skeleton;
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'success':
        return Colors.success;
      case 'warning':
        return Colors.warning;
      case 'error':
        return Colors.error;
      case 'info':
        return Colors.info;
      case 'primary':
        return Colors.primary;
      default:
        return Colors.textSecondary;
    }
  };

  const getPadding = () => {
    switch (size) {
      case 'small':
        return { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs };
      case 'medium':
        return { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs };
      case 'large':
        return { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm };
      default:
        return { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small':
        return 11;
      case 'medium':
        return Typography.caption.fontSize;
      case 'large':
        return Typography.bodySmall.fontSize;
      default:
        return Typography.caption.fontSize;
    }
  };

  const styles = StyleSheet.create({
    badge: {
      backgroundColor: getBackgroundColor(),
      ...getPadding(),
      borderRadius: 12,
      alignSelf: 'flex-start',
    },
    text: {
      fontSize: getFontSize(),
      fontWeight: '600',
      color: getTextColor(),
    },
  });

  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
};