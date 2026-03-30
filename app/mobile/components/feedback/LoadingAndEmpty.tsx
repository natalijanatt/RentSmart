import React from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Text,
  ViewStyle,
} from 'react-native';
import { Colors, Spacing, Typography } from '../../constants/theme';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'large',
  color = Colors.primary,
}) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: Colors.surface,
    },
  });

  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
};

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  message = 'Loading...',
}) => {
  const styles = StyleSheet.create({
    modal: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    container: {
      backgroundColor: Colors.surface,
      borderRadius: 12,
      padding: Spacing.xl,
      alignItems: 'center',
    },
    text: {
      marginTop: Spacing.lg,
      fontSize: Typography.body.fontSize,
      color: Colors.text,
    },
  });

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.modal}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.text}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
};

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
  style?: ViewStyle;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  style,
}) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      backgroundColor: Colors.surface,
    },
    icon: {
      fontSize: 48,
      marginBottom: Spacing.lg,
    },
    title: {
      fontSize: Typography.heading3.fontSize,
      fontWeight: Typography.heading3.fontWeight,
      color: Colors.text,
      marginBottom: Spacing.sm,
      textAlign: 'center',
    },
    description: {
      fontSize: Typography.body.fontSize,
      color: Colors.textSecondary,
      textAlign: 'center',
      lineHeight: Typography.body.lineHeight,
    },
  });

  return (
    <View style={[styles.container, style]}>
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </View>
  );
};

interface ErrorMessageProps {
  message?: string;
  style?: ViewStyle;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  style,
}) => {
  if (!message) return null;

  const styles = StyleSheet.create({
    container: {
      backgroundColor: Colors.error + '20',
      borderLeftWidth: 4,
      borderLeftColor: Colors.error,
      padding: Spacing.md,
      borderRadius: 4,
      marginBottom: Spacing.lg,
    },
    text: {
      color: Colors.error,
      fontSize: Typography.caption.fontSize,
    },
  });

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};
