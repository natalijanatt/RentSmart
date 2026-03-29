import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().uuid(),
  phone: z.string(),
  display_name: z.string(),
  device_id: z.string().nullable(),
  solana_pubkey: z.string().nullable().optional(),
});

export const verifyAuthBodySchema = z.object({
  firebase_token: z.string().min(1),
  display_name: z.string().min(1).optional(),
  device_id: z.string().min(1),
});

export const verifyAuthResponseSchema = z.object({
  user: userSchema,
  auth_source: z.literal('firebase'),
});

export type User = z.infer<typeof userSchema>;
export type VerifyAuthBody = z.infer<typeof verifyAuthBodySchema>;
export type VerifyAuthResponse = z.infer<typeof verifyAuthResponseSchema>;
