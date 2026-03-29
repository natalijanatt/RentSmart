# Skill: Analysis Module

## Context

Orchestrates the AI pipeline: fetches check-in/checkout images per room, sends them to Gemini Vision for comparison, parses the response, runs the deterministic rule engine to calculate deposit split, and saves the settlement. This is the most complex module — it coordinates between inspections (images), contracts (deposit amount), and audit (logging).

## Files in scope

```
src/modules/analysis/
├── analysis.routes.ts      # POST analyze, GET analysis, GET settlement, POST finalize
├── analysis.service.ts     # Orchestrator: fetch → LLM → rule engine → save
├── llmService.ts           # Gemini Vision API: analyzeRoom(), parseResponse(), mock
├── ruleEngine.ts           # calculateSettlement() — pure function
└── analysis.schema.ts      # Zod: finalizeSchema (if needed)
```

## Dependencies

- shared/db/client (pg Pool)
- shared/types (RoomAnalysis, Finding, SettlementResult, Severity)
- shared/utils/errors (AppError)
- modules/inspections/imageService (downloadImage, getImagesByContract)
- modules/contracts/contracts.service (transitionStatus)
- modules/audit/audit.service (logAuditEvent)
- modules/blockchain/solana.service (executeSettlement — optional)
- @google/generative-ai (Gemini SDK)
- config/env (GEMINI_API_KEY, MOCK_LLM)

## API endpoints

```
POST /api/v1/contracts/:id/analyze       # Trigger analysis (auto after checkout approve)
GET  /api/v1/contracts/:id/analysis      # Get analysis results per room
GET  /api/v1/contracts/:id/settlement    # Get settlement breakdown
POST /api/v1/contracts/:id/finalize      # Finalize settlement
```

## Orchestrator: analysis.service.ts

```typescript
export async function runAnalysis(contractId: string): Promise<void> {
  // 1. Log start
  await logAuditEvent(contractId, 'LLM_ANALYSIS_STARTED', null, 'system', {});

  // 2. Get all rooms for this contract
  const rooms = await db.query<Room>(
    'SELECT * FROM rooms WHERE contract_id = $1 ORDER BY display_order', [contractId]
  );

  // 3. For EACH room, get checkin + checkout images and run LLM
  const analysisResults: RoomAnalysis[] = [];

  for (const room of rooms.rows) {
    const checkinImages = await getImagesByRoom(contractId, room.id, 'checkin');
    const checkoutImages = await getImagesByRoom(contractId, room.id, 'checkout');

    // Download image buffers
    const checkinBuffers = await Promise.all(
      checkinImages.map(img => downloadImage(img.image_url))
    );
    const checkoutBuffers = await Promise.all(
      checkoutImages.map(img => downloadImage(img.image_url))
    );

    // LLM analysis for this room
    const roomName = room.custom_name || room.room_type;
    const result = await analyzeRoom(roomName, checkinBuffers, checkoutBuffers);

    // Save to DB
    await db.query(
      `INSERT INTO analysis_results
         (contract_id, room_id, raw_llm_response, findings, summary,
          overall_condition, llm_model, llm_tokens_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [contractId, room.id, JSON.stringify(result),
       JSON.stringify(result.findings), result.summary,
       result.overall_condition, 'gemini-1.5-pro', null]
    );

    analysisResults.push(result);
  }

  // 4. Log LLM complete
  await logAuditEvent(contractId, 'LLM_ANALYSIS_COMPLETED', null, 'system', {
    rooms_analyzed: analysisResults.length,
  });

  // 5. Run rule engine
  const contract = await db.query<Contract>(
    'SELECT deposit_amount_eur FROM contracts WHERE id = $1', [contractId]
  );
  const settlement = calculateSettlement(
    contract.rows[0].deposit_amount_eur,
    analysisResults
  );

  // 6. Save settlement
  await db.query(
    `INSERT INTO settlements
       (contract_id, deposit_amount_eur, total_deduction_eur, total_deduction_percent,
        tenant_receives_eur, landlord_receives_eur, deductions, skipped_findings,
        settlement_type, requires_manual_review, explanation)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [contractId, settlement.deposit_amount_eur,
     settlement.total_deduction_eur, settlement.total_deduction_percent,
     settlement.tenant_receives_eur, settlement.landlord_receives_eur,
     JSON.stringify(settlement.deductions), JSON.stringify(settlement.skipped_findings),
     settlement.settlement_type, settlement.requires_manual_review,
     settlement.explanation]
  );

  // 7. Transition to settlement
  await transitionStatus(contractId, 'settlement', null, 'system');

  // 8. Log
  await logAuditEvent(contractId, 'RULE_ENGINE_EXECUTED', null, 'system', {
    total_deduction_percent: settlement.total_deduction_percent,
    requires_manual_review: settlement.requires_manual_review,
  });
  await logAuditEvent(contractId, 'SETTLEMENT_PROPOSED', null, 'system', {
    tenant_receives_eur: settlement.tenant_receives_eur,
    landlord_receives_eur: settlement.landlord_receives_eur,
  });
}
```

## LLM service: llmService.ts

### analyzeRoom()

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../../config/env';
import type { RoomAnalysis, Severity } from '../../shared/types';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export async function analyzeRoom(
  roomName: string,
  checkinImages: Buffer[],
  checkoutImages: Buffer[]
): Promise<RoomAnalysis> {
  if (env.MOCK_LLM === 'true') {
    return getMockResponse(roomName);
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // BEFORE images
  parts.push({ text: `--- BEFORE images (check-in) for room: ${roomName} ---` });
  for (const buf of checkinImages) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } });
  }

  // AFTER images
  parts.push({ text: `--- AFTER images (check-out) for room: ${roomName} ---` });
  for (const buf of checkoutImages) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } });
  }

  // Prompt
  parts.push({ text: LLM_PROMPT });

  const result = await model.generateContent(parts);
  const text = result.response.text();

  return parseResponse(text, roomName);
}
```

### parseResponse() — CRITICAL: never trust LLM output

```typescript
export function parseResponse(rawText: string, roomName: string): RoomAnalysis {
  // 1. Strip markdown fences
  let cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  // 2. Try direct parse
  try {
    return validateSchema(JSON.parse(cleaned), roomName);
  } catch { /* continue */ }

  // 3. Try regex extraction
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return validateSchema(JSON.parse(jsonMatch[0]), roomName);
    } catch { /* continue */ }
  }

  // 4. Fallback — analysis failed
  return {
    room: roomName,
    findings: [],
    summary: 'LLM analysis could not be parsed. Manual review needed.',
    overall_condition: 'unknown',
    parse_error: true,
    raw_response: rawText,
  };
}

function validateSchema(data: unknown, roomName: string): RoomAnalysis {
  const obj = data as Record<string, unknown>;

  if (!obj || typeof obj !== 'object') throw new Error('Not an object');
  if (!Array.isArray(obj.findings)) throw new Error('No findings array');

  const VALID_SEVERITIES: Severity[] = ['none', 'minor', 'medium', 'major'];
  const VALID_CONDITIONS = ['excellent', 'good', 'fair', 'damaged'];

  const findings = (obj.findings as Array<Record<string, unknown>>).map(f => ({
    item: String(f.item ?? 'unknown'),
    description: String(f.description ?? ''),
    severity: (VALID_SEVERITIES.includes(f.severity as Severity)
      ? f.severity : 'minor') as Severity,
    confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.5)),
    wear_and_tear: Boolean(f.wear_and_tear),
    location_in_image: String(f.location_in_image ?? ''),
  }));

  return {
    room: String(obj.room ?? roomName),
    findings,
    summary: String(obj.summary ?? ''),
    overall_condition: VALID_CONDITIONS.includes(String(obj.overall_condition))
      ? (obj.overall_condition as RoomAnalysis['overall_condition'])
      : 'unknown',
  };
}
```

### Mock responses

```typescript
const MOCK_RESPONSES: Record<string, RoomAnalysis> = {
  kuhinja: {
    room: 'kuhinja', findings: [],
    summary: 'No visible changes.', overall_condition: 'excellent',
  },
  kupatilo: {
    room: 'kupatilo',
    findings: [{
      item: 'mirror above sink', description: 'Crack in bottom-right corner',
      severity: 'major', confidence: 0.93, wear_and_tear: false,
      location_in_image: 'upper right',
    }],
    summary: 'Cracked mirror — significant damage.', overall_condition: 'damaged',
  },
  dnevna_soba: {
    room: 'dnevna_soba',
    findings: [
      { item: 'parquet floor', description: 'New scratch ~30cm under window',
        severity: 'minor', confidence: 0.85, wear_and_tear: false,
        location_in_image: 'bottom left' },
      { item: 'southwest wall', description: 'Slightly faded paint where picture hung',
        severity: 'minor', confidence: 0.72, wear_and_tear: true,
        location_in_image: 'center' },
    ],
    summary: 'One minor scratch, one normal wear.', overall_condition: 'good',
  },
  spavaca_soba: {
    room: 'spavaca_soba', findings: [],
    summary: 'No visible changes.', overall_condition: 'excellent',
  },
};

function getMockResponse(roomName: string): RoomAnalysis {
  return MOCK_RESPONSES[roomName] ?? {
    room: roomName, findings: [],
    summary: 'No visible changes.', overall_condition: 'excellent',
  };
}
```

## Rule engine: ruleEngine.ts — PURE FUNCTION

```typescript
import type { Severity, RoomAnalysis, SettlementResult, Deduction, SkippedFinding } from '../../shared/types';

const DEDUCTION_RATES: Record<Severity, number> = {
  none:   0,
  minor:  0.03,
  medium: 0.10,
  major:  0.25,
};

const CONFIDENCE_THRESHOLD = 0.6;
const MAX_AUTO_DEDUCTION_PERCENT = 50;

export function calculateSettlement(
  depositAmountEur: number,
  analysisResults: RoomAnalysis[]
): SettlementResult {
  const deductions: Deduction[] = [];
  const skippedFindings: SkippedFinding[] = [];
  let totalDeductionEur = 0;
  let hasLowConfidence = false;

  for (const room of analysisResults) {
    for (const finding of room.findings) {
      // Rule 1: Wear and tear = no deduction
      if (finding.wear_and_tear) {
        skippedFindings.push({
          finding: `${finding.item} — ${room.room}`,
          description: finding.description,
          reason: 'Normal wear and tear',
        });
        continue;
      }

      // Rule 2: Low confidence = skip + flag
      if (finding.confidence < CONFIDENCE_THRESHOLD) {
        hasLowConfidence = true;
        skippedFindings.push({
          finding: `${finding.item} — ${room.room}`,
          description: finding.description,
          reason: `Low confidence (${(finding.confidence * 100).toFixed(0)}%) — manual review needed`,
        });
        continue;
      }

      // Rule 3: Apply deduction rate
      const rate = DEDUCTION_RATES[finding.severity] ?? 0;
      const deductionEur = Math.round(depositAmountEur * rate * 100) / 100;

      if (deductionEur > 0) {
        deductions.push({
          finding: `${finding.item} — ${room.room}`,
          description: finding.description,
          severity: finding.severity,
          confidence: finding.confidence,
          deduction_eur: deductionEur,
          deduction_percent: rate * 100,
          reason: `${finding.severity} damage — new since check-in`,
        });
        totalDeductionEur += deductionEur;
      }
    }
  }

  // Rule 4: Cap at 100%
  totalDeductionEur = Math.min(totalDeductionEur, depositAmountEur);

  // Rule 5+6: Manual review triggers
  const totalDeductionPercent = (totalDeductionEur / depositAmountEur) * 100;
  const requiresManualReview =
    totalDeductionPercent > MAX_AUTO_DEDUCTION_PERCENT || hasLowConfidence;

  return {
    deposit_amount_eur: depositAmountEur,
    deductions,
    skipped_findings: skippedFindings,
    total_deduction_eur: Math.round(totalDeductionEur * 100) / 100,
    total_deduction_percent: Math.round(totalDeductionPercent * 100) / 100,
    tenant_receives_eur: Math.round((depositAmountEur - totalDeductionEur) * 100) / 100,
    landlord_receives_eur: Math.round(totalDeductionEur * 100) / 100,
    settlement_type: requiresManualReview ? 'manual_review' : 'automatic',
    requires_manual_review: requiresManualReview,
    explanation: generateExplanation(deductions, skippedFindings, totalDeductionEur, totalDeductionPercent, depositAmountEur),
  };
}
```

## LLM prompt (stored as constant in llmService.ts)

See CLAUDE.md for the full prompt text. Key points:
- Written in Serbian
- Asks for ONLY change detection — no financial decisions
- Requires JSON output (no markdown)
- Classifies severity as none/minor/medium/major
- Requires confidence 0.0-1.0
- Requires wear_and_tear boolean

## DO

- DO process rooms SEQUENTIALLY (not parallel) to avoid hitting Gemini rate limits
- DO store raw_llm_response for every analysis — essential for debugging
- DO handle partial failures: if LLM fails for one room, continue with others
- DO validate ALL fields from LLM response — sanitize severity, clamp confidence
- DO auto-trigger analysis after checkout approval (call from inspections module)
- DO keep ruleEngine.ts as a PURE function — no DB, no side effects

## NEVER

- NEVER send all rooms' images in one LLM call — per room, always
- NEVER trust LLM output without validation — it can return anything
- NEVER modify ruleEngine logic to call DB — it must remain pure for unit testing
- NEVER skip the fallback in parseResponse — broken JSON is expected
- NEVER call Gemini API when MOCK_LLM=true — use mock responses
- NEVER put financial logic in the LLM prompt — rule engine handles money

## Edge case tests for ruleEngine

```
Test 1: No damage
  Input: findings = []
  Expected: tenant_receives = 100%, landlord = 0%, automatic

Test 2: All major (overflow)
  Input: 5 × major (5 × 25% = 125%)
  Expected: cap at 100%, requires_manual_review = true (>50%)

Test 3: All low confidence
  Input: 3 findings with confidence 0.4
  Expected: all skipped, tenant = 100%, manual_review = true

Test 4: Mix
  Input: 1 minor (0.85) + 1 wear_and_tear + 1 major (0.93)
  Expected: minor=3% + major=25% = 28%, automatic, wear_and_tear skipped

Test 5: Exactly 50%
  Input: 2 × major (2 × 25% = 50%)
  Expected: 50%, automatic (>50% is trigger, not >=50%)
```

## Checklist

- [ ] runAnalysis processes rooms sequentially
- [ ] LLM response is parsed with 3-tier fallback (direct → regex → fallback)
- [ ] Severity sanitized to valid enum values
- [ ] Confidence clamped to 0.0-1.0
- [ ] raw_llm_response stored in analysis_results
- [ ] Rule engine passes all 5 edge case tests
- [ ] Settlement saved with all deductions and skipped findings
- [ ] Status transitions: pending_analysis → settlement
- [ ] All operations log audit events
- [ ] Mock mode returns hardcoded responses per room type
- [ ] Finalize transitions settlement → completed