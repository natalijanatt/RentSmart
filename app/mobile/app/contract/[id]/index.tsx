import React, { useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Alert,
  TouchableOpacity,
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
  const { contracts, selectedContract, setSelectedContract, isLoading, setIsLoading } = useContractsStore();

  const loadContractDetails = useCallback(async () => {
    if (!id) return;

    // Use contract from store if available (has correct user ids from dashboard)
    const storeContract = contracts.find(c => c.id === id);
    if (storeContract) {
      setSelectedContract(storeContract);
      return;
    }

    // Fallback to API
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
  }, [id, contracts, setSelectedContract, setIsLoading]);

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
  const isTenant = user?.id === contract.tenant_id;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
              <View key={room.id} style={styles.roomRow}>
                <Text style={[styles.summaryLabel, Typography.body]}>
                  {room.custom_name || room.room_type}
                </Text>
                {room.is_mandatory && (
                  <Badge label="Mandatory" variant="primary" size="small" />
                )}
              </View>
            ))}
          </Card>
        )}

        {/* Role-based Actions */}
        <View style={styles.actions}>
          {/* Tenant: accept pending contract */}
          {isTenant && contract.status === 'pending_acceptance' && (
            <Button
              label="Accept Contract"
              onPress={async () => {
                try {
                  const resp = await contractsService.acceptContract(contract.id);
                  setSelectedContract(resp.contract);
                } catch (e) {
                  Alert.alert('Error', 'Failed to accept contract');
                }
              }}
              fullWidth
              style={styles.actionButton}
            />
          )}

          {/* Landlord: start check-in */}
          {isLandlord && (contract.status === 'accepted' || contract.status === 'checkin_rejected') && (
            <Button
              label="Start Check-in"
              onPress={() => router.push({ pathname: '/contract/[id]/checkin', params: { id: contract.id } })}
              fullWidth
              style={styles.actionButton}
            />
          )}

          {/* Tenant: start check-out */}
          {isTenant && contract.status === 'active' && (
            <Button
              label="Start Check-out"
              onPress={() => router.push({ pathname: '/contract/[id]/checkout', params: { id: contract.id } })}
              fullWidth
              style={styles.actionButton}
            />
          )}

          {/* Settlement */}
          {(contract.status === 'settlement' || contract.status === 'completed') && (
            <Button
              label="View Settlement"
              onPress={() => router.push({ pathname: '/contract/[id]/settlement', params: { id: contract.id } })}
              fullWidth
              style={styles.actionButton}
            />
          )}

          <Button
            label="View Audit Trail"
            onPress={() => router.push({ pathname: '/contract/[id]/audit', params: { id: contract.id } })}
            variant="outline"
            fullWidth
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
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
  roomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  error: {
    color: Colors.error,
    padding: Spacing.lg,
  },
});
