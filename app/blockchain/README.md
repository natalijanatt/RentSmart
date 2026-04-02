# RentSmart Blockchain

Solana smart contract and TypeScript client for RentSmart rental agreements.

This module is **fully decoupled** from the server — it can be developed, tested, and deployed independently. Integration with the server happens in one step (see [Server Integration](#server-integration)).

## What it does

Solana is used for three things:

1. **Immutable record** — contract hash and inspection image hashes written on-chain
2. **Deposit escrow** — tenant's SOL locked in a PDA for the duration of the tenancy
3. **Automatic distribution** — `execute_settlement()` sends exact amounts to landlord and tenant without an intermediary; `release_monthly_rent()` pays landlord automatically each month

The backend (server) is the authoritative system — blockchain is a proof layer. If a Solana call fails, the server continues (graceful degradation).

---

## Tech stack

| Layer             | Technology                                                  |
| ----------------- | ----------------------------------------------------------- |
| Smart contract    | Rust, Anchor v0.30                                          |
| TypeScript client | `@coral-xyz/anchor`, `@solana/web3.js`                      |
| Network           | Solana Localhost (testing) / Devnet or Mainnet (production) |

---

## Project structure

```
app/blockchain/
├── programs/rentsmart/src/lib.rs   # Anchor program (single Rust file)
├── client/src/
│   ├── index.ts                    # Export barrel — imported by server
│   ├── interface.ts                # ISolanaService interface (source of truth)
│   ├── solanaService.ts            # Concrete implementation
│   └── types.ts                   # On-chain types and enums
├── tests/rentsmart.ts              # Anchor tests (mocha + chai)
├── Anchor.toml                     # Anchor config (program IDs, provider)
└── .env.example                    # Blockchain env variables
```

---

## Prerequisites

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Solana CLI (>= 1.18)
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Anchor CLI (0.30.1)
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1 && avm use 0.30.1

# Node dependencies
cd app/blockchain && npm install
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable                   | Description                                         |
| -------------------------- | --------------------------------------------------- |
| `SOLANA_RPC_URL`           | `http://127.0.0.1:8899` (localhost)                 |
| `SOLANA_PROGRAM_ID`        | Base58 program ID (obtained after `anchor deploy`)  |
| `SOLANA_AUTHORITY_KEYPAIR` | JSON byte array: `[1,2,3,...,64]`                   |
| `EUR_SOL_RATE`             | Optional: EUR/SOL rate (default `0.01` for testing) |

Generate the authority keypair once:

```bash
solana-keygen new --outfile ~/.config/solana/rentsmart-authority.json
# Export as JSON array for SOLANA_AUTHORITY_KEYPAIR:
cat ~/.config/solana/rentsmart-authority.json
```

> Note: Localhost automatically mints SOL for all test wallets — no airdrop needed.

---

## Build & deploy

```bash
# Start local validator (run in a separate terminal)
solana-test-validator

# Compile Rust program + generate IDL
anchor build
# Output: target/deploy/rentsmart.so  and  target/idl/rentsmart.json

# Deploy to localhost
anchor deploy
# Output: Program ID and deployment confirmation

# Build TypeScript client
npm run build
# Output: dist/
```

---

## Running tests

```bash
# Full suite (compiles, starts local validator, deploys, runs TS tests, stops validator)
anchor test
```

---

## User flow

This section describes the complete lifecycle of a rental agreement from both the user perspective and the on-chain state machine.

### Contract states

```
Created → DepositLocked → CheckinRecorded → CheckoutRecorded → Settled
```

Each instruction enforces the exact preceding state — out-of-order calls are rejected with `InvalidState`.

---

### Step 1 — Landlord creates a contract

**Trigger:** `POST /contracts`

**Who acts:** Landlord (via the RentSmart app)

**What happens:**

- Server computes `SHA-256` of the contract JSON
- Server calls `solana.initializeContract(contractId, contractHash, depositLamports, landlordWallet)`
- Anchor program creates a PDA at seeds `["rental", contractId[0..32]]`
- PDA stores: contract hash, deposit amount, landlord wallet, state = `Created`

**On-chain result:** PDA account created, state `Created`

```
Landlord wallet ──(authority signs)──► initialize() ──► PDA [Created]
```

---

### Step 2 — Tenant accepts and locks deposit

**Trigger:** `POST /contracts/:id/accept`

**Who acts:** Tenant (signs on their mobile device)

**What happens:**

- Server calls `solana.buildLockDepositTx(contractId, tenantWallet)` — builds an **unsigned** transaction
- Server returns `serialized_tx` (base64) to the mobile app
- Tenant signs and broadcasts the transaction from their wallet
- Anchor program transfers `deposit_lamports` from tenant wallet into the PDA
- PDA state advances to `DepositLocked`, tenant wallet is recorded on-chain

**On-chain result:** Deposit locked in escrow, state `DepositLocked`

```
Tenant wallet ──(tenant signs on device)──► lock_deposit() ──► PDA [DepositLocked]
                                                                  └─ deposit held in escrow
```

---

### Step 3 — Tenant pre-funds rent escrow

**Trigger:** `POST /contracts/:id/rent/topup`

**Who acts:** Tenant (signs on their mobile device)

**What happens:**

- Tenant specifies how many months of rent to pre-fund
- Server calls `solana.buildTopUpRentTx(contractId, tenantWallet, rentLamports, months)` — builds an **unsigned** transaction
- Amount deposited = `rent × 1.005 × months` (includes tenant's 0.5% platform fee share)
- Tenant signs and broadcasts from their wallet
- PDA `prepaid_rent_lamports` balance increases

**On-chain result:** Rent escrow funded, state unchanged (`DepositLocked`)

```
Tenant wallet ──(tenant signs)──► top_up_rent(amount) ──► PDA.prepaid_rent_lamports += amount
```

> This step can be repeated anytime during tenancy to top up the balance.

---

### Step 4 — Check-in recorded

**Trigger:** `POST /contracts/:id/checkin/approve` (tenant approves check-in)

**Who acts:** Backend authority (server signs automatically)

**What happens:**

- Server computes `SHA-256` of all check-in inspection image hashes
- Server calls `solana.recordCheckin(contractId, imageHash, landlordWallet)`
- PDA stores the image hash immutably on-chain
- PDA state advances to `CheckinRecorded` — **monthly rent releases become active**

**On-chain result:** Check-in hash recorded, state `CheckinRecorded`

```
Authority ──(authority signs)──► record_checkin(imageHash) ──► PDA [CheckinRecorded]
                                                                  └─ checkin_hash stored
```

---

### Step 5 — Monthly rent release (recurring)

**Trigger:** Server cron job on the 1st of each month

**Who acts:** Backend authority (server signs automatically, no tenant action needed)

**What happens:**

- Server calls `solana.releaseMonthlyRent(contractId, rentLamports, landlordWallet, platformWallet)`
- Program verifies `prepaid_rent_lamports >= rent × 1.005`
- Transfers from PDA: landlord receives `rent × 0.995`, platform receives `rent × 0.01` (1% total)

**Fee breakdown:**
| Recipient | Amount |
|---|---|
| Landlord | rent − 0.5% |
| Platform | 1% total (0.5% from tenant pre-funded + 0.5% from landlord share) |

**On-chain result:** Rent released, state unchanged (`CheckinRecorded`)

```
Authority ──(monthly cron)──► release_monthly_rent(rent) ──► landlord: rent × 0.995
                                                          └──► platform: rent × 0.01
```

---

### Step 6 — Check-out recorded

**Trigger:** `POST /contracts/:id/checkout/approve` (landlord approves check-out)

**Who acts:** Backend authority (server signs automatically)

**What happens:**

- Server computes `SHA-256` of all check-out inspection image hashes
- Server calls `solana.recordCheckout(contractId, imageHash, tenantWallet)`
- PDA stores check-out image hash immutably on-chain
- PDA state advances to `CheckoutRecorded`

**On-chain result:** Check-out hash recorded, state `CheckoutRecorded`

```
Authority ──(authority signs)──► record_checkout(imageHash) ──► PDA [CheckoutRecorded]
                                                                   └─ checkout_hash stored
```

---

### Step 7 — Deposit settlement

**Trigger:** `POST /contracts/:id/settlement/approve` (second party approves settlement)

**Who acts:** Backend authority (server signs automatically)

**What happens:**

- Server's rule engine computes how much of the deposit goes to tenant vs landlord
- Constraint: `tenantAmount + landlordAmount == deposit_lamports` (enforced on-chain)
- Server calls `solana.executeSettlement(contractId, settlementHash, tenantAmount, landlordAmount, tenantWallet, landlordWallet)`
- Program transfers SOL directly from PDA to each wallet
- PDA state advances to `Settled`

**On-chain result:** Deposit released, state `Settled`

```
Authority ──(authority signs)──► execute_settlement() ──► tenant: tenantAmount
                                                      └──► landlord: landlordAmount
                                 PDA [Settled]
```

---

### Full lifecycle diagram

```
POST /contracts
Landlord creates contract
        │
        ▼
[initialize]  ──────────────────────── PDA state: Created
        │                               deposit_lamports stored
        │                               contract_hash stored
        │
POST /contracts/:id/accept
Tenant signs lock_deposit on device
        │
        ▼
[lock_deposit]  ────────────────────── PDA state: DepositLocked
        │                               SOL locked in PDA escrow
        │
POST /contracts/:id/rent/topup
Tenant signs top_up_rent on device
        │
        ▼
[top_up_rent]   ────────────────────── prepaid_rent_lamports += amount
        │                               (repeatable anytime during tenancy)
        │
POST /contracts/:id/checkin/approve
Backend records check-in hash
        │
        ▼
[record_checkin]  ──────────────────── PDA state: CheckinRecorded
        │                               checkin_hash stored on-chain
        │
1st of each month (cron)
        │
        ▼
[release_monthly_rent]  ────────────── landlord receives rent (monthly, recurring)
        │                               platform receives 1% fee
        │
POST /contracts/:id/checkout/approve
Backend records check-out hash
        │
        ▼
[record_checkout]  ─────────────────── PDA state: CheckoutRecorded
        │                               checkout_hash stored on-chain
        │
POST /contracts/:id/settlement/approve
Both parties approve settlement
        │
        ▼
[execute_settlement]  ──────────────── PDA state: Settled
                                        deposit released to tenant + landlord
```

---

## Server integration

The server uses a factory in `src/services/solana/index.ts` that auto-detects `SOLANA_PROGRAM_ID`:

- Set → instantiates real `SolanaService` from `@rentsmart/blockchain`
- Not set → uses `MockSolanaService` (server runs without blockchain)

```bash
# In app/server/.env
# Loaded from app/blockchain/.env (source of truth)
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_AUTHORITY_KEYPAIR=[1,2,3,...,64]

# npm workspaces auto-links @rentsmart/blockchain
cd <repo-root> && npm install
```

All Solana calls in the server are wrapped in `try/catch` — a failed Solana call never blocks the DB operation.

---

## On-chain account layout

```rust
pub struct RentalAgreement {
    pub contract_id: [u8; 32],          // UUID bytes (first 32 ASCII chars)
    pub contract_hash: [u8; 32],        // SHA-256 of contract JSON
    pub deposit_lamports: u64,          // Security deposit in escrow
    pub prepaid_rent_lamports: u64,     // Pre-paid rent escrow balance
    pub landlord: Pubkey,
    pub tenant: Pubkey,                 // Set on lock_deposit
    pub state: AgreementState,
    pub checkin_hash: [u8; 32],
    pub checkout_hash: [u8; 32],
    pub settlement_hash: [u8; 32],
    pub created_at: i64,                // Unix timestamp
    pub bump: u8,
}
// Total: 272 bytes
```

PDA seeds: `["rental", contract_id[0..32]]`

---

## Error reference

| Error                     | Message                                               |
| ------------------------- | ----------------------------------------------------- |
| `InvalidState`            | Invalid state for this operation                      |
| `SettlementMismatch`      | Settlement amounts do not equal the locked deposit    |
| `Unauthorized`            | Unauthorized signer for this instruction              |
| `Overflow`                | Arithmetic overflow during fee calculation            |
| `InsufficientRentBalance` | Prepaid rent balance is insufficient for this release |
| `InvalidAmount`           | Amount must be greater than zero                      |

---

## Important rules

1. **No personal data on-chain.** Only SHA-256 hashes, lamport amounts, and Solana wallet addresses.
2. **Run `anchor build` before `anchor test`.** Tests use the IDL — it must be up to date.
3. **Never hardcode the program ID.** Always from `SOLANA_PROGRAM_ID` env variable.
4. **Do not sign `lock_deposit` with authority.** Server builds the tx, tenant signs it on their device.
5. **State checks are mandatory.** Each instruction `require!`s the exact preceding state.
6. **Localhost setup.** Run `solana-test-validator` in a separate terminal before building/testing. It auto-funds wallets and provides a clean ledger.
