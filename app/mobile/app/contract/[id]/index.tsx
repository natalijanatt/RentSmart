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
import { Colors, Spacing, Typography, BorderRadius } from '../../../constants/theme';
import {
  formatCurrency,
  formatDate,
  getContractStatusLabel,
  getRoomTypeLabel,
} from '../../../utils/formatters';

export default function ContractDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const { contracts, selectedContract, setSelectedContract, isLoading, setIsLoading } = useContractsStore();

  const loadContractDetails = useCallback(async () => {
    if (!id) return;

    const storeContract = contracts.find(c => c.id === id);
    if (storeContract) {
      setSelectedContract(storeContract);
      return;
    }

    setIsLoading(true);
    try {
      const response = await contractsService.getContract(id as string);
      setSelectedContract(response.contract);
    } catch (error) {
      console.error('Error loading contract:', error);
      Alert.alert('Greška', 'Učitavanje detalja ugovora nije uspelo');
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
        <Text style={[styles.error, Typography.body]}>Ugovor nije pronađen</Text>
      </SafeAreaView>
    );
  }

  const contract = selectedContract;
  const isLandlord = user?.id === contract.landlord_id;
  const isTenant = user?.id === contract.tenant_id;

  const handleShareInvite = async () => {
    try {
      await Share.share({
        message: `Pozivam vas da prihvatite ugovor o zakupu na RentSmart.\n\nNekretnina: ${contract.property_address}\nKod pozivnice: ${contract.invite_code}\n\nOtvorite aplikaciju i unesite kod.`,
      });
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  const handleCancelContract = () => {
    Alert.alert(
      'Otkaži ugovor',
      'Da li ste sigurni da želite da otkažete ovaj ugovor?',
      [
        { text: 'Ne', style: 'cancel' },
        {
          text: 'Da, otkaži',
          style: 'destructive',
          onPress: async () => {
            try {
              const resp = await contractsService.cancelContract(contract.id);
              setSelectedContract(resp.contract);
            } catch (e) {
              Alert.alert('Greška', 'Otkazivanje ugovora nije uspelo');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    if (status === 'active') return Colors.success;
    if (status === 'completed') return Colors.primary;
    if (status.includes('rejected')) return Colors.error;
    if (status === 'settlement') return Colors.info;
    if (status.includes('pending')) return Colors.warning;
    return Colors.textSecondary;
  };

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
          <View style={styles.statusRow}>
            <Badge
              label={getContractStatusLabel(contract.status)}
              variant={contract.status === 'active' ? 'success' : 'info'}
            />
            {isLandlord && <Badge label="Stanodavac" variant="info" size="small" />}
            {isTenant && <Badge label="Zakupac" variant="primary" size="small" />}
          </View>
          <Text style={[styles.period, Typography.body]}>
            {formatDate(contract.start_date)} - {formatDate(contract.end_date)}
          </Text>
        </Card>

        {/* Invite Code Section — for landlord on draft/pending contracts */}
        {isLandlord && contract.invite_code && (contract.status === 'draft' || contract.status === 'pending_acceptance') && (
          <Card style={styles.inviteCard}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Kod pozivnice</Text>
            <Divider />
            <View style={styles.inviteCodeContainer}>
              <Text style={[styles.inviteCode, Typography.heading3]}>
                {contract.invite_code}
              </Text>
            </View>
            <Text style={[styles.inviteHint, Typography.bodySmall]}>
              Podelite ovaj kod sa zakupcem da bi prihvatio ugovor
            </Text>
            <Button
              label="Podeli pozivnicu"
              onPress={handleShareInvite}
              variant="outline"
              fullWidth
              style={styles.shareButton}
            />
          </Card>
        )}

        {/* Financial Summary */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Finansijski pregled</Text>
          <Divider />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, Typography.body]}>Mesečna kirija</Text>
            <Text style={[styles.summaryValue, Typography.heading4]}>
              {formatCurrency(contract.rent_monthly_eur)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, Typography.body]}>Iznos depozita</Text>
            <Text style={[styles.summaryValue, Typography.heading4]}>
              {formatCurrency(contract.deposit_amount_eur)}
            </Text>
          </View>
        </Card>

        {/* Rooms */}
        {contract.rooms && contract.rooms.length > 0 && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Prostorije ({contract.rooms.length})</Text>
            <Divider />
            {contract.rooms.map((room) => (
              <View key={room.id} style={styles.roomRow}>
                <Text style={[styles.summaryLabel, Typography.body]}>
                  {room.custom_name || getRoomTypeLabel(room.room_type)}
                </Text>
                {room.is_mandatory && (
                  <Badge label="Obavezno" variant="primary" size="small" />
                )}
              </View>
            ))}
          </Card>
        )}

        {/* Notes */}
        {contract.notes && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Napomene</Text>
            <Divider />
            <Text style={[styles.notesText, Typography.body]}>{contract.notes}</Text>
          </Card>
        )}

        {/* Rejection Comment */}
        {contract.rejection_comment && (
          <Card style={StyleSheet.flatten([styles.card, styles.rejectionCard])}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Razlog odbijanja</Text>
            <Divider />
            <Text style={[styles.rejectionText, Typography.body]}>{contract.rejection_comment}</Text>
          </Card>
        )}

        {/* Role-based Actions */}
        <View style={styles.actions}>
          {/* Tenant: accept pending contract */}
          {isTenant && contract.status === 'pending_acceptance' && (
            <Button
              label="Prihvati ugovor"
              onPress={async () => {
                try {
                  const resp = await contractsService.acceptContract(contract.id);
                  setSelectedContract(resp.contract);
                  Alert.alert('Uspeh', 'Ugovor je prihvaćen');
                } catch (e) {
                  Alert.alert('Greška', 'Prihvatanje ugovora nije uspelo');
                }
              }}
              fullWidth
              style={styles.actionButton}
            />
          )}

          {/* Landlord: start check-in */}
          {isLandlord && (contract.status === 'accepted' || contract.status === 'checkin_rejected') && (
            <Button
              label="Započni check-in"
              onPress={() => router.push({ pathname: '/contract/[id]/checkin', params: { id: contract.id } })}
              fullWidth
              style={styles.actionButton}
            />
          )}

          {/* Tenant: review check-in images (approve/reject) */}
          {isTenant && contract.status === 'checkin_pending_approval' && (
            <Button
              label="Pregledaj check-in slike"
              onPress={() => router.push({
                pathname: '/contract/[id]/checkin-review',
                params: { id: contract.id, contractId: contract.id, mode: 'review' },
              })}
              fullWidth
              style={styles.actionButton}
            />
          )}

          {/* Tenant: start check-out */}
          {isTenant && contract.status === 'active' && (
            <Button
              label="Započni check-out"
              onPress={() => router.push({ pathname: '/contract/[id]/checkout', params: { id: contract.id } })}
              fullWidth
              style={styles.actionButton}
            />
          )}

          {/* Landlord: review check-out images (approve/reject) */}
          {isLandlord && contract.status === 'checkout_pending_approval' && (
            <Button
              label="Pregledaj check-out slike"
              onPress={() => router.push({
                pathname: '/contract/[id]/checkout-review',
                params: { id: contract.id, contractId: contract.id, mode: 'review' },
              })}
              fullWidth
              style={styles.actionButton}
            />
          )}

          {/* Pending analysis — show loading state */}
          {contract.status === 'pending_analysis' && (
            <Card style={styles.analysisCard}>
              <Text style={[styles.analysisText, Typography.bodySemibold]}>
                Analiza u toku...
              </Text>
              <Text style={[styles.analysisSubtext, Typography.bodySmall]}>
                AI analizira slike check-in i check-out. Ovo može potrajati nekoliko minuta.
              </Text>
            </Card>
          )}

          {/* Settlement */}
          {(contract.status === 'settlement' || contract.status === 'completed') && (
            <Button
              label={contract.status === 'settlement' ? 'Pregledaj poravnanje' : 'Pogledaj poravnanje'}
              onPress={() => router.push({ pathname: '/contract/[id]/settlement', params: { id: contract.id } })}
              fullWidth
              style={styles.actionButton}
            />
          )}

          {/* Audit trail — always visible */}
          <Button
            label="Istorija promena"
            onPress={() => router.push({ pathname: '/contract/[id]/audit', params: { id: contract.id } })}
            variant="outline"
            fullWidth
          />

          {/* Cancel — only for early statuses */}
          {(contract.status === 'draft' || contract.status === 'pending_acceptance' || contract.status === 'accepted') && (
            <Button
              label="Otkaži ugovor"
              onPress={handleCancelContract}
              variant="danger"
              fullWidth
              style={styles.cancelButton}
            />
          )}
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
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  period: {
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  inviteCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  inviteCodeContainer: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  inviteCode: {
    color: Colors.primary,
    letterSpacing: 4,
  },
  inviteHint: {
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  shareButton: {
    marginTop: Spacing.sm,
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
  roomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  notesText: {
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  rejectionCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
  },
  rejectionText: {
    color: Colors.error,
  },
  analysisCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.backgroundSecondary,
    borderLeftWidth: 4,
    borderLeftColor: Colors.info,
    marginBottom: Spacing.md,
  },
  analysisText: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  analysisSubtext: {
    color: Colors.textSecondary,
  },
  actions: {
    marginTop: Spacing.lg,
  },
  actionButton: {
    marginBottom: Spacing.md,
  },
  cancelButton: {
    marginTop: Spacing.md,
  },
  error: {
    color: Colors.error,
    padding: Spacing.lg,
  },
});
