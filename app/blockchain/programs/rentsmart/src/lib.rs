use anchor_lang::prelude::*;

include!(concat!(env!("OUT_DIR"), "/program_id.rs"));

/// RentSmart rental deposit + rent escrow program.
///
/// Each rental contract gets a single PDA (Program Derived Account) that:
///   - Stores the SHA-256 hash of the off-chain contract JSON
///   - Holds the tenant's SOL deposit in escrow
///   - Holds pre-paid monthly rent contributed by the tenant
///   - Records check-in and check-out image hashes immutably
///   - Releases rent to landlord automatically (authority-signed, no tenant needed)
///   - Releases deposit to tenant/landlord on settlement
///
/// PDA seeds: ["rental", contract_id_bytes]  (contract_id is a 36-byte UUID string)
#[program]
pub mod rentsmart {
    use super::*;

    /// Initialize a new rental agreement PDA.
    /// Called by the backend authority when a contract is created (POST /contracts).
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
        agreement.prepaid_rent_lamports = 0;
        agreement.landlord = ctx.accounts.landlord.key();
        agreement.authority = ctx.accounts.authority.key();
        agreement.platform_wallet = ctx.accounts.platform.key();
        agreement.tenant = Pubkey::default();
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

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &tenant_key,
                &ctx.accounts.agreement.key(),
                deposit_lamports,
            ),
            &[
                ctx.accounts.tenant.to_account_info(),
                ctx.accounts.agreement.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let agreement = &mut ctx.accounts.agreement;
        agreement.tenant = tenant_key;
        agreement.state = AgreementState::DepositLocked;
        Ok(())
    }

    /// Top up the pre-paid rent escrow balance.
    /// The server builds this transaction unsigned; the tenant signs it on their mobile device.
    /// Called when the tenant pre-loads one or more months of rent (POST /contracts/:id/rent/topup).
    ///
    /// The tenant deposits `amount_lamports` which must cover:
    ///   rent_face_value × 1.005 per month (the extra 0.5% covers the tenant's platform fee share).
    ///
    /// State: allowed when DepositLocked or CheckinRecorded (any time during tenancy).
    pub fn top_up_rent(ctx: Context<TopUpRent>, amount_lamports: u64) -> Result<()> {
        require!(
            ctx.accounts.agreement.state == AgreementState::DepositLocked
                || ctx.accounts.agreement.state == AgreementState::CheckinRecorded,
            RentSmartError::InvalidState
        );
        require!(amount_lamports > 0, RentSmartError::InvalidAmount);

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.tenant.key(),
                &ctx.accounts.agreement.key(),
                amount_lamports,
            ),
            &[
                ctx.accounts.tenant.to_account_info(),
                ctx.accounts.agreement.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let agreement = &mut ctx.accounts.agreement;
        agreement.prepaid_rent_lamports = agreement
            .prepaid_rent_lamports
            .checked_add(amount_lamports)
            .ok_or(RentSmartError::Overflow)?;
        Ok(())
    }

    /// Release one month of rent from escrow to the landlord.
    /// Signed by the backend authority — no tenant action required.
    /// Called by the server's monthly cron job on the 1st of each month.
    ///
    /// Fee model:
    ///   - Tenant pre-deposited rent × 1.005 per month (tenant's 0.5% share already included)
    ///   - Landlord receives: rent_lamports × 0.995  (landlord's 0.5% deducted)
    ///   - Platform receives: rent_lamports × 0.005 (tenant share) + rent_lamports × 0.005 (landlord share)
    ///                      = rent_lamports × 0.01  (1% total)
    ///   - Total withdrawn from PDA: rent_lamports × 1.005
    ///
    /// # Arguments
    /// * `rent_lamports` - The face-value monthly rent in lamports (before fees)
    pub fn release_monthly_rent(ctx: Context<ReleaseMonthlyRent>, rent_lamports: u64) -> Result<()> {
        require!(
            ctx.accounts.agreement.state == AgreementState::CheckinRecorded,
            RentSmartError::InvalidState
        );

        const PLATFORM_FEE_BPS: u64 = 50; // 0.5%
        const BPS_DIVISOR: u64 = 10_000;

        let fee_from_tenant = rent_lamports
            .checked_mul(PLATFORM_FEE_BPS)
            .ok_or(RentSmartError::Overflow)?
            .checked_div(BPS_DIVISOR)
            .ok_or(RentSmartError::Overflow)?;

        let fee_from_landlord = rent_lamports
            .checked_mul(PLATFORM_FEE_BPS)
            .ok_or(RentSmartError::Overflow)?
            .checked_div(BPS_DIVISOR)
            .ok_or(RentSmartError::Overflow)?;

        let landlord_amount = rent_lamports
            .checked_sub(fee_from_landlord)
            .ok_or(RentSmartError::Overflow)?;

        let platform_fee = fee_from_tenant
            .checked_add(fee_from_landlord)
            .ok_or(RentSmartError::Overflow)?;

        // Total withdrawn from prepaid balance = landlord_amount + platform_fee = rent × 1.005
        let total_release = landlord_amount
            .checked_add(platform_fee)
            .ok_or(RentSmartError::Overflow)?;

        let agreement = &mut ctx.accounts.agreement;
        require!(
            agreement.prepaid_rent_lamports >= total_release,
            RentSmartError::InsufficientRentBalance
        );

        // Deduct from escrow balance
        agreement.prepaid_rent_lamports = agreement
            .prepaid_rent_lamports
            .checked_sub(total_release)
            .ok_or(RentSmartError::Overflow)?;

        // Transfer landlord_amount: PDA → landlord
        **agreement.to_account_info().try_borrow_mut_lamports()? -= landlord_amount;
        **ctx.accounts.landlord.to_account_info().try_borrow_mut_lamports()? += landlord_amount;

        // Transfer platform_fee: PDA → platform
        **agreement.to_account_info().try_borrow_mut_lamports()? -= platform_fee;
        **ctx.accounts.platform.to_account_info().try_borrow_mut_lamports()? += platform_fee;

        Ok(())
    }

    /// Record the SHA-256 hash of check-in inspection images on-chain.
    /// Called by the backend authority after check-in is approved by the tenant.
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
    /// Called by the backend authority after check-out is approved by the landlord.
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

    /// Execute the settlement: release escrowed deposit to tenant and landlord.
    /// Amounts come from the deterministic rule engine on the server.
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

        if tenant_lamports > 0 {
            **agreement.to_account_info().try_borrow_mut_lamports()? -= tenant_lamports;
            **ctx.accounts.tenant.to_account_info().try_borrow_mut_lamports()? += tenant_lamports;
        }

        if landlord_lamports > 0 {
            **agreement.to_account_info().try_borrow_mut_lamports()? -= landlord_lamports;
            **ctx.accounts.landlord.to_account_info().try_borrow_mut_lamports()? += landlord_lamports;
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

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: landlord's Solana wallet — stored for reference, not a signer here
    pub landlord: AccountInfo<'info>,

    /// CHECK: platform fee wallet — stored for later constraint checks
    pub platform: AccountInfo<'info>,

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

    #[account(mut)]
    pub tenant: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TopUpRent<'info> {
    #[account(
        mut,
        seeds = [b"rental", agreement.contract_id.as_ref()],
        bump = agreement.bump,
        constraint = agreement.tenant == tenant.key() @ RentSmartError::Unauthorized
    )]
    pub agreement: Account<'info, RentalAgreement>,

    /// Tenant must sign — they are depositing pre-paid rent from their wallet
    #[account(mut)]
    pub tenant: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseMonthlyRent<'info> {
    #[account(
        mut,
        seeds = [b"rental", agreement.contract_id.as_ref()],
        bump = agreement.bump,
        constraint = agreement.landlord == landlord.key() @ RentSmartError::Unauthorized,
        constraint = agreement.authority == authority.key() @ RentSmartError::Unauthorized,
        constraint = agreement.platform_wallet == platform.key() @ RentSmartError::Unauthorized
    )]
    pub agreement: Account<'info, RentalAgreement>,

    /// Backend authority signs — triggered by the server monthly cron job
    pub authority: Signer<'info>,

    /// CHECK: landlord wallet — receives rent minus their 0.5% fee share
    #[account(mut)]
    pub landlord: AccountInfo<'info>,

    /// CHECK: platform fee wallet — receives 1% total
    #[account(mut)]
    pub platform: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RecordCheckin<'info> {
    #[account(
        mut,
        seeds = [b"rental", agreement.contract_id.as_ref()],
        bump = agreement.bump,
        constraint = agreement.authority == authority.key() @ RentSmartError::Unauthorized
    )]
    pub agreement: Account<'info, RentalAgreement>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecordCheckout<'info> {
    #[account(
        mut,
        seeds = [b"rental", agreement.contract_id.as_ref()],
        bump = agreement.bump,
        constraint = agreement.authority == authority.key() @ RentSmartError::Unauthorized
    )]
    pub agreement: Account<'info, RentalAgreement>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteSettlement<'info> {
    #[account(
        mut,
        seeds = [b"rental", agreement.contract_id.as_ref()],
        bump = agreement.bump,
        constraint = agreement.authority == authority.key() @ RentSmartError::Unauthorized
    )]
    pub agreement: Account<'info, RentalAgreement>,

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
    pub contract_id: [u8; 32],            // UUID string bytes (first 32 of 36 ASCII chars)
    pub contract_hash: [u8; 32],          // SHA-256 of contract JSON
    pub deposit_lamports: u64,            // Security deposit locked in this PDA
    pub prepaid_rent_lamports: u64,       // Pre-paid rent balance contributed by tenant
    pub landlord: Pubkey,                 // Landlord's Solana wallet
    pub authority: Pubkey,                // Backend authority allowed to run privileged ops
    pub platform_wallet: Pubkey,          // Platform fee wallet for monthly releases
    pub tenant: Pubkey,                   // Tenant's Solana wallet (set on lock_deposit)
    pub state: AgreementState,            // Current lifecycle state (1 byte enum)
    pub checkin_hash: [u8; 32],           // SHA-256 of check-in image hashes
    pub checkout_hash: [u8; 32],          // SHA-256 of check-out image hashes
    pub settlement_hash: [u8; 32],        // SHA-256 of settlement result JSON
    pub created_at: i64,                  // Unix timestamp of contract initialization
    pub bump: u8,                         // PDA bump seed
}

impl RentalAgreement {
    // discriminator(8) + contract_id(32) + contract_hash(32) + deposit_lamports(8)
    // + prepaid_rent_lamports(8) + landlord(32) + authority(32) + platform_wallet(32)
    // + tenant(32) + state(1)
    // + checkin_hash(32) + checkout_hash(32) + settlement_hash(32)
    // + created_at(8) + bump(1) + padding(6)
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 32 + 32 + 32 + 32 + 1 + 32 + 32 + 32 + 8 + 1 + 6;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum AgreementState {
    Created,          // initialize() called
    DepositLocked,    // lock_deposit() called — security deposit is in escrow
    CheckinRecorded,  // record_checkin() called — rent releases become active
    CheckoutRecorded, // record_checkout() called
    Settled,          // execute_settlement() called — deposit released
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

    #[msg("Prepaid rent balance is insufficient for this release")]
    InsufficientRentBalance,

    #[msg("Amount must be greater than zero")]
    InvalidAmount,
}
