import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, Typography } from '../../constants/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}) => {
  const getBackgroundColor = () => {
    if (disabled) return Colors.skeleton;
    switch (variant) {
      case 'primary':
        return Colors.primary;
      case 'secondary':
        return Colors.secondary;
      case 'outline':
        return Colors.surface;
      case 'danger':
        return Colors.error;
      default:
        return Colors.primary;
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'outline':
        return Colors.primary;
      case 'primary':
      case 'secondary':
      case 'danger':
        return Colors.surface;
      default:
        return Colors.surface;
    }
  };

  const getPadding = () => {
    switch (size) {
      case 'small':
        return Spacing.sm;
      case 'medium':
        return Spacing.md;
      case 'large':
        return Spacing.lg;
      default:
        return Spacing.md;
    }
  };

  const styles = StyleSheet.create({
    button: {
      backgroundColor: getBackgroundColor(),
      paddingVertical: getPadding(),
      paddingHorizontal: Spacing.lg,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      borderWidth: variant === 'outline' ? 1 : 0,
      borderColor: variant === 'outline' ? Colors.primary : 'transparent',
      width: fullWidth ? '100%' : 'auto',
      opacity: disabled ? 0.6 : 1,
    },
    text: {
      color: getTextColor(),
      fontSize: Typography.button.fontSize,
      fontWeight: Typography.button.fontWeight,
      marginHorizontal: loading ? Spacing.sm : 0,
    },
  });

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.7}
    >
      {loading && <ActivityIndicator color={getTextColor()} size="small" />}
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
};