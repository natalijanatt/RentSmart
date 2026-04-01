import React, { useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { useContractsStore } from '../../../store/contractsStore';
import { contractsService } from '../../../services';
import { Button, Card, Badge, Divider, LoadingSpinner } from '../../../components';
import { Colors, Spacing, Typography } from '../../../constants/theme';
import {
  formatCurrency,
  formatDate,
  getContractStatusLabel,
} from '../../../utils/formatters';

export default function ContractDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const { selectedContract, setSelectedContract, isLoading, setIsLoading } = useContractsStore();

  const loadContractDetails = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const response = await contractsService.getContract(id as string);
      setSelectedContract(response.contract);
    } catch (error) {
      console.error('Error loading contract:', error);
      Alert.alert('Error', 'Failed to load contract details');
    } finally {
      setIsLoading(false);
    }
  }, [id, setSelectedContract, setIsLoading]);

  useFocusEffect(
    useCallback(() => {
      loadContractDetails();
    }, [loadContractDetails])
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!selectedContract) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={[styles.error, Typography.body]}>Contract not found</Text>
      </SafeAreaView>
    );
  }

  const contract = selectedContract;
  const isLandlord = user?.id === contract.landlord_id;
  const status = contract.status;

  const handleShare = async () => {
    try {
      await Share.share({ message: `Join my RentSmart contract: ${contract.invite_code}` });
    } catch {}
  };

  const renderActions = () => {
    const buttons: React.ReactNode[] = [];

    if (status === 'accepted' && isLandlord) {
      buttons.push(
        <Button key="checkin" label="Start Check-in" onPress={() => router.push(`/contract/${contract.id}/checkin`)} fullWidth style={styles.actionButton} />
      );
    }

    if ((status === 'checkin_in_progress') && isLandlord) {
      buttons.push(
        <Button key="checkin" label="Continue Check-in" onPress={() => router.push(`/contract/${contract.id}/checkin`)} fullWidth style={styles.actionButton} />
      );
    }

    if (status === 'checkin_pending_approval' && !isLandlord) {
      buttons.push(
        <Button key="review-checkin" label="Review Check-in" onPress={() => router.push(`/contract/${contract.id}/review-images`)} fullWidth style={styles.actionButton} />
      );
    }

    if (status === 'active' && !isLandlord) {
      buttons.push(
        <Button key="checkout" label="Start Check-out" onPress={() => router.push(`/contract/${contract.id}/checkout`)} fullWidth style={styles.actionButton} />
      );
    }

    if (status === 'checkout_in_progress' && !isLandlord) {
      buttons.push(
        <Button key="checkout" label="Continue Check-out" onPress={() => router.push(`/contract/${contract.id}/checkout`)} fullWidth style={styles.actionButton} />
      );
    }

    if (status === 'checkout_pending_approval' && isLandlord) {
      buttons.push(
        <Button key="review-checkout" label="Review Check-out" onPress={() => router.push(`/contract/${contract.id}/review-images`)} fullWidth style={styles.actionButton} />
      );
    }

    if (status === 'settlement' || status === 'completed') {
      buttons.push(
        <Button key="settlement" label="View Settlement" onPress={() => router.push(`/contract/${contract.id}/settlement`)} fullWidth style={styles.actionButton} />
      );
    }

    buttons.push(
      <Button key="audit" label="View Audit Trail" onPress={() => router.push(`/contract/${contract.id}/audit`)} variant="outline" fullWidth style={styles.actionButton} />
    );

    return buttons;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Button
          label="← Home"
          onPress={() => router.replace('/(tabs)')}
          variant="outline"
          size="small"
          style={styles.backButton}
        />

        {/* Status Section */}
        <Card style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={[styles.address, Typography.heading3]}>
              {contract.property_address}
            </Text>
          </View>
          <Badge
            label={getContractStatusLabel(contract.status)}
            variant={contract.status === 'active' ? 'success' : 'info'}
          />
          <Text style={[styles.period, Typography.body]}>
            {formatDate(contract.start_date)} - {formatDate(contract.end_date)}
          </Text>
        </Card>

        {/* Invite Code */}
        {(status === 'pending_acceptance' || status === 'draft') && isLandlord && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Invite Tenant</Text>
            <Divider />
            <Text style={[styles.summaryLabel, Typography.body]}>Share this code with your tenant:</Text>
            <Text style={[styles.inviteCode, Typography.heading2]}>{contract.invite_code}</Text>
            <Button label="Share Invite Code" onPress={handleShare} fullWidth style={styles.actionButton} />
          </Card>
        )}

        {/* Financial Summary */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Financial Summary</Text>
          <Divider />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, Typography.body]}>Monthly Rent</Text>
            <Text style={[styles.summaryValue, Typography.heading4]}>
              {formatCurrency(contract.rent_monthly_eur)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, Typography.body]}>Deposit Amount</Text>
            <Text style={[styles.summaryValue, Typography.heading4]}>
              {formatCurrency(contract.deposit_amount_eur)}
            </Text>
          </View>
        </Card>

        {/* Rooms */}
        {contract.rooms && contract.rooms.length > 0 && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Rooms</Text>
            <Divider />
            {contract.rooms.map((room) => (
              <View key={room.id} style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, Typography.body]}>
                  {room.custom_name || room.room_type.replace(/_/g, ' ')}
                </Text>
                {room.is_mandatory && <Badge label="Mandatory" variant="primary" size="small" />}
              </View>
            ))}
          </Card>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {renderActions()}
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  statusCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  statusHeader: {
    marginBottom: Spacing.md,
  },
  address: {
    color: Colors.text,
  },
  period: {
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  card: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  cardTitle: {
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  inviteCode: {
    color: Colors.primary,
    textAlign: 'center',
    letterSpacing: 4,
    marginVertical: Spacing.lg,
    fontWeight: '700' as const,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  summaryLabel: {
    color: Colors.textSecondary,
  },
  summaryValue: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  actions: {
    marginTop: Spacing.lg,
  },
  actionButton: {
    marginBottom: Spacing.md,
  },
  error: {
    color: Colors.error,
    padding: Spacing.lg,
  },
});
