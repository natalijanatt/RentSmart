use anchor_lang::prelude::*;

declare_id!("B5iQ6NGSqYQgGX3LqPhoCu31NuLkm7GvKzFG1CRraNBX");

/// RentSmart rental deposit escrow program.
///
/// Each rental contract gets a single PDA (Program Derived Account) that:
///   - Stores the SHA-256 hash of the off-chain contract JSON
///   - Holds the tenant's SOL deposit in escrow
///   - Records check-in and check-out image hashes immutably
///   - Releases funds to tenant/landlord on settlement
///
/// PDA seeds: ["rental", contract_id_bytes]  (contract_id is a 36-byte UUID string)
///
/// Graceful degradation: if any instruction fails (e.g. RPC outage), the off-chain
/// server continues operating — blockchain is a proof layer, not the critical path.
#[program]
pub mod rentsmart {
    use super::*;

    /// Initialize a new rental agreement PDA.
    /// Called by the backend authority when a contract is created (POST /contracts).
    ///
    /// # Arguments
    /// * `contract_id`     - UUID string as [u8; 32], e.g. b"550e8400-e29b-41d4-a716-446655440000"
    /// * `contract_hash`   - SHA-256 of the contract JSON (32 bytes)
    /// * `deposit_lamports`- Deposit amount in lamports (converted from EUR by the server)
    pub fn initialize(
        ctx: Context<Initialize>,
        contract_id: [u8; 32],
        contract_hash: [u8; 32],
        deposit_lamports: u64,
    ) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        agreement.contract_id = contract_id;
        agreement.contract_hash = contract_hash;
        agreement.deposit_lamports = deposit_lamports;
        agreement.landlord = ctx.accounts.landlord.key();
        agreement.tenant = Pubkey::default(); // set when tenant calls lock_deposit
        agreement.state = AgreementState::Created;
        agreement.checkin_hash = [0u8; 32];
        agreement.checkout_hash = [0u8; 32];
        agreement.settlement_hash = [0u8; 32];
        agreement.created_at = Clock::get()?.unix_timestamp;
        agreement.bump = ctx.bumps.agreement;
        Ok(())
    }

    /// Lock the tenant's deposit into the PDA escrow.
    /// The server builds this transaction unsigned; the tenant signs it on their mobile device.
    /// Called after tenant accepts the contract (POST /contracts/:id/accept).
    pub fn lock_deposit(ctx: Context<LockDeposit>) -> Result<()> {
        require!(
            ctx.accounts.agreement.state == AgreementState::Created,
            RentSmartError::InvalidState
        );

        let deposit_lamports = ctx.accounts.agreement.deposit_lamports;
        let tenant_key = ctx.accounts.tenant.key();

        // Transfer deposit from tenant's wallet into the PDA
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &tenant_key,
            &ctx.accounts.agreement.key(),
            deposit_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.tenant.to_account_info(),
                ctx.accounts.agreement.to_account_info(),
            ],
        )?;

        let agreement = &mut ctx.accounts.agreement;
        agreement.tenant = tenant_key;
        agreement.state = AgreementState::DepositLocked;
        Ok(())
    }

    /// Record the SHA-256 hash of check-in inspection images on-chain.
    /// Called by the backend authority after check-in is approved by the tenant
    /// (POST /contracts/:id/checkin/approve).
    ///
    /// # Arguments
    /// * `image_hash` - SHA-256(all check-in image hashes concatenated), 32 bytes
    pub fn record_checkin(ctx: Context<RecordCheckin>, image_hash: [u8; 32]) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        require!(
            agreement.state == AgreementState::DepositLocked,
            RentSmartError::InvalidState
        );
        agreement.checkin_hash = image_hash;
        agreement.state = AgreementState::CheckinRecorded;
        Ok(())
    }

    /// Record the SHA-256 hash of check-out inspection images on-chain.
    /// Called by the backend authority after check-out is approved by the landlord
    /// (POST /contracts/:id/checkout/approve).
    ///
    /// # Arguments
    /// * `image_hash` - SHA-256(all check-out image hashes concatenated), 32 bytes
    pub fn record_checkout(ctx: Context<RecordCheckout>, image_hash: [u8; 32]) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        require!(
            agreement.state == AgreementState::CheckinRecorded,
            RentSmartError::InvalidState
        );
        agreement.checkout_hash = image_hash;
        agreement.state = AgreementState::CheckoutRecorded;
        Ok(())
    }

    /// Pay monthly rent on-chain.
    /// The tenant signs this transaction on their mobile device (server builds it unsigned).
    /// Called when the tenant initiates a monthly rent payment (POST /contracts/:id/rent/pay).
    ///
    /// Fee model (both deducted from the rent amount):
    ///   - 0.5% platform fee charged to the tenant  (added on top of rent)
    ///   - 0.5% platform fee charged to the landlord (deducted from what they receive)
    ///   Total platform fee = 1% of rent; landlord net = 99% of rent
    ///
    /// # Arguments
    /// * `rent_lamports` - Agreed monthly rent amount in lamports (before any fees)
    pub fn pay_rent(ctx: Context<PayRent>, rent_lamports: u64) -> Result<()> {
        require!(
            ctx.accounts.agreement.state == AgreementState::CheckinRecorded,
            RentSmartError::InvalidState
        );

        const PLATFORM_FEE_BPS: u64 = 50; // 0.5% = 50 basis points
        const BPS_DIVISOR: u64 = 10_000;

        // 0.5% added on top of rent — paid by tenant to platform
        let fee_from_tenant = rent_lamports
            .checked_mul(PLATFORM_FEE_BPS)
            .ok_or(RentSmartError::Overflow)?
            .checked_div(BPS_DIVISOR)
            .ok_or(RentSmartError::Overflow)?;

        // 0.5% deducted from rent — paid by landlord to platform
        let fee_from_landlord = rent_lamports
            .checked_mul(PLATFORM_FEE_BPS)
            .ok_or(RentSmartError::Overflow)?
            .checked_div(BPS_DIVISOR)
            .ok_or(RentSmartError::Overflow)?;

        // Landlord receives rent minus their platform fee share
        let landlord_amount = rent_lamports
            .checked_sub(fee_from_landlord)
            .ok_or(RentSmartError::Overflow)?;

        // Platform receives both fee contributions
        let platform_fee = fee_from_tenant
            .checked_add(fee_from_landlord)
            .ok_or(RentSmartError::Overflow)?;

        // Transfer landlord_amount: tenant → landlord
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.tenant.key(),
                &ctx.accounts.landlord.key(),
                landlord_amount,
            ),
            &[
                ctx.accounts.tenant.to_account_info(),
                ctx.accounts.landlord.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Transfer platform_fee: tenant → platform  (covers both sides' 0.5%)
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.tenant.key(),
                &ctx.accounts.platform.key(),
                platform_fee,
            ),
            &[
                ctx.accounts.tenant.to_account_info(),
                ctx.accounts.platform.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        Ok(())
    }

    /// Execute the settlement: release escrowed SOL to tenant and landlord.
    /// Amounts come from the deterministic rule engine on the server.
    /// Called by the backend authority on finalization (POST /contracts/:id/finalize).
    ///
    /// # Arguments
    /// * `settlement_hash`  - SHA-256 of the settlement JSON result (32 bytes)
    /// * `tenant_lamports`  - Amount to return to tenant
    /// * `landlord_lamports`- Amount to transfer to landlord (deductions)
    ///
    /// Constraint: tenant_lamports + landlord_lamports == agreement.deposit_lamports
    pub fn execute_settlement(
        ctx: Context<ExecuteSettlement>,
        settlement_hash: [u8; 32],
        tenant_lamports: u64,
        landlord_lamports: u64,
    ) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        require!(
            agreement.state == AgreementState::CheckoutRecorded,
            RentSmartError::InvalidState
        );
        require!(
            tenant_lamports
                .checked_add(landlord_lamports)
                .ok_or(RentSmartError::SettlementMismatch)?
                == agreement.deposit_lamports,
            RentSmartError::SettlementMismatch
        );

        // Release to tenant
        if tenant_lamports > 0 {
            **agreement
                .to_account_info()
                .try_borrow_mut_lamports()? -= tenant_lamports;
            **ctx
                .accounts
                .tenant
                .to_account_info()
                .try_borrow_mut_lamports()? += tenant_lamports;
        }

        // Release deductions to landlord
        if landlord_lamports > 0 {
            **agreement
                .to_account_info()
                .try_borrow_mut_lamports()? -= landlord_lamports;
            **ctx
                .accounts
                .landlord
                .to_account_info()
                .try_borrow_mut_lamports()? += landlord_lamports;
        }

        agreement.settlement_hash = settlement_hash;
        agreement.state = AgreementState::Settled;
        Ok(())
    }
}

// ─── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(contract_id: [u8; 32])]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = RentalAgreement::SIZE,
        seeds = [b"rental", contract_id.as_ref()],
        bump
    )]
    pub agreement: Account<'info, RentalAgreement>,

    /// Backend authority keypair — pays for account creation
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: landlord's Solana wallet — stored for reference, not a signer here
    pub landlord: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockDeposit<'info> {
    #[account(
        mut,
        seeds = [b"rental", agreement.contract_id.as_ref()],
        bump = agreement.bump
    )]
    pub agreement: Account<'info, RentalAgreement>,

    /// Tenant must sign — they are sending their own SOL into escrow
    #[account(mut)]
    pub tenant: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordCheckin<'info> {
    #[account(
        mut,
        seeds = [b"rental", agreement.contract_id.as_ref()],
        bump = agreement.bump
    )]
    pub agreement: Account<'info, RentalAgreement>,

    /// Backend authority signs — confirms landlord check-in images were approved
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecordCheckout<'info> {
    #[account(
        mut,
        seeds = [b"rental", agreement.contract_id.as_ref()],
        bump = agreement.bump
    )]
    pub agreement: Account<'info, RentalAgreement>,

    /// Backend authority signs — confirms tenant check-out images were approved
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct PayRent<'info> {
    /// Agreement PDA — read-only, used to verify state and constrain landlord/tenant accounts
    #[account(
        seeds = [b"rental", agreement.contract_id.as_ref()],
        bump = agreement.bump,
        constraint = agreement.tenant == tenant.key() @ RentSmartError::Unauthorized,
        constraint = agreement.landlord == landlord.key() @ RentSmartError::Unauthorized
    )]
    pub agreement: Account<'info, RentalAgreement>,

    /// Tenant must sign — they pay rent + their share of platform fee from their wallet
    #[account(mut)]
    pub tenant: Signer<'info>,

    /// CHECK: landlord wallet — receives rent minus their 0.5% platform fee share
    #[account(mut)]
    pub landlord: AccountInfo<'info>,

    /// CHECK: platform fee wallet — receives 1% total (0.5% from each side)
    #[account(mut)]
    pub platform: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteSettlement<'info> {
    #[account(
        mut,
        seeds = [b"rental", agreement.contract_id.as_ref()],
        bump = agreement.bump
    )]
    pub agreement: Account<'info, RentalAgreement>,

    /// Backend authority signs — confirms settlement was computed by rule engine
    pub authority: Signer<'info>,

    /// CHECK: tenant wallet — receives their portion of the deposit
    #[account(mut)]
    pub tenant: AccountInfo<'info>,

    /// CHECK: landlord wallet — receives deductions
    #[account(mut)]
    pub landlord: AccountInfo<'info>,
}

// ─── State ───────────────────────────────────────────────────────────────────

#[account]
pub struct RentalAgreement {
    pub contract_id: [u8; 32],       // UUID string bytes (first 32 of 36 ASCII chars)
    pub contract_hash: [u8; 32],     // SHA-256 of contract JSON
    pub deposit_lamports: u64,       // Total deposit locked in this PDA
    pub landlord: Pubkey,            // Landlord's Solana wallet
    pub tenant: Pubkey,              // Tenant's Solana wallet (set on lock_deposit)
    pub state: AgreementState,       // Current lifecycle state (1 byte enum)
    pub checkin_hash: [u8; 32],      // SHA-256 of check-in image hashes
    pub checkout_hash: [u8; 32],     // SHA-256 of check-out image hashes
    pub settlement_hash: [u8; 32],   // SHA-256 of settlement result JSON
    pub created_at: i64,             // Unix timestamp of contract initialization
    pub bump: u8,                    // PDA bump seed, stored for mutable constraints
}

impl RentalAgreement {
    // discriminator(8) + contract_id(32) + contract_hash(32) + deposit_lamports(8)
    // + landlord(32) + tenant(32) + state(1) + checkin_hash(32)
    // + checkout_hash(32) + settlement_hash(32) + created_at(8) + bump(1) + padding(6)
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 32 + 32 + 1 + 32 + 32 + 32 + 8 + 1 + 6;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum AgreementState {
    Created,          // initialize() called
    DepositLocked,    // lock_deposit() called — SOL is in escrow
    CheckinRecorded,  // record_checkin() called
    CheckoutRecorded, // record_checkout() called
    Settled,          // execute_settlement() called — funds released
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum RentSmartError {
    #[msg("Invalid state for this operation")]
    InvalidState,

    #[msg("Settlement amounts do not equal the locked deposit")]
    SettlementMismatch,

    #[msg("Unauthorized signer for this instruction")]
    Unauthorized,

    #[msg("Arithmetic overflow during fee calculation")]
    Overflow,
}
