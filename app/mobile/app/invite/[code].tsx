import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useContractsStore } from '../../store/contractsStore';
import { contractsService } from '../../services';
import { Button, Card, Badge, Divider, LoadingOverlay, ErrorMessage } from '../../components';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function InviteScreen() {
  const { code } = useLocalSearchParams();
  const { user } = useAuthStore();
  const { addContract } = useContractsStore();
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError('Invalid invite code');
      return;
    }
    fetchContract();
  }, [code]);

  const fetchContract = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await contractsService.getContractByInviteCode(code as string);
      setContract(response.contract);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contract');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptContract = async () => {
    if (!user || !contract) return;

    setAccepting(true);
    setError(null);

    try {
      const response = await contractsService.acceptContract(contract.id);
      addContract(response.contract);
      
      Alert.alert(
        'Success',
        'Contract accepted! You can now start the check-out process.',
        [
          {
            text: 'View Contract',
            onPress: () => router.replace({ pathname: '/contract/[id]', params: { id: contract.id } }),
          },
        ]
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept contract');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingOverlay visible={true} message="Loading contract..." />
      </SafeAreaView>
    );
  }

  if (!contract) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          {error && <ErrorMessage message={error} />}
          <Button label="Go Home" onPress={() => router.replace('/(tabs)')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, Typography.heading2]}>Contract Invitation</Text>
          <Badge label={contract.status} variant="info" style={styles.badge} />
        </View>

        {error && <ErrorMessage message={error} />}

        {/* Landlord Info */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Landlord Information</Text>
          <Divider />
          <View style={styles.infoRow}>
            <Text style={[styles.label, Typography.bodySemibold]}>Landlord:</Text>
            <Text style={[styles.value, Typography.body]}>{contract.landlord?.display_name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, Typography.bodySemibold]}>Landlord ID:</Text>
            <Text style={[styles.value, Typography.body]}>{contract.landlord?.id}</Text>
          </View>
        </Card>

        {/* Property Details */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Property Details</Text>
          <Divider />
          <View style={styles.infoRow}>
            <Text style={[styles.label, Typography.bodySemibold]}>Address:</Text>
            <Text style={[styles.value, Typography.body]}>{contract.property_address}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, Typography.bodySemibold]}>Rent (Monthly):</Text>
            <Text style={[styles.value, Typography.body]}>
              {formatCurrency(contract.rent_monthly_eur)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, Typography.bodySemibold]}>Deposit:</Text>
            <Text style={[styles.value, Typography.body]}>
              {formatCurrency(contract.deposit_amount_eur)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, Typography.bodySemibold]}>Start Date:</Text>
            <Text style={[styles.value, Typography.body]}>{formatDate(contract.start_date)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, Typography.bodySemibold]}>End Date:</Text>
            <Text style={[styles.value, Typography.body]}>{formatDate(contract.end_date)}</Text>
          </View>
        </Card>

        {/* Rooms */}
        {contract.rooms && contract.rooms.length > 0 && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Rooms</Text>
            <Divider />
            {contract.rooms.map((room: any, index: number) => (
              <View key={index} style={styles.roomItem}>
                <Text style={[Typography.body, styles.roomType]}>
                  {room.custom_name || room.room_type}
                </Text>
                {room.is_mandatory && <Badge label="Required" variant="success" size="small" />}
              </View>
            ))}
          </Card>
        )}

        {/* Plain Language Summary */}
        {contract.plain_language_summary && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Contract Summary</Text>
            <Divider />
            <Text style={[Typography.body, styles.summaryText]}>
              {contract.plain_language_summary}
            </Text>
          </Card>
        )}

        {/* Notes */}
        {contract.notes && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Notes</Text>
            <Divider />
            <Text style={[Typography.body, styles.notesText]}>{contract.notes}</Text>
          </Card>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Button
            label={accepting ? 'Accepting...' : 'Accept Contract'}
            onPress={handleAcceptContract}
            disabled={accepting || loading}
            loading={accepting}
          />
          <Button
            label="Decline"
            variant="outline"
            onPress={() => router.back()}
            disabled={accepting}
            style={styles.secondaryButton}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
  },
  card: {
    marginBottom: Spacing.md,
  },
  cardTitle: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  label: {
    color: Colors.textSecondary,
    flex: 0.4,
  },
  value: {
    color: Colors.text,
    flex: 0.6,
    textAlign: 'right',
  },
  roomItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginVertical: Spacing.xs,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.sm,
  },
  roomType: {
    color: Colors.text,
    flex: 1,
  },
  summaryText: {
    color: Colors.text,
    lineHeight: 22,
  },
  notesText: {
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  buttonContainer: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  secondaryButton: {
    marginTop: Spacing.sm,
  },
});
