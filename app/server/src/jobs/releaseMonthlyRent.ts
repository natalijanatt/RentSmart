/**
 * Monthly rent release job.
 *
 * Runs on the 1st of each month. For every active contract with a Solana PDA,
 * calls release_monthly_rent on-chain (authority-signed — no tenant action needed)
 * to transfer one month of pre-paid rent from the escrow PDA to the landlord and platform.
 *
 * The job is scheduled from index.ts using setInterval with a daily check so it
 * fires exactly once per month without requiring an external scheduler.
 */

import { releaseMonthlyRentForAllActive } from '../modules/contracts/rent.service.js';

let lastRunMonth = -1;

/**
 * Check whether it is the 1st of a new month and, if so, release rent for all active contracts.
 * Should be called daily (e.g. from a setInterval in index.ts).
 */
export async function maybeTriggerMonthlyRentRelease(): Promise<void> {
  const now = new Date();
  const day = now.getUTCDate();
  const month = now.getUTCMonth() + 1; // 1-based
  const year = now.getUTCFullYear();

  if (day !== 1) return;
  if (lastRunMonth === month) return; // Already ran this month

  lastRunMonth = month;
  console.log(`[RentRelease] Triggering monthly rent release for ${month}/${year}`);

  try {
    await releaseMonthlyRentForAllActive(month, year);
    console.log(`[RentRelease] Completed monthly rent release for ${month}/${year}`);
  } catch (err) {
    console.error(`[RentRelease] Monthly release job failed for ${month}/${year}:`, err);
  }
}

/** Start the daily polling interval. Call once from server startup. */
export function scheduleMonthlyRentRelease(): void {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  // Run once immediately in case the server restarted on the 1st
  maybeTriggerMonthlyRentRelease().catch((err) => {
    console.error('[RentRelease] Initial check failed:', err);
  });

  setInterval(() => {
    maybeTriggerMonthlyRentRelease().catch((err) => {
      console.error('[RentRelease] Scheduled check failed:', err);
    });
  }, TWENTY_FOUR_HOURS);

  console.log('✅  Monthly rent release job scheduled (checks daily at startup interval)');
}
