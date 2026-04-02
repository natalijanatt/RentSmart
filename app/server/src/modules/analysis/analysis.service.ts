import crypto from 'crypto';
import type { PoolClient } from 'pg';

import type { AnalysisResult, Finding, Settlement } from '@rentsmart/contracts';

import { query, queryOne, withTransaction } from '../../shared/db/index.js';
import { getSolanaService } from '../../services/solana/instance.js';
import type { SolanaAgreement } from '../../services/solana/ISolanaService.js';
import { createLlmService } from '../../services/llm/index.js';
import type { DbAnalysisResult, DbContract, DbRoom, DbSettlement, DbUser } from '../../shared/types/index.js';
import { AppError } from '../../shared/utils/errors.js';
import { logAuditEvent } from '../audit/audit.service.js';
import { validateTransition } from '../contracts/state-machine.js';
import { computeSettlement } from './rule-engine.js';

const llmService = createLlmService();

// ── Mappers ───────────────────────────────────────────────────────────────────

type DbAnalysisResultWithRoom = DbAnalysisResult & { room_type: string };

function toAnalysisResult(db: DbAnalysisResultWithRoom): AnalysisResult {
  return {
    room_id: db.room_id,
    room: db.room_type,
    findings: (db.findings as Finding[]) ?? [],
    summary: db.summary ?? '',
    overall_condition: (db.overall_condition as AnalysisResult['overall_condition']) ?? 'unknown',
  };
}

function toSettlement(db: DbSettlement): Settlement {
  return {
    id: db.id,
    contract_id: db.contract_id,
    deposit_amount_eur: parseFloat(db.deposit_amount_eur),
    total_deduction_eur: parseFloat(db.total_deduction_eur),
    total_deduction_percent: parseFloat(db.total_deduction_percent),
    tenant_receives_eur: parseFloat(db.tenant_receives_eur),
    landlord_receives_eur: parseFloat(db.landlord_receives_eur),
    deductions: db.deductions as Settlement['deductions'],
    skipped_findings: db.skipped_findings as Settlement['skipped_findings'],
    settlement_type: db.settlement_type as Settlement['settlement_type'],
    requires_manual_review: db.requires_manual_review,
    explanation: db.explanation ?? '',
    landlord_approved_at: db.landlord_approved_at?.toISOString() ?? null,
    landlord_approved_by: db.landlord_approved_by,
    tenant_approved_at: db.tenant_approved_at?.toISOString() ?? null,
    tenant_approved_by: db.tenant_approved_by,
    finalized_at: db.finalized_at?.toISOString() ?? null,
  };
}

// ── runAnalysis ───────────────────────────────────────────────────────────────

export async function runAnalysis(contractId: string): Promise<Settlement> {
  // 1. Verify contract is in pending_analysis
  const contract = await queryOne<DbContract>(
    `SELECT * FROM contracts WHERE id = $1`,
    [contractId],
  );

  if (!contract) throw AppError.notFound('Contract not found.');
  if (contract.status !== 'pending_analysis') {
    throw AppError.conflict(
      `Contract must be in pending_analysis status, got: ${contract.status}`,
    );
  }

  // 2. Fetch all rooms
  const rooms = await query<DbRoom>(
    `SELECT * FROM rooms WHERE contract_id = $1 ORDER BY display_order ASC`,
    [contractId],
  );

  await logAuditEvent(contractId, 'LLM_ANALYSIS_STARTED', null, 'system', { rooms_count: rooms.length });

  // 3. Analyze each room (outside transaction — involves external HTTP)
  const analysisRows: DbAnalysisResult[] = [];

  for (const room of rooms) {
    const [checkinImages, checkoutImages] = await Promise.all([
      query<{ image_url: string }>(
        `SELECT image_url FROM inspection_images WHERE contract_id = $1 AND room_id = $2 AND inspection_type = 'checkin'`,
        [contractId, room.id],
      ),
      query<{ image_url: string }>(
        `SELECT image_url FROM inspection_images WHERE contract_id = $1 AND room_id = $2 AND inspection_type = 'checkout'`,
        [contractId, room.id],
      ),
    ]);

    if (checkinImages.length === 0 || checkoutImages.length === 0) {
      const row = await queryOne<DbAnalysisResult>(
        `INSERT INTO analysis_results
           (contract_id, room_id, findings, summary, overall_condition, analyzed_at,
            llm_model, llm_tokens_used, raw_llm_response)
         VALUES ($1, $2, $3::jsonb, $4, $5, NOW(), $6, $7, $8::jsonb)
         RETURNING *`,
        [
          contractId,
          room.id,
          JSON.stringify([]),
          'No images available',
          'unknown',
          null,
          0,
          JSON.stringify(null),
        ],
      );
      if (row) analysisRows.push(row);
      continue;
    }

    let rawContent: string;
    let llmModel: string;
    let tokensUsed: number;

    try {
      const rawOutput = await llmService.analyzeRoom({
        roomId: room.id,
        roomType: room.room_type,
        checkinImageUrls: checkinImages.map((i) => i.image_url),
        checkoutImageUrls: checkoutImages.map((i) => i.image_url),
      });
      rawContent = rawOutput.content;
      llmModel = rawOutput.model;
      tokensUsed = rawOutput.prompt_tokens + rawOutput.completion_tokens;
    } catch (err) {
      console.error(`LLM call failed for room ${room.id}:`, err);
      const row = await queryOne<DbAnalysisResult>(
        `INSERT INTO analysis_results
           (contract_id, room_id, findings, summary, overall_condition, analyzed_at,
            llm_model, llm_tokens_used, raw_llm_response)
         VALUES ($1, $2, $3::jsonb, $4, $5, NOW(), $6, $7, $8::jsonb)
         RETURNING *`,
        [
          contractId,
          room.id,
          JSON.stringify([]),
          'LLM call failed',
          'unknown',
          null,
          0,
          JSON.stringify({ error: String(err) }),
        ],
      );
      if (row) analysisRows.push(row);
      continue;
    }

    // Parse model output
    let parsed: {
      summary?: string;
      overall_condition?: string;
      findings?: Finding[];
    } = {};
    let findings: Finding[] = [];
    let summary = '';
    let overallCondition = 'unknown';

    // 3-tier JSON parsing fallback
    // Strip markdown code fences before parsing
    const cleaned = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // Tier 1: direct JSON.parse
    try {
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      // Tier 2: regex extraction for JSON wrapped in text
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
        } catch {
          // Tier 3: fallback with empty findings
          parsed = {};
        }
      }
    }
    findings = Array.isArray(parsed.findings) ? clampFindings(parsed.findings) : [];
    summary = parsed.summary ?? '';
    overallCondition = parsed.overall_condition ?? 'unknown';

    const row = await queryOne<DbAnalysisResult>(
      `INSERT INTO analysis_results
         (contract_id, room_id, findings, summary, overall_condition, analyzed_at,
          llm_model, llm_tokens_used, raw_llm_response)
       VALUES ($1, $2, $3::jsonb, $4, $5, NOW(), $6, $7, $8::jsonb)
       RETURNING *`,
      [
        contractId,
        room.id,
        JSON.stringify(findings),
        summary,
        overallCondition,
        llmModel,
        tokensUsed,
        JSON.stringify({ raw: rawContent }),
      ],
    );
    if (row) analysisRows.push(row);
  }

  await logAuditEvent(
    contractId,
    'LLM_ANALYSIS_COMPLETED',
    null,
    'system',
    { rooms_analyzed: analysisRows.length },
  );

  // 4. Compute settlement
  const depositAmountEur = parseFloat(contract.deposit_amount_eur);
  const computation = computeSettlement(analysisRows, depositAmountEur);

  // 5. Persist settlement + transition contract — all in one transaction
  const settlement = await withTransaction(async (client: PoolClient) => {
    const settlementRow = await client.query<DbSettlement>(
      `INSERT INTO settlements
         (contract_id, deposit_amount_eur, total_deduction_eur, total_deduction_percent,
          tenant_receives_eur, landlord_receives_eur, deductions, skipped_findings,
          settlement_type, requires_manual_review, explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11)
       RETURNING *`,
      [
        contractId,
        depositAmountEur,
        computation.total_deduction_eur,
        computation.total_deduction_percent,
        computation.tenant_receives_eur,
        computation.landlord_receives_eur,
        JSON.stringify(computation.deductions),
        JSON.stringify(computation.skipped_findings),
        computation.settlement_type,
        computation.requires_manual_review,
        computation.explanation,
      ],
    );

    const dbSettlement = settlementRow.rows[0];
    if (!dbSettlement) throw AppError.internal('Failed to insert settlement.');

    validateTransition('pending_analysis', 'settlement', 'system');

    await client.query(
      `UPDATE contracts SET status = 'settlement', updated_at = NOW() WHERE id = $1`,
      [contractId],
    );

    await logAuditEvent(contractId, 'RULE_ENGINE_EXECUTED', null, 'system', {
      deductions_count: computation.deductions.length,
      skipped_count: computation.skipped_findings.length,
      requires_manual_review: computation.requires_manual_review,
    }, client);

    await logAuditEvent(contractId, 'SETTLEMENT_PROPOSED', null, 'system', {
      settlement_id: dbSettlement.id,
      total_deduction_eur: computation.total_deduction_eur,
      settlement_type: computation.settlement_type,
    }, client);

    return dbSettlement;
  });

  return toSettlement(settlement);
}

// ── getAnalysisResults ────────────────────────────────────────────────────────

export async function getAnalysisResults(
  contractId: string,
  requesterId: string,
): Promise<AnalysisResult[]> {
  const contract = await queryOne<{ landlord_id: string; tenant_id: string | null }>(
    `SELECT landlord_id, tenant_id FROM contracts WHERE id = $1`,
    [contractId],
  );

  if (!contract) throw AppError.notFound('Contract not found.');
  if (requesterId !== contract.landlord_id && requesterId !== contract.tenant_id) {
    throw AppError.forbidden('Access denied.');
  }

  const rows = await query<DbAnalysisResultWithRoom>(
    `SELECT * FROM (
       SELECT DISTINCT ON (ar.room_id) ar.*, r.room_type, r.display_order
       FROM analysis_results ar
       JOIN rooms r ON r.id = ar.room_id
       WHERE ar.contract_id = $1
       ORDER BY ar.room_id, ar.analyzed_at DESC
     ) sub
     ORDER BY sub.display_order ASC`,
    [contractId],
  );

  return rows.map(toAnalysisResult);
}

// ── getSettlement ─────────────────────────────────────────────────────────────

export async function getSettlement(
  contractId: string,
  requesterId: string,
): Promise<Settlement> {
  const contract = await queryOne<{ landlord_id: string; tenant_id: string | null }>(
    `SELECT landlord_id, tenant_id FROM contracts WHERE id = $1`,
    [contractId],
  );

  if (!contract) throw AppError.notFound('Contract not found.');
  if (requesterId !== contract.landlord_id && requesterId !== contract.tenant_id) {
    throw AppError.forbidden('Access denied.');
  }

  const row = await queryOne<DbSettlement>(
    `SELECT * FROM settlements WHERE contract_id = $1`,
    [contractId],
  );

  if (!row) throw AppError.notFound('Settlement not found.');
  return toSettlement(row);
}

// ── approveSettlement ─────────────────────────────────────────────────────────

export async function approveSettlement(
  contractId: string,
  actorId: string,
): Promise<Settlement> {
  return withTransaction(async (client: PoolClient) => {
    const contractResult = await client.query<DbContract>(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contractId],
    );
    const contract = contractResult.rows[0];

    if (!contract) throw AppError.notFound('Contract not found.');
    if (contract.status !== 'settlement') {
      throw AppError.conflict(`Contract must be in settlement status, got: ${contract.status}`);
    }

    const isLandlord = actorId === contract.landlord_id;
    const isTenant = actorId === contract.tenant_id;

    if (!isLandlord && !isTenant) throw AppError.forbidden('Access denied.');

    const actorRole = isLandlord ? 'landlord' : 'tenant';

    const settlementResult = await client.query<DbSettlement>(
      `SELECT * FROM settlements WHERE contract_id = $1 FOR UPDATE`,
      [contractId],
    );
    const settlement = settlementResult.rows[0];
    if (!settlement) throw AppError.notFound('Settlement not found.');

    // Check not already approved by this actor
    if (actorRole === 'landlord' && settlement.landlord_approved_at !== null) {
      throw AppError.conflict('Landlord has already approved this settlement.');
    }
    if (actorRole === 'tenant' && settlement.tenant_approved_at !== null) {
      throw AppError.conflict('Tenant has already approved this settlement.');
    }

    // Update approval
    const approvalColumn =
      actorRole === 'landlord'
        ? { at: 'landlord_approved_at', by: 'landlord_approved_by' }
        : { at: 'tenant_approved_at', by: 'tenant_approved_by' };

    const updatedResult = await client.query<DbSettlement>(
      `UPDATE settlements
       SET ${approvalColumn.at} = NOW(), ${approvalColumn.by} = $1
       WHERE contract_id = $2
       RETURNING *`,
      [actorId, contractId],
    );
    const updated = updatedResult.rows[0];
    if (!updated) throw AppError.internal('Failed to update settlement.');

    await logAuditEvent(
      contractId,
      'SETTLEMENT_APPROVED',
      actorId,
      actorRole,
      { settlement_id: settlement.id },
      client,
    );

    // Check if both sides have now approved
    const bothApproved =
      updated.landlord_approved_at !== null && updated.tenant_approved_at !== null;

    if (bothApproved) {
      const finalizedResult = await client.query<DbSettlement>(
        `UPDATE settlements SET finalized_at = NOW() WHERE contract_id = $1 RETURNING *`,
        [contractId],
      );
      const finalized = finalizedResult.rows[0];
      if (!finalized) throw AppError.internal('Failed to finalize settlement.');

      validateTransition('settlement', 'completed', actorRole);

      const newDepositStatus =
        parseFloat(finalized.total_deduction_eur) === 0
          ? 'fully_released'
          : parseFloat(finalized.total_deduction_eur) >= parseFloat(finalized.deposit_amount_eur)
            ? 'claimed'
            : 'partially_released';

      await client.query(
        `UPDATE contracts SET status = 'completed', deposit_status = $1, updated_at = NOW() WHERE id = $2`,
        [newDepositStatus, contractId],
      );

      await logAuditEvent(
        contractId,
        'SETTLEMENT_FINALIZED',
        null,
        'system',
        { settlement_id: settlement.id, finalized_at: new Date().toISOString() },
        client,
      );

      await logAuditEvent(
        contractId,
        'DEPOSIT_RELEASED',
        null,
        'system',
        { deposit_status: newDepositStatus, total_deduction_eur: finalized.total_deduction_eur },
        client,
      );

      // Execute on-chain settlement — optional verification layer (graceful degradation)
      const contractParties = await client.query<{ tenant_id: string; landlord_id: string }>(
        `SELECT tenant_id, landlord_id FROM contracts WHERE id = $1`,
        [contractId],
      );
      const parties = contractParties.rows[0]!;

      const [tenantUserRes, landlordUserRes] = await Promise.all([
        client.query<DbUser>(`SELECT solana_pubkey FROM users WHERE id = $1`, [parties.tenant_id]),
        client.query<DbUser>(`SELECT solana_pubkey FROM users WHERE id = $1`, [parties.landlord_id]),
      ]);
      const tenantPubkey = tenantUserRes.rows[0]?.solana_pubkey ?? null;
      const landlordPubkey = landlordUserRes.rows[0]?.solana_pubkey ?? null;

      if (tenantPubkey && landlordPubkey) {
        const solana = getSolanaService();

        // Read on-chain state for validation — never blocks DB commit on failure
        let agreement: SolanaAgreement | null = null;
        try {
          agreement = await solana.getAgreement(contractId);
        } catch (err) {
          console.error(`[Solana] getAgreement failed for ${contractId}:`, err);
        }

        if (agreement && agreement.state !== 'CheckoutRecorded' && agreement.state !== 'Settled') {
          console.warn(`[Solana] Unexpected on-chain state for settlement of ${contractId}: ${agreement.state}`);
        }

        // Compute amounts from EUR to lamports for each party
        const landlordLamports = solana.eurToLamports(parseFloat(finalized.landlord_receives_eur));
        const tenantLamports = solana.eurToLamports(parseFloat(finalized.tenant_receives_eur));

        // Normalize to exact on-chain deposit amount to avoid SettlementMismatch in the Rust program
        let finalTenantLamports = tenantLamports;
        if (agreement && agreement.deposit_lamports > 0) {
          const diff = agreement.deposit_lamports - landlordLamports - tenantLamports;
          if (Math.abs(diff) <= 2) {
            // Absorb small rounding diff into tenant amount
            finalTenantLamports = tenantLamports + diff;
          } else {
            console.warn(
              `[Solana] Settlement amount diff too large for ${contractId}: ` +
              `deposit=${agreement.deposit_lamports} landlord=${landlordLamports} tenant=${tenantLamports} diff=${diff}`,
            );
            finalTenantLamports = Math.max(0, agreement.deposit_lamports - landlordLamports);
          }
        }

        const settlementHashBuffer = crypto
          .createHash('sha256')
          .update(JSON.stringify(finalized))
          .digest();

        try {
          await solana.executeSettlement(
            contractId,
            settlementHashBuffer,
            finalTenantLamports,
            landlordLamports,
            tenantPubkey,
            landlordPubkey,
          );
        } catch (err) {
          console.error(`[Solana] executeSettlement failed for ${contractId}:`, err);
          // DB transaction continues — blockchain is optional verification layer
        }
      } else {
        console.warn(`[Solana] Skipping executeSettlement for ${contractId}: missing wallet pubkey(s)`);
      }

      return toSettlement(finalized);
    }

    return toSettlement(updated);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_SEVERITIES = new Set(['none', 'minor', 'medium', 'major']);
const VALID_CONDITIONS = new Set(['excellent', 'good', 'fair', 'damaged', 'unknown']);

function clampFindings(findings: unknown[]): Finding[] {
  return findings
    .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
    .map((f) => ({
      item: typeof f.item === 'string' ? f.item : 'Unknown item',
      description: typeof f.description === 'string' ? f.description : '',
      severity: VALID_SEVERITIES.has(f.severity as string)
        ? (f.severity as Finding['severity'])
        : 'minor',
      confidence: typeof f.confidence === 'number'
        ? Math.min(1, Math.max(0, f.confidence))
        : 0.5,
      wear_and_tear: typeof f.wear_and_tear === 'boolean' ? f.wear_and_tear : false,
      location_in_image: typeof f.location_in_image === 'string' ? f.location_in_image : '',
    }));
}
