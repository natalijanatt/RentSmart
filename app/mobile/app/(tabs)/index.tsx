import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useContractsStore } from '../../store/contractsStore';
import { contractsService } from '../../services';
import { Button, Card, Badge, LoadingSpinner, EmptyState, Divider } from '../../components';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import {
  formatCurrency,
  formatDate,
  getContractStatusLabel,
} from '../../utils/formatters';

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [showInviteInput, setShowInviteInput] = useState(false);
  const { user, userRole } = useAuthStore();
  const { contracts, isLoading, setContracts, setSelectedContract } = useContractsStore();

  const isLandlord = userRole === 'landlord';
  const isTenant = userRole === 'tenant';

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

  const handleAcceptInvite = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Greška', 'Unesite kod pozivnice');
      return;
    }
    try {
      const response = await contractsService.getContractByInviteCode(inviteCode.trim());
      setSelectedContract(response.contract);
      router.push({ pathname: '/contract/[id]', params: { id: response.contract.id } });
      setInviteCode('');
      setShowInviteInput(false);
    } catch (err) {
      Alert.alert('Greška', 'Pozivnica nije pronađena');
    }
  };

  const getStatusBadgeVariant = (status: string): 'primary' | 'success' | 'warning' | 'error' | 'info' => {
    if (status === 'active' || status === 'accepted') return 'success';
    if (status.includes('rejected')) return 'error';
    if (status.includes('pending')) return 'warning';
    if (status === 'completed') return 'primary';
    if (status === 'settlement') return 'info';
    return 'info';
  };

  const getActionHint = (contract: any): string | null => {
    const isContractLandlord = user?.id === contract.landlord_id;
    const isContractTenant = user?.id === contract.tenant_id;

    if (isContractTenant && contract.status === 'pending_acceptance') return 'Prihvatite ugovor';
    if (isContractLandlord && (contract.status === 'accepted' || contract.status === 'checkin_rejected')) return 'Započnite check-in';
    if (isContractTenant && contract.status === 'checkin_pending_approval') return 'Pregledajte check-in slike';
    if (isContractTenant && contract.status === 'active') return 'Započnite check-out';
    if (isContractLandlord && contract.status === 'checkout_pending_approval') return 'Pregledajte check-out slike';
    if (contract.status === 'pending_analysis') return 'Analiza u toku...';
    if (contract.status === 'settlement') return 'Odobrite poravnanje';
    return null;
  };

  const contractGroups = useMemo(() => {
    const actionRequired: any[] = [];
    const active: any[] = [];
    const completed: any[] = [];

    contracts.forEach((contract) => {
      const hint = getActionHint(contract);
      if (contract.status === 'completed' || contract.status === 'cancelled') {
        completed.push(contract);
      } else if (hint) {
        actionRequired.push({ ...contract, _actionHint: hint });
      } else {
        active.push(contract);
      }
    });

    return { actionRequired, active, completed };
  }, [contracts, user]);

  const renderContractItem = (contract: any) => {
    const actionHint = contract._actionHint || getActionHint(contract);

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
              <Text style={[styles.detailLabel, Typography.caption]}>Mesečna kirija</Text>
              <Text style={[styles.detailValue, Typography.body]}>
                {formatCurrency(contract.rent_monthly_eur)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, Typography.caption]}>Depozit</Text>
              <Text style={[styles.detailValue, Typography.body]}>
                {formatCurrency(contract.deposit_amount_eur)}
              </Text>
            </View>
          </View>

          {actionHint && (
            <>
              <Divider />
              <View style={styles.actionHintContainer}>
                <Text style={[styles.actionHintText, Typography.bodySmall]}>
                  → {actionHint}
                </Text>
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

  const hasContracts = contracts.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.greeting, Typography.heading3]}>
            Dobrodošli!
          </Text>
          <View style={styles.headerMeta}>
            <Text style={[styles.username, Typography.body]}>
              {user?.display_name || 'Korisnik'}
            </Text>
            <Badge
              label={isLandlord ? 'Stanodavac' : 'Zakupac'}
              variant={isLandlord ? 'info' : 'primary'}
              size="small"
            />
          </View>
        </View>
        {isLandlord && (
          <Button
            label="Novi ugovor"
            onPress={handleNewContract}
            size="small"
          />
        )}
      </View>

      {/* Tenant: Accept invite section */}
      {isTenant && (
        <View style={styles.inviteSection}>
          {!showInviteInput ? (
            <Button
              label="Prihvati pozivnicu"
              onPress={() => setShowInviteInput(true)}
              variant="outline"
              fullWidth
            />
          ) : (
            <Card style={styles.inviteCard}>
              <Text style={[styles.inviteLabel, Typography.bodySemibold]}>Unesite kod pozivnice</Text>
              <View style={styles.inviteInputRow}>
                <TextInput
                  style={styles.inviteInput}
                  placeholder="ABC123DEF"
                  placeholderTextColor={Colors.textTertiary}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  autoCapitalize="characters"
                />
                <Button label="Prihvati" onPress={handleAcceptInvite} size="small" />
              </View>
              <TouchableOpacity onPress={() => { setShowInviteInput(false); setInviteCode(''); }}>
                <Text style={[styles.cancelLink, Typography.bodySmall]}>Otkaži</Text>
              </TouchableOpacity>
            </Card>
          )}
        </View>
      )}

      {!hasContracts ? (
        <EmptyState
          title={isLandlord ? 'Nemate ugovore' : 'Nemate ugovore'}
          description={isLandlord
            ? 'Kreirajte novi ugovor da biste započeli'
            : 'Prihvatite pozivnicu od stanodavca da biste započeli'
          }
        />
      ) : (
        <FlatList
          data={[
            ...contractGroups.actionRequired,
            ...contractGroups.active,
            ...contractGroups.completed,
          ]}
          renderItem={({ item }) => renderContractItem(item)}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            contractGroups.actionRequired.length > 0 ? (
              <Text style={[styles.sectionHeader, Typography.bodySemibold]}>
                Potrebna akcija ({contractGroups.actionRequired.length})
              </Text>
            ) : null
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
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  username: {
    color: Colors.textSecondary,
  },
  inviteSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  inviteCard: {
    padding: Spacing.md,
  },
  inviteLabel: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  inviteInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  inviteInput: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: 16,
    letterSpacing: 2,
  },
  cancelLink: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  sectionHeader: {
    color: Colors.primary,
    marginBottom: Spacing.md,
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
  actionHintContainer: {
    paddingTop: Spacing.sm,
  },
  actionHintText: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
});
