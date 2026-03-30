import React, { useState, useCallback, useMemo } from 'react';
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

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuthStore();
  const { contracts, isLoading, setContracts, setSelectedContract } = useContractsStore();

  const loadContracts = useCallback(async () => {
    if (!user) return;
    try {
      const response = await contractsService.getContracts(user.id);
      setContracts(response.contracts);
    } catch (error) {
      console.error('Error loading contracts:', error);
    }
  }, [user, setContracts]);

  useFocusEffect(
    useCallback(() => {
      loadContracts();
    }, [loadContracts])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadContracts();
    setRefreshing(false);
  }, [loadContracts]);

  const handleContractPress = (contract: any) => {
    setSelectedContract(contract);
    router.push({ pathname: '/contract/[id]', params: { id: contract.id } });
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
      } else if (contract.status === 'pending_acceptance' || contract.status === 'draft') {
        pending.push(contract);
      } else {
        active.push(contract);
      }
    });

    return { active, pending };
  }, [contracts]);

  const renderContractItem = (contract: any) => (
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
      </Card>
    </TouchableOpacity>
  );

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
});
