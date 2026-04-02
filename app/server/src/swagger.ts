export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'RentSmart API',
    version: '1.0.0',
    description: `
## Full contract flow

1. **Landlord** \`POST /auth/verify\` → get user
2. **Landlord** \`POST /contracts\` → create contract, note \`invite_code\`
3. **Tenant** \`POST /auth/verify\` → get user
4. **Tenant** \`POST /contracts/{id}/accept\` with \`invite_code\`
5. **Landlord** \`POST /contracts/{id}/checkin/start\`
6. **Landlord** \`POST /contracts/{id}/checkin/images\` (per room, multipart)
7. **Landlord** \`POST /contracts/{id}/checkin/complete\`
8. **Tenant** \`POST /contracts/{id}/checkin/approve\` → status: \`active\`
9. **Tenant** \`POST /contracts/{id}/checkout/start\`
10. **Tenant** \`POST /contracts/{id}/checkout/images\` (per room, multipart)
11. **Tenant** \`POST /contracts/{id}/checkout/complete\`
12. **Landlord** \`POST /contracts/{id}/checkout/approve\` → triggers AI analysis automatically
13. Poll \`GET /contracts/{id}/analysis\` until results appear
14. \`GET /contracts/{id}/settlement\`
15. **Landlord** \`POST /contracts/{id}/settlement/approve\`
16. **Tenant** \`POST /contracts/{id}/settlement/approve\` → status: \`completed\`

## Mock auth

Set \`MOCK_AUTH=true\` in \`.env\`. Pass \`X-Mock-User\` header instead of \`Authorization\`:
\`\`\`
X-Mock-User: {"id":"landlord-uuid","phone":"+381641111111","display_name":"Landlord Test"}
\`\`\`
    `,
  },
  servers: [{ url: 'http://localhost:3000/api/v1', description: 'Local dev' }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Firebase ID token',
      },
      MockUser: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Mock-User',
        description: 'JSON string with id, phone, display_name. Only works when MOCK_AUTH=true.',
      },
    },
    schemas: {
      Contract: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { type: 'string' },
          landlord_id: { type: 'string', format: 'uuid' },
          tenant_id: { type: 'string', format: 'uuid', nullable: true },
          property_address: { type: 'string' },
          deposit_amount: { type: 'number' },
          currency: { type: 'string' },
          invite_code: { type: 'string' },
          rooms: { type: 'array', items: { $ref: '#/components/schemas/Room' } },
        },
      },
      Room: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          phone: { type: 'string' },
          display_name: { type: 'string' },
          device_id: { type: 'string', nullable: true },
        },
      },
      Settlement: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          contract_id: { type: 'string', format: 'uuid' },
          settlement_type: { type: 'string', enum: ['automatic', 'manual_review'] },
          deposit_amount: { type: 'number' },
          deduction_amount: { type: 'number' },
          refund_amount: { type: 'number' },
          landlord_approved_at: { type: 'string', nullable: true },
          tenant_approved_at: { type: 'string', nullable: true },
          finalized_at: { type: 'string', nullable: true },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          fields: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }, { MockUser: [] }],
  paths: {
    // ── Auth ──────────────────────────────────────────────────────────────────
    '/auth/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify Firebase token and upsert user',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['firebase_token', 'display_name', 'device_id'],
                properties: {
                  firebase_token: { type: 'string', example: 'mock-token' },
                  display_name: { type: 'string', example: 'Marko Petrovic' },
                  device_id: { type: 'string', example: 'expo-abc123' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'User verified',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/User' },
                    auth_source: { type: 'string', example: 'firebase' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current authenticated user',
        responses: {
          '200': {
            description: 'Current user',
            content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } },
          },
        },
      },
    },

    // ── Contracts ─────────────────────────────────────────────────────────────
    '/contracts': {
      post: {
        tags: ['Contracts'],
        summary: 'Create a new contract (landlord)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['property_address', 'deposit_amount', 'currency', 'start_date', 'end_date', 'rooms'],
                properties: {
                  property_address: { type: 'string', example: 'Knez Mihailova 10, Beograd' },
                  deposit_amount: { type: 'number', example: 500 },
                  currency: { type: 'string', example: 'EUR' },
                  start_date: { type: 'string', format: 'date', example: '2025-08-01' },
                  end_date: { type: 'string', format: 'date', example: '2026-08-01' },
                  rooms: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['name'],
                      properties: {
                        name: { type: 'string', example: 'Living Room' },
                        description: { type: 'string', example: 'Main living area' },
                      },
                    },
                    example: [
                      { name: 'Living Room', description: 'Main living area' },
                      { name: 'Bedroom', description: 'Master bedroom' },
                      { name: 'Kitchen', description: 'Kitchen and dining' },
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Contract created', content: { 'application/json': { schema: { type: 'object', properties: { contract: { $ref: '#/components/schemas/Contract' } } } } } },
        },
      },
      get: {
        tags: ['Contracts'],
        summary: 'List contracts for current user',
        responses: {
          '200': { description: 'List of contracts', content: { 'application/json': { schema: { type: 'object', properties: { contracts: { type: 'array', items: { $ref: '#/components/schemas/Contract' } } } } } } },
        },
      },
    },
    '/contracts/{id}': {
      get: {
        tags: ['Contracts'],
        summary: 'Get contract by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Contract', content: { 'application/json': { schema: { type: 'object', properties: { contract: { $ref: '#/components/schemas/Contract' } } } } } },
        },
      },
    },
    '/contracts/invite/{code}': {
      get: {
        tags: ['Contracts'],
        summary: 'Get contract by invite code (public)',
        security: [],
        parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Contract', content: { 'application/json': { schema: { type: 'object', properties: { contract: { $ref: '#/components/schemas/Contract' } } } } } },
        },
      },
    },
    '/contracts/{id}/accept': {
      post: {
        tags: ['Contracts'],
        summary: 'Accept contract (tenant) — requires invite_code',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['invite_code'],
                properties: { invite_code: { type: 'string', example: 'ABC123' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Contract accepted. Returns contract + unsigned Solana lock_deposit transaction for tenant to sign on their device.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    contract: { $ref: '#/components/schemas/Contract' },
                    solana_lock_deposit_tx: { type: 'string', description: 'Base64-encoded unsigned Solana transaction. Tenant must sign and broadcast this to lock the deposit on-chain.' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/contracts/{id}/cancel': {
      post: {
        tags: ['Contracts'],
        summary: 'Cancel contract',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { reason: { type: 'string', maxLength: 500 } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Contract cancelled' },
        },
      },
    },

    // ── Check-in ──────────────────────────────────────────────────────────────
    '/contracts/{id}/checkin/start': {
      post: {
        tags: ['Check-in'],
        summary: 'Start check-in (landlord) — accepted → checkin_in_progress',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Check-in started', content: { 'application/json': { schema: { type: 'object', properties: { contract: { $ref: '#/components/schemas/Contract' } } } } } },
        },
      },
    },
    '/contracts/{id}/checkin/images': {
      post: {
        tags: ['Check-in'],
        summary: 'Upload check-in images for a room (landlord)',
        description: 'Repeat for each room. All array fields must have exactly one entry per image file.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['images', 'room_id', 'captured_at', 'gps_lat', 'gps_lng', 'device_id'],
                properties: {
                  'images': { type: 'array', items: { type: 'string', format: 'binary' }, description: 'JPEG or PNG, max 10MB each, max 10 files' },
                  room_id: { type: 'string', format: 'uuid', description: 'ID of the room being photographed' },
                  'captured_at': { type: 'array', items: { type: 'string', format: 'date-time' }, description: 'One ISO timestamp per image' },
                  'gps_lat': { type: 'array', items: { type: 'number' }, description: 'One latitude per image' },
                  'gps_lng': { type: 'array', items: { type: 'number' }, description: 'One longitude per image' },
                  'device_id': { type: 'array', items: { type: 'string' }, description: 'One device ID per image' },
                  'notes': { type: 'array', items: { type: 'string' }, description: 'Optional note per image' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Images uploaded', content: { 'application/json': { schema: { type: 'object', properties: { images: { type: 'array' } } } } } },
        },
      },
      get: {
        tags: ['Check-in'],
        summary: 'Get check-in images',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Images list' },
        },
      },
    },
    '/contracts/{id}/checkin/complete': {
      post: {
        tags: ['Check-in'],
        summary: 'Complete check-in (landlord) — checkin_in_progress → checkin_pending_approval',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Check-in completed' },
        },
      },
    },
    '/contracts/{id}/checkin/approve': {
      post: {
        tags: ['Check-in'],
        summary: 'Approve check-in (tenant) — checkin_pending_approval → active',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Check-in approved, contract now active' },
        },
      },
    },
    '/contracts/{id}/checkin/reject': {
      post: {
        tags: ['Check-in'],
        summary: 'Reject check-in (tenant) — checkin_pending_approval → checkin_rejected',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['comment'],
                properties: { comment: { type: 'string', minLength: 1, maxLength: 500, example: 'Bathroom photos missing' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Check-in rejected' },
        },
      },
    },

    // ── Check-out ─────────────────────────────────────────────────────────────
    '/contracts/{id}/checkout/start': {
      post: {
        tags: ['Check-out'],
        summary: 'Start check-out (tenant) — active → checkout_in_progress',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Check-out started' } },
      },
    },
    '/contracts/{id}/checkout/images': {
      post: {
        tags: ['Check-out'],
        summary: 'Upload check-out images for a room (tenant)',
        description: 'Same format as check-in images. Repeat per room.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['images', 'room_id', 'captured_at', 'gps_lat', 'gps_lng', 'device_id'],
                properties: {
                  'images': { type: 'array', items: { type: 'string', format: 'binary' } },
                  room_id: { type: 'string', format: 'uuid' },
                  'captured_at': { type: 'array', items: { type: 'string', format: 'date-time' } },
                  'gps_lat': { type: 'array', items: { type: 'number' } },
                  'gps_lng': { type: 'array', items: { type: 'number' } },
                  'device_id': { type: 'array', items: { type: 'string' } },
                  'notes': { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Images uploaded' } },
      },
      get: {
        tags: ['Check-out'],
        summary: 'Get check-out images',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Images list' } },
      },
    },
    '/contracts/{id}/checkout/complete': {
      post: {
        tags: ['Check-out'],
        summary: 'Complete check-out (tenant) — checkout_in_progress → checkout_pending_approval',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Check-out completed' } },
      },
    },
    '/contracts/{id}/checkout/approve': {
      post: {
        tags: ['Check-out'],
        summary: 'Approve check-out (landlord) — triggers AI analysis automatically',
        description: 'After this call succeeds, the server kicks off Gemini image analysis in the background. Poll `GET /contracts/{id}/analysis` until results appear.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Check-out approved, analysis triggered' } },
      },
    },
    '/contracts/{id}/checkout/reject': {
      post: {
        tags: ['Check-out'],
        summary: 'Reject check-out (landlord) — checkout_pending_approval → checkout_rejected',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['comment'],
                properties: { comment: { type: 'string', minLength: 1, maxLength: 500 } },
              },
            },
          },
        },
        responses: { '200': { description: 'Check-out rejected' } },
      },
    },

    // ── Analysis & Settlement ─────────────────────────────────────────────────
    '/contracts/{id}/analyze': {
      post: {
        tags: ['Analysis & Settlement'],
        summary: 'Manually trigger AI analysis (system/internal)',
        description: 'Normally triggered automatically after checkout approve. Use this to re-run or trigger manually.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Analysis complete, settlement created', content: { 'application/json': { schema: { type: 'object', properties: { settlement: { $ref: '#/components/schemas/Settlement' } } } } } } },
      },
    },
    '/contracts/{id}/analysis': {
      get: {
        tags: ['Analysis & Settlement'],
        summary: 'Get AI analysis results per room',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Analysis results' } },
      },
    },
    '/contracts/{id}/settlement': {
      get: {
        tags: ['Analysis & Settlement'],
        summary: 'Get settlement (deposit breakdown)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Settlement', content: { 'application/json': { schema: { type: 'object', properties: { settlement: { $ref: '#/components/schemas/Settlement' } } } } } },
        },
      },
    },
    '/contracts/{id}/settlement/approve': {
      post: {
        tags: ['Analysis & Settlement'],
        summary: 'Approve settlement — both landlord and tenant must approve to finalize',
        description: 'First approval keeps contract in `settlement`. Second approval transitions to `completed`.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Approval recorded', content: { 'application/json': { schema: { type: 'object', properties: { settlement: { $ref: '#/components/schemas/Settlement' } } } } } },
        },
      },
    },

    // ── Audit ─────────────────────────────────────────────────────────────────
    '/contracts/{id}/audit': {
      get: {
        tags: ['Audit'],
        summary: 'Get full audit trail for a contract',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Audit trail' } },
      },
    },

    // ── Rent Escrow ───────────────────────────────────────────────────────────
    '/contracts/{id}/rent/topup': {
      post: {
        tags: ['Rent Escrow'],
        summary: 'Build unsigned top-up transaction (tenant)',
        description: 'Returns a base64-encoded unsigned Solana transaction for the tenant to sign and broadcast.\n\nThe tenant pre-funds the on-chain escrow PDA with enough SOL to cover `months` monthly releases.\n\n**Fee model (enforced on-chain):**\n- Tenant deposits: rent × 1.005 × months (includes tenant\'s 0.5% fee share)\n- Each month: landlord receives rent − 0.5%, platform receives 1% total\n- Releases happen automatically on the 1st of each month — **no tenant action required**\n\nAfter broadcasting, call `POST /contracts/{id}/rent/topup/confirm` with the `tx_signature`.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        security: [{ BearerAuth: [] }, { MockUser: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['months'],
                properties: {
                  months: { type: 'integer', minimum: 1, maximum: 12, description: 'Number of months to pre-fund', example: 3 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Unsigned transaction ready for tenant to sign',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    serialized_tx: { type: 'string', description: 'Base64-encoded unsigned Solana transaction' },
                    rent_amount_eur: { type: 'number', example: 400 },
                    amount_lamports: { type: 'integer', description: 'Total lamports to deposit (rent × 1.005 × months)', example: 12060000 },
                    months_covered: { type: 'integer', example: 3 },
                    fee_lamports: { type: 'integer', description: 'Tenant\'s 0.5% platform fee included per month × months', example: 60000 },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid months value' },
          '403': { description: 'Only the tenant can top up the rent escrow' },
          '404': { description: 'Contract not found' },
          '409': { description: 'Tenant missing a Solana wallet or contract not in valid state' },
        },
      },
    },

    '/contracts/{id}/rent/topup/confirm': {
      post: {
        tags: ['Rent Escrow'],
        summary: 'Confirm a broadcast top-up (tenant)',
        description: 'Called after the tenant has signed and broadcast the top-up transaction from their device. Records the top-up in the database and logs a `RENT_TOPPED_UP` audit event.\n\nPrevents duplicates: same `tx_signature` will be rejected.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        security: [{ BearerAuth: [] }, { MockUser: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tx_signature', 'months_covered'],
                properties: {
                  tx_signature: { type: 'string', maxLength: 88, description: 'Solana transaction signature', example: '5j7s8KxP...' },
                  months_covered: { type: 'integer', minimum: 1, maximum: 12, example: 3 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Top-up recorded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    top_up: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        contract_id: { type: 'string', format: 'uuid' },
                        tenant_id: { type: 'string', format: 'uuid' },
                        rent_amount_eur: { type: 'number' },
                        amount_lamports: { type: 'integer' },
                        months_covered: { type: 'integer' },
                        fee_lamports: { type: 'integer' },
                        tx_signature: { type: 'string' },
                        created_at: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': { description: 'Only the tenant can confirm a top-up' },
          '409': { description: 'Duplicate tx_signature' },
        },
      },
    },

    '/contracts/{id}/rent': {
      get: {
        tags: ['Rent Escrow'],
        summary: 'List rent escrow activity (top-ups and releases)',
        description: 'Returns all tenant top-ups and server-initiated monthly releases for a contract. Accessible by both landlord and tenant.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        security: [{ BearerAuth: [] }, { MockUser: [] }],
        responses: {
          '200': {
            description: 'Rent escrow activity',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    top_ups: {
                      type: 'array',
                      description: 'Tenant deposits into the escrow PDA',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          amount_lamports: { type: 'integer' },
                          months_covered: { type: 'integer' },
                          fee_lamports: { type: 'integer' },
                          tx_signature: { type: 'string' },
                          created_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                    releases: {
                      type: 'array',
                      description: 'Monthly releases from escrow to landlord (server-initiated)',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          rent_amount_eur: { type: 'number' },
                          rent_lamports: { type: 'integer' },
                          landlord_amount_lamports: { type: 'integer' },
                          platform_fee_lamports: { type: 'integer' },
                          tx_signature: { type: 'string' },
                          period_month: { type: 'integer' },
                          period_year: { type: 'integer' },
                          released_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '403': { description: 'Access denied' },
          '404': { description: 'Contract not found' },
        },
      },
    },
  },
};
