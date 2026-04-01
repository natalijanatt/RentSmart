import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { expect } from 'chai';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import BN from 'bn.js';

const idlPath = path.resolve(process.cwd(), 'target/idl/rentsmart.json');
const IDL = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

describe('rentsmart', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program(IDL, provider) as Program<any>;
  const programMethods = (program as any).methods;

  // Test fixtures
  const authority = provider.wallet as anchor.Wallet;
  const tenant = Keypair.generate();
  const landlord = Keypair.generate();
  const platform = Keypair.generate();

  const CONTRACT_ID = '550e8400-e29b-41d4-a716-446655440000'; // 36-char UUID
  // Solana max seed length is 32 bytes — store/use first 32 bytes of the UUID string
  const contractIdBytes = Array.from(Buffer.from(CONTRACT_ID).subarray(0, 32));
  const contractHash = Array.from(crypto.createHash('sha256').update('test contract json').digest());
  const depositLamports = new BN(0.5 * LAMPORTS_PER_SOL); // 0.5 SOL

  let agreementPDA: PublicKey;
  let bump: number;

  before(async () => {
    // Derive PDA
    // Solana max seed length is 32 bytes — use first 32 bytes of the 36-byte UUID string
    const [pda, b] = PublicKey.findProgramAddressSync(
      [Buffer.from('rental'), Buffer.from(CONTRACT_ID).subarray(0, 32)],
      program.programId,
    );
    agreementPDA = pda;
    bump = b;

    // Fund tenant with enough SOL to cover deposit + fees
    const sig = await provider.connection.requestAirdrop(
      tenant.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  });

  it('initialize — creates PDA with correct data', async () => {
    await programMethods
      .initialize(contractIdBytes, contractHash, depositLamports)
      .accounts({
        agreement: agreementPDA,
        authority: authority.publicKey,
        landlord: landlord.publicKey,
        platform: platform.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const account = await (program.account as any).rentalAgreement.fetch(agreementPDA);

    expect(Buffer.from(account.contractId as number[]).toString('utf8')).to.equal(CONTRACT_ID.slice(0, 32));
    expect(Buffer.from(account.contractHash as number[]).toString('hex')).to.equal(
      Buffer.from(contractHash).toString('hex'),
    );
    expect((account.depositLamports as BN).toNumber()).to.equal(depositLamports.toNumber());
    expect(account.landlord.toBase58()).to.equal(landlord.publicKey.toBase58());
    expect(account.platformWallet.toBase58()).to.equal(platform.publicKey.toBase58());
    expect('created' in account.state).to.be.true;
    expect((account.createdAt as BN).toNumber()).to.be.greaterThan(0);
    expect(account.bump).to.equal(bump);
  });

  it('lock_deposit — tenant transfers SOL into PDA escrow', async () => {
    const pdaBalanceBefore = await provider.connection.getBalance(agreementPDA);

    await programMethods
      .lockDeposit()
      .accounts({
        agreement: agreementPDA,
        tenant: tenant.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([tenant])
      .rpc();

    const account = await (program.account as any).rentalAgreement.fetch(agreementPDA);
    expect('depositLocked' in account.state).to.be.true;
    expect(account.tenant.toBase58()).to.equal(tenant.publicKey.toBase58());

    const pdaBalanceAfter = await provider.connection.getBalance(agreementPDA);
    expect(pdaBalanceAfter - pdaBalanceBefore).to.be.gte(depositLamports.toNumber());
  });

  it('lock_deposit — rejects if called twice (wrong state)', async () => {
    try {
      await programMethods
        .lockDeposit()
        .accounts({
          agreement: agreementPDA,
          tenant: tenant.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([tenant])
        .rpc();
      expect.fail('Should have thrown InvalidState');
    } catch (err: unknown) {
      expect((err as Error).message).to.include('InvalidState');
    }
  });

  it('record_checkin — stores image hash and advances state', async () => {
    const checkinHash = Array.from(
      crypto.createHash('sha256').update('checkin_img_hash_1checkin_img_hash_2').digest(),
    );

    await programMethods
      .recordCheckin(checkinHash)
      .accounts({
        agreement: agreementPDA,
        authority: authority.publicKey,
      })
      .rpc();

    const account = await (program.account as any).rentalAgreement.fetch(agreementPDA);
    expect('checkinRecorded' in account.state).to.be.true;
    expect(Buffer.from(account.checkinHash as number[]).toString('hex')).to.equal(
      Buffer.from(checkinHash).toString('hex'),
    );
  });

  it('record_checkout — stores image hash and advances state', async () => {
    const checkoutHash = Array.from(
      crypto.createHash('sha256').update('checkout_img_hash_1checkout_img_hash_2').digest(),
    );

    await programMethods
      .recordCheckout(checkoutHash)
      .accounts({
        agreement: agreementPDA,
        authority: authority.publicKey,
      })
      .rpc();

    const account = await (program.account as any).rentalAgreement.fetch(agreementPDA);
    expect('checkoutRecorded' in account.state).to.be.true;
  });

  it('execute_settlement — distributes funds correctly', async () => {
    const settlementHash = Array.from(
      crypto.createHash('sha256').update('{"tenant":400,"landlord":100}').digest(),
    );
    const tenantAmount = new BN(depositLamports.toNumber() * 0.8); // 80% back to tenant
    const landlordAmount = new BN(depositLamports.toNumber() * 0.2); // 20% deductions

    const tenantBalanceBefore = await provider.connection.getBalance(tenant.publicKey);
    const landlordBalanceBefore = await provider.connection.getBalance(landlord.publicKey);

    await programMethods
      .executeSettlement(settlementHash, tenantAmount, landlordAmount)
      .accounts({
        agreement: agreementPDA,
        authority: authority.publicKey,
        tenant: tenant.publicKey,
        landlord: landlord.publicKey,
      })
      .rpc();

    const account = await (program.account as any).rentalAgreement.fetch(agreementPDA);
    expect('settled' in account.state).to.be.true;

    const tenantBalanceAfter = await provider.connection.getBalance(tenant.publicKey);
    const landlordBalanceAfter = await provider.connection.getBalance(landlord.publicKey);

    expect(tenantBalanceAfter - tenantBalanceBefore).to.equal(tenantAmount.toNumber());
    expect(landlordBalanceAfter - landlordBalanceBefore).to.equal(landlordAmount.toNumber());
  });

  it('execute_settlement — rejects if amounts do not sum to deposit', async () => {
    // Need a fresh contract for this test — use a different contract ID
    const altId = '660e8400-e29b-41d4-a716-446655440001';
    const [altPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('rental'), Buffer.from(altId).subarray(0, 32)],
      program.programId,
    );

    // Initialize and lock deposit on alt contract
    await programMethods
      .initialize(Array.from(Buffer.from(altId).subarray(0, 32)), contractHash, depositLamports)
      .accounts({
        agreement: altPDA,
        authority: authority.publicKey,
        landlord: landlord.publicKey,
        platform: platform.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await programMethods
      .lockDeposit()
      .accounts({ agreement: altPDA, tenant: tenant.publicKey, systemProgram: SystemProgram.programId })
      .signers([tenant])
      .rpc();
    await programMethods
      .recordCheckin(Array.from(Buffer.alloc(32)))
      .accounts({ agreement: altPDA, authority: authority.publicKey })
      .rpc();
    await programMethods
      .recordCheckout(Array.from(Buffer.alloc(32)))
      .accounts({ agreement: altPDA, authority: authority.publicKey })
      .rpc();

    // Try settlement with wrong total
    const wrongTenant = new BN(100);
    const wrongLandlord = new BN(100); // 200 ≠ depositLamports

    try {
      await programMethods
        .executeSettlement(Array.from(Buffer.alloc(32)), wrongTenant, wrongLandlord)
        .accounts({
          agreement: altPDA,
          authority: authority.publicKey,
          tenant: tenant.publicKey,
          landlord: landlord.publicKey,
        })
        .rpc();
      expect.fail('Should have thrown SettlementMismatch');
    } catch (err: unknown) {
      expect((err as Error).message).to.include('SettlementMismatch');
    }
  });
});
