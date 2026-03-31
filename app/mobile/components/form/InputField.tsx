import React from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';

interface InputFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  error,
  helperText,
  ...props
}) => {
  const styles = StyleSheet.create({
    container: {
      marginBottom: Spacing.lg,
    },
    label: {
      fontSize: Typography.caption.fontSize,
      fontWeight: Typography.caption.fontWeight,
      color: Colors.textSecondary,
      marginBottom: Spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: error ? Colors.error : Colors.border,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      fontSize: Typography.body.fontSize,
      color: Colors.text,
      backgroundColor: Colors.surface,
    },
    errorText: {
      fontSize: Typography.caption.fontSize,
      color: Colors.error,
      marginTop: Spacing.xs,
    },
    helperText: {
      fontSize: Typography.caption.fontSize,
      color: Colors.textSecondary,
      marginTop: Spacing.xs,
    },
  });

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput 
        style={styles.input} 
        placeholderTextColor={Colors.textTertiary}
        {...props} 
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      {helperText && <Text style={styles.helperText}>{helperText}</Text>}
    </View>
  );
};