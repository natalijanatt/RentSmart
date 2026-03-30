import {
  Settlement,
  SettlementResponse,
  ApproveSettlementResponse,
  AnalysisResult,
  AnalysisResultsResponse,
  Deduction,
  Finding,
} from '@rentsmart/contracts';

class AnalysisService {
  async getAnalysisResults(contractId: string): Promise<AnalysisResultsResponse> {
    const analysis: AnalysisResult[] = [
      {
        room_id: 'room-001',
        room: 'Living Room',
        findings: [
          {
            item: 'Wall paint',
            description: 'Scuffing on southwest wall',
            severity: 'minor',
            confidence: 0.85,
            wear_and_tear: true,
            location_in_image: 'Bottom left of image 2',
          },
          {
            item: 'Carpet',
            description: 'Small stain near window',
            severity: 'medium',
            confidence: 0.72,
            wear_and_tear: false,
            location_in_image: 'Top right of image 1',
          },
        ],
        summary: 'Minor cosmetic wear and one stain requiring cleaning.',
        overall_condition: 'good',
      },
      {
        room_id: 'room-002',
        room: 'Bedroom',
        findings: [],
        summary: 'Room in excellent condition, no damage detected.',
        overall_condition: 'excellent',
      },
      {
        room_id: 'room-003',
        room: 'Bathroom',
        findings: [
          {
            item: 'Tile grout',
            description: 'Mold in shower corner',
            severity: 'medium',
            confidence: 0.88,
            wear_and_tear: false,
            location_in_image: 'Top left corner',
          },
        ],
        summary: 'Mold detected in shower area requiring professional cleaning.',
        overall_condition: 'fair',
      },
      {
        room_id: 'room-004',
        room: 'Kitchen',
        findings: [
          {
            item: 'Stovetop',
            description: 'Burnt residue and grease buildup',
            severity: 'medium',
            confidence: 0.79,
            wear_and_tear: false,
            location_in_image: 'Center of image',
          },
        ],
        summary: 'Kitchen needs thorough cleaning.',
        overall_condition: 'fair',
      },
    ];

    return { analysis };
  }

  async getSettlement(contractId: string): Promise<SettlementResponse> {
    const now = new Date();
    const settlement: Settlement = {
      id: 'settlement-' + contractId,
      contract_id: contractId,
      deposit_amount_eur: 1200,
      total_deduction_eur: 245,
      total_deduction_percent: 20.4,
      tenant_receives_eur: 955,
      landlord_receives_eur: 245,
      deductions: [
        {
          finding: 'Carpet stain',
          description: 'Professional cleaning required',
          severity: 'medium',
          confidence: 0.72,
          deduction_eur: 150,
          deduction_percent: 12.5,
          reason: 'Damage beyond normal wear and tear, estimated cleaning cost €150',
        },
        {
          finding: 'Bathroom mold',
          description: 'Professional mold remediation',
          severity: 'medium',
          confidence: 0.88,
          deduction_eur: 75,
          deduction_percent: 6.25,
          reason: 'Mold remediation service, estimated cost €75',
        },
        {
          finding: 'Kitchen cleaning',
          description: 'Deep cleaning service',
          severity: 'medium',
          confidence: 0.79,
          deduction_eur: 20,
          deduction_percent: 1.67,
          reason: 'Additional cleaning beyond standard turnover, estimated €20',
        },
      ],
      skipped_findings: [
        {
          finding: 'Wall scuffing',
          description: 'Minor cosmetic wear considered normal wear and tear',
          reason: 'Minor scuffing is typical wear and tear under lease terms',
        },
      ],
      settlement_type: 'automatic',
      requires_manual_review: false,
      explanation: 'Settlement calculated automatically based on LLM analysis and predefined rules. Deductions represent reasonable costs for remediation.',
      landlord_approved_at: null,
      landlord_approved_by: null,
      tenant_approved_at: null,
      tenant_approved_by: null,
      finalized_at: null,
    };

    return { settlement };
  }

  async approveSettlement(contractId: string, userRole: 'landlord' | 'tenant'): Promise<ApproveSettlementResponse> {
    const settlement = (await this.getSettlement(contractId)).settlement;
    settlement.finalized_at = new Date().toISOString();

    if (userRole === 'landlord') {
      settlement.landlord_approved_at = new Date().toISOString();
      settlement.landlord_approved_by = 'landlord-user-id';
    } else {
      settlement.tenant_approved_at = new Date().toISOString();
      settlement.tenant_approved_by = 'tenant-user-id';
    }

    return {
      settlement,
      contract_status: 'completed',
      approved_by_role: userRole,
      is_fully_approved: true,
    };
  }
}

export const analysisService = new AnalysisService();
