import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Alert,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { useContractsStore } from '../../../store/contractsStore';
import { analysisService } from '../../../services';
import {
  Button,
  Card,
  Badge,
  Divider,
  LoadingSpinner,
  ProgressBar,
} from '../../../components';
import { Colors, Spacing, Typography, BorderRadius } from '../../../constants/theme';
import {
  formatCurrency,
  getSeverityLabel,
  getSeverityColor,
} from '../../../utils/formatters';

export default function SettlementReviewScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const { contracts, settlement, setSettlement, isLoading, setIsLoading } = useContractsStore();
  const [approving, setApproving] = useState(false);
  const [expandedDeduction, setExpandedDeduction] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const contract = contracts.find(c => c.id === id);
  const isLandlord = user?.id === contract?.landlord_id;
  const isTenant = user?.id === contract?.tenant_id;
  const userRole = isLandlord ? 'landlord' : 'tenant';

  const loadSettlement = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const response = await analysisService.getSettlement(id as string);
      setSettlement(response.settlement);
    } catch (error) {
      console.error('Error loading settlement:', error);
      Alert.alert('Greška', 'Učitavanje poravnanja nije uspelo');
    } finally {
      setIsLoading(false);
    }
  }, [id, setSettlement, setIsLoading]);

  useFocusEffect(
    useCallback(() => {
      loadSettlement();
    }, [loadSettlement])
  );

  const currentUserApproved = settlement
    ? (isLandlord && settlement.landlord_approved_at) || (isTenant && settlement.tenant_approved_at)
    : false;

  const otherSideApproved = settlement
    ? (isLandlord && settlement.tenant_approved_at) || (isTenant && settlement.landlord_approved_at)
    : false;

  const isFullyApproved = settlement?.landlord_approved_at && settlement?.tenant_approved_at;

  const handleApproveSettlement = async () => {
    if (!settlement) return;

    Alert.alert(
      'Odobrenje poravnanja',
      `Da li ste sigurni da želite da odobrite ovo poravnanje?\n\n${isLandlord ? 'Stanodavac' : 'Zakupac'} dobija: ${formatCurrency(isLandlord ? settlement.landlord_receives_eur : settlement.tenant_receives_eur)}`,
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Odobri',
          onPress: async () => {
            setApproving(true);
            try {
              const response = await analysisService.approveSettlement(
                settlement.contract_id,
                userRole
              );
              setSettlement(response.settlement);
              if (response.is_fully_approved) {
                Alert.alert('Završeno', 'Obe strane su odobrile poravnanje. Ugovor je završen.');
              } else {
                Alert.alert('Uspeh', 'Vaše odobrenje je zabeleženo. Čekanje na drugu stranu.');
              }
            } catch (error) {
              Alert.alert('Greška', 'Odobravanje poravnanja nije uspelo');
            } finally {
              setApproving(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!settlement) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={[styles.error, Typography.body]}>Poravnanje nije pronađeno</Text>
          <Button label="Nazad" variant="outline" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const deductionPercent = settlement.deposit_amount_eur > 0
    ? (settlement.total_deduction_eur / settlement.deposit_amount_eur) * 100
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Manual Review Warning */}
        {settlement.requires_manual_review && (
          <Card style={styles.warningCard}>
            <Text style={[styles.warningTitle, Typography.bodySemibold]}>
              Potreban ručni pregled
            </Text>
            <Text style={[styles.warningText, Typography.bodySmall]}>
              Neka oštećenja imaju nizak nivo pouzdanosti AI analize. Preporučujemo detaljniji pregled pre odobravanja.
            </Text>
          </Card>
        )}

        {/* Summary Card */}
        <Card style={styles.summaryCard}>
          <Text style={[styles.summaryTitle, Typography.heading3]}>
            Pregled poravnanja
          </Text>
          <Divider style={styles.summaryDivider} />

          <View style={styles.amountRow}>
            <View>
              <Text style={[styles.amountLabel, Typography.caption]}>Depozit</Text>
              <Text style={[styles.amountValue, Typography.heading4]}>
                {formatCurrency(settlement.deposit_amount_eur)}
              </Text>
            </View>
            <View style={styles.deductionBox}>
              <Text style={[styles.deductionLabel, Typography.caption]}>Odbici</Text>
              <Text style={[styles.deductionValue, Typography.heading4]}>
                -{formatCurrency(settlement.total_deduction_eur)}
              </Text>
            </View>
          </View>

          {/* Deduction progress bar */}
          <View style={styles.progressSection}>
            <ProgressBar progress={deductionPercent} style={styles.deductionProgress} />
            <Text style={[styles.progressLabel, Typography.captionSmall]}>
              {deductionPercent.toFixed(1)}% depozita oduzeto
            </Text>
          </View>

          <Divider style={styles.summaryDivider} />

          <View style={styles.finalAmounts}>
            <View style={styles.finalAmountRow}>
              <Text style={[styles.finalLabel, Typography.body]}>Zakupac dobija</Text>
              <Text style={[styles.tenantAmount, Typography.heading4]}>
                {formatCurrency(settlement.tenant_receives_eur)}
              </Text>
            </View>
            <View style={styles.finalAmountRow}>
              <Text style={[styles.finalLabel, Typography.body]}>Stanodavac dobija</Text>
              <Text style={[styles.landlordAmount, Typography.heading4]}>
                {formatCurrency(settlement.landlord_receives_eur)}
              </Text>
            </View>
          </View>
        </Card>

        {/* Settlement Type */}
        <Card style={styles.card}>
          <View style={styles.typeRow}>
            <Badge
              label={settlement.settlement_type === 'automatic' ? 'Automatski' : 'Ručni pregled'}
              variant={settlement.settlement_type === 'automatic' ? 'success' : 'warning'}
              size="small"
            />
          </View>
          {settlement.explanation && (
            <Text style={[styles.explanationText, Typography.bodySmall]}>
              {settlement.explanation}
            </Text>
          )}
        </Card>

        {/* Deductions — Expandable Cards */}
        {settlement.deductions.length > 0 && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>
              Odbici ({settlement.deductions.length})
            </Text>
            <Divider />

            {settlement.deductions.map((deduction, index) => {
              const isExpanded = expandedDeduction === String(index);
              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => setExpandedDeduction(isExpanded ? null : String(index))}
                  activeOpacity={0.7}
                >
                  <View style={[styles.deductionItem, isExpanded && styles.deductionItemExpanded]}>
                    <View style={styles.deductionHeader}>
                      <View style={styles.deductionInfo}>
                        <View style={styles.deductionTitleRow}>
                          <Text style={[styles.deductionName, Typography.bodySemibold]}>
                            {deduction.finding}
                          </Text>
                          <Badge
                            label={getSeverityLabel(deduction.severity)}
                            variant={deduction.severity === 'major' ? 'error' : deduction.severity === 'medium' ? 'warning' : 'info'}
                            size="small"
                          />
                        </View>
                        <Text style={[styles.deductionDesc, Typography.bodySmall]}>
                          {deduction.description}
                        </Text>
                      </View>
                      <Text style={[styles.deductionAmount, Typography.heading4]}>
                        -{formatCurrency(deduction.deduction_eur)}
                      </Text>
                    </View>

                    {isExpanded && (
                      <View style={styles.deductionDetails}>
                        <Divider />
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, Typography.caption]}>Procenat depozita</Text>
                          <Text style={[styles.detailValue, Typography.body]}>
                            {deduction.deduction_percent.toFixed(1)}%
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, Typography.caption]}>Pouzdanost AI</Text>
                          <View style={styles.confidenceRow}>
                            <ProgressBar
                              progress={deduction.confidence * 100}
                              style={styles.confidenceBar}
                            />
                            <Text style={[styles.detailValue, Typography.caption]}>
                              {(deduction.confidence * 100).toFixed(0)}%
                            </Text>
                          </View>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, Typography.caption]}>Težina</Text>
                          <View style={[styles.severityIndicator, { backgroundColor: getSeverityColor(deduction.severity) }]}>
                            <Text style={styles.severityText}>{getSeverityLabel(deduction.severity)}</Text>
                          </View>
                        </View>
                        {deduction.reason && (
                          <View style={styles.reasonContainer}>
                            <Text style={[styles.detailLabel, Typography.caption]}>Obrazloženje:</Text>
                            <Text style={[styles.reasonText, Typography.bodySmall]}>
                              {deduction.reason}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    <Text style={[styles.expandHint, Typography.captionSmall]}>
                      {isExpanded ? '▲ Sakrij detalje' : '▼ Prikaži detalje'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </Card>
        )}

        {/* Skipped Findings */}
        {settlement.skipped_findings && settlement.skipped_findings.length > 0 && (
          <Card style={styles.card}>
            <TouchableOpacity onPress={() => setShowSkipped(!showSkipped)}>
              <View style={styles.skippedHeader}>
                <Text style={[styles.cardTitle, Typography.heading4]}>
                  Preskočeno ({settlement.skipped_findings.length})
                </Text>
                <Text style={[styles.expandHint, Typography.captionSmall]}>
                  {showSkipped ? '▲' : '▼'}
                </Text>
              </View>
            </TouchableOpacity>
            <Text style={[styles.skippedSubtitle, Typography.bodySmall]}>
              Ove stavke su prepoznate ali nisu oduzete (normalna istrošenost)
            </Text>

            {showSkipped && (
              <>
                <Divider />
                {settlement.skipped_findings.map((item, index) => (
                  <View key={index} style={styles.skippedItem}>
                    <Badge label="Preskočeno" variant="success" size="small" />
                    <Text style={[styles.skippedName, Typography.body]}>{item.finding}</Text>
                    <Text style={[styles.skippedReason, Typography.bodySmall]}>{item.reason}</Text>
                  </View>
                ))}
              </>
            )}
          </Card>
        )}

        {/* Approval Status */}
        <Card style={styles.approvalCard}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Status odobrenja</Text>
          <Divider />

          <View style={styles.approvalRow}>
            <Text style={[styles.approvalLabel, Typography.body]}>Stanodavac</Text>
            {settlement.landlord_approved_at ? (
              <Badge label="Odobreno ✓" variant="success" size="small" />
            ) : (
              <Badge label="Čeka" variant="warning" size="small" />
            )}
          </View>
          <View style={styles.approvalRow}>
            <Text style={[styles.approvalLabel, Typography.body]}>Zakupac</Text>
            {settlement.tenant_approved_at ? (
              <Badge label="Odobreno ✓" variant="success" size="small" />
            ) : (
              <Badge label="Čeka" variant="warning" size="small" />
            )}
          </View>

          {isFullyApproved && (
            <View style={styles.finalizedBanner}>
              <Text style={[styles.finalizedText, Typography.bodySemibold]}>
                Poravnanje je završeno
              </Text>
              {settlement.finalized_at && (
                <Text style={[styles.finalizedDate, Typography.captionSmall]}>
                  {new Date(settlement.finalized_at).toLocaleString()}
                </Text>
              )}
            </View>
          )}
        </Card>

        {/* Action Button */}
        {!isFullyApproved && (
          <View style={styles.actionSection}>
            {currentUserApproved ? (
              <Card style={styles.waitingCard}>
                <Text style={[styles.waitingText, Typography.bodySemibold]}>
                  Vaše odobrenje je zabeleženo
                </Text>
                <Text style={[styles.waitingSubtext, Typography.bodySmall]}>
                  Čekanje na {isLandlord ? 'zakupca' : 'stanodavca'} da odobri poravnanje.
                </Text>
              </Card>
            ) : (
              <Button
                label="Odobri poravnanje"
                onPress={handleApproveSettlement}
                loading={approving}
                fullWidth
              />
            )}
          </View>
        )}

        <Button
          label="Nazad na ugovor"
          variant="outline"
          onPress={() => router.back()}
          fullWidth
          style={styles.backButton}
        />
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
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  warningCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.backgroundSecondary,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  warningTitle: {
    color: Colors.warning,
    marginBottom: Spacing.sm,
  },
  warningText: {
    color: Colors.textSecondary,
  },
  summaryCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.primaryLight,
  },
  summaryTitle: {
    color: Colors.surface,
    marginBottom: Spacing.md,
  },
  summaryDivider: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
  },
  amountLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: Spacing.sm,
  },
  amountValue: {
    color: Colors.surface,
    fontWeight: '700' as const,
  },
  deductionBox: {
    alignItems: 'flex-end',
  },
  deductionLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: Spacing.sm,
  },
  deductionValue: {
    color: Colors.error,
  },
  progressSection: {
    marginBottom: Spacing.md,
  },
  deductionProgress: {
    height: 6,
    marginBottom: Spacing.xs,
  },
  progressLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  finalAmounts: {
    paddingVertical: Spacing.md,
  },
  finalAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  finalLabel: {
    color: Colors.surface,
  },
  tenantAmount: {
    color: Colors.success,
    fontWeight: '700' as const,
  },
  landlordAmount: {
    color: Colors.warning,
    fontWeight: '700' as const,
  },
  card: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  cardTitle: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  typeRow: {
    marginBottom: Spacing.sm,
  },
  explanationText: {
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  deductionItem: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  deductionItemExpanded: {
    backgroundColor: Colors.backgroundSecondary,
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  deductionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  deductionInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  deductionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
    flexWrap: 'wrap',
  },
  deductionName: {
    color: Colors.text,
  },
  deductionDesc: {
    color: Colors.textSecondary,
  },
  deductionAmount: {
    color: Colors.error,
  },
  deductionDetails: {
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
    flex: 0.4,
  },
  detailValue: {
    color: Colors.text,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 0.6,
  },
  confidenceBar: {
    flex: 1,
    height: 6,
  },
  severityIndicator: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  severityText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
  reasonContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  reasonText: {
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
  expandHint: {
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  skippedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skippedSubtitle: {
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  skippedItem: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.xs,
  },
  skippedName: {
    color: Colors.text,
  },
  skippedReason: {
    color: Colors.textSecondary,
  },
  approvalCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  approvalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  approvalLabel: {
    color: Colors.text,
  },
  finalizedBanner: {
    backgroundColor: Colors.success,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  finalizedText: {
    color: Colors.white,
  },
  finalizedDate: {
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: Spacing.xs,
  },
  actionSection: {
    marginBottom: Spacing.md,
  },
  waitingCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.backgroundSecondary,
    borderLeftWidth: 4,
    borderLeftColor: Colors.info,
  },
  waitingText: {
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  waitingSubtext: {
    color: Colors.textSecondary,
  },
  backButton: {
    marginBottom: Spacing.lg,
  },
  error: {
    color: Colors.error,
    padding: Spacing.lg,
  },
});
