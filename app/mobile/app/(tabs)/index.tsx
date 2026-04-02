import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useContractsStore } from '../../store/contractsStore';
import { contractsService } from '../../services';
import { Button, Card, Badge, LoadingSpinner, EmptyState, Divider } from '../../components';
import { Colors, Spacing, Typography } from '../../constants/theme';
import {
  formatCurrency,
  formatDate,
  getContractStatusLabel,
} from '../../utils/formatters';

type ActionIndicator = {
  type: 'action' | 'waiting';
  label: string;
} | null;

function getActionIndicator(contract: any, userId: string): ActionIndicator {
  const isLandlord = userId === contract.landlord_id;
  const { status } = contract;

  if (isLandlord) {
    switch (status) {
      case 'pending_acceptance':
        return { type: 'waiting', label: 'Waiting for tenant to accept' };
      case 'accepted':
        return { type: 'action', label: 'Start check-in' };
      case 'checkin_in_progress':
        return { type: 'action', label: 'Continue check-in' };
      case 'checkin_pending_approval':
        return { type: 'waiting', label: 'Waiting for tenant to review check-in' };
      case 'checkin_rejected':
        return { type: 'action', label: 'Redo check-in — tenant rejected' };
      case 'active':
        return { type: 'waiting', label: 'Waiting for tenant to start check-out' };
      case 'checkout_in_progress':
        return { type: 'waiting', label: 'Tenant is doing check-out' };
      case 'checkout_pending_approval':
        return { type: 'action', label: 'Review check-out photos' };
      case 'checkout_rejected':
        return { type: 'waiting', label: 'Tenant needs to redo check-out' };
      case 'pending_analysis':
        return { type: 'waiting', label: 'AI is analyzing images...' };
      case 'settlement':
        return { type: 'action', label: 'Approve settlement' };
      default:
        return null;
    }
  } else {
    switch (status) {
      case 'pending_acceptance':
        return { type: 'action', label: 'Accept contract' };
      case 'accepted':
        return { type: 'waiting', label: 'Waiting for landlord to start check-in' };
      case 'checkin_in_progress':
        return { type: 'waiting', label: 'Landlord is doing check-in' };
      case 'checkin_pending_approval':
        return { type: 'action', label: 'Review check-in photos' };
      case 'checkin_rejected':
        return { type: 'waiting', label: 'Landlord is redoing check-in' };
      case 'active':
        return { type: 'action', label: 'Start check-out' };
      case 'checkout_in_progress':
        return { type: 'action', label: 'Continue check-out' };
      case 'checkout_pending_approval':
        return { type: 'waiting', label: 'Waiting for landlord to review check-out' };
      case 'checkout_rejected':
        return { type: 'action', label: 'Redo check-out — landlord rejected' };
      case 'pending_analysis':
        return { type: 'waiting', label: 'AI is analyzing images...' };
      case 'settlement':
        return { type: 'action', label: 'Approve settlement' };
      default:
        return null;
    }
  }
}

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuthStore();
  const { contracts, isLoading, setContracts, setSelectedContract } = useContractsStore();
  const isFocused = useRef(false);
  const isFetching = useRef(false);

  const loadContracts = useCallback(async () => {
    if (!user || isFetching.current) return;
    isFetching.current = true;
    try {
      const response = await contractsService.getContracts();
      setContracts(response.contracts);
    } catch (error) {
      console.error('Error loading contracts:', error);
    } finally {
      isFetching.current = false;
    }
  }, [user, setContracts]);

  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      loadContracts();

      const interval = setInterval(() => {
        if (isFocused.current) {
          loadContracts();
        }
      }, 1000);

      return () => {
        isFocused.current = false;
        clearInterval(interval);
      };
    }, [loadContracts])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadContracts();
    setRefreshing(false);
  }, [loadContracts]);

  const handleContractPress = (contract: any) => {
    setSelectedContract(contract);
    router.push(`/contract/${contract.id}`);
  };

  const handleNewContract = () => {
    router.push('/contract/property');
  };

  const getStatusBadgeVariant = (status: string): 'primary' | 'success' | 'warning' | 'error' | 'info' => {
    if (status === 'active' || status === 'accepted') return 'success';
    if (status.includes('rejected')) return 'error';
    if (status.includes('pending')) return 'warning';
    return 'info';
  };

  const contractGroups = useMemo(() => {
    const active: any[] = [];
    const pending: any[] = [];

    contracts.forEach((contract) => {
      if (contract.status === 'completed' || contract.status === 'cancelled') {
        // archived
      } else if (contract.status === 'pending_acceptance') {
        pending.push(contract);
      } else {
        active.push(contract);
      }
    });

    return { active, pending };
  }, [contracts]);

  const actionCount = useMemo(() => {
    if (!user) return 0;
    return contracts.filter((c) => {
      const indicator = getActionIndicator(c, user.id);
      return indicator?.type === 'action';
    }).length;
  }, [contracts, user]);

  const renderContractItem = (contract: any) => {
    const indicator = user ? getActionIndicator(contract, user.id) : null;

    return (
      <TouchableOpacity
        onPress={() => handleContractPress(contract)}
        key={contract.id}
        style={styles.contractItemContainer}
      >
        <Card style={styles.contractCard}>
          <View style={styles.contractHeader}>
            <View style={styles.contractInfo}>
              <Text style={[styles.address, Typography.body]} numberOfLines={1}>
                {contract.property_address}
              </Text>
              <Text style={[styles.period, Typography.caption]}>
                {formatDate(contract.start_date)} - {formatDate(contract.end_date)}
              </Text>
            </View>
            <Badge
              label={getContractStatusLabel(contract.status)}
              variant={getStatusBadgeVariant(contract.status)}
              size="small"
            />
          </View>

          <Divider />

          <View style={styles.contractDetails}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, Typography.caption]}>
                Rent Monthly
              </Text>
              <Text style={[styles.detailValue, Typography.body]}>
                {formatCurrency(contract.rent_monthly_eur)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, Typography.caption]}>
                Deposit
              </Text>
              <Text style={[styles.detailValue, Typography.body]}>
                {formatCurrency(contract.deposit_amount_eur)}
              </Text>
            </View>
          </View>

          {indicator && (
            <>
              <Divider />
              <View style={[
                styles.indicatorRow,
                indicator.type === 'action' ? styles.indicatorAction : styles.indicatorWaiting,
              ]}>
                <Text style={[
                  styles.indicatorDot,
                  { color: indicator.type === 'action' ? Colors.warning : Colors.textTertiary },
                ]}>
                  {indicator.type === 'action' ? '●' : '○'}
                </Text>
                <Text style={[
                  styles.indicatorLabel,
                  Typography.caption,
                  { color: indicator.type === 'action' ? Colors.warning : Colors.textTertiary },
                ]}>
                  {indicator.label}
                </Text>
                {indicator.type === 'action' && (
                  <Text style={[styles.indicatorArrow, { color: Colors.warning }]}>→</Text>
                )}
              </View>
            </>
          )}
        </Card>
      </TouchableOpacity>
    );
  };

  if (isLoading && contracts.length === 0) {
    return <LoadingSpinner />;
  }

  const hasContracts = Object.values(contractGroups).some((group) => group.length > 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.greeting, Typography.heading3]}>
            Welcome back!
          </Text>
          <Text style={[styles.username, Typography.body]}>
            {user?.display_name || 'User'}
          </Text>
        </View>
        <Button
          label="Novi ugovor"
          onPress={handleNewContract}
          size="small"
        />
      </View>

      {actionCount > 0 && (
        <View style={styles.actionBanner}>
          <Text style={[styles.actionBannerDot]}>●</Text>
          <Text style={[styles.actionBannerText, Typography.bodySmall]}>
            {actionCount === 1
              ? '1 contract needs your attention'
              : `${actionCount} contracts need your attention`}
          </Text>
        </View>
      )}

      {!hasContracts ? (
        <EmptyState
          title="No Contracts Yet"
          description="Create a new contract to get started"
        />
      ) : (
        <FlatList
          data={[
            ...contractGroups.active.map((c) => ({ ...c, section: 'active' })),
            ...contractGroups.pending.map((c) => ({ ...c, section: 'pending' })),
          ]}
          renderItem={({ item }) => renderContractItem(item)}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    color: Colors.text,
    fontWeight: '700' as const,
    marginBottom: Spacing.xs,
  },
  username: {
    color: Colors.textSecondary,
  },
  actionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  actionBannerDot: {
    color: Colors.warning,
    fontSize: 8,
  },
  actionBannerText: {
    color: Colors.warning,
    fontWeight: '600' as const,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  contractItemContainer: {
    marginBottom: Spacing.md,
  },
  contractCard: {
    padding: Spacing.md,
  },
  contractHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  contractInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  address: {
    color: Colors.text,
    fontWeight: '600' as const,
    marginBottom: Spacing.xs,
  },
  period: {
    color: Colors.textSecondary,
  },
  contractDetails: {
    marginTop: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  detailLabel: {
    color: Colors.textSecondary,
  },
  detailValue: {
    color: Colors.text,
    fontWeight: '600' as const,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
  },
  indicatorAction: {
    // amber tint via text color only
  },
  indicatorWaiting: {
    // muted via text color only
  },
  indicatorDot: {
    fontSize: 8,
  },
  indicatorLabel: {
    flex: 1,
    fontWeight: '500' as const,
  },
  indicatorArrow: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
