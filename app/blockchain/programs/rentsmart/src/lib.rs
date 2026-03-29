use anchor_lang::prelude::*;

declare_id!("PROGRAM_ID_PLACEHOLDER");

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
    /// * `contract_id`     - UUID string as [u8; 36], e.g. b"550e8400-e29b-41d4-a716-446655440000"
    /// * `contract_hash`   - SHA-256 of the contract JSON (32 bytes)
    /// * `deposit_lamports`- Deposit amount in lamports (converted from EUR by the server)
    pub fn initialize(
        ctx: Context<Initialize>,
        contract_id: [u8; 36],
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
        agreement.bump = ctx.bumps.agreement;
        Ok(())
    }

    /// Lock the tenant's deposit into the PDA escrow.
    /// The server builds this transaction unsigned; the tenant signs it on their mobile device.
    /// Called after tenant accepts the contract (POST /contracts/:id/accept).
    pub fn lock_deposit(ctx: Context<LockDeposit>) -> Result<()> {
        let agreement = &mut ctx.accounts.agreement;
        require!(
            agreement.state == AgreementState::Created,
            RentSmartError::InvalidState
        );

        // Transfer deposit from tenant's wallet into the PDA
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.tenant.key(),
            &ctx.accounts.agreement.key(),
            agreement.deposit_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.tenant.to_account_info(),
                ctx.accounts.agreement.to_account_info(),
            ],
        )?;

        agreement.tenant = ctx.accounts.tenant.key();
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
#[instruction(contract_id: [u8; 36])]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = RentalAgreement::SIZE,
        seeds = [b"rental", &contract_id],
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
        seeds = [b"rental", &agreement.contract_id],
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
        seeds = [b"rental", &agreement.contract_id],
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
        seeds = [b"rental", &agreement.contract_id],
        bump = agreement.bump
    )]
    pub agreement: Account<'info, RentalAgreement>,

    /// Backend authority signs — confirms tenant check-out images were approved
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteSettlement<'info> {
    #[account(
        mut,
        seeds = [b"rental", &agreement.contract_id],
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
    pub contract_id: [u8; 36],       // UUID string bytes (exactly 36 ASCII chars)
    pub contract_hash: [u8; 32],     // SHA-256 of contract JSON
    pub deposit_lamports: u64,       // Total deposit locked in this PDA
    pub landlord: Pubkey,            // Landlord's Solana wallet
    pub tenant: Pubkey,              // Tenant's Solana wallet (set on lock_deposit)
    pub state: AgreementState,       // Current lifecycle state (1 byte enum)
    pub checkin_hash: [u8; 32],      // SHA-256 of check-in image hashes
    pub checkout_hash: [u8; 32],     // SHA-256 of check-out image hashes
    pub settlement_hash: [u8; 32],   // SHA-256 of settlement result JSON
    pub bump: u8,                    // PDA bump seed, stored for mutable constraints
}

impl RentalAgreement {
    // discriminator(8) + contract_id(36) + contract_hash(32) + deposit_lamports(8)
    // + landlord(32) + tenant(32) + state(1) + checkin_hash(32)
    // + checkout_hash(32) + settlement_hash(32) + bump(1) + padding(10)
    pub const SIZE: usize = 8 + 36 + 32 + 8 + 32 + 32 + 1 + 32 + 32 + 32 + 1 + 10;
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
}
