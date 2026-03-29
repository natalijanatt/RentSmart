import crypto from 'crypto';

export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export function sha256Buffer(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes a chained hash: sha256(previousHash + data).
 * Pass empty string as previousHash for the first event in a chain.
 */
export function sha256Chain(previousHash: string, data: string): string {
  return sha256(previousHash + data);
}
