import type { Deduction, Finding, SkippedFinding } from '@rentsmart/contracts';

import type { DbAnalysisResult } from '../../shared/types/index.js';

export interface SettlementComputation {
  deductions: Deduction[];
  skipped_findings: SkippedFinding[];
  total_deduction_eur: number;
  total_deduction_percent: number;
  tenant_receives_eur: number;
  landlord_receives_eur: number;
  settlement_type: 'automatic' | 'manual_review';
  requires_manual_review: boolean;
  explanation: string;
}

const SEVERITY_DEDUCTION_PERCENT: Record<string, number> = {
  none: 0,
  minor: 3,
  medium: 10,
  major: 25,
};

export function computeSettlement(
  analysisResults: DbAnalysisResult[],
  depositAmountEur: number,
): SettlementComputation {
  const deductions: Deduction[] = [];
  const skippedFindings: SkippedFinding[] = [];
  let hasLowConfidenceFindings = false;
  let hasHighDeductions = false;

  for (const result of analysisResults) {
    const findings = result.findings as Finding[] | null;
    if (!findings || !Array.isArray(findings)) continue;

    for (const finding of findings) {
      if (finding.wear_and_tear) {
        skippedFindings.push({
          finding: finding.item,
          description: finding.description,
          reason: 'wear_and_tear',
        });
        continue;
      }

      if (finding.confidence < 0.6) {
        skippedFindings.push({
          finding: finding.item,
          description: finding.description,
          reason: `confidence too low (${finding.confidence.toFixed(2)})`,
        });
        hasLowConfidenceFindings = true;
        continue;
      }

      const deductionPercent = SEVERITY_DEDUCTION_PERCENT[finding.severity] ?? 0;
      const deductionEur = (depositAmountEur * deductionPercent) / 100;

      deductions.push({
        finding: finding.item,
        description: finding.description,
        severity: finding.severity,
        confidence: finding.confidence,
        deduction_eur: deductionEur,
        deduction_percent: deductionPercent,
        reason: `${finding.severity} damage: ${finding.description}`,
      });
    }
  }

  const rawTotalPercent = deductions.reduce((sum, d) => sum + d.deduction_percent, 0);
  const clampedTotalPercent = Math.min(rawTotalPercent, 100);
  const isCapped = rawTotalPercent > 100;

  hasHighDeductions = clampedTotalPercent > 50;
  const requiresManualReview = hasLowConfidenceFindings || hasHighDeductions;

  const totalDeductionEur = (depositAmountEur * clampedTotalPercent) / 100;
  const tenantReceivesEur = Math.max(0, depositAmountEur - totalDeductionEur);
  const landlordReceivesEur = totalDeductionEur;

  // Scale individual deduction_eur values so they sum exactly to totalDeductionEur
  if (isCapped && deductions.length > 0) {
    const scaleFactor = clampedTotalPercent / rawTotalPercent;
    for (const d of deductions) {
      d.deduction_eur = parseFloat((d.deduction_eur * scaleFactor).toFixed(2));
    }
  }

  const settlementType: 'automatic' | 'manual_review' = requiresManualReview
    ? 'manual_review'
    : 'automatic';

  const parts: string[] = [];
  if (deductions.length === 0) {
    parts.push('No deductions applied.');
  } else {
    parts.push(`${deductions.length} finding(s) resulted in deductions.`);
    if (isCapped) {
      parts.push('Total deductions capped at 100% of deposit.');
    }
  }
  if (skippedFindings.length > 0) {
    parts.push(`${skippedFindings.length} finding(s) skipped (wear and tear or low confidence).`);
  }
  if (hasLowConfidenceFindings) {
    parts.push('Manual review required due to low-confidence findings.');
  }
  if (hasHighDeductions) {
    parts.push('Manual review required: total deductions exceed 50% of deposit.');
  }
  parts.push(
    `Tenant receives €${tenantReceivesEur.toFixed(2)}, landlord retains €${landlordReceivesEur.toFixed(2)}.`,
  );

  return {
    deductions,
    skipped_findings: skippedFindings,
    total_deduction_eur: totalDeductionEur,
    total_deduction_percent: clampedTotalPercent,
    tenant_receives_eur: tenantReceivesEur,
    landlord_receives_eur: landlordReceivesEur,
    settlement_type: settlementType,
    requires_manual_review: requiresManualReview,
    explanation: parts.join(' '),
  };
}
