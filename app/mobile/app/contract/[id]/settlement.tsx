import React, { useState, useCallback } from 'react';
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
import { analysisService } from '../../../services';
import {
  Button,
  Card,
  Badge,
  ConfirmModal,
  Divider,
  LoadingSpinner,
  ProgressBar,
} from '../../../components';
import { Colors, Spacing, Typography } from '../../../constants/theme';
import {
  formatCurrency,
  getSeverityLabel,
  getConditionLabel,
} from '../../../utils/formatters';
import type { Deduction } from '@rentsmart/contracts';

export default function SettlementReviewScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const { settlement, setSettlement, isLoading, setIsLoading } = useContractsStore();
  const [approving, setApproving] = useState(false);
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [expandedDeduction, setExpandedDeduction] = useState<string | null>(null);

  const loadSettlement = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const response = await analysisService.getSettlement(id as string);
      setSettlement(response.settlement);
    } catch (error) {
      console.error('Error loading settlement:', error);
      Alert.alert('Error', 'Failed to load settlement details');
    } finally {
      setIsLoading(false);
    }
  }, [id, setSettlement, setIsLoading]);

  useFocusEffect(
    useCallback(() => {
      loadSettlement();
    }, [loadSettlement])
  );

  const handleApproveSettlement = () => {
    if (!settlement) return;
    setApproveModalVisible(true);
  };

  const handleApproveConfirm = async () => {
    if (!settlement) return;
    setApproveModalVisible(false);
    setApproving(true);
    try {
      const response = await analysisService.approveSettlement(settlement.contract_id);
      setSettlement(response.settlement);
      if (response.is_fully_approved) {
        router.replace(`/contract/${settlement.contract_id}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to approve settlement');
    } finally {
      setApproving(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!settlement) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={[styles.error, Typography.body]}>Settlement not found</Text>
      </SafeAreaView>
    );
  }

  const alreadyApproved =
    settlement.landlord_approved_by === user?.id ||
    settlement.tenant_approved_by === user?.id;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Summary Card */}
        <Card style={styles.summaryCard}>
          <Text style={[styles.summaryTitle, Typography.heading3]}>
            Settlement Summary
          </Text>
          <Divider />

          <View style={styles.amountRow}>
            <View>
              <Text style={[styles.amountLabel, Typography.caption]}>
                Deposit
              </Text>
              <Text style={[styles.amountValue, Typography.heading4]}>
                {formatCurrency(settlement.deposit_amount_eur)}
              </Text>
            </View>
            <View style={styles.deductionBox}>
              <Text style={[styles.deductionLabel, Typography.caption]}>
                Deductions
              </Text>
              <Text style={[styles.deductionValue, Typography.heading4]}>
                {formatCurrency(settlement.total_deduction_eur)}
              </Text>
            </View>
          </View>

          <Divider />

          <View style={styles.finalAmounts}>
            <View style={styles.finalAmountRow}>
              <Text style={[styles.finalLabel, Typography.body]}>
                Tenant Receives
              </Text>
              <Text style={[styles.tenantAmount, Typography.heading4]}>
                {formatCurrency(settlement.tenant_receives_eur)}
              </Text>
            </View>
            <View style={styles.finalAmountRow}>
              <Text style={[styles.finalLabel, Typography.body]}>
                Landlord Receives
              </Text>
              <Text style={[styles.landlordAmount, Typography.heading4]}>
                {formatCurrency(settlement.landlord_receives_eur)}
              </Text>
            </View>
          </View>
        </Card>

        {/* Deductions */}
        {settlement.deductions.length > 0 && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>
              Deductions ({settlement.deductions.length})
            </Text>
            <Divider />

            {settlement.deductions.map((deduction: Deduction, index: number) => (
              <TouchableOpacity
                key={index}
                onPress={() =>
                  setExpandedDeduction(
                    expandedDeduction === String(index) ? null : String(index)
                  )
                }
              >
                <View style={styles.deductionItem}>
                  <View style={styles.deductionInfo}>
                    <Text style={[styles.deductionName, Typography.body]}>
                      {deduction.finding}
                    </Text>
                  </View>
                  <Text style={[styles.deductionAmount, Typography.heading4]}>
                    {formatCurrency(deduction.deduction_eur)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* Approval State */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Approvals</Text>
          <Divider />
          <View style={styles.approvalRow}>
            <Text style={[styles.approvalLabel, Typography.body]}>Landlord</Text>
            <Text style={[settlement.landlord_approved_at ? styles.approvalDone : styles.approvalPending, Typography.caption]}>
              {settlement.landlord_approved_at ? 'Approved' : 'Pending'}
            </Text>
          </View>
          <View style={styles.approvalRow}>
            <Text style={[styles.approvalLabel, Typography.body]}>Tenant</Text>
            <Text style={[settlement.tenant_approved_at ? styles.approvalDone : styles.approvalPending, Typography.caption]}>
              {settlement.tenant_approved_at ? 'Approved' : 'Pending'}
            </Text>
          </View>
          {settlement.finalized_at && (
            <View style={styles.approvalRow}>
              <Text style={[styles.approvalLabel, Typography.body]}>Finalized on-chain</Text>
              <Text style={[styles.approvalDone, Typography.caption]}>Yes</Text>
            </View>
          )}
        </Card>

        {/* Action Button */}
        {settlement.requires_manual_review && (
          <Card style={styles.warningCard}>
            <Text style={[styles.warningText, Typography.body]}>
              Manual review required. Contact support if settlement amounts are disputed.
            </Text>
          </Card>
        )}
        <Button
          label={alreadyApproved ? 'Waiting for other party' : 'Approve Settlement'}
          onPress={handleApproveSettlement}
          loading={approving}
          disabled={alreadyApproved || !!settlement.finalized_at}
          fullWidth
          style={styles.approveButton}
        />
      </ScrollView>

      <ConfirmModal
        visible={approveModalVisible}
        title="Approve Settlement"
        message="This action cannot be undone. Both parties must approve for the settlement to complete."
        confirmLabel="Approve"
        onConfirm={handleApproveConfirm}
        onCancel={() => setApproveModalVisible(false)}
      />
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
  summaryCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  summaryTitle: {
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
  },
  amountLabel: {
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  amountValue: {
    color: Colors.text,
    fontWeight: '700' as const,
  },
  deductionBox: {
    alignItems: 'flex-end',
  },
  deductionLabel: {
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  deductionValue: {
    color: Colors.error,
    fontWeight: '700' as const,
  },
  finalAmounts: {
    paddingVertical: Spacing.md,
  },
  finalAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  finalLabel: {
    color: Colors.textSecondary,
  },
  tenantAmount: {
    color: Colors.success,
    fontWeight: '600' as const,
  },
  landlordAmount: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  card: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  cardTitle: {
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  deductionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  deductionInfo: {
    flex: 1,
  },
  deductionName: {
    color: Colors.text,
  },
  deductionAmount: {
    color: Colors.error,
    fontWeight: '600' as const,
  },
  approveButton: {
    marginBottom: Spacing.lg,
  },
  error: {
    color: Colors.error,
    padding: Spacing.lg,
  },
  approvalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: Spacing.sm,
  },
  approvalLabel: {
    color: Colors.textSecondary,
  },
  approvalDone: {
    color: Colors.success,
    fontWeight: '600' as const,
  },
  approvalPending: {
    color: Colors.textTertiary,
  },
  warningCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  warningText: {
    color: Colors.error,
  },
});
